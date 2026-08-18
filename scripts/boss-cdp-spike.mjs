#!/usr/bin/env node
/**
 * JobPilot V0.2 — Raw CDP Feasibility Spike
 *
 * 开发诊断工具（位于 scripts/ 开发脚本范围，不进入正式业务调用链）。
 * BOSS 正式链路使用 automation/cdp/ 下的 ChromeCDPManager + RawCDPClient。
 *
 * 目标：验证「真实 Google Chrome + Raw Chrome DevTools Protocol」能否正常访问并登录
 * BOSS，而不出现当前 Playwright 环境的 about:blank 风控白屏。
 *
 * 纯变量实验：只使用最小 Chrome 启动参数，不做任何反检测。
 * 独立脚本：不依赖 playwright-core，不修改现有 V0.2 代码。
 */
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');

const CDP_PORT = 9223;
const SPIKE_DIR =
  process.env.JOBPILOT_SPIKE_DIR || path.join(PROJECT_ROOT, 'dev-data', 'spikes', 'boss-raw-cdp');
const STATE_FILE = path.join(SPIKE_DIR, '..', 'boss-raw-cdp-state.json');
const BOSS_TEST_URL = 'https://www.zhipin.com/web/user/';

/* ------------------------------------------------------------------ */
/* 工具                                                               */
/* ------------------------------------------------------------------ */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findChrome() {
  const candidates = [
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`未找到 Google Chrome，已检查：${candidates.join('；')}`);
}

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getProcessCommandLine(pid) {
  try {
    const out = execFileSync(
      'powershell',
      ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine`],
      { encoding: 'utf8', timeout: 8000 },
    );
    return out.trim() || null;
  } catch {
    return null;
  }
}

async function isPortFree() {
  try {
    await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
    return false;
  } catch {
    return true;
  }
}

async function waitForCdp(port = CDP_PORT, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) {
        console.log('[CDP] port ready', `http://127.0.0.1:${port}/json/version`);
        return await res.json();
      }
    } catch {
      // 尚未就绪
    }
    await sleep(300);
  }
  throw new Error(`CDP 端口 ${port} 未就绪`);
}

