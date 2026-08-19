/**
 * V0.3-B 岗位详情逻辑测试（Electron 运行时，覆盖可程序验证的纯逻辑 + fake CDP 详情流程）。
 * 真实 BOSS JD 需人工验收，不在此 mock 声称 PASS。
 */
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

process.env.JOBPILOT_DATA_DIR = path.resolve(__dirname, '..', 'dev-data', `job-detail-test-${process.pid}`);

function makeDetailFake(evaluateResult) {
  const sent = [];
  let evaluateCount = 0;
  return {
    sent,
    send: async (method, params, sessionId) => {
      sent.push({ method, sessionId: sessionId ?? null });
      switch (method) {
        case 'Target.createTarget':
          return { targetId: 't-detail' };
        case 'Target.attachToTarget':
          return { sessionId: 's-detail' };
        case 'Runtime.evaluate':
          evaluateCount += 1;
          if (typeof evaluateResult === 'function') {
            return { result: { value: evaluateResult(evaluateCount) } };
          }
          return { result: { value: evaluateResult } };
        default:
          return {};
      }
    },
  };
}

const JOB = {
  id: 'ej1',
  platform: 'BOSS',
  platformJobId: 'ej1',
  title: '新媒体运营',
  company: '星澜科技',
  salary: '6-8K',
  location: '无锡·滨湖·河埒',
  experience: '1-3年',
  degree: '本科',
  jobUrl: 'https://www.zhipin.com/job_detail/ej1.html',
  sourceMetadata: { encryptJobId: 'ej1' },
};

const READY = { hasDesc: true, loginRequired: false, security: false };
const JD_JSON = JSON.stringify({
  jd: '职位描述\n负责公司新媒体矩阵运营，内容策划与发布。\n任职要求：本科以上，1-3年经验。',
  pageText: '...',
  tags: ['双休', '五险一金'],
  url: 'https://www.zhipin.com/job_detail/ej1.html',
});

