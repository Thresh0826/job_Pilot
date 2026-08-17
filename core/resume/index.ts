import { z } from 'zod';

/** 简历记录：V0.1 仅做文件选择、复制、路径管理与展示，不做解析。 */
export interface ResumeRecord {
  id: number;
  /** 用户原始文件名。 */
  originalName: string;
  /** 复制到应用数据目录后的文件名。 */
  storedName: string;
  /** 应用数据目录内的绝对路径。 */
  filePath: string;
  /** 文件大小（字节）。 */
  fileSize: number;
  /** MIME 类型。 */
  mimeType: string;
  /** 创建时间（ISO 字符串）。 */
  createdAt: string;
}

export const resumeRecordSchema = z.object({
  id: z.number(),
  originalName: z.string(),
  storedName: z.string(),
  filePath: z.string(),
  fileSize: z.number(),
  mimeType: z.string(),
  createdAt: z.string(),
});
