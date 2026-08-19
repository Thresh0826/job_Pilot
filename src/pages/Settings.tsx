import { useEffect, useState } from 'react';
import {
  Bell,
  Bot,
  Gavel,
  Plug,
  Settings as SettingsIcon,
  SlidersHorizontal,
  Target,
  User,
  type LucideIcon,
} from 'lucide-react';
import type { SettingsSnapshot } from '../../shared/settings';
import { useAppStore } from '../stores/useAppStore';
import { Badge, Button, useToast } from '../components/ui';
import { PageHeader } from '../components/PageHeader';
import { ProfileForm } from '../components/forms/ProfileForm';
import { ResumeForm } from '../components/forms/ResumeForm';
import { TargetForm } from '../components/forms/TargetForm';
import { PreferencesForm } from '../components/forms/PreferencesForm';
import { AiPermissionsForm } from '../components/forms/AiPermissionsForm';
import { NotificationForm } from '../components/forms/NotificationForm';
import { PlatformForm } from '../components/forms/PlatformForm';
import { DecisionRulesForm } from '../components/forms/DecisionRulesForm';

type SectionId = 'profile' | 'target' | 'decision' | 'preference' | 'ai' | 'platform' | 'notification' | 'app';

const SECTIONS: { id: SectionId; label: string; icon: LucideIcon }[] = [
  { id: 'profile', label: '个人资料', icon: User },
  { id: 'target', label: '求职目标', icon: Target },
  { id: 'decision', label: '求职规则', icon: Gavel },
  { id: 'preference', label: '工作偏好', icon: SlidersHorizontal },
  { id: 'ai', label: 'AI 权限', icon: Bot },
  { id: 'platform', label: '招聘平台', icon: Plug },
  { id: 'notification', label: '通知', icon: Bell },
  { id: 'app', label: '应用设置', icon: SettingsIcon },
];

export default function Settings() {
  const settings = useAppStore((s) => s.settings);
  const settingsLoaded = useAppStore((s) => s.settingsLoaded);
  const loadSettings = useAppStore((s) => s.loadSettings);
  const saveSettings = useAppStore((s) => s.saveSettings);
  const runMode = useAppStore((s) => s.runMode);
  const dataDir = useAppStore((s) => s.dataDir);
  const toast = useToast();

  const [section, setSection] = useState<SectionId>('profile');
  const [draft, setDraft] = useState<SettingsSnapshot | null>(settings);

  useEffect(() => {
    if (!settingsLoaded) void loadSettings();
  }, [settingsLoaded, loadSettings]);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  if (!draft) {
    return (
      <div className="page">
        <div className="empty">正在读取你的求职设置…</div>
      </div>
    );
  }

  const update = (patch: Partial<SettingsSnapshot>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const save = async () => {
    if (!draft) return;
    await saveSettings(draft);
    toast('设置已保存');
  };

  return (
    <div className="page" style={{ maxWidth: 1080 }}>
      <PageHeader title="设置" desc="所有首次配置的内容都可以在这里随时修改。" />

      <div className="settings">
        <nav className="settings__nav" aria-label="设置分类">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                className={`settings__nav-item ${section === s.id ? 'settings__nav-item--active' : ''}`}
                onClick={() => setSection(s.id)}
              >
                <Icon size={16} strokeWidth={1.8} />
                {s.label}
              </button>
            );
          })}
        </nav>

        <div className="settings__panel">
          <div className="card">
            {section === 'profile' && (
              <div>
                <ProfileForm value={draft.profile} onChange={(profile) => update({ profile })} />
                <h2 className="section-title" style={{ margin: '24px 0 16px' }}>
                  简历
                </h2>
                <ResumeForm value={draft.resume} onChange={(resume) => update({ resume })} />
              </div>
            )}

            {section === 'target' && (
              <TargetForm value={draft.jobTarget} onChange={(jobTarget) => update({ jobTarget })} />
            )}

            {section === 'decision' && (
              <div>
                <h2 className="section-title" style={{ margin: '0 0 16px' }}>
                  求职规则
                </h2>
                <div className="small muted" style={{ marginBottom: 24 }}>
                  JobPilot 判断岗位时使用的硬性条件：你的明确规则优先级高于 AI 判断。
                </div>
                <DecisionRulesForm />
              </div>
            )}

            {section === 'preference' && (
              <PreferencesForm
                value={draft.jobPreferences}
                onChange={(jobPreferences) => update({ jobPreferences })}
              />
            )}

            {section === 'ai' && (
              <AiPermissionsForm
                value={draft.aiPermissions}
                onChange={(aiPermissions) => update({ aiPermissions })}
              />
            )}

            {section === 'platform' && <PlatformForm />}

            {section === 'notification' && (
              <NotificationForm
                value={draft.notifications}
                onChange={(notifications) => update({ notifications })}
              />
            )}

            {section === 'app' && (
              <div>
                <div className="field">
                  <span className="field__label">运行模式</span>
                  <div>
                    {runMode === 'TEST' ? <Badge variant="test">测试模式</Badge> : <Badge variant="agent">正式模式</Badge>}
                  </div>
                  <span className="hint">测试模式下禁止真实投递与发送消息，仅使用本地模拟数据。</span>
                </div>
                <div className="field">
                  <span className="field__label">数据目录</span>
                  <div className="small muted" style={{ wordBreak: 'break-all' }}>
                    {dataDir || '—'}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="settings__save">
            <Button onClick={() => void save()}>保存设置</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
