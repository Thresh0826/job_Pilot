import type { ChromeCDPManager } from '../../automation/cdp/ChromeCDPManager';
import type { Job, JobDetailResult } from '../../core/matching';
import type { RunMode } from '../../shared/enums';
import { logger } from '../../electron/main/logger';
import { mapBossJobDetail, resolveJobDetailUrl, type ExtractedBossDetail } from './BossJobDetailMapper';

const DETAIL_TIMEOUT_MS = 25_000;
const DETAIL_POLL_MS = 700;
const MIN_JD_LENGTH = 30;

/** 详情页就绪检查（返回 JSON：是否出现职位描述 / 登录截断 / 安全验证）。 */
const CHECK_READY_JS = `(() => {
  const t = document.body ? document.body.innerText : '';
  const u = location.href;
  return JSON.stringify({
    hasDesc: t.indexOf('职位描述') !== -1,
    loginRequired: t.indexOf('登录查看完整内容') !== -1,
    security: u.indexOf('/web/common/security-check') !== -1 || /安全校验|访问频繁|滑块|验证/.test(t),
    url: u
  });
})()`;

/** 提取职位描述 + 标签（selectors 为 best-effort，首次真机运行后校准）。 */
const EXTRACT_DETAIL_JS = `(() => {
  const pageText = document.body ? document.body.innerText : '';
  let jd = '';
  const sections = document.querySelectorAll('.job-detail-section, .job-sec');
  for (let i = 0; i < sections.length; i++) {
    const text = (sections[i].innerText || '').trim();
    if (text.indexOf('职位描述') !== -1 && text.length > jd.length) {
      jd = text;
    }
  }
  const tags = [];
  document.querySelectorAll('.job-tags .tag-all span, .job-keyword-list span').forEach((el) => {
    const t = (el.innerText || '').trim();
    if (t) tags.push(t);
  });
  return JSON.stringify({ jd: jd, pageText: pageText.substring(0, 12000), tags: tags, url: location.href });
})()`;

type ReadyState = 'READY' | 'TIMEOUT' | 'LOGIN' | 'SECURITY';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 详情读取所需的 CDP client 最小接口（可注入 fake 测试）。 */
export interface DetailCdpClient {
  send(method: string, params: Record<string, unknown>, sessionId?: string): Promise<unknown>;
}

/**
 * BOSS 单个岗位详情读取。
 * 使用受管的「详情 tab」（ChromeCDPManager.ensureDetailTarget），复用不关闭，
 * 不干扰搜索 target，也不产生每次查看新建/关闭 tab 的闪动。
 */
export class BossJobDetail {
  constructor(private readonly cdp: ChromeCDPManager) {}

  async readDetail(runMode: RunMode, job: Job): Promise<JobDetailResult> {
    const client = await this.cdp.connect(runMode);
    const { sessionId } = await this.cdp.ensureDetailTarget(runMode);
    return this.readDetailWithClient(client, sessionId, job);
  }

  /** 可注入 fake client 测试。 */
  async readDetailWithClient(
    client: DetailCdpClient,
    sessionId: string,
    job: Job,
    timeoutMs: number = DETAIL_TIMEOUT_MS,
  ): Promise<JobDetailResult> {
    const url = resolveJobDetailUrl(job);
    if (!url) {
      return { status: 'DETAIL_PARSE_FAILED', detail: null, message: '缺少岗位详情地址' };
    }

    try {
      logger.info('boss-detail', `navigate ${url}`);
      await client.send('Page.navigate', { url }, sessionId);

      const ready = await this.waitReady(client, sessionId, timeoutMs);
      if (ready === 'LOGIN') {
        return { status: 'LOGIN_EXPIRED', detail: null, message: '详情需登录后查看，请重新登录' };
      }
      if (ready === 'SECURITY') {
        return { status: 'SECURITY_RESTRICTED', detail: null, message: '平台安全验证，请人工处理' };
      }
      if (ready === 'TIMEOUT') {
        return { status: 'DETAIL_TIMEOUT', detail: null, message: '岗位详情加载超时' };
      }

      const extracted = await this.extract(client, sessionId);
      if (!extracted || !extracted.jd || extracted.jd.length < MIN_JD_LENGTH) {
        return { status: 'DETAIL_PARSE_FAILED', detail: null, message: '未能提取职位描述（页面结构可能变化）' };
      }

      const detail = mapBossJobDetail(job, extracted);
      logger.info('boss-detail', `jd length=${detail.jdText?.length ?? 0}`);
      return { status: 'SUCCESS', detail };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/websocket|cdp|未连接|已关闭|disconnected/i.test(message)) {
        return { status: 'CDP_DISCONNECTED', detail: null, message: '浏览器连接已断开' };
      }
      logger.error('boss-detail', message);
      return { status: 'DETAIL_PARSE_FAILED', detail: null, message: '详情读取失败' };
    }
  }

  private async waitReady(
    client: DetailCdpClient,
    sessionId: string,
    timeoutMs: number,
  ): Promise<ReadyState> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const value = await client.send(
          'Runtime.evaluate',
          { expression: CHECK_READY_JS, returnByValue: true },
          sessionId,
        );
        const raw = (value as { result?: { value?: unknown } }).result?.value;
        if (typeof raw === 'string') {
          const state = JSON.parse(raw) as { hasDesc: boolean; loginRequired: boolean; security: boolean };
          if (state.loginRequired) return 'LOGIN';
          if (state.security) return 'SECURITY';
          if (state.hasDesc) return 'READY';
        }
      } catch {
        // 页面可能仍在加载，继续等待
      }
      await sleep(DETAIL_POLL_MS);
    }
    return 'TIMEOUT';
  }

  private async extract(client: DetailCdpClient, sessionId: string): Promise<ExtractedBossDetail | null> {
    const value = await client.send(
      'Runtime.evaluate',
      { expression: EXTRACT_DETAIL_JS, returnByValue: true },
      sessionId,
    );
    const raw = (value as { result?: { value?: unknown } }).result?.value;
    if (typeof raw !== 'string') return null;
    try {
      return JSON.parse(raw) as ExtractedBossDetail;
    } catch {
      return null;
    }
  }
}
