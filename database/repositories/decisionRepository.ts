import { getDb } from '../database';
import type { DecisionRules, JobDecision, Verdict } from '../../core/decision';

/**
 * V0.4-B 岗位决策持久化：
 * - job_decision_rules：用户求职规则（单行）
 * - job_decisions：每个岗位的决策结果（(platform, platform_job_id) 唯一，复用 + 重新分析）
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

/** 规则版本标记（updated_at），用于决策上下文指纹。 */
export function getDecisionRulesVersion(): string {
  const row = getDb()
    .prepare<[], { updated_at: string }>('SELECT updated_at FROM job_decision_rules WHERE id = 1')
    .get();
  return row?.updated_at ?? '';
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

export function upsertDecision(
  decision: Omit<JobDecision, 'createdAt' | 'updatedAt'>,
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
