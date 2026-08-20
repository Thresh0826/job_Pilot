/**
 * V0.4-C 批量岗位决策测试（Electron 运行时，注入 fake 详情读取，不触碰真实 Chrome/BOSS）。
 * 覆盖：
 * - 批次范围：一次搜索运行 = 一批，覆盖批次内全部 NEW；历史批次不混入
 * - 统计口径：total = done(auto+review+skip) + failed + pending
 * - 已有完整 JD 直接决策；缺 JD 有节制地顺序读取（节流可注入）
 * - 读取结果不是有效岗位详情（JD 过短）→ 不决策、标记失败、后续可重新处理
 * - 同一岗位失败不立即重试；单岗位分析成功可清除失败标记
 * - 安全验证 / 登录失效 → PAUSED，提示人工处理；处理后「继续分析」从剩余继续
 * - 中途停止 → CANCELLED 保留已完成；继续分析只处理剩余
 * - 规则变化 → 过期 → 重新分析
 * - REVIEW 队列 + 用户处理；无资料拒绝；TEST/PROD 隔离
 */
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const TEST_DIR = path.resolve(__dirname, '..', 'dev-data', `batch-analysis-test-${process.pid}`);
const PROD_DIR = path.resolve(__dirname, '..', 'dev-data', `batch-analysis-test-${process.pid}-prod`);

process.env.JOBPILOT_DATA_DIR = TEST_DIR;

const PROFILE = {
  name: '刘杰', phone: '', email: '', workYears: '3年', summary: '',
  education: [{ startDate: '2022', endDate: '2026', school: '江苏理工学院', major: '物联网工程', degree: '本科' }],
  workExperience: [], projectExperience: [],
  skills: ['Python', 'Pytest', 'Selenium', 'MySQL'],
  certificates: [], languages: [],
};

const RULES = {
  targetJobs: ['测试开发'], targetCities: ['无锡'], minSalary: 8000,
  acceptOutsourcing: false, weekendPreference: 'MUST_DOUBLE',
  degreeTolerance: 'FLEXIBLE', experienceTolerance: 'FLEXIBLE', excludedKeywords: [],
};

const JD_OK =
  '岗位职责：负责自动化测试开发与质量保障，包括测试用例设计、接口自动化与持续集成流水线维护。任职要求：熟练 Python、Pytest、Selenium，熟悉 MySQL 数据库，了解 Docker 容器化部署。福利：周末双休，五险一金。';

