/**
 * NutritionLog 仓储：我吃了什么（产品需求 §13 / §47 / §49）
 *
 * 核心规则：摄入记录保存的是“营养快照”。
 * 用户以后修改商品的营养数据，绝不能改写过去已经发生的饮食记录。
 */

import { getDatabase } from '../database';
import {
  NutritionBasis,
  NutritionFacts,
  NutritionLog,
  NutritionSnapshot,
  Product,
} from '../../domain/types';
import {
  AggregatedNutrition,
  aggregateNutrition,
  computeScaleFactor,
  scaleNutrition,
} from '../../domain/nutrition';
import { newId } from '../../utils/id';

interface LogRow {
  id: string;
  product_id: string;
  date: string;
  time: string;
  amount: number;
  unit: string;
  nutrition_snapshot: string;
  created_at: string;
}

function rowToLog(row: LogRow): NutritionLog {
  let snapshot: NutritionSnapshot;
  try {
    snapshot = JSON.parse(row.nutrition_snapshot) as NutritionSnapshot;
  } catch {
    // 数据损坏时给一个显式的空快照，绝不伪装成正常数据
    snapshot = {
      productName: '（快照损坏）',
      brand: null,
      amount: row.amount,
      unit: row.unit,
      basis: { amount: null, unit: null },
      nutrition: {} as NutritionFacts,
      scaleFactor: null,
      intakeNutrition: {} as NutritionFacts,
      snapshotAt: row.created_at,
    };
  }
  return {
    id: row.id,
    product_id: row.product_id,
    date: row.date,
    time: row.time,
    amount: row.amount,
    unit: row.unit,
    nutrition_snapshot: snapshot,
    created_at: row.created_at,
  };
}

/** 从商品当前数据生成快照。amount/unit 是用户实际吃的量。 */
export function buildSnapshot(product: Product, amount: number, unit: string): NutritionSnapshot {
  const basis: NutritionBasis = {
    amount: product.nutrition_basis_amount,
    unit: product.nutrition_basis_unit,
  };

  const nutrition: NutritionFacts = {
    energy_kcal: product.energy_kcal,
    energy_kj: product.energy_kj,
    protein_g: product.protein_g,
    fat_g: product.fat_g,
    carbohydrate_g: product.carbohydrate_g,
    total_sugar_g: product.total_sugar_g,
    added_sugar_g: product.added_sugar_g,
    fiber_g: product.fiber_g,
    sodium_mg: product.sodium_mg,
  };

  const scaleFactor = computeScaleFactor(basis, amount, unit);

  return {
    productName: product.name,
    brand: product.brand,
    amount,
    unit,
    basis,
    nutrition,
    scaleFactor,
    intakeNutrition: scaleNutrition(nutrition, scaleFactor),
    snapshotAt: new Date().toISOString(),
  };
}

export interface AddLogInput {
  product: Product;
  amount: number;
  unit: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm */
  time: string;
}

export async function addLog(input: AddLogInput): Promise<NutritionLog> {
  const db = await getDatabase();
  const id = newId();
  const createdAt = new Date().toISOString();
  const snapshot = buildSnapshot(input.product, input.amount, input.unit);

  await db.runAsync(
    `INSERT INTO nutrition_logs
       (id, product_id, date, time, amount, unit, nutrition_snapshot, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
    [
      id,
      input.product.id,
      input.date,
      input.time,
      input.amount,
      input.unit,
      JSON.stringify(snapshot),
      createdAt,
    ],
  );

  const created = await getLog(id);
  if (!created) throw new Error('摄入记录写入后读取失败');
  return created;
}

export async function getLog(id: string): Promise<NutritionLog | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<LogRow>('SELECT * FROM nutrition_logs WHERE id = ?;', [id]);
  return row ? rowToLog(row) : null;
}

/** 某一天的全部记录，按时间升序（§12 时间线顺序） */
export async function listLogsByDate(date: string): Promise<NutritionLog[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<LogRow>(
    'SELECT * FROM nutrition_logs WHERE date = ? ORDER BY time ASC, created_at ASC;',
    [date],
  );
  return rows.map(rowToLog);
}

/**
 * 修改份量 / 时间（§12）。
 *
 * 只改 amount 时，用快照里冻结的 basis 与 nutrition 重新换算，
 * 快照的商品营养值保持不变 —— 历史仍然不受商品数据变化影响。
 */
export async function updateLog(
  id: string,
  patch: { amount?: number; unit?: string; time?: string; date?: string },
): Promise<NutritionLog> {
  const db = await getDatabase();
  const current = await getLog(id);
  if (!current) throw new Error('摄入记录不存在');

  const nextAmount = patch.amount ?? current.amount;
  const nextUnit = patch.unit ?? current.unit;

  const snapshot = { ...current.nutrition_snapshot };
  if (patch.amount != null || patch.unit != null) {
    snapshot.amount = nextAmount;
    snapshot.unit = nextUnit;
    snapshot.scaleFactor = computeScaleFactor(snapshot.basis, nextAmount, nextUnit);
    snapshot.intakeNutrition = scaleNutrition(snapshot.nutrition, snapshot.scaleFactor);
  }

  await db.runAsync(
    'UPDATE nutrition_logs SET amount = ?, unit = ?, time = ?, date = ?, nutrition_snapshot = ? WHERE id = ?;',
    [
      nextAmount,
      nextUnit,
      patch.time ?? current.time,
      patch.date ?? current.date,
      JSON.stringify(snapshot),
      id,
    ],
  );

  const updated = await getLog(id);
  if (!updated) throw new Error('摄入记录更新后读取失败');
  return updated;
}

export async function deleteLog(id: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM nutrition_logs WHERE id = ?;', [id]);
}

export interface DayNutrition {
  date: string;
  logs: NutritionLog[];
  aggregated: AggregatedNutrition;
}

/**
 * 某一天的营养汇总（§49）。
 * 汇总基于快照，且保留 unknownCount —— 有未记录项时合计只是下限。
 */
export async function getDayNutrition(date: string): Promise<DayNutrition> {
  const logs = await listLogsByDate(date);
  const aggregated = aggregateNutrition(logs.map((l) => l.nutrition_snapshot.intakeNutrition));
  return { date, logs, aggregated };
}

export async function countLogs(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM nutrition_logs;');
  return row?.n ?? 0;
}
