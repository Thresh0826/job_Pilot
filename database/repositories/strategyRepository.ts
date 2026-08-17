import { getDb } from '../database';
import type { JobPreferences, JobTarget, TravelPreference, WeekendPreference } from '../../core/strategy';

function getStringList(table: string, column: string): string[] {
  const rows = getDb()
    .prepare<[], { value: string }>(`SELECT ${column} AS value FROM ${table} ORDER BY position, id`)
    .all();
  return rows.map((r) => r.value);
}

function saveStringList(table: string, column: string, values: string[]): void {
  const db = getDb();
  db.prepare(`DELETE FROM ${table}`).run();
  const insert = db.prepare<[string, number]>(
    `INSERT INTO ${table} (${column}, position) VALUES (?, ?)`,
  );
  values.forEach((value, index) => insert.run(value, index));
}

export function getJobTarget(): JobTarget {
  const db = getDb();
  const row = db
    .prepare<[], { min_salary: number | null; ideal_salary: number | null }>(
      'SELECT min_salary, ideal_salary FROM job_targets WHERE id = 1',
    )
    .get();

  return {
    positions: getStringList('job_target_positions', 'title'),
    minSalary: row?.min_salary ?? null,
    idealSalary: row?.ideal_salary ?? null,
    locations: getStringList('preferred_locations', 'city'),
    preferredIndustries: getStringList('preferred_industries', 'name'),
    excludedIndustries: getStringList('excluded_industries', 'name'),
    excludedKeywords: getStringList('excluded_keywords', 'keyword'),
  };
}

export function saveJobTarget(target: JobTarget): void {
  const db = getDb();
  db.prepare<[number | null, number | null]>(
    "UPDATE job_targets SET min_salary = ?, ideal_salary = ?, updated_at = datetime('now') WHERE id = 1",
  ).run(target.minSalary, target.idealSalary);

  saveStringList('job_target_positions', 'title', target.positions);
  saveStringList('preferred_locations', 'city', target.locations);
  saveStringList('preferred_industries', 'name', target.preferredIndustries);
  saveStringList('excluded_industries', 'name', target.excludedIndustries);
  saveStringList('excluded_keywords', 'keyword', target.excludedKeywords);
}

export function getJobPreferences(): JobPreferences {
  const db = getDb();
  const row = db
    .prepare<
      [],
      {
        weekend_preference: string;
        accept_sales: number;
        accept_outsourcing: number;
        travel_preference: string;
        max_commute_minutes: number;
        other_requirements: string;
      }
    >('SELECT * FROM job_preferences WHERE id = 1')
    .get();

  return {
    weekendPreference: (row?.weekend_preference as WeekendPreference) ?? 'PREFER_DOUBLE',
    acceptSales: (row?.accept_sales ?? 0) === 1,
    acceptOutsourcing: (row?.accept_outsourcing ?? 0) === 1,
    travelPreference: (row?.travel_preference as TravelPreference) ?? 'OCCASIONAL',
    maxCommuteMinutes: row?.max_commute_minutes ?? 40,
    companySizes: getStringList('preferred_company_sizes', 'range_label'),
    otherRequirements: row?.other_requirements ?? '',
  };
}

export function saveJobPreferences(preferences: JobPreferences): void {
  const db = getDb();
  db.prepare<[string, number, number, string, number, string]>(
    "UPDATE job_preferences SET weekend_preference = ?, accept_sales = ?, accept_outsourcing = ?, " +
      "travel_preference = ?, max_commute_minutes = ?, other_requirements = ?, updated_at = datetime('now') " +
      'WHERE id = 1',
  ).run(
    preferences.weekendPreference,
    preferences.acceptSales ? 1 : 0,
    preferences.acceptOutsourcing ? 1 : 0,
    preferences.travelPreference,
    preferences.maxCommuteMinutes,
    preferences.otherRequirements,
  );

  saveStringList('preferred_company_sizes', 'range_label', preferences.companySizes);
}
