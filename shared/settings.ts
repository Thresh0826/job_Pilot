import { z } from 'zod';
import { EMPTY_PROFILE, userProfileSchema, type UserProfile } from '../core/profile';
import { resumeRecordSchema, type ResumeRecord } from '../core/resume';
import {
  DEFAULT_JOB_PREFERENCES,
  EMPTY_JOB_TARGET,
  jobTargetSchema,
  jobPreferencesSchema,
  type JobTarget,
  type JobPreferences,
} from '../core/strategy';
import { aiPermissionSchema, DEFAULT_AI_PERMISSIONS, type AiPermissionConfig } from '../core/ai';
import {
  notificationConfigSchema,
  DEFAULT_NOTIFICATIONS,
  type NotificationConfig,
} from '../core/notification';
import type { PlatformStatus } from './enums';

/** 招聘平台账户状态（V0.1 仅 BOSS 占位）。 */
export interface PlatformAccountState {
  boss: PlatformStatus;
}

/** 设置 / 首次配置的聚合快照，跨 IPC 传输。 */
export interface SettingsSnapshot {
  profile: UserProfile;
  resume: ResumeRecord | null;
  jobTarget: JobTarget;
  jobPreferences: JobPreferences;
  aiPermissions: AiPermissionConfig;
  notifications: NotificationConfig;
  platforms: PlatformAccountState;
}

export const platformAccountStateSchema = z.object({
  boss: z.enum(['DISCONNECTED', 'CONNECTED', 'COMING_SOON']),
});

/** 构造一份完整的默认设置，用于首次进入 Onboarding 时的表单初始值。 */
export function createDefaultSettings(): SettingsSnapshot {
  return {
    profile: { ...EMPTY_PROFILE, targetCities: [] },
    resume: null,
    jobTarget: { ...EMPTY_JOB_TARGET },
    jobPreferences: { ...DEFAULT_JOB_PREFERENCES, companySizes: [] },
    aiPermissions: { ...DEFAULT_AI_PERMISSIONS },
    notifications: { ...DEFAULT_NOTIFICATIONS },
    platforms: { boss: 'DISCONNECTED' },
  };
}

export const settingsSnapshotSchema = z.object({
  profile: userProfileSchema,
  resume: resumeRecordSchema.nullable(),
  jobTarget: jobTargetSchema,
  jobPreferences: jobPreferencesSchema,
  aiPermissions: aiPermissionSchema,
  notifications: notificationConfigSchema,
  platforms: platformAccountStateSchema,
});
