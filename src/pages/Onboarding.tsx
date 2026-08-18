import { useState } from 'react';
import { Check } from 'lucide-react';
import { createDefaultSettings, type SettingsSnapshot } from '../../shared/settings';
import { useAppStore } from '../stores/useAppStore';
import { Button, StatusDot } from '../components/ui';
import { ProfileForm } from '../components/forms/ProfileForm';
import { ResumeForm } from '../components/forms/ResumeForm';
import { TargetForm } from '../components/forms/TargetForm';
import { PreferencesForm } from '../components/forms/PreferencesForm';
import { AiPermissionsForm } from '../components/forms/AiPermissionsForm';
import { NotificationForm } from '../components/forms/NotificationForm';
import { PlatformForm } from '../components/forms/PlatformForm';

interface StepMeta {
  title: string;
  subtitle: string;
  skippable: boolean;
}

const STEPS: StepMeta[] = [
  { title: '先认识一下你', subtitle: '这些信息能帮助 JobPilot 更精准地推荐机会。', skippable: true },
  { title: '上传你的简历', subtitle: '支持 PDF 或 DOCX，之后可以随时更换。', skippable: true },
  { title: '你想找什么工作？', subtitle: '目标岗位、薪资、地点和行业偏好。', skippable: true },
  { title: '你对工作的基本要求是什么？', subtitle: '双休、出差、通勤与公司规模等。', skippable: true },
  { title: '哪些事情可以交给 JobPilot？', subtitle: '决定 AI 可以自动回复哪些内容，重要的事交给你。', skippable: true },
  { title: '连接招聘平台', subtitle: '当前为占位，后续版本将接入真实平台。', skippable: false },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="steps" aria-label={`第 ${current + 1} 步，共 ${STEPS.length} 步`}>
      {STEPS.map((s, i) => (
        <div className="steps__item" key={s.title} style={{ display: 'flex', alignItems: 'center' }}>
          <div
            className={`steps__dot ${i < current ? 'steps__dot--done' : i === current ? 'steps__dot--active' : ''}`}
          >
            {i < current ? <Check size={13} /> : i + 1}
          </div>
          {i < STEPS.length - 1 ? (
            <div className={`steps__line ${i < current ? 'steps__line--done' : ''}`} />
          ) : null}
        </div>
      ))}
    </div>
  );
}

export default function Onboarding() {
  const settings = useAppStore((s) => s.settings);
  const saveAndCompleteOnboarding = useAppStore((s) => s.saveAndCompleteOnboarding);
  const goDashboard = useAppStore((s) => s.goDashboard);

  const [draft, setDraft] = useState<SettingsSnapshot>(() => settings ?? createDefaultSettings());
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const update = (patch: Partial<SettingsSnapshot>) => setDraft((d) => ({ ...d, ...patch }));
  const meta = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const complete = async () => {
    setSaving(true);
    try {
      await saveAndCompleteOnboarding(draft);
      setDone(true);
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="wizard">
        <div className="wizard__body" style={{ display: 'grid', placeItems: 'center', textAlign: 'center' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
              <span
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  background: 'var(--jp-agent-soft)',
                  color: 'var(--jp-agent)',
                }}
              >
                <Check size={26} />
              </span>
            </div>
            <h1 className="wizard__title">准备完成</h1>
            <p className="wizard__subtitle" style={{ maxWidth: 360, margin: '0 auto 32px' }}>
              JobPilot 已经了解你的基本求职需求。
              <br />
              之后你可以随时在设置中调整。
            </p>
            <Button onClick={() => goDashboard('home')}>开始找工作</Button>
            <div className="mt-16" style={{ display: 'flex', justifyContent: 'center', gap: 6, alignItems: 'center' }}>
              <StatusDot variant="agent" />
              <span className="small muted">JobPilot 已就绪</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wizard">
      <div className="wizard__head">
        <div className="wizard__brand">
          <StatusDot variant="agent" />
          JobPilot
        </div>
        <StepIndicator current={step} />
      </div>

      <div className="wizard__body">
        <h1 className="wizard__title">{meta.title}</h1>
        <p className="wizard__subtitle">{meta.subtitle}</p>

        {step === 0 && <ProfileForm value={draft.profile} onChange={(profile) => update({ profile })} />}
        {step === 1 && <ResumeForm value={draft.resume} onChange={(resume) => update({ resume })} />}
        {step === 2 && <TargetForm value={draft.jobTarget} onChange={(jobTarget) => update({ jobTarget })} />}
        {step === 3 && (
          <PreferencesForm value={draft.jobPreferences} onChange={(jobPreferences) => update({ jobPreferences })} />
        )}
        {step === 4 && (
          <div>
            <AiPermissionsForm
              value={draft.aiPermissions}
              onChange={(aiPermissions) => update({ aiPermissions })}
            />
            <h2 className="section-title" style={{ marginTop: 28, marginBottom: 16 }}>
              重要消息通知
            </h2>
            <NotificationForm
              value={draft.notifications}
              onChange={(notifications) => update({ notifications })}
            />
          </div>
        )}
        {step === 5 && <PlatformForm />}
      </div>

      <div className="wizard__footer">
        {meta.skippable ? (
          <button className="wizard__skip" onClick={next}>
            暂时跳过
          </button>
        ) : (
          <span className="wizard__count">
            {step + 1} / {STEPS.length}
          </span>
        )}

        <div className="row" style={{ flex: 'none' }}>
          {step > 0 && (
            <Button variant="secondary" onClick={back}>
              上一步
            </Button>
          )}
          {isLast ? (
            <Button variant="accent" onClick={() => void complete()} disabled={saving}>
              {saving ? '保存中…' : '完成配置'}
            </Button>
          ) : (
            <Button onClick={next}>下一步</Button>
          )}
        </div>
      </div>
    </div>
  );
}
