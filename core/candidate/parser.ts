import {
  createEmptyCandidateProfile,
  type CandidateProfile,
  type EducationItem,
  type ProjectItem,
  type WorkItem,
} from './index';
import type { LayoutLine } from './layout';

/**
 * V0.4-A 简历 → CandidateProfile 的本地规则解析器（版面结构优先）。
 *
 * 解析流程（与纯文本切词相反）：
 *   文本块（含位置/行关系） → 视觉顺序重建行 → Section 识别 → Section 内部结构 → 结构化实体
 *
 * 设计约束：
 * - 确定性：同一份简历永远得到同一份结果（不调用 AI / 网络）。
 * - 只提取、不编造：每个字段都是简历原文的子串；简历未提及的内容保持为空。
 * - 准确 > 填满：无法可靠识别的字段留空，交给用户补充。
 * - 同一行内的大间隔（\t）优先用于字段识别（如「江苏理工学院\t本科\t物联网工程\t2022-2026」、
 *   「南京维沃软件技术有限公司\t2026.02-2026.06」），而不是在全文里猜测。
 * - 多段经历分别解析为独立记录，绝不合并；多行条目标题（公司/职位/时间分行）会合并。
 * - 技能是「技术实体 / 能力短语」抽取，不是按标点、空格切词。
 */

/** 小节标题（语义同义词集合，去掉冒号与首尾空白后匹配）。 */
const SECTIONS: { key: string; headers: string[] }[] = [
  {
    key: 'education',
    headers: [
      '教育背景', '教育经历', '教育情况', '教育', '教育培训', '学历', '学历信息',
      '教育/培训经历', 'Education', 'EDUCATION',
    ],
  },
  {
    key: 'workExperience',
    headers: [
      '工作经历', '工作经验', '工作履历', '职业经历', '实习经历', '实习经验', '实习',
      '工作与实习经历', '社会实践', 'Work Experience', 'WORK EXPERIENCE',
    ],
  },
  {
    key: 'projectExperience',
    headers: ['项目经历', '项目经验', '项目实践', '项目', 'Project Experience', 'PROJECT EXPERIENCE'],
  },
  {
    key: 'skills',
    headers: [
      '专业技能', '技能特长', '掌握技能', '技能清单', '技能列表', '技能', '技术能力',
      'Skills', 'SKILLS',
    ],
  },
  {
    key: 'certificates',
    headers: ['资格证书', '资质证书', '证书情况', '职业资格', '证书', 'Certificates', 'CERTIFICATES'],
  },
  {
    key: 'languages',
    headers: ['语言能力', '外语能力', '语言', 'Languages', 'LANGUAGES'],
  },
  {
    key: 'summary',
    headers: ['自我评价', '个人总结', '个人简介', '个人优势', '自我介绍', '个人概述', 'Summary', 'SUMMARY'],
  },
];

const NAME_STOPWORDS =
  /个人简历|简历|求职意向|教育背景|工作经历|工作年限|联系方式|联系电话|姓名|RESUME|CURRICULUM/i;

/** 学校 / 教育机构关键词。 */
const SCHOOL_KEYWORD =
  /(大学|学院|学校|中学|小学|研究院|研究生院|University|College|Institute|School|Academy)/i;

const SCHOOL_RE = /([\u4e00-\u9fa5A-Za-z0-9（）()·]{2,30}?(?:大学|学院|学校|中学|小学|研究院|研究生院|University|College|Institute|School|Academy))[\u4e00-\u9fa5A-Za-z0-9（）()]{0,8}/i;

const DEGREE_RE = /博士|硕士|研究生|本科|学士|大专|专科|高中|MBA|EMBA/;

const PHONE_RE = /1[3-9]\d{9}/;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/** 公司 / 机构特征词（宽泛，用于公司名候选识别）。 */
const COMPANY_KEYWORD =
  /(公司|集团|有限|股份|科技|工作室|银行|证券|保险|研究院|事务所|医院|学校|大学|学院|中心|平台|网络|传媒|文化|教育|信息|数据|软件|硬件|电商|贸易|咨询|地产|建筑|制造|能源|汽车|医药|食品|餐饮|物流|供应链|广告|影视|游戏|通信|智能|生物|医疗|新能源|互联网|电子商务|品牌|门店|工厂|车间|基地|事业部)/;

/** 强公司信号：行命中才视为「公司条目行」（避免把「网络测试实习生」等职位行误判为公司）。 */
const COMPANY_STRONG =
  /(公司|集团|有限|股份|科技|工作室|银行|证券|保险|研究院|事务所|医院|学校|大学|学院|工厂|车间|基地|事业部)/;

