/**
 * Product 仓储：商品身份与营养事实。
 *
 * 本地优先（§22）：联网查到的商品一旦被用户确认就落库，
 * 第二次直接命中本地，断网也能打开已经认识过的商品。
 */

import { getDatabase } from '../database';
import {
  DataSource,
  NutritionBasisUnit,
  Product,
} from '../../domain/types';
import { newId } from '../../utils/id';

export interface ProductRow {
  id: string;
  barcode: string | null;
  brand: string | null;
  name: string;
  variant: string | null;
  quantity: string | null;
  category: string | null;
  image_uri: string | null;
  nutrition_basis_amount: number | null;
  nutrition_basis_unit: string | null;
  energy_kcal: number | null;
  energy_kj: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbohydrate_g: number | null;
  total_sugar_g: number | null;
  added_sugar_g: number | null;
  fiber_g: number | null;
  sodium_mg: number | null;
  ingredients_raw_text: string | null;
  ingredients_json: string | null;
  data_source: string;
  created_at: string;
  updated_at: string;
  last_verified_at: string | null;
}

function parseIngredients(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === 'string');
    }
    return null;
  } catch {
    // 数据损坏时不静默当成“没有配料”，返回 null 由 UI 显示未记录
    return null;
  }
}

export function rowToProduct(row: ProductRow): Product {
  return {
    id: row.id,
    barcode: row.barcode,
    brand: row.brand,
    name: row.name,
    variant: row.variant,
    quantity: row.quantity,
    category: row.category,
    image_uri: row.image_uri,
    nutrition_basis_amount: row.nutrition_basis_amount,
    nutrition_basis_unit: (row.nutrition_basis_unit as NutritionBasisUnit | null) ?? null,
    energy_kcal: row.energy_kcal,
    energy_kj: row.energy_kj,
    protein_g: row.protein_g,
    fat_g: row.fat_g,
    carbohydrate_g: row.carbohydrate_g,
    total_sugar_g: row.total_sugar_g,
    added_sugar_g: row.added_sugar_g,
    fiber_g: row.fiber_g,
    sodium_mg: row.sodium_mg,
    ingredients_raw_text: row.ingredients_raw_text,
    ingredients_list: parseIngredients(row.ingredients_json),
    data_source: row.data_source as DataSource,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_verified_at: row.last_verified_at,
  };
}

export type ProductInput = Partial<
  Omit<Product, 'id' | 'created_at' | 'updated_at' | 'ingredients_list'>
> & {
  name: string;
  ingredients_list?: string[] | null;
};

/** 可写列，供 INSERT / UPDATE 复用 */
const WRITABLE_COLUMNS = [
  'barcode',
  'brand',
  'name',
  'variant',
  'quantity',
  'category',
  'image_uri',
  'nutrition_basis_amount',
  'nutrition_basis_unit',
  'energy_kcal',
  'energy_kj',
  'protein_g',
  'fat_g',
  'carbohydrate_g',
  'total_sugar_g',
  'added_sugar_g',
  'fiber_g',
  'sodium_mg',
  'ingredients_raw_text',
  'data_source',
] as const;

function toColumnValue(input: ProductInput, column: (typeof WRITABLE_COLUMNS)[number]): unknown {
  if (column === 'ingredients_raw_text') {
    return input.ingredients_raw_text ?? null;
  }
  const value = (input as Record<string, unknown>)[column];
  if (value === undefined) return null;
  return value;
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const id = newId();

  const columns = [...WRITABLE_COLUMNS, 'ingredients_json', 'id', 'created_at', 'updated_at'];
  const values: unknown[] = [
    ...WRITABLE_COLUMNS.map((c) => toColumnValue(input, c)),
    input.ingredients_list ? JSON.stringify(input.ingredients_list) : null,
    id,
    now,
    now,
  ];

  await db.runAsync(
    `INSERT INTO products (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')});`,
    values as never[],
  );

  const created = await getProduct(id);
  if (!created) throw new Error('商品写入后读取失败');
  return created;
}

const SELECT_ALL = 'SELECT * FROM products';

export async function getProduct(id: string): Promise<Product | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ProductRow>(`${SELECT_ALL} WHERE id = ?;`, [id]);
  return row ? rowToProduct(row) : null;
}

/** 条形码查询：本地第一步（§19 扫描逻辑的第一步） */
export async function findProductByBarcode(barcode: string): Promise<Product | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ProductRow>(
    `${SELECT_ALL} WHERE barcode = ? LIMIT 1;`,
    [barcode],
  );
  return row ? rowToProduct(row) : null;
}

export async function listProducts(limit = 50, offset = 0): Promise<Product[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ProductRow>(
    `${SELECT_ALL} ORDER BY updated_at DESC LIMIT ? OFFSET ?;`,
    [limit, offset],
  );
  return rows.map(rowToProduct);
}

export async function countProducts(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM products;');
  return row?.n ?? 0;
}

export async function searchProductsByName(keyword: string, limit = 30): Promise<Product[]> {
  const db = await getDatabase();
  const like = `%${keyword.trim()}%`;
  const rows = await db.getAllAsync<ProductRow>(
    `${SELECT_ALL} WHERE name LIKE ? OR brand LIKE ? OR barcode LIKE ?
     ORDER BY updated_at DESC LIMIT ?;`,
    [like, like, like, limit],
  );
  return rows.map(rowToProduct);
}

export async function updateProduct(id: string, patch: ProductInput): Promise<Product> {
  const db = await getDatabase();
  const sets: string[] = [];
  const values: unknown[] = [];

  for (const column of WRITABLE_COLUMNS) {
    if (column === 'ingredients_raw_text') {
      if ('ingredients_raw_text' in patch) {
        sets.push('ingredients_raw_text = ?');
        values.push(patch.ingredients_raw_text ?? null);
      }
      continue;
    }
    if (column in patch) {
      sets.push(`${column} = ?`);
      values.push((patch as Record<string, unknown>)[column] ?? null);
    }
  }

  if ('ingredients_list' in patch) {
    sets.push('ingredients_json = ?');
    values.push(patch.ingredients_list ? JSON.stringify(patch.ingredients_list) : null);
  }

  // 用户手工修正过的商品，标记为人工来源并刷新校验时间
  sets.push('data_source = ?', 'updated_at = ?', 'last_verified_at = ?');
  values.push(patch.data_source ?? 'manual', new Date().toISOString(), new Date().toISOString());
  values.push(id);

  await db.runAsync(`UPDATE products SET ${sets.join(', ')} WHERE id = ?;`, values as never[]);

  const updated = await getProduct(id);
  if (!updated) throw new Error('商品更新后读取失败');
  return updated;
}

/**
 * 按条形码写入或更新（联网查到并确认后调用，§22）。
 */
export async function upsertProductByBarcode(
  barcode: string,
  input: ProductInput,
): Promise<Product> {
  const existing = await findProductByBarcode(barcode);
  if (existing) {
    return updateProduct(existing.id, { ...input, barcode });
  }
  return createProduct({ ...input, barcode });
}

export async function deleteProduct(id: string): Promise<void> {
  const db = await getDatabase();
  // 外键 ON DELETE CASCADE 会一并清除该商品的库存与摄入记录
  await db.runAsync('DELETE FROM products WHERE id = ?;', [id]);
}
