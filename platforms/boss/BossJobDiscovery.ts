import type { CdpEvent } from '../../automation/cdp/RawCDPClient';
import type { ChromeCDPManager } from '../../automation/cdp/ChromeCDPManager';
import type { Job, JobSearchResult, JobSearchStatus } from '../../core/matching';
import type { RunMode } from '../../shared/enums';
import { logger } from '../../electron/main/logger';
import { BossCityResolver } from './BossCityResolver';
import { mapBossJoblist, readBossHasMore } from './BossJobMapper';

/** BOSS joblist API 路径（当前真实搜索页面使用的路径）。 */
export const BOSS_JOBLIST_PATH = '/wapi/zpgeek/search/joblist.json';

/** 第一批等待超时（保持 V0.3-A 语义）。 */
const SEARCH_TIMEOUT_MS = 30_000;

/**
 * C1 搜索循环时序（模块级可调对象，测试可覆盖以加速；非用户配置）。
 * - firstBatchTimeoutMs：等待首批响应
 * - totalTimeoutMs：整个搜索总超时（含多批）
 * - scrollWaitMs：每次滚动后等待本批响应
 * - scrollAttempts：每批最多滚动次数（连续滚动无新响应即停止）
 */
export const discoveryTiming = {
  firstBatchTimeoutMs: SEARCH_TIMEOUT_MS,
  totalTimeoutMs: 90_000,
  scrollWaitMs: 5_000,
  scrollAttempts: 2,
};

/** C1 保守默认值与上限。 */
export const DISCOVERY_DEFAULTS = { maxJobs: 50, maxBatches: 4 } as const;
const MAX_JOBS_CAP = 200;
const MAX_BATCHES_CAP = 20;

/** 滚动脚本：简单向下滚动以触发页面自身无限滚动（非 stealth，不模拟轨迹）。 */
const SCROLL_JS = `window.scrollBy(0, window.innerHeight * 3); true`;

/** BOSS 风控/限流码与 message 关键字（码表随平台策略变化，关键字兜底）。 */
const RESTRICTED_CODES = [31, 37];
const RESTRICTED_MESSAGE_KEYWORDS = ['环境存在异常', '访问频繁', '操作频繁', '安全校验', '滑块', '验证'];

/** joblist 响应识别：URL 是否命中 BOSS joblist 路径。 */
export function isBossJoblistUrl(url: string): boolean {
  return url.includes(BOSS_JOBLIST_PATH);
}

/** 安全构造 BOSS 搜索 URL。 */
export function buildBossSearchUrl(keyword: string, cityCode: string): string {
  const params = new URLSearchParams({ query: keyword.trim(), city: cityCode, page: '1' });
  return `https://www.zhipin.com/web/geek/job?${params.toString()}`;
}

/** 解码 Network.getResponseBody 结果（处理 base64Encoded）。 */
export function decodeResponseBody(result: { body?: unknown; base64Encoded?: unknown }): string | null {
  if (typeof result.body !== 'string') return null;
  if (result.base64Encoded === true) {
    try {
      return Buffer.from(result.body, 'base64').toString('utf8');
    } catch {
      return null;
    }
  }
  return result.body;
}

/** BOSS 响应分类结果。 */
export interface BossResponseClass {
  status: 'SUCCESS' | 'SECURITY_RESTRICTED' | 'LOGIN_EXPIRED' | 'INVALID_RESPONSE';
  code: number;
  message?: string;
}

export function classifyBossResponse(data: unknown): BossResponseClass {
  if (!data || typeof data !== 'object') {
    return { status: 'INVALID_RESPONSE', code: -1, message: '响应不是 JSON 对象' };
  }
  const rawCode = (data as { code?: unknown }).code;
  const message = String((data as { message?: unknown }).message ?? '');
  const code = typeof rawCode === 'number' ? rawCode : NaN;

  if (code === 0) return { status: 'SUCCESS', code: 0 };

  if (RESTRICTED_CODES.includes(code) || RESTRICTED_MESSAGE_KEYWORDS.some((k) => message.includes(k))) {
    return { status: 'SECURITY_RESTRICTED', code, message: message || '平台安全限制' };
  }
  if (/登录|未登录|失效|过期|login/i.test(message)) {
    return { status: 'LOGIN_EXPIRED', code, message: message || '登录状态异常' };
  }
  return { status: 'INVALID_RESPONSE', code, message: message || `未知响应 code=${code}` };
}

