import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { getDataDir } from '../../database/database';
import { logger } from '../../electron/main/logger';
import { RawCDPClient } from './RawCDPClient';
import type { RunMode } from '../../shared/enums';

export interface PageTargetInfo {
  targetId: string;
  type: string;
  url: string;
  title?: string;
}

interface ChromeInstance {
  pid: number;
  port: number;
  profileDir: string;
  runMode: RunMode;
  client: RawCDPClient | null;
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

async function waitForCdp(port: number, timeoutMs = 20_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return;
    } catch {
      // 尚未就绪
    }
    await sleep(300);
  }
  throw new Error(`CDP 端口 ${port} 未就绪`);
}

async function getVersion(port: number): Promise<{ webSocketDebuggerUrl: string }> {
  const res = await fetch(`http://127.0.0.1:${port}/json/version`);
  if (!res.ok) throw new Error(`CDP /json/version 失败: ${res.status}`);
  return (await res.json()) as { webSocketDebuggerUrl: string };
}

/** 查找命令行中包含指定 profile 的 chrome.exe 进程（用于识别并复用本模式专用 Chrome）。 */
function findRunningChrome(profileDir: string): { pid: number; port: number } | null {
  try {
    const safeProfile = profileDir.replace(/'/g, "''");
    const ps =
      `$p='${safeProfile}'; Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" ` +
      `| Where-Object { $_.CommandLine -and $_.CommandLine.Contains($p) } ` +
      `| ForEach-Object { "$($_.ProcessId)|$($_.CommandLine)" }`;
    const out = execFileSync('powershell', ['-NoProfile', '-Command', ps], {
      encoding: 'utf8',
      timeout: 10_000,
    });
    for (const line of out.split('\n')) {
      const m = line.trim().match(/^(\d+)\|(.*)$/);
      if (!m) continue;
      const portMatch = m[2].match(/--remote-debugging-port=(\d+)/);
      if (portMatch) return { pid: Number(m[1]), port: Number(portMatch[1]) };
    }
    return null;
  } catch {
    return null;
  }
}

/** 关闭浏览器后等待文件句柄释放，再删除目录（初始等待 + 长重试）。 */
async function removeDirWithRetry(dir: string): Promise<void> {
  await sleep(1000);

  let lastError: unknown;
  for (let i = 0; i < 20; i++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch (err) {
      lastError = err;
      await sleep(500);
    }
  }
  throw lastError;
}

/**
 * 真实 Google Chrome + Raw CDP 的浏览器驱动管理器。
 * 职责：定位 Chrome、独立 Profile、TEST/PRODUCTION 隔离、可用端口、启动/等待 CDP、
 * 连接 RawCDPClient、target/page session、close、profile clear。
 */
export class ChromeCDPManager {
  private instance: ChromeInstance | null = null;

  getProfileDir(runMode: RunMode): string {
    const mode = runMode === 'PRODUCTION' ? 'production' : 'test';
    return path.join(getDataDir(), 'browser', mode, 'boss');
  }

  findChrome(): string {
    const candidates = [
      path.join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env.PROGRAMFILES ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return candidate;
    }
    throw new Error('未找到 Google Chrome');
  }

  async findAvailablePort(base = 9223, attempts = 20): Promise<number> {
    for (let port = base; port < base + attempts; port++) {
      if (await isPortFree(port)) return port;
    }
    throw new Error('找不到可用 CDP 端口');
  }

  isRunning(runMode: RunMode): boolean {
    const inst = this.instance;
    return (
      inst !== null &&
      inst.runMode === runMode &&
      inst.profileDir === this.getProfileDir(runMode) &&
      processAlive(inst.pid)
    );
  }

  isActive(): boolean {
    return this.instance !== null && processAlive(this.instance.pid);
  }

  /** 确保当前模式的专用 Chrome 已启动（复用或新建）。 */
  async ensureChrome(runMode: RunMode): Promise<ChromeInstance> {
    if (this.instance && this.instance.runMode !== runMode) {
      await this.close(this.instance.runMode);
    }
    if (this.isRunning(runMode) && this.instance) return this.instance;

    const profileDir = this.getProfileDir(runMode);

    const leftover = findRunningChrome(profileDir);
    if (leftover) {
      this.instance = { pid: leftover.pid, port: leftover.port, profileDir, runMode, client: null };
      logger.info('chrome', `复用已有 Chrome pid=${leftover.pid} port=${leftover.port}`);
      return this.instance;
    }

    const chromePath = this.findChrome();
    const port = await this.findAvailablePort();
    fs.mkdirSync(profileDir, { recursive: true });

    const args = [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-allow-origins=*',
    ];

    const child = spawn(chromePath, args, { detached: true, stdio: 'ignore' });
    child.unref();
    const pid = child.pid;
    if (!pid) throw new Error('Chrome 启动失败（未取得 pid）');

    const inst: ChromeInstance = { pid, port, profileDir, runMode, client: null };
    this.instance = inst;
    child.on('exit', () => {
      if (this.instance?.pid === pid) {
        this.instance = null;
        logger.info('chrome', `exited pid=${pid}`);
      }
    });

    logger.info('chrome', `launch pid=${pid} port=${port} profile=${profileDir}`);
    await waitForCdp(port);
    return inst;
  }

  /** 连接（或复用）当前模式 Chrome 的 Browser-level WebSocket。 */
  async connect(runMode: RunMode): Promise<RawCDPClient> {
    const inst = await this.ensureChrome(runMode);
    if (inst.client && !inst.client.isClosed) return inst.client;

    const version = await getVersion(inst.port);
    const client = new RawCDPClient(version.webSocketDebuggerUrl);
    await client.connect();
    client.onClose(() => {
      if (this.instance === inst) {
        this.instance = null;
        logger.info('cdp', 'disconnected');
      }
    });
    inst.client = client;
    return client;
  }

  async getPageTargets(runMode: RunMode): Promise<PageTargetInfo[]> {
    const client = await this.connect(runMode);
    const res = (await client.send('Target.getTargets')) as { targetInfos?: PageTargetInfo[] };
    return (res.targetInfos ?? []).filter((t) => t.type === 'page');
  }

  /** 寻找现有 zhipin.com target；没有则创建前台 target。返回已 attach 的 sessionId。 */
  async ensureBossTarget(runMode: RunMode): Promise<{ targetId: string; sessionId: string }> {
    const client = await this.connect(runMode);
    const targets = await this.getPageTargets(runMode);
    const existing = findBossTarget(targets);

    let targetId: string;
    if (existing) {
      logger.info('cdp', `target selected ${existing.targetId}`);
      targetId = existing.targetId;
    } else {
      const created = (await client.send('Target.createTarget', {
        url: 'about:blank',
        newWindow: false,
      })) as { targetId: string };
      targetId = created.targetId;
      logger.info('cdp', `target created ${targetId}`);
    }

    await client.send('Target.activateTarget', { targetId }).catch(() => {});
    const attached = (await client.send('Target.attachToTarget', { targetId, flatten: true })) as {
      sessionId: string;
    };
    return { targetId, sessionId: attached.sessionId };
  }

  async navigate(sessionId: string, url: string): Promise<void> {
    const client = this.instance?.client;
    if (!client || client.isClosed) throw new Error('CDP 未连接');
    await client.send('Page.navigate', { url }, sessionId);
    logger.info('cdp', `navigate ${url}`);
  }

  /** 关闭当前模式的专用 Chrome（只关闭本模式实例，不碰用户普通 Chrome）。 */
  async close(runMode: RunMode): Promise<void> {
    const inst = this.instance;
    if (!inst || inst.runMode !== runMode) return;
    this.instance = null;

    try {
      inst.client?.close();
    } catch {
      // 忽略
    }

    if (processAlive(inst.pid)) {
      try {
        execFileSync('taskkill', ['/pid', String(inst.pid), '/F'], { stdio: 'ignore' });
        logger.info('chrome', `closed pid=${inst.pid}`);
      } catch (err) {
        logger.error('chrome', `close 失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  async closeActive(): Promise<void> {
    if (this.instance) await this.close(this.instance.runMode);
  }

  /** 删除当前模式 BOSS Profile（带重试）。 */
  async clearProfile(runMode: RunMode): Promise<void> {
    await removeDirWithRetry(this.getProfileDir(runMode));
    logger.info('chrome', `profile cleared ${this.getProfileDir(runMode)}`);
  }
}

/** 从 page targets 中挑选现有 zhipin.com target（优先复用）。 */
export function findBossTarget(targets: PageTargetInfo[]): PageTargetInfo | null {
  return targets.find((t) => t.type === 'page' && t.url.includes('zhipin.com')) ?? null;
}

/** 全局单例。 */
export const chromeCDP = new ChromeCDPManager();
