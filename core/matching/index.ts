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
}