/** 将底层异常映射为搜索结果状态（CDP 断连 vs 其它错误）。 */
export function classifyDiscoveryError(err: unknown): JobSearchStatus {
  const message = err instanceof Error ? err.message : String(err);
  return /websocket|cdp|未连接|已关闭|disconnected/i.test(message) ? 'CDP_DISCONNECTED' : 'INVALID_RESPONSE';
}

/** 事件驱动捕获所需的 CDP session 最小接口（可注入 fake 用于测试）。 */
export interface JoblistCdpSession {
  send(method: string, params: Record<string, unknown>): Promise<unknown>;
  onEvent(handler: (ev: CdpEvent) => void): () => void;
}

/**
 * 被动捕获页面自身产生的第一批 joblist 响应。
 * 硬约束：只接受与当前搜索 target 绑定的 sessionId 事件；requestId 只消费一次；
 * 完成后（成功/失败/超时）自动解除监听。
 */
export class JoblistCapture {
  private timer: NodeJS.Timeout | null = null;
  private unsub: (() => void) | null = null;

  constructor(
    private readonly session: JoblistCdpSession,
    private readonly sessionId: string,
  ) {}

  /** 等待第一个完整 joblist 响应并解析 JSON；超时返回 null。 */
  waitFirst(timeoutMs: number): Promise<unknown> {
    const tracked = new Set<string>();
    const consumed = new Set<string>();
    let settled = false;

    return new Promise<unknown>((resolve, reject) => {
      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
        if (this.unsub) this.unsub();
        this.unsub = null;
        fn();
      };

      this.timer = setTimeout(() => settle(() => resolve(null)), timeoutMs);

      this.unsub = this.session.onEvent((ev) => {
        if (ev.sessionId !== this.sessionId) return;

        if (ev.method === 'Network.responseReceived') {
          const requestId = ev.params?.requestId;
          const response = ev.params?.response as { url?: unknown; mimeType?: unknown } | undefined;
          const url = typeof response?.url === 'string' ? response.url : '';
          const mimeType = typeof response?.mimeType === 'string' ? response.mimeType : '';
          if (
            typeof requestId === 'string' &&
            isBossJoblistUrl(url) &&
            (mimeType === '' || mimeType.includes('json'))
          ) {
            tracked.add(requestId);
          }
        } else if (ev.method === 'Network.loadingFinished') {
          const requestId = ev.params?.requestId;
          if (typeof requestId === 'string' && tracked.has(requestId) && !consumed.has(requestId)) {
            consumed.add(requestId);
            void this.session
              .send('Network.getResponseBody', { requestId })
              .then((result) => {
                const body = decodeResponseBody(result as { body?: unknown; base64Encoded?: unknown });
                if (body === null) {
                  settle(() => reject(new Error('响应体解码失败')));
                  return;
                }
                try {
                  settle(() => resolve(JSON.parse(body)));
                } catch (err) {
                  settle(() => reject(err instanceof Error ? err : new Error('响应 JSON 解析失败')));
                }
              })
              .catch((err) => settle(() => reject(err instanceof Error ? err : new Error(String(err)))));
          }
        }
      });
    });
  }
}

/**
 * 多批 joblist 被动捕获（C1）：监听持续到 dispose，每次完成一个完整 joblist 响应即入队，
 * waitNext 按顺序取下一批。请求只消费一次；CDP 失败会拒绝后续 waitNext；
 * dispose 后不再处理事件并解除监听。
 */
export class JoblistStream {
  private readonly queue: unknown[] = [];
  private readonly waiters: Array<{
    resolve: (v: unknown) => void;
    reject: (e: unknown) => void;
    timer: NodeJS.Timeout;
  }> = [];
  private readonly tracked = new Set<string>();
  private readonly consumed = new Set<string>();
  private unsub: (() => void) | null = null;
  private disposed = false;
  private lastError: unknown;

  constructor(
    private readonly session: JoblistCdpSession,
    private readonly sessionId: string,
  ) {
    this.unsub = session.onEvent((ev) => this.handle(ev));
  }

