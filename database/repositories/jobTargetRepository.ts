import { getDb } from '../database';
import type { JobTarget } from '../../core/searchPlan';

/**
 * C3 求职目标 Repository（单例 id=1，重启后保留）。
 * related_keywords / target_cities 以 JSON 数组字符串存储。
 */

interface JobTargetRow {
  target_job: string;
  related_keywords: string;
  target_cities: string;
  updated_at: string;
}

function parseList(raw: string | null): string[] {
  try {
    const value = JSON.parse(raw ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim());
  } catch {
    return [];
  }
}

/** 读取求职目标；未设置或目标岗位为空返回 null。 */
export function getJobTarget(): JobTarget | null {
  const row = getDb()
    .prepare<[], JobTargetRow>('SELECT target_job, related_keywords, target_cities, updated_at FROM job_seek_target WHERE id = 1')
    .get();
  if (!row) return null;
  const targetJob = (row.target_job ?? '').trim();
  if (!targetJob) return null;
  return {
    targetJob,
    relatedKeywords: parseList(row.related_keywords),
    targetCities: parseList(row.target_cities),
  };
}

/** 保存求职目标（覆盖式）；返回规范化后的目标。 */
export function saveJobTarget(target: JobTarget): JobTarget {
  const normalized: JobTarget = {
    targetJob: target.targetJob.trim(),
    relatedKeywords: target.relatedKeywords.map((k) => k.trim()).filter((k) => k.length > 0),
    targetCities: target.targetCities.map((c) => c.trim()).filter((c) => c.length > 0),
  };
  getDb()
    .prepare<[string, string, string, string]>(
      `INSERT INTO job_seek_target (id, target_job, related_keywords, target_cities, updated_at)
       VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         target_job = excluded.target_job,
         related_keywords = excluded.related_keywords,
         target_cities = excluded.target_cities,
         updated_at = excluded.updated_at`,
    )
    .run(
      normalized.targetJob,
      JSON.stringify(normalized.relatedKeywords),
      JSON.stringify(normalized.targetCities),
      new Date().toISOString(),
    );
  return normalized;
}
