import { getDb } from '../database';
import { AI_TOPICS, type AiPermissionConfig, type AiPermissionMode } from '../../core/ai';
import { NOTIFICATION_TOPICS, type NotificationConfig } from '../../core/notification';

export function getAiPermissions(): AiPermissionConfig {
  const rows = getDb()
    .prepare<[], { topic: string; mode: string }>('SELECT topic, mode FROM ai_permissions')
    .all();

  const map = new Map(rows.map((r) => [r.topic, r.mode as AiPermissionMode]));
  return AI_TOPICS.reduce<AiPermissionConfig>((acc, topic) => {
    acc[topic] = map.get(topic) ?? 'ASK_USER';
    return acc;
  }, {} as AiPermissionConfig);
}

export function saveAiPermissions(config: AiPermissionConfig): void {
  const db = getDb();
  const upsert = db.prepare<[string, AiPermissionMode]>(
    'INSERT INTO ai_permissions (topic, mode) VALUES (?, ?) ' +
      'ON CONFLICT(topic) DO UPDATE SET mode = excluded.mode',
  );
  for (const topic of AI_TOPICS) {
    upsert.run(topic, config[topic]);
  }
}

export function getNotifications(): NotificationConfig {
  const rows = getDb()
    .prepare<[], { topic: string; enabled: number }>(
      'SELECT topic, enabled FROM notification_preferences',
    )
    .all();

  const map = new Map(rows.map((r) => [r.topic, r.enabled === 1]));
  return NOTIFICATION_TOPICS.reduce<NotificationConfig>((acc, topic) => {
    acc[topic] = map.get(topic) ?? true;
    return acc;
  }, {} as NotificationConfig);
}

export function saveNotifications(config: NotificationConfig): void {
  const db = getDb();
  const upsert = db.prepare<[string, number]>(
    'INSERT INTO notification_preferences (topic, enabled) VALUES (?, ?) ' +
      'ON CONFLICT(topic) DO UPDATE SET enabled = excluded.enabled',
  );
  for (const topic of NOTIFICATION_TOPICS) {
    upsert.run(topic, config[topic] ? 1 : 0);
  }
}
