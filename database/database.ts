import Database from 'better-sqlite3';
import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { runMigrations } from './migrations';

let db: Database.Database | null = null;
let dataDir = '';

/**
 * 数据目录解析：
 * - 可被环境变量 JOBPILOT_DATA_DIR 覆盖（便于自动化测试）
 * - 开发（未打包）：使用项目根目录下的 dev-data/
 * - 正式（已打包）：使用 Electron 用户数据目录 %APPDATA%\JobPilot
 */
export function resolveDataDir(): string {
  const override = process.env.JOBPILOT_DATA_DIR;
  if (override) return path.resolve(override);
  if (!app.isPackaged) return path.resolve(process.cwd(), 'dev-data');
  return app.getPath('userData');
}

export function getDataDir(): string {
  if (!dataDir) throw new Error('Database has not been initialized yet.');
  return dataDir;
}

export function getResumesDir(): string {
  return path.join(getDataDir(), 'resumes');
}

export function initDatabase(): void {
  dataDir = resolveDataDir();
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(getResumesDir(), { recursive: true });

  const file = path.join(dataDir, 'jobpilot.db');
  db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database has not been initialized yet.');
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}
