import type { ChromeCDPManager } from '../../automation/cdp/ChromeCDPManager';
import type { PlatformAdapter, ApplyResult, SendMessageResult } from '../base/PlatformAdapter';
import type { Job, JobDetailResult, JobSearchQuery, JobSearchResult } from '../../core/matching';
import type { Message } from '../../core/messaging';
import type { RunMode } from '../../shared/enums';
import { getBossPlatformStatus } from '../../database/repositories/settingsRepository';
import { logger } from '../../electron/main/logger';
import { BossJobDiscovery } from './BossJobDiscovery';
import { BossJobDetail } from './BossJobDetail';

const NOT_IMPLEMENTED = '该能力尚未实现。';

/** BOSS直聘登录入口页（连接流程仅主动导航一次）。 */
const BOSS_LOGIN_URL = 'https://www.zhipin.com/web/user/';

/** 未登录 / 安全校验 URL 特征。 */
const LOGIN_URL_PATTERNS = [
  '/web/user/',
  '/login',
  '/web/common/security-check',
  '/campus/user',
  'login.zhipin.com',
];

/** 已登录（求职端会员区）URL 特征。 */
const MEMBER_URL_PATTERNS = ['/web/geek/'];

export type BossLoginState = 'CONNECTED' | 'DISCONNECTED' | 'UNKNOWN';

function isLoginOrSecurityUrl(url: string): boolean {
  return LOGIN_URL_PATTERNS.some((p) => url.includes(p));
}

function isMemberUrl(url: string): boolean {
  return MEMBER_URL_PATTERNS.some((p) => url.includes(p));
}

function isPublicHomeUrl(url: string): boolean {
  const normalized = url.toLowerCase().replace(/\/+$/, '');
  return normalized === 'https://www.zhipin.com';
}

/**
 * BOSS直聘适配器（Raw CDP）。
 * V0.3-A：登录连接 / 登录状态检查 / 首批岗位搜索。
 */
export class BossAdapter implements PlatformAdapter {
  readonly platform = 'BOSS' as const;

  private readonly discovery: BossJobDiscovery;
  private readonly jobDetail: BossJobDetail;

  constructor(
    private readonly cdp: ChromeCDPManager,
    private readonly runModeProvider: () => RunMode,
    discovery?: BossJobDiscovery,
  ) {
    this.discovery = discovery ?? new BossJobDiscovery(cdp);
    this.jobDetail = new BossJobDetail(cdp);
  }

  /** 连接：确保专用 Chrome + BOSS target（复用或创建），导航一次到登录页。 */
  async openLogin(runMode: RunMode): Promise<void> {
    const { sessionId } = await this.cdp.ensureBossTarget(runMode);
    await this.cdp.navigate(sessionId, BOSS_LOGIN_URL);
  }

  /**
   * 只读登录检测：不导航、不创建页面、不修改 Cookie。
   * 通过 Target.getTargets 读取 zhipin.com target 的 URL 判断。
   */
  async checkLoginStatus(runMode: RunMode): Promise<BossLoginState> {
    const targets = await this.cdp.getPageTargets(runMode);
    if (targets.length === 0) return 'UNKNOWN';

    let sawNotLoggedIn = false;
    for (const target of targets) {
      const url = target.url.toLowerCase();
      if (url === '' || url === 'about:blank') continue;
      if (isMemberUrl(url)) return 'CONNECTED';
      if (isLoginOrSecurityUrl(url) || isPublicHomeUrl(url)) sawNotLoggedIn = true;
    }

    logger.info('boss', `login status ${sawNotLoggedIn ? 'DISCONNECTED' : 'UNKNOWN'}`);
    return sawNotLoggedIn ? 'DISCONNECTED' : 'UNKNOWN';
  }

  /** V0.3-A：一次搜索 → 第一批真实岗位（搜索前只读检查平台状态）。 */
  async searchJobs(query: JobSearchQuery): Promise<JobSearchResult> {
    const runMode = this.runModeProvider();

    const state = await this.checkLoginStatus(runMode);
    if (state === 'DISCONNECTED') {
      const prev = getBossPlatformStatus().status;
      const expired = prev === 'CONNECTED' || prev === 'EXPIRED';
      return expired
        ? { status: 'LOGIN_EXPIRED', jobs: [], message: '登录已失效，请重新登录后重试。' }
        : { status: 'NOT_CONNECTED', jobs: [], message: '尚未连接 BOSS，请先连接后重试。' };
    }

    return this.discovery.searchJobs(runMode, query.keyword, query.city, {
      maxJobs: query.maxJobs,
      maxBatches: query.maxBatches,
    });
  }

  /** V0.3-B：单个岗位详情读取（独立详情 tab，不干扰搜索 target）。 */
  async getJobDetail(job: Job): Promise<JobDetailResult> {
    const runMode = this.runModeProvider();

    const state = await this.checkLoginStatus(runMode);
    if (state === 'DISCONNECTED') {
      const prev = getBossPlatformStatus().status;
      const expired = prev === 'CONNECTED' || prev === 'EXPIRED';
      return expired
        ? { status: 'LOGIN_EXPIRED', detail: null, message: '登录已失效，请重新登录后重试。' }
        : { status: 'NOT_CONNECTED', detail: null, message: '尚未连接 BOSS，请先连接后重试。' };
    }

    return this.jobDetail.readDetail(runMode, job);
  }

  // ---- 未实现能力：明确返回未支持，不伪造成功 ----
  async apply(_jobId: string, _resumeId: number): Promise<ApplyResult> {
    return { success: false, error: NOT_IMPLEMENTED };
  }

  async getMessages(): Promise<Message[]> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async sendMessage(_conversationId: string, _content: string): Promise<SendMessageResult> {
    return { success: false, error: NOT_IMPLEMENTED };
  }
}
