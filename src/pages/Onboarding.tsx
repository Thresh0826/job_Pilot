import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { createDefaultSettings, type SettingsSnapshot } from '../../shared/settings';
import { useAppStore } from '../stores/useAppStore';
import { Button } from '../components/ui';
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
  { title: '基础资料', subtitle: '让我们先认识一下你', skippable: true },
  { title: '简历', subtitle: '上传你的简历，帮助我们了解你的经历', skippable: true },
  { title: '求职目标', subtitle: '告诉 JobPilot 你想找什么样的工作', skippable: true },
  { title: '工作偏好', subtitle: '你的工作偏好与底线', skippable: true },
  { title: 'AI 权限', subtitle: '决定 AI 可以自动回复哪些内容', skippable: true },
  { title: '招聘平台', subtitle: '连接招聘平台（当前为占位）', skippable: false },
];

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
            <CheckCircle2 size={64} color="var(--success)" style={{ marginBottom: 20 }} />
            <h1 className="wizard__title">准备完成</h1>
            <p className="wizard__subtitle" style={{ maxWidth: 360, margin: '0 auto 32px' }}>
              JobPilot 已了解你的基础求职需求。
              <br />
              这些设置以后可以随时修改。
            </p>
            <Button size="md" onClick={() => goDashboard('home')}>
              开始找工作
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="wizard">
      <div className="wizard__head">
        <div className="wizard__brand">
          <div className="sidebar__logo">J</div>
          <span className="sidebar__name">JobPilot</span>
        </div>
        <div className="steps">
          {STEPS.map((s, i) => (
            <div key={s.title} className={`step ${i < step ? 'step--done' : i === step ? 'step--active' : ''}`} />
          ))}
        </div>
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
            <h2 className="card__title" style={{ marginTop: 26 }}>
              重要消息通知
            </h2>
            <NotificationForm
              value={draft.notifications}
              onChange={(notifications) => update({ notifications })}
            />
          </div>
        )}
        {step === 5 && <PlatformForm value={draft.platforms} onChange={(platforms) => update({ platforms })} />}
      </div>

      <div className="wizard__footer">
        {meta.skippable ? (
          <button className="wizard__skip" onClick={next}>
            暂时跳过
          </button>
        ) : (
          <span />
        )}

        <div className="row" style={{ flex: 'none' }}>
          {step > 0 && (
            <Button variant="ghost" onClick={back}>
              上一步
            </Button>
          )}
          {isLast ? (
            <Button onClick={() => void complete()} disabled={saving}>
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
