import { z } from 'zod';
import type { ResumeRecord } from '../core/resume';
import type { CandidateProfile, CandidateSnapshot } from '../core/candidate';
import type {
  BatchAnalysisProgress,
  BatchAnalysisResult,
  BatchStats,
  DecisionAction,
  DecisionRules,
  JobDecisionView,
  ReviewQueueItem,
} from '../core/decision';
import type { Job, JobDetailResult, JobSearchQuery, JobSearchResult } from '../core/matching';
import type {
  JobTarget,
  SearchPlanProgress,
  SearchPlanResult,
  SearchTask,
} from '../core/searchPlan';
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
  GetDecisionRules: 'jobpilot:getDecisionRules',
  SaveDecisionRules: 'jobpilot:saveDecisionRules',
  GetJobDecision: 'jobpilot:getJobDecision',
  AnalyzeJobDecision: 'jobpilot:analyzeJobDecision',
  RunBatchAnalysis: 'jobpilot:runBatchAnalysis',
  CancelBatchAnalysis: 'jobpilot:cancelBatchAnalysis',
  BatchAnalysisProgress: 'jobpilot:batchAnalysisProgress',
  GetBatchStats: 'jobpilot:getBatchStats',
  GetReviewQueue: 'jobpilot:getReviewQueue',
  UpdateJobDecisionAction: 'jobpilot:updateJobDecisionAction',
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

/** C3 求职目标 IPC 输入校验（限制数量，避免一次生成过多搜索任务）。 */
export const jobTargetSchema = z.object({
  targetJob: z.string().trim().min(1, '目标岗位不能为空').max(40),
  relatedKeywords: z.array(z.string().trim().min(1)).max(6, '相关岗位最多 6 个').default([]),
  targetCities: z.array(z.string().trim().min(1)).min(1, '至少需要一个目标城市').max(6, '目标城市最多 6 个'),
});

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
  /** 读取当前简历 + 候选人资料状态（不触发解析）。 */
  getCandidateProfile(): Promise<CandidateSnapshot>;
  /** 解析当前使用的简历并写入资料（未确认）。 */
  parseResume(): Promise<CandidateSnapshot>;
  /** 导入新简历并立即解析（更换简历确认流程）。 */
  importResumeAndParse(path: string): Promise<CandidateSnapshot>;
  /** 保存用户确认 / 修改后的候选人资料。 */
  saveCandidateProfile(profile: CandidateProfile): Promise<CandidateSnapshot>;
  getPlatformStatus(): Promise<BossPlatformStatus>;
  connectPlatform(platform: PlatformType): Promise<PlatformActionResult>;
  checkPlatform(platform: PlatformType): Promise<PlatformActionResult>;
  disconnectPlatform(platform: PlatformType): Promise<PlatformActionResult>;
  searchBossJobs(query: JobSearchQuery): Promise<JobSearchResult>;
  getBossJobDetail(job: Job): Promise<JobDetailResult>;
  getJobTarget(): Promise<JobTarget | null>;
  saveJobTarget(target: JobTarget): Promise<JobTarget>;
  getSearchPlan(): Promise<SearchTask[]>;
  runSearchPlan(): Promise<SearchPlanResult>;
  /** 订阅搜索计划进度；返回取消订阅函数。 */
  onSearchPlanProgress(cb: (progress: SearchPlanProgress) => void): () => void;
  /** V0.4-B 岗位决策。 */
  getDecisionRules(): Promise<DecisionRules>;
  saveDecisionRules(rules: DecisionRules): Promise<DecisionRules>;
  /** 读取已有决策结果（含过期状态，不重新分析）。 */
  getJobDecision(platform: string, platformJobId: string): Promise<JobDecisionView>;
  /** 分析 / 重新分析岗位（覆盖旧结果）。 */
  analyzeJobDecision(platform: string, platformJobId: string): Promise<JobDecisionView>;
  /** V0.4-C：批量分析全部 NEW 岗位（含进度事件）。 */
  runBatchAnalysis(platform: string): Promise<BatchAnalysisResult>;
  /** 停止当前批量分析（已完成结果保留）。 */
  cancelBatchAnalysis(): Promise<void>;
  /** 批量分析前统计（总岗位 / 待处理，用于「分析本次新岗位（N）」）。 */
  getBatchStats(platform: string): Promise<BatchStats>;
  /** 订阅批量分析进度；返回取消订阅函数。 */
  onBatchAnalysisProgress(cb: (progress: BatchAnalysisProgress) => void): () => void;
  /** REVIEW 队列（需要用户决定的岗位）。 */
  getReviewQueue(platform: string): Promise<ReviewQueueItem[]>;
  /** 用户处理 REVIEW：ALLOW / SKIP / NONE（仅改变决策状态）。 */
  updateJobDecisionAction(platform: string, platformJobId: string, action: DecisionAction): Promise<JobDecisionView>;
  /** 从拖拽的 File 对象读取绝对路径（依赖 Electron webUtils）。 */
  getPathForFile(file: File): string;
}
