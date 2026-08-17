import { dialog, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { getResumesDir } from '../../../database/database';
import * as resumeRepo from '../../../database/repositories/resumeRepository';
import type { ResumeRecord } from '../../../core/resume';

const ALLOWED_EXTENSIONS = ['.pdf', '.docx'];
const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function isAllowed(name: string): boolean {
  return ALLOWED_EXTENSIONS.includes(path.extname(name).toLowerCase());
}

/**
 * 将用户选择的简历复制到 JobPilot 自己的数据目录，避免依赖源文件原始位置。
 * 返回数据库中的简历记录，失败时抛出带中文提示的 Error。
 */
export function importResumeFromPath(sourcePath: string): ResumeRecord {
  if (!sourcePath) throw new Error('未提供文件路径。');

  const originalName = path.basename(sourcePath);
  if (!isAllowed(originalName)) throw new Error('仅支持 PDF 或 DOCX 文件。');

  const stat = fs.statSync(sourcePath);
  if (!stat.isFile()) throw new Error('所选路径不是有效文件。');

  const storedName = `${Date.now()}_${originalName}`;
  const destPath = path.join(getResumesDir(), storedName);
  fs.copyFileSync(sourcePath, destPath);

  const ext = path.extname(originalName).toLowerCase();
  return resumeRepo.insertResume({
    originalName,
    storedName,
    filePath: destPath,
    fileSize: stat.size,
    mimeType: MIME_BY_EXT[ext] ?? 'application/octet-stream',
  });
}

/** 弹出系统文件选择框，选择 PDF / DOCX 简历。返回 null 表示用户取消。 */
export function pickResume(parent?: BrowserWindow): ResumeRecord | null {
  const result = parent
    ? dialog.showOpenDialogSync(parent, {
        title: '选择简历',
        filters: [{ name: '简历文件 (PDF / DOCX)', extensions: ['pdf', 'docx'] }],
        properties: ['openFile'],
      })
    : dialog.showOpenDialogSync({
        title: '选择简历',
        filters: [{ name: '简历文件 (PDF / DOCX)', extensions: ['pdf', 'docx'] }],
        properties: ['openFile'],
      });

  if (!result || result.length === 0) return null;
  return importResumeFromPath(result[0]);
}

/** 删除当前简历记录及其数据目录中的文件。 */
export function removeResume(): boolean {
  const resume = resumeRepo.getLatestResume();
  resumeRepo.deleteAllResumes();

  if (resume && fs.existsSync(resume.filePath)) {
    try {
      fs.unlinkSync(resume.filePath);
    } catch {
      // 文件可能已被外部移动，忽略。
    }
  }
  return true;
}
