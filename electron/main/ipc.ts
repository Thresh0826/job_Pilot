import { BrowserWindow, ipcMain } from 'electron';
import { IPC, type BootstrapData, type PlatformActionResult } from '../../shared/ipc';
import {
  settingsSnapshotSchema,
  type BossPlatformStatus,
  type SettingsSnapshot,
} from '../../shared/settings';
import type { ResumeRecord } from '../../core/resume';
import { getDataDir } from '../../database/database';
import { getRunMode } from '../../database/repositories/settingsRepository';
import * as settingsService from '../../database/services/settingsService';
import { importResumeFromPath, pickResume, removeResume } from './services/resumeService';
import {
  checkBossConnection,
  connectBoss,
  disconnectBoss,
  getBossStatus,
} from './services/platformService';

function buildBootstrap(): BootstrapData {
  return {
    onboardingCompleted: settingsService.getOnboardingCompleted(),
    runMode: getRunMode(),
    dataDir: getDataDir(),
  };
}

function isBoss(raw: unknown): boolean {
  return raw === 'BOSS';
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

  ipcMain.handle(IPC.GetPlatformStatus, (): BossPlatformStatus => getBossStatus());

  ipcMain.handle(IPC.ConnectPlatform, async (_event, rawPlatform: unknown): Promise<PlatformActionResult> => {
    if (!isBoss(rawPlatform)) return { status: 'ERROR', message: '该平台尚未接入。' };
    return connectBoss();
  });

  ipcMain.handle(IPC.CheckPlatform, async (_event, rawPlatform: unknown): Promise<PlatformActionResult> => {
    if (!isBoss(rawPlatform)) return { status: 'ERROR', message: '该平台尚未接入。' };
    return checkBossConnection();
  });

  ipcMain.handle(IPC.DisconnectPlatform, async (_event, rawPlatform: unknown): Promise<PlatformActionResult> => {
    if (!isBoss(rawPlatform)) return { status: 'ERROR', message: '该平台尚未接入。' };
    return disconnectBoss();
  });
}
