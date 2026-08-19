import type { Job, JobDetail } from '../../core/matching';

/** 解析详情页 URL：优先 jobUrl，否则由 platformJobId 构造。 */
export function resolveJobDetailUrl(job: Job): string | null {
  return (
    job.jobUrl ??
    (job.platformJobId ? `https://www.zhipin.com/job_detail/${job.platformJobId}.html` : null)
  );
}

/** Runtime.evaluate 从详情页提取的 DOM 数据。 */
export interface ExtractedBossDetail {
  jd: string;
  pageText: string;
  tags: string[];
  url: string;
}

/** 归一化 JD 文本：去「职位描述」头部标记、逐行去首尾空白、压缩多余空行。 */
export function normalizeJdText(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim());
  const withoutHeader = lines.filter((l) => l !== '职位描述');
  const normalized = withoutHeader
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  return normalized;
}

/**
 * 将详情页提取结果映射为 JobDetail。
 * 标题/公司/薪资/地点/经验/学历等使用 V0.3-A 列表的真实值；
 * jdText 与 jobLabels 来自真实详情页 DOM；缺失字段保持 undefined，不猜值。
 */
export function mapBossJobDetail(job: Job, extracted: ExtractedBossDetail): JobDetail {
  return {
    platform: 'BOSS',
    platformJobId: job.platformJobId,
    title: job.title,
    company: job.company,
    salary: job.salary,
    location: job.location,
    experience: job.experience,
    degree: job.degree,
    jdText: normalizeJdText(extracted.jd) || undefined,
    skills: job.skills,
    jobLabels: extracted.tags.length > 0 ? extracted.tags : job.jobLabels,
    welfare: job.welfare,
    recruiterName: job.recruiterName,
    recruiterTitle: job.recruiterTitle,
    recruiterActiveStatus: job.recruiterActiveStatus,
    jobUrl: job.jobUrl,
    sourceMetadata: job.sourceMetadata,
  };
}
