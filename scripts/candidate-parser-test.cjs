/**
 * V0.4-A Candidate Profile 解析器测试（纯 Node，不触碰 Electron/Chrome）。
 * 验证 parseCandidateProfile：
 * - 从中文简历文本提取 姓名/电话/邮箱/工作年限/教育/工作/项目/技能/证书/语言/自我评价
 * - 多段教育 / 多份工作分别解析为独立记录，不合并
 * - 多行版式（学校/时间/专业分行、公司/职位/时间分行）正确合并为一条
 * - 技能过滤垃圾词（序号、连接词、描述动词、被拆开的 CI/CD）
 * - 只提取原文信息，不编造（无对应内容的字段保持为空）
 */
const { parseCandidateProfile, computeParseWarnings } = require('../dist-electron/core/candidate/parser.js');

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} - ${name}${extra ? ' ' + extra : ''}`);
  if (!cond) failures += 1;
};

// ---- 1. 完整中文简历 ----
const FULL_RESUME = `个人简历

张三
13800138000 | zhangsan@example.com

求职意向：前端开发工程师
工作年限：5年

教育背景
2014.09 - 2018.06  南京大学  计算机科学与技术  本科

工作经历
2018.07 - 2021.06  星澜科技（无锡）有限公司  前端开发工程师
负责公司官网与后台管理系统开发，使用 React。
2021.07 - 至今  云帆信息技术有限公司  高级前端工程师
主导营销中台前端架构，带 3 人小组。

项目经历
2022.03 - 2022.12  智能营销中台  项目负责人
负责整体架构设计与核心模块开发。

专业技能
JavaScript / TypeScript / React / Vue / Node.js

证书
CET-6 / PMP 项目管理证书

语言能力
英语（CET-6）· 日常交流

自我评价
5 年前端开发经验，注重工程质量与用户体验。
`;

{
  const p = parseCandidateProfile(FULL_RESUME);
  check('姓名提取', p.name === '张三', JSON.stringify(p.name));
  check('手机号提取', p.phone === '13800138000', JSON.stringify(p.phone));
  check('邮箱提取', p.email === 'zhangsan@example.com', JSON.stringify(p.email));
  check('工作年限提取', p.workYears === '5年', JSON.stringify(p.workYears));

  check('教育背景数量 = 1', p.education.length === 1, JSON.stringify(p.education));
  const edu = p.education[0];
  check('教育-学校', edu.school === '南京大学', JSON.stringify(edu.school));
  check('教育-专业', edu.major === '计算机科学与技术', JSON.stringify(edu.major));
  check('教育-学历', edu.degree === '本科', JSON.stringify(edu.degree));
  check('教育-起止时间', edu.startDate === '2014.09' && edu.endDate === '2018.06', JSON.stringify([edu.startDate, edu.endDate]));

  check('工作经历数量 = 2', p.workExperience.length === 2, JSON.stringify(p.workExperience));
  const w1 = p.workExperience[0];
  check('工作1-公司', w1.company === '星澜科技（无锡）有限公司', JSON.stringify(w1.company));
  check('工作1-职位', w1.title === '前端开发工程师', JSON.stringify(w1.title));
  check('工作1-时间', w1.startDate === '2018.07' && w1.endDate === '2021.06', JSON.stringify([w1.startDate, w1.endDate]));
  check('工作1-内容（不含下一份）', w1.description.includes('React') && !w1.description.includes('营销中台'), JSON.stringify(w1.description));
  const w2 = p.workExperience[1];
  check('工作2-至今', w2.endDate === '至今' && w2.company.includes('云帆'), JSON.stringify([w2.company, w2.endDate]));

  check('项目数量 >= 1', p.projectExperience.length >= 1, JSON.stringify(p.projectExperience));
  const pr = p.projectExperience[0];
  check('项目-名称', pr.name === '智能营销中台', JSON.stringify(pr.name));
  check('项目-角色', pr.role === '项目负责人', JSON.stringify(pr.role));

  check('技能含 TypeScript/React/Node.js', ['TypeScript', 'React', 'Node.js'].every((s) => p.skills.includes(s)), JSON.stringify(p.skills));
  check('证书含 CET-6', p.certificates.includes('CET-6'), JSON.stringify(p.certificates));
  check('语言含 英语', p.languages.some((l) => l.includes('英语')), JSON.stringify(p.languages));
  check('自我评价提取', p.summary.includes('前端开发经验'), JSON.stringify(p.summary));
}

// ---- 2. 最小简历：只有姓名和联系方式 ----
{
  const p = parseCandidateProfile('李四\n13812345678\nlisi@test.com');
  check('最小简历-姓名', p.name === '李四', JSON.stringify(p.name));
  check('最小简历-教育/工作/项目/技能/证书/语言为空', p.education.length === 0 && p.workExperience.length === 0 && p.projectExperience.length === 0 && p.skills.length === 0 && p.certificates.length === 0 && p.languages.length === 0);
}

// ---- 3. 空输入 / 无意义输入：不编造 ----
{
  const p = parseCandidateProfile('');
  check('空文本 → 全空', p.name === '' && p.phone === '' && p.email === '' && p.education.length === 0);
  const p2 = parseCandidateProfile('这是一段没有任何简历结构信息的普通文本，可能是一篇文章。\n第二行也是普通内容。');
  check('无结构文本不编造', p2.name === '' && p2.workExperience.length === 0 && p2.skills.length === 0);
}

// ---- 4. 简历标题为「个人简历」时姓名仍从下一行提取 ----
{
  const p = parseCandidateProfile('个人简历\n王五\n13811112222');
  check('标题后姓名提取', p.name === '王五', JSON.stringify(p.name));
}

// ---- 5. 三段实习 / 工作：必须各自独立，不合并 ----
{
  const text = `实习经历