const JD_MASTER =
  '岗位职责：负责软件测试工作，包括测试计划制定与执行、缺陷跟踪与测试报告输出。任职要求：硕士及以上学历，具备扎实的软件测试基础与良好的沟通能力，有自动化测试经验者优先。';

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
    runMigrations(db);

    const resumeRepo = require('../dist-electron/database/repositories/resumeRepository.js');
    const candidateRepo = require('../dist-electron/database/repositories/candidateRepository.js');
    const jobRepo = require('../dist-electron/database/repositories/jobRepository.js');
    const decisionService = require('../dist-electron/electron/main/services/decisionService.js');
    const batchService = require('../dist-electron/electron/main/services/batchDecisionService.js');
    const decisionRepo = require('../dist-electron/database/repositories/decisionRepository.js');

    const dummyFile = path.join(dbMod.getResumesDir(), 'dummy.pdf');
    fs.writeFileSync(dummyFile, '%PDF-1.4 dummy');
    const resume = resumeRepo.insertResume({
      originalName: '简历.pdf', storedName: '1.pdf', filePath: dummyFile, fileSize: 14, mimeType: 'application/pdf',
    });
    candidateRepo.upsertProfile({ resumeId: resume.id, profile: PROFILE, sourceText: '刘杰' });
    decisionService.saveDecisionRules(RULES);

    const makeJob = (platformJobId, overrides = {}) => ({
      id: platformJobId, platform: 'BOSS', platformJobId,
      title: '测试开发工程师', company: '某某科技', salary: '10-15K',
      location: '无锡', city: '无锡', degree: '本科', experience: '1-3年', ...overrides,
    });
    const setBatch = (ids, batchAt) => {
      for (const id of ids) {
        db.prepare(`UPDATE jobs SET discovered_batch_at = ? WHERE platform_job_id = ?`).run(batchAt, id);
      }
    };
    const setJd = (id, jd) => db.prepare(`UPDATE jobs SET jd_text = ? WHERE platform_job_id = ?`).run(jd, id);

    // 批次 b1：A/B 有 JD；C 无 JD（详情成功）；D 无 JD（详情为无效短文本）
    jobRepo.upsertJobs([makeJob('ja'), makeJob('jb', { degree: '硕士' }), makeJob('jc', { title: '测试开发实习生' }), makeJob('jd')]);
    jobRepo.upsertJobs([makeJob('ja')]); // 重复发现，验证去重
    setBatch(['ja', 'jb', 'jc', 'jd'], 'batch-1');
    setJd('ja', JD_OK);
    setJd('jb', JD_MASTER);

    let fetchCalls = [];
    const fetchDetailOk = async (job) => {
      fetchCalls.push(job.platformJobId);
      if (job.platformJobId === 'jd') {
        return { status: 'SUCCESS', detail: { platform: 'BOSS', platformJobId: 'jd', title: job.title, jdText: '岗位' } }; // 短 JD
      }
      if (job.platformJobId === 'e1') {
        return { status: 'SUCCESS', detail: { platform: 'BOSS', platformJobId: 'e1', title: job.title, jdText: '岗位职责：负责公司新媒体平台（公众号、抖音等）的内容策划与日常运营，包括选题规划、文案撰写、粉丝互动与数据复盘，配合团队完成活动推广。任职要求：熟悉新媒体运营流程，具备一定的内容创作与数据分析能力，有相关实习经验者优先。' } };
      }
      return { status: 'SUCCESS', detail: { platform: 'BOSS', platformJobId: job.platformJobId, title: job.title, jdText: JD_OK } };
    };
    const opts = { fetchDetail: fetchDetailOk, detailDelayMs: 0 };

    // ---- 1. 首批分析：整批覆盖 + 短 JD 拒绝决策 ----
    const r1 = await batchService.runBatchAnalysis('BOSS', opts);
    check('首批 COMPLETED，统计一致 total=done+failed+pending', r1.status === 'COMPLETED' && r1.total === r1.done + r1.failed + r1.pending, JSON.stringify(r1));
    check('total=4 done=3（A AUTO + B REVIEW + C AUTO）', r1.total === 4 && r1.done === 3 && r1.autoApply === 2 && r1.review === 1 && r1.failed === 1, JSON.stringify(r1));
    check('短 JD 不决策（jd 无决策记录）', decisionRepo.getDecision('BOSS', 'jd') === null);
    check('详情读取只处理无 JD 岗位', JSON.stringify(fetchCalls.sort()) === JSON.stringify(['jc', 'jd']), JSON.stringify(fetchCalls));

    // ---- 2. 再次运行：失败标记不重试、有效决策不重复 ----
    fetchCalls = [];
    const r2 = await batchService.runBatchAnalysis('BOSS', opts);
    check('再次运行不重试（fetchCalls 为空）', fetchCalls.length === 0, JSON.stringify(fetchCalls));
    check('done=2（A/B）failed=1（D 已标记）pending=0', r2.done === 2 && r2.failed === 1 && r2.pending === 0 && r2.total === 3, JSON.stringify(r2));

    // ---- 3. 规则变化 → 过期 → 重新分析 ----
    decisionService.saveDecisionRules({ ...RULES, targetCities: ['苏州'] });
    const r3 = await batchService.runBatchAnalysis('BOSS', opts);
    check('规则变化后重新分析（A/B → SKIP）', r3.done === 2 && r3.skip === 2, JSON.stringify(r3));
    decisionService.saveDecisionRules(RULES);

    // ---- 4. 批次隔离：只处理最近批次 ----
    jobRepo.upsertJobs([makeJob('e1', { title: '新媒体运营' })]);
    jobRepo.upsertJobs([makeJob('f1', { title: '历史积压岗位' })]);
    setBatch(['e1'], 'batch-2');
    setBatch(['f1'], 'batch-0');
    fetchCalls = [];
    const r4 = await batchService.runBatchAnalysis('BOSS', opts);
    check('只处理最近批次（e1），历史批次不混入', r4.total === 1 && r4.done === 1, JSON.stringify(r4));
    check('新批次岗位被读取详情', fetchCalls.includes('e1') && !fetchCalls.includes('f1'), JSON.stringify(fetchCalls));

    // ---- 5. 单个岗位触发安全验证 → 跳过该岗位继续，任务不中断 ----
    jobRepo.upsertJobs([makeJob('je'), makeJob('jg')]);
    setBatch(['je', 'jg'], 'batch-3');
    const r5 = await batchService.runBatchAnalysis('BOSS', {
      fetchDetail: async (job) => {
        if (job.platformJobId === 'je') return { status: 'SECURITY_RESTRICTED', detail: null, message: '平台安全验证' };
        return { status: 'SUCCESS', detail: { platform: 'BOSS', platformJobId: job.platformJobId, title: job.title, jdText: JD_OK } };
      },
      detailDelayMs: 0,
    });
    check('单个岗位触发验证 → 跳过继续（任务 COMPLETED）', r5.status === 'COMPLETED' && r5.failed === 1 && r5.done === 1, JSON.stringify(r5));
    check('验证失败的岗位已标记（不阻塞其他岗位）', decisionRepo.getDecision('BOSS', 'je') === null && decisionRepo.getDecision('BOSS', 'jg') !== null);
    const jeRow = db.prepare(`SELECT analysis_failed_at FROM jobs WHERE platform_job_id = 'je'`).get();
    check('触发验证的岗位标记失败', jeRow.analysis_failed_at !== null);

    // ---- 6. 中途停止 → CANCELLED；继续分析只处理剩余 ----
    jobRepo.upsertJobs([makeJob('jf1'), makeJob('jf2')]);
    setBatch(['jf1', 'jf2'], 'batch-4');
    let detailCalls = 0;
    const r6 = await batchService.runBatchAnalysis('BOSS', {
      fetchDetail: async (job) => {
        detailCalls += 1;
        return { status: 'SUCCESS', detail: { platform: 'BOSS', platformJobId: job.platformJobId, title: job.title, jdText: JD_OK } };
      },
      detailDelayMs: 0,
      isCancelled: () => detailCalls >= 1, // 处理完 1 个后取消
    });
    check('停止 → CANCELLED 且保留已完成', r6.status === 'CANCELLED' && r6.done === 1 && r6.pending === 1, JSON.stringify(r6));
    const r6b = await batchService.runBatchAnalysis('BOSS', opts);
    check('继续分析 → 只处理剩余岗位（jf1 已 SEEN）', r6b.status === 'COMPLETED' && r6b.done === 1 && r6b.pending === 0, JSON.stringify(r6b));

    // ---- 7. REVIEW 队列 + 用户处理（e1 为方向不符的 REVIEW）----
    const queue = decisionRepo.getReviewQueue('BOSS');
    check('REVIEW 队列包含 e1（未处理）', queue.some((q) => q.platformJobId === 'e1') && queue.every((q) => q.decision.userAction === 'NONE'), JSON.stringify(queue.map((q) => q.platformJobId)));
    const updated = decisionService.updateJobDecisionAction('BOSS', 'e1', 'ALLOW');
    check('允许投递 → userAction=ALLOW（verdict 不变）', updated !== null && updated.userAction === 'ALLOW' && updated.verdict === 'REVIEW');
    check('处理后不在队列', !decisionRepo.getReviewQueue('BOSS').some((q) => q.platformJobId === 'e1'));
    decisionService.updateJobDecisionAction('BOSS', 'e1', 'NONE');
    check('撤销 → 回到队列', decisionRepo.getReviewQueue('BOSS').some((q) => q.platformJobId === 'e1'));

    // ---- 8. 单岗位分析成功清除失败标记（D 可重试）----
    setJd('jd', JD_OK);
    const dView = decisionService.analyzeJobDecision('BOSS', 'jd');
    check('单岗位分析成功', dView.decision !== null && dView.decision.verdict === 'AUTO_APPLY');
    const jdRow = db.prepare(`SELECT analysis_failed_at FROM jobs WHERE platform_job_id = 'jd'`).get();
    check('失败标记已清除', jdRow.analysis_failed_at === null, JSON.stringify(jdRow));

    // ---- 9. 无资料 → 拒绝分析 ----
    const { removeResume } = require('../dist-electron/electron/main/services/resumeService.js');
    removeResume();
    let threw = false;
    try {
      await batchService.runBatchAnalysis('BOSS', opts);
    } catch (err) {
      threw = /资料/.test(String(err.message));
    }
    check('无资料 → 拒绝批量分析', threw);

    // ---- 10. TEST/PROD 隔离 + migration ----
    fs.mkdirSync(PROD_DIR, { recursive: true });
    const prodDb = new (require('better-sqlite3'))(path.join(PROD_DIR, 'jobpilot.db'));
    prodDb.pragma('journal_mode = WAL');
    runMigrations(prodDb);
    const prodJobCols = prodDb.prepare('PRAGMA table_info(jobs)').all().map((c) => c.name);
    check('PROD 迁移含批次/失败标记列', prodJobCols.includes('discovered_batch_at') && prodJobCols.includes('analysis_failed_at'));
    prodDb.close();

    dbMod.closeDatabase();
  } catch (err) {
    console.error('BATCH ANALYSIS TEST ERROR:', err);
    failures += 1;
  }

  console.log(failures === 0 ? 'BATCH ANALYSIS TEST: ALL PASS' : `BATCH ANALYSIS TEST: ${failures} FAIL`);

  try {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    fs.rmSync(PROD_DIR, { recursive: true, force: true });
  } catch {
    // 忽略
  }

  app.exit(failures === 0 ? 0 : 1);
});
