import { BOSS_CITY_CODES } from './data/city-codes';

/**
 * BOSS 城市码解析。
 * V0.3-A 使用本地静态城市码表；未知城市返回 null（= UNSUPPORTED_CITY），不做运行时同步。
 */
export class BossCityResolver {
  /** 城市名 → BOSS 城市码；未知返回 null。 */
  resolve(city: string): string | null {
    const name = city.trim();
    if (!name) return null;
    return BOSS_CITY_CODES[name] ?? null;
  }
}
