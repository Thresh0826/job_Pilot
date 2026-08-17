import { useEffect, useState } from 'react';
import type { SettingsSnapshot } from '../../shared/settings';
import { useAppStore } from '../stores/useAppStore';
import { Button, Card, useToast } from '../components/ui';
import { ProfileForm } from '../components/forms/ProfileForm';
import { ResumeForm } from '../components/forms/ResumeForm';
import { TargetForm } from '../components/forms/TargetForm';
import { PreferencesForm } from '../components/forms/PreferencesForm';
import { AiPermissionsForm } from '../components/forms/AiPermissionsForm';
import { NotificationForm } from '../components/forms/NotificationForm';
import { PlatformForm } from '../components/forms/PlatformForm';

export default function Settings() {
  const settings = useAppStore((s) => s.settings);
  const settingsLoaded = useAppStore((s) => s.settingsLoaded);
  const loadSettings = useAppStore((s) => s.loadSettings);
  const saveSettings = useAppStore((s) => s.saveSettings);
  const toast = useToast();

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
        <div className="empty">加载中…</div>
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
    <div className="page">
      <div className="page__header">
        <h1 className="page__title">设置</h1>
        <p className="page__desc">所有首次配置的内容都可以在这里随时修改。</p>
      </div>

      <div className="settings__section">
        <div className="settings__section-head">
          <h2 className="settings__section-title">基础资料</h2>
        </div>
        <Card>
          <ProfileForm value={draft.profile} onChange={(profile) => update({ profile })} />
        </Card>
      </div>

      <div className="settings__section">
        <h2 className="settings__section-title">简历</h2>
        <Card>
          <ResumeForm value={draft.resume} onChange={(resume) => update({ resume })} />
        </Card>
      </div>

      <div className="settings__section">
        <h2 className="settings__section-title">求职目标</h2>
        <Card>
          <TargetForm value={draft.jobTarget} onChange={(jobTarget) => update({ jobTarget })} />
        </Card>
      </div>

      <div className="settings__section">
        <h2 className="settings__section-title">工作偏好</h2>
        <Card>
          <PreferencesForm
            value={draft.jobPreferences}
            onChange={(jobPreferences) => update({ jobPreferences })}
          />
        </Card>
      </div>

      <div className="settings__section">
        <h2 className="settings__section-title">AI 权限</h2>
        <Card>
          <AiPermissionsForm
            value={draft.aiPermissions}
            onChange={(aiPermissions) => update({ aiPermissions })}
          />
        </Card>
      </div>

      <div className="settings__section">
        <h2 className="settings__section-title">通知设置</h2>
        <Card>
          <NotificationForm
            value={draft.notifications}
            onChange={(notifications) => update({ notifications })}
          />
        </Card>
      </div>

      <div className="settings__section">
        <h2 className="settings__section-title">招聘平台</h2>
        <Card>
          <PlatformForm value={draft.platforms} onChange={(platforms) => update({ platforms })} />
        </Card>
      </div>

      <div className="settings__save">
        <Button onClick={() => void save()}>保存设置</Button>
      </div>
    </div>
  );
}
