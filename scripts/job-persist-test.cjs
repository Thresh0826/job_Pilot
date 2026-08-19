/**
 * V0.3-C2 岗位持久化逻辑测试（Electron 运行时，SQLite 直测，不触碰真实 Chrome）。
 * 覆盖：首次 INSERT / 重复搜索不新增 / lastSeenAt 更新且 firstSeenAt 不变 /
 * SEEN 保持 SEEN / 不同 platformJobId 不误合并 / 详情成功→SEEN / 详情失败→NEW /
 * TEST/PROD 物理隔离 / migration 幂等。
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { app } = require('electron');

const TEST_DIR = path.resolve(__dirname, '..', 'dev-data', `job-persist-test-${process.pid}`);
const PROD_DIR = path.resolve(__dirname, '..', 'dev-data', `job-persist-test-${process.pid}-prod`);

process.env.JOBPILOT_DATA_DIR = TEST_DIR;

function makeJob(platformJobId, overrides = {}) {
  return {
    id: platformJobId,
    platform: 'BOSS',
    platformJobId,
    title: overrides.title ?? '新媒体运营',
    company: overrides.company ?? '星澜科技',
    salary: overrides.salary ?? '6-8K',
    location: '无锡·滨湖·河埒',
    city: '无锡',
    experience: '1-3年',
    degree: '本科',
    jobLabels: ['双休'],
    sourceMetadata: { encryptJobId: platformJobId, lid: `lid-${platformJobId}` },
    ...overrides,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  let failures = 0;
  const check = (name, cond, extra = '') => {
    console.log(`${cond ? 'PASS' : 'FAIL'} - ${name}${extra ? ' ' + extra : ''}`);
    if (!cond) failures += 1;
  };

  try {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    fs.rmSync(PROD_DIR, { recursive: true, force: true });

    const dbMod = require('../dist-electron/database/database.js');
    dbMod.initDatabase(); // TEST 库（含 C2 jobs 迁移）

    const {
      upsertJobs,
      getJobStatuses,
      saveJobDetailSeen,
      getJobRow,
    } = require('../dist-electron/database/repositories/jobRepository.js');
    const { persistJobDetailOutcome } = require('../dist-electron/electron/main/services/platformService.js');
    const { runMigrations } = require('../dist-electron/database/migrations.js');

    const db = dbMod.getDb();
    const countJobs = () => db.prepare('SELECT COUNT(*) AS c FROM jobs').get().c;

    // ---- 1. 首次 INSERT → NEW + first_seen_at 记录 ----
    const s1 = upsertJobs([makeJob('ej1')]);
    check('首次 INSERT（inserted=1）', s1.inserted === 1 && s1.updated === 0 && s1.skipped === 0, JSON.stringify(s1));
    check('首次后共 1 行', countJobs() === 1);
    const row1 = getJobRow('BOSS', 'ej1');
    check('首次状态 NEW', row1.status === 'NEW');
    check('首次 first_seen_at / last_seen_at 已记录', !!row1.first_seen_at && !!row1.last_seen_at);
    check('可变字段已落库', row1.title === '新媒体运营' && row1.salary === '6-8K' && row1.location === '无锡·滨湖·河埒');

    // ---- 2/3. 重复搜索不新增；lastSeenAt 更新 / firstSeenAt 不变 ----
    await sleep(50);
    const s2 = upsertJobs([makeJob('ej1', { title: '新媒体运营（更新）', salary: '8-10K' })]);
    check('重复搜索不新增（inserted=0 updated=1）', s2.inserted === 0 && s2.updated === 1 && countJobs() === 1, JSON.stringify(s2));
    const row2 = getJobRow('BOSS', 'ej1');
    check('再次发现更新可变字段', row2.title === '新媒体运营（更新）' && row2.salary === '8-10K');
    check('firstSeenAt 不变', row2.first_seen_at === row1.first_seen_at);
    check('lastSeenAt 更新', row2.last_seen_at !== row1.last_seen_at && !!row2.last_seen_at);
    check('更新后仍为 NEW（未被覆盖）', row2.status === 'NEW');

    // ---- 4. SEEN 保持 SEEN（详情标记后重复搜索不得退回 NEW）----
    saveJobDetailSeen('BOSS', 'ej1', 'JD 文本 1');
    check('saveJobDetailSeen → SEEN + jd_text', getJobRow('BOSS', 'ej1').status === 'SEEN' && getJobRow('BOSS', 'ej1').jd_text === 'JD 文本 1');
    upsertJobs([makeJob('ej1')]);
    check('SEEN 重复搜索后仍为 SEEN', getJobRow('BOSS', 'ej1').status === 'SEEN');

    // ---- 5. 不同 platformJobId 不误合并 ----
    upsertJobs([makeJob('ej5'), makeJob('ej6')]);
    check('不同 platformJobId 各成一行', countJobs() === 3 && !!getJobRow('BOSS', 'ej5') && !!getJobRow('BOSS', 'ej6'));

    // ---- 批量状态读取 ----
    const statuses = getJobStatuses('BOSS', ['ej1', 'ej5', 'missing']);
    check('getJobStatuses 标注（SEEN / NEW / 缺失无）', statuses.ej1 === 'SEEN' && statuses.ej5 === 'NEW' && statuses.missing === undefined);

    // ---- 6. 详情成功 → SEEN（经 Service 层 helper）----
    upsertJobs([makeJob('ej2')]);
    persistJobDetailOutcome(makeJob('ej2'), { status: 'SUCCESS', detail: { platform: 'BOSS', title: '岗位2', jdText: 'JD 文本 2' } });
    const row6 = getJobRow('BOSS', 'ej2');
    check('详情成功 → SEEN', row6.status === 'SEEN');
    check('详情成功 → JD 已保存', row6.jd_text === 'JD 文本 2');

    // ---- 7. 详情失败 → 不标记（保持 NEW，无 JD）----
    upsertJobs([makeJob('ej3')]);
    persistJobDetailOutcome(makeJob('ej3'), { status: 'SECURITY_RESTRICTED', detail: null, message: '平台安全验证' });
    const row7 = getJobRow('BOSS', 'ej3');
    check('详情失败 → 仍为 NEW', row7.status === 'NEW');
    check('详情失败 → 无 JD', row7.jd_text === null);

    // ---- 8. 跳过无 platformJobId 的岗位 ----
    const s8 = upsertJobs([{ id: 'lid-only', platform: 'BOSS', title: 'x', company: 'y' }]);
    check('无 platformJobId → skipped 不计入', s8.skipped === 1 && countJobs() === 5, JSON.stringify(s8));

    // ---- 9. TEST/PROD 物理隔离 ----
    fs.mkdirSync(PROD_DIR, { recursive: true });
    const prodDb = new Database(path.join(PROD_DIR, 'jobpilot.db'));
    prodDb.pragma('journal_mode = WAL');
    runMigrations(prodDb);
    const prodCount = prodDb.prepare('SELECT COUNT(*) AS c FROM jobs').get().c;
    check('PROD 独立库为空（不共享 TEST 数据）', prodCount === 0);
    check('PROD 库 jobs 表结构存在（migration 生效）', prodDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='jobs'").get() !== undefined);
    prodDb.close();

    // ---- 10. migration 幂等（同一库重复执行不报错、不重复建表）----
    let idempotent = true;
    try {
      runMigrations(db);
      runMigrations(db);
    } catch {
      idempotent = false;
    }
    check('migration 幂等（重复执行不报错）', idempotent);

    // prod 用新实例二次验证迁移幂等
    const prodDb2 = new Database(path.join(PROD_DIR, 'jobpilot.db'));
    runMigrations(prodDb2);
    runMigrations(prodDb2);
    const prodCount2 = prodDb2.prepare('SELECT COUNT(*) AS c FROM jobs').get().c;
    prodDb2.close();
    check('migration 幂等（PROD 二次执行后仍空）', prodCount2 === 0);

    dbMod.closeDatabase();
  } catch (err) {
    console.error('JOB PERSIST TEST ERROR:', err);
    failures += 1;
  }

  console.log(failures === 0 ? 'JOB PERSIST TEST: ALL PASS' : `JOB PERSIST TEST: ${failures} FAIL`);

  try {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    fs.rmSync(PROD_DIR, { recursive: true, force: true });
  } catch {
    // 忽略
  }

  app.exit(failures === 0 ? 0 : 1);
});
