import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { JobPilotApi } from '../../shared/ipc';
import type { SettingsSnapshot } from '../../shared/settings';
import type { PlatformType } from '../../shared/enums';

/**
 * 由于 sandbox: true，preload 无法 require 本地模块，因此这里内联 IPC 通道名
 * （仅字符串字面量，与 shared/ipc.ts 中的 IPC 常量保持一致，无运行时依赖）。
 * 渲染进程只能通过该 API 访问最小必要能力，遵循 contextIsolation + sandbox。
 */
const IPC = {
  Bootstrap: 'jobpilot:bootstrap',
  GetSettings: 'jobpilot:getSettings',
  SaveSettings: 'jobpilot:saveSettings',
  CompleteOnboarding: 'jobpilot:completeOnboarding',
  PickResume: 'jobpilot:pickResume',
  ImportResume: 'jobpilot:importResume',
  RemoveResume: 'jobpilot:removeResume',
  GetCandidateProfile: 'jobpilot:getCandidateProfile',
  ParseResume: 'jobpilot:parseResume',
  ImportResumeAndParse: 'jobpilot:importResumeAndParse',
  SaveCandidateProfile: 'jobpilot:saveCandidateProfile',
  GetPlatformStatus: 'jobpilot:getPlatformStatus',
  ConnectPlatform: 'jobpilot:connectPlatform',
  CheckPlatform: 'jobpilot:checkPlatform',
  DisconnectPlatform: 'jobpilot:disconnectPlatform',
  SearchBossJobs: 'jobpilot:searchBossJobs',
  GetBossJobDetail: 'jobpilot:getBossJobDetail',
  GetJobTarget: 'jobpilot:getJobTarget',
  SaveJobTarget: 'jobpilot:saveJobTarget',
  GetSearchPlan: 'jobpilot:getSearchPlan',
  RunSearchPlan: 'jobpilot:runSearchPlan',
  SearchPlanProgress: 'jobpilot:searchPlanProgress',
} as const;

const api: JobPilotApi = {
  bootstrap: () => ipcRenderer.invoke(IPC.Bootstrap),
  getSettings: () => ipcRenderer.invoke(IPC.GetSettings),
  saveSettings: (snapshot: SettingsSnapshot) => ipcRenderer.invoke(IPC.SaveSettings, snapshot),
  completeOnboarding: () => ipcRenderer.invoke(IPC.CompleteOnboarding),
  pickResume: () => ipcRenderer.invoke(IPC.PickResume),
  importResume: (filePath: string) => ipcRenderer.invoke(IPC.ImportResume, filePath),
  removeResume: () => ipcRenderer.invoke(IPC.RemoveResume),
  getCandidateProfile: () => ipcRenderer.invoke(IPC.GetCandidateProfile),
  parseResume: () => ipcRenderer.invoke(IPC.ParseResume),
  importResumeAndParse: (filePath: string) => ipcRenderer.invoke(IPC.ImportResumeAndParse, filePath),
  saveCandidateProfile: (profile) => ipcRenderer.invoke(IPC.SaveCandidateProfile, profile),
  getPlatformStatus: () => ipcRenderer.invoke(IPC.GetPlatformStatus),
  connectPlatform: (platform: PlatformType) => ipcRenderer.invoke(IPC.ConnectPlatform, platform),
  checkPlatform: (platform: PlatformType) => ipcRenderer.invoke(IPC.CheckPlatform, platform),
  disconnectPlatform: (platform: PlatformType) => ipcRenderer.invoke(IPC.DisconnectPlatform, platform),
  searchBossJobs: (query) => ipcRenderer.invoke(IPC.SearchBossJobs, query),
  getBossJobDetail: (job) => ipcRenderer.invoke(IPC.GetBossJobDetail, job),
  getJobTarget: () => ipcRenderer.invoke(IPC.GetJobTarget),
  saveJobTarget: (target) => ipcRenderer.invoke(IPC.SaveJobTarget, target),
  getSearchPlan: () => ipcRenderer.invoke(IPC.GetSearchPlan),
  runSearchPlan: () => ipcRenderer.invoke(IPC.RunSearchPlan),
  onSearchPlanProgress: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: unknown) => cb(progress as never);
    ipcRenderer.on(IPC.SearchPlanProgress, listener);
    return () => ipcRenderer.removeListener(IPC.SearchPlanProgress, listener);
  },
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
};

contextBridge.exposeInMainWorld('api', api);
