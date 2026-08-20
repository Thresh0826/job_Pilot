/**
 * V0.4-B 岗位决策持久化测试（Electron 运行时，SQLite 直测，不触碰 Chrome）。
 * 覆盖：
 * - migration 建表 / 幂等 / TEST-PROD 隔离
 * - 规则保存 / 读取
 * - 分析 → 持久化 → 同一岗位复用（不重新分析）
 * - 修改规则 / 简历 / JD → 旧结果标记过期并给出具体原因
 * - 重新分析 → 新结果生效（硬规则变化 → 决策变化）
 * - 无候选人资料 → 拒绝分析
 */
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const TEST_DIR = path.resolve(__dirname, '..', 'dev-data', `decision-persist-test-${process.pid}`);
const PROD_DIR = path.resolve(__dirname, '..', 'dev-data', `decision-persist-test-${process.pid}-prod`);

process.env.JOBPILOT_DATA_DIR = TEST_DIR;

const PROFILE = {
  name: '刘杰',
  phone: '',
  email: '',
  workYears: '3年',
  summary: '',
  education: [{ startDate: '2022', endDate: '2026', school: '江苏理工学院', major: '物联网工程', degree: '本科' }],
  workExperience: [],
  projectExperience: [],
  skills: ['Python', 'Pytest', 'Selenium', 'MySQL', 'Linux'],
  certificates: [],
  languages: [],
};

const PROFILE_EDITED = { ...PROFILE, name: '刘杰（已修改）', skills: [...PROFILE.skills, 'Docker'] };

const RULES = {
  targetJobs: ['测试开发'],
  targetCities: ['无锡'],
  minSalary: 8000,
  acceptOutsourcing: false,
  weekendPreference: 'MUST_DOUBLE',
  degreeTolerance: 'FLEXIBLE',
  experienceTolerance: 'FLEXIBLE',
  excludedKeywords: [],
};