app.whenReady().then(async () => {
  let failures = 0;
  const check = (name, cond, extra = '') => {
    console.log(`${cond ? 'PASS' : 'FAIL'} - ${name}${extra ? ' ' + extra : ''}`);
    if (!cond) failures += 1;
  };

  try {
    fs.rmSync(process.env.JOBPILOT_DATA_DIR, { recursive: true, force: true });

    const { BossJobDetail } = require('../dist-electron/platforms/boss/BossJobDetail.js');
    const {
      resolveJobDetailUrl,
      normalizeJdText,
      mapBossJobDetail,
    } = require('../dist-electron/platforms/boss/BossJobDetailMapper.js');

    // detail URL / metadata 使用
    check('jobUrl 直接使用', resolveJobDetailUrl(JOB) === 'https://www.zhipin.com/job_detail/ej1.html');
    check(
      'platformJobId 构造 URL',
      resolveJobDetailUrl({ ...JOB, jobUrl: undefined }) === 'https://www.zhipin.com/job_detail/ej1.html',
    );
    check('无标识 → null', resolveJobDetailUrl({ ...JOB, jobUrl: undefined, platformJobId: undefined }) === null);

    // JD 文本归一化
    check(
      'normalizeJdText 去头部/压缩空白',
      normalizeJdText('职位描述\n  第一行  \n\n\n  第二行') === '第一行\n\n第二行',
    );

    // JD 提取映射（V0.3-A 列表值 + 详情 DOM JD/标签）
    const detail = mapBossJobDetail(JOB, JSON.parse(JD_JSON));
    check(
      'BOSS→JobDetail 映射',
      detail.title === '新媒体运营' &&
        detail.company === '星澜科技' &&
        detail.salary === '6-8K' &&
        detail.jdText !== undefined &&
        detail.jdText.includes('内容策划与发布') &&
        detail.jobLabels.length === 2 &&
        detail.sourceMetadata?.encryptJobId === 'ej1',
    );
    check('空 JD → jdText undefined', mapBossJobDetail(JOB, { jd: '', pageText: '', tags: [], url: '' }).jdText === undefined);

    // SUCCESS 流程：给定详情 session + 页面就绪判断 + JD 提取（不创建/不关闭 tab，由 Manager 复用）
    {
      const fake = makeDetailFake((n) => (n === 1 ? JSON.stringify(READY) : JD_JSON));
      const result = await new BossJobDetail({}).readDetailWithClient(fake, 's-detail', JOB, 5000);
      check('SUCCESS 读取详情', result.status === 'SUCCESS' && result.detail?.jdText.includes('内容策划与发布'));
      check(
        'navigate/evaluate 使用详情 session',
        fake.sent.every((s) => s.sessionId === 's-detail'),
      );
      check('详情流程不创建/不关闭 tab（由 Manager 复用）', !fake.sent.some((s) => s.method === 'Target.createTarget' || s.method === 'Target.closeTarget'));
    }

    // LOGIN_EXPIRED
    {
      const fake = makeDetailFake(() => JSON.stringify({ ...READY, loginRequired: true }));
      const result = await new BossJobDetail({}).readDetailWithClient(fake, 's-detail', JOB, 5000);
      check('LOGIN_EXPIRED 分类', result.status === 'LOGIN_EXPIRED');
    }

    // SECURITY_RESTRICTED
    {
      const fake = makeDetailFake(() => JSON.stringify({ ...READY, security: true }));
      const result = await new BossJobDetail({}).readDetailWithClient(fake, 's-detail', JOB, 5000);
      check('SECURITY_RESTRICTED 分类', result.status === 'SECURITY_RESTRICTED');
    }

    // timeout → DETAIL_TIMEOUT
    {
      const fake = makeDetailFake(() => JSON.stringify({ hasDesc: false, loginRequired: false, security: false }));
      const result = await new BossJobDetail({}).readDetailWithClient(fake, 's-detail', JOB, 1200);
      check('timeout → DETAIL_TIMEOUT', result.status === 'DETAIL_TIMEOUT');
    }

    // 空 JD / DOM 变化 → DETAIL_PARSE_FAILED
    {
      const fake = makeDetailFake((n) => (n === 1 ? JSON.stringify(READY) : JSON.stringify({ jd: '', tags: [], pageText: '', url: '' })));
      const result = await new BossJobDetail({}).readDetailWithClient(fake, 's-detail', JOB, 5000);
      check('空 JD → DETAIL_PARSE_FAILED', result.status === 'DETAIL_PARSE_FAILED');
    }

    // 缺 URL → DETAIL_PARSE_FAILED（不触碰 CDP）
    {
      const fake = makeDetailFake(() => '{}');
      const result = await new BossJobDetail({}).readDetailWithClient(
        fake,
        's-detail',
        { ...JOB, jobUrl: undefined, platformJobId: undefined },
        5000,
      );
      check('缺详情地址 → DETAIL_PARSE_FAILED', result.status === 'DETAIL_PARSE_FAILED' && fake.sent.length === 0);
    }

    // CDP disconnect → CDP_DISCONNECTED
    {
      const fake = makeDetailFake(() => '{}');
      fake.send = async () => {
        throw new Error('WebSocket 已关闭');
      };
      const result = await new BossJobDetail({}).readDetailWithClient(fake, 's-detail', JOB, 5000);
      check('CDP disconnect → CDP_DISCONNECTED', result.status === 'CDP_DISCONNECTED');
    }
  } catch (err) {
    console.error('JOB DETAIL TEST ERROR:', err);
    failures += 1;
  }

  console.log(failures === 0 ? 'JOB DETAIL TEST: ALL PASS' : `JOB DETAIL TEST: ${failures} FAIL`);

  try {
    fs.rmSync(process.env.JOBPILOT_DATA_DIR, { recursive: true, force: true });
  } catch {
    // 忽略
  }

  app.exit(failures === 0 ? 0 : 1);
});
