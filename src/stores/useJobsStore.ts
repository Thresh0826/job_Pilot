import { create } from 'zustand';
import type { JobSearchResult } from '../../core/matching';
import type { SearchPlanProgress, SearchPlanResult, SearchTask } from '../../core/searchPlan';

/**
 * C2/C3：Jobs 页运行期状态（应用未关闭时，切换模块不丢失当前搜索与搜索计划）。
 * 暂不要求重启后恢复；keyword / city / result（含 NEW/SEEN 状态）与计划状态随页面切换保留。
 */
interface JobsState {
  keyword: string;
  city: string;
  result: JobSearchResult | null;
  setKeyword: (v: string) => void;
  setCity: (v: string) => void;
  setResult: (r: JobSearchResult | null) => void;
  /** 详情读取成功后立即将对应岗位置为 SEEN（含“新 N 个”计数同步）。 */
  markJobSeen: (jobId: string) => void;

  /** C3 搜索计划状态（运行中切换模块不丢失进度展示）。 */
  planTasks: SearchTask[];
  setPlanTasks: (tasks: SearchTask[]) => void;
  planProgress: SearchPlanProgress | null;
  setPlanProgress: (p: SearchPlanProgress | null) => void;
  planResult: SearchPlanResult | null;
  setPlanResult: (r: SearchPlanResult | null) => void;
  runningPlan: boolean;
  setRunningPlan: (v: boolean) => void;
}

export const useJobsStore = create<JobsState>((set) => ({
  keyword: '',
  city: '',
  result: null,
  setKeyword: (keyword) => set({ keyword }),
  setCity: (city) => set({ city }),
  setResult: (result) => set({ result }),
  markJobSeen: (jobId) =>
    set((s) => ({
      result: s.result
        ? {
            ...s.result,
            jobs: s.result.jobs.map((j) => (j.id === jobId ? { ...j, status: 'SEEN' } : j)),
          }
        : s.result,
    })),

  planTasks: [],
  setPlanTasks: (planTasks) => set({ planTasks }),
  planProgress: null,
  setPlanProgress: (planProgress) => set({ planProgress }),
  planResult: null,
  setPlanResult: (planResult) => set({ planResult }),
  runningPlan: false,
  setRunningPlan: (runningPlan) => set({ runningPlan }),
}));
