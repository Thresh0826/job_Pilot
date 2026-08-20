import {
  MIN_JD_LENGTH,
  type BatchAnalysisProgress,
  type BatchAnalysisResult,
  type BatchStats,
} from '../../../core/decision';
import type { Job, JobDetailResult } from '../../../core/matching';
import type { PlatformType } from '../../../shared/enums';
import type { NewJobWithDecisionRow } from '../../../database/repositories/decisionRepository';
import { getNewJobsWithDecisions } from '../../../database/repositories/decisionRepository';
import {
  getLatestDiscoveryBatchAt,
  markAnalysisFailed,
  saveJobDetailSeen,
} from '../../../database/repositories/jobRepository';
import { getBossJobDetail } from './platformService';
import { analyzeJobDecision, isDecisionValidFor } from './decisionService';
import { getCandidateSnapshot } from './candidateService';
import { logger } from '../logger';

/**
 * V0.4-C 批量自动岗位决策（Electron Main）。
 *
 * 批次范围：「一次搜索运行」= 一个发现批次（一次手动搜索 / 一次自动搜索计划），
 * 批量分析覆盖该批次全部 NEW 岗位；已有效决策 / 已失败标记的岗位不重复处理，
 * 因此「继续分析」自动从剩余岗位继续。
 *
 * 平台安全（不绕过）：
 * - 已有完整 JD 直接决策，不读取详情
 * - 缺 JD 的岗位有节制地顺序读取（详情间节流延迟），禁止短时间高频连续访问
 * - 同一岗位读取失败后不立即重试（失败标记，后续可重新处理）
 * - 读取结果明显不是有效岗位详情（JD 过短）→ 不决策、标记失败
 * - 单个岗位触发平台安全验证 / 登录失效 / 连接断开 → 跳过该岗位并继续下一个，
 *   任务不中断；全部失败原因写入日志（WARN），失败岗位后续可重新处理
 *
 * 统计口径：total = done(autoApply+review+skip) + failed + pending。
 */

/** 详情读取间的节流延迟（毫秒），避免触发平台风控。 */
const DEFAULT_DETAIL_DELAY_MS = 3000;

/** 当前批量任务（供取消）。 */
let activeBatch: { cancelled: boolean } | null = null;

