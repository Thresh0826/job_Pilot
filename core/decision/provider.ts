import { z } from 'zod';
import type { CandidateProfile } from '../candidate';
import type {
  Confidence,
  DecisionJobInput,
  DecisionRules,
  Verdict,
} from './index';

/**
 * V0.4-D LLM 语义决策 Provider 抽象。
 *
 * 背景：V0.4-B/C 的决策核心是本地确定性规则，整体较保守（AUTO_APPLY 比例低）。
 * V0.4-D 引入 LLM 做语义判断：方向是否一致、技能是否覆盖、风险与不确定项、简短理由。
 *
 * 铁律（不可绕过）：
 * - 用户的明确硬规则（城市 / 薪资 / 外包 / 单休 / 排除词 / 学历经验严格模式）优先级高于任何判断，
 *   由本地硬规则护栏强制（见 decisionService，LLM 结果若违反硬规则 → 强制 SKIP）。
 * - LLM 只能使用输入中提供的信息，不得编造；「简历没写」≠「用户不会」→ 不确定时 REVIEW。
 * - 输入输出契约保持与本地引擎一致（DecisionInput → JobDecision 不变），可随时替换实现。
 */

/** LLM 决策输出（结构化，解析后校验）。 */
export interface LlmDecision {
  verdict: Verdict;
  matches: string[];
  risks: string[];
  unknowns: string[];
  reason: string;
  confidence: Confidence;
}

/** LLM 输出校验：字段数量与取值受限，reason 有长度约束。 */
export const llmDecisionSchema = z.object({
  verdict: z.enum(['AUTO_APPLY', 'REVIEW', 'SKIP']),
  matches: z.array(z.string()).max(6),
  risks: z.array(z.string()).max(6),
  unknowns: z.array(z.string()).max(6),
  reason: z.string().min(1).max(300),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
});

export interface DecisionLlmInput {
  profile: CandidateProfile;
  rules: DecisionRules;
  job: DecisionJobInput;
}

/** LLM 语义决策 Provider。 */
export interface DecisionLlmProvider {
  /** Provider / 模型展示名（如「DeepSeek deepseek-chat」）。 */
  readonly name: string;
  decide(input: DecisionLlmInput): Promise<LlmDecision>;
}