2019.06 - 2019.09  北京某某网络科技有限公司  运营实习生
负责公众号内容编辑与活动数据整理。
2020.03 - 2020.08  上海某电商有限公司  新媒体运营实习生
负责短视频脚本撰写与发布，参与粉丝增长活动。
2021.01 - 2021.06  深圳某科技股份有限公司  产品助理实习生
协助产品经理整理需求文档，跟进迭代进度。`;
  const p = parseCandidateProfile(text);
  check('三段实习 = 3 条独立经历', p.workExperience.length === 3, JSON.stringify(p.workExperience.map((w) => w.company)));
  const [e1, e2, e3] = p.workExperience;
  check('实习1-公司', e1.company === '北京某某网络科技有限公司', JSON.stringify(e1.company));
  check('实习1-职位', e1.title === '运营实习生', JSON.stringify(e1.title));
  check('实习1-时间', e1.startDate === '2019.06' && e1.endDate === '2019.09', JSON.stringify([e1.startDate, e1.endDate]));
  check('实习1-内容不串到实习2', e1.description.includes('公众号') && !e1.description.includes('短视频'), JSON.stringify(e1.description));
  check('实习2-公司/职位', e2.company.includes('电商') && e2.title.includes('新媒体运营'), JSON.stringify([e2.company, e2.title]));
  check('实习3-公司/职位', e3.company.includes('科技股份') && e3.title.includes('产品助理'), JSON.stringify([e3.company, e3.title]));
  check('实习3-内容正确', e3.description.includes('需求文档'), JSON.stringify(e3.description));
}

// ---- 5b. 无空行分隔的多份工作（每行带日期）----
{
  const text = `工作经历
2018.07 - 2020.06 甲公司 前端工程师
负责页面开发。
2020.07 - 至今 乙公司 高级工程师
负责架构设计。`;
  const p = parseCandidateProfile(text);
  check('无空行多份工作 = 2', p.workExperience.length === 2, JSON.stringify(p.workExperience.map((w) => w.company)));
  check('无空行-工作1描述不串', p.workExperience[0].description.includes('页面开发') && !p.workExperience[0].description.includes('架构设计'));
}

// ---- 5c. 公司 / 职位 / 时间各占一行的版式（PDF 常见）----
{
  const text = `工作经历
