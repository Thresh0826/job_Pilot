import { useEffect, useState } from 'react';
import type { BossPlatformStatus } from '../../../shared/settings';
import type { PlatformActionResult } from '../../../shared/ipc';
import { useToast } from '../ui';
import { PlatformStatus as PlatformStatusItem } from '../PlatformStatus';

const COMING_SOON = ['智联招聘', '前程无忧', '猎聘'];

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export function PlatformForm() {
  const toast = useToast();
  const [state, setState] = useState<BossPlatformStatus>({
    status: 'DISCONNECTED',
    lastConnectedAt: null,
    lastCheckedAt: null,
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        setState(await window.api.getPlatformStatus());
      } catch {
        // 保持默认「未连接」
      }
    })();
  }, []);

  const run = async (fn: () => Promise<PlatformActionResult>, connecting = false) => {
    setBusy(true);
    if (connecting) setState((s) => ({ ...s, status: 'CONNECTING' }));
    try {
      const result = await fn();
      setState((s) => ({ ...s, status: result.status }));
      toast(result.message, result.status === 'ERROR' ? 'error' : 'info');
    } catch (err) {
      setState((s) => ({ ...s, status: 'ERROR' }));
      toast(err instanceof Error ? err.message : '操作失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  const connect = () => run(() => window.api.connectPlatform('BOSS'), true);
  const check = () => run(() => window.api.checkPlatform('BOSS'));

  const disconnect = () => {
    if (!window.confirm('确定断开 BOSS 连接并清理当前模式的登录数据吗？')) return;
    void run(() => window.api.disconnectPlatform('BOSS'));
  };

  return (
    <div>
      <div className="list">
        <PlatformStatusItem
          name="BOSS直聘"
          status={state.status}
          busy={busy}
          onConnect={connect}
          onCheck={check}
          onDisconnect={disconnect}
        />
        {COMING_SOON.map((name) => (
          <PlatformStatusItem key={name} name={name} status="COMING_SOON" />
        ))}
      </div>

      {state.lastConnectedAt || state.lastCheckedAt ? (
        <div className="small muted mt-16">
          {state.lastConnectedAt ? `最近连接：${formatTime(state.lastConnectedAt)}` : ''}
          {state.lastCheckedAt ? `${state.lastConnectedAt ? ' · ' : ''}最近检查：${formatTime(state.lastCheckedAt)}` : ''}
        </div>
      ) : null}
    </div>
  );
}
