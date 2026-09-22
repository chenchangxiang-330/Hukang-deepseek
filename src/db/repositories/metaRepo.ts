/**
 * 应用级键值设置。
 *
 * 用 SQLite 的 app_meta 表而不是额外引入存储库：
 * 项目里已经有数据库，少一个依赖就少一处不一致。
 * 注意：这里只放设置开关，不放商品/库存/摄入数据（§44 三概念分离）。
 */

import { getDatabase } from '../database';

export const META_KEYS = {
  /** 是否已开启开发者模式（§55） */
  developerMode: 'developer_mode',
  /** 是否允许联网增强识别（§37） */
  onlineVisionAllowed: 'online_vision_allowed',
  /** 是否已经问过联网识别授权 */
  onlineVisionAsked: 'online_vision_asked',
  /** 临期通知开关（§16） */
  expiryNotificationEnabled: 'expiry_notification_enabled',
} as const;

export async function getMeta(key: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string | null }>(
    'SELECT value FROM app_meta WHERE key = ?;',
    [key],
  );
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string | null): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO app_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    [key, value],
  );
}

export async function getMetaBoolean(key: string, fallback = false): Promise<boolean> {
  const value = await getMeta(key);
  if (value == null) return fallback;
  return value === 'true';
}

export async function setMetaBoolean(key: string, value: boolean): Promise<void> {
  await setMeta(key, value ? 'true' : 'false');
}
