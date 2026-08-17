import type { PlatformAdapter, JobSearchQuery, JobDetail, ApplyResult, SendMessageResult } from '../base/PlatformAdapter';
import type { Job } from '../../core/matching';
import type { Message } from '../../core/messaging';

const NOT_IMPLEMENTED = 'BOSS 平台接入将在下一阶段实现。';

/**
 * BOSS直聘适配器占位实现。
 * V0.1 不执行任何真实 BOSS 操作；所有方法均返回空结果或抛错。
 */
export class BossAdapter implements PlatformAdapter {
  readonly platform = 'BOSS' as const;

  async searchJobs(_query: JobSearchQuery): Promise<Job[]> {
    return [];
  }

  async getJobDetail(_jobId: string): Promise<JobDetail | null> {
    return null;
  }

  async apply(_jobId: string, _resumeId: number): Promise<ApplyResult> {
    return { success: false, error: NOT_IMPLEMENTED };
  }

  async getMessages(): Promise<Message[]> {
    return [];
  }

  async sendMessage(_conversationId: string, _content: string): Promise<SendMessageResult> {
    return { success: false, error: NOT_IMPLEMENTED };
  }
}
