import { z } from 'zod';
import type { ResumeRecord } from '../core/resume';
import type { Job, JobDetailResult, JobSearchQuery, JobSearchResult } from '../core/matching';
import type { PlatformStatus, PlatformType, RunMode } from './enums';
import type { BossPlatformStatus, SettingsSnapshot } from './settings';

/** 应用启动引导信息。 */
export interface BootstrapData {
  onboardingCompleted: boolean;
  runMode: RunMode;
  dataDir: string;
}

/** 平台操作结果（连接 / 检查 / 断开）。 */
export interface PlatformActionResult {
  status: PlatformStatus;
  message: string;
}

/** IPC 通道名。 */
export const IPC = {
  Bootstrap: 'jobpilot:bootstrap',
  GetSettings: 'jobpilot:getSettings',
  SaveSettings: 'jobpilot:saveSettings',
  CompleteOnboarding: 'jobpilot:completeOnboarding',
  PickResume: 'jobpilot:pickResume',
  ImportResume: 'jobpilot:importResume',
  RemoveResume: 'jobpilot:removeResume',
  GetPlatformStatus: 'jobpilot:getPlatformStatus',
  ConnectPlatform: 'jobpilot:connectPlatform',
  CheckPlatform: 'jobpilot:checkPlatform',
  DisconnectPlatform: 'jobpilot:disconnectPlatform',
  SearchBossJobs: 'jobpilot:searchBossJobs',
  GetBossJobDetail: 'jobpilot:getBossJobDetail',
} as const;

/** 岗位搜索 IPC 输入校验。 */
export const bossSearchInputSchema = z.object({
  keyword: z.string().min(1, '搜索关键词不能为空'),
  city: z.string().min(1, '城市不能为空'),
  maxJobs: z.number().int().min(1).max(200).optional(),
  maxBatches: z.number().int().min(1).max(20).optional(),
});

/** 岗位详情 IPC 输入校验（保留 Job 其余字段供详情读取使用）。 */
export const jobDetailInputSchema = z
  .object({
    platform: z.string(),
    platformJobId: z.string().optional(),
    jobUrl: z.string().optional(),
  })
  .passthrough()
  .refine((v) => v.platformJobId || v.jobUrl, { message: '缺少岗位标识' });

/**
 * preload 通过 contextBridge 暴露给渲染进程的能力。
 * 渲染进程只能访问该接口，无法直接接触 Node / Electron 完整能力。
 */
export interface JobPilotApi {
  bootstrap(): Promise<BootstrapData>;
  getSettings(): Promise<SettingsSnapshot>;
  saveSettings(snapshot: SettingsSnapshot): Promise<SettingsSnapshot>;
  completeOnboarding(): Promise<BootstrapData>;
  pickResume(): Promise<ResumeRecord | null>;
  importResume(path: string): Promise<ResumeRecord | null>;
  removeResume(): Promise<boolean>;
  getPlatformStatus(): Promise<BossPlatformStatus>;
  connectPlatform(platform: PlatformType): Promise<PlatformActionResult>;
  checkPlatform(platform: PlatformType): Promise<PlatformActionResult>;
  disconnectPlatform(platform: PlatformType): Promise<PlatformActionResult>;
  searchBossJobs(query: JobSearchQuery): Promise<JobSearchResult>;
  getBossJobDetail(job: Job): Promise<JobDetailResult>;
  /** 从拖拽的 File 对象读取绝对路径（依赖 Electron webUtils）。 */
  getPathForFile(file: File): string;
}