  private handle(ev: CdpEvent): void {
    if (this.disposed || ev.sessionId !== this.sessionId) return;

    if (ev.method === 'Network.responseReceived') {
      const requestId = ev.params?.requestId;
      const response = ev.params?.response as { url?: unknown; mimeType?: unknown } | undefined;
      const url = typeof response?.url === 'string' ? response.url : '';
      const mimeType = typeof response?.mimeType === 'string' ? response.mimeType : '';
      if (
        typeof requestId === 'string' &&
        isBossJoblistUrl(url) &&
        (mimeType === '' || mimeType.includes('json'))
      ) {
        this.tracked.add(requestId);
      }
    } else if (ev.method === 'Network.loadingFinished') {
      const requestId = ev.params?.requestId;
      if (typeof requestId === 'string' && this.tracked.has(requestId) && !this.consumed.has(requestId)) {
        this.consumed.add(requestId);
        void this.session
          .send('Network.getResponseBody', { requestId })
          .then((result) => {
            const body = decodeResponseBody(result as { body?: unknown; base64Encoded?: unknown });
            if (body === null) {
              this.fail(new Error('响应体解码失败'));
              return;
            }
            try {
              this.push(JSON.parse(body));
            } catch (err) {
              this.fail(err instanceof Error ? err : new Error('响应 JSON 解析失败'));
            }
          })
          .catch((err) => this.fail(err instanceof Error ? err : new Error(String(err))));
      }
    }
  }

  private push(payload: unknown): void {
    if (this.disposed) return;
    const waiter = this.waiters.shift();
    if (waiter) {
      clearTimeout(waiter.timer);
      waiter.resolve(payload);
    } else {
      this.queue.push(payload);
    }
  }

  private fail(err: unknown): void {
    if (this.disposed) return;
    this.lastError = err;
    this.queue.length = 0;
    const waiters = this.waiters.splice(0);
    for (const w of waiters) {
      clearTimeout(w.timer);
      w.reject(err);
    }
  }

  /** 等待下一批完整 joblist 响应；超时返回 null；已有排队数据立即返回。 */
  waitNext(timeoutMs: number): Promise<unknown> {
    if (this.lastError !== undefined) return Promise.reject(this.lastError);
    const queued = this.queue.shift();
    if (queued !== undefined) return Promise.resolve(queued);

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.waiters.findIndex((w) => w.timer === timer);
        if (idx >= 0) this.waiters.splice(idx, 1);
        resolve(null);
      }, timeoutMs);
      this.waiters.push({ resolve, reject, timer });
    });
  }

  /** 停止监听并清理（搜索结束后必须调用，避免 listener 泄漏）。 */
  dispose(): void {
    this.disposed = true;
    if (this.unsub) {
      this.unsub();
      this.unsub = null;
    }
    this.queue.length = 0;
    const waiters = this.waiters.splice(0);
    for (const w of waiters) {
      clearTimeout(w.timer);
      w.resolve(null);
    }
  }
}

/** 岗位去重键：优先稳定平台岗位 ID（encryptJobId），缺失时退化为本地 id（lid）。 */
export function jobDedupeKey(job: Job): string {
  return job.platformJobId && job.platformJobId.length > 0 ? `p:${job.platformJobId}` : `id:${job.id}`;
}