/* ------------------------------------------------------------------ */
/* Spike 状态文件                                                      */
/* ------------------------------------------------------------------ */
function writeState(state) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Raw CDP 客户端（最小实现）                                          */
/* ------------------------------------------------------------------ */
class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 0;
    this.pending = new Map();
    this.handlers = new Set();
    this.closed = false;
  }

  async connect(timeoutMs = 10000) {
    const ws = new WebSocket(this.wsUrl);
    this.ws = ws;

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('WebSocket 连接超时')), timeoutMs);
      ws.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      ws.addEventListener('error', () => {
        clearTimeout(timer);
        reject(new Error('WebSocket 连接失败'));
      }, { once: true });
    });

    ws.addEventListener('message', (ev) => this._onMessage(ev.data));
    ws.addEventListener('close', () => this._onClosed());
    console.log('[CDP] websocket connected');
  }

  _onMessage(data) {
    let msg;
    try {
      msg = JSON.parse(typeof data === 'string' ? data : data.toString());
    } catch {
      return;
    }
    if (msg.id !== undefined) {
      const entry = this.pending.get(msg.id);
      if (entry) {
        this.pending.delete(msg.id);
        clearTimeout(entry.timer);
        if (msg.error) entry.reject(new Error(`${entry.method}: ${msg.error.message}`));
        else entry.resolve(msg.result);
      }
    } else {
      for (const handler of this.handlers) handler(msg);
    }
  }

  _onClosed() {
    if (this.closed) return;
    this.closed = true;
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error('WebSocket 已关闭'));
    }
    this.pending.clear();
    console.log('[CDP] websocket closed');
  }

  send(method, params = {}, sessionId) {
    if (this.closed || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('WebSocket 未连接'));
    }
    const id = ++this.nextId;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} 超时`));
      }, 15000);
      this.pending.set(id, { resolve, reject, method, timer });
      this.ws.send(JSON.stringify(message));
    });
  }

  onEvent(handler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  close() {
    try {
      if (this.ws) this.ws.close();
    } catch {
      // 忽略
    }
  }
}

function holdUntilInterrupt(holdMs) {
  return new Promise((resolve) => {
    if (holdMs && holdMs > 0) {
      setTimeout(resolve, holdMs);
    } else {
      process.on('SIGINT', () => resolve());
      process.on('SIGTERM', () => resolve());
    }
  });
}

/* ------------------------------------------------------------------ */
/* Chrome 生命周期                                                     */
/* ------------------------------------------------------------------ */
function launchChrome(chromePath) {
  const args = [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${SPIKE_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-allow-origins=*',
  ];
  console.log('[CHROME] executable', chromePath);
  console.log('[CHROME] profile', SPIKE_DIR);
  // detached + unref：脚本退出后 Chrome 仍保持运行。
  const child = spawn(chromePath, args, { detached: true, stdio: 'ignore' });
  child.unref();
  console.log('[CHROME] pid', child.pid);
  writeState({ pid: child.pid, profile: SPIKE_DIR, port: CDP_PORT });
  return child;
}

async function cleanupChrome() {
  const state = readState();
  if (!state || typeof state.pid !== 'number') {
    console.log('[CLEANUP] 无 spike 状态，无需清理');
    fs.rmSync(STATE_FILE, { force: true });
    return;
  }
  const { pid, profile, port } = state;
  if (!processAlive(pid)) {
    console.log('[CLEANUP] pid', pid, '已不存在（可能已被手动关闭）');
    fs.rmSync(STATE_FILE, { force: true });
    return;
  }
  const cmdline = getProcessCommandLine(pid);
  const matches = cmdline !== null && cmdline.includes(profile) && cmdline.includes(String(port));
  if (!matches) {
    console.log('[CLEANUP] pid', pid, '命令行不匹配 spike（拒绝清理，保留状态文件供检查）');
    return;
  }
  try {
    // 仅终止根进程（浏览器主进程）；渲染子进程随之退出。
    // 不使用 /T：taskkill /T 在枚举时子进程已自行退出会误报失败。
    execFileSync('taskkill', ['/pid', String(pid), '/F'], { stdio: 'ignore' });
    console.log('[CLEANUP] 已终止 spike Chrome pid', pid);
  } catch (err) {
    if (processAlive(pid)) {
      console.log('[CLEANUP] 终止失败:', err.message);
    } else {
      console.log('[CLEANUP] spike Chrome 已自行退出');
    }
  }
  fs.rmSync(STATE_FILE, { force: true });
}

async function resetSpike() {
  await cleanupChrome();
  fs.rmSync(SPIKE_DIR, { recursive: true, force: true });
  fs.rmSync(STATE_FILE, { force: true });
  console.log('[RESET] spike profile 与状态已清除:', SPIKE_DIR);
}

/* ------------------------------------------------------------------ */
/* 阶段                                                                 */
/* ------------------------------------------------------------------ */
async function stageLaunch() {
  if (!(await isPortFree())) {
    throw new Error(`CDP 端口 ${CDP_PORT} 已被占用，请先 --cleanup 或确认无其它进程占用`);
  }
  const chromePath = findChrome();
  fs.mkdirSync(SPIKE_DIR, { recursive: true });
  const child = launchChrome(chromePath);
  try {
    await waitForCdp();
  } catch (err) {
    console.error('[LAUNCH] Chrome 启动但 CDP 未就绪:', err.message);
    process.kill(child.pid);
    process.exit(1);
  }
  console.log('[LAUNCH] Chrome 已运行，人工观察 BOSS 是否白屏。Ctrl+C / --cleanup 结束。');
}

async function stageAttach(args) {
  const version = await waitForCdp();
  const client = new CdpClient(version.webSocketDebuggerUrl);
  await client.connect();
  client.onEvent(logCdpEvent);
  await client.send('Target.setDiscoverTargets', { discover: true }).catch(() => {});
  console.log('[ATTACH] 仅建立 Browser-level CDP 连接，不做任何页面操作。Ctrl+C 结束。');
  await holdUntilInterrupt(parseInt(args['hold'], 10) || 0);
  client.close();
}

async function stageNavigate(args) {
  const version = await waitForCdp();
  const client = new CdpClient(version.webSocketDebuggerUrl);
  await client.connect();
  client.onEvent(logCdpEvent);
  await client.send('Target.setDiscoverTargets', { discover: true }).catch(() => {});

  const created = await client.send('Target.createTarget', { url: 'about:blank', newWindow: false });
  const targetId = created.targetId;
  console.log('[CDP] target created', targetId);

  await client.send('Target.activateTarget', { targetId }).catch(() => {});
  const attached = await client.send('Target.attachToTarget', { targetId, flatten: true });
  const sessionId = attached.sessionId;
  console.log('[CDP] attached sessionId=', sessionId);

  console.log('[CDP] navigate', BOSS_TEST_URL);
  await client.send('Page.navigate', { url: BOSS_TEST_URL }, sessionId);

  console.log('[NAVIGATE] 已导航一次，停止主动操作。人工观察是否白屏，Ctrl+C 结束。');
  await holdUntilInterrupt(parseInt(args['hold'], 10) || 0);
  client.close();
}

async function stageLogin(args) {
  const version = await waitForCdp();
  const client = new CdpClient(version.webSocketDebuggerUrl);
  await client.connect();
  client.onEvent(logCdpEvent);
  await client.send('Target.setDiscoverTargets', { discover: true }).catch(() => {});

  const targets = await client.send('Target.getTargets');
  const pages = (targets.targetInfos || []).filter((t) => t.type === 'page');
  console.log('[LOGIN] 当前 page targets:');
  for (const t of pages) console.log('  -', t.targetId, t.url || '(about:blank)', t.title || '');
  if (pages.length === 0) console.log('  （无 page target）');

  console.log('[LOGIN] 请在此 Chrome 中完成登录（扫码/短信/CAPTCHA）。Spike 不注入、不操作 Cookie。Ctrl+C 结束。');
  await holdUntilInterrupt(parseInt(args['hold'], 10) || 0);
  client.close();
}

function logCdpEvent(ev) {
  if (ev.method === 'Target.targetDestroyed') {
    console.log('[CDP EVENT] target closed', ev.params?.targetId);
  }
  if (ev.method === 'Target.targetCrashed') {
    console.log('[CDP EVENT] target crashed', ev.params?.targetId);
  }
  if (ev.method === 'Target.targetInfoChanged') {
    const info = ev.params?.targetInfo;
    if (info && info.type === 'page') {
      console.log('[CDP EVENT] target url changed', info.targetId, info.url || '(about:blank)');
    }
  }
}

async function printStatus() {
  try {
    const res = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
    const targets = await res.json();
    console.log('[STATUS] 当前 page targets:');
    for (const t of targets) {
      if (t.type === 'page') console.log('  -', t.id, t.url || '(about:blank)', t.title || '');
    }
  } catch (err) {
    console.log('[STATUS] 无法连接 CDP（Chrome 未运行?）:', err.message);
  }
}

/* ------------------------------------------------------------------ */
/* 自动验证（只验证可安全自动化的部分）                                */
/* ------------------------------------------------------------------ */
async function runSelfTest() {
  let failures = 0;
  const check = (name, cond, extra = '') => {
    console.log(`${cond ? 'PASS' : 'FAIL'} - ${name}${extra ? ' ' + extra : ''}`);
    if (!cond) failures += 1;
  };

  let chromePath;
  try {
    chromePath = findChrome();
    check('Chrome path detection', !!chromePath, chromePath);
  } catch (err) {
    check('Chrome path detection', false, err.message);
  }

  check('Spike profile 独立', SPIKE_DIR.includes('spikes') && !SPIKE_DIR.includes('browser' + path.sep), SPIKE_DIR);

  const free = await isPortFree();
  check('CDP 端口 9223 空闲', free);

  if (chromePath) {
    try {
      fs.mkdirSync(SPIKE_DIR, { recursive: true });
      const child = launchChrome(chromePath);

      const version = await waitForCdp();
      check('/json/version 返回 webSocketDebuggerUrl', typeof version?.webSocketDebuggerUrl === 'string');

      const cmdline = getProcessCommandLine(child.pid) || '';
      check(
        'spike Chrome 命令行包含独立 profile + 端口',
        cmdline.includes(SPIKE_DIR) && cmdline.includes(String(CDP_PORT)),
      );

      const client = new CdpClient(version.webSocketDebuggerUrl);
      await client.connect();
      check('WebSocket attach', true, version.webSocketDebuggerUrl);

      const v = await client.send('Browser.getVersion');
      check('CDP send/response', !!v && typeof v.product === 'string', v?.product || '');
      client.close();

      await cleanupChrome();
      check('cleanup 只匹配 spike Chrome 并终止', !processAlive(child.pid));
    } catch (err) {
      console.error('SELF-TEST ERROR:', err.message);
      failures += 1;
      await cleanupChrome().catch(() => {});
    }
  }

  console.log(failures === 0 ? 'SELF-TEST: ALL PASS' : `SELF-TEST: ${failures} FAIL`);
  process.exit(failures === 0 ? 0 : 1);
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */
function printUsage() {
  console.log(`Raw CDP Spike