const JD_TEXT =
  '岗位职责：负责自动化测试开发与质量保障，包括测试用例设计、接口自动化与持续集成流水线维护。任职要求：熟练 Python、Pytest、Selenium，熟悉 MySQL 数据库，了解 Docker 容器化部署。福利：周末双休，五险一金。';

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
    dbMod.initDatabase();
    const db = dbMod.getDb();
    const { runMigrations } = require('../dist-electron/database/migrations.js');

    // ---- 1. migration ----
    const hasTable = (name) =>
      db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`).get() !== undefined;
    check('job_decision_rules 表存在', hasTable('job_decision_rules'));
    check('job_decisions 表存在', hasTable('job_decisions'));
    runMigrations(db);
    runMigrations(db);
    check('migration 幂等', hasTable('job_decisions'));

    // ---- 2. 准备：简历 + 资料 + 规则 + 岗位 ----
    const resumeRepo = require('../dist-electron/database/repositories/resumeRepository.js');
    const candidateRepo = require('../dist-electron/database/repositories/candidateRepository.js');
    const jobRepo = require('../dist-electron/database/repositories/jobRepository.js');
    const decisionService = require('../dist-electron/electron/main/services/decisionService.js');

    const dummyFile = path.join(dbMod.getResumesDir(), 'dummy.pdf');
    fs.writeFileSync(dummyFile, '%PDF-1.4 dummy');
    const resume = resumeRepo.insertResume({
      originalName: '简历.pdf',
      storedName: '1.pdf',
      filePath: dummyFile,
      fileSize: 14,
      mimeType: 'application/pdf',
    });
    candidateRepo.upsertProfile({ resumeId: resume.id, profile: PROFILE, sourceText: '刘杰' });
    decisionService.saveDecisionRules(RULES);

    const job = {
      id: 'ej1',
      platform: 'BOSS',
      platformJobId: 'ej1',
      title: '测试开发工程师',
      company: '某某科技有限公司',
      salary: '10-15K',
      location: '无锡',
      city: '无锡',
      degree: '本科',
      experience: '1-3年',
    };
    jobRepo.upsertJobs([job]);
    jobRepo.saveJobDetailSeen('BOSS', 'ej1', JD_TEXT);

    // ---- 3. 分析 → 持久化 ----
    const v1 = await decisionService.analyzeJobDecision('BOSS', 'ej1');
    check('分析结果 AUTO_APPLY', v1.decision !== null && v1.decision.verdict === 'AUTO_APPLY', v1.decision ? `${v1.decision.verdict} ${v1.decision.reason}` : 'null');
    check('分析后不 stale', v1.stale === false);

    // ---- 4. 复用：再次读取不重新分析，结果相同且不 stale ----
    const v2 = decisionService.getJobDecision('BOSS', 'ej1');
    check('复用已有结果（不重新分析）', v2.decision !== null && v2.decision.verdict === v1.decision.verdict && v2.decision.contextHash === v1.decision.contextHash);
    check('复用结果不 stale', v2.stale === false);
    const count = db.prepare('SELECT COUNT(*) AS c FROM job_decisions').get().c;
    check('决策只保存一条', count === 1);

    // ---- 5. 修改求职规则 → 旧结果过期 ----
    decisionService.saveDecisionRules({ ...RULES, targetCities: ['苏州'] });
    const v3 = decisionService.getJobDecision('BOSS', 'ej1');
    check('规则变更 → 旧结果过期', v3.stale === true && v3.decision !== null);
    check('过期原因含求职规则', v3.staleReasons.some((r) => r.includes('求职规则')), JSON.stringify(v3.staleReasons));

    // ---- 6. 重新分析 → 新规则生效（城市不符 → SKIP）----
    const v4 = await decisionService.analyzeJobDecision('BOSS', 'ej1');
    check('重新分析后不 stale', v4.stale === false);
    check('新规则生效（城市不符 → SKIP）', v4.decision !== null && v4.decision.verdict === 'SKIP', v4.decision ? `${v4.decision.verdict} ${JSON.stringify(v4.decision.ruleViolations)}` : 'null');
    check('SKIP 给出违反的规则', v4.decision !== null && v4.decision.ruleViolations.length > 0);

    // ---- 7. 恢复规则 + 修改简历资料 → 过期 ----
    decisionService.saveDecisionRules(RULES);
    candidateRepo.upsertProfile({ resumeId: resume.id, profile: PROFILE_EDITED, sourceText: '刘杰（已修改）' });
    const v5 = decisionService.getJobDecision('BOSS', 'ej1');
    check('简历变更 → 旧结果过期', v5.stale === true);
    check('过期原因含简历资料', v5.staleReasons.some((r) => r.includes('简历资料')), JSON.stringify(v5.staleReasons));

    // ---- 8. 修改 JD → 过期 ----
    jobRepo.saveJobDetailSeen('BOSS', 'ej1', JD_TEXT + ' 新增要求：掌握 Docker。');
    const v6 = decisionService.getJobDecision('BOSS', 'ej1');
    check('JD 变更 → 旧结果过期', v6.stale === true);
    check('过期原因含 JD', v6.staleReasons.some((r) => r.includes('JD')), JSON.stringify(v6.staleReasons));

    // ---- 9. 资料被删除 → 结果标记过期 + 拒绝新分析 ----
    const { removeResume } = require('../dist-electron/electron/main/services/resumeService.js');
    removeResume();
    const v7 = decisionService.getJobDecision('BOSS', 'ej1');
    check('资料删除 → 旧结果过期', v7.stale === true && v7.staleReasons.some((r) => r.includes('不存在')), JSON.stringify(v7.staleReasons));
    let threw = false;
    try {
      await decisionService.analyzeJobDecision('BOSS', 'ej1');
    } catch (err) {
      threw = /资料/.test(String(err.message));
    }
    check('无资料 → 拒绝分析', threw);

    // ---- 10. TEST/PROD 隔离 ----
    fs.mkdirSync(PROD_DIR, { recursive: true });
    const prodDb = new (require('better-sqlite3'))(path.join(PROD_DIR, 'jobpilot.db'));
    prodDb.pragma('journal_mode = WAL');
    runMigrations(prodDb);
    check('PROD 库决策为空', prodDb.prepare('SELECT COUNT(*) AS c FROM job_decisions').get().c === 0);
    prodDb.close();

    dbMod.closeDatabase();
  } catch (err) {
    console.error('DECISION PERSIST TEST ERROR:', err);
    failures += 1;
  }

  console.log(failures === 0 ? 'DECISION PERSIST TEST: ALL PASS' : `DECISION PERSIST TEST: ${failures} FAIL`);

  try {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    fs.rmSync(PROD_DIR, { recursive: true, force: true });
  } catch {
    // 忽略
  }

  app.exit(failures === 0 ? 0 : 1);
});
