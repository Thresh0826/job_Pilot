import crypto from 'node:crypto';
import type { CandidateProfile } from '../../../core/candidate';
import {
  createDefaultDecisionRules,
  decisionRulesSchema,
  type DecisionInput,
  type DecisionJobInput,
  type DecisionRules,
  type JobDecisionView,
} from '../../../core/decision';
import { decideJob } from '../../../core/decision/engine';
import * as decisionRepo from '../../../database/repositories/decisionRepository';
import { getJobDecisionSource } from '../../../database/repositories/jobRepository';
import { getCandidateSnapshot } from './candidateService';

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
 * 分析（或重新分析）岗位：读取本地数据 → 决策引擎 → 持久化。
 * 同一岗位重复调用即“重新分析”，直接覆盖旧结果。
 */
export function analyzeJobDecision(platform: string, platformJobId: string): JobDecisionView {
  const job = buildJobInput(platform, platformJobId);
  if (!job) throw new Error('岗位不存在，请先读取岗位详情。');
  if (!job.jdText) throw new Error('岗位缺少完整 JD，请先打开岗位详情。');

  const profile = currentProfile();
  if (!profile) throw new Error('还没有候选人资料，请先在「我的资料」上传简历并确认。');
  const rules = currentRules();

  const input: DecisionInput = { job, profile, rules };
  const base = decideJob(input);
  const contextHash = buildContextHash(job, profile, rules);
  const decision = decisionRepo.upsertDecision({ ...base, contextHash });
  return { decision, stale: false, staleReasons: [] };
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