/** 职位特征词。 */
const TITLE_KEYWORD =
  /(工程师|专员|经理|主管|总监|顾问|助理|实习生|分析师|架构师|负责人|设计师|开发|测试|运营|产品|市场|销售|编辑|记者|教师|医生|护士|会计|出纳|程序员|新媒体|主播|客服|文员|秘书|讲师|教练|商务|采购|物流|仓储|质检|策划|文案|编导|摄影|剪辑|店长|主任|组长|部长|翻译|律师|法务|审计|风控|研究员)/;

/** 描述性段落 / 行开头动词：命中则不视为新条目。 */
const DESC_VERB_START =
  /^(负责|参与|主导|主要|完成|协助|开发|设计|独立|跟进|维护|撰写|推动|管理|搭建|优化|实现|支持|协调|组织|承担|输出|制定|负责过|参与过|从事过|做过|曾于|曾在|期间|利用|使用|运用|熟练|熟悉|掌握)/;

const TITLE_LABEL_RE = /(?:岗位职责|职位|岗位|职务|担任|任职|角色)[:：]?\s*([^\s，。;；,\t]{2,16})/;

const MAJOR_LABEL_RE = /(?:专业|主修|所学专业)[:：]?\s*([\u4e00-\u9fa5A-Za-z0-9（）()]{2,20})/;

const PROJECT_LABEL_RE = /(?:项目名称|项目名)[:：]?\s*([^\s，。;；,\t]{2,24})/;

/** 单个日期片段："2014.09" / "2014/9" / "2014年9月" / "2014-09" / "2014"。 */
const DATE_PART = '(?:19|20)\\d{2}(?:[.\\-\\/年]\\s*\\d{1,2}(?:月)?)?';
const DATE_RANGE_RE = new RegExp(
  `(${DATE_PART})\\s*[-—–~至到]\\s*(${DATE_PART}|至今|现在|Present)`,
);
const DATE_START_RE = new RegExp(`^${DATE_PART}`);

/** 完整机构名（贪婪匹配，如「星澜科技（无锡）有限公司」）。 */
const COMPANY_RE = /([\u4e00-\u9fa5A-Za-z0-9·（）()]{1,30}(?:公司|集团|科技|有限|股份|工作室|银行|证券|保险|研究院|事务所|医院|学校|大学|学院|中心|平台|工作室|集团))/;

/* ------------------------------------------------------------------ */
/* 文本 / 版面行规范化                                                 */
/* ------------------------------------------------------------------ */

function normalizeText(text: string): string[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\u000c')
    .join('\n') // 换页符
    // 注意：\t 是版面字段边界（「公司\t时间」），必须保留，不能并入普通空白
    .replace(/[ \u3000]+/g, ' ')
    .split('\n')
    .map((l) => l.replace(/^\s+|\s+$/g, ''))
    .filter((l) => l.length > 0);
}

/** 版面行规范化：保留 \t 字段边界，过滤页码页脚与空行。 */
function normalizeLayoutLines(rawLines: LayoutLine[]): LayoutLine[] {
  const out: LayoutLine[] = [];
  for (const line of rawLines) {
    const text = line.text.replace(/^\s+|\s+$/g, '');
    if (!text) continue;
    if (/^--\s*\d+\s+of\s+\d+\s*--$/.test(text)) continue; // PDF 页码页脚
    if (/^第\s*\d+\s*页$/.test(text)) continue;
    if (/^Page\s*\d+$/i.test(text)) continue;
    out.push({ ...line, text });
  }
  return out;
}

/** 行是否为某小节标题（允许标题后跟冒号）。 */
function isSectionHeader(line: string): { key: string } | null {
  const trimmed = line.replace(/[:：]$/, '').trim();
  for (const section of SECTIONS) {
    for (const header of section.headers) {
      if (trimmed === header) return { key: section.key };
    }
  }
  return null;
}

/** 将行序列切分为「标题 → 内容行」的区块。 */
function splitSections(lines: LayoutLine[]): { header: { key: string } | null; body: LayoutLine[] }[] {
  const blocks: { header: { key: string } | null; body: LayoutLine[] }[] = [];
  let current: { header: { key: string } | null; body: LayoutLine[] } = { header: null, body: [] };
  for (const line of lines) {
    const hit = isSectionHeader(line.text);
    if (hit) {
      blocks.push(current);
      current = { header: hit, body: [] };
    } else {
      current.body.push(line);
    }
  }
  blocks.push(current);
  return blocks;
}

