import crypto from 'node:crypto';
import type { CandidateProfile } from '../../../core/candidate';
import {
  MIN_JD_LENGTH,
  createDefaultDecisionRules,
  decisionRulesSchema,
  type DecisionAction,
  type DecisionInput,
  type DecisionJobInput,
  type DecisionRules,
  type JobDecision,
  type JobDecisionView,
  type ReviewQueueItem,
} from '../../../core/decision';
import { computeHardViolations, decideJob } from '../../../core/decision/engine';
import type { DecisionLlmProvider, LlmDecision } from '../../../core/decision/provider';
import * as decisionRepo from '../../../database/repositories/decisionRepository';
import { clearAnalysisFailed, getJobDecisionSource } from '../../../database/repositories/jobRepository';
import { getAiModelConfig } from '../../../database/repositories/settingsRepository';
import { getCandidateSnapshot } from './candidateService';
import { DeepSeekProvider } from './llm/deepseekProvider';
import { logger } from '../logger';

/**
 * V0.4-B 岗位决策服务（Electron Main）。
 * 输入：确认后的 Candidate Profile + 求职规则 + 岗位完整 JD（全部本地）。
 * 输出：AUTO_APPLY / REVIEW / SKIP + 简短理由（持久化，同一岗位复用；资料/规则/JD 变化后标记过期）。
 */

function currentRules(): DecisionRules {
  return decisionRepo.getDecisionRules() ?? createDefaultDecisionRules();
}

function currentProfile(): CandidateProfile | null {
  return getCandidateSnapshot().profile;
}

function hashPart(v: unknown): string {
  return crypto.createHash('sha1').update(JSON.stringify(v)).digest('hex');
}

/** 决策上下文指纹：profile | rules | job 三部分各自哈希，便于给出具体过期原因。 */
function buildContextHash(job: DecisionJobInput, profile: CandidateProfile, rules: DecisionRules): string {
  return [
    hashPart(profile),
    hashPart(rules),
    hashPart({
      title: job.title,
      salary: job.salary,
      salaryMin: job.salaryMin,
      city: job.city,
      degree: job.degree,
      experience: job.experience,
      jobLabels: job.jobLabels,
      jdText: job.jdText,
    }),
  ].join('|');
}

function staleReasons(savedHash: string, currentHash: string): string[] {
  if (!savedHash || savedHash === currentHash) return [];
  const parts = currentHash.split('|');
  const saved = savedHash.split('|');
  const reasons: string[] = [];
  if (saved[0] !== parts[0]) reasons.push('你的简历资料已修改，旧决策可能已过期');
  if (saved[1] !== parts[1]) reasons.push('你的求职规则已修改，旧决策可能已过期');
  if (saved[2] !== parts[2]) reasons.push('岗位详情（JD）已变化，旧决策可能已过期');
  return reasons.length > 0 ? reasons : ['决策输入已变化，旧决策可能已过期'];
}

function buildJobInput(
  platform: string,
  platformJobId: string,
): DecisionJobInput | null {
  const row = getJobDecisionSource(platform, platformJobId);
  if (!row) return null;
  let jobLabels: string[] = [];
  try {
    const parsed = JSON.parse(row.job_labels ?? '[]');
    if (Array.isArray(parsed)) jobLabels = parsed.filter((x) => typeof x === 'string');
  } catch {
    // 忽略异常标签
  }
  return {
    platform,
    platformJobId,
    title: row.title ?? '',
    company: row.company ?? '',
    city: row.city ?? undefined,
    salary: row.salary ?? undefined,
    degree: row.degree ?? undefined,
    experience: row.experience ?? undefined,
    jobLabels,
    jdText: row.jd_text ?? undefined,
  };
}

/** 读取已有决策结果 + 过期状态（不重新分析）。 */
export function getJobDecision(platform: string, platformJobId: string): JobDecisionView {
  const job = buildJobInput(platform, platformJobId);
  if (!job || !job.jdText) {
    return { decision: null, stale: false, staleReasons: [] };
  }
  const saved = decisionRepo.getDecision(platform, platformJobId);
  if (!saved) {
    return { decision: null, stale: false, staleReasons: [] };
  }
  const profile = currentProfile();
  const rules = currentRules();
  if (!profile) {
    // 资料被删除：结果视为过期，但不销毁历史结果。
    return { decision: saved, stale: true, staleReasons: ['候选人资料已不存在，旧决策已过期'] };
  }
  const currentHash = buildContextHash(job, profile, rules);
  const reasons = staleReasons(saved.contextHash, currentHash);
  return { decision: saved, stale: reasons.length > 0, staleReasons: reasons };
}

/**
 * 分析（或重新分析）岗位：读取本地数据 → 决策（LLM Provider 优先，未配置回退本地规则引擎）→ 持久化。
 * 同一岗位重复调用即“重新分析”，直接覆盖旧结果。
 */
export function analyzeJobDecision(platform: string, platformJobId: string): Promise<JobDecisionView> {
  const provider = buildConfiguredProvider();
  return analyzeJobDecisionWith(platform, platformJobId, provider);
}

/** 读取 AI 配置并构造 Provider；未配置 Key 时返回 null（调用方回退本地引擎）。 */
export function buildConfiguredProvider(): DecisionLlmProvider | null {
  const cfg = getAiModelConfig();
  if (!cfg.provider || !cfg.apiKey) return null;
  if (cfg.provider === 'deepseek') {
    return new DeepSeekProvider({ apiKey: cfg.apiKey, model: cfg.model });
  }
  return null;
}

