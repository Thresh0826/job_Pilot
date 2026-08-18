import { chromium, type BrowserContext, type Page } from 'playwright-core';
import path from 'node:path';
import { getDataDir } from '../../database/database';
import { logger } from '../../electron/main/logger';

/**
 * JobPilot 浏览器生命周期管理器。
 * - 使用 Playwright 内置 Chromium 的 persistent context，登录态由 Profile 自身持久化。
 *   （最小变量实验：由原 channel:"msedge" 改为 Chromium，验证 BOSS 风控是否与 Edge 相关。）
 * - 同一时间只允许一个 context 实例（单例），避免同一 Profile 被重复占用。
 * - 用户手动关闭浏览器窗口后，通过 close / disconnected 事件复位状态，允许重新连接。
 * - 仅记录导航/事件日志，不修改任何自动化指纹（不做反检测）。
 */
let context: BrowserContext | null = null;
let tracePath: string | null = null;

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function isConnected(ctx: BrowserContext): boolean {
  try {
    const browser = ctx.browser();
    return browser != null && browser.isConnected();
  } catch {
    return false;
  }
}

function attachPageLogging(page: Page, index: number): void {
  logger.info('browser', `[PAGE ${index}] 打开 url=${page.url()}`);

  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      logger.info('browser', `[NAV] ${frame.url()}`);
    }
  });

  page.on('console', (msg) => {
    logger.info('browser', `[PAGE CONSOLE ${msg.type()}] ${truncate(msg.text(), 250)}`);
  });

  page.on('pageerror', (err) => {
    logger.error('browser', `[PAGE ERROR] ${err.message}`);
  });

  page.on('requestfailed', (req) => {
    logger.warn('browser', `[REQUEST FAILED] ${req.url()} ${req.failure()?.errorText ?? ''}`);
  });

  page.on('close', () => {
    logger.info('browser', `[PAGE ${index}] 已关闭`);
  });
}

/** 返回当前可用的 BrowserContext；已关闭则返回 null。 */
export function getContext(): BrowserContext | null {
  if (context && isConnected(context)) return context;
  return null;
}

export function isRunning(): boolean {
  return getContext() !== null;
}

/** 启动（或复用）指定 Profile 的 persistent context。 */
export async function launch(profileDir: string): Promise<BrowserContext> {
  const existing = getContext();
  if (existing) return existing;

  logger.info('browser', `启动浏览器 profile=${profileDir}`);
  const ctx = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: null,
  });

  context = ctx;
  tracePath = path.join(getDataDir(), 'logs', `trace-${Date.now()}.zip`);
  try {
    await ctx.tracing.start({ snapshots: true, screenshots: false, sources: true });
  } catch (err) {
    logger.warn('browser', `trace 启动失败: ${err instanceof Error ? err.message : String(err)}`);
  }

  ctx.on('close', () => {
    logger.info('browser', '浏览器已关闭');
    if (context === ctx) context = null;
  });
  ctx.browser()?.on('disconnected', () => {
    logger.info('browser', '浏览器已断开');
    if (context === ctx) context = null;
  });

  let pageIndex = 0;
  ctx.on('page', (page) => attachPageLogging(page, pageIndex++));
  for (const page of ctx.pages()) attachPageLogging(page, pageIndex++);

  return ctx;
}

/** 关闭当前 context；不删除 Profile 数据。 */
export async function close(): Promise<void> {
  if (!context) return;

  const ctx = context;
  context = null;

  if (tracePath) {
    const pathToSave = tracePath;
    tracePath = null;
    try {
      await ctx.tracing.stop({ path: pathToSave });
      logger.info('browser', `trace 已保存: ${pathToSave}`);
    } catch {
      // trace 可能因浏览器提前断开而无法落盘，忽略。
    }
  }

  try {
    await ctx.close();
  } catch {
    // 浏览器可能已被用户手动关闭，忽略。
  }
}
