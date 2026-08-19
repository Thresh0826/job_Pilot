/**
 * V0.4-A 真实简历回归测试（Electron 运行时）。
 *
 * 使用用户提供的真实简历 PDF（dev-data/resumes/ 下的「附件简历-刘杰-测试-26年应届生.pdf」）
 * 作为回归样本，走完整链路：PDF → 版面行（视觉顺序）→ Section/实体解析 → Candidate Profile。
 *
 * 验收点（与用户人工验收一致）：
 * - 教育：江苏理工学院 / 本科 / 物联网工程 / 2022-2026
 * - 实习：3 段独立经历，公司 / 时间 / 岗位对应正确，内容不串
 * - 项目：不互相合并
 * - 技能：无「掌握 / 模式及 / 2.」等垃圾词；CI/CD 不被拆开
 * - 结构化字段全部来自原文（不编造）
 *
 * 该简历为本地测试数据（dev-data 不入 Git），文件缺失时打印 SKIP 不阻塞其它测试。
 */
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const RESUMES_DIR = path.resolve(__dirname, '..', 'dev-data', 'resumes');

app.whenReady().then(async () => {
  let failures = 0;
  const check = (name, cond, extra = '') => {
    console.log(`${cond ? 'PASS' : 'FAIL'} - ${name}${extra ? ' ' + extra : ''}`);
    if (!cond) failures += 1;
  };

  const resumeFiles = fs
    .readdirSync(RESUMES_DIR)
    .filter((f) => f.endsWith('.pdf'))
    .map((f) => path.join(RESUMES_DIR, f));
  if (resumeFiles.length === 0) {
    console.log('REAL RESUME NOT FOUND - SKIP');
    app.exit(0);
    return;
  }

  try {
    const { extractLayoutLines } = require('../dist-electron/electron/main/services/candidateService.js');
    const { parseCandidateProfileLayout, computeParseWarnings } = require('../dist-electron/core/candidate/parser.js');

    const lines = await extractLayoutLines(resumeFiles[0]);
    const texts = lines.map((l) => l.text);

    // ---- 1. 版面行：视觉顺序恢复（「实习经历」标题必须在公司行之前）----
    const idxTitle = texts.findIndex((t) => t === '实习经历');
    const idxVivor = texts.findIndex((t) => t.includes('南京维沃'));
    check('版面行：实习经历标题在公司行之前', idxTitle >= 0 && idxVivor > idxTitle, `title=${idxTitle} vivor=${idxVivor}`);
    check('版面行：教育经历标题在学校行之前', (() => {
      const i1 = texts.findIndex((t) => t === '教育经历');
      const i2 = texts.findIndex((t) => t.includes('江苏理工学院'));
      return i1 >= 0 && i2 > i1;
    })());

    // ---- 2. 教育经历 ----
    const p = parseCandidateProfileLayout(lines);
    check('教育 = 1 条', p.education.length === 1, JSON.stringify(p.education));
    const edu = p.education[0] || {};
    check('教育-学校 江苏理工学院', edu.school === '江苏理工学院', JSON.stringify(edu.school));
    check('教育-学历 本科', edu.degree === '本科', JSON.stringify(edu.degree));
    check('教育-专业 物联网工程', edu.major === '物联网工程', JSON.stringify(edu.major));
    check('教育-时间 2022-2026', edu.startDate === '2022' && edu.endDate === '2026', JSON.stringify([edu.startDate, edu.endDate]));

    // ---- 3. 实习经历：3 段独立 ----
    check('实习 = 3 条独立经历', p.workExperience.length === 3, JSON.stringify(p.workExperience.map((w) => w.company)));
    const [e1, e2, e3] = p.workExperience;
    check('实习1-公司', e1.company === '南京维沃软件技术有限公司', JSON.stringify(e1.company));
    check('实习1-时间', e1.startDate === '2026.02' && e1.endDate === '2026.06', JSON.stringify([e1.startDate, e1.endDate]));
    check('实习1-岗位', e1.title.includes('测试开发'), JSON.stringify(e1.title));
    check('实习1-内容含 VIVO/内核', e1.description.includes('VIVO') && e1.description.includes('内核'), JSON.stringify(e1.description.slice(0, 60)));
    check('实习2-公司/时间', e2.company === '无锡沐创集成电路设计有限公司' && e2.startDate === '2025.11' && e2.endDate === '2026.02', JSON.stringify([e2.company, e2.startDate]));
    check('实习2-岗位', e2.title.includes('网络测试'), JSON.stringify(e2.title));
    check('实习2-内容不串', e2.description.includes('网卡') && !e2.description.includes('VIVO'), JSON.stringify(e2.description.slice(0, 60)));
    check('实习3-公司/时间/岗位', e3.company === '明度智云（浙江）科技有限公司' && e3.startDate === '2025.03' && e3.endDate === '2025.09' && e3.title.includes('测试工程师'), JSON.stringify([e3.company, e3.startDate, e3.endDate, e3.title]));
    check('实习3-内容不串', e3.description.includes('医疗') && !e3.description.includes('网卡'), JSON.stringify(e3.description.slice(0, 60)));

    // ---- 4. 项目经历 ----
    check('项目 >= 1 且不合并', p.projectExperience.length >= 1 && p.projectExperience.length <= 4, JSON.stringify(p.projectExperience.map((x) => x.name)));
    check('项目-首个名称', p.projectExperience[0].name.includes('接口自动化测试'), JSON.stringify(p.projectExperience[0].name));

    // ---- 5. 技能 ----
    const skills = p.skills;
    const want = ['Python', 'Pytest', 'Selenium', 'Java', 'Java单元测试', 'PO模式', 'CI/CD', 'MySQL', 'Docker', 'Wireshark', 'LLM', 'Agent'];
    const missing = want.filter((w) => !skills.includes(w));
    check('技能核心实体齐全', missing.length === 0, `missing=${JSON.stringify(missing)} skills=${JSON.stringify(skills)}`);
    const junk = ['1', '2', '2.', '掌握', '熟悉', '熟练', '了解', '及', '模式及', '流水线搭建', '……', '运用'];
    const junkHit = junk.filter((j) => skills.includes(j));
    check('技能无垃圾词（序号/动词/连接碎片）', junkHit.length === 0, `junkHit=${JSON.stringify(junkHit)}`);
    check('CI/CD 未被拆成 CI 和 CD', !skills.includes('CI') && !skills.includes('CD'), JSON.stringify(skills.filter((s) => s === 'CI' || s === 'CD')));

    // ---- 6. 字段全部来自原文（不编造）----
    // 合并实体（Java 单元测试 → Java单元测试）只是去掉原文空格，内容仍是原文子串。
    const fullText = lines.map((l) => l.text).join('\n');
    const compactText = fullText.replace(/\s+/g, '');
    const substrings = [
      p.name,
      p.phone,
      p.email,
      ...p.education.flatMap((x) => [x.school, x.major, x.degree, x.startDate, x.endDate]),
      ...p.workExperience.flatMap((x) => [x.company, x.title, x.startDate, x.endDate]),
      ...p.skills,
    ].filter((s) => s && s !== '至今');
    const fabricated = substrings.filter((s) => !fullText.includes(s) && !compactText.includes(s.replace(/\s+/g, '')));
    check('结构化字段全部来自原文（不编造）', fabricated.length === 0, `fabricated=${JSON.stringify(fabricated)}`);
    check('姓名 刘杰', p.name === '刘杰', JSON.stringify(p.name));

    // ---- 7. 完整简历无解析提示 ----
    const warnings = computeParseWarnings(lines, p);
    check('完整简历无解析提示', warnings.length === 0, JSON.stringify(warnings));
  } catch (err) {
    console.error('REAL RESUME TEST ERROR:', err);
    failures += 1;
  }

  console.log(failures === 0 ? 'REAL RESUME TEST: ALL PASS' : `REAL RESUME TEST: ${failures} FAIL`);
  app.exit(failures === 0 ? 0 : 1);
});