/**
 * 使用指定 Provider 分析岗位（测试可注入 mock）。
 * provider 为 null 时回退本地确定性规则引擎。
 */
export async function analyzeJobDecisionWith(
  platform: string,
  platformJobId: string,
  provider: DecisionLlmProvider | null,
): Promise<JobDecisionView> {
  const job = buildJobInput(platform, platformJobId);
  if (!job) throw new Error('岗位不存在，请先读取岗位详情。');
  if (!job.jdText) throw new Error('岗位缺少完整 JD，请先打开岗位详情。');
  if (job.jdText.length < MIN_JD_LENGTH) {
    throw new Error('岗位详情内容不完整（可能未正确加载），请重新打开详情后重试。');
  }

  const profile = currentProfile();
  if (!profile) throw new Error('还没有候选人资料，请先在「我的资料」上传简历并确认。');
  const rules = currentRules();
  const input: DecisionInput = { job, profile, rules };
  const contextHash = buildContextHash(job, profile, rules);

  let base: ReturnType<typeof decideJob>;
  if (provider) {
    base = await decideWithLlm(input, provider);
  } else {
    base = decideJob(input);
  }
  const decision = decisionRepo.upsertDecision({ ...base, contextHash });
  // 分析成功 → 清除批量失败标记（失败岗位可通过单岗位分析重试）
  clearAnalysisFailed(platform, platformJobId);
  return { decision, stale: false, staleReasons: [] };
}

/**
 * LLM 语义决策 + 硬规则护栏：
 * - 语义判断（方向 / 技能 / 风险 / 理由）由 LLM 给出
 * - 用户明确硬规则违反 → 强制 SKIP（产品铁律：用户规则优先于 AI 判断）
 * - LLM 调用失败 → 回退本地规则引擎（保证可用）
 */
async function decideWithLlm(
  input: DecisionInput,
  provider: DecisionLlmProvider,
): Promise<ReturnType<typeof decideJob>> {
  const { job, profile, rules } = input;
  const violations = computeHardViolations(job, rules, profile);
  // 硬规则违反：即使 LLM 判断 AUTO_APPLY，也必须 SKIP。
  if (violations.length > 0) {
    return {
      platform: job.platform,
      platformJobId: job.platformJobId,
      verdict: 'SKIP',
      score: 30 - violations.length * 10,
      confidence: 'HIGH',
      matches: [],
      risks: [],
      unknowns: [],
      reason: `违反你的明确规则：${violations[0]}${violations.length > 1 ? ` 等 ${violations.length} 项` : ''}。`,
      ruleViolations: violations,
      contextHash: '',
    };
  }

  let llm: LlmDecision;
  try {
    llm = await provider.decide({ profile, rules, job });
  } catch (err) {
    logger.error(
      'llm',
      `LLM 决策失败（回退本地规则引擎）：${err instanceof Error ? err.message : String(err)}`,
    );
    return decideJob(input);
  }

  return {
    platform: job.platform,
    platformJobId: job.platformJobId,
    verdict: llm.verdict,
    score: llm.confidence === 'HIGH' ? 80 : 65,
    confidence: llm.confidence,
    matches: llm.matches,
    risks: llm.risks,
    unknowns: llm.unknowns,
    reason: llm.reason,
    ruleViolations: [],
    contextHash: '',
  };
}

/** 读取 / 保存用户求职规则。 */
export function getDecisionRules(): DecisionRules {
  return currentRules();
}

export function saveDecisionRules(rules: DecisionRules): DecisionRules {
  const parsed = decisionRulesSchema.safeParse(rules);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? '未知错误';
    throw new Error(`求职规则校验失败：${message}`);
  }
  return decisionRepo.saveDecisionRules(parsed.data);
}

/**
 * 已有决策在当前上下文下是否仍然有效（V0.4-C 批量分析判定是否需重新处理）。
 * 任一输入缺失（无 JD / 无资料）→ 视为无效（需要重新分析）。
 */
export function isDecisionValidFor(platform: string, platformJobId: string, savedContextHash: string): boolean {
  if (!savedContextHash) return false;
  const job = buildJobInput(platform, platformJobId);
  const profile = currentProfile();
  const rules = currentRules();
  if (!job || !job.jdText || !profile) return false;
  return staleReasons(savedContextHash, buildContextHash(job, profile, rules)).length === 0;
}

/**
 * REVIEW 队列（与顶部统计「需要确认」严格同口径）：
 * 只包含「决策在当前上下文下仍有效」的 REVIEW 且用户未处理（user_action=NONE）。
 * 决策已过期的 REVIEW 归入「待分析」（需要重新分析），不进入队列。
 */
export function getReviewQueue(platform: string): ReviewQueueItem[] {
  const candidates = decisionRepo.getReviewQueue(platform);
  return candidates.filter((item) =>
    isDecisionValidFor(platform, item.platformJobId, item.decision.contextHash),
  );
}

/**
 * 用户对 REVIEW 的处理（允许投递 / 跳过 / 撤销）。仅改变决策状态，不真正投递。
 * 返回更新后的决策；岗位无决策时返回 null。
 */
export function updateJobDecisionAction(
  platform: string,
  platformJobId: string,
  action: DecisionAction,
): JobDecision | null {
  if (action !== 'ALLOW' && action !== 'SKIP' && action !== 'NONE') {
    throw new Error('无效的操作。');
  }
  return decisionRepo.updateDecisionAction(platform, platformJobId, action);
}
