import { z } from 'zod';

/** 周末偏好。 */
export type WeekendPreference = 'MUST_DOUBLE' | 'PREFER_DOUBLE' | 'SINGLE_OK';

/** 出差偏好。 */
export type TravelPreference = 'NONE' | 'OCCASIONAL' | 'ACCEPT';

/** 求职目标（Step 3）。 */
export interface JobTarget {
  /** 目标岗位，多选。 */
  positions: string[];
  /** 最低可接受薪资（整数，元/月）。 */
  minSalary: number | null;
  /** 理想薪资（整数，元/月）。 */
  idealSalary: number | null;
  /** 工作地点，多选。 */
  locations: string[];
  /** 行业偏好，多个。 */
  preferredIndustries: string[];
  /** 排除行业，多个。 */
  excludedIndustries: string[];
  /** 排除岗位关键词。 */
  excludedKeywords: string[];
}

/** 工作偏好（Step 4）。 */
export interface JobPreferences {
  weekendPreference: WeekendPreference;
  /** 是否接受销售。 */
  acceptSales: boolean;
  /** 是否接受外包 / 劳务派遣。 */
  acceptOutsourcing: boolean;
  travelPreference: TravelPreference;
  /** 最大通勤时间（分钟）。 */
  maxCommuteMinutes: number;
  /** 公司规模偏好，多选。 */
  companySizes: string[];
  /** 其他要求（自由文本）。 */
  otherRequirements: string;
}

export const jobTargetSchema = z.object({
  positions: z.array(z.string()),
  minSalary: z.number().int().nonnegative().nullable(),
  idealSalary: z.number().int().nonnegative().nullable(),
  locations: z.array(z.string()),
  preferredIndustries: z.array(z.string()),
  excludedIndustries: z.array(z.string()),
  excludedKeywords: z.array(z.string()),
});

export const jobPreferencesSchema = z.object({
  weekendPreference: z.enum(['MUST_DOUBLE', 'PREFER_DOUBLE', 'SINGLE_OK']),
  acceptSales: z.boolean(),
  acceptOutsourcing: z.boolean(),
  travelPreference: z.enum(['NONE', 'OCCASIONAL', 'ACCEPT']),
  maxCommuteMinutes: z.number().int().nonnegative(),
  companySizes: z.array(z.string()),
  otherRequirements: z.string(),
});

export const EMPTY_JOB_TARGET: JobTarget = {
  positions: [],
  minSalary: null,
  idealSalary: null,
  locations: [],
  preferredIndustries: [],
  excludedIndustries: [],
  excludedKeywords: [],
};

export const DEFAULT_JOB_PREFERENCES: JobPreferences = {
  weekendPreference: 'PREFER_DOUBLE',
  acceptSales: false,
  acceptOutsourcing: false,
  travelPreference: 'OCCASIONAL',
  maxCommuteMinutes: 40,
  companySizes: [],
  otherRequirements: '',
};
