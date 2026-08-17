// 只读检查 SQLite 数据库结构（使用 Node 内置 node:sqlite，不依赖 better-sqlite3 ABI）。
const { DatabaseSync } = require('node:sqlite');

const file = process.argv[2] || 'dev-data/jobpilot.db';
const db = new DatabaseSync(file, { readOnly: true });

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  .all()
  .map((r) => r.name);

console.log(`TABLES (${tables.length}):`);
console.log(tables.join(', '));

console.log('\napp_settings:');
console.log(JSON.stringify(db.prepare('SELECT * FROM app_settings').all()));

console.log('\nai_permissions count:', db.prepare('SELECT COUNT(*) c FROM ai_permissions').get().c);
console.log('notification_preferences count:', db.prepare('SELECT COUNT(*) c FROM notification_preferences').get().c);

console.log('\nplatform_accounts:');
console.log(JSON.stringify(db.prepare('SELECT platform, status FROM platform_accounts').all()));

db.close();
