import type { PlatformStatus as PlatformStatusValue } from '../../shared/enums';
import { Button, StatusDot } from './ui';

export function PlatformStatus({
  name,
  status,
  onConnect,
  connectLabel = '连接',
}: {
  name: string;
  status: PlatformStatusValue;
  onConnect?: () => void;
  connectLabel?: string;
}) {
  const label = status === 'CONNECTED' ? '已连接' : status === 'COMING_SOON' ? '即将支持' : '未连接';
  const dot = status === 'CONNECTED' ? 'agent' : 'neutral';

  return (
    <div className="platform-item">
      <div className="platform-item__main">
        <div className="platform-item__name">{name}</div>
        <div className="platform-item__state">
          <StatusDot variant={dot} />
          {label}
        </div>
      </div>
      {onConnect ? (
        <Button variant="secondary" size="sm" onClick={onConnect}>
          {connectLabel}
        </Button>
      ) : null}
    </div>
  );
}
