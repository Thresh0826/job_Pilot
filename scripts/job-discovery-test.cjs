/**
 * V0.3-A 岗位发现逻辑测试（Electron 运行时，覆盖可程序验证的纯逻辑与 CDP 事件捕获逻辑）。
 * 真实 BOSS 搜索需人工验收，不在此 mock 声称 PASS。
 */
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

process.env.JOBPILOT_DATA_DIR = path.resolve(__dirname, '..', 'dev-data', `job-discovery-test-${process.pid}`);

function makeFakeSession() {
  const handlers = new Set();
  const sent = [];
  return {
    sent,
    send: async (method) => {
      sent.push(method);
      if (method === 'Network.getResponseBody') {
        return { body: JSON.stringify({ code: 0, zpData: { jobList: [FAKE_RAW] } }) };
      }
      return {};
    },
    onEvent: (h) => {
      handlers.add(h);
      return () => handlers.delete(h);
    },
    emit: (ev) => {
      for (const h of [...handlers]) h(ev);
    },
    handlerCount: () => handlers.size,
  };
}

const FAKE_RAW = {
  jobName: '新媒体运营',
  salaryDesc: '6-8K',
  cityName: '无锡',
  areaDistrict: '滨湖',
  businessDistrict: '河埒',
  jobExperience: '1-3年',
  jobDegree: '本科',
  brandName: '星澜科技',
  brandScaleName: '100-499人',
  brandStageName: '已上市',
  brandIndustry: '互联网',
  jobLabels: ['双休'],
  skills: ['抖音'],
  welfareList: ['五险一金'],
  bossName: '张三',
  bossTitle: 'HR',
  bossActiveStatus: 1,
  securityId: 's1',
  lid: 'lid1',
  encryptJobId: 'ej1',
  encryptBossId: 'eb1',
  encryptBrandId: 'ebr1',
};