function blockBody(lines: LayoutLine[], key: string): LayoutLine[] {
  const blocks = splitSections(lines);
  const target = blocks.find((b) => b.header?.key === key);
  return target ? target.body : [];
}

/**
 * 通用「条目分组」：把若干行按条目边界切成多组（每条经历一组）。
 * - isStart(line)：该行是否开启新条目。
 * - isHeadExt(line, cur)：该行是否为当前条目的“补充头行”（如单独成行的
 *   时间 / 职位 / 学历），应并入条目标题而不是当作内容或新条目。
 * 多行条目标题会正确合并；多段经历会切分为多条独立记录，绝不合并。
 */
function splitEntryGroups(
  lines: LayoutLine[],
  isStart: (text: string) => boolean,
  isHeadExt?: (text: string, cur: string[]) => boolean,
): string[][] {
  const groups: string[][] = [];
  let cur: string[] | null = null;
  for (const line of lines) {
    const text = line.text.trim();
    if (!text) continue;
    if (isStart(text) && !(cur && isHeadExt?.(text, cur))) {
      if (cur && cur.length > 0) groups.push(cur);
      cur = [text];
    } else {
      if (!cur) cur = [];
      cur.push(text);
    }
  }
  if (cur && cur.length > 0) groups.push(cur);
  return groups;
}

/** 提取日期区间（如 2014.09 - 2018.06 → ['2014.09', '2018.06']）。 */
function extractDateRange(line: string): [string, string] {
  const m = line.match(DATE_RANGE_RE);
  if (m) return [m[1], /至今|现在|Present/i.test(m[2]) ? '至今' : m[2]];
  const single = line.match(DATE_START_RE);
  return single ? [single[0], ''] : ['', ''];
}

