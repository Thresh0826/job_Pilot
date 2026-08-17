/**
 * 求职 Agent 状态定义。
 * V0.1 不实现任何真实自动化，Agent 恒为 PAUSED，仅用于 Dashboard 展示与状态预留。
 */
export type AgentStatus = 'PAUSED' | 'RUNNING' | 'IDLE';

export const DEFAULT_AGENT_STATUS: AgentStatus = 'PAUSED';
