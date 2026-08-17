import { Badge, Card } from '../components/ui';
import { MOCK_APPLICATIONS } from '../mock/data';
import type { ApplicationStatus } from '../../core/application';

const STATUS_LABELS: Record<ApplicationStatus, string> = {
  PENDING: '已投递',
  REVIEWED: '已查看',
  INTERVIEW: '面试中',
  OFFER: 'Offer',
  REJECTED: '已拒绝',
  IGNORED: '未反馈',
};

const STATUS_VARIANT: Record<ApplicationStatus, 'muted' | 'accent' | 'success' | 'danger'> = {
  PENDING: 'muted',
  REVIEWED: 'accent',
  INTERVIEW: 'accent',
  OFFER: 'success',
  REJECTED: 'danger',
  IGNORED: 'muted',
};

export default function Applications() {
  return (
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">投递记录</h1>
        <p className="page__desc">模拟投递历史，暂未接入真实平台。</p>
      </div>

      <Card>
        <div className="list">
          {MOCK_APPLICATIONS.map((app) => (
            <div className="list-item" key={app.id}>
              <div className="list-item__main">
                <div className="list-item__title">
                  {app.company} · {app.title}
                </div>
                <div className="list-item__sub">
                  {app.salary} · {app.appliedAt}
                </div>
              </div>
              <Badge variant="muted">{app.platform}</Badge>
              <Badge variant={STATUS_VARIANT[app.status]}>{STATUS_LABELS[app.status]}</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
