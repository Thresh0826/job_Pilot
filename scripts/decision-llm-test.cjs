/**
 * V0.4-D LLM 语义决策测试（Electron 运行时，注入 mock Provider，不调用真实 API）。
 * 覆盖：
 * - 配置了 Provider → 走 LLM 决策（verdict 来自 Provider）
 * - 硬规则护栏：LLM 说 AUTO_APPLY 但违反用户明确规则 → 强制 SKIP 并给出违反规则
 * - LLM 调用失败 → 回退本地规则引擎（决策仍可用）
 * - 未配置 Provider → 回退本地规则引擎（行为与 V0.4-B 一致）
 * - 决策结果持久化 / 复用 / 过期机制不受 Provider 影响
 * - AI 模型配置保存 / 读取（Key 本地存储）
 */
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const TEST_DIR = path.resolve(__dirname, '..', 'dev-data', `decision-llm-test-${process.pid}`);

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

/** mock Provider：返回可编程的 LLM 决策；记录调用次数。 */
function makeMockProvider(decision) {
  let calls = 0;
  return {
    name: 'Mock LLM',
    calls: () => calls,
    decide: async () => {
      calls += 1;
      if (typeof decision === 'function') return decision();
      return decision;
    },
  };
}

app.whenReady().then(async () => {
  let failures = 0;
  const check = (name, cond, extra = '') => {
    console.log(`${cond ? 'PASS' : 'FAIL'} - ${name}${extra ? ' ' + extra : ''}`);
    if (!cond) failures += 1;
  };

  try {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });

    const dbMod = require('../dist-electron/database/database.js');
    dbMod.initDatabase();
    const db = dbMod.getDb();

    const resumeRepo = require('../dist-electron/database/repositories/resumeRepository.js');
    const candidateRepo = require('../dist-electron/database/repositories/candidateRepository.js');
    const jobRepo = require('../dist-electron/database/repositories/jobRepository.js');
    const settingsRepo = require('../dist-electron/database/repositories/settingsRepository.js');
    const decisionService = require('../dist-electron/electron/main/services/decisionService.js');
    const decisionRepo = require('../dist-electron/database/repositories/decisionRepository.js');

    const dummyFile = path.join(dbMod.getResumesDir(), 'dummy.pdf');
    fs.writeFileSync(dummyFile, '%PDF-1.4 dummy');
    const resume = resumeRepo.insertResume({
      originalName: '简历.pdf', storedName: '1.pdf', filePath: dummyFile, fileSize: 14, mimeType: 'application/pdf',
    });
    candidateRepo.upsertProfile({ resumeId: resume.id, profile: PROFILE, sourceText: '刘杰' });
    decisionService.saveDecisionRules(RULES);

    const addJob = (id, overrides = {}) => {
      jobRepo.upsertJobs([{
        id, platform: 'BOSS', platformJobId: id, title: '测试开发工程师', company: '某某科技',
        salary: '10-15K', location: '无锡', city: '无锡', degree: '本科', experience: '1-3年', ...overrides,
      }]);
      db.prepare(`UPDATE jobs SET jd_text = ? WHERE platform_job_id = ?`).run(JD_OK, id);
    };

    // ---- 1. AI 模型配置保存 / 读取 ----
    settingsRepo.saveAiModelConfig({ provider: 'deepseek', apiKey: 'sk-test-local', model: 'deepseek-chat' });
    const cfg = settingsRepo.getAiModelConfig();
    check('模型配置保存 / 读取', cfg.provider === 'deepseek' && cfg.apiKey === 'sk-test-local' && cfg.model === 'deepseek-chat', JSON.stringify(cfg));
    const probe = decisionService.buildConfiguredProvider();
    check('配置了 Key → 构造 Provider', probe !== null && probe.name.includes('DeepSeek'));

    // ---- 2. LLM 决策生效（AUTO_APPLY）----
    addJob('la1');
    const llmAuto = makeMockProvider({
      verdict: 'AUTO_APPLY', matches: ['方向一致', '技能匹配'], risks: [], unknowns: [],
      reason: '符合你的目标方向与技能栈。', confidence: 'HIGH',
    });
    const v1 = await decisionService.analyzeJobDecisionWith('BOSS', 'la1', llmAuto);
    check('LLM → AUTO_APPLY 生效', v1.decision !== null && v1.decision.verdict === 'AUTO_APPLY' && v1.decision.matches.length === 2, JSON.stringify(v1.decision));

    // ---- 3. 硬规则护栏：LLM 说 AUTO_APPLY 但违反城市规则 → 强制 SKIP ----
    addJob('lb1', { city: '上海' });
    const llmViolate = makeMockProvider({
      verdict: 'AUTO_APPLY', matches: ['方向一致'], risks: [], unknowns: [],
      reason: '方向很匹配。', confidence: 'HIGH',
    });
    const v2 = await decisionService.analyzeJobDecisionWith('BOSS', 'lb1', llmViolate);
    check('护栏：违反硬规则 → 强制 SKIP', v2.decision !== null && v2.decision.verdict === 'SKIP', JSON.stringify(v2.decision));
    check('护栏：给出违反的规则', v2.decision !== null && v2.decision.ruleViolations.some((r) => r.includes('城市')), JSON.stringify(v2.decision?.ruleViolations));

    // ---- 4. LLM 调用失败 → 回退本地规则引擎 ----
    addJob('lc1');
    const llmFail = makeMockProvider(() => {
      throw new Error('API 超时');
    });
    const v3 = await decisionService.analyzeJobDecisionWith('BOSS', 'lc1', llmFail);
    check('LLM 失败 → 回退本地引擎（仍出决策）', v3.decision !== null && ['AUTO_APPLY', 'REVIEW', 'SKIP'].includes(v3.decision.verdict), JSON.stringify(v3.decision));
    check('回退后决策持久化', decisionRepo.getDecision('BOSS', 'lc1') !== null);

    // ---- 5. 未配置 Provider → 回退本地引擎（analyzeJobDecision 默认路径）----
    settingsRepo.saveAiModelConfig({ provider: '', apiKey: '', model: 'deepseek-chat' });
    check('未配置 → buildConfiguredProvider 返回 null', decisionService.buildConfiguredProvider() === null);
    addJob('ld1');
    const v4 = await decisionService.analyzeJobDecision('BOSS', 'ld1');
    check('无配置 → 本地引擎决策', v4.decision !== null && ['AUTO_APPLY', 'REVIEW', 'SKIP'].includes(v4.decision.verdict), JSON.stringify(v4.decision));

    // ---- 6. LLM 决策结果也参与复用 / 过期 ----
    settingsRepo.saveAiModelConfig({ provider: 'deepseek', apiKey: 'sk-test-local', model: 'deepseek-chat' });
    const v5 = await decisionService.analyzeJobDecisionWith('BOSS', 'la1', llmAuto);
    check('重新分析覆盖旧结果（LLM）', v5.decision !== null && v5.decision.verdict === 'AUTO_APPLY');
    decisionService.saveDecisionRules({ ...RULES, targetCities: ['苏州'] });
    const v6 = await decisionService.getJobDecision('BOSS', 'la1');
    check('规则变化 → 旧结果过期（LLM 结果同样标记）', v6.stale === true && v6.staleReasons.some((r) => r.includes('求职规则')), JSON.stringify(v6.staleReasons));
    decisionService.saveDecisionRules(RULES);

    dbMod.closeDatabase();
  } catch (err) {
    console.error('DECISION LLM TEST ERROR:', err);
    failures += 1;
  }

  console.log(failures === 0 ? 'DECISION LLM TEST: ALL PASS' : `DECISION LLM TEST: ${failures} FAIL`);

  try {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {
    // 忽略
  }

  app.exit(failures === 0 ? 0 : 1);
});