阿里巴巴集团
前端工程师
2016.07 - 2019.06
负责中后台系统开发。
腾讯科技
高级前端工程师
2019.07 - 至今
负责前端基础架构。`;
  const p = parseCandidateProfile(text);
  check('分行版式 = 2 条', p.workExperience.length === 2, JSON.stringify(p.workExperience));
  const [a, b] = p.workExperience;
  check('分行版式-公司1', a.company === '阿里巴巴集团', JSON.stringify(a.company));
  check('分行版式-职位1', a.title === '前端工程师', JSON.stringify(a.title));
  check('分行版式-时间1', a.startDate === '2016.07' && a.endDate === '2019.06', JSON.stringify([a.startDate, a.endDate]));
  check('分行版式-公司2', b.company === '腾讯科技', JSON.stringify(b.company));
  check('分行版式-内容不串', a.description.includes('中后台') && !a.description.includes('基础架构'), JSON.stringify(a.description));
}

// ---- 6. 多段教育（本科 + 硕士）分别解析 ----
{
  const text = `教育背景
2012.09 - 2016.06  武汉大学  软件工程  本科
2016.09 - 2019.06  华中科技大学  计算机技术  硕士`;
  const p = parseCandidateProfile(text);
  check('两段教育 = 2 条', p.education.length === 2, JSON.stringify(p.education));
  check('教育1-学校/学历', p.education[0].school === '武汉大学' && p.education[0].degree === '本科', JSON.stringify(p.education[0]));
  check('教育2-学校/学历/时间', p.education[1].school === '华中科技大学' && p.education[1].degree === '硕士' && p.education[1].startDate === '2016.09', JSON.stringify(p.education[1]));
}

// ---- 6b. 教育多行版式（学校 / 时间 / 专业 / 学历分行）合并为一条 ----
{
  const text = `教育背景
清华大学
2012.09 - 2016.06
计算机系 硕士`;
  const p = parseCandidateProfile(text);
  check('教育分行合并为 1 条', p.education.length === 1, JSON.stringify(p.education));
  const e = p.education[0];
  check('教育分行-学校', e.school === '清华大学', JSON.stringify(e.school));
  check('教育分行-时间', e.startDate === '2012.09' && e.endDate === '2016.06', JSON.stringify([e.startDate, e.endDate]));
  check('教育分行-学历', e.degree === '硕士', JSON.stringify(e.degree));
  check('教育分行-专业', e.major === '计算机系', JSON.stringify(e.major));
}

// ---- 6c. 高中 / 中学教育 ----
{
  const text = `教育背景
2009.09 - 2012.06  无锡市第一中学  高中`;
  const p = parseCandidateProfile(text);
  check('中学教育识别', p.education.length === 1 && p.education[0].school === '无锡市第一中学' && p.education[0].degree === '高中', JSON.stringify(p.education));
}

// ---- 7. 技能解析：过滤垃圾词 ----
{
  const text = `专业技能
