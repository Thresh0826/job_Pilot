import type { Job, JobSearchQuery, JobSearchResult, JobSearchStatus } from './matching';

/**
 * V0.3-C3 自动搜索计划。
 * 一份求职目标 → 多个搜索任务（keyword + city）→ 自动顺序执行 → 汇总结果。
 * 纯逻辑（计划生成 / 状态判定 / 去重聚合）集中在此，便于测试与复用。
 */

/** C3 求职目标（最小可用：主要目标岗位 + 相关岗位关键词 + 目标城市）。 */
export interface JobTarget {
  targetJob: string;
  relatedKeywords: string[];
  targetCities: string[];
}

/** 单个搜索任务。 */
export interface SearchTask {
  keyword: string;
  city: string;
}

/** 搜索执行中的进度（main → renderer 推送）。 */
export interface SearchPlanProgress {
  /** 1-based 当前任务序号。 */
  index: number;
  total: number;
  task: SearchTask;
  /** 当前已去重累计岗位数。 */
  discoveredTotal: number;
  /** 当前累计 NEW 岗位数。 */
  newCount: number;
}

/** 单个任务失败信息。 */
export interface SearchPlanFailure {
  task: SearchTask;
  status: JobSearchStatus;
  message?: string;
}

export type SearchPlanStatus = 'COMPLETED' | 'STOPPED';

/** 自动搜索汇总结果。 */
export interface SearchPlanResult {
  status: SearchPlanStatus;
  total: number;
  succeeded: number;
  failed: number;
  /** 去重后发现的岗位数（跨任务同一岗位不重复计算）。 */
  discovered: number;
  newCount: number;
  seenCount: number;
  failures: SearchPlanFailure[];
  /** STOPPED 时存在：影响后续任务的状态（登录失效 / 安全验证 / 连接断开 / 未连接）。 */
  stopReason?: SearchPlanFailure;
}

/** 单次计划最多任务数（避免一个目标生成几十上百个搜索任务）。 */
export const MAX_PLAN_TASKS = 24;

function uniqueStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const v = item.trim();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/** 由求职目标生成搜索计划：每个城市 ×（目标岗位 + 相关关键词），顺序为先目标岗位后相关方向。 */
export function buildSearchPlan(target: JobTarget): SearchTask[] {
  const keywords = uniqueStrings([target.targetJob, ...target.relatedKeywords]);
  const cities = uniqueStrings(target.targetCities);
  const tasks: SearchTask[] = [];
  for (const city of cities) {
    for (const keyword of keywords) {
      tasks.push({ keyword, city });
      if (tasks.length >= MAX_PLAN_TASKS) return tasks;
    }
  }
  return tasks;
}

/** 会影响后续所有任务、需要用户处理的状态（搜索应立即停止）。 */
export function isFatalSearchStatus(status: JobSearchStatus): boolean {
  return (
    status === 'LOGIN_EXPIRED' ||
    status === 'SECURITY_RESTRICTED' ||
    status === 'CDP_DISCONNECTED' ||
    status === 'NOT_CONNECTED'
  );
}

function jobKey(job: Job): string {
  return job.platformJobId && job.platformJobId.length > 0 ? `p:${job.platformJobId}` : `id:${job.id}`;
}

/** 跨任务累积去重岗位（同一平台岗位只计一次，用于汇总）。 */
export function mergeJobs(acc: Map<string, Job>, jobs: Job[]): void {
  for (const job of jobs) {
    const key = jobKey(job);
    if (!acc.has(key)) acc.set(key, job);
  }
}

/** 统计去重岗位中的 NEW / SEEN 数量。 */
export function countJobStatuses(jobs: Iterable<Job>): { newCount: number; seenCount: number } {
  let newCount = 0;
  let seenCount = 0;
  for (const job of jobs) {
    if (job.status === 'NEW') newCount += 1;
    else if (job.status === 'SEEN') seenCount += 1;
  }
  return { newCount, seenCount };
}

/**
 * C3 统计本次运行新发现的岗位数。
 * “新”的定义：本次计划运行前，JobPilot 从未发现过的岗位（knownBefore 为运行前的历史快照）。
 * 与 C2 的 NEW/SEEN 视图状态无关：历史中已有的岗位（即使从未查看、状态为 NEW）不再计入新岗位。
 * acc 已按岗位去重，因此同一岗位在多个任务中重复出现只统计一次。
 */
export function countNewJobs(acc: Map<string, Job>, knownBefore: ReadonlySet<string>): number {
  let n = 0;
  for (const job of acc.values()) {
    if (!job.platformJobId || !knownBefore.has(job.platformJobId)) n += 1;
  }
  return n;
}

/** 供计划执行使用的查询类型再导出（避免各层重复 import）。 */
export type { JobSearchQuery, JobSearchResult };
