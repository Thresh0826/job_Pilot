import { useState } from 'react';
import { Bot, Send } from 'lucide-react';
import { useAppStore } from '../stores/useAppStore';
import { Badge, Button, Card, useToast } from '../components/ui';
import {
  MOCK_PENDING_MESSAGES,
  MOCK_RECOMMENDED_JOBS,
  MOCK_TODAY_STATS,
  MOCK_WORK_DATA,
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
  const [agentRunning] = useState(false);

  const name = settings?.profile.name?.trim();
  const greet = name ? `${greeting()}，${name}` : greeting();

  return (
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">{greet}</h1>
        <p className="page__desc">以下是今日求职概览（模拟数据）。</p>
      </div>

      <div className="stat-grid" style={{ marginBottom: 16 }}>
        <Card className="stat-card">
          <div className="stat-card__label">今日投递</div>
          <div className="stat-card__value">{MOCK_TODAY_STATS.applied}</div>
        </Card>
        <Card className="stat-card">
          <div className="stat-card__label">HR回复</div>
          <div className="stat-card__value">{MOCK_TODAY_STATS.hrReplies}</div>
        </Card>
        <Card className="stat-card">
          <div className="stat-card__label">待处理</div>
          <div className="stat-card__value">{MOCK_TODAY_STATS.pending}</div>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 16, marginBottom: 16 }}>
        <Card title="AI 求职 Agent">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <Bot size={30} color="var(--accent-2)" />
            <div>
              <div style={{ fontWeight: 650 }}>求职 Agent</div>
              <div className="small muted">{agentRunning ? '运行中' : '已暂停'}</div>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => toast('Agent 自动执行功能将在后续版本开放。')}>
            {agentRunning ? '暂停 Agent' : '启动 Agent'}
          </Button>
        </Card>

        <Card title="今日工作数据">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, textAlign: 'center' }}>
            {[
              ['发现职位', MOCK_WORK_DATA.discovered],
              ['符合要求', MOCK_WORK_DATA.matched],
              ['已投递', MOCK_WORK_DATA.applied],
              ['已跳过', MOCK_WORK_DATA.skipped],
            ].map(([label, value]) => (
              <div key={label as string}>
                <div className="stat-card__value" style={{ fontSize: 24 }}>
                  {value as number}
                </div>
                <div className="stat-card__label">{label as string}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="待处理消息" className="mb-16">
        <div className="list">
          {MOCK_PENDING_MESSAGES.map((m) => (
            <div className="list-item" key={m.id}>
              <div className="list-item__main">
                <div className="list-item__title">
                  {m.company} · {m.title}
                </div>
                <div className="list-item__sub">HR：{m.hrMessage}</div>
                <div className="list-item__sub" style={{ color: 'var(--accent-2)' }}>
                  AI建议：{m.aiSuggestion}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setActiveTab('messages')}>
                查看
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card title="推荐岗位">
        <div className="list">
          {MOCK_RECOMMENDED_JOBS.map((job) => (
            <div className="list-item" key={job.id}>
              <div className="list-item__main">
                <div className="list-item__title">
                  {job.company} · {job.title}
                </div>
                <div className="list-item__sub">
                  {job.salary} · {job.location}
                </div>
              </div>
              <div className="match">{job.matchScore}%</div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setActiveTab('jobs')}
              >
                查看
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <div className="row" style={{ marginTop: 16 }}>
        <Badge variant="muted">
          <Send size={12} /> 当前为模拟数据，尚未接入真实招聘平台
        </Badge>
      </div>
    </div>
  );
}
