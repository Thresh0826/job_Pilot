import { BrowserWindow, ipcMain } from 'electron';
import { IPC, type BootstrapData, type ConnectPlatformResult } from '../../shared/ipc';
import { settingsSnapshotSchema, type SettingsSnapshot } from '../../shared/settings';
import type { PlatformType } from '../../shared/enums';
import type { ResumeRecord } from '../../core/resume';
import { getDataDir } from '../../database/database';
import { getRunMode } from '../../database/repositories/settingsRepository';
import * as settingsService from '../../database/services/settingsService';
import { importResumeFromPath, pickResume, removeResume } from './services/resumeService';

function buildBootstrap(): BootstrapData {
  return {
    onboardingCompleted: settingsService.getOnboardingCompleted(),
    runMode: getRunMode(),
    dataDir: getDataDir(),
  };
}

/** 注册所有 IPC handler。渲染进程只能通过 preload 暴露的 API 调用这些通道。 */
export function registerIpc(): void {
  ipcMain.handle(IPC.Bootstrap, (): BootstrapData => buildBootstrap());

  ipcMain.handle(IPC.GetSettings, (): SettingsSnapshot => settingsService.getSettingsSnapshot());

  ipcMain.handle(IPC.SaveSettings, (_event, raw: unknown): SettingsSnapshot => {
    const parsed = settingsSnapshotSchema.safeParse(raw);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? '未知错误';
      throw new Error(`设置数据校验失败：${message}`);
    }
    return settingsService.saveSettingsSnapshot(parsed.data);
  });

  ipcMain.handle(IPC.CompleteOnboarding, (): BootstrapData => {
    settingsService.setOnboardingCompleted(true);
    return buildBootstrap();
  });

  ipcMain.handle(IPC.PickResume, (event): ResumeRecord | null => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    return pickResume(win);
  });

  ipcMain.handle(IPC.ImportResume, (_event, rawPath: unknown): ResumeRecord => {
    if (typeof rawPath !== 'string' || rawPath.length === 0) {
      throw new Error('无效的文件路径。');
    }
    return importResumeFromPath(rawPath);
  });

  ipcMain.handle(IPC.RemoveResume, (): boolean => removeResume());

  ipcMain.handle(IPC.ConnectPlatform, (_event, rawPlatform: unknown): ConnectPlatformResult => {
    const platform: PlatformType =
      rawPlatform === 'BOSS' || rawPlatform === 'ZHILIAN' || rawPlatform === 'JOB51' || rawPlatform === 'LIEPIN'
        ? rawPlatform
        : 'BOSS';
    return { platform, message: '平台接入将在下一阶段实现。' };
  });
}