function accumulateBatch(raw: unknown, jobs: Job[], seen: Set<string>): void {
  for (const job of mapBossJoblist(raw)) {
    const key = jobDedupeKey(job);
    if (seen.has(key)) continue;
    seen.add(key);
    jobs.push(job);
  }
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/** 滚动触发页面自身加载并等待本批响应；连续滚动仍无新响应返回 null。 */
async function scrollAndWait(
  stream: JoblistStream,
  session: JoblistCdpSession,
  remainingMs: number,
): Promise<unknown> {
  const attempts = discoveryTiming.scrollAttempts;
  // 每次滚动后最多等 scrollWaitMs（受剩余总预算约束），避免单个批次挂到搜索总超时。
  const perAttempt = Math.max(1, Math.min(discoveryTiming.scrollWaitMs, Math.ceil(remainingMs / attempts)));
  for (let i = 0; i < attempts; i++) {
    await session.send('Runtime.evaluate', { expression: SCROLL_JS, returnByValue: true });
    const raw = await stream.waitNext(perAttempt);
    if (raw !== null) return raw;
  }
  return null;
}

/** BOSS 岗位发现（V0.3-A：一次搜索 → 第一批真实岗位；V0.3-C1：多批累积 + 去重）。 */
export class BossJobDiscovery {
  constructor(
    private readonly cdp: ChromeCDPManager,
    private readonly resolver = new BossCityResolver(),
  ) {}

  async searchJobs(
    runMode: RunMode,
    keyword: string,
    city: string,
    options?: { maxJobs?: number; maxBatches?: number },
  ): Promise<JobSearchResult> {
    const kw = keyword.trim();
    if (!kw) throw new Error('搜索关键词不能为空');

    const cityCode = this.resolver.resolve(city);
    if (!cityCode) {
      return { status: 'UNSUPPORTED_CITY', jobs: [], message: `不支持的城市：${city}` };
    }

    const maxJobs = clampInt(options?.maxJobs ?? DISCOVERY_DEFAULTS.maxJobs, 1, MAX_JOBS_CAP);
    const maxBatches = clampInt(options?.maxBatches ?? DISCOVERY_DEFAULTS.maxBatches, 1, MAX_BATCHES_CAP);
    logger.info('boss-search', `keyword=${kw} city=${city} code=${cityCode} maxJobs=${maxJobs} maxBatches=${maxBatches}`);

    let stream: JoblistStream | null = null;
    try {
      const { sessionId } = await this.cdp.ensureBossTarget(runMode);
      const client = await this.cdp.connect(runMode);

      // Network.enable 必须在 Page.navigate 之前，避免漏掉首个搜索请求。
      await client.send('Network.enable', {}, sessionId);

      const url = buildBossSearchUrl(kw, cityCode);
      logger.info('boss-search', `url=${url}`);

      const session: JoblistCdpSession = {
        send: (method, params) => client.send(method, params, sessionId),
        onEvent: (handler) => client.onEvent(handler),
      };

      stream = new JoblistStream(session, sessionId);
      await client.send('Page.navigate', { url }, sessionId);

      const seen = new Set<string>();
      const jobs: Job[] = [];
      const deadline = Date.now() + discoveryTiming.totalTimeoutMs;

      // 第一批（保持 V0.3-A 语义：等待首个完整 joblist 响应）。
      const first = await stream.waitNext(discoveryTiming.firstBatchTimeoutMs);
      if (first === null) {
        logger.info('boss-search', 'timeout (first batch)');
        return {
          status: 'SEARCH_TIMEOUT',
          jobs: [],
          batchesLoaded: 0,
          hasMore: true,
          message: '等待岗位响应超时（可能未登录或平台未返回数据）',
        };
      }
      const firstClass = classifyBossResponse(first);
      logger.info('boss-search', `first batch code=${firstClass.code}`);
      if (firstClass.status !== 'SUCCESS') {
        return {
          status: firstClass.status,
          jobs: [],
          batchesLoaded: 1,
          hasMore: false,
          message: firstClass.message,
        };
      }
      accumulateBatch(first, jobs, seen);
      let batchesLoaded = 1;
      let hasMore = readBossHasMore(first);
      logger.info('boss-search', `batch 1 total=${jobs.length} hasMore=${hasMore}`);

      // 后续批次：滚动触发页面自身加载，捕获下一批 joblist response；满足任一停止条件即退出。
      while (hasMore && jobs.length < maxJobs && batchesLoaded < maxBatches) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;

        const raw = await scrollAndWait(stream, session, remaining);
        if (raw === null) {
          logger.info('boss-search', 'no new batch after scroll');
          break;
        }
        const cls = classifyBossResponse(raw);
        if (cls.status !== 'SUCCESS') {
          logger.info('boss-search', `batch ${batchesLoaded + 1} ${cls.status}`);
          return { status: cls.status, jobs, batchesLoaded, hasMore, message: cls.message };
        }
        accumulateBatch(raw, jobs, seen);
        batchesLoaded += 1;
        hasMore = readBossHasMore(raw);
        logger.info('boss-search', `batch ${batchesLoaded} total=${jobs.length} hasMore=${hasMore}`);
      }

      return { status: 'SUCCESS', jobs, batchesLoaded, hasMore };
    } catch (err) {
      const status = classifyDiscoveryError(err);
      logger.error('boss-search', status);
      return {
        status,
        jobs: [],
        message: status === 'CDP_DISCONNECTED' ? '浏览器连接已断开，请重试' : `搜索失败：${err instanceof Error ? err.message : String(err)}`,
      };
    } finally {
      stream?.dispose();
    }
  }
}
