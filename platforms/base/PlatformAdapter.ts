import type { Job } from '../../core/matching';
import type { Message } from '../../core/messaging';
import type { PlatformType } from '../../shared/enums';

/** 岗位搜索查询参数。 */
export interface JobSearchQuery {
  keywords?: string[];
  cities?: string[];
  salaryMin?: number;
}

export interface JobDetail extends Job {
  description: string;
  requirements: string[];
}

export interface ApplyResult {
  success: boolean;
  externalId?: string;
  error?: string;
}

export interface SendMessageResult {
  success: boolean;
  error?: string;
}

/**
 * 招聘平台适配器统一接口。
 * 核心业务只依赖该接口，未来按平台分别实现 BossAdapter / ZhilianAdapter 等。
 */
export interface PlatformAdapter {
  readonly platform: PlatformType;

  searchJobs(query: JobSearchQuery): Promise<Job[]>;
  getJobDetail(jobId: string): Promise<JobDetail | null>;
  apply(jobId: string, resumeId: number): Promise<ApplyResult>;
  getMessages(): Promise<Message[]>;
  sendMessage(conversationId: string, content: string): Promise<SendMessageResult>;
}

/** 未来所有平台的适配器注册表类型。 */
export type PlatformAdapterMap = Partial<Record<PlatformType, PlatformAdapter>>;
