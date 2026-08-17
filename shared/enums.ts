/**
 * 跨主进程 / 渲染进程共享的基础枚举与常量。
 * 使用字符串字面量联合类型（而非 TS enum），便于跨 CJS/ESM 边界稳定传递。
 */

/** 运行模式：测试模式仅允许模拟动作，正式模式未来才允许真实投递/发消息。 */
export type RunMode = 'TEST' | 'PRODUCTION';

/** 招聘平台标识。 */
export type PlatformType = 'BOSS' | 'ZHILIAN' | 'JOB51' | 'LIEPIN';

/** 平台连接状态。 */
export type PlatformStatus = 'DISCONNECTED' | 'CONNECTED' | 'COMING_SOON';

export const DEFAULT_RUN_MODE: RunMode = 'TEST';
