import { getDb } from '../database';
import type {
  DecisionAction,
  DecisionRules,
  JobDecision,
  ReviewQueueItem,
  Verdict,
} from '../../core/decision';

/**
 * V0.4-B/C 岗位决策持久化：
 * - job_decision_rules：用户求职规则（单行）
 * - job_decisions：每个岗位的决策结果（(platform, platform_job_id) 唯一，复用 + 重新分析）
 *   - V0.4-C：user_action 记录用户对 REVIEW 的处理（ALLOW / SKIP / NONE）
 */

/* ------------------------------------------------------------------ */
/* 规则                                                                */
/* ------------------------------------------------------------------ */

export function getDecisionRules(): DecisionRules | null {
  const row = getDb()
    .prepare<[], { rules_json: string }>('SELECT rules_json FROM job_decision_rules WHERE id = 1')
    .get();
  if (!row) return null;
  try {
    return JSON.parse(row.rules_json) as DecisionRules;
  } catch {
    return null;
  }
}

export function saveDecisionRules(rules: DecisionRules): DecisionRules {
  getDb()
    .prepare<[string]>(
      `INSERT INTO job_decision_rules (id, rules_json) VALUES (1, ?)
       ON CONFLICT(id) DO UPDATE SET rules_json = excluded.rules_json, updated_at = datetime('now')`,
    )
    .run(JSON.stringify(rules));
  const saved = getDecisionRules();
  if (!saved) throw new Error('Failed to read back decision rules.');
  return saved;
}

/* ------------------------------------------------------------------ */
/* 决策结果                                                            */
/* ------------------------------------------------------------------ */

interface DecisionRowShape {
  id: number;
  platform: string;
  platform_job_id: string;
  verdict: Verdict;
  score: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  matches_json: string;
  risks_json: string;
  unknowns_json: string;
  rule_violations_json: string;
  reason: string;
  context_hash: string;
  user_action: DecisionAction;
  created_at: string;
  updated_at: string;
}

