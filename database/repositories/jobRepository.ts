import { getDb } from '../database';
import type { Job, JobStatus } from '../../core/matching';

/**
 * C2 岗位持久化 Repository。
 * 唯一键：platform + platformJobId；同一平台岗位只对应一条记录，无历史版本。
 * - 首次发现：INSERT，status = NEW，记录 first_seen_at / last_seen_at
 * - 再次发现：UPDATE 可变字段 + last_seen_at；first_seen_at 不变；status 不被覆盖（SEEN 不退回 NEW）
 * 缺少 platformJobId 的岗位无法按唯一键去重，跳过不落库。
 */

interface JobRow {
  platform: string;
  platform_job_id: string;
  title: string;
  company: string;
  salary: string | null;
  location: string | null;
  city: string | null;
  district: string | null;
  business_district: string | null;
  industry: string | null;
  experience: string | null;
  degree: string | null;
  company_size: string | null;
  company_stage: string | null;
  job_labels: string | null;
  skills: string | null;
  welfare: string | null;
  recruiter_name: string | null;
  recruiter_title: string | null;
  recruiter_active_status: string | null;
  job_url: string | null;
  company_url: string | null;
  source_metadata: string | null;
  status: JobStatus;
  first_seen_at: string;
  last_seen_at: string;
}

function jsonOrNull(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  return JSON.stringify(v);
}

const INSERT_SQL = `
  INSERT INTO jobs (
    platform, platform_job_id, title, company, salary, location, city, district,
    business_district, industry, experience, degree, company_size, company_stage,
    job_labels, skills, welfare, recruiter_name, recruiter_title, recruiter_active_status,
    job_url, company_url, source_metadata, status, first_seen_at, last_seen_at
  ) VALUES (
    @platform, @platform_job_id, @title, @company, @salary, @location, @city, @district,
    @business_district, @industry, @experience, @degree, @company_size, @company_stage,
    @job_labels, @skills, @welfare, @recruiter_name, @recruiter_title, @recruiter_active_status,
    @job_url, @company_url, @source_metadata, 'NEW', @first_seen_at, @last_seen_at
  )
  ON CONFLICT(platform, platform_job_id) DO UPDATE SET
    title = excluded.title,
    company = excluded.company,
    salary = excluded.salary,
    location = excluded.location,
    city = excluded.city,
    district = excluded.district,
    business_district = excluded.business_district,
    industry = excluded.industry,
    experience = excluded.experience,
    degree = excluded.degree,
    company_size = excluded.company_size,
    company_stage = excluded.company_stage,
    job_labels = excluded.job_labels,
    skills = excluded.skills,
    welfare = excluded.welfare,
    recruiter_name = excluded.recruiter_name,
    recruiter_title = excluded.recruiter_title,
    recruiter_active_status = excluded.recruiter_active_status,
    job_url = excluded.job_url,
    company_url = excluded.company_url,
    source_metadata = excluded.source_metadata,
    last_seen_at = excluded.last_seen_at
`;

export interface UpsertJobsSummary {
  inserted: number;
  updated: number;
  skipped: number;
}

