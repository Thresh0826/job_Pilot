import type { PlatformAccountState } from '../../../shared/settings';
import { Badge, Button, useToast } from '../ui';

const COMING_SOON = ['智联招聘', '前程无忧', '猎聘'];

export function PlatformForm({
  value,
  onChange,
}: {
  value: PlatformAccountState;
  onChange: (next: PlatformAccountState) => void;
}) {
  const toast = useToast();

  const connect = async () => {
    const result = await window.api.connectPlatform('BOSS');
    toast(result.message);
    onChange({ ...value, boss: 'DISCONNECTED' });
  };

  return (
    <div className="list">
      <div className="list-item">
        <div className="list-item__main">
          <div className="list-item__title">BOSS直聘</div>
          <div className="list-item__sub">{value.boss === 'CONNECTED' ? '已连接' : '未连接'}</div>
        </div>
        <Button variant="ghost" size="sm" onClick={connect}>
          连接 BOSS
        </Button>
      </div>

      {COMING_SOON.map((name) => (
        <div className="list-item" key={name}>
          <div className="list-item__main">
            <div className="list-item__title">{name}</div>
          </div>
          <Badge variant="muted">即将支持</Badge>
        </div>
      ))}
    </div>
  );
}
