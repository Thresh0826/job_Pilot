import { getDb } from '../database';
import type { ResumeRecord } from '../../core/resume';

interface ResumeRow {
  id: number;
  original_name: string;
  stored_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  created_at: string;
}

interface NewResume {
  originalName: string;
  storedName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
}

function mapRow(row: ResumeRow): ResumeRecord {
  return {
    id: row.id,
    originalName: row.original_name,
    storedName: row.stored_name,
    filePath: row.file_path,
    fileSize: row.file_size,
    mimeType: row.mime_type,
    createdAt: row.created_at,
  };
}

export function getLatestResume(): ResumeRecord | null {
  const row = getDb()
    .prepare<[], ResumeRow>('SELECT * FROM resumes ORDER BY id DESC LIMIT 1')
    .get();
  return row ? mapRow(row) : null;
}

export function insertResume(resume: NewResume): ResumeRecord {
  const info = getDb()
    .prepare<[string, string, string, number, string]>(
      'INSERT INTO resumes (original_name, stored_name, file_path, file_size, mime_type) ' +
        'VALUES (?, ?, ?, ?, ?)',
    )
    .run(
      resume.originalName,
      resume.storedName,
      resume.filePath,
      resume.fileSize,
      resume.mimeType,
    );

  const row = getDb()
    .prepare<[number], ResumeRow>('SELECT * FROM resumes WHERE id = ?')
    .get(Number(info.lastInsertRowid));
  if (!row) throw new Error('Failed to read back inserted resume.');
  return mapRow(row);
}

export function deleteAllResumes(): void {
  getDb().prepare('DELETE FROM resumes').run();
}