function extractName(lines: LayoutLine[]): string {
  for (const line of lines.slice(0, 20)) {
    const m = line.text.match(/姓名\s*[:：]\s*([\u4e00-\u9fa5·]{2,8})/);
    if (m) return m[1];
  }
  for (const line of lines) {
    const t = line.text;
    if (/^[\u4e00-\u9fa5·]{2,6}$/.test(t) && !NAME_STOPWORDS.test(t)) {
      return t;
    }
    if (/^[A-Za-z][A-Za-z .'’-]{1,34}$/.test(t) && !NAME_STOPWORDS.test(t)) {
      const words = t.split(/\s+/);
      if (words.length <= 4 && t.length <= 40) return t;
    }
  }
  return '';
}

function extractWorkYears(text: string): string {
  const m =
    text.match(/(?:工作年限|工作经验|从业年限)[^\n]{0,12}?(\d{1,2})\s*年(以上|以下)?/) ||
    text.match(/(\d{1,2})\s*年(以上|以下)?\s*(?:工作|从业)?经验/);
  return m ? `${m[1]}年${m[2] ?? ''}` : '';
}

/** 去掉日期、机构等已占用片段后，取第一个中文字符串作为职位/项目/专业等。 */
function firstToken(rest: string): string {
  return (
    rest
      .split(/[，。;；,\s|·/]+/)
      .map((s) => s.trim())
      .find((t) => t.length >= 2 && t.length <= 20 && !/年|月|至今|公司|集团|科技|有限|股份/.test(t)) ?? ''
  );
}

function hasTitle(head: string): boolean {
  return TITLE_KEYWORD.test(head);
}

/* ------------------------------------------------------------------ */
/* 教育经历                                                            */
/* ------------------------------------------------------------------ */

function isEduStart(line: string): boolean {
  if (DATE_START_RE.test(line)) return true;
  if (SCHOOL_KEYWORD.test(line)) return true;
  return false;
}

/** 教育条目的补充头行：单独成行的时间 / 学历 / 专业，并入当前条目标题。 */
function isEduHeadExt(line: string, cur: string[]): boolean {
  if (!cur || cur.length === 0) return false;
  const head = cur.join(' ');
  if (DATE_START_RE.test(line) && !SCHOOL_KEYWORD.test(line) && !DATE_START_RE.test(head)) return true;
  if (DEGREE_RE.test(line) && !DEGREE_RE.test(head)) return true;
  if (MAJOR_LABEL_RE.test(line) && !MAJOR_LABEL_RE.test(head)) return true;
  return false;
}

/** tab 版式教育行：「江苏理工学院\t本科\t物联网工程\t2022-2026」。 */
function parseEducationTab(head: string): EducationItem | null {
  if (!head.includes('\t')) return null;
  const fields = head.split('\t').map((s) => s.trim()).filter((s) => s.length > 0);
  if (fields.length < 2) return null;
  let school = '';
  let degree = '';
  let major = '';
  let startDate = '';
  let endDate = '';
  for (const f of fields) {
    if (DATE_RANGE_RE.test(f) || DATE_START_RE.test(f)) {
      const [a, b] = extractDateRange(f);
      if (a) {
        startDate = a;
        endDate = b;
      }
      continue;
    }
    if (DEGREE_RE.test(f)) {
      degree = f.match(DEGREE_RE)?.[0] ?? '';
      continue;
    }
    if (!school && SCHOOL_KEYWORD.test(f)) {
      school = f;
      continue;
    }
    if (!major && !SCHOOL_KEYWORD.test(f) && f.length >= 2) {
      major = f;
    }
  }
  if (!school && !degree && !major && !startDate) return null;
  return { startDate, endDate, school, major, degree };
}

function extractEduItem(group: string[]): EducationItem {
  const head = group.join(' ');
  const tabItem = parseEducationTab(head);
  if (tabItem) return tabItem;

  const school = head.match(SCHOOL_RE)?.[1] ?? '';
  const degree = head.match(DEGREE_RE)?.[0] ?? '';
  let major = head.match(MAJOR_LABEL_RE)?.[1] ?? '';
  if (!major) {
    const rest = head
      .replace(DATE_RANGE_RE, ' ')
      .replace(school, ' ')
      .replace(degree, ' ')
      .replace(/[，。;；,\s|·/]+/g, ' ')
      .trim();
    const candidate = firstToken(rest);
    if (candidate && !SCHOOL_KEYWORD.test(candidate) && !/[（）()，。]/.test(candidate) && candidate.length <= 20) {
      major = candidate;
    }
  }
  const [startDate, endDate] = extractDateRange(head);
  return { startDate, endDate, school, major, degree };
}

function parseEducation(body: LayoutLine[]): EducationItem[] {
  const groups = splitEntryGroups(body, isEduStart, isEduHeadExt);
  const items = groups.map(extractEduItem).filter((it) => it.school || it.degree || it.major || it.startDate);
  const seen = new Set<string>();
  return items.filter((it) => {
    const key = `${it.school}|${it.major}|${it.degree}|${it.startDate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* 工作 / 实习经历                                                     */
/* ------------------------------------------------------------------ */

function isWorkStart(line: string): boolean {
  if (DATE_RANGE_RE.test(line) && line.length <= 30) return true;
  if (DATE_START_RE.test(line)) return true;
  if (DESC_VERB_START.test(line)) return false;
  if (line.length > 24) return false;
  const companyHit = COMPANY_STRONG.test(line);
  const titleHit = TITLE_KEYWORD.test(line);
  if (companyHit && titleHit) return true;
  // 独立职位行：短、无标签、不含连接词（避免把「编译与回归测试」等描述行误判为新条目）
  if (titleHit && line.length <= 14 && !/[:：]/.test(line) && !/[与及和]/.test(line)) return true;
  if (companyHit && !/(维护|开发|设计|搭建|负责|参与|完成|支持|跟进|管理|优化|实现|撰写|运营|测试)/.test(line)) return true;
  return false;
}

/** 工作条目的补充头行：单独成行的职位 / 时间，并入当前条目标题。 */
function isWorkHeadExt(line: string, cur: string[]): boolean {
  if (!cur || cur.length === 0) return false;
  const head = cur.join(' ');
  if (DATE_START_RE.test(line) && !COMPANY_KEYWORD.test(line) && !TITLE_KEYWORD.test(line)) {
    return !DATE_START_RE.test(head);
  }
  if (TITLE_KEYWORD.test(line) && !COMPANY_KEYWORD.test(line) && line.length <= 14) {
    return !hasTitle(head);
  }
  return false;
}

/** tab 版式工作头行：「南京维沃软件技术有限公司\t2026.02-2026.06」。 */
function parseWorkTab(head: string): { company: string; title: string; startDate: string; endDate: string } | null {
  if (!head.includes('\t')) return null;
  const fields = head.split('\t').map((s) => s.trim()).filter((s) => s.length > 0);
  if (fields.length < 2) return null;
  let company = '';
  let title = '';
  let startDate = '';
  let endDate = '';
  for (const f of fields) {
    if (DATE_RANGE_RE.test(f) || DATE_START_RE.test(f)) {
      const [a, b] = extractDateRange(f);
      if (a) {
        startDate = a;
        endDate = b;
      }
      continue;
    }
    if (TITLE_KEYWORD.test(f) && !COMPANY_KEYWORD.test(f)) {
      title = f;
      continue;
    }
    if (!company) company = f;
  }
  if (!company && !title && !startDate) return null;
  return { company, title, startDate, endDate };
}

function extractTitle(head: string): string {
  const labeled = head.match(TITLE_LABEL_RE)?.[1];
  if (labeled) return labeled;
  for (const token of head.split(/[，。;；,\s|·/（）()]+/)) {
    if (
      token.length >= 2 &&
      token.length <= 16 &&
      TITLE_KEYWORD.test(token) &&
      !COMPANY_KEYWORD.test(token)
    ) {
      return token;
    }
  }
  return '';
}

/** 机构名近似中的指代 / 描述性虚词：命中则视为无效公司名（留空优于猜测）。 */
const COMPANY_VIRTUAL =
  /此处|这个|那个|该|本|无|有|图片|文本|扫描|内容|文字|表格|是|的|了|及|和|与|等|并|或|且|相关|负责|主要/;

function extractCompany(head: string, title: string): string {
  let rest = head.replace(DATE_RANGE_RE, ' ').replace(title, ' ');
  const named = rest.match(COMPANY_RE)?.[1];
  if (named) return named;
  const paren = rest.match(/[（(]([^（）()]{2,30})[)）]/);
  if (paren && COMPANY_KEYWORD.test(paren[1]) && !TITLE_KEYWORD.test(paren[1])) return paren[1];
  rest = rest
    .replace(/^(?:在|就职于|任职于|供职于|工作于|于)/, ' ')
    .replace(/(?:实习|工作|任职|就职|全职|兼职)/g, ' ')
    .replace(/[，。;；,\s|·/（）()]+/g, ' ')
    .trim();
  const token = rest
    .split(/\s+/)
    .map((s) => s.trim())
    .find(
      (t) =>
        t.length >= 2 &&
        t.length <= 30 &&
        !TITLE_KEYWORD.test(t) &&
        !/^[\d.]+$/.test(t) &&
        !COMPANY_VIRTUAL.test(t),
    );
  return token ?? '';
}

function cleanDescLines(lines: string[]): string {
  return lines
    .join('\n')
    .replace(/^\s*(?:[-•·◆●▪]|\d+[.、．])\s*/gm, '')
    .trim();
}

function parseWork(body: LayoutLine[]): WorkItem[] {
  const groups = splitEntryGroups(body, isWorkStart, isWorkHeadExt);
  const items: WorkItem[] = [];
  for (const group of groups) {
    const head = group.join(' ');
    // tab 字段行（「公司\t时间」）一定是条目首行；head 的 join 会混入后续行，必须用首行判断
    const tabInfo = parseWorkTab(group[0] ?? '');
    let startDate = '';
    let endDate = '';
    let company = '';
    let title = '';
    if (tabInfo) {
      company = tabInfo.company;
      title = tabInfo.title;
      startDate = tabInfo.startDate;
      endDate = tabInfo.endDate;
    } else {
      [startDate, endDate] = extractDateRange(head);
      title = extractTitle(head);
      company = extractCompany(head, title);
    }
    // 岗位可能在描述行中（「岗位职责：测试开发实习生」）或独立职位行（下一行）
    const descLines = [...group.slice(1)];
    if (!title) {
      for (let i = 0; i < descLines.length; i += 1) {
        const m = descLines[i].match(TITLE_LABEL_RE);
        if (m) {
          title = m[1];
          descLines[i] = descLines[i].replace(TITLE_LABEL_RE, '').trim();
          break;
        }
      }
    }
    if (!title && descLines.length > 0) {
      const first = descLines[0];
      if (TITLE_KEYWORD.test(first) && !COMPANY_KEYWORD.test(first) && first.length <= 14 && !/[:：]/.test(first) && !/[与及和]/.test(first)) {
        title = first;
        descLines.shift();
      }
    }
    if (!company && !title && !startDate) continue;
    const description = cleanDescLines(descLines);
    items.push({ startDate, endDate, company, title, description });
  }
  return items;
}

/* ------------------------------------------------------------------ */
/* 项目经历                                                            */
/* ------------------------------------------------------------------ */

function isProjectStart(line: string): boolean {
  if (DATE_RANGE_RE.test(line) && line.length <= 30) return true;
  if (DATE_START_RE.test(line)) return true;
  if (DESC_VERB_START.test(line)) return false;
  if (line.length > 24) return false;
  if (PROJECT_LABEL_RE.test(line)) return true;
  return /项目|系统|平台|网站|APP|小程序|客户端|中台|后台|前端|数据|算法|模型/.test(line);
}

function extractProjectItem(group: string[]): ProjectItem {
  const head = group.join(' ');
  const [startDate, endDate] = extractDateRange(head);
  let name = head.match(PROJECT_LABEL_RE)?.[1] ?? '';
  if (!name) {
    name = firstToken(head.replace(DATE_RANGE_RE, ' ').replace(/^(?:项目经历|项目经验)[':：]?/, ' '));
  }
  let role = head.match(TITLE_LABEL_RE)?.[1] ?? '';
  if (!role && name) {
    const rest = head
      .replace(DATE_RANGE_RE, ' ')
      .replace(name, ' ')
      .replace(/^(?:项目经历|项目经验|项目名称)[:：]?\s*/, ' ')
      .replace(/[，。;；,\s|·/]+/g, ' ')
      .trim();
    const token = firstToken(rest);
    if (token && token !== name) role = token;
  }
  if (!name && !role && !startDate) return { startDate, endDate, name: '', role: '', description: '' };
  const description = cleanDescLines(group.slice(1));
  return { startDate, endDate, name, role, description };
}

function parseProjects(body: LayoutLine[]): ProjectItem[] {
  const groups = splitEntryGroups(body, isProjectStart);
  return groups
    .map(extractProjectItem)
    .filter((it) => it.name || it.role || it.startDate);
}

/* ------------------------------------------------------------------ */
/* 技能：技术实体 / 能力短语抽取                                       */
/* ------------------------------------------------------------------ */

/** 描述性动词：技能文本中的「掌握 / 熟悉…」一律剔除。 */
const SKILL_VERB_RE =
  /^(?:熟练掌握|熟练|掌握|熟悉|了解|精通|擅长|能够|可以|能|会|具备|拥有|使用|运用|利用|负责|参与过|接触过|学习过|了解过|参与|从事)/;

/** 连接词：作为技能语义块的拆分符。 */
const SKILL_CONJ = /[及和与等并或且]+/;

/** 弱描述后缀：不作为技能、也不参与合并（如「Docker 部署」只保留 Docker）。 */
const WEAK_DESC =
  /(部署|搭建|优化|重构|构建|发布|编写|撰写|实现|支持|跟进|负责|参与|相关|方面|领域|方向|流程|工作|内容|经验|技巧|方法|实践|使用|应用|维护|熟练|掌握|熟悉|了解|技术|设计)$/;

/** 强能力短语：英数实体后紧跟这些词时合并为能力短语（Java单元测试 / PO模式）。 */
const STRONG_ABILITY =
  /(测试|模式|框架|平台|系统|脚本|协议|容器|自动化|性能|接口|引擎|数据库|网络|语言|安全|架构|算法|模型|工具|组件|插件|可视化|流水线|提示词|用例|报文|内存|页面|链|分析|管理|运维|开发|设计|构建)/;

/** 纯中文技能 token 需命中的技术领域后缀。 */
const TECH_SUFFIX =
  /(测试|开发|框架|系统|平台|引擎|语言|架构|算法|模型|网络|协议|数据库|存储|缓存|容器|安全|运维|监控|自动化|性能|接口|前端|后端|全栈|移动|客户端|服务端|嵌入式|大数据|云计算|分布式|微服务|中间件|组件|插件|脚本|设计|分析|管理|运营|营销|产品|数据|办公|文档|协作|沟通|机器学习|深度学习|可视化|报表|搜索|推荐|爬虫|画像|风控|规范|测试框架|单元测试|接口测试|性能测试|安全测试|自动化测试|回归测试|压力测试|兼容性|适配|流水线|提示词|用例|报文|内存|页面|工具链|协议分析|容器化|自动化运维|持续集成|缺陷跟踪|参数化|零拷贝|大页内存)/;

function stripDescSuffix(token: string): string {
  const m = token.match(/^([A-Za-z0-9][A-Za-z0-9.#+_/=-]*)([\u4e00-\u9fa5]{2,})$/);
  if (m && WEAK_DESC.test(m[2])) return m[1];
  return token;
}

function isValidSkill(token: string): boolean {
  if (!token) return false;
  if (/^[\d.。]+$/.test(token)) return false;
  if (/^[、，,;；|·/\-—–]+$/.test(token)) return false;
  if (SKILL_VERB_RE.test(token)) return false;
  if (/^[及和与等并或且]+$/.test(token)) return false;
  const hasAlphaNumeric = /[A-Za-z0-9]/.test(token);
  if (!hasAlphaNumeric) {
    if (token.length < 2) return false;
    if (WEAK_DESC.test(token)) return false;
    if (!TECH_SUFFIX.test(token)) return false;
  } else {
    if (token.replace(/[^A-Za-z0-9]/g, '').length < 2) return false;
  }
  return true;
}

function parseSkills(body: LayoutLine[]): string[] {
  const tags: string[] = [];
  const push = (token: string) => {
    const cleaned = stripDescSuffix(token.trim());
    if (isValidSkill(cleaned) && tags.length < 40 && !tags.includes(cleaned)) tags.push(cleaned);
  };

  for (const rawLine of body) {
    const line = rawLine.text
      // 去行首序号（1. / 2、/ 一、）
      .replace(/^\s*(?:\d+[.、．]|[一二三四五六七八九十]+[、.．])\s*/, '')
      // 去「类别名：」块标题（如「自动化测试开发：」），实体从描述中提取
      .replace(/^[^:：]{0,14}[:：]\s*/, '')
      // 归一化 CI/CD：CICD / CI-CD / CI、CD → CI/CD
      .replace(/CI\s*[/、-]?\s*CD|CICD|CD\s*[/、-]?\s*CI/gi, 'CI/CD')
      .trim();
    if (!line) continue;

    // 括号展开：括号内（如 Python(Pytest/Selenium)）内容作为独立候选
    const parenContents = [...line.matchAll(/[（(]([^（）()]+)[)）]/g)].map((m) => m[1]);
    const outside = line.replace(/[（(][^（）()]*[)）]/g, ' ');
    const segments = [...parenContents, outside];

    for (const seg of segments) {
      // 先按连接词拆块，再按强分隔符拆块（每个块是一个语义片段）
      const blocks = seg.split(SKILL_CONJ).flatMap((s) => s.split(/[、，,;；。|·]+/));
      for (let block of blocks) {
        block = block.replace(SKILL_VERB_RE, '').trim();
        if (!block) continue;

        const tokens = block.split(/\s+/);
        let prevTech: string | null = null; // 最近一个英数实体（可能后接能力短语）
        for (const t of tokens) {
          const clean = t.replace(SKILL_VERB_RE, '').replace(/[，。、;；,|·（）()]+/g, '');
          if (!clean) continue;

          // 粘连实体：英数 + 中文（Java单元测试 / CI/CD流水线搭建）
          const glued = clean.match(/^([A-Za-z0-9][A-Za-z0-9.#+_/=-]*)([\u4e00-\u9fa5]{2,})$/);
          if (glued) {
            if (prevTech) {
              push(prevTech);
              prevTech = null;
            }
            if (WEAK_DESC.test(glued[2])) {
              push(glued[1]); // CI/CD流水线搭建 → CI/CD
            } else {
              push(clean); // Java单元测试 → 保留整体
            }
            continue;
          }

          // 含 / 的实体：CI/CD 已归一化保留，其余按 / 拆分为独立技术（Pytest/Selenium）
          if (clean.includes('/') && clean !== 'CI/CD') {
            if (prevTech) {
              push(prevTech);
              prevTech = null;
            }
            for (const part of clean.split('/')) {
              if (part.trim()) push(part.trim());
            }
            continue;
          }

          if (/^[A-Za-z0-9][A-Za-z0-9.#+_/=-]*$/.test(clean) && !SKILL_VERB_RE.test(clean)) {
            // 英数实体：全小写连续词合并为工具名（claude code），否则单独记录
            if (prevTech && /^[a-z]/.test(prevTech) && /^[a-z]/.test(clean)) {
              prevTech = `${prevTech} ${clean}`;
            } else {
              if (prevTech) push(prevTech);
              prevTech = clean;
            }
          } else if (/^[\u4e00-\u9fa5]{2,}$/.test(clean) && prevTech && STRONG_ABILITY.test(clean)) {
            // 英数实体 + 强能力短语 → 合并（PO 模式 → PO模式）
            push(prevTech + clean);
            if (/^[A-Za-z]{2}$/.test(prevTech)) {
              prevTech = null; // PO 等弱缩写只保留合并形式
            } else {
              push(prevTech);
              prevTech = null;
            }
          } else if (/^[\u4e00-\u9fa5]{2,}$/.test(clean)) {
            // 中文词：弱描述则丢弃（Docker 部署 → Docker），否则作为能力短语
            if (WEAK_DESC.test(clean)) {
              if (prevTech) {
                push(prevTech);
                prevTech = null;
              }
            } else {
              push(clean);
              prevTech = null;
            }
          } else {
            if (prevTech) {
              push(prevTech);
              prevTech = null;
            }
          }
        }
        if (prevTech) push(prevTech);
      }
    }
  }
  return tags;
}

/** 语言标签：只保留确实包含语言关键词或水平标记的片段。 */
function parseLanguages(body: LayoutLine[]): string[] {
  const LANGUAGE_RE =
    /英语|日语|韩语|法语|德语|俄语|西班牙语|葡萄牙语|意大利语|阿拉伯语|粤语|普通话|中文|泰语|CET-?[46]|IELTS|TOEFL|TEM-?[48]|N[12]|四六级|六级|四级|流利|熟练|良好|精通|日常交流/;
  const tags: string[] = [];
  for (const line of body) {
    const parts = line.text
      .split(/[、，,;；/|·\s]+/)
      .map((s) => s.trim().replace(/[:：]$/, ''))
      .filter((s) => s.length >= 2 && s.length <= 30 && LANGUAGE_RE.test(s));
    for (const part of parts) {
      if (tags.length >= 15) break;
      if (!tags.includes(part)) tags.push(part);
    }
  }
  return tags;
}

/** 证书等短标签拆分。 */
function splitTags(body: LayoutLine[], max: number): string[] {
  const tags: string[] = [];
  for (const line of body) {
    const parts = line.text
      .split(/[、，,;；/|·\s]+/)
      .map((s) => s.trim().replace(/[:：]$/, ''))
      .filter((s) => s.length >= 2 && s.length <= 30);
    for (const part of parts) {
      if (tags.length >= max) break;
      if (!tags.includes(part)) tags.push(part);
    }
  }
  return tags;
}

/* ------------------------------------------------------------------ */
/* 主入口                                                              */
/* ------------------------------------------------------------------ */

/** 从版面行解析候选人资料（推荐入口：PDF 走版面提取，DOCX 走段落序列）。 */
export function parseCandidateProfileLayout(rawLines: LayoutLine[]): CandidateProfile {
  const lines = normalizeLayoutLines(rawLines);
  const text = lines.map((l) => l.text).join('\n');
  const profile = createEmptyCandidateProfile();

  profile.name = extractName(lines);
  profile.phone = text.match(PHONE_RE)?.[0] ?? '';
  profile.email = text.match(EMAIL_RE)?.[0] ?? '';
  profile.workYears = extractWorkYears(text);

  profile.summary = blockBody(lines, 'summary').map((l) => l.text).filter((t) => t.trim()).join('\n').slice(0, 4000);

  profile.education = parseEducation(blockBody(lines, 'education'));
  profile.workExperience = parseWork(blockBody(lines, 'workExperience'));
  profile.projectExperience = parseProjects(blockBody(lines, 'projectExperience'));
  profile.skills = parseSkills(blockBody(lines, 'skills'));
  profile.certificates = splitTags(blockBody(lines, 'certificates'), 20);
  profile.languages = parseLanguages(blockBody(lines, 'languages'));

  return profile;
}

/** 从纯文本解析（无版面信息时的兜底入口，行为与版面版一致）。 */
export function parseCandidateProfile(rawText: string): CandidateProfile {
  const lines: LayoutLine[] = normalizeText(rawText).map((t, i) => ({
    text: t,
    page: 1,
    y: 100000 - i,
    bold: false,
  }));
  return parseCandidateProfileLayout(lines);
}

/**
 * 解析完整性提示：检测到某部分内容但未能解析出有效记录时给出提示，
 * 引导用户对照原简历手动补充。只做保守判断，不猜测具体内容。
 */
export function computeParseWarnings(rawLines: LayoutLine[], profile: CandidateProfile): string[] {
  const warnings: string[] = [];
  const lines = normalizeLayoutLines(rawLines);

  const educationBody = blockBody(lines, 'education');
  if (educationBody.length > 0) {
    const schoolLines = educationBody.filter((l) => SCHOOL_KEYWORD.test(l.text));
    if (profile.education.length === 0) {
      warnings.push('教育经历');
    } else if (schoolLines.length > profile.education.length) {
      warnings.push('教育经历（检测到多段，请核对是否漏识别）');
    }
  }

  const workBody = blockBody(lines, 'workExperience');
  if (workBody.length > 0) {
    if (profile.workExperience.length === 0) {
      warnings.push('工作/实习经历');
    } else {
      const datedLines = workBody.filter((l) => DATE_START_RE.test(l.text)).length;
      if (datedLines > profile.workExperience.length) {
        warnings.push('工作/实习经历（检测到多段，请核对是否漏识别）');
      }
    }
  }

  const projectBody = blockBody(lines, 'projectExperience');
  if (projectBody.length > 0 && profile.projectExperience.length === 0) {
    warnings.push('项目经历');
  }

  const skillsBody = blockBody(lines, 'skills');
  if (skillsBody.length > 0 && profile.skills.length === 0) {
    warnings.push('技能');
  }

  return warnings;
}
