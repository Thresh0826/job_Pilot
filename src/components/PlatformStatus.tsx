import type { PlatformStatus as PlatformStatusValue } from '../../shared/enums';
import { Button, StatusDot } from './ui';

type DotVariant = 'agent' | 'attention' | 'danger' | 'neutral' | 'accent';

const STATUS_META: Record<PlatformStatusValue, { label: string; dot: DotVariant }> = {
  DISCONNECTED: { label: '未连接', dot: 'neutral' },
  CONNECTING: { label: '连接中', dot: 'agent' },
  CONNECTED: { label: '已连接', dot: 'agent' },
  EXPIRED: { label: '登录失效', dot: 'attention' },
  ERROR: { label: '连接错误', dot: 'danger' },
  COMING_SOON: { label: '即将支持', dot: 'neutral' },
};

export function PlatformStatus({
  name,
  status,
  busy = false,
  onConnect,
  onCheck,
  onDisconnect,
}: {
  name: string;
  status: PlatformStatusValue;
  busy?: boolean;
  onConnect?: () => void;
  onCheck?: () => void;
  onDisconnect?: () => void;
}) {
  const meta = STATUS_META[status];
  const connectLabel = status === 'DISCONNECTED' ? '连接 BOSS' : '重新连接';

  return (
    <div className="platform-item">
      <div className="platform-item__main">
        <div className="platform-item__name">{name}</div>
        <div className="platform-item__state">
          <StatusDot variant={meta.dot} />
          {meta.label}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {(status === 'DISCONNECTED' || status === 'EXPIRED' || status === 'ERROR') && onConnect ? (
          <Button variant="secondary" size="sm" disabled={busy} onClick={onConnect}>
            {connectLabel}
          </Button>
        ) : null}

        {(status === 'CONNECTING' || status === 'CONNECTED') && onCheck ? (
          <Button variant="secondary" size="sm" disabled={busy} onClick={onCheck}>
            检查连接
          </Button>
        ) : null}

        {(status === 'CONNECTED' || status === 'EXPIRED') && onDisconnect ? (
          <Button variant="danger" size="sm" disabled={busy} onClick={onDisconnect}>
            断开连接
          </Button>
        ) : null}
      </div>
    </div>
  );
}
