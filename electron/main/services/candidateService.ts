import {
  candidateProfileSchema,
  type CandidateProfile,
  type CandidateSnapshot,
} from '../../../core/candidate';
import type { LayoutLine } from '../../../core/candidate/layout';
import {
  parseCandidateProfileLayout,
  computeParseWarnings,
} from '../../../core/candidate/parser';
import type { ResumeRecord } from '../../../core/resume';
import * as resumeRepo from '../../../database/repositories/resumeRepository';
import * as candidateRepo from '../../../database/repositories/candidateRepository';
import { importResumeFromPath } from './resumeService';
import { extractResumeLayout } from './resumeLayoutExtractor';

/**
 * V0.4-A 候选人资料服务（Electron Main）。
 * 负责：简历文件 → 版面结构提取（视觉顺序行序列）→ Section/实体解析 → CandidateProfile 持久化。
 * 全部在本机完成，不调用任何第三方服务。
 */

function buildSnapshot(resume: ResumeRecord | null): CandidateSnapshot {
  if (!resume) {
    return { resume: null, profile: null, profileResumeId: null, confirmed: false, warnings: [] };
  }
  // 优先取当前简历的资料；若尚未解析，则展示最近一次的历史资料，
  // 让页面明确提示「资料来自旧简历」，而不是让用户误以为资料丢失。
  let row = candidateRepo.getProfileByResumeId(resume.id);
  if (!row) row = candidateRepo.getLatestProfile();
  return {
    resume,
    profile: row ? row.profile : null,
    profileResumeId: row ? row.resumeId : null,
    confirmed: row ? row.confirmed : false,
    warnings: row ? row.parseWarnings : [],
  };
}

/** 读取当前状态（不触发解析）。 */
export function getCandidateSnapshot(): CandidateSnapshot {
  return buildSnapshot(resumeRepo.getLatestResume());
}

/**
 * 解析当前使用的简历：版面提取 → 结构解析 → 写入资料（未确认状态）。
 * 只有当用户明确触发（导入并解析 / 更换简历确认 / 资料过期后重新解析）时调用。
 */
export async function parseCurrentResume(): Promise<CandidateSnapshot> {
  const resume = resumeRepo.getLatestResume();
  if (!resume) throw new Error('还没有简历，请先上传简历。');
  return parseResumeFile(resume.filePath, resume);
}

/**
 * 导入新简历并立即解析（「更换简历」确认流程使用）。
 * 旧简历记录与旧资料保留在数据库中，但当前简历与当前资料都会切换到新简历。
 */
export async function importResumeAndParse(sourcePath: string): Promise<CandidateSnapshot> {
  if (!sourcePath || typeof sourcePath !== 'string') throw new Error('未提供文件路径。');
  const resume = importResumeFromPath(sourcePath);
  return parseResumeFile(resume.filePath, resume);
}

/** 解析某份简历文件并写入对应简历的资料记录。 */
async function parseResumeFile(filePath: string, resume: ResumeRecord): Promise<CandidateSnapshot> {
  const layoutLines = await extractResumeLayout(filePath);
  const profile = parseCandidateProfileLayout(layoutLines);
  const warnings = computeParseWarnings(layoutLines, profile);
  const sourceText = layoutLines.map((l) => l.text).join('\n');
  candidateRepo.upsertProfile({
    resumeId: resume.id,
    profile,
    sourceText,
    parseWarnings: warnings,
  });
  return buildSnapshot(resumeRepo.getLatestResume());
}

/** 用户保存（确认 / 修改）后的候选人资料。 */
export function saveCandidateProfile(profile: CandidateProfile): CandidateSnapshot {
  const parsed = candidateProfileSchema.safeParse(profile);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? '未知错误';
    throw new Error(`候选人资料校验失败：${message}`);
  }
  const resume = resumeRepo.getLatestResume();
  if (!resume) throw new Error('还没有简历，无法保存候选人资料。');
  candidateRepo.saveConfirmedProfile(resume.id, parsed.data);
  return buildSnapshot(resumeRepo.getLatestResume());
}

/** 供测试 / 调试使用：直接返回版面行（不写库）。 */
export async function extractLayoutLines(filePath: string): Promise<LayoutLine[]> {
  return extractResumeLayout(filePath);
}
