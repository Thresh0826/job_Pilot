import type { Job, JobDetailResult, JobSearchQuery, JobSearchResult } from '../../core/matching';
import type { Message } from '../../core/messaging';
import type { PlatformType } from '../../shared/enums';

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

  searchJobs(query: JobSearchQuery): Promise<JobSearchResult>;
  getJobDetail(job: Job): Promise<JobDetailResult>;
  apply(jobId: string, resumeId: number): Promise<ApplyResult>;
  getMessages(): Promise<Message[]>;
  sendMessage(conversationId: string, content: string): Promise<SendMessageResult>;
}

/** 未来所有平台的适配器注册表类型。 */
export type PlatformAdapterMap = Partial<Record<PlatformType, PlatformAdapter>>;
