/**
 * V0.4-A 候选人资料链路测试（Electron 运行时，SQLite + 真实本地解析，不触碰 Chrome）。
 * 覆盖：
 * - migration 建表 / 幂等 / 旧库 ALTER 补列 / TEST-PROD 隔离
 * - DOCX 与 PDF 文本提取
 * - 解析 → 持久化 → 用户修改 → 持久化（模拟重启后仍在）
 * - 更换简历：资料切换到新简历，旧资料记录保留
 * - 三段实习分别解析为独立记录，技能过滤垃圾词
 * - 解析完整性提示（warnings）持久化，用户确认后清空
 * - 移除简历：级联删除候选人资料
 */
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { makeDocx } = require('./helpers/docx-fixture.cjs');

const TEST_DIR = path.resolve(__dirname, '..', 'dev-data', `candidate-profile-test-${process.pid}`);
const PROD_DIR = path.resolve(__dirname, '..', 'dev-data', `candidate-profile-test-${process.pid}-prod`);

process.env.JOBPILOT_DATA_DIR = TEST_DIR;

// 简历一：完整中文简历（.docx）
const DOCX_ONE = makeDocx([
  '个人简历',
  '张三',
  '13800138000 | zhangsan@example.com',
  '工作年限：5年',
  '教育背景',
  '2014.09 - 2018.06  南京大学  计算机科学与技术  本科',
  '工作经历',
  '2018.07 - 2021.06  星澜科技（无锡）有限公司  前端开发工程师',
  '负责公司官网与后台管理系统开发，使用 React。',
  '2021.07 - 至今  云帆信息技术有限公司  高级前端工程师',
  '主导营销中台前端架构，带 3 人小组。',
  '专业技能',
  'JavaScript / TypeScript / React / Vue',
  '语言能力',
  '英语（CET-6）· 日常交流',
]);

// 简历二：更换后的另一份简历（.docx）
const DOCX_TWO = makeDocx([
  '李四',
  '13900139000 | lisi@test.com',
  '教育背景',
  '2016.09 - 2020.06  复旦大学  软件工程  本科',
  '工作经历',
  '2020.07 - 至今  恒泰数据科技有限公司  后端工程师',
  '负责服务端接口与数据库设计。',
]);

// 简历三：三段实习 + 复杂技能文本（验证独立记录与技能垃圾过滤）
const DOCX_THREE = makeDocx([
  '赵六',
  '实习经历',
  '2019.06 - 2019.09  北京某某网络科技有限公司  运营实习生',
  '负责公众号内容编辑与活动数据整理。',
  '2020.03 - 2020.08  上海某电商有限公司  新媒体运营实习生',
  '负责短视频脚本撰写与发布，参与粉丝增长活动。',
  '2021.01 - 2021.06  深圳某科技股份有限公司  产品助理实习生',
  '协助产品经理整理需求文档，跟进迭代进度。',
  '专业技能',
  'Python(Pytest、Selenium) Java单元测试 掌握PO模式及CICD流水线搭建',
  '2.AI，熟练掌握……',
]);

// 简历四：工作区有内容但无法解析（扫描图片场景），应产生解析不完整提示
const DOCX_FOUR = makeDocx(['王七', '工作经历', '（此处是表格图片，无文本内容）']);

