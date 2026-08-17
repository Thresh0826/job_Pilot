import { z } from 'zod';

/** AI 沟通权限模式：AUTO=AI 自动处理，ASK_USER=询问我。 */
export type AiPermissionMode = 'AUTO' | 'ASK_USER';

/** AI 可自动回复的话题。 */
export type AiTopic =
  | 'greeting'
  | 'location'
  | 'start_date'
  | 'resume_experience'
  | 'salary'
  | 'interview_time'
  | 'resignation_reason';

export type AiPermissionConfig = Record<AiTopic, AiPermissionMode>;

export const AI_TOPICS: AiTopic[] = [
  'greeting',
  'location',
  'start_date',
  'resume_experience',
  'salary',
  'interview_time',
  'resignation_reason',
];

export const aiPermissionSchema = z.object({
  greeting: z.enum(['AUTO', 'ASK_USER']),
  location: z.enum(['AUTO', 'ASK_USER']),
  start_date: z.enum(['AUTO', 'ASK_USER']),
  resume_experience: z.enum(['AUTO', 'ASK_USER']),
  salary: z.enum(['AUTO', 'ASK_USER']),
  interview_time: z.enum(['AUTO', 'ASK_USER']),
  resignation_reason: z.enum(['AUTO', 'ASK_USER']),
});

export const DEFAULT_AI_PERMISSIONS: AiPermissionConfig = {
  greeting: 'AUTO',
  location: 'AUTO',
  start_date: 'ASK_USER',
  resume_experience: 'AUTO',
  salary: 'ASK_USER',
  interview_time: 'ASK_USER',
  resignation_reason: 'ASK_USER',
};
