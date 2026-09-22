/**
 * InventoryItem 仓储：我家里有什么。
 *
 * 只负责“库存”这一个概念（§44），商品事实一律回 Product 取。
 */

import { getDatabase } from '../database';
import { ExpiryStatus, EXPIRY_STATUS_ORDER, InventoryItem, Product, StorageCondition } from '../../domain/types';
import { computeExpiryStatus } from '../../domain/expiry';
import { ProductRow, rowToProduct } from './productRepo';
import { newId } from '../../utils/id';

interface InventoryRow {
  id: string;
  product_id: string;
  quantity: number | null;
  unit: string | null;
  purchase_date: string | null;
  production_date: string | null;
  expiry_date: string | null;
  shelf_life: string | null;
  photo_uri: string | null;
  storage_condition: string | null;
  created_at: string;
}

function rowToInventoryItem(row: InventoryRow): InventoryItem {
  return {
    id: row.id,
    product_id: row.product_id,
    quantity: row.quantity,
    unit: row.unit,
    purchase_date: row.purchase_date,
    production_date: row.production_date,
    expiry_date: row.expiry_date,
    shelf_life: row.shelf_life,
    photo_uri: row.photo_uri,
    storage_condition: (row.storage_condition as StorageCondition) ?? null,
    created_at: row.created_at,
  };
}

export interface InventoryEntry {
  item: InventoryItem;
  product: Product;
  status: ExpiryStatus;
  daysLeft: number | null;
}

export interface InventoryOverview {
  entries: InventoryEntry[];
  /** 需要处理：已过期 / 今天到期 / 3天内（§14、§15） */
  needAttentionCount: number;
  totalCount: number;
}

export type InventoryInput = Omit<InventoryItem, 'id' | 'created_at'>;

export async function createInventoryItem(input: InventoryInput): Promise<InventoryItem> {
  const db = await getDatabase();
  const id = newId();
  const createdAt = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO inventory_items
       (id, product_id, quantity, unit, purchase_date, production_date,
        expiry_date, shelf_life, photo_uri, storage_condition, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      id,
      input.product_id,
      input.quantity ?? null,
      input.unit ?? null,
      input.purchase_date ?? null,
      input.production_date ?? null,
      input.expiry_date ?? null,
      input.shelf_life ?? null,
      input.photo_uri ?? null,
      input.storage_condition ?? null,
      createdAt,
    ],
  );

  const created = await getInventoryItem(id);
  if (!created) throw new Error('库存写入后读取失败');
  return created;
}

export async function getInventoryItem(id: string): Promise<InventoryItem | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<InventoryRow>(
    'SELECT * FROM inventory_items WHERE id = ?;',
    [id],
  );
  return row ? rowToInventoryItem(row) : null;
}

export async function updateInventoryItem(
  id: string,
  patch: Partial<InventoryInput>,
): Promise<InventoryItem> {
  const db = await getDatabase();
  const columns = [
    'product_id',
    'quantity',
    'unit',
    'purchase_date',
    'production_date',
    'expiry_date',
    'shelf_life',
    'photo_uri',
    'storage_condition',
  ] as const;

  const sets: string[] = [];
  const values: unknown[] = [];
  for (const column of columns) {
    if (column in patch) {
      sets.push(`${column} = ?`);
      values.push((patch as Record<string, unknown>)[column] ?? null);
    }
  }
  if (sets.length === 0) {
    const current = await getInventoryItem(id);
    if (!current) throw new Error('库存不存在');
    return current;
  }

  values.push(id);
  await db.runAsync(`UPDATE inventory_items SET ${sets.join(', ')} WHERE id = ?;`, values as never[]);

  const updated = await getInventoryItem(id);
  if (!updated) throw new Error('库存更新后读取失败');
  return updated;
}

export async function deleteInventoryItem(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM inventory_items WHERE id = ?;', [id]);
}

/**
 * 库存总览：按紧急程度排序（§15）。
 * 先取库存行，再一次性取回相关商品，避免 JOIN 后列名冲突。
 */
export async function listInventoryOverview(today: Date = new Date()): Promise<InventoryOverview> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<InventoryRow>('SELECT * FROM inventory_items;');
  const items = rows.map(rowToInventoryItem);

  const productIds = Array.from(new Set(items.map((i) => i.product_id)));
  const productMap = new Map<string, Product>();
  if (productIds.length > 0) {
    const placeholders = productIds.map(() => '?').join(', ');
    const productRows = await db.getAllAsync<ProductRow>(
      `SELECT * FROM products WHERE id IN (${placeholders});`,
      productIds,
    );
    for (const row of productRows) {
      productMap.set(row.id, rowToProduct(row));
    }
  }

  const entries: InventoryEntry[] = [];
  for (const item of items) {
    const product = productMap.get(item.product_id);
    // 商品被删除时外键会级联清理库存；这里再兜一层，避免脏数据导致崩溃
    if (!product) continue;
    const { status, daysLeft } = computeExpiryStatus(item.expiry_date, today);
    entries.push({ item, product, status, daysLeft });
  }

  entries.sort((a, b) => {
    const orderDiff = EXPIRY_STATUS_ORDER[a.status] - EXPIRY_STATUS_ORDER[b.status];
    if (orderDiff !== 0) return orderDiff;
    const aDays = a.daysLeft ?? Number.MAX_SAFE_INTEGER;
    const bDays = b.daysLeft ?? Number.MAX_SAFE_INTEGER;
    if (aDays !== bDays) return aDays - bDays;
    return a.product.name.localeCompare(b.product.name, 'zh-Hans-CN');
  });

  const needAttentionCount = entries.filter(
    (e) => e.status === 'expired' || e.status === 'today' || e.status === 'within3',
  ).length;

  return { entries, needAttentionCount, totalCount: entries.length };
}
