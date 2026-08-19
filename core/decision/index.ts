import { z } from 'zod';
import type { CandidateProfile } from '../candidate';

/**
 * V0.4-B 岗位决策引擎的数据模型。
 *
 * 决策输入（只使用这些，禁止编造）：
 * - 用户确认后的 Candidate Profile
 * - 用户求职规则（DecisionRules，硬规则优先级高于引擎判断）
 * - 岗位完整 JD（JobDetail.jdText 及结构化字段）
 *
 * 决策输出只有三种：
 * - AUTO_APPLY：明显适合，未来可直接进入自动投递流程
 * - REVIEW：存在重要不确定性 / 关键风险，需要用户决定
 * - SKIP：明显违反用户硬性条件，不应继续浪费时间
 *
 * 原则：不确定时宁可 REVIEW，不擅自 AUTO_APPLY 或 SKIP。
 * 「简历没写」≠「用户不会」——信息显著影响决策时进入 REVIEW。
 */

/** 学历 / 经验要求的容忍程度。 */
export type Tolerance = 'STRICT' | 'FLEXIBLE' | 'IGNORE';

/** 单双休容忍。 */
export type WeekendRule = 'MUST_DOUBLE' | 'PREFER_DOUBLE' | 'SINGLE_OK';

/** 用户求职决策规则（最必要的设置，不做几十项复杂配置）。 */
export interface DecisionRules {
  /** 接受的岗位方向关键词（目标岗位 + 相关岗位），空 = 不限。 */
  targetJobs: string[];
  /** 接受的城市，空 = 不限。 */
  targetCities: string[];
  /** 最低可接受月薪（元），null = 不限。 */
  minSalary: number | null;
  /** 是否接受外包 / 劳务派遣（false = 外包岗位直接跳过）。 */
  acceptOutsourcing: boolean;
  /** 单双休容忍。 */
  weekendPreference: WeekendRule;
  /** 学历要求容忍度：STRICT 不满足即跳过；FLEXIBLE 不满足进入 REVIEW；IGNORE 忽略。 */
  degreeTolerance: Tolerance;
  /** 工作经验要求容忍度：同上。 */
  experienceTolerance: Tolerance;
  /** 明确不能接受的条件关键词（JD 命中任一 → SKIP）。 */
  excludedKeywords: string[];
}

export const decisionRulesSchema = z.object({
  targetJobs: z.array(z.string()),
  targetCities: z.array(z.string()),
  minSalary: z.number().int().nonnegative().nullable(),
  acceptOutsourcing: z.boolean(),
  weekendPreference: z.enum(['MUST_DOUBLE', 'PREFER_DOUBLE', 'SINGLE_OK']),
  degreeTolerance: z.enum(['STRICT', 'FLEXIBLE', 'IGNORE']),
  experienceTolerance: z.enum(['STRICT', 'FLEXIBLE', 'IGNORE']),
  excludedKeywords: z.array(z.string()),
});

/** 默认规则：尽量不因未设置的条件误判，硬条件交给用户显式设置。 */
export function createDefaultDecisionRules(): DecisionRules {
  return {
    targetJobs: [],
    targetCities: [],
    minSalary: null,
    acceptOutsourcing: false,
    weekendPreference: 'PREFER_DOUBLE',
    degreeTolerance: 'FLEXIBLE',
    experienceTolerance: 'FLEXIBLE',
    excludedKeywords: [],
  };
}

/** 决策结论。 */
export type Verdict = 'AUTO_APPLY' | 'REVIEW' | 'SKIP';

/** 引擎置信度（内部参考，不构成产品核心）。 */
export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

/** 岗位决策结果（持久化，同一岗位复用）。 */
export interface JobDecision {
  platform: string;
  platformJobId: string;
  verdict: Verdict;
  /** 内部匹配分 0-100（仅内部参考，不是产品核心）。 */
  score: number;
  confidence: Confidence;
  /** 主要匹配点（来自原文信号）。 */
  matches: string[];
  /** 主要风险（来自原文信号）。 */
  risks: string[];
  /** 关键不确定项（信息不足 / 简历未体现）。 */
  unknowns: string[];
  /** 简短决策理由（模板化，不编造）。 */
  reason: string;
  /** 违反的用户硬规则（SKIP 时非空）。 */
  ruleViolations: string[];
  /** 决策输入指纹（profile + rules + JD），用于过期检测。 */
  contextHash: string;
  createdAt: string;
  updatedAt: string;
}

/** 决策输入（引擎只使用这些字段）。 */
export interface DecisionJobInput {
  platform: string;
  platformJobId: string;
  title: string;
  company: string;
  city?: string;
  salary?: string;
  salaryMin?: number;
  degree?: string;
  experience?: string;
  jobLabels?: string[];
  jdText?: string;
}

export interface DecisionInput {
  job: DecisionJobInput;
  profile: CandidateProfile;
  rules: DecisionRules;
}

/** 决策结果 + 过期状态（读取已有结果时返回）。 */
export interface JobDecisionView {
  decision: JobDecision | null;
  /** 决策输入是否已变化（资料 / 规则 / JD 变更）→ 旧结果可能已过期。 */
  stale: boolean;
  /** 过期原因（供 UI 提示）。 */
  staleReasons: string[];
}
