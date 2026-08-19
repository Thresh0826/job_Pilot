import { z } from 'zod';
import type { ResumeRecord } from '../resume';

/**
 * V0.4-A Candidate Profile：从用户简历中提取的结构化候选人资料。
 *
 * 重要原则：
 * - 所有字段只能来自简历原文，禁止编造简历中不存在的信息。
 * - 解析结果只是草稿，用户必须能查看、修改、删除、补充。
 * - 后续 AI Matching（V0.4-B）使用用户确认后的资料。
 */

/** 教育经历条目。 */
export interface EducationItem {
  startDate: string;
  endDate: string;
  school: string;
  major: string;
  degree: string;
}

/** 工作 / 实习经历条目。 */
export interface WorkItem {
  startDate: string;
  endDate: string;
  company: string;
  title: string;
  description: string;
}

/** 项目经历条目。 */
export interface ProjectItem {
  startDate: string;
  endDate: string;
  name: string;
  role: string;
  description: string;
}

/** 候选人资料（结构化）。 */
export interface CandidateProfile {
  /** 姓名（简历中存在时才有）。 */
  name: string;
  /** 手机号（简历中存在时才有）。 */
  phone: string;
  /** 邮箱（简历中存在时才有）。 */
  email: string;
  /** 工作年限的简历原文表述，如 "5年"，未提及则为空。 */
  workYears: string;
  /** 自我评价 / 个人总结（简历中存在时才有）。 */
  summary: string;
  education: EducationItem[];
  workExperience: WorkItem[];
  projectExperience: ProjectItem[];
  skills: string[];
  certificates: string[];
  languages: string[];
}

export const educationItemSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  school: z.string(),
  major: z.string(),
  degree: z.string(),
});

export const workItemSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  company: z.string(),
  title: z.string(),
  description: z.string(),
});

export const projectItemSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  name: z.string(),
  role: z.string(),
  description: z.string(),
});

export const candidateProfileSchema = z.object({
  name: z.string(),
  phone: z.string(),
  email: z.string(),
  workYears: z.string(),
  summary: z.string(),
  education: z.array(educationItemSchema),
  workExperience: z.array(workItemSchema),
  projectExperience: z.array(projectItemSchema),
  skills: z.array(z.string()),
  certificates: z.array(z.string()),
  languages: z.array(z.string()),
});

/** 空资料：未解析时使用。 */
export function createEmptyCandidateProfile(): CandidateProfile {
  return {
    name: '',
    phone: '',
    email: '',
    workYears: '',
    summary: '',
    education: [],
    workExperience: [],
    projectExperience: [],
    skills: [],
    certificates: [],
    languages: [],
  };
}

/**
 * 「我的资料」页面所需的状态快照：
 * - resume：当前正在使用的简历（数据库最新一条）。
 * - profile：候选人资料（可能与当前简历来自不同历史简历）。
 * - profileResumeId：资料解析自哪一份简历；与 resume.id 不一致表示资料已过期。
 * - confirmed：资料是否已由用户人工确认 / 修改过。
 * - warnings：解析完整性提示（如「教育经历」「工作/实习经历」未识别完整），
 *   用户人工保存后清空。
 */
export interface CandidateSnapshot {
  resume: ResumeRecord | null;
  profile: CandidateProfile | null;
  profileResumeId: number | null;
  confirmed: boolean;
  warnings: string[];
}