// 最小 PDF（ASCII 文本，验证 pdf-parse 提取链路）
const MINI_PDF = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 66 >>
stream
BT /F1 18 Tf 72 720 Td (Hello JobPilot Resume Test) Tj ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000260 00000 n 
0000000358 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
406
%%EOF
`;

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

    // ---- 1. migration：candidate_profiles 表存在 + 幂等 ----
    const hasTable = () =>
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='candidate_profiles'").get() !== undefined;
    check('candidate_profiles 表存在', hasTable());
    runMigrations(db);
    runMigrations(db);
    check('migration 幂等（重复执行不报错）', hasTable());

    // 1b. 旧库（无 parse_warnings 列）迁移 → ALTER 补列
    const Database = require('better-sqlite3');
    const legacyPath = path.join(TEST_DIR, 'legacy.db');
    const legacyDb = new Database(legacyPath);
    legacyDb.exec(`
      CREATE TABLE resumes (id INTEGER PRIMARY KEY AUTOINCREMENT, original_name TEXT NOT NULL, stored_name TEXT NOT NULL, file_path TEXT NOT NULL, file_size INTEGER NOT NULL DEFAULT 0, mime_type TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
      CREATE TABLE candidate_profiles (id INTEGER PRIMARY KEY AUTOINCREMENT, resume_id INTEGER NOT NULL UNIQUE REFERENCES resumes(id) ON DELETE CASCADE, profile_json TEXT NOT NULL, source_text TEXT NOT NULL DEFAULT '', parse_version INTEGER NOT NULL DEFAULT 1, confirmed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
    `);
    runMigrations(legacyDb);
    const legacyCols = legacyDb.prepare('PRAGMA table_info(candidate_profiles)').all().map((c) => c.name);
    check('旧库 migration 补 parse_warnings 列', legacyCols.includes('parse_warnings'));
    legacyDb.close();

    // ---- 2. 版面提取：DOCX / PDF ----
    const { extractLayoutLines } = require('../dist-electron/electron/main/services/candidateService.js');
    const docxPath = path.join(dbMod.getResumesDir(), 'fixture.docx');
    fs.writeFileSync(docxPath, DOCX_ONE);
    const docxLines = await extractLayoutLines(docxPath);
    const docxText = docxLines.map((l) => l.text).join('\n');
    check('DOCX 版面提取包含姓名/教育', docxText.includes('张三') && docxText.includes('南京大学'));

    const pdfPath = path.join(dbMod.getResumesDir(), 'fixture.pdf');
    fs.writeFileSync(pdfPath, MINI_PDF);
    const pdfLines = await extractLayoutLines(pdfPath);
    const pdfText = pdfLines.map((l) => l.text).join('\n');
    check('PDF 版面提取', pdfText.includes('Hello JobPilot Resume Test'), JSON.stringify(pdfText.slice(0, 60)));

    // ---- 3. 导入简历 + 解析 ----
    const resumeRepo = require('../dist-electron/database/repositories/resumeRepository.js');
    const candidateService = require('../dist-electron/electron/main/services/candidateService.js');
    const resume = resumeRepo.insertResume({
      originalName: '张三-简历.docx',
      storedName: '1_zhangsan.docx',
      filePath: docxPath,
      fileSize: DOCX_ONE.length,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const snap1 = await candidateService.parseCurrentResume();
    check('解析后资料存在且关联当前简历', snap1.profile !== null && snap1.profileResumeId === resume.id);
    check('解析后 confirmed = false', snap1.confirmed === false);
    check('姓名/电话/邮箱', snap1.profile.name === '张三' && snap1.profile.phone === '13800138000' && snap1.profile.email === 'zhangsan@example.com');
    check('工作年限', snap1.profile.workYears === '5年');
    check('教育 1 条', snap1.profile.education.length === 1 && snap1.profile.education[0].school === '南京大学');
    check('工作 2 条', snap1.profile.workExperience.length === 2);
    check('技能 4 个', snap1.profile.skills.length === 4 && snap1.profile.skills.includes('TypeScript'));
    check('语言含英语', snap1.profile.languages.some((l) => l.includes('英语')));
    check('完整简历无解析提示', snap1.warnings.length === 0, JSON.stringify(snap1.warnings));

    // ---- 4. 用户修改 → 保存 → confirmed ----
    const edited = JSON.parse(JSON.stringify(snap1.profile));
    edited.name = '张三（已修正）';
    edited.skills.push('Docker');
    const snap2 = candidateService.saveCandidateProfile(edited);
    check('保存后 confirmed = true', snap2.confirmed === true);
    check('保存后姓名已修改', snap2.profile.name === '张三（已修正）');
    check('保存后技能补充', snap2.profile.skills.includes('Docker'));

    // ---- 5. 模拟重启：重新打开数据库，资料与人工修改仍在 ----
    dbMod.closeDatabase();
    dbMod.initDatabase();
    const db2 = dbMod.getDb();
    const snap3 = candidateService.getCandidateSnapshot();
    check('重启后资料仍在', snap3.profile !== null && snap3.profileResumeId === resume.id);
    check('重启后人工修改仍在', snap3.profile.name === '张三（已修正）' && snap3.profile.skills.includes('Docker'));
    check('重启后 confirmed 保持', snap3.confirmed === true);

    // ---- 6. 更换简历：先导入新简历（未解析）→ 资料过期；再解析 → 资料切换 ----
    const resume2 = resumeRepo.insertResume({
      originalName: '李四-简历.docx',
      storedName: '2_lisi.docx',
      filePath: docxPath,
      fileSize: DOCX_TWO.length,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    fs.writeFileSync(docxPath, DOCX_TWO); // 换内容后同一路径重新解析
    const snap4 = candidateService.getCandidateSnapshot();
    check('更换简历后资料过期（profileResumeId ≠ resume.id）', snap4.profile !== null && snap4.profileResumeId !== resume2.id);
    check('过期状态仍展示旧资料（未丢失）', snap4.profile !== null && snap4.profile.name === '张三（已修正）');
    const snap5 = await candidateService.parseCurrentResume();
    check('重新解析后资料属于新简历', snap5.profileResumeId === resume2.id && snap5.profile.name === '李四');
    check('重新解析后 confirmed 重置', snap5.confirmed === false);
    const oldRow = require('../dist-electron/database/repositories/candidateRepository.js').getProfileByResumeId(resume.id);
    check('旧简历资料记录保留（未静默删除）', oldRow !== null && oldRow.profile.name === '张三（已修正）');

    // ---- 7. 三段实习：分别解析为独立记录 + 技能垃圾过滤 ----
    const docxThreePath = path.join(dbMod.getResumesDir(), 'three.docx');
    fs.writeFileSync(docxThreePath, DOCX_THREE);
    resumeRepo.insertResume({
      originalName: '赵六-实习简历.docx',
      storedName: '3_zhaoliu.docx',
      filePath: docxThreePath,
      fileSize: DOCX_THREE.length,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const snap7 = await candidateService.parseCurrentResume();
    check('三段实习 = 3 条独立经历', snap7.profile !== null && snap7.profile.workExperience.length === 3, JSON.stringify(snap7.profile ? snap7.profile.workExperience.map((w) => w.company) : null));
    const interns = snap7.profile.workExperience;
    check('实习1 公司/职位/时间', interns[0].company === '北京某某网络科技有限公司' && interns[0].title === '运营实习生' && interns[0].startDate === '2019.06', JSON.stringify(interns[0]));
    check('实习1 内容不串', interns[0].description.includes('公众号') && !interns[0].description.includes('短视频'), JSON.stringify(interns[0].description));
    check('实习2/3 公司对应', interns[1].company.includes('电商') && interns[2].company.includes('科技股份'), JSON.stringify(interns.map((w) => w.company)));
    const skills = snap7.profile.skills;
    check('技能含 Python/Pytest/Selenium/CI/CD', ['Python', 'Pytest', 'Selenium', 'CI/CD', 'AI', 'Java单元测试', 'PO模式'].every((x) => skills.includes(x)), JSON.stringify(skills));
    const junkHits = ['1', '2.', '掌握', '熟悉', '熟练', '了解', '及', '模式及', '流水线搭建'].filter((j) => skills.includes(j));
    check('技能无垃圾词（序号/动词/连接碎片）', junkHits.length === 0, `junkHits=${JSON.stringify(junkHits)}`);
    check('三段实习无解析提示', snap7.warnings.length === 0, JSON.stringify(snap7.warnings));

    // ---- 8. 解析不完整提示：工作区无法解析 → warnings；用户确认后清空 ----
    const docxFourPath = path.join(dbMod.getResumesDir(), 'four.docx');
    fs.writeFileSync(docxFourPath, DOCX_FOUR);
    resumeRepo.insertResume({
      originalName: '王七-扫描简历.docx',
      storedName: '4_wangqi.docx',
      filePath: docxFourPath,
      fileSize: DOCX_FOUR.length,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const snap8 = await candidateService.parseCurrentResume();
    check('无法解析的工作区产生提示', snap8.warnings.some((x) => x.includes('工作')), JSON.stringify(snap8.warnings));
    check('确认后 warnings 清空', candidateService.saveCandidateProfile(snap8.profile).warnings.length === 0);

    // ---- 9. 移除简历 → 级联删除资料 ----
    const { removeResume } = require('../dist-electron/electron/main/services/resumeService.js');
    removeResume();
    const snap9 = candidateService.getCandidateSnapshot();
    check('移除简历后资料为空', snap9.resume === null && snap9.profile === null);
    const countAfterRemove = db2.prepare('SELECT COUNT(*) AS c FROM candidate_profiles').get().c;
    check('移除简历级联删除资料', countAfterRemove === 0);

    // ---- 10. TEST/PROD 隔离 + PROD migration ----
    fs.mkdirSync(PROD_DIR, { recursive: true });
    const prodDb = new Database(path.join(PROD_DIR, 'jobpilot.db'));
    prodDb.pragma('journal_mode = WAL');
    runMigrations(prodDb);
    const prodCount = prodDb.prepare('SELECT COUNT(*) AS c FROM candidate_profiles').get().c;
    check('PROD 库资料为空（不共享 TEST 数据）', prodCount === 0);
    prodDb.close();

    dbMod.closeDatabase();
  } catch (err) {
    console.error('CANDIDATE PROFILE TEST ERROR:', err);
    failures += 1;
  }

  console.log(failures === 0 ? 'CANDIDATE PROFILE TEST: ALL PASS' : `CANDIDATE PROFILE TEST: ${failures} FAIL`);

  try {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    fs.rmSync(PROD_DIR, { recursive: true, force: true });
  } catch {
    // 忽略
  }

  app.exit(failures === 0 ? 0 : 1);
});
