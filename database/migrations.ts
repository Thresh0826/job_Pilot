import type Database from 'better-sqlite3';
import { DEFAULT_AI_PERMISSIONS } from '../core/ai';
import { DEFAULT_NOTIFICATIONS } from '../core/notification';

/**
 * V0.1 采用简单的幂等建表迁移：所有表 IF NOT EXISTS 创建，
 * 并播种默认配置。后续版本可引入带版本号的迁移机制。
 */
export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_profiles (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT NOT NULL DEFAULT '',
      current_city TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS target_cities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      city TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS resumes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL DEFAULT 0,
      mime_type TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS job_targets (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      min_salary INTEGER,
      ideal_salary INTEGER,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS job_target_positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS preferred_locations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      city TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS preferred_industries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS excluded_industries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS excluded_keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS job_preferences (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      weekend_preference TEXT NOT NULL DEFAULT 'PREFER_DOUBLE',
      accept_sales INTEGER NOT NULL DEFAULT 0,
      accept_outsourcing INTEGER NOT NULL DEFAULT 0,
      travel_preference TEXT NOT NULL DEFAULT 'OCCASIONAL',
      max_commute_minutes INTEGER NOT NULL DEFAULT 40,
      other_requirements TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS preferred_company_sizes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      range_label TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ai_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT NOT NULL UNIQUE,
      mode TEXT NOT NULL DEFAULT 'ASK_USER'
    );

    CREATE TABLE IF NOT EXISTS notification_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT NOT NULL UNIQUE,
      enabled INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS platform_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'DISCONNECTED',
      connected_at TEXT,
      last_checked_at TEXT
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      platform_job_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      company TEXT NOT NULL DEFAULT '',
      salary TEXT,
      location TEXT,
      city TEXT,
      district TEXT,
      business_district TEXT,
      industry TEXT,
      experience TEXT,
      degree TEXT,
      company_size TEXT,
      company_stage TEXT,
      job_labels TEXT,
      skills TEXT,
      welfare TEXT,
      recruiter_name TEXT,
      recruiter_title TEXT,
      recruiter_active_status TEXT,
      job_url TEXT,
      company_url TEXT,
      source_metadata TEXT,
      jd_text TEXT,
      status TEXT NOT NULL DEFAULT 'NEW',
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      UNIQUE (platform, platform_job_id)
    );
  `);

  // V0.2 最小迁移：为已存在的 V0.1 数据库补充 last_checked_at 列。
  const columns = db.prepare('PRAGMA table_info(platform_accounts)').all() as { name: string }[];
  if (!columns.some((c) => c.name === 'last_checked_at')) {
    db.exec('ALTER TABLE platform_accounts ADD COLUMN last_checked_at TEXT');
  }

  seedDefaults(db);
}

function seedDefaults(db: Database.Database): void {
  const setSetting = db.prepare<[string, string]>(
    'INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)',
  );
  setSetting.run('onboarding_completed', '0');
  setSetting.run('run_mode', 'TEST');

  db.prepare<[string, string]>(
    'INSERT OR IGNORE INTO user_profiles (id, name, current_city) VALUES (1, ?, ?)',
  ).run('', '');
  db.prepare('INSERT OR IGNORE INTO job_targets (id) VALUES (1)').run();
  db.prepare('INSERT OR IGNORE INTO job_preferences (id) VALUES (1)').run();

  const insertAi = db.prepare<[string, string]>(
    'INSERT OR IGNORE INTO ai_permissions (topic, mode) VALUES (?, ?)',
  );
  for (const [topic, mode] of Object.entries(DEFAULT_AI_PERMISSIONS)) {
    insertAi.run(topic, mode);
  }

  const insertNotif = db.prepare<[string, number]>(
    'INSERT OR IGNORE INTO notification_preferences (topic, enabled) VALUES (?, ?)',
  );
  for (const [topic, enabled] of Object.entries(DEFAULT_NOTIFICATIONS)) {
    insertNotif.run(topic, enabled ? 1 : 0);
  }

  const insertPlatform = db.prepare<[string, string]>(
    'INSERT OR IGNORE INTO platform_accounts (platform, status) VALUES (?, ?)',
  );
  insertPlatform.run('BOSS', 'DISCONNECTED');
  insertPlatform.run('ZHILIAN', 'COMING_SOON');
  insertPlatform.run('JOB51', 'COMING_SOON');
  insertPlatform.run('LIEPIN', 'COMING_SOON');
}
