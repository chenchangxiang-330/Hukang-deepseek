/**
 * SQLite 连接与迁移。
 *
 * Offline First（§5）：所有核心数据先落本机，联网只是增强。
 * 数据库文件放在 App 私有目录，随 App 卸载一起删除。
 */

import * as SQLite from 'expo-sqlite';

import { CREATE_META_SQL, CREATE_TABLES_SQL, SCHEMA_VERSION } from './schema';

export const DATABASE_NAME = 'hukang.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * 迁移用 PRAGMA user_version 驱动，不依赖额外表。
 * 每次结构变更：SCHEMA_VERSION + 1，并在 migrations 里追加一段。
 */
async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  // 建表语句本身是幂等的（IF NOT EXISTS），第一版直接执行即可。
  await db.execAsync(CREATE_TABLES_SQL);
  await db.execAsync(CREATE_META_SQL);

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  const current = row?.user_version ?? 0;

  if (current < SCHEMA_VERSION) {
    // 后续版本的增量迁移写在这里。
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  }
}

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await migrate(db);
      return db;
    })().catch((error) => {
      // 打开失败时不要把坏的 Promise 缓存住，否则永远无法恢复
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

/** 测试与 Developer Mode 用：把当前库里的表列出来 */
export async function listTables(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name;`,
  );
  return rows.map((r) => r.name);
}

/** 仅供开发者面板：删除整库（普通用户界面不暴露） */
export async function resetDatabase(): Promise<void> {
  const db = await getDatabase();
  await db.execAsync(`
    DELETE FROM nutrition_logs;
    DELETE FROM inventory_items;
    DELETE FROM products;
  `);
}
