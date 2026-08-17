import { z } from 'zod';

/** 重要消息通知项。 */
export type NotificationTopic =
  | 'interview_invite'
  | 'phone_call'
  | 'salary_discussion'
  | 'offer'
  | 'ai_uncertain';

export type NotificationConfig = Record<NotificationTopic, boolean>;

export const NOTIFICATION_TOPICS: NotificationTopic[] = [
  'interview_invite',
  'phone_call',
  'salary_discussion',
  'offer',
  'ai_uncertain',
];

export const notificationConfigSchema = z.object({
  interview_invite: z.boolean(),
  phone_call: z.boolean(),
  salary_discussion: z.boolean(),
  offer: z.boolean(),
  ai_uncertain: z.boolean(),
});

export const DEFAULT_NOTIFICATIONS: NotificationConfig = {
  interview_invite: true,
  phone_call: true,
  salary_discussion: true,
  offer: true,
  ai_uncertain: true,
};
