import { getDb } from '../database';
import type { CandidateProfile } from '../../core/candidate';

/**
 * V0.4-A Candidate Profile 持久化。
 * 一份简历对应一条资料（resume_id UNIQUE），删除简历时随外键级联删除。
 */

export interface CandidateProfileRow {
  id: number;
  resumeId: number;
  profile: CandidateProfile;
  sourceText: string;
  parseVersion: number;
  confirmed: boolean;
  /** 解析完整性提示（用户人工保存后清空）。 */
  parseWarnings: string[];
  createdAt: string;
  updatedAt: string;
}

interface ProfileRowShape {
  id: number;
  resume_id: number;
  profile_json: string;
  source_text: string;
  parse_version: number;
  confirmed: number;
  parse_warnings: string;
  created_at: string;
  updated_at: string;
}

function mapRow(row: ProfileRowShape): CandidateProfileRow {
  let parseWarnings: string[] = [];
  try {
    const parsed = JSON.parse(row.parse_warnings);
    if (Array.isArray(parsed)) parseWarnings = parsed.filter((w) => typeof w === 'string');
  } catch {
    // 数据异常时按空处理
  }
  return {
    id: row.id,
    resumeId: row.resume_id,
    profile: JSON.parse(row.profile_json) as CandidateProfile,
    sourceText: row.source_text,
    parseVersion: row.parse_version,
    confirmed: row.confirmed === 1,
    parseWarnings,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getProfileByResumeId(resumeId: number): CandidateProfileRow | null {
  const row = getDb()
    .prepare<[number], ProfileRowShape>('SELECT * FROM candidate_profiles WHERE resume_id = ?')
    .get(resumeId);
  return row ? mapRow(row) : null;
}

/** 任意简历中最近一次生成的资料（用于展示「资料来自旧简历」的过期状态）。 */
export function getLatestProfile(): CandidateProfileRow | null {
  const row = getDb()
    .prepare<[], ProfileRowShape>('SELECT * FROM candidate_profiles ORDER BY id DESC LIMIT 1')
    .get();
  return row ? mapRow(row) : null;
}

export interface UpsertProfileInput {
  resumeId: number;
  profile: CandidateProfile;
  sourceText: string;
  /** true 表示用户已人工确认 / 修改过。 */
  confirmed?: boolean;
  /** 解析完整性提示；用户确认后传空数组。 */
  parseWarnings?: string[];
}

/** 写入（或覆盖）某份简历对应的候选人资料。 */
export function upsertProfile(input: UpsertProfileInput): CandidateProfileRow {
  const { resumeId, profile, sourceText, confirmed = false, parseWarnings = [] } = input;
  getDb()
    .prepare<[number, string, string, number, string]>(
      `INSERT INTO candidate_profiles (resume_id, profile_json, source_text, parse_version, confirmed, parse_warnings)
       VALUES (?, ?, ?, 1, ?, ?)
       ON CONFLICT(resume_id) DO UPDATE SET
         profile_json = excluded.profile_json,
         source_text = excluded.source_text,
         confirmed = excluded.confirmed,
         parse_warnings = excluded.parse_warnings,
         updated_at = datetime('now')`,
    )
    .run(resumeId, JSON.stringify(profile), sourceText, confirmed ? 1 : 0, JSON.stringify(parseWarnings));

  const row = getDb()
    .prepare<[number], ProfileRowShape>('SELECT * FROM candidate_profiles WHERE resume_id = ?')
    .get(resumeId);
  if (!row) throw new Error('Failed to read back candidate profile.');
  return mapRow(row);
}

/** 用户保存修改后的资料：保留已确认标记，并清空解析提示（用户已人工处理）。 */
export function saveConfirmedProfile(resumeId: number, profile: CandidateProfile): CandidateProfileRow {
  return upsertProfile({
    resumeId,
    profile,
    sourceText: getProfileByResumeId(resumeId)?.sourceText ?? '',
    confirmed: true,
    parseWarnings: [],
  });
}