export function cancelActiveBatch(): void {
  if (activeBatch) activeBatch.cancelled = true;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export interface BatchRunOptions {
  /** 可注入的详情读取函数（测试用）；缺省走真实 BOSS 详情。 */
  fetchDetail?: (job: Job) => Promise<JobDetailResult>;
  onProgress?: (progress: BatchAnalysisProgress) => void;
  isCancelled?: () => boolean;
  /** 详情读取间的节流延迟（毫秒），缺省 3000；测试可传 0。 */
  detailDelayMs?: number;
}

function rowToJob(platform: string, row: NewJobWithDecisionRow): Job {
  let sourceMetadata: Record<string, string> | undefined;
  try {
    const parsed = JSON.parse(row.source_metadata ?? 'null');
    if (parsed && typeof parsed === 'object') sourceMetadata = parsed as Record<string, string>;
  } catch {
    // 忽略异常元数据
  }
  return {
    id: row.platformJobId,
    platform: platform as PlatformType,
    platformJobId: row.platformJobId,
    title: row.title ?? '',
    company: row.company ?? '',
    city: row.city ?? undefined,
    salary: row.salary ?? undefined,
    location: row.location ?? '',
    degree: row.degree ?? undefined,
    experience: row.experience ?? undefined,
    jobUrl: row.job_url ?? undefined,
    sourceMetadata,
  };
}

/** 岗位是否已有「有效决策」（JD 完整 + 上下文一致），无需重新分析。 */
function hasValidDecision(platform: string, row: NewJobWithDecisionRow): boolean {
  if (!row.jd_text || row.jd_text.length < MIN_JD_LENGTH) return false;
  if (!row.decision_context_hash) return false;
  return isDecisionValidFor(platform, row.platformJobId, row.decision_context_hash);
}

interface BatchState {
  total: number;
  done: number;
  autoApply: number;
  review: number;
  skip: number;
  failed: number;
  pending: number;
}

/**
 * 统计批次内岗位状态（实时 / 完成后共用）。
 * 有效状态口径（与 REVIEW 队列、顶部统计严格一致）：
 * - AUTO_APPLY：verdict AUTO_APPLY，或用户已「允许投递」（user_action=ALLOW）
 * - REVIEW（需要确认）：verdict REVIEW 且用户未处理（user_action=NONE）
 * - SKIP：verdict SKIP，或用户已「跳过」（user_action=SKIP）
 * - FAILED：详情/决策失败标记
 * - PENDING：无有效决策且未失败标记
 */
function computeBatchState(platform: string, rows: NewJobWithDecisionRow[]): BatchState {
  const state: BatchState = { total: rows.length, done: 0, autoApply: 0, review: 0, skip: 0, failed: 0, pending: 0 };
  for (const row of rows) {
    if (row.analysis_failed_at) {
      state.failed += 1;
      continue;
    }
    if (!hasValidDecision(platform, row)) {
      state.pending += 1;
      continue;
    }
    const action = row.decision_user_action;
    if (row.decision_verdict === 'SKIP' || action === 'SKIP') {
      state.skip += 1;
    } else if (row.decision_verdict === 'AUTO_APPLY' || action === 'ALLOW') {
      state.autoApply += 1;
    } else {
      // verdict REVIEW 且未处理（ALLOW/SKIP 已在上方归入对应分类）
      state.review += 1;
    }
    state.done += 1;
  }
  return state;
}

/** 批量分析统计（实时服务端口径，「分析本次新岗位（N）」与顶部汇总共用）。 */
export function getBatchStats(platform: string): BatchStats {
  const batchAt = getLatestDiscoveryBatchAt(platform);
  const rows = getNewJobsWithDecisions(platform, batchAt);
  const state = computeBatchState(platform, rows);
  return {
    total: state.total,
    autoApply: state.autoApply,
    review: state.review,
    skip: state.skip,
    failed: state.failed,
    pending: state.pending,
  };
}

/**
 * 批量分析最近一次发现批次内的 NEW 岗位。
 * 幂等：已完成决策 / 失败标记的岗位跳过，只处理剩余 → 支持「继续分析」从剩余继续。
 */
export async function runBatchAnalysis(
  platform: string,
  options: BatchRunOptions = {},
): Promise<BatchAnalysisResult> {
  const fetchDetail = options.fetchDetail ?? (async (job) => getBossJobDetail(job));
  const onProgress = options.onProgress;
  const detailDelayMs = options.detailDelayMs ?? DEFAULT_DETAIL_DELAY_MS;

  const holder = { cancelled: false };
  activeBatch = holder;
  const isCancelled = options.isCancelled ?? (() => holder.cancelled);

  try {
    if (!getCandidateSnapshot().profile) {
      throw new Error('还没有候选人资料，请先在「我的资料」上传简历并确认。');
    }
    const batchAt = getLatestDiscoveryBatchAt(platform);
    const rows = getNewJobsWithDecisions(platform, batchAt);
    const state = computeBatchState(platform, rows);

    const todo = rows.filter((row) => !row.analysis_failed_at && !hasValidDecision(platform, row));
    const emit = (index: number, currentTitle: string) =>
      onProgress?.({
        total: state.total,
        done: state.done,
        autoApply: state.autoApply,
        review: state.review,
        skip: state.skip,
        failed: state.failed,
        pending: state.pending,
        index,
        todo: todo.length,
        currentTitle,
      });

    emit(0, '准备中');
    let status: BatchAnalysisResult['status'] = 'COMPLETED';
    let handled = 0;

    for (const row of todo) {
      if (isCancelled()) {
        status = 'CANCELLED';
        break;
      }
      handled += 1;

      // 1. 确保有「有效」完整 JD（缺失或过短 → 节流读取详情）
      if (!row.jd_text || row.jd_text.length < MIN_JD_LENGTH) {
        if (detailDelayMs > 0) await sleep(detailDelayMs);
        if (isCancelled()) {
          status = 'CANCELLED';
          break;
        }
        logger.info(
          'batch-analysis',
          `读取详情 job=${row.platformJobId} title=${row.title} (${handled}/${todo.length})`,
        );
        try {
          const detail = await fetchDetail(rowToJob(platform, row));
          if (
            detail.status === 'SUCCESS' &&
            detail.detail?.jdText &&
            detail.detail.jdText.length >= MIN_JD_LENGTH
          ) {
            saveJobDetailSeen(platform, row.platformJobId, detail.detail.jdText);
            logger.info(
              'batch-analysis',
              `详情读取成功 job=${row.platformJobId} jdLen=${detail.detail.jdText.length}`,
            );
          } else {
            // 读取失败 / 结果不是有效岗位详情（过短）/ 触发平台验证或登录失效：
            // 单个岗位失败，跳过并继续下一个；任务不中断，后续允许重新处理。
            markAnalysisFailed(platform, row.platformJobId);
            state.failed += 1;
            state.pending -= 1;
            const jdLen = detail.detail?.jdText?.length ?? 0;
            logger.warn(
              'batch-analysis',
              `岗位详情处理失败，跳过继续：job=${row.platformJobId} title=${row.title} ` +
                `status=${detail.status ?? 'UNKNOWN'} message=${detail.message ?? ''} jdLen=${jdLen} ` +
                `（已处理 ${handled}/${todo.length}，done=${state.done} failed=${state.failed} pending=${state.pending}）`,
            );
            emit(handled, row.title);
            continue;
          }
        } catch (err) {
          markAnalysisFailed(platform, row.platformJobId);
          state.failed += 1;
          state.pending -= 1;
          logger.error(
            'batch-analysis',
            `详情读取异常 job=${row.platformJobId}: ${err instanceof Error ? err.message : String(err)}`,
          );
          emit(handled, row.title);
          continue;
        }
      }

      // 2. 决策（复用 V0.4-B 分析 + 持久化；短 JD 会在这里被拒绝）
      try {
        const view = await analyzeJobDecision(platform, row.platformJobId);
        const verdict = view.decision?.verdict;
        state.done += 1;
        state.pending -= 1;
        if (verdict === 'AUTO_APPLY') state.autoApply += 1;
        else if (verdict === 'REVIEW') state.review += 1;
        else state.skip += 1;
      } catch (err) {
        markAnalysisFailed(platform, row.platformJobId);
        state.failed += 1;
        state.pending -= 1;
        logger.error(
          'batch-analysis',
          `决策失败 job=${row.platformJobId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      emit(handled, row.title);
    }

    logger.info(
      'batch-analysis',
      `批量分析结束 status=${status} total=${state.total} done=${state.done} ` +
        `auto=${state.autoApply} review=${state.review} skip=${state.skip} ` +
        `failed=${state.failed} pending=${state.pending}`,
    );

    return {
      status,
      total: state.total,
      done: state.done,
      autoApply: state.autoApply,
      review: state.review,
      skip: state.skip,
      failed: state.failed,
      pending: state.pending,
    };
  } finally {
    if (activeBatch === holder) activeBatch = null;
  }
}
