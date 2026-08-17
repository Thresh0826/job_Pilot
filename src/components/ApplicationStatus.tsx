import type { ApplicationStatus as ApplicationStatusValue } from '../../core/application';
import { Badge } from './ui';

const STATUS_MAP: Record<ApplicationStatusValue, { label: string; variant: 'neutral' | 'accent' | 'agent' }> = {
  PENDING: { label: '已投递', variant: 'neutral' },
  REVIEWED: { label: '已读', variant: 'neutral' },
  INTERVIEW: { label: '面试', variant: 'accent' },
  OFFER: { label: 'Offer', variant: 'agent' },
  REJECTED: { label: '已结束', variant: 'neutral' },
  IGNORED: { label: '未反馈', variant: 'neutral' },
};

export function ApplicationStatus({ status }: { status: ApplicationStatusValue }) {
  const m = STATUS_MAP[status] ?? { label: status, variant: 'neutral' as const };
  return <Badge variant={m.variant}>{m.label}</Badge>;
}
