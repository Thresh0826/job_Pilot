import { Button, StatusDot } from './ui';

export interface AgentStat {
  label: string;
  value: number;
}

export function AgentStatus({
  running,
  activity,
  stats,
  onToggle,
  toggleLabel = '暂停',
}: {
  running: boolean;
  activity: string;
  stats: AgentStat[];
  onToggle: () => void;
  toggleLabel?: string;
}) {
  return (
    <div className="agent-status">
      <div className="agent-status__head">
        <div className="agent-status__title">
          <StatusDot variant="agent" />
          AI 求职 Agent
        </div>
        <span className="agent-status__state">
          <StatusDot variant="agent" />
          {running ? '正在运行' : '已暂停'}
        </span>
      </div>

      <div className="agent-status__activity">{activity}</div>

      <div className="agent-status__stats">
        {stats.map((s) => (
          <div className="agent-status__stat" key={s.label}>
            <span className="agent-status__stat-value">{s.value}</span>
            <span className="agent-status__stat-label">{s.label}</span>
          </div>
        ))}
      </div>

      <Button variant="secondary" size="sm" onClick={onToggle}>
        {toggleLabel}
      </Button>
    </div>
  );
}
