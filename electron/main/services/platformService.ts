import { chromeCDP } from '../../../automation/cdp/ChromeCDPManager';
import { BossAdapter, type BossLoginState } from '../../../platforms/boss/BossAdapter';
import {
  getBossPlatformStatus,
  getRunMode,
  saveBossPlatformStatus,
} from '../../../database/repositories/settingsRepository';
import type { Job, JobDetailResult, JobSearchQuery, JobSearchResult } from '../../../core/matching';
import type { PlatformActionResult } from '../../../shared/ipc';
import type { BossPlatformStatus } from '../../../shared/settings';
import { getJobStatuses, saveJobDetailSeen, upsertJobs } from '../../../database/repositories/jobRepository';
import { logger } from '../logger';

const boss = new BossAdapter(chromeCDP, () => getRunMode());

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getBossStatus(): BossPlatformStatus {
  return getBossPlatformStatus();
}

/** 连接：确保当前模式专用 Chrome，打开 BOSS 登录页，由用户本人完成登录。 */
export async function connectBoss(): Promise<PlatformActionResult> {
  logger.info('platform', 'connect 开始');
  try {
    await boss.openLogin(getRunMode());
    await sleep(2500);

    const state = await boss.checkLoginStatus(getRunMode());
    logger.info('platform', `connect 检测结果: ${state}`);
    if (state === 'CONNECTED') {
      saveBossPlatformStatus('CONNECTED');
      return { status: 'CONNECTED', message: '已连接 BOSS直聘。' };
    }
    return { status: 'CONNECTING', message: '已打开登录页，请扫码或完成验证登录，完成后点击「检查连接」。' };
  } catch (err) {
    logger.error('platform', `connect 失败: ${err instanceof Error ? err.message : String(err)}`);
    return { status: 'ERROR', message: friendlyError(err) };
  }
}

/** 检查：主动验证当前 Session（只读检测；Chrome 未运行时允许启动）。 */
export async function checkBossConnection(): Promise<PlatformActionResult> {
  logger.info('platform', 'check 开始');
  try {
    const state: BossLoginState = await boss.checkLoginStatus(getRunMode());
    logger.info('platform', `check 检测结果: ${state}`);

    if (state === 'CONNECTED') {
      saveBossPlatformStatus('CONNECTED');
      return { status: 'CONNECTED', message: '已连接 BOSS直聘。' };
    }
    if (state === 'DISCONNECTED') {
      const prev = getBossPlatformStatus().status;
      const status = prev === 'CONNECTED' ? 'EXPIRED' : 'DISCONNECTED';
      saveBossPlatformStatus(status);
      return {
        status,
        message: status === 'EXPIRED' ? '登录已失效，请重新登录。' : '尚未登录，请在浏览器中完成登录。',
      };
    }
    // UNKNOWN：无法确认，不误报，保持最近已知状态。
    const prev = getBossPlatformStatus();
    return { status: prev.status, message: '无法确认登录状态，请在浏览器中确认。' };
  } catch (err) {
    logger.error('platform', `check 失败: ${err instanceof Error ? err.message : String(err)}`);
    return { status: 'ERROR', message: friendlyError(err) };
  }
}

/** 断开：关闭当前模式专用 Chrome 并删除当前模式 BOSS Profile。 */
export async function disconnectBoss(): Promise<PlatformActionResult> {
  logger.info('platform', 'disconnect 开始');
  try {
    await chromeCDP.close(getRunMode());
    await chromeCDP.clearProfile(getRunMode());
  } catch (err) {
    logger.error('platform', `disconnect 清理失败: ${err instanceof Error ? err.message : String(err)}`);
    return { status: 'ERROR', message: '清理登录数据失败，请稍后重试。' };
  }

  saveBossPlatformStatus('DISCONNECTED');
  logger.info('platform', 'disconnect 完成');
  return { status: 'DISCONNECTED', message: '已断开连接，并清理当前模式的登录数据。' };
}

/** V0.3-A/C1：BOSS 搜索（多批捕获）→ 成功后岗位进入本地库（C2 upsert），返回时标注本地状态。 */
export async function searchBossJobs(
  input: JobSearchQuery,
  options?: { batchAt?: string },
): Promise<JobSearchResult> {
  logger.info('platform', `searchBossJobs keyword=${input.keyword} city=${input.city}`);
  try {
    // V0.4-C：一次搜索运行 = 一个发现批次；批内岗位共享运行开始时间戳（搜索计划由计划开始时间传入）。
    const batchAt = options?.batchAt ?? new Date().toISOString();
    const result = await boss.searchJobs(input);
    if (result.status === 'SUCCESS' && result.jobs.length > 0) {
      const summary = upsertJobs(result.jobs, { batchAt });
      logger.info(
        'platform',
        `jobs upserted inserted=${summary.inserted} updated=${summary.updated} skipped=${summary.skipped}`,
      );
      const ids = result.jobs.map((j) => j.platformJobId).filter((v): v is string => !!v);
      const statuses = getJobStatuses('BOSS', ids);
      result.jobs = result.jobs.map((job) => ({
        ...job,
        status: job.platformJobId ? statuses[job.platformJobId] : undefined,
      }));
    }
    return result;
  } catch (err) {
    logger.error('platform', `searchBossJobs 失败: ${err instanceof Error ? err.message : String(err)}`);
    return { status: 'INVALID_RESPONSE', jobs: [], message: '搜索失败，请稍后重试。' };
  }
}

/** C2：详情读取成功 → 对应岗位标记 SEEN 并保存 JD 文本；失败不标记（不调用）。 */
export function persistJobDetailOutcome(job: Job, result: JobDetailResult): void {
  if (result.status === 'SUCCESS' && result.detail) {
    saveJobDetailSeen(job.platform, job.platformJobId, result.detail.jdText);
  }
}

/** V0.3-B：BOSS 单个岗位详情读取；成功后本地标记 SEEN（C2）。 */
export async function getBossJobDetail(job: Job): Promise<JobDetailResult> {
  logger.info('platform', `getBossJobDetail job=${job.platformJobId ?? job.jobUrl ?? ''}`);
  try {
    const result = await boss.getJobDetail(job);
    persistJobDetailOutcome(job, result);
    return result;
  } catch (err) {
    logger.error('platform', `getBossJobDetail 失败: ${err instanceof Error ? err.message : String(err)}`);
    return { status: 'DETAIL_PARSE_FAILED', detail: null, message: '详情读取失败，请稍后重试。' };
  }
}

/** 将底层异常映射为普通用户可理解的信息；技术细节写入日志。 */
function friendlyError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (
    lower.includes('msedge') ||
    lower.includes('executable') ||
    lower.includes('channel') ||
    lower.includes('chromium') ||
    lower.includes('chrome')
  ) {
    return '无法启动浏览器，请确认已安装 Google Chrome。';
  }
  if (lower.includes('profile') || lower.includes('lock') || lower.includes('singleton')) {
    return '浏览器 Profile 正在被占用，请关闭其它 JobPilot 浏览器窗口后重试。';
  }
  if (lower.includes('timeout') || lower.includes('navigation')) {
    return '打开 BOSS 页面超时，请检查网络后重试。';
  }

  return '操作失败，请稍后重试。';
}
