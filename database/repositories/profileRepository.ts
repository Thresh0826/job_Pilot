import { getDb } from '../database';
import type { UserProfile } from '../../core/profile';

export function getProfile(): UserProfile {
  const db = getDb();
  const row = db
    .prepare<[], { name: string; current_city: string }>(
      'SELECT name, current_city FROM user_profiles WHERE id = 1',
    )
    .get();
  const cities = db
    .prepare<[], { city: string }>('SELECT city FROM target_cities ORDER BY position, id')
    .all();

  return {
    name: row?.name ?? '',
    currentCity: row?.current_city ?? '',
    targetCities: cities.map((c) => c.city),
  };
}

export function saveProfile(profile: UserProfile): void {
  const db = getDb();
  db.prepare<[string, string]>(
    "UPDATE user_profiles SET name = ?, current_city = ?, updated_at = datetime('now') WHERE id = 1",
  ).run(profile.name, profile.currentCity);

  db.prepare('DELETE FROM target_cities').run();
  const insert = db.prepare<[string, number]>(
    'INSERT INTO target_cities (city, position) VALUES (?, ?)',
  );
  profile.targetCities.forEach((city, index) => insert.run(city, index));
}
