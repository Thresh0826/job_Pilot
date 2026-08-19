/**
 * V0.3-C1 多批岗位发现逻辑测试（Electron 运行时，fake CDP 驱动，不触碰真实 Chrome）。
 * 覆盖：首批捕获 / hasMore 继续加载 / 多批累积 / platformJobId 去重 /
 * hasMore=false 停止 / maxJobs 停止 / maxBatches 停止 / 滚动无新响应停止 /
 * SECURITY_RESTRICTED 停止 / CDP disconnect 停止 / listener 最终 cleanup。
 * 真实 BOSS 搜索需人工验收，不在此 mock 声称 PASS。
 */
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

process.env.JOBPILOT_DATA_DIR = path.resolve(__dirname, '..', 'dev-data', `job-search-test-${process.pid}`);

const JOBLIST_URL = 'https://www.zhipin.com/wapi/zpgeek/search/joblist.json?page=1';

/** 生成 n 个岗位（id 从 startId 起，平台岗位 id = ej<id>）。 */
function jobList(n, prefix, startId) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const id = startId + i;
    list.push({
      jobName: `${prefix}岗位${i}`,
      salaryDesc: '6-8K',
      cityName: '无锡',
      brandName: `${prefix}公司${i}`,
      encryptJobId: `ej${id}`,
      lid: `lid${id}`,
    });
  }
  return list;
}

function bodyWith(jobListItems, hasMore, extra = {}) {
  return JSON.stringify({ code: 0, zpData: { jobList: jobListItems, hasMore }, ...extra });
}

/**
 * 构造一个由 send 副作用驱动的 fake CDP session：
 * - Page.navigate → 触发首个批次（bodies[r1]）
 * - Runtime.evaluate（滚动）→ 依次触发后续批次（bodies[r2], bodies[r3]...），用完即不再触发
 * - Network.getResponseBody → 按 requestId 返回 body
 */
