import { getDb } from '../database';
import { DEFAULT_RUN_MODE, type PlatformStatus, type PlatformType, type RunMode } from '../../shared/enums';
import type { PlatformAccountState } from '../../shared/settings';

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

export function getPlatformState(): PlatformAccountState {
  const rows = getDb()
    .prepare<[], { platform: string; status: string }>(
      'SELECT platform, status FROM platform_accounts ORDER BY id',
    )
    .all();

  const boss = rows.find((r) => r.platform === 'BOSS');
  return {
    boss: (boss?.status as PlatformStatus) ?? 'DISCONNECTED',
  };
}

export function setPlatformStatus(platform: PlatformType, status: PlatformStatus): void {
  const connectedAt = status === 'CONNECTED' ? new Date().toISOString() : null;
  getDb()
    .prepare<[PlatformType, PlatformStatus, string | null]>(
      'INSERT INTO platform_accounts (platform, status, connected_at) VALUES (?, ?, ?) ' +
        'ON CONFLICT(platform) DO UPDATE SET status = excluded.status, connected_at = excluded.connected_at',
    )
    .run(platform, status, connectedAt);
}