app.whenReady().then(async () => {
  let failures = 0;
  const check = (name, cond, extra = '') => {
    console.log(`${cond ? 'PASS' : 'FAIL'} - ${name}${extra ? ' ' + extra : ''}`);
    if (!cond) failures += 1;
  };

  try {
    fs.rmSync(process.env.JOBPILOT_DATA_DIR, { recursive: true, force: true });
    const dbMod = require('../dist-electron/database/database.js');
    dbMod.initDatabase();

    const {
      buildBossSearchUrl,
      isBossJoblistUrl,
      decodeResponseBody,
      classifyBossResponse,
      classifyDiscoveryError,
      JoblistCapture,
      BossJobDiscovery,
    } = require('../dist-electron/platforms/boss/BossJobDiscovery.js');
    const { BossCityResolver } = require('../dist-electron/platforms/boss/BossCityResolver.js');
    const { mapBossJob, mapBossJoblist } = require('../dist-electron/platforms/boss/BossJobMapper.js');
    const { ChromeCDPManager } = require('../dist-electron/automation/cdp/ChromeCDPManager.js');

    // 1. search URL build
    const url = buildBossSearchUrl('新媒体运营', '101190200');
    check(
      'search URL build',
      url.startsWith('https://www.zhipin.com/web/geek/job?') &&
        url.includes('query=%E6%96%B0%E5%AA%92%E4%BD%93%E8%BF%90%E8%90%A5') &&
        url.includes('city=101190200') &&
        url.includes('page=1'),
      url,
    );

    // 3/4. city resolution
    const resolver = new BossCityResolver();
    check('city resolution 无锡', resolver.resolve('无锡') === '101190200');
    check('city resolution 上海（带空白）', resolver.resolve(' 上海 ') === '101020100');
    check('unsupported city → null', resolver.resolve('不存在城市') === null);
    check('空城市 → null', resolver.resolve('') === null);

    // 5/6. joblist URL recognition
    check(
      'joblist URL recognition',
      isBossJoblistUrl('https://www.zhipin.com/wapi/zpgeek/search/joblist.json?page=1'),
    );
    check(
      '非 joblist response 被忽略',
      !isBossJoblistUrl('https://www.zhipin.com/static/icon.png') &&
        !isBossJoblistUrl('https://www.zhipin.com/wapi/zpgeek/recommend/job/list.json') &&
        !isBossJoblistUrl('https://www.zhipin.com/main.js'),
    );

    // 11. base64 decode
    check(
      'base64 body decode',
      decodeResponseBody({ body: Buffer.from('{"a":1}').toString('base64'), base64Encoded: true }) === '{"a":1}',
    );
    check('普通 UTF-8 body', decodeResponseBody({ body: '{"a":1}' }) === '{"a":1}');
    check('body 非字符串 → null', decodeResponseBody({}) === null);

    // 19/20. classify
    check('SUCCESS code=0', classifyBossResponse({ code: 0, zpData: {} }).status === 'SUCCESS');
    check('SECURITY_RESTRICTED code=37', classifyBossResponse({ code: 37 }).status === 'SECURITY_RESTRICTED');
    check('SECURITY_RESTRICTED 关键字', classifyBossResponse({ code: 5, message: '访问频繁' }).status === 'SECURITY_RESTRICTED');
    check('LOGIN_EXPIRED message', classifyBossResponse({ code: 5, message: '登录已失效' }).status === 'LOGIN_EXPIRED');
    check('INVALID_RESPONSE 其它 code', classifyBossResponse({ code: 9 }).status === 'INVALID_RESPONSE');
    check('INVALID_RESPONSE 非对象', classifyBossResponse(null).status === 'INVALID_RESPONSE');

    // 18. CDP disconnect 分类
    check('CDP_DISCONNECTED 分类', classifyDiscoveryError(new Error('WebSocket 已关闭')) === 'CDP_DISCONNECTED');
    check('其它错误 → INVALID_RESPONSE', classifyDiscoveryError(new Error('parse error')) === 'INVALID_RESPONSE');

    // 13/14/21. mapping
    const job = mapBossJob(FAKE_RAW);
    check(
      'BOSS→Job 映射',
      job !== null &&
        job.title === '新媒体运营' &&
        job.company === '星澜科技' &&
        job.salary === '6-8K' &&
        job.location === '无锡·滨湖·河埒' &&
        job.degree === '本科' &&
        job.experience === '1-3年' &&
        job.companySize === '100-499人' &&
        job.platformJobId === 'ej1' &&
        job.recruiterName === '张三' &&
        job.recruiterActiveStatus === '1' &&
        job.jobUrl === 'https://www.zhipin.com/job_detail/ej1.html' &&
        job.sourceMetadata?.encryptJobId === 'ej1' &&
        job.sourceMetadata?.lid === 'lid1',
    );
    const jobMin = mapBossJob({ jobName: '仅标题' });
    check(
      '缺失可选字段 → undefined（不猜值）',
      jobMin !== null &&
        jobMin.title === '仅标题' &&
        jobMin.company === '' &&
        jobMin.salary === undefined &&
        jobMin.degree === undefined &&
        jobMin.sourceMetadata === undefined,
    );
    check('畸形条目 → null', mapBossJob(null) === null);
    check('0 jobs → []', mapBossJoblist({ code: 0, zpData: { jobList: [] } }).length === 0);
    check('jobList 非数组 → []', mapBossJoblist({ code: 0, zpData: {} }).length === 0);

    // 8/9/10. 正确 sessionId + responseReceived→loadingFinished→getResponseBody
    {
      const f = makeFakeSession();
      const capture = new JoblistCapture(f, 'sess-1');
      const p = capture.waitFirst(2000);
      f.emit({
        method: 'Network.responseReceived',
        sessionId: 'sess-1',
        params: { requestId: 'r1', response: { url: 'https://www.zhipin.com/wapi/zpgeek/search/joblist.json', mimeType: 'application/json' } },
      });
      f.emit({ method: 'Network.loadingFinished', sessionId: 'sess-1', params: { requestId: 'r1' } });
      const data = await p;
      check('正确 sessionId response 被接受', data !== null && data.code === 0);
      check('loadingFinished 后才 getResponseBody', f.sent.filter((m) => m === 'Network.getResponseBody').length === 1);
    }

    // 7. 错误 sessionId 事件被忽略（超时 → null）
    {
      const f = makeFakeSession();
      const capture = new JoblistCapture(f, 'sess-1');
      const p = capture.waitFirst(600);
      f.emit({
        method: 'Network.responseReceived',
        sessionId: 'OTHER',
        params: { requestId: 'r1', response: { url: 'https://www.zhipin.com/wapi/zpgeek/search/joblist.json' } },
      });
      f.emit({ method: 'Network.loadingFinished', sessionId: 'OTHER', params: { requestId: 'r1' } });
      const data = await p;
      check('错误 sessionId 事件被忽略', data === null);
    }

    // 15. 重复 requestId 不重复消费
    {
      const f = makeFakeSession();
      const capture = new JoblistCapture(f, 's1');
      const p = capture.waitFirst(1500);
      f.emit({
        method: 'Network.responseReceived',
        sessionId: 's1',
        params: { requestId: 'r1', response: { url: 'https://www.zhipin.com/wapi/zpgeek/search/joblist.json' } },
      });
      f.emit({ method: 'Network.loadingFinished', sessionId: 's1', params: { requestId: 'r1' } });
      await p;
      f.emit({ method: 'Network.loadingFinished', sessionId: 's1', params: { requestId: 'r1' } });
      await new Promise((r) => setTimeout(r, 100));
      check('重复 requestId 不重复消费', f.sent.filter((m) => m === 'Network.getResponseBody').length === 1);
    }

    // 16. timeout → null
    {
      const f = makeFakeSession();
      const capture = new JoblistCapture(f, 's1');
      const data = await capture.waitFirst(500);
      check('timeout → null', data === null);
    }

    // 17. listener cleanup（settle 后 handler 移除）
    {
      const f = makeFakeSession();
      const capture = new JoblistCapture(f, 's1');
      const p = capture.waitFirst(1500);
      check('捕获期间有监听', f.handlerCount() === 1);
      f.emit({
        method: 'Network.responseReceived',
        sessionId: 's1',
        params: { requestId: 'r1', response: { url: 'https://www.zhipin.com/wapi/zpgeek/search/joblist.json' } },
      });
      f.emit({ method: 'Network.loadingFinished', sessionId: 's1', params: { requestId: 'r1' } });
      await p;
      check('listener 已清理', f.handlerCount() === 0);
    }

    // 18b. CDP disconnect（getResponseBody 失败 → reject）
    {
      const f = makeFakeSession();
      f.send = async () => {
        throw new Error('WebSocket 已关闭');
      };
      const capture = new JoblistCapture(f, 's1');
      const p = capture.waitFirst(1500);
      f.emit({
        method: 'Network.responseReceived',
        sessionId: 's1',
        params: { requestId: 'r1', response: { url: 'https://www.zhipin.com/wapi/zpgeek/search/joblist.json' } },
      });
      f.emit({ method: 'Network.loadingFinished', sessionId: 's1', params: { requestId: 'r1' } });
      let rejected = false;
      try {
        await p;
      } catch {
        rejected = true;
      }
      check('CDP disconnect（send 失败 → reject）', rejected);
    }

    // 2. keyword validation（未触碰 Chrome 前抛错）
    {
      const discovery = new BossJobDiscovery(new ChromeCDPManager());
      let threw = false;
      try {
        await discovery.searchJobs('TEST', '   ', '无锡');
      } catch (err) {
        threw = err instanceof Error && err.message.includes('关键词');
      }
      check('keyword validation（空关键词报错）', threw);
    }

    // 22. 不主动调用 BOSS job API（捕获仅使用 CDP 方法）
    {
      const f = makeFakeSession();
      const capture = new JoblistCapture(f, 's1');
      const p = capture.waitFirst(1500);
      f.emit({
        method: 'Network.responseReceived',
        sessionId: 's1',
        params: { requestId: 'r1', response: { url: 'https://www.zhipin.com/wapi/zpgeek/search/joblist.json' } },
      });
      f.emit({ method: 'Network.loadingFinished', sessionId: 's1', params: { requestId: 'r1' } });
      await p;
      check(
        '不主动调用 BOSS job API（仅 CDP 方法）',
        f.sent.every((m) => ['Network.getResponseBody'].includes(m)),
      );
    }

    dbMod.closeDatabase();
  } catch (err) {
    console.error('JOB DISCOVERY TEST ERROR:', err);
    failures += 1;
  }

  console.log(failures === 0 ? 'JOB DISCOVERY TEST: ALL PASS' : `JOB DISCOVERY TEST: ${failures} FAIL`);

  try {
    fs.rmSync(process.env.JOBPILOT_DATA_DIR, { recursive: true, force: true });
  } catch {
    // 忽略
  }

  app.exit(failures === 0 ? 0 : 1);
});