Python(Pytest、Selenium) Java单元测试 掌握PO模式及CICD流水线搭建
2.AI，熟练掌握……
熟悉 MySQL 与 Redis，了解 Docker 部署`;
  const p = parseCandidateProfile(text);
  const s = p.skills;
  check('技能含 Python', s.includes('Python'), JSON.stringify(s));
  check('技能含 Pytest', s.includes('Pytest'), JSON.stringify(s));
  check('技能含 Selenium', s.includes('Selenium'), JSON.stringify(s));
  check('技能含 Java单元测试', s.includes('Java单元测试'), JSON.stringify(s));
  check('技能含 PO模式', s.includes('PO模式'), JSON.stringify(s));
  check('技能含 CI/CD（不被拆开）', s.includes('CI/CD'), JSON.stringify(s));
  check('技能含 AI', s.includes('AI'), JSON.stringify(s));
  check('技能含 MySQL/Redis/Docker', ['MySQL', 'Redis', 'Docker'].every((x) => s.includes(x)), JSON.stringify(s));
  // 垃圾词必须被过滤
  const junk = ['1', '2', '2.', '掌握', '熟悉', '熟练', '了解', '熟练掌握', '及', '模式及', '流水线搭建', '……'];
  const junkHit = junk.filter((j) => s.includes(j));
  check('无序号/动词/连接碎片垃圾技能', junkHit.length === 0, `junkHit=${JSON.stringify(junkHit)}`);
  check('CI/CD 未被拆成 CI 和 CD', !s.includes('CI') && !s.includes('CD'), JSON.stringify(s));
}

// ---- 8. 解析完整性提示（warnings）----
{
  /** 把纯文本转成版面行（供 computeParseWarnings 使用）。 */
  const toLines = (text) =>
    text.split('\n').map((t, i) => ({ text: t, page: 1, y: 100000 - i, bold: false }));

  // 有教育/工作标题但内容无法解析 → 提示
  const p1 = parseCandidateProfile('教育背景\n（此处是扫描图片，无文本）');
  const w1 = computeParseWarnings(toLines('教育背景\n（此处是扫描图片，无文本）'), p1);
  check('教育区无结果 → warning 教育经历', w1.includes('教育经历'), JSON.stringify(w1));

  // 工作区有内容但无法构成任何条目（如扫描图片无文本）→ 提示
  const text2 = '实习经历\n（此处是表格图片，无文本内容）';
  const p2 = parseCandidateProfile(text2);
  const w2 = computeParseWarnings(toLines(text2), p2);
  check('工作区无结果 → warning 工作/实习经历', p2.workExperience.length === 0 && w2.some((x) => x.includes('工作')), `${p2.workExperience.length} ${JSON.stringify(w2)}`);

  // 完整简历 → 无 warning
  const w3 = computeParseWarnings(toLines(FULL_RESUME), parseCandidateProfile(FULL_RESUME));
  check('完整简历无 warning', w3.length === 0, JSON.stringify(w3));
}

// ---- 9. 多样式回归：不同版式 / 不同栏目名 / 不同技能写法 ----
{
  // 9a. 双栏式阅读顺序（教育左栏 → 技能 → 实习 → 项目），Section 顺序不同但不失效
  {
    const text = `刘一
电话 13700000001 | liuyi@test.com

教育背景
北京大学  本科  计算机科学  2015-2019

专业技能
Java  MySQL  Linux

实习经历
2019.06-2019.12  杭州某某网络有限公司  前端开发实习生
负责页面开发。

项目经历
校园二手交易平台
负责后端接口开发。`;
    const p = parseCandidateProfile(text);
    check('双栏式-姓名', p.name === '刘一', JSON.stringify(p.name));
    check('双栏式-教育 1 条', p.education.length === 1 && p.education[0].school === '北京大学', JSON.stringify(p.education));
    check('双栏式-实习 1 条', p.workExperience.length === 1 && p.workExperience[0].company.includes('杭州'), JSON.stringify(p.workExperience));
    check('双栏式-技能', ['Java', 'MySQL', 'Linux'].every((s) => p.skills.includes(s)), JSON.stringify(p.skills));
    check('双栏式-项目 1 条', p.projectExperience.length === 1 && p.projectExperience[0].name.includes('校园二手'), JSON.stringify(p.projectExperience));
  }

  // 9b. 时间在右（制表符版式）：公司\t时间
  {
    const text = `实习经历
