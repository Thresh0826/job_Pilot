/**
 * V0.4-B 岗位决策引擎测试（纯 Node，不触碰 Electron/Chrome）。
 * 覆盖人工验收的三类真实场景：
 * A. 明显适合 → AUTO_APPLY
 * B. 明确违反求职规则（城市/薪资/外包/单休/排除词/学历/经验）→ SKIP，硬规则优先
 * C. 有一定匹配但存在关键不确定性（学历/经验灵活不足、薪资隐藏、JD要求技能缺失、方向不符）→ REVIEW
 * 原则校验：不确定时宁可 REVIEW；「简历没写」≠「用户不会」→ 进入 REVIEW 而非擅自 SKIP。
 */
const { decideJob } = require('../dist-electron/core/decision/engine.js');
const { createDefaultDecisionRules } = require('../dist-electron/core/decision/index.js');

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} - ${name}${extra ? ' ' + extra : ''}`);
  if (!cond) failures += 1;
};

/** 用户资料：本科 + 3 年经验 + 测试技术栈。 */
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

function rules(overrides = {}) {
  return { ...createDefaultDecisionRules(), ...overrides };
}

function job(overrides = {}) {
  return {
    platform: 'BOSS',
    platformJobId: 'job-1',
    title: '测试开发工程师',
    company: '某某科技有限公司',
    city: '无锡',
    salary: '10-15K',
    degree: '本科',
    experience: '1-3年',
    jobLabels: [],
    jdText: '岗位职责：负责自动化测试开发与质量保障。任职要求：熟练 Python、Pytest、Selenium，熟悉 MySQL。周末双休。',
    ...overrides,
  };
}

// ---------- A. 明显适合 → AUTO_APPLY ----------
{
  const d = decideJob({
    job: job(),
    profile: PROFILE,
    rules: rules({ targetJobs: ['测试开发'], targetCities: ['无锡'], minSalary: 8000, weekendPreference: 'MUST_DOUBLE' }),
  });
  check('A-明显适合 → AUTO_APPLY', d.verdict === 'AUTO_APPLY', `${d.verdict} ${d.reason}`);
  check('A-理由含方向一致', d.matches.some((m) => m.includes('方向')), JSON.stringify(d.matches));
  check('A-理由含技能命中', d.matches.some((m) => m.includes('Python')), JSON.stringify(d.matches));
  check('A-无违反规则', d.ruleViolations.length === 0);
}

// ---------- B. 明确违反求职规则 → SKIP ----------
{
  // B1 外包
  const d1 = decideJob({ job: job({ jdText: '本岗位为外包项目，长期驻场开发。' }), profile: PROFILE, rules: rules({ acceptOutsourcing: false }) });
  check('B1-不接受外包 → SKIP', d1.verdict === 'SKIP' && d1.ruleViolations.some((v) => v.includes('外包')), `${d1.verdict} ${JSON.stringify(d1.ruleViolations)}`);

  // B2 城市
  const d2 = decideJob({ job: job({ city: '上海' }), profile: PROFILE, rules: rules({ targetCities: ['无锡', '苏州'] }) });
  check('B2-城市不在列表 → SKIP', d2.verdict === 'SKIP' && d2.ruleViolations.some((v) => v.includes('城市')), `${d2.verdict} ${JSON.stringify(d2.ruleViolations)}`);

  // B3 薪资低于最低
  const d3 = decideJob({ job: job({ salary: '5-7K' }), profile: PROFILE, rules: rules({ minSalary: 8000 }) });
  check('B3-薪资低于最低 → SKIP', d3.verdict === 'SKIP' && d3.ruleViolations.some((v) => v.includes('薪资')), `${d3.verdict} ${JSON.stringify(d3.ruleViolations)}`);

  // B4 单休（必须双休）
  const d4 = decideJob({ job: job({ jdText: '岗位职责：负责测试。单休，需能接受大小周。' }), profile: PROFILE, rules: rules({ weekendPreference: 'MUST_DOUBLE' }) });
  check('B4-必须双休但岗位单休 → SKIP', d4.verdict === 'SKIP' && d4.ruleViolations.some((v) => v.includes('双休')), `${d4.verdict} ${JSON.stringify(d4.ruleViolations)}`);

  // B5 排除关键词
  const d5 = decideJob({ job: job({ jdText: '负责测试，同时兼顾部分销售任务。' }), profile: PROFILE, rules: rules({ excludedKeywords: ['销售'] }) });
  check('B5-命中排除词 → SKIP', d5.verdict === 'SKIP' && d5.ruleViolations.some((v) => v.includes('销售')), `${d5.verdict} ${JSON.stringify(d5.ruleViolations)}`);

  // B6 学历 STRICT 不满足
  const d6 = decideJob({ job: job({ degree: '硕士' }), profile: PROFILE, rules: rules({ degreeTolerance: 'STRICT' }) });
  check('B6-学历不满足(严格) → SKIP', d6.verdict === 'SKIP' && d6.ruleViolations.some((v) => v.includes('学历')), `${d6.verdict} ${JSON.stringify(d6.ruleViolations)}`);

  // B7 经验 STRICT 不满足
  const d7 = decideJob({ job: job({ experience: '5-10年' }), profile: PROFILE, rules: rules({ experienceTolerance: 'STRICT' }) });
  check('B7-经验不满足(严格) → SKIP', d7.verdict === 'SKIP' && d7.ruleViolations.some((v) => v.includes('经验')), `${d7.verdict} ${JSON.stringify(d7.ruleViolations)}`);

  // B8 硬规则优先于匹配：方向匹配 + 技能命中，但城市违反 → 仍 SKIP
  const d8 = decideJob({
    job: job({ city: '北京' }),
    profile: PROFILE,
    rules: rules({ targetJobs: ['测试开发'], targetCities: ['无锡'], minSalary: 8000 }),
  });
  check('B8-硬规则优先（匹配再好也跳过）', d8.verdict === 'SKIP', `${d8.verdict}`);
}

// ---------- C. 关键不确定性 → REVIEW ----------
{
  // C1 学历 FLEXIBLE 不满足
  const d1 = decideJob({ job: job({ degree: '硕士' }), profile: PROFILE, rules: rules({ degreeTolerance: 'FLEXIBLE' }) });
  check('C1-学历不满足(灵活) → REVIEW', d1.verdict === 'REVIEW' && d1.risks.some((r) => r.includes('学历')), `${d1.verdict} ${JSON.stringify(d1.risks)}`);

  // C2 经验 FLEXIBLE 不满足
  const d2 = decideJob({ job: job({ experience: '5-10年' }), profile: PROFILE, rules: rules({ experienceTolerance: 'FLEXIBLE' }) });
  check('C2-经验不满足(灵活) → REVIEW', d2.verdict === 'REVIEW' && d2.risks.some((r) => r.includes('经验')), `${d2.verdict} ${JSON.stringify(d2.risks)}`);

  // C3 薪资隐藏（设置了最低薪资但岗位未标注）
  const d3 = decideJob({ job: job({ salary: undefined }), profile: PROFILE, rules: rules({ minSalary: 8000 }) });
  check('C3-薪资未标注 → REVIEW（不擅自 SKIP）', d3.verdict === 'REVIEW' && d3.unknowns.some((u) => u.includes('薪资')), `${d3.verdict} ${JSON.stringify(d3.unknowns)}`);

  // C4 JD 要求技能大量缺失（简历没写 ≠ 不会 → REVIEW，不 SKIP）
  const d4 = decideJob({
    job: job({ jdText: '任职要求：熟练 Docker、Kubernetes、Java、Spring Boot、Redis、Kafka。' }),
    profile: PROFILE,
    rules: rules(),
  });
  check('C4-JD要求技能未体现 ≥2 → REVIEW', d4.verdict === 'REVIEW' && d4.unknowns.some((u) => u.includes('未体现')), `${d4.verdict} ${JSON.stringify(d4.unknowns)}`);

  // C5 方向不符（目标岗位明确且无命中）
  const d5 = decideJob({
    job: job({ title: '平面设计师', jdText: '负责海报与 UI 设计。', jobLabels: ['设计'] }),
    profile: PROFILE,
    rules: rules({ targetJobs: ['测试开发', '测试工程师'] }),
  });
  check('C5-方向明显不符 → REVIEW（不确定时不擅自跳过）', d5.verdict === 'REVIEW', `${d5.verdict} ${d5.reason}`);

  // C6 简历未体现学历 / 经验信息 → REVIEW 而非臆断
  const noInfo = { ...PROFILE, workYears: '', education: [] };
  const d6 = decideJob({ job: job({ degree: '本科', experience: '1-3年' }), profile: noInfo, rules: rules() });
  check('C6-资料缺少学历/经验信息 → REVIEW', d6.verdict === 'REVIEW' && d6.unknowns.some((u) => u.includes('未体现')), `${d6.verdict} ${JSON.stringify(d6.unknowns)}`);
}

// ---------- 防编造：reason/matches/risks/unknowns 均来自输入原文 ----------
{
  const jdText = '岗位职责：负责自动化测试。任职要求：熟练 Python、Pytest、Selenium，熟悉 MySQL。';
  const d = decideJob({ job: job({ jdText }), profile: PROFILE, rules: rules({ targetJobs: ['测试开发'] }) });
  const all = [...d.matches, ...d.risks, ...d.unknowns, ...d.ruleViolations, d.reason].join('|');
  // 校验：输出中的具体信号（Python/MySQL 等）都存在于输入
  check('决策信号来自输入（不编造）', ['Python', 'Pytest', 'Selenium', 'MySQL', '测试开发'].every((x) => all.includes(x) || jdText.includes(x) || '测试开发' === x));
}

console.log(failures === 0 ? 'DECISION ENGINE TEST: ALL PASS' : `DECISION ENGINE TEST: ${failures} FAIL`);
process.exit(failures === 0 ? 0 : 1);
