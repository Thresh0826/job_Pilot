import type {
  DecisionInput,
  JobDecision,
  Verdict,
} from './index';

/**
 * V0.4-B 本地可解释岗位决策引擎（纯函数，确定性，可单测）。
 *
 * 决策流程（不是简单打分）：
 *   1. 硬规则检查：用户明确规则优先，违反 → SKIP
 *   2. 信号分析：方向 / 技能 / 学历 / 经验 / 薪资 / 排班等信号（全部来自原文）
 *   3. 决策：明显符合 → AUTO_APPLY；存在关键风险 / 不确定 → REVIEW；硬违反 → SKIP
 *
 * 防编造：
 * - 只使用 DecisionInput 中的 profile / rules / job 字段
 * - 学历、经验、技能、薪资等所有判断基于结构化字段或 JD 原文子串
 * - 「简历没写」≠「用户不会」：JD 要求但资料未体现 → 记入 unknowns（REVIEW），不擅自 SKIP
 *
 * 预留：后续可替换为 LLM Provider，但输入输出契约（DecisionInput → JobDecision）保持不变。
 */

/** 学历等级（用户学历 ≥ 岗位要求学历时视为满足）。 */
const DEGREE_RANK: Record<string, number> = {
  博士: 5,
  硕士: 4,
  研究生: 4,
  本科: 3,
  学士: 3,
  大专: 2,
  专科: 2,
  高中: 1,
  中专: 1,
  职高: 1,
};

const DEGREE_PATTERN = /博士|硕士|研究生|本科|学士|大专|专科|高中|中专|职高/;

/** JD 中的排班 / 外包 / 排除信号词。 */
const OUTSOURCING_WORDS = /外包|劳务派遣|驻场|人力外包/;
const SINGLE_REST_WORDS = /单休|大小周|做六休一|996|六天工作制|周日单休/;

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** 从岗位文本集合中检测信号词（外包 / 单双休 / 排除词）。 */
function hasWord(job: DecisionInput['job'], re: RegExp): boolean {
  const texts = [job.title, job.company, job.jdText ?? '', ...(job.jobLabels ?? [])].join('\n');
  return re.test(texts);
}

