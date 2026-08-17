import type { PlatformAccountState } from '../../../shared/settings';
import { useToast } from '../ui';
import { PlatformStatus } from '../PlatformStatus';

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
      <PlatformStatus
        name="BOSS直聘"
        status={value.boss}
        onConnect={() => void connect()}
        connectLabel="连接 BOSS"
      />
      {COMING_SOON.map((name) => (
        <PlatformStatus key={name} name={name} status="COMING_SOON" />
      ))}
    </div>
  );
}