function makeFakeSession(bodies) {
  const handlers = new Set();
  const sent = [];
  let scrollCount = 0;
  let throwBodyErr = null;

  const emitBatch = (requestId) => {
    session.emit({
      method: 'Network.responseReceived',
      sessionId: 'sess-1',
      params: { requestId, response: { url: JOBLIST_URL, mimeType: 'application/json' } },
    });
    session.emit({ method: 'Network.loadingFinished', sessionId: 'sess-1', params: { requestId } });
  };

  const session = {
    sent,
    scrollCount: () => scrollCount,
    setThrowBody: (err) => {
      throwBodyErr = err;
    },
    send: async (method, params) => {
      sent.push(method);
      if (method === 'Network.getResponseBody') {
        if (throwBodyErr) throw throwBodyErr;
        return { body: bodies.get(params.requestId) ?? bodyWith([], false) };
      }
      if (method === 'Page.navigate') {
        setTimeout(() => emitBatch('r1'), 0);
        return {};
      }
      if (method === 'Runtime.evaluate') {
        scrollCount += 1;
        const next = 'r' + (scrollCount + 1);
        if (bodies.has(next)) setTimeout(() => emitBatch(next), 0);
        return { result: { value: true } };
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
  return session;
}

function makeFakeCdp(session) {
  return {
    ensureBossTarget: async () => ({ targetId: 't1', sessionId: 'sess-1' }),
    connect: async () => session,
  };
}

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
      discoveryTiming,
      DISCOVERY_DEFAULTS,
      jobDedupeKey,
      JoblistStream,
      BossJobDiscovery,
    } = require('../dist-electron/platforms/boss/BossJobDiscovery.js');
    const { readBossHasMore } = require('../dist-electron/platforms/boss/BossJobMapper.js');
    const { ChromeCDPManager } = require('../dist-electron/automation/cdp/ChromeCDPManager.js');

    // 测试用快速时序（覆盖模块级 timing，仅测试进程内生效）。
    discoveryTiming.firstBatchTimeoutMs = 400;
    discoveryTiming.totalTimeoutMs = 3000;
    discoveryTiming.scrollWaitMs = 120;
    discoveryTiming.scrollAttempts = 1;

    // ---- 纯函数：hasMore 读取 / 去重键 / 默认限制 ----
    check('hasMore true 读取', readBossHasMore({ code: 0, zpData: { hasMore: true } }) === true);
    check('hasMore 1 读取', readBossHasMore({ code: 0, zpData: { hasMore: 1 } }) === true);
    check('hasMore false 读取', readBossHasMore({ code: 0, zpData: { hasMore: false } }) === false);
    check('hasMore 缺失 → false', readBossHasMore({ code: 0, zpData: {} }) === false);
    check('hasMore 非对象 → false', readBossHasMore(null) === false);
    check(
      '去重键优先 platformJobId',
      jobDedupeKey({ id: 'lid9', platformJobId: 'ej9' }) === 'p:ej9' &&
        jobDedupeKey({ id: 'lid9' }) === 'id:lid9',
    );
    check('保守默认值 maxJobs=50 maxBatches=4', DISCOVERY_DEFAULTS.maxJobs === 50 && DISCOVERY_DEFAULTS.maxBatches === 4);

    // ---- 1/2/3/5. 首批捕获 + hasMore 继续加载 + 多批累积 + hasMore=false 停止 ----
    {
      const bodies = new Map([
        ['r1', bodyWith(jobList(15, 'A', 1), true)],
        ['r2', bodyWith(jobList(15, 'B', 16), false)],
      ]);
      const session = makeFakeSession(bodies);
      const discovery = new BossJobDiscovery(makeFakeCdp(session));
      const res = await discovery.searchJobs('TEST', '新媒体运营', '无锡');
      check('首批+次批累积 30 个岗位', res.status === 'SUCCESS' && res.jobs.length === 30, `jobs=${res.jobs.length}`);
      check('hasMore=false 停止', res.hasMore === false && res.batchesLoaded === 2, `hasMore=${res.hasMore}`);
      check('批次内岗位映射正常', res.jobs[0].title === 'A岗位0' && res.jobs[15].title === 'B岗位0');
      check('仅触发一次滚动', session.scrollCount() === 1, `scrolls=${session.scrollCount()}`);
      check('listener 已清理（多批成功）', session.handlerCount() === 0);
    }

    // ---- 4. platformJobId 去重（次批含 5 个重复岗位）----
    {
      const dup = jobList(15, 'A', 1).slice(0, 5);
      const bodies = new Map([
        ['r1', bodyWith(jobList(15, 'A', 1), true)],
        ['r2', bodyWith([...dup, ...jobList(10, 'B', 16)], false)],
      ]);
      const session = makeFakeSession(bodies);
      const discovery = new BossJobDiscovery(makeFakeCdp(session));
      const res = await discovery.searchJobs('TEST', '新媒体运营', '无锡');
      const ids = new Set(res.jobs.map((j) => j.platformJobId));
      check('重复岗位去重后 25 个', res.jobs.length === 25, `jobs=${res.jobs.length}`);
      check('去重后 platformJobId 无重复', ids.size === res.jobs.length);
      check('listener 已清理（去重场景）', session.handlerCount() === 0);
    }

    // ---- 6. maxJobs 停止 ----
    {
      const bodies = new Map([
        ['r1', bodyWith(jobList(15, 'A', 1), true)],
        ['r2', bodyWith(jobList(15, 'B', 16), true)],
      ]);
      const session = makeFakeSession(bodies);
      const discovery = new BossJobDiscovery(makeFakeCdp(session));
      const res = await discovery.searchJobs('TEST', '新媒体运营', '无锡', { maxJobs: 20 });
      check('maxJobs=20 时 30≥20 停止', res.jobs.length === 30 && res.batchesLoaded === 2, `jobs=${res.jobs.length}`);
      check('maxJobs 停止后 hasMore 保留已知值', res.hasMore === true);
    }

    // ---- 7. maxBatches 停止 ----
    {
      const bodies = new Map([
        ['r1', bodyWith(jobList(15, 'A', 1), true)],
        ['r2', bodyWith(jobList(15, 'B', 16), true)],
        ['r3', bodyWith(jobList(15, 'C', 31), true)],
      ]);
      const session = makeFakeSession(bodies);
      const discovery = new BossJobDiscovery(makeFakeCdp(session));
      const res = await discovery.searchJobs('TEST', '新媒体运营', '无锡', { maxBatches: 2 });
      check('maxBatches=2 停止于第 2 批', res.batchesLoaded === 2 && res.jobs.length === 30, `batches=${res.batchesLoaded}`);
      check('maxBatches 停止后不再滚动', session.scrollCount() === 1, `scrolls=${session.scrollCount()}`);
    }

    // ---- 8. 滚动后没有新响应 → 停止 ----
    {
      const bodies = new Map([['r1', bodyWith(jobList(15, 'A', 1), true)]]);
      const session = makeFakeSession(bodies);
      const discovery = new BossJobDiscovery(makeFakeCdp(session));
      const res = await discovery.searchJobs('TEST', '新媒体运营', '无锡');
      check('无新响应超时停止（保留首批）', res.status === 'SUCCESS' && res.jobs.length === 15 && res.batchesLoaded === 1, `batches=${res.batchesLoaded}`);
      check('listener 已清理（无新响应停止）', session.handlerCount() === 0);
    }

    // ---- 9. SECURITY_RESTRICTED 停止（次批返回风控）----
    {
      const bodies = new Map([
        ['r1', bodyWith(jobList(15, 'A', 1), true)],
        ['r2', JSON.stringify({ code: 37, message: '访问频繁' })],
      ]);
      const session = makeFakeSession(bodies);
      const discovery = new BossJobDiscovery(makeFakeCdp(session));
      const res = await discovery.searchJobs('TEST', '新媒体运营', '无锡');
      check('SECURITY_RESTRICTED 停止', res.status === 'SECURITY_RESTRICTED', `status=${res.status}`);
      check('listener 已清理（风控停止）', session.handlerCount() === 0);
    }

    // ---- 10. CDP disconnect 停止（getResponseBody 失败 → CDP_DISCONNECTED）----
    {
      const bodies = new Map([['r1', bodyWith(jobList(15, 'A', 1), false)]]);
      const session = makeFakeSession(bodies);
      session.setThrowBody(new Error('WebSocket 已关闭'));
      const discovery = new BossJobDiscovery(makeFakeCdp(session));
      const res = await discovery.searchJobs('TEST', '新媒体运营', '无锡');
      check('CDP_DISCONNECTED 停止', res.status === 'CDP_DISCONNECTED', `status=${res.status}`);
      check('listener 已清理（断连停止）', session.handlerCount() === 0);
    }

    // ---- 11/12. JoblistStream 组件级：waitNext 超时 → null；dispose 清理 ----
    {
      const bodies = new Map([]);
      const session = makeFakeSession(bodies);
      const stream = new JoblistStream(session, 'sess-1');
      check('stream 注册后有监听', session.handlerCount() === 1);
      const nulled = await stream.waitNext(150);
      check('waitNext 超时 → null', nulled === null);
      stream.dispose();
      check('dispose 后监听移除', session.handlerCount() === 0);
    }

    // ---- 2. keyword validation（未触碰 Chrome 前抛错）----
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

    dbMod.closeDatabase();
  } catch (err) {
    console.error('JOB SEARCH TEST ERROR:', err);
    failures += 1;
  }

  console.log(failures === 0 ? 'JOB SEARCH TEST: ALL PASS' : `JOB SEARCH TEST: ${failures} FAIL`);

  try {
    fs.rmSync(process.env.JOBPILOT_DATA_DIR, { recursive: true, force: true });
  } catch {
    // 忽略
  }

  app.exit(failures === 0 ? 0 : 1);
});
