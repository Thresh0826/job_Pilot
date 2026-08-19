import type { Job, JobSearchResult } from '../../../core/matching';
import type {
  JobTarget,
  SearchPlanFailure,
  SearchPlanProgress,
  SearchPlanResult,
  SearchTask,
} from '../../../core/searchPlan';
import {
  buildSearchPlan,
  countNewJobs,
  isFatalSearchStatus,
  mergeJobs,
} from '../../../core/searchPlan';
import { getJobTarget, saveJobTarget } from '../../../database/repositories/jobTargetRepository';
import { getAllPlatformJobIds } from '../../../database/repositories/jobRepository';
import { searchBossJobs } from './platformService';
import { logger } from '../logger';

/** 读取求职目标（未设置返回 null）。 */
export function loadJobTarget(): JobTarget | null {
  return getJobTarget();
}

/** 保存求职目标。 */
export function persistJobTarget(target: JobTarget): JobTarget {
  return saveJobTarget(target);
}

/** 由已保存的求职目标生成搜索计划（不执行）。 */
export function loadSearchPlan(): SearchTask[] {
  const target = getJobTarget();
  return target ? buildSearchPlan(target) : [];
}

export interface SearchPlanRunOptions {
  /** 可注入的搜索函数（测试用）；缺省走真实 BOSS 搜索（含 C2 upsert + 状态标注）。 */
  searchFn?: (query: { keyword: string; city: string }) => Promise<JobSearchResult>;
  onProgress?: (progress: SearchPlanProgress) => void;
}

/**
 * C3 自动顺序执行搜索计划。
 * - 单个任务失败（超时 / 无效响应 / 城市不支持）不中断，记入 failures 继续
 * - 影响后续任务的状态（登录失效 / 安全验证 / 连接断开 / 未连接）→ STOPPED 并记录 stopReason
 * - 跨任务同一岗位按 platformJobId 去重后汇总
 * - “新岗位”= 本次运行前历史中不存在的岗位（运行前快照），历史已有岗位计为已见
 */
export async function runSearchPlan(
  tasks: SearchTask[],
  options: SearchPlanRunOptions = {},
): Promise<SearchPlanResult> {
  const searchFn = options.searchFn ?? (async (q) => searchBossJobs({ keyword: q.keyword, city: q.city }));
  const onProgress = options.onProgress;
  const total = tasks.length;

  // 运行前历史快照：本次计划运行前已发现（落库）的岗位 ID。
  const knownBefore = getAllPlatformJobIds('BOSS');

  const acc = new Map<string, Job>();
  const failures: SearchPlanFailure[] = [];
  let succeeded = 0;
  let stopReason: SearchPlanFailure | undefined;

  for (let i = 0; i < total; i++) {
    const task = tasks[i];
    logger.info('search-plan', `task ${i + 1}/${total} keyword=${task.keyword} city=${task.city}`);
    const result = await searchFn({ keyword: task.keyword, city: task.city });

    if (result.status === 'SUCCESS') {
      succeeded += 1;
      mergeJobs(acc, result.jobs ?? []);
    } else {
      const failure: SearchPlanFailure = {
        task,
        status: result.status,
        message: result.message,
      };
      failures.push(failure);
      if (isFatalSearchStatus(failure.status)) {
        stopReason = failure;
        logger.info('search-plan', `stop at task ${i + 1}: ${failure.status}`);
      }
    }

    const newCount = countNewJobs(acc, knownBefore);
    onProgress?.({ index: i + 1, total, task, discoveredTotal: acc.size, newCount });
    if (stopReason) break;
  }

  const newCount = countNewJobs(acc, knownBefore);
  const result: SearchPlanResult = {
    status: stopReason ? 'STOPPED' : 'COMPLETED',
    total,
    succeeded,
    failed: failures.length,
    discovered: acc.size,
    newCount,
    seenCount: acc.size - newCount,
    failures,
  };
  if (stopReason) result.stopReason = stopReason;
  return result;
}
