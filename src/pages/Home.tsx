import { useAppStore } from '../stores/useAppStore';
import { Badge, StatusDot, useToast } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { AgentStatus } from '../components/AgentStatus';
import { AgentActivity } from '../components/AgentActivity';
import { AttentionItem } from '../components/AttentionItem';
import { JobCard } from '../components/JobCard';
import {
  MOCK_AGENT_ACTIVITY,
  MOCK_PENDING_MESSAGES,
  MOCK_RECOMMENDED_JOBS,
  MOCK_TODAY_STATS,
} from '../mock/data';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 6) return '夜深了';
  if (h < 12) return '早上好';
  if (h < 18) return '下午好';
  return '晚上好';
}

export default function Home() {
  const settings = useAppStore((s) => s.settings);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const toast = useToast();

  const name = settings?.profile.name?.trim();
  const greet = name ? `${greeting()}，${name}` : greeting();

  return (
    <div className="page">
      <PageHeader
        title={greet}
        desc="JobPilot 今天正在持续寻找合适的机会。"
        trailing={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--jp-text-secondary)' }}>
            <StatusDot variant="neutral" />
            已暂停
          </span>
        }
      />

      <AgentStatus
        running={false}
        activity="启动后，JobPilot 会自动检查新岗位、筛选并投递，重要消息会及时提醒你。"
        stats={[
          { label: '已发现', value: 62 },
          { label: '符合', value: 24 },
          { label: '已投递', value: 18 },
        ]}
        onToggle={() => toast('Agent 自动执行功能将在后续版本开放。')}
        toggleLabel="启动 Agent"
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr', gap: 24, marginTop: 24 }}>
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 className="section-title">需要你处理</h2>
            <Badge variant="attention">{MOCK_TODAY_STATS.pending}</Badge>
          </div>
          <div className="list">
            {MOCK_PENDING_MESSAGES.map((m) => (
              <AttentionItem
                key={m.id}
                company={m.company}
                title={m.title}
                hrMessage={m.hrMessage}
                aiSuggestion={m.aiSuggestion}
                onOpen={() => setActiveTab('messages')}
              />
            ))}
          </div>
        </section>

        <section>
          <h2 className="section-title" style={{ marginBottom: 14 }}>
            Agent 活动
          </h2>
          <div className="card">
            <AgentActivity items={MOCK_AGENT_ACTIVITY} />
          </div>
        </section>
      </div>

      <section style={{ marginTop: 32 }}>
        <h2 className="section-title" style={{ marginBottom: 14 }}>
          推荐机会
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {MOCK_RECOMMENDED_JOBS.map((job) => (
            <JobCard key={job.id} job={job} onOpen={() => setActiveTab('jobs')} />
          ))}
        </div>
      </section>

      <div className="stat-row" style={{ marginTop: 32 }}>
        <div className="stat-row__item">
          <div className="stat-row__value">{MOCK_TODAY_STATS.applied}</div>
          <div className="stat-row__label">今日投递</div>
        </div>
        <div className="stat-row__item">
          <div className="stat-row__value">{MOCK_TODAY_STATS.hrReplies}</div>
          <div className="stat-row__label">HR 回复</div>
        </div>
        <div className="stat-row__item">
          <div className="stat-row__value">{MOCK_TODAY_STATS.pending}</div>
          <div className="stat-row__label">待处理</div>
        </div>
      </div>
    </div>
  );
}
