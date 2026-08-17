import type { ResumeRecord } from '../core/resume';
import type { PlatformType, RunMode } from './enums';
import type { SettingsSnapshot } from './settings';

/** 应用启动引导信息。 */
export interface BootstrapData {
  onboardingCompleted: boolean;
  runMode: RunMode;
  dataDir: string;
}

/** 平台连接占位结果。 */
export interface ConnectPlatformResult {
  platform: PlatformType;
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
  ConnectPlatform: 'jobpilot:connectPlatform',
} as const;

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
  connectPlatform(platform: PlatformType): Promise<ConnectPlatformResult>;
  /** 从拖拽的 File 对象读取绝对路径（依赖 Electron webUtils）。 */
  getPathForFile(file: File): string;
}
