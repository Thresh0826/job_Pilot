import { NOTIFICATION_TOPICS, type NotificationConfig, type NotificationTopic } from '../../../core/notification';
import { Switch } from '../ui';

const TOPIC_LABELS: Record<NotificationTopic, string> = {
  interview_invite: '面试邀请',
  phone_call: '电话沟通',
  salary_discussion: '薪资沟通',
  offer: 'Offer',
  ai_uncertain: 'AI 无法确定答案',
};

export function NotificationForm({
  value,
  onChange,
}: {
  value: NotificationConfig;
  onChange: (next: NotificationConfig) => void;
}) {
  return (
    <div className="list">
      {NOTIFICATION_TOPICS.map((topic) => (
        <div className="list-item" key={topic}>
          <div className="list-item__main">
            <div className="list-item__title">{TOPIC_LABELS[topic]}</div>
          </div>
          <Switch checked={value[topic]} onChange={(v) => onChange({ ...value, [topic]: v })} />
        </div>
      ))}
    </div>
  );
}
