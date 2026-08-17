import { getDb } from '../database';
import type { SettingsSnapshot } from '../../shared/settings';
import * as settingsRepo from '../repositories/settingsRepository';
import * as profileRepo from '../repositories/profileRepository';
import * as resumeRepo from '../repositories/resumeRepository';
import * as strategyRepo from '../repositories/strategyRepository';
import * as aiRepo from '../repositories/aiRepository';

/** 读取完整设置快照（含当前简历记录）。 */
export function getSettingsSnapshot(): SettingsSnapshot {
  return {
    profile: profileRepo.getProfile(),
    resume: resumeRepo.getLatestResume(),
    jobTarget: strategyRepo.getJobTarget(),
    jobPreferences: strategyRepo.getJobPreferences(),
    aiPermissions: aiRepo.getAiPermissions(),
    notifications: aiRepo.getNotifications(),
    platforms: settingsRepo.getPlatformState(),
  };
}

/**
 * 保存设置快照。resume 字段由简历服务单独管理，此处不写入，
 * 因此保存后返回的快照中的简历始终与数据库一致。
 */
export function saveSettingsSnapshot(snapshot: SettingsSnapshot): SettingsSnapshot {
  const save = getDb().transaction(() => {
    profileRepo.saveProfile(snapshot.profile);
    strategyRepo.saveJobTarget(snapshot.jobTarget);
    strategyRepo.saveJobPreferences(snapshot.jobPreferences);
    aiRepo.saveAiPermissions(snapshot.aiPermissions);
    aiRepo.saveNotifications(snapshot.notifications);
    if (snapshot.platforms.boss === 'CONNECTED' || snapshot.platforms.boss === 'DISCONNECTED') {
      settingsRepo.setPlatformStatus('BOSS', snapshot.platforms.boss);
    }
  });
  save();
  return getSettingsSnapshot();
}

export function getOnboardingCompleted(): boolean {
  return settingsRepo.getOnboardingCompleted();
}

export function setOnboardingCompleted(completed: boolean): void {
  settingsRepo.setOnboardingCompleted(completed);
}
