import type { Job } from '../../core/matching';

/**
 * BOSS joblist.json 原始条目。
 * 字段语义以真实响应为准（V0.3-A 人工验收时校准）；数据没有则保持 undefined，禁止猜值。
 */
export interface RawBossJobItem {
  jobName?: unknown;
  salaryDesc?: unknown;
  cityName?: unknown;
  areaDistrict?: unknown;
  businessDistrict?: unknown;
  jobExperience?: unknown;
  jobDegree?: unknown;
  brandName?: unknown;
  brandScaleName?: unknown;
  brandStageName?: unknown;
  brandIndustry?: unknown;
  jobLabels?: unknown;
  skills?: unknown;
  welfareList?: unknown;
  bossName?: unknown;
  bossTitle?: unknown;
  bossActiveStatus?: unknown;
  securityId?: unknown;
  lid?: unknown;
  encryptJobId?: unknown;
  encryptBossId?: unknown;
  encryptBrandId?: unknown;
}

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;

const strOrNum = (v: unknown): string | undefined =>
  typeof v === 'number' ? String(v) : str(v);

const strList = (v: unknown): string[] | undefined => {
  if (!Array.isArray(v)) return undefined;
  const items = v.filter((x): x is string => typeof x === 'string' && x.length > 0);
  return items.length > 0 ? items : undefined;
};

/** 将 BOSS joblist 条目映射为 JobPilot 统一 Job 模型。 */
export function mapBossJob(raw: RawBossJobItem): Job | null {
  if (!raw || typeof raw !== 'object') return null;

  const encryptJobId = str(raw.encryptJobId);
  const encryptBrandId = str(raw.encryptBrandId);
  const city = str(raw.cityName);
  const district = str(raw.areaDistrict);
  const businessDistrict = str(raw.businessDistrict);
  const location = [city, district, businessDistrict].filter(Boolean).join('·');

  const metadata: Record<string, string> = {};
  for (const [key, value] of Object.entries({
    securityId: raw.securityId,
    lid: raw.lid,
    encryptJobId: raw.encryptJobId,
    encryptBossId: raw.encryptBossId,
    encryptBrandId: raw.encryptBrandId,
  })) {
    const s = str(value);
    if (s) metadata[key] = s;
  }

  return {
    id: encryptJobId ?? str(raw.lid) ?? '',
    platform: 'BOSS',
    platformJobId: encryptJobId,
    title: str(raw.jobName) ?? '',
    company: str(raw.brandName) ?? '',
    salary: str(raw.salaryDesc),
    location,
    city,
    district,
    businessDistrict,
    industry: str(raw.brandIndustry),
    experience: str(raw.jobExperience),
    degree: str(raw.jobDegree),
    companySize: str(raw.brandScaleName),
    companyStage: str(raw.brandStageName),
    jobLabels: strList(raw.jobLabels),
    skills: strList(raw.skills),
    welfare: strList(raw.welfareList),
    recruiterName: str(raw.bossName),
    recruiterTitle: str(raw.bossTitle),
    recruiterActiveStatus: strOrNum(raw.bossActiveStatus),
    jobUrl: encryptJobId ? `https://www.zhipin.com/job_detail/${encryptJobId}.html` : undefined,
    companyUrl: encryptBrandId ? `https://www.zhipin.com/gongsi/${encryptBrandId}.html` : undefined,
    sourceMetadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

/** 从捕获的 joblist 响应 JSON 提取统一 Job 列表（丢弃缺少 title/company 的畸形条目）。 */
export function mapBossJoblist(data: unknown): Job[] {
  if (!data || typeof data !== 'object') return [];
  const jobList = (data as { zpData?: { jobList?: unknown } }).zpData?.jobList;
  if (!Array.isArray(jobList)) return [];
  return jobList
    .map((item) => mapBossJob(item as RawBossJobItem))
    .filter((job): job is Job => job !== null && job.title !== '' && job.company !== '');
}