用法:
  npm run cdp:spike -- --stage=launch     启动 spike Chrome（不连 CDP）
  npm run cdp:spike -- --stage=attach     仅建立 Browser-level CDP 连接
  npm run cdp:spike -- --stage=navigate   Target.attachToTarget + Page.navigate 到 BOSS
  npm run cdp:spike -- --stage=login      观察登录（不注入、不改页面）
  npm run cdp:spike -- --status           打印当前 page targets URL
  npm run cdp:spike -- --cleanup          只关闭 spike Chrome
  npm run cdp:spike -- --reset            清理 + 删除 spike profile
  npm run cdp:spike -- --self-test        自动验证（不涉及 BOSS）
可选: --hold=<毫秒>  默认保持到 Ctrl+C`);
}

function parseArgs(argv) {
  const args = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) args[m[1]] = m[2] === undefined ? true : m[2];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args['self-test']) {
    await runSelfTest();
    return;
  }
  if (args['reset']) {
    await resetSpike();
    return;
  }
  if (args['cleanup']) {
    await cleanupChrome();
    return;
  }
  if (args['status']) {
    await printStatus();
    return;
  }

  const stage = args['stage'];
  try {
    switch (stage) {
      case 'launch':
        await stageLaunch();
        break;
      case 'attach':
        await stageAttach(args);
        break;
      case 'navigate':
        await stageNavigate(args);
        break;
      case 'login':
        await stageLogin(args);
        break;
      default:
        printUsage();
        process.exit(1);
    }
  } catch (err) {
    console.error('[SPIKE ERROR]', err.message);
    process.exit(1);
  }
}

await main();
