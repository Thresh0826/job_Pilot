import { BrowserWindow, ipcMain } from 'electron';
import { IPC, bossSearchInputSchema, jobDetailInputSchema, jobTargetSchema, type BootstrapData, type PlatformActionResult } from '../../shared/ipc';
import {
  settingsSnapshotSchema,
  type BossPlatformStatus,
  type SettingsSnapshot,
} from '../../shared/settings';
import type { ResumeRecord } from '../../core/resume';
import type { CandidateProfile, CandidateSnapshot } from '../../core/candidate';
import type { DecisionRules, JobDecisionView } from '../../core/decision';
import type { Job, JobDetailResult, JobSearchResult } from '../../core/matching';
import type { JobTarget, SearchPlanResult, SearchTask } from '../../core/searchPlan';
import { getDataDir } from '../../database/database';
import { getRunMode } from '../../database/repositories/settingsRepository';
import * as settingsService from '../../database/services/settingsService';
import { importResumeFromPath, pickResume, removeResume } from './services/resumeService';
import {
  getCandidateSnapshot,
  importResumeAndParse,
  parseCurrentResume,
  saveCandidateProfile,
} from './services/candidateService';
import {
  checkBossConnection,
  connectBoss,
  disconnectBoss,
  getBossJobDetail,
  getBossStatus,
  searchBossJobs,
} from './services/platformService';
import { loadJobTarget, loadSearchPlan, persistJobTarget, runSearchPlan } from './services/searchPlanService';
import {
  analyzeJobDecision,
  getDecisionRules,
  getJobDecision,
  saveDecisionRules,
} from './services/decisionService';

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

  ipcMain.handle(IPC.GetCandidateProfile, (): CandidateSnapshot => getCandidateSnapshot());

  ipcMain.handle(IPC.ParseResume, async (): Promise<CandidateSnapshot> => parseCurrentResume());

  ipcMain.handle(IPC.ImportResumeAndParse, async (_event, rawPath: unknown): Promise<CandidateSnapshot> => {
    if (typeof rawPath !== 'string' || rawPath.length === 0) {
      throw new Error('无效的文件路径。');
    }
    return importResumeAndParse(rawPath);
  });

  ipcMain.handle(IPC.SaveCandidateProfile, (_event, raw: unknown): CandidateSnapshot => {
    return saveCandidateProfile(raw as CandidateProfile);
  });

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

  ipcMain.handle(IPC.SearchBossJobs, async (_event, raw: unknown): Promise<JobSearchResult> => {
    const parsed = bossSearchInputSchema.safeParse(raw);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? '搜索参数无效';
      return { status: 'INVALID_RESPONSE', jobs: [], message };
    }
    return searchBossJobs(parsed.data);
  });

  ipcMain.handle(IPC.GetBossJobDetail, async (_event, raw: unknown): Promise<JobDetailResult> => {
    const parsed = jobDetailInputSchema.safeParse(raw);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? '岗位参数无效';
      return { status: 'DETAIL_PARSE_FAILED', detail: null, message };
    }
    return getBossJobDetail(parsed.data as unknown as Job);
  });

  ipcMain.handle(IPC.GetJobTarget, (): JobTarget | null => loadJobTarget());

  ipcMain.handle(IPC.SaveJobTarget, (_event, raw: unknown): JobTarget => {
    const parsed = jobTargetSchema.safeParse(raw);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? '求职目标无效';
      throw new Error(`求职目标校验失败：${message}`);
    }
    return persistJobTarget(parsed.data);
  });

  ipcMain.handle(IPC.GetSearchPlan, (): SearchTask[] => loadSearchPlan());

  ipcMain.handle(IPC.RunSearchPlan, async (event): Promise<SearchPlanResult> => {
    const tasks = loadSearchPlan();
    if (tasks.length === 0) {
      return {
        status: 'COMPLETED',
        total: 0,
        succeeded: 0,
        failed: 0,
        discovered: 0,
        newCount: 0,
        seenCount: 0,
        failures: [],
      };
    }
    const sender = event.sender;
    try {
      return await runSearchPlan(tasks, {
        onProgress: (progress) => {
          if (!sender.isDestroyed()) sender.send(IPC.SearchPlanProgress, progress);
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        status: 'STOPPED',
        total: tasks.length,
        succeeded: 0,
        failed: 1,
        discovered: 0,
        newCount: 0,
        seenCount: 0,
        failures: [{ task: tasks[0], status: 'INVALID_RESPONSE', message: `自动搜索异常：${message}` }],
        stopReason: { task: tasks[0], status: 'INVALID_RESPONSE', message: `自动搜索异常：${message}` },
      };
    }
  });

  ipcMain.handle(IPC.GetDecisionRules, (): DecisionRules => getDecisionRules());

  ipcMain.handle(IPC.SaveDecisionRules, (_event, raw: unknown): DecisionRules => {
    return saveDecisionRules(raw as DecisionRules);
  });

  ipcMain.handle(IPC.GetJobDecision, (_event, platform: unknown, platformJobId: unknown): JobDecisionView => {
    if (typeof platform !== 'string' || typeof platformJobId !== 'string' || !platformJobId) {
      return { decision: null, stale: false, staleReasons: [] };
    }
    return getJobDecision(platform, platformJobId);
  });

  ipcMain.handle(IPC.AnalyzeJobDecision, (_event, platform: unknown, platformJobId: unknown): JobDecisionView => {
    if (typeof platform !== 'string' || typeof platformJobId !== 'string' || !platformJobId) {
      throw new Error('无效的岗位标识。');
    }
    return analyzeJobDecision(platform, platformJobId);
  });
}
