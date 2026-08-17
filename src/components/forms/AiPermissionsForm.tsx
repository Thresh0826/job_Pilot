import { AI_TOPICS, type AiPermissionConfig, type AiPermissionMode, type AiTopic } from '../../../core/ai';
import { ChoiceGroup, Field } from '../ui';

const TOPIC_LABELS: Record<AiTopic, string> = {
  greeting: '基础问候',
  location: '工作地点',
  start_date: '到岗时间',
  resume_experience: '简历已有经历',
  salary: '期望薪资',
  interview_time: '面试时间',
  resignation_reason: '离职原因',
};

const MODE_OPTIONS: { value: AiPermissionMode; label: string }[] = [
  { value: 'AUTO', label: 'AI 自动处理' },
  { value: 'ASK_USER', label: '询问我' },
];

export function AiPermissionsForm({
  value,
  onChange,
}: {
  value: AiPermissionConfig;
  onChange: (next: AiPermissionConfig) => void;
}) {
  return (
    <div>
      {AI_TOPICS.map((topic) => (
        <Field key={topic} label={TOPIC_LABELS[topic]}>
          <ChoiceGroup
            options={MODE_OPTIONS}
            value={value[topic]}
            onChange={(mode) => onChange({ ...value, [topic]: mode as AiPermissionMode })}
          />
        </Field>
      ))}
    </div>
  );
}
