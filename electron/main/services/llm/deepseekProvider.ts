import type {
  DecisionLlmInput,
  DecisionLlmProvider,
  LlmDecision,
} from '../../../../core/decision/provider';
import { llmDecisionSchema } from '../../../../core/decision/provider';
import { logger } from '../../logger';

/**
 * V0.4-D DeepSeek LLM 决策 Provider（OpenAI 兼容 HTTP API）。
 *
 * - 模型：deepseek-chat（非思考模型，可配置为 deepseek-reasoner）
 * - 输入：候选人资料 + 求职规则 + 岗位完整 JD（结构化 JSON 提示词）
 * - 输出：严格 JSON（verdict / matches / risks / unknowns / reason / confidence），zod 校验
 * - 防编造约束（写入系统提示）：只能使用提供的信息；「简历没写」≠「用户不会」→ 不确定时 REVIEW
 * - 用户明确硬规则由决策服务侧的本地护栏强制（LLM 结果若违反 → SKIP），本 Provider 不负责规则判断
 *
 * 隐私说明：选择远程 API 意味着简历与 JD 会发送给 DeepSeek 服务商。
 */

const API_URL = 'https://api.deepseek.com/chat/completions';

export interface DeepSeekProviderOptions {
  apiKey: string;
  model?: string;
  /** 请求超时（毫秒）。 */
  timeoutMs?: number;
  /** 可注入的请求函数（测试用）；缺省用全局 fetch。 */
  fetchFn?: (url: string, init: unknown) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;
}

function buildSystemPrompt(): string {
  return [
    '你是一名严谨的求职岗位筛选助手，为候选人判断岗位是否值得投递。',
    '决策只能基于输入信息，禁止编造候选人没有的技能、经历，禁止编造 JD 没有写的要求或待遇。',
    '「简历没写」不等于「用户不会」：当信息显著影响判断但资料未体现时，判定为 REVIEW，不要擅自 AUTO_APPLY 或 SKIP。',
    '判断标准：',
    '- AUTO_APPLY：岗位明显符合候选人的方向、能力与规则，且没有重要不确定项。',
    '- SKIP：岗位明显不符合（方向无关、条件明确不满足、或存在用户规则明确排除的内容）。',
    '- REVIEW：有匹配但存在关键不确定或风险，需要用户决定。',
    '输出必须是合法 JSON 对象，不要输出任何 JSON 之外的文字，格式：',
    '{"verdict":"AUTO_APPLY|REVIEW|SKIP","matches":["主要匹配点，最多5条"],"risks":["主要风险，最多5条"],"unknowns":["关键不确定项，最多5条"],"reason":"一句话简短决策理由，40字以内","confidence":"HIGH|MEDIUM|LOW"}',
  ].join('\n');
}

function buildUserPrompt(input: DecisionLlmInput): string {
  const { profile, rules, job } = input;
  const eduText = profile.education
    .map((e) => `${e.startDate || '?'}-${e.endDate || '至今'} ${e.school} ${e.degree} ${e.major}`.trim())
    .join('；') || '（无）';
  const workText = profile.workExperience
    .map((w) => `${w.startDate || '?'}-${w.endDate || '至今'} ${w.company} ${w.title}`.trim())
    .join('；') || '（无）';

  return [
    '【候选人资料】',
    `姓名：${profile.name || '（未提供）'}`,
    `工作年限：${profile.workYears || '（未提供）'}`,
    `教育背景：${eduText}`,
    `工作经历：${workText}`,
    `技能：${profile.skills.join('、') || '（无）'}`,
    '',
    '【用户求职规则（硬性条件）】',
    `目标岗位方向：${rules.targetJobs.join('、') || '不限'}`,
    `接受城市：${rules.targetCities.join('、') || '不限'}`,
    `最低可接受月薪：${rules.minSalary ? `${Math.round(rules.minSalary / 1000)}K` : '不限'}`,
    `是否接受外包：${rules.acceptOutsourcing ? '接受' : '不接受'}`,
    `单双休：${rules.weekendPreference === 'MUST_DOUBLE' ? '必须双休' : rules.weekendPreference === 'PREFER_DOUBLE' ? '偏好双休' : '接受单休'}`,
    `学历要求容忍：${rules.degreeTolerance === 'STRICT' ? '严格' : rules.degreeTolerance === 'FLEXIBLE' ? '灵活（不满足需确认）' : '忽略'}`,
    `经验要求容忍：${rules.experienceTolerance === 'STRICT' ? '严格' : rules.experienceTolerance === 'FLEXIBLE' ? '灵活（不满足需确认）' : '忽略'}`,
    `明确排除条件：${rules.excludedKeywords.join('、') || '无'}`,
    '',
    '【岗位信息】',
    `岗位：${job.title}`,
    `公司：${job.company}`,
    `城市：${job.city ?? '（未提供）'}`,
    `薪资：${job.salary ?? '（未提供）'}`,
    `学历要求：${job.degree ?? '（未提供）'}`,
    `经验要求：${job.experience ?? '（未提供）'}`,
    `岗位标签：${job.jobLabels?.join('、') ?? '（无）'}`,
    '',
    '【完整职位描述（JD）】',
    job.jdText ?? '（无）',
    '',
    '请判断该岗位：',
  ].join('\n');
}

/** 解析 LLM 输出（可能带代码块包裹 / 前后杂讯），并做结构校验。 */
function parseLlmOutput(content: string): LlmDecision {
  let text = content.trim();
  // 去掉 ```json ... ``` 代码块包裹
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  // 取第一个 { 到最后一个 }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('LLM 输出不是 JSON');
  const parsed = JSON.parse(text.slice(start, end + 1));
  const result = llmDecisionSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`LLM 输出校验失败：${result.error.issues[0]?.message ?? '格式错误'}`);
  }
  return {
    verdict: result.data.verdict,
    matches: result.data.matches ?? [],
    risks: result.data.risks ?? [],
    unknowns: result.data.unknowns ?? [],
    reason: result.data.reason,
    confidence: result.data.confidence ?? 'MEDIUM',
  };
}

export class DeepSeekProvider implements DecisionLlmProvider {
  readonly name: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: DeepSeekProviderOptions['fetchFn'];

  constructor(options: DeepSeekProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model || 'deepseek-chat';
    this.timeoutMs = options.timeoutMs ?? 60000;
    this.fetchFn = options.fetchFn;
    this.name = `DeepSeek ${this.model}`;
  }

  async decide(input: DecisionLlmInput): Promise<LlmDecision> {
    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: buildUserPrompt(input) },
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    };

    const fetchImpl = this.fetchFn ?? (async (url, init) => {
      const res = await fetch(url, init as RequestInit);
      return {
        ok: res.ok,
        status: res.status,
        text: () => res.text(),
      };
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetchImpl(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`DeepSeek API ${res.status}: ${text.slice(0, 200)}`);
      }
      const data = JSON.parse(text) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error('DeepSeek API 返回为空');
      const decision = parseLlmOutput(content);
      logger.info('llm', `deepseek decide verdict=${decision.verdict} model=${this.model}`);
      return decision;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('DeepSeek API 请求超时');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