/** 批量 upsert 搜索得到的岗位；返回 新增 / 更新 / 跳过（无 platformJobId）数量。 */
export function upsertJobs(jobs: Job[]): UpsertJobsSummary {
  const now = new Date().toISOString();
  const stmt = getDb().prepare(INSERT_SQL);
  const summary: UpsertJobsSummary = { inserted: 0, updated: 0, skipped: 0 };

  const byKey = new Map<string, Job>();
  for (const job of jobs) {
    if (!job.platformJobId) {
      summary.skipped += 1;
      continue;
    }
    byKey.set(`${job.platform}\u0000${job.platformJobId}`, job);
  }
  if (byKey.size === 0) return summary;

  // 先查已有键，明确区分 INSERT / UPDATE（lastInsertRowid 在 upsert 更新路径上不可靠）。
  const placeholders = [...byKey.keys()].map(() => '?').join(', ');
  const existingKeys = new Set(
    (
      getDb()
        .prepare<[...string[]], { platform: string; platform_job_id: string }>(
          `SELECT platform, platform_job_id FROM jobs WHERE (platform || char(0) || platform_job_id) IN (${placeholders})`,
        )
        .all(...byKey.keys()) as { platform: string; platform_job_id: string }[]
    ).map((r) => `${r.platform}\u0000${r.platform_job_id}`),
  );

  for (const [key, job] of byKey) {
    const params = {
      platform: job.platform,
      platform_job_id: job.platformJobId,
      title: job.title ?? '',
      company: job.company ?? '',
      salary: job.salary ?? null,
      location: job.location ?? null,
      city: job.city ?? null,
      district: job.district ?? null,
      business_district: job.businessDistrict ?? null,
      industry: job.industry ?? null,
      experience: job.experience ?? null,
      degree: job.degree ?? null,
      company_size: job.companySize ?? null,
      company_stage: job.companyStage ?? null,
      job_labels: jsonOrNull(job.jobLabels),
      skills: jsonOrNull(job.skills),
      welfare: jsonOrNull(job.welfare),
      recruiter_name: job.recruiterName ?? null,
      recruiter_title: job.recruiterTitle ?? null,
      recruiter_active_status: job.recruiterActiveStatus ?? null,
      job_url: job.jobUrl ?? null,
      company_url: job.companyUrl ?? null,
      source_metadata: jsonOrNull(job.sourceMetadata),
      first_seen_at: now,
      last_seen_at: now,
    };
    stmt.run(params);
    if (existingKeys.has(key)) {
      summary.updated += 1;
    } else {
      summary.inserted += 1;
    }
  }
  return summary;
}

/** 批量读取岗位本地状态（用于搜索返回时标注 NEW / SEEN）。 */
export function getJobStatuses(platform: string, platformJobIds: string[]): Record<string, JobStatus> {
  const result: Record<string, JobStatus> = {};
  const unique = [...new Set(platformJobIds.filter((v): v is string => typeof v === 'string' && v.length > 0))];
  if (unique.length === 0) return result;

  const placeholders = unique.map(() => '?').join(', ');
  const rows = getDb()
    .prepare<[string, ...string[]], { platform_job_id: string; status: string }>(
      `SELECT platform_job_id, status FROM jobs WHERE platform = ? AND platform_job_id IN (${placeholders})`,
    )
    .all(platform, ...unique);

  for (const row of rows) {
    if (row.status === 'NEW' || row.status === 'SEEN') {
      result[row.platform_job_id] = row.status;
    }
  }
  return result;
}

/** 详情读取成功后的落库：标记 SEEN 并保存 JD 文本（详情失败时不得调用）。 */
export function saveJobDetailSeen(platform: string, platformJobId: string | undefined, jdText?: string): void {
  if (!platformJobId) return;
  getDb()
    .prepare<[string | null, string, string]>(
      `UPDATE jobs SET status = 'SEEN', jd_text = ? WHERE platform = ? AND platform_job_id = ?`,
    )
    .run(jdText ?? null, platform, platformJobId);
}

/** 供测试/诊断：读取岗位行。 */
export function getJobRow(platform: string, platformJobId: string): JobRow | undefined {
  return getDb()
    .prepare<[string, string], JobRow>(
      'SELECT * FROM jobs WHERE platform = ? AND platform_job_id = ?',
    )
    .get(platform, platformJobId);
}

/** 读取平台全部已知岗位 ID（C3：用于判定“本次计划运行前是否已发现”，与 NEW/SEEN 视图状态无关）。 */
export function getAllPlatformJobIds(platform: string): Set<string> {
  const rows = getDb()
    .prepare<[string], { platform_job_id: string }>('SELECT platform_job_id FROM jobs WHERE platform = ?')
    .all(platform);
  return new Set(rows.map((r) => r.platform_job_id));
}