function parseList(json: string): string[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function mapRow(row: DecisionRowShape): JobDecision {
  return {
    platform: row.platform,
    platformJobId: row.platform_job_id,
    verdict: row.verdict,
    score: row.score,
    confidence: row.confidence,
    matches: parseList(row.matches_json),
    risks: parseList(row.risks_json),
    unknowns: parseList(row.unknowns_json),
    reason: row.reason,
    ruleViolations: parseList(row.rule_violations_json),
    contextHash: row.context_hash,
    userAction: row.user_action === 'ALLOW' || row.user_action === 'SKIP' ? row.user_action : 'NONE',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getDecision(platform: string, platformJobId: string): JobDecision | null {
  const row = getDb()
    .prepare<[string, string], DecisionRowShape>(
      'SELECT * FROM job_decisions WHERE platform = ? AND platform_job_id = ?',
    )
    .get(platform, platformJobId);
  return row ? mapRow(row) : null;
}

/** 写入 / 覆盖决策。重新分析（新上下文）时重置用户处理（user_action = NONE）。 */
export function upsertDecision(
  decision: Omit<JobDecision, 'createdAt' | 'updatedAt' | 'userAction'>,
): JobDecision {
  getDb()
    .prepare<
      [string, string, string, number, string, string, string, string, string, string, string]
    >(
      `INSERT INTO job_decisions
         (platform, platform_job_id, verdict, score, confidence, matches_json, risks_json,
          unknowns_json, rule_violations_json, reason, context_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(platform, platform_job_id) DO UPDATE SET
         verdict = excluded.verdict,
         score = excluded.score,
         confidence = excluded.confidence,
         matches_json = excluded.matches_json,
         risks_json = excluded.risks_json,
         unknowns_json = excluded.unknowns_json,
         rule_violations_json = excluded.rule_violations_json,
         reason = excluded.reason,
         context_hash = excluded.context_hash,
         user_action = 'NONE',
         updated_at = datetime('now')`,
    )
    .run(
      decision.platform,
      decision.platformJobId,
      decision.verdict,
      decision.score,
      decision.confidence,
      JSON.stringify(decision.matches),
      JSON.stringify(decision.risks),
      JSON.stringify(decision.unknowns),
      JSON.stringify(decision.ruleViolations),
      decision.reason,
      decision.contextHash,
    );

  const row = getDb()
    .prepare<[string, string], DecisionRowShape>(
      'SELECT * FROM job_decisions WHERE platform = ? AND platform_job_id = ?',
    )
    .get(decision.platform, decision.platformJobId);
  if (!row) throw new Error('Failed to read back job decision.');
  return mapRow(row);
}

/** 用户对 REVIEW 的处理（仅改变决策状态，不影响原始 verdict）。 */
export function updateDecisionAction(
  platform: string,
  platformJobId: string,
  action: DecisionAction,
): JobDecision | null {
  if (action !== 'ALLOW' && action !== 'SKIP' && action !== 'NONE') return null;
  getDb()
    .prepare<[string, string, string]>(
      `UPDATE job_decisions SET user_action = ?, updated_at = datetime('now')
       WHERE platform = ? AND platform_job_id = ?`,
    )
    .run(action, platform, platformJobId);
  return getDecision(platform, platformJobId);
}

/** V0.4-C：某发现批次内的全部 NEW 岗位 + 已有决策（LEFT JOIN），供批量分析判定是否需重新处理。 */
export interface NewJobWithDecisionRow {
  platformJobId: string;
  title: string;
  company: string;
  city: string | null;
  salary: string | null;
  location: string | null;
  degree: string | null;
  experience: string | null;
  jd_text: string | null;
  job_url: string | null;
  source_metadata: string | null;
  analysis_failed_at: string | null;
  decision_verdict: Verdict | null;
  decision_context_hash: string | null;
  decision_user_action: DecisionAction | null;
  decision_updated_at: string | null;
}

export function getNewJobsWithDecisions(platform: string, batchAt?: string | null): NewJobWithDecisionRow[] {
  // 批次内全部岗位（不按 status 过滤：成功读取详情的岗位已 SEEN 但仍属该批次，
  // 统计与「是否需重新处理」都应按批次全量计算）。
  const rows = getDb()
    .prepare<
      [string, ...string[]],
      NewJobWithDecisionRow
    >(
      `SELECT j.platform_job_id AS platformJobId, j.title, j.company, j.city, j.salary, j.location,
              j.degree, j.experience, j.jd_text, j.job_url, j.source_metadata, j.analysis_failed_at,
              d.verdict AS decision_verdict, d.context_hash AS decision_context_hash,
              d.user_action AS decision_user_action, d.updated_at AS decision_updated_at
       FROM jobs j
       LEFT JOIN job_decisions d
         ON d.platform = j.platform AND d.platform_job_id = j.platform_job_id
       WHERE j.platform = ?
         ${batchAt ? 'AND j.discovered_batch_at = ?' : ''}
       ORDER BY j.id ASC`,
    )
    .all(platform, ...(batchAt ? [batchAt] : []));
  return rows;
}

/** V0.4-C：REVIEW 队列（verdict=REVIEW 且用户未处理）。 */
export function getReviewQueue(platform: string): ReviewQueueItem[] {
  interface ReviewQueueRow extends ReviewQueueItem {
    verdict: Verdict;
    score: number;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    matches_json: string;
    risks_json: string;
    unknowns_json: string;
    rule_violations_json: string;
    reason: string;
    context_hash: string;
    user_action: DecisionAction;
    created_at: string;
    updated_at: string;
  }
  const rows = getDb()
    .prepare<[string], ReviewQueueRow>(
      `SELECT j.platform_job_id AS platformJobId, j.title, j.company, j.city, j.salary, j.location,
              d.verdict, d.score, d.confidence, d.matches_json, d.risks_json, d.unknowns_json,
              d.rule_violations_json, d.reason, d.context_hash, d.user_action, d.created_at, d.updated_at
       FROM job_decisions d
       JOIN jobs j ON j.platform = d.platform AND j.platform_job_id = d.platform_job_id
       WHERE d.platform = ? AND d.verdict = 'REVIEW' AND d.user_action = 'NONE'
       ORDER BY d.updated_at DESC`,
    )
    .all(platform);

  return rows.map((r) => ({
    platformJobId: r.platformJobId,
    title: r.title,
    company: r.company,
    city: r.city,
    salary: r.salary,
    location: r.location,
    decision: {
      platform,
      platformJobId: r.platformJobId,
      verdict: r.verdict,
      score: r.score,
      confidence: r.confidence,
      matches: parseList(r.matches_json),
      risks: parseList(r.risks_json),
      unknowns: parseList(r.unknowns_json),
      reason: r.reason,
      ruleViolations: parseList(r.rule_violations_json),
      contextHash: r.context_hash,
      userAction: r.user_action === 'ALLOW' || r.user_action === 'SKIP' ? r.user_action : 'NONE',
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    },
  }));
}