南京维沃软件技术有限公司\t2026.02-2026.06
岗位职责：测试开发实习生
负责自动化测试。
无锡沐创集成电路设计有限公司\t2025.11-2026.02
岗位职责：网络测试实习生
负责协议测试。`;
    const p = parseCandidateProfile(text);
    check('时间在右 = 2 条', p.workExperience.length === 2, JSON.stringify(p.workExperience.map((w) => w.company)));
    check('时间在右-公司1/时间', p.workExperience[0].company === '南京维沃软件技术有限公司' && p.workExperience[0].startDate === '2026.02' && p.workExperience[0].endDate === '2026.06', JSON.stringify(p.workExperience[0]));
    check('时间在右-岗位从职责行提取', p.workExperience[0].title === '测试开发实习生', JSON.stringify(p.workExperience[0].title));
    check('时间在右-公司2/岗位', p.workExperience[1].company === '无锡沐创集成电路设计有限公司' && p.workExperience[1].title === '网络测试实习生', JSON.stringify(p.workExperience[1]));
    check('时间在右-内容不串', p.workExperience[0].description.includes('自动化') && !p.workExperience[0].description.includes('协议测试'), JSON.stringify(p.workExperience[0].description));
  }

  // 9c. 时间在左（制表符版式）：时间\t公司，职位下一行
  {
    const text = `工作经历
2018.07-2020.06\t深圳市某某科技有限公司
前端工程师
负责官网开发。
2020.07-至今\t北京某某信息技术有限公司
高级工程师
负责平台架构。`;
    const p = parseCandidateProfile(text);
    check('时间在左 = 2 条', p.workExperience.length === 2, JSON.stringify(p.workExperience));
    check('时间在左-公司1', p.workExperience[0].company === '深圳市某某科技有限公司' && p.workExperience[0].startDate === '2018.07', JSON.stringify(p.workExperience[0]));
    check('时间在左-职位1（下一行）', p.workExperience[0].title === '前端工程师', JSON.stringify(p.workExperience[0].title));
    check('时间在左-公司2', p.workExperience[1].company === '北京某某信息技术有限公司' && p.workExperience[1].endDate === '至今', JSON.stringify(p.workExperience[1]));
  }

  // 9d. 技能列表形式
  {
    const text = `技能清单
- Python
- Java
- MySQL
- Linux`;
    const p = parseCandidateProfile(text);
    check('技能列表', ['Python', 'Java', 'MySQL', 'Linux'].every((s) => p.skills.includes(s)), JSON.stringify(p.skills));
  }

  // 9e. 不同栏目名：学历信息 / 职业经历 / 技术能力
  {
    const text = `学历信息
2016-2020  复旦大学  金融学  本科

职业经历
2020-2022  某投资咨询有限公司  分析师
负责行业研究。

技术能力
Python 数据分析  SQL`;
    const p = parseCandidateProfile(text);
    check('学历信息-教育 1 条', p.education.length === 1 && p.education[0].school === '复旦大学' && p.education[0].degree === '本科' && p.education[0].major === '金融学', JSON.stringify(p.education));
    check('职业经历-工作 1 条', p.workExperience.length === 1 && p.workExperience[0].company.includes('投资') && p.workExperience[0].title === '分析师', JSON.stringify(p.workExperience));
    check('技术能力-技能', ['Python', 'SQL'].every((s) => p.skills.includes(s)), JSON.stringify(p.skills));
  }

  // 9f. 字段对应原文（不编造）：所有非空字段都必须是简历原文子串
  {
    const text = `教育背景
2012.09 - 2016.06  武汉大学  软件工程  本科
实习经历
2019.06 - 2019.09  北京某某网络科技有限公司  运营实习生
负责公众号内容编辑。
专业技能
Python / Pytest / Selenium`;
    const p = parseCandidateProfile(text);
    const substrings = [
      ...p.education.flatMap((e) => [e.school, e.major, e.degree, e.startDate, e.endDate]),
      ...p.workExperience.flatMap((w) => [w.company, w.title, w.startDate, w.endDate]),
      ...p.skills,
    ].filter((s) => s && s !== '至今');
    const allFromOriginal = substrings.every((s) => text.includes(s));
    check('结构化字段全部来自原文（不编造）', allFromOriginal, JSON.stringify(substrings.filter((s) => !text.includes(s))));
  }
}

console.log(failures === 0 ? 'CANDIDATE PARSER TEST: ALL PASS' : `CANDIDATE PARSER TEST: ${failures} FAIL`);
process.exit(failures === 0 ? 0 : 1);
