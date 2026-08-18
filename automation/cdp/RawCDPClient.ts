import { logger } from '../../electron/main/logger';

/** CDP 事件（command 之外的消息）。 */
export interface CdpEvent {
  method: string;
  params?: Record<string, unknown>;
  sessionId?: string;
}

interface PendingEntry {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  method: string;
  timer: NodeJS.Timeout;
}

/**
 * 最小 Raw CDP 客户端。
 * 只负责协议层：connect / send / 事件分发 / close。
 * 不包含任何 BOSS 业务逻辑。
 */
export class RawCDPClient {
  private ws: WebSocket | null = null;
  private nextId = 0;
  private pending = new Map<number, PendingEntry>();
  private handlers = new Set<(ev: CdpEvent) => void>();
  private closeCb: (() => void) | null = null;
  private closedFlag = false;
  private readonly wsUrl: string;

  constructor(wsUrl: string) {
    this.wsUrl = wsUrl;
  }

  get isClosed(): boolean {
    return this.closedFlag;
  }

  /** 注册 WebSocket 关闭回调（例如用于清理 Chrome 状态）。 */
  onClose(cb: () => void): void {
    this.closeCb = cb;
  }

  async connect(timeoutMs = 10_000): Promise<void> {
    const ws = new WebSocket(this.wsUrl);
    this.ws = ws;

    await new Promise<void>((resolve, reject) => {
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

    ws.addEventListener('message', (ev) => this.onMessage(ev.data));
    ws.addEventListener('close', () => this.onClosed());
    logger.info('cdp', 'connected');
  }

  private onMessage(data: unknown): void {
    let msg: {
      id?: number;
      method?: string;
      params?: unknown;
      sessionId?: string;
      error?: { message: string };
      result?: unknown;
    };
    try {
      msg = JSON.parse(typeof data === 'string' ? data : String(data));
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
    } else if (msg.method) {
      const event: CdpEvent = {
        method: msg.method,
        params: msg.params as Record<string, unknown> | undefined,
        sessionId: msg.sessionId,
      };
      for (const handler of this.handlers) handler(event);
    }
  }

  private onClosed(): void {
    if (this.closedFlag) return;
    this.closedFlag = true;
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error('WebSocket 已关闭'));
    }
    this.pending.clear();
    logger.info('cdp', 'websocket closed');
    this.closeCb?.();
  }

  /** 发送 CDP 命令；message id 递增并等待对应 response。 */
  send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<unknown> {
    if (this.closedFlag || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('WebSocket 未连接'));
    }

    const id = ++this.nextId;
    const message: Record<string, unknown> = { id, method, params };
    if (sessionId) message.sessionId = sessionId;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} 超时`));
      }, 15_000);
      this.pending.set(id, { resolve, reject, method, timer });
      this.ws!.send(JSON.stringify(message));
    });
  }

  /** 注册事件监听，返回取消函数。 */
  onEvent(handler: (ev: CdpEvent) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  close(): void {
    try {
      this.ws?.close();
    } catch {
      // 忽略
    }
  }
}
