/**
 * V0.3-C3 自动搜索计划逻辑测试（Electron 运行时，fake searchFn 驱动，不触碰真实 Chrome）。
 * 覆盖：计划生成（顺序/去重/上限）/ 致命状态判定 / 跨任务去重汇总 /
 * 求职目标持久化 / 顺序执行（全成功 / 部分失败继续 / 致命停止）/ 空计划。
 */
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

process.env.JOBPILOT_DATA_DIR = path.resolve(__dirname, '..', 'dev-data', `search-plan-test-${process.pid}`);

function makeJob(id, status) {
  return {
    id,
    platform: 'BOSS',
    platformJobId: id,
    title: `岗位${id}`,
    company: '测试公司',
    location: '无锡',
    status,
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
      buildSearchPlan,
      isFatalSearchStatus,
      mergeJobs,
      countJobStatuses,
      MAX_PLAN_TASKS,
    } = require('../dist-electron/core/searchPlan.js');
    const { runSearchPlan } = require('../dist-electron/electron/main/services/searchPlanService.js');
    const { getJobTarget, saveJobTarget } = require('../dist-electron/database/repositories/jobTargetRepository.js');
    const {
      upsertJobs,
      getJobStatuses,
      getAllPlatformJobIds,
    } = require('../dist-electron/database/repositories/jobRepository.js');
    const { jobTargetSchema } = require('../dist-electron/shared/ipc.js');

    /** 模拟生产 searchBossJobs：搜索成功 → C2 upsert + 状态标注（写入真实 TEST 库）。 */
    const realLikeSearch = (jobForTask) => async (q) => {
      const jobs = jobForTask(q);
      upsertJobs(jobs);
      const statuses = getJobStatuses('BOSS', jobs.map((j) => j.platformJobId));
      return {
        status: 'SUCCESS',
        jobs: jobs.map((j) => ({ ...j, status: statuses[j.platformJobId] })),
      };
    };

    // ---- 1. 计划生成：顺序 / 去重 / 数量 ----
    {
      const target = {
        targetJob: '网络测试工程师',
        relatedKeywords: ['网卡测试工程师', '网络工程师', '网卡测试工程师'],
        targetCities: ['无锡', '苏州'],
      };
      const tasks = buildSearchPlan(target);
      check('计划数量 = 城市×关键词（去重后 2×3=6）', tasks.length === 6, `n=${tasks.length}`);
      check(
        '先目标岗位后相关方向、城市优先',
        tasks[0].keyword === '网络测试工程师' &&
          tasks[0].city === '无锡' &&
          tasks[1].keyword === '网卡测试工程师' &&
          tasks[1].city === '无锡' &&
          tasks[3].keyword === '网络测试工程师' &&
          tasks[3].city === '苏州',
        JSON.stringify(tasks),
      );
      check('计划内无重复任务', new Set(tasks.map((t) => `${t.keyword}\u0000${t.city}`)).size === tasks.length);
    }

    // ---- 2. 计划上限 ----
    {
      const big = {
        targetJob: 'A',
        relatedKeywords: ['B', 'C', 'D', 'E', 'F', 'G'],
        targetCities: ['1', '2', '3', '4', '5'],
      };
      const tasks = buildSearchPlan(big);
      check('计划任务数受 MAX_PLAN_TASKS 上限约束', tasks.length <= MAX_PLAN_TASKS, `n=${tasks.length}`);
    }

    // ---- 3. 致命状态判定 ----
    check(
      '致命状态（登录失效/安全验证/断连/未连接）',
      isFatalSearchStatus('LOGIN_EXPIRED') &&
        isFatalSearchStatus('SECURITY_RESTRICTED') &&
        isFatalSearchStatus('CDP_DISCONNECTED') &&
        isFatalSearchStatus('NOT_CONNECTED'),
    );
    check(
      '非致命状态不停止',
      !isFatalSearchStatus('SUCCESS') &&
        !isFatalSearchStatus('SEARCH_TIMEOUT') &&
        !isFatalSearchStatus('INVALID_RESPONSE') &&
        !isFatalSearchStatus('UNSUPPORTED_CITY'),
    );

    // ---- 4. 跨任务去重汇总 ----
    {
      const acc = new Map();
      mergeJobs(acc, [makeJob('j1', 'NEW'), makeJob('j2', 'SEEN')]);
      mergeJobs(acc, [makeJob('j1', 'NEW'), makeJob('j3', 'NEW')]);
      check('跨任务同一岗位只计一次', acc.size === 3);
      const { newCount, seenCount } = countJobStatuses(acc.values());
      check('NEW/SEEN 计数正确', newCount === 2 && seenCount === 1, `new=${newCount} seen=${seenCount}`);
    }

    // ---- 5. 求职目标持久化（重启等价：save → get）----
    {
      const saved = saveJobTarget({
        targetJob: '网络测试工程师',
        relatedKeywords: ['网卡测试'],
        targetCities: ['无锡', '苏州'],
      });
      const loaded = getJobTarget();
      check(
        '求职目标 save → get 一致',
        loaded !== null &&
          loaded.targetJob === '网络测试工程师' &&
          loaded.relatedKeywords.length === 1 &&
          loaded.targetCities.length === 2,
        JSON.stringify(loaded),
      );
      check('保存返回规范化目标', saved.relatedKeywords.length === 1 && saved.targetCities.length === 2);
    }

    // ---- 6. 首次执行：历史为空 → 全部计为新岗位 ----
    {
      const progresses = [];
      const searchFn = realLikeSearch((q) =>
        q.keyword === 'A'
          ? [makeJob('j1', 'NEW'), makeJob('j2', 'SEEN')]
          : [makeJob('j1', 'NEW'), makeJob('j3', 'NEW')],
      );
      const result = await runSearchPlan(
        [
          { keyword: 'A', city: '无锡' },
          { keyword: 'B', city: '无锡' },
        ],
        { searchFn, onProgress: (p) => progresses.push(p) },
      );
      check(
        '首次执行（历史为空）→ 全部计入新岗位',
        result.status === 'COMPLETED' &&
          result.total === 2 &&
          result.succeeded === 2 &&
          result.discovered === 3 &&
          result.newCount === 3 &&
          result.seenCount === 0,
        JSON.stringify(result),
      );
      check('进度事件数量 = 任务数', progresses.length === 2, `n=${progresses.length}`);
      check('最后一次进度汇总正确', progresses[1].discoveredTotal === 3 && progresses[1].newCount === 3);
    }

    // ---- 6b. 立即重跑完全相同计划：历史已存在 → 新岗位明显下降 ----
    {
      const searchFn = realLikeSearch((q) =>
        q.keyword === 'A'
          ? [makeJob('j1', 'NEW'), makeJob('j2', 'SEEN')]
          : [makeJob('j1', 'NEW'), makeJob('j3', 'NEW')],
      );
      const result = await runSearchPlan(
        [
          { keyword: 'A', city: '无锡' },
          { keyword: 'B', city: '无锡' },
        ],
        { searchFn },
      );
      check(
        '重跑相同计划 → 新岗位为 0，已有岗位 = 发现总数',
        result.discovered === 3 && result.newCount === 0 && result.seenCount === 3,
        JSON.stringify(result),
      );
    }

    // ---- 6c. 历史中部分已有：只有真正首次出现的才计新 ----
    {
      // 清空历史，预置 j1/j2 为“之前搜索已发现”的岗位（upsert 落库）。
      const db = dbMod.getDb();
      db.prepare('DELETE FROM jobs').run();
      upsertJobs([makeJob('j1', 'NEW'), makeJob('j2', 'SEEN')]);
      const known = getAllPlatformJobIds('BOSS');
      check('历史快照包含预置岗位', known.has('j1') && known.has('j2') && known.size === 2);

      const searchFn = realLikeSearch((q) =>
        q.keyword === 'A'
          ? [makeJob('j1', 'NEW'), makeJob('j2', 'SEEN')]
          : [makeJob('j2', 'SEEN'), makeJob('j3', 'NEW')],
      );
      const result = await runSearchPlan(
        [
          { keyword: 'A', city: '无锡' },
          { keyword: 'B', city: '无锡' },
        ],
        { searchFn },
      );
      check(
        '历史已有岗位不计新，仅 j3 计新',
        result.discovered === 3 && result.newCount === 1 && result.seenCount === 2,
        JSON.stringify(result),
      );
    }

    // ---- 7. 部分失败：继续执行 ----
    {
      let calls = 0;
      const searchFn = async (q) => {
        calls += 1;
        if (q.keyword === 'A') return { status: 'SUCCESS', jobs: [makeJob('j1', 'NEW')] };
        if (q.keyword === 'B') return { status: 'SEARCH_TIMEOUT', jobs: [], message: '超时' };
        return { status: 'SUCCESS', jobs: [makeJob('j4', 'NEW')] };
      };
      const result = await runSearchPlan(
        [
          { keyword: 'A', city: '无锡' },
          { keyword: 'B', city: '无锡' },
          { keyword: 'C', city: '无锡' },
        ],
        { searchFn },
      );
      check(
        '部分失败 → COMPLETED 成功 2 失败 1 继续执行',
        result.status === 'COMPLETED' &&
          result.succeeded === 2 &&
          result.failed === 1 &&
          result.discovered === 2 &&
          calls === 3,
        JSON.stringify(result),
      );
      check('失败任务已记录', result.failures.length === 1 && result.failures[0].task.keyword === 'B');
    }

    // ---- 8. 致命状态：停止后续搜索 ----
    {
      let calls = 0;
      const searchFn = async (q) => {
        calls += 1;
        if (q.keyword === 'A') return { status: 'SUCCESS', jobs: [makeJob('j1', 'NEW')] };
        return { status: 'SECURITY_RESTRICTED', jobs: [], message: '平台安全验证' };
      };
      const result = await runSearchPlan(
        [
          { keyword: 'A', city: '无锡' },
          { keyword: 'B', city: '无锡' },
          { keyword: 'C', city: '无锡' },
        ],
        { searchFn },
      );
      check(
        '致命状态 → STOPPED + stopReason，且不再执行后续任务',
        result.status === 'STOPPED' &&
          result.stopReason !== undefined &&
          result.stopReason.status === 'SECURITY_RESTRICTED' &&
          result.succeeded === 1 &&
          calls === 2,
        JSON.stringify(result),
      );
    }

    // ---- 9. 空计划 ----
    {
      const result = await runSearchPlan([]);
      check(
        '空计划 → COMPLETED 全 0',
        result.status === 'COMPLETED' && result.total === 0 && result.discovered === 0,
      );
    }

    // ---- 10. 求职目标输入校验（zod）----
    {
      check(
        '合法目标通过校验',
        jobTargetSchema.safeParse({ targetJob: '网络测试工程师', relatedKeywords: ['A'], targetCities: ['无锡'] }).success,
      );
      check(
        '缺城市 → 校验失败',
        !jobTargetSchema.safeParse({ targetJob: '网络测试工程师', targetCities: [] }).success,
      );
      check(
        '相关岗位超限 → 校验失败',
        !jobTargetSchema.safeParse({
          targetJob: 'A',
          relatedKeywords: ['1', '2', '3', '4', '5', '6', '7'],
          targetCities: ['无锡'],
        }).success,
      );
    }

    dbMod.closeDatabase();
  } catch (err) {
    console.error('SEARCH PLAN TEST ERROR:', err);
    failures += 1;
  }

  console.log(failures === 0 ? 'SEARCH PLAN TEST: ALL PASS' : `SEARCH PLAN TEST: ${failures} FAIL`);

  try {
    fs.rmSync(process.env.JOBPILOT_DATA_DIR, { recursive: true, force: true });
  } catch {
    // 忽略
  }

  app.exit(failures === 0 ? 0 : 1);
});