/** 从薪资文本解析最低月薪（元），失败返回 null。 */
function parseSalaryMin(salary: string | undefined, salaryMin: number | undefined): number | null {
  if (typeof salaryMin === 'number' && salaryMin > 0) return salaryMin;
  if (!salary) return null;
  const m = salary.match(/(\d+(?:\.\d+)?)\s*[Kk万]/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return salary.includes('万') ? Math.round(n * 10000) : Math.round(n * 1000);
}

/** 岗位要求的最低学历等级；学历不限 / 未提供返回 null。 */
function jobDegreeRank(job: DecisionInput['job']): number | null {
  if (!job.degree) return null;
  if (/不限|无要求/.test(job.degree)) return null;
  const m = job.degree.match(DEGREE_PATTERN);
  if (!m) return null;
  return DEGREE_RANK[m[0]] ?? null;
}

/** 用户最高学历等级；无学历信息返回 null。 */
function userDegreeRank(profile: DecisionInput['profile']): number | null {
  let rank: number | null = null;
  for (const edu of profile.education) {
    const m = edu.degree.match(DEGREE_PATTERN);
    if (m) {
      const r = DEGREE_RANK[m[0]];
      if (r !== undefined && (rank === null || r > rank)) rank = r;
    }
  }
  return rank;
}

/** 岗位要求经验的上限年数（"1-3年" → 3，"经验不限" → null）。 */
function jobExperienceMax(job: DecisionInput['job']): number | null {
  if (!job.experience) return null;
  if (/不限/.test(job.experience)) return null;
  const nums = job.experience.match(/\d+/g);
  if (!nums) return null;
  return Math.max(...nums.map(Number));
}

/** 用户工作年限（年）；无法确定返回 null。 */
function userYears(profile: DecisionInput['profile']): number | null {
  const m = profile.workYears.match(/(\d+(?:\.\d+)?)\s*年/);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** 从 JD 中提取「要求类」技术词（任职要求 / 熟练 / 熟悉 / 掌握…后的整段中的技术词），
 *  与用户技能对比，返回用户缺失的前几个（词全部来自 JD 原文，不编造）。 */
function jdRequiredSkillsMissing(job: DecisionInput['job'], profile: DecisionInput['profile']): string[] {
  const jd = job.jdText ?? '';
  if (!jd.trim()) return [];

  // 收集「要求段」：任职要求 / 岗位要求 / 熟练 / 熟悉 / 掌握 / 精通 之后的文本
  const blocks: string[] = [];
  jd.replace(/(?:任职要求|岗位要求|职位要求|任职资格|要求)[:：]?\s*([^。\n]+)/g, (_m, b: string) => {
    if (b.trim()) blocks.push(b);
    return _m;
  });
  jd.replace(/(?:熟练|熟悉|掌握|了解|精通)[:：]?\s*([^。\n]{0,80})/g, (_m, b: string) => {
    if (b.trim()) blocks.push(b);
    return _m;
  });

  const words: string[] = [];
  for (const block of blocks) {
    const found = block.match(/[A-Za-z][A-Za-z0-9.#+_/=-]*(?:\s+[A-Za-z][A-Za-z0-9.#+_/=-]*)?/g) ?? [];
    for (const w of found) {
      const clean = w.trim();
      if (clean.length >= 2 && clean.length <= 24 && !words.includes(clean)) words.push(clean);
    }
  }

  const covered = (w: string): boolean =>
    profile.skills.some((s) => s.includes(w) || w.includes(s));
  return words.filter((w) => !covered(w)).slice(0, 3);
}

/** 用户技能中被 JD 提及的（最多 5 个）。 */
function jdMentionsUserSkills(job: DecisionInput['job'], profile: DecisionInput['profile']): string[] {
  const jd = job.jdText ?? '';
  const mentioned = profile.skills.filter((s) => {
    if (!s.trim()) return false;
    if (jd.includes(s)) return true;
    if (job.jobLabels?.some((l) => l.includes(s))) return true;
    return false;
  });
  return mentioned.slice(0, 5);
}

/** 岗位方向与目标关键词是否命中。 */
function directionHit(job: DecisionInput['job'], rules: DecisionInput['rules']): boolean {
  const targets = rules.targetJobs.filter((t) => t.trim().length > 0);
  if (targets.length === 0) return true; // 未设置方向 → 不判
  const texts = [job.title, job.jdText ?? '', ...(job.jobLabels ?? [])].join('\n');
  return targets.some((t) => texts.includes(t) || job.title.includes(t) || t.includes(job.title));
}

/** 核心决策函数：DecisionInput → JobDecision（createdAt/updatedAt/userAction 由调用方补充）。 */
export function decideJob(input: DecisionInput): Omit<JobDecision, 'createdAt' | 'updatedAt' | 'userAction'> {
  const { job, profile, rules } = input;

  const violations: string[] = [];
  const risks: string[] = [];
  const unknowns: string[] = [];
  const matches: string[] = [];

  /* ---------- 1. 硬规则（用户明确条件优先） ---------- */
  if (rules.targetCities.length > 0 && job.city) {
    if (!rules.targetCities.includes(job.city)) {
      violations.push(`城市：目标为「${rules.targetCities.join('/')}」，岗位在「${job.city}」`);
    }
  }
  const salaryMin = parseSalaryMin(job.salary, job.salaryMin);
  if (rules.minSalary !== null && salaryMin !== null && salaryMin < rules.minSalary) {
    violations.push(`薪资：最低可接受 ${Math.round(rules.minSalary / 1000)}K，岗位约 ${Math.round(salaryMin / 1000)}K`);
  }
  if (!rules.acceptOutsourcing && hasWord(job, OUTSOURCING_WORDS)) {
    violations.push('岗位为外包 / 劳务派遣，你设置了不接受外包');
  }
  if (rules.weekendPreference === 'MUST_DOUBLE' && hasWord(job, SINGLE_REST_WORDS)) {
    violations.push('岗位为单休 / 大小周，你设置了必须双休');
  }
  for (const kw of rules.excludedKeywords) {
    if (kw.trim() && hasWord(job, new RegExp(kw.trim(), 'i'))) {
      violations.push(`岗位包含你明确排除的条件「${kw.trim()}」`);
    }
  }

  const jobDeg = jobDegreeRank(job);
  const userDeg = userDegreeRank(profile);
  const degreeLow = jobDeg !== null && userDeg !== null && userDeg < jobDeg;
  if (degreeLow && rules.degreeTolerance === 'STRICT') {
    violations.push(`学历：岗位要求 ${job.degree ?? '更高学历'}，你的最高学历不足`);
  }

  const jobExp = jobExperienceMax(job);
  const userYrs = userYears(profile);
  const expLow = jobExp !== null && userYrs !== null && userYrs < jobExp;
  if (expLow && rules.experienceTolerance === 'STRICT') {
    violations.push(`经验：岗位要求 ${job.experience ?? '更多经验'}，你的经验不足`);
  }

  if (violations.length > 0) {
    return {
      platform: job.platform,
      platformJobId: job.platformJobId,
      verdict: 'SKIP',
      score: clampScore(30 - violations.length * 10),
      confidence: 'HIGH',
      matches: [],
      risks,
      unknowns,
      reason: `违反你的明确规则：${violations[0]}${violations.length > 1 ? ` 等 ${violations.length} 项` : ''}。`,
      ruleViolations: violations,
      contextHash: '',
    };
  }

  /* ---------- 2. 信号分析 ---------- */
  const hit = directionHit(job, rules);
  if (rules.targetJobs.length > 0 && hit) {
    matches.push('岗位方向与你的目标岗位一致');
  }

  const skillHits = jdMentionsUserSkills(job, profile);
  if (skillHits.length > 0) {
    matches.push(`JD 提及你的技能：${skillHits.join('、')}`);
  }

  if (degreeLow && rules.degreeTolerance === 'FLEXIBLE') {
    risks.push(`学历要求可能偏高：岗位要求 ${job.degree ?? '更高学历'}`);
  } else if (jobDeg !== null && userDeg === null) {
    unknowns.push(`岗位要求 ${job.degree ?? '一定学历'}，简历未体现学历信息`);
  }
  if (expLow && rules.experienceTolerance === 'FLEXIBLE') {
    risks.push(`经验要求可能偏高：岗位要求 ${job.experience ?? '更多经验'}`);
  } else if (jobExp !== null && userYrs === null) {
    unknowns.push(`岗位要求 ${job.experience ?? '一定经验'}，简历未体现工作年限`);
  }

  if (rules.minSalary !== null && salaryMin === null) {
    unknowns.push('岗位未标注薪资，无法确认是否达到你的最低薪资要求');
  }

  const missingSkills = jdRequiredSkillsMissing(job, profile);
  if (missingSkills.length > 0) {
    unknowns.push(`JD 要求「${missingSkills.join('、')}」，简历未体现（可能不具备）`);
  }

  if (rules.weekendPreference === 'PREFER_DOUBLE' && hasWord(job, SINGLE_REST_WORDS)) {
    risks.push('岗位为单休 / 大小周，你偏好双休');
  }

  /* ---------- 3. 决策（不确定时宁可 REVIEW） ---------- */
  // 关键不确定：设置了最低薪资但岗位未标注薪资 / JD 要求多个技能简历均未体现
  // （「简历没写」≠「用户不会」→ 交用户确认，不擅自 SKIP）
  const criticalUnknown =
    (rules.minSalary !== null && salaryMin === null) || missingSkills.length >= 2;
  let verdict: Verdict;
  if (!hit || criticalUnknown) {
    verdict = 'REVIEW';
  } else if (risks.length > 0) {
    verdict = 'REVIEW';
  } else if (unknowns.length >= 2) {
    verdict = 'REVIEW';
  } else if (skillHits.length >= 1 || rules.targetJobs.length === 0) {
    verdict = 'AUTO_APPLY';
  } else {
    verdict = 'REVIEW';
  }

  const score = clampScore(60 + skillHits.length * 8 - risks.length * 6 - unknowns.length * 4);
  const confidence = verdict === 'AUTO_APPLY' && skillHits.length >= 2 ? 'HIGH' : 'MEDIUM';

  let reason: string;
  if (verdict === 'AUTO_APPLY') {
    reason = `岗位方向与你的目标一致${skillHits.length > 0 ? `，JD 提及你的技能「${skillHits.join('、')}」` : ''}，未发现明显风险。`;
  } else {
    const items = [...risks, ...unknowns].slice(0, 3);
    reason = `存在需要你确认的事项：${items.join('；')}${items.length > 0 ? '。' : '方向匹配度不高。'}`;
  }

  return {
    platform: job.platform,
    platformJobId: job.platformJobId,
    verdict,
    score,
    confidence,
    matches,
    risks,
    unknowns,
    reason,
    ruleViolations: violations,
    contextHash: '',
  };
}
