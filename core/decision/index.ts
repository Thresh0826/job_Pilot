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

/**
 * 用户对决策结果的处理（V0.4-C REVIEW 队列）：
 * - NONE：未处理（REVIEW 默认状态）
 * - ALLOW：用户允许投递（进入待投递队列，本阶段仍不真正投递）
 * - SKIP：用户明确跳过
 * 仅改变决策状态，不影响原始 verdict。
 */
export type DecisionAction = 'NONE' | 'ALLOW' | 'SKIP';

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
  /** 用户处理（V0.4-C：ALLOW / SKIP / NONE）。 */
  userAction: DecisionAction;
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

/* ------------------------------------------------------------------ */
/* V0.4-C 批量分析                                                     */
/* ------------------------------------------------------------------ */

/** 有效岗位 JD 的最小长度：明显过短的文本（验证页 / 异常页）不允许用于决策。 */
export const MIN_JD_LENGTH = 80;

export type BatchAnalysisStatus = 'COMPLETED' | 'CANCELLED';

/** 批量分析实时进度。 */
export interface BatchAnalysisProgress {
  /** 总岗位数：本次发现批次内的全部 NEW 岗位。 */
  total: number;
  /** 已完成决策数（含本次之前已有的有效决策）。 */
  done: number;
  autoApply: number;
  review: number;
  skip: number;
  /** 读取 / 决策失败（含已标记失败的，可后续重新处理）。 */
  failed: number;
  /** 待处理数（无有效决策且未失败标记）。 */
  pending: number;
  /** 本轮已处理的待分析岗位数。 */
  index: number;
  /** 本轮待分析的岗位总数（开始时的 pending）。 */
  todo: number;
  /** 当前正在分析的岗位标题。 */
  currentTitle: string;
}

/** 批量分析结果。口径保证数字对得上：total = done + failed + pending。 */
export interface BatchAnalysisResult {
  status: BatchAnalysisStatus;
  /** 总岗位数：本次发现批次内的全部 NEW 岗位。 */
  total: number;
  /** 已完成决策数 = autoApply + review + skip（含本次之前已有的有效决策）。 */
  done: number;
  autoApply: number;
  review: number;
  skip: number;
  /** 读取 / 决策失败（含已标记失败的，可后续重新处理）。 */
  failed: number;
  /** 待处理数（未完成，可继续分析）。 */
  pending: number;
}

/**
 * 批量分析统计（与批量结果同口径，服务端实时计算）：
 * - 有效状态口径：AUTO_APPLY = verdict AUTO_APPLY 或用户已允许(ALLOW)；
 *   REVIEW = verdict REVIEW 且用户未处理；SKIP = verdict SKIP 或用户已跳过；
 *   FAILED = 详情/决策失败标记；PENDING = 未完成。
 * 校验：total = autoApply + review + skip + failed + pending。
 */
export interface BatchStats {
  total: number;
  autoApply: number;
  review: number;
  skip: number;
  failed: number;
  pending: number;
}

/** REVIEW 队列条目（需要用户决定的岗位 + 决策理由）。 */
export interface ReviewQueueItem {
  platformJobId: string;
  title: string;
  company: string;
  city: string | null;
  salary: string | null;
  location: string | null;
  decision: JobDecision;
}
