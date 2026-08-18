import { getDb } from '../database';
import {
  DEFAULT_RUN_MODE,
  type PlatformStatus,
  type RunMode,
} from '../../shared/enums';
import type { BossPlatformStatus, PlatformAccountState } from '../../shared/settings';

function getSetting(key: string): string | null {
  const row = getDb()
    .prepare<[string], { value: string }>('SELECT value FROM app_settings WHERE key = ?')
    .get(key);
  return row ? row.value : null;
}

function setSetting(key: string, value: string): void {
  getDb()
    .prepare<[string, string]>(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    )
    .run(key, value);
}

export function getOnboardingCompleted(): boolean {
  return getSetting('onboarding_completed') === '1';
}

export function setOnboardingCompleted(completed: boolean): void {
  setSetting('onboarding_completed', completed ? '1' : '0');
}

export function getRunMode(): RunMode {
  const value = getSetting('run_mode');
  return value === 'PRODUCTION' ? 'PRODUCTION' : DEFAULT_RUN_MODE;
}

export function setRunMode(mode: RunMode): void {
  setSetting('run_mode', mode);
}

/** 读取 BOSS 平台最近已知状态与时间元数据。 */
export function getBossPlatformStatus(): BossPlatformStatus {
  const row = getDb()
    .prepare<[], { status: string; connected_at: string | null; last_checked_at: string | null }>(
      "SELECT status, connected_at, last_checked_at FROM platform_accounts WHERE platform = 'BOSS'",
    )
    .get();

  return {
    status: (row?.status as PlatformStatus) ?? 'DISCONNECTED',
    lastConnectedAt: row?.connected_at ?? null,
    lastCheckedAt: row?.last_checked_at ?? null,
  };
}

/**
 * 持久化 BOSS 最近已知状态。
 * 仅用于 DISCONNECTED / CONNECTED / EXPIRED / ERROR，CONNECTING 为瞬时状态不落库。
 */
export function saveBossPlatformStatus(status: PlatformStatus): void {
  const now = new Date().toISOString();
  const existing = getBossPlatformStatus();

  const lastConnectedAt =
    status === 'CONNECTED'
      ? existing.lastConnectedAt ?? now
      : status === 'DISCONNECTED'
        ? null
        : existing.lastConnectedAt;

  getDb()
    .prepare<[string, string | null, string | null]>(
      "INSERT INTO platform_accounts (platform, status, connected_at, last_checked_at) " +
        "VALUES ('BOSS', ?, ?, ?) ON CONFLICT(platform) DO UPDATE SET " +
        'status = excluded.status, connected_at = excluded.connected_at, last_checked_at = excluded.last_checked_at',
    )
    .run(status, lastConnectedAt, now);
}

/** 供设置快照使用：仅返回 boss 最近已知状态。 */
export function getPlatformState(): PlatformAccountState {
  return { boss: getBossPlatformStatus().status };
}
