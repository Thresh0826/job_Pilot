import { create } from 'zustand';
import type { JobSearchResult } from '../../core/matching';

/**
 * C2：Jobs 页运行期状态（应用未关闭时，切换模块不丢失当前搜索）。
 * 暂不要求重启后恢复；keyword / city / result（含 NEW/SEEN 状态）随页面切换保留。
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
}));
