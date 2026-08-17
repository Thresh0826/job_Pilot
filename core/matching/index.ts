import type { PlatformType } from '../../shared/enums';

/** 招聘岗位（V0.1 用于模拟数据与未来平台适配器）。 */
export interface Job {
  id: string;
  title: string;
  company: string;
  /** 展示用薪资，例如 "6-8K"。 */
  salary: string;
  salaryMin?: number;
  salaryMax?: number;
  location: string;
  industry?: string;
  platform: PlatformType;
  /** 匹配度 0-100。 */
  matchScore?: number;
  tags?: string[];
  postedAt?: string;
  /** 区/县，例如 "无锡滨湖"。 */
  district?: string;
  /** 学历要求，例如 "本科"。 */
  education?: string;
  /** 经验要求，例如 "经验不限"。 */
  experience?: string;
  /** JobPilot 推荐摘要（结构化说明为什么推荐）。 */
  aiSummary?: string;
}
