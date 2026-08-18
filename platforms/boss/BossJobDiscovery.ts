import type { CdpEvent } from '../../automation/cdp/RawCDPClient';
import type { ChromeCDPManager } from '../../automation/cdp/ChromeCDPManager';
import type { JobSearchResult, JobSearchStatus } from '../../core/matching';
import type { RunMode } from '../../shared/enums';
import { logger } from '../../electron/main/logger';
import { BossCityResolver } from './BossCityResolver';
import { mapBossJoblist } from './BossJobMapper';

/** BOSS joblist API 路径（当前真实搜索页面使用的路径）。 */
export const BOSS_JOBLIST_PATH = '/wapi/zpgeek/search/joblist.json';

const SEARCH_TIMEOUT_MS = 30_000;

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

/** BOSS 岗位发现（V0.3-A：一次搜索 → 第一批真实岗位）。 */
export class BossJobDiscovery {
  constructor(
    private readonly cdp: ChromeCDPManager,
    private readonly resolver = new BossCityResolver(),
  ) {}

  async searchJobs(runMode: RunMode, keyword: string, city: string): Promise<JobSearchResult> {
    const kw = keyword.trim();
    if (!kw) throw new Error('搜索关键词不能为空');

    const cityCode = this.resolver.resolve(city);
    if (!cityCode) {
      return { status: 'UNSUPPORTED_CITY', jobs: [], message: `不支持的城市：${city}` };
    }

    logger.info('boss-search', `keyword=${kw} city=${city} code=${cityCode}`);

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

      const capture = new JoblistCapture(session, sessionId);
      const waitPromise = capture.waitFirst(SEARCH_TIMEOUT_MS);
      await client.send('Page.navigate', { url }, sessionId);
      const raw = await waitPromise;

      if (raw === null) {
        logger.info('boss-search', 'timeout');
        return {
          status: 'SEARCH_TIMEOUT',
          jobs: [],
          message: '等待岗位响应超时（可能未登录或平台未返回数据）',
        };
      }

      const classified = classifyBossResponse(raw);
      logger.info('boss-search', `response code=${classified.code}`);
      if (classified.status !== 'SUCCESS') {
        return { status: classified.status, jobs: [], message: classified.message };
      }

      const jobs = mapBossJoblist(raw);
      logger.info('boss-search', `jobs mapped: ${jobs.length}`);
      return { status: 'SUCCESS', jobs };
    } catch (err) {
      const status = classifyDiscoveryError(err);
      logger.error('boss-search', status);
      return {
        status,
        jobs: [],
        message: status === 'CDP_DISCONNECTED' ? '浏览器连接已断开，请重试' : `搜索失败：${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
