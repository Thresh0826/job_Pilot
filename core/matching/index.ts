import type { PlatformType } from '../../shared/enums';

/**
 * JobPilot 统一岗位模型（V0.3-A 起承载真实平台数据）。
 * 字段来自各平台适配器的标准化映射；数据没有则保持 null / undefined，禁止猜值。
 */
export interface Job {
  /** 本地展示用 id（V0.1 mock 使用；真实岗位使用 platformJobId）。 */
  id: string;
  platform: PlatformType;
  /** 平台侧岗位 id（BOSS：encryptJobId）。 */
  platformJobId?: string;
  title: string;
  /** 公司名称。 */
  company: string;
  /** 展示用薪资文本，例如 "6-8K"；平台未提供（隐藏薪资）时为 undefined。 */
  salary?: string;
  salaryMin?: number;
  salaryMax?: number;
  /** 展示用地点（city·district·businessDistrict 组合）。 */
  location: string;
  city?: string;
  /** 区/县。 */
  district?: string;
  /** 商圈。 */
  businessDistrict?: string;
  industry?: string;
  /** 经验要求（如 "经验不限"）。 */
  experience?: string;
  /** 学历要求（如 "本科"）。 */
  degree?: string;
  /** 公司规模（如 "100-499人"）。 */
  companySize?: string;
  /** 公司融资阶段（如 "已上市"）。 */
  companyStage?: string;
  /** 岗位标签。 */
  jobLabels?: string[];
  /** 技能。 */
  skills?: string[];
  /** 福利。 */
  welfare?: string[];
  /** 招聘者姓名。 */
  recruiterName?: string;
  /** 招聘者职位。 */
  recruiterTitle?: string;
  /** 招聘者活跃状态。 */
  recruiterActiveStatus?: string;
  /** 岗位详情链接。 */
  jobUrl?: string;
  /** 公司链接。 */
  companyUrl?: string;
  /** 匹配度 0-100。 */
  matchScore?: number;
  tags?: string[];
  postedAt?: string;
  /** JobPilot 推荐摘要。 */
  aiSummary?: string;
  /** 平台侧后续流程所需的非敏感元数据（securityId / lid / encryptJobId / encryptBossId / encryptBrandId 等）。 */
  sourceMetadata?: Record<string, string>;
}

/** 岗位搜索结果状态。 */
export type JobSearchStatus =
  | 'SUCCESS'
  | 'NOT_CONNECTED'
  | 'LOGIN_EXPIRED'
  | 'SECURITY_RESTRICTED'
  | 'SEARCH_TIMEOUT'
  | 'INVALID_RESPONSE'
  | 'CDP_DISCONNECTED'
  | 'UNSUPPORTED_CITY';

/** 岗位搜索查询参数（V0.3-A：单关键词 + 单城市；V0.3-C1：可选多批限制）。 */
export interface JobSearchQuery {
  keyword: string;
  city: string;
  /** C1：单次搜索最多捕获岗位数（含去重）。缺省由实现保守决定。 */
  maxJobs?: number;
  /** C1：单次搜索最多加载批次（首批 = 1）。缺省由实现保守决定。 */
  maxBatches?: number;
}

/** 岗位搜索结果（V0.3-A：一次搜索的首批岗位；V0.3-C1：多批累积 + 去重）。 */
export interface JobSearchResult {
  status: JobSearchStatus;
  jobs: Job[];
  message?: string;
  /** C1：实际加载的批次数量（首批 = 1；未加载到任何批次为 0）。 */
  batchesLoaded?: number;
  /** C1：平台是否还有更多批次（受 maxJobs/maxBatches/超时限制而停止时为上一次已知值）。 */
  hasMore?: boolean;
}

/** 岗位详情（V0.3-B：单个岗位真实 JD）。字段只有页面真实存在时才填，缺失为 undefined。 */
export interface JobDetail {
  platform: PlatformType;
  platformJobId?: string;
  title: string;
  company?: string;
  salary?: string;
  location?: string;
  experience?: string;
  degree?: string;
  /** 真实完整职位描述（关键验收字段）。 */
  jdText?: string;
  skills?: string[];
  jobLabels?: string[];
  welfare?: string[];
  recruiterName?: string;
  recruiterTitle?: string;
  recruiterActiveStatus?: string;
  jobUrl?: string;
  sourceMetadata?: Record<string, string>;
}

/** 岗位详情读取状态。 */
export type JobDetailStatus =
  | 'SUCCESS'
  | 'NOT_CONNECTED'
  | 'LOGIN_EXPIRED'
  | 'SECURITY_RESTRICTED'
  | 'DETAIL_TIMEOUT'
  | 'DETAIL_PARSE_FAILED'
  | 'CDP_DISCONNECTED';

/** 岗位详情结果。 */
export interface JobDetailResult {
  status: JobDetailStatus;
  detail: JobDetail | null;
  message?: string;
}
