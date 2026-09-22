/**
 * 领域模型（产品需求 §45 / §46 / §47）
 *
 * 三张表对应三个概念，类型上也不合并。
 * 所有营养字段用 `number | null`：null = 包装未标注，绝不等于 0（§10 / §28）。
 */

/** 营养基准单位：每 100g / 每 100mL / 每份 / 每包装（§28） */
export type NutritionBasisUnit = 'g' | 'ml' | 'serving' | 'package';

export interface NutritionBasis {
  amount: number | null;
  unit: NutritionBasisUnit | null;
}

/**
 * 营养事实。字段名与包装上的项目一一对应。
 * energy_kj 与 energy_kcal 是两个独立字段：包装只写 kJ 时，
 * energy_kcal 保持 null，不做单位换算填充（§38：禁止用常识补缺失数据）。
 */
export interface NutritionFacts {
  energy_kcal: number | null;
  energy_kj: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbohydrate_g: number | null;
  total_sugar_g: number | null;
  added_sugar_g: number | null;
  fiber_g: number | null;
  sodium_mg: number | null;
}

export const EMPTY_NUTRITION_FACTS: NutritionFacts = {
  energy_kcal: null,
  energy_kj: null,
  protein_g: null,
  fat_g: null,
  carbohydrate_g: null,
  total_sugar_g: null,
  added_sugar_g: null,
  fiber_g: null,
  sodium_mg: null,
};

/** 商品数据来源，用于区分本地手动录入 / 联网数据 / 视觉识别 */
export type DataSource =
  | 'manual'
  | 'barcode_local'
  | 'barcode_online'
  | 'product_search'
  | 'vision'
  | 'seed';

export interface Product extends NutritionFacts {
  id: string;
  /** 条形码只是商品标识符，通常不含营养数据（§20） */
  barcode: string | null;
  brand: string | null;
  name: string;
  variant: string | null;
  quantity: string | null;
  category: string | null;
  image_uri: string | null;

  nutrition_basis_amount: number | null;
  nutrition_basis_unit: NutritionBasisUnit | null;

  ingredients_raw_text: string | null;
  /** 已经切成条目的配料列表 */
  ingredients_list: string[] | null;

  data_source: DataSource;
  created_at: string;
  updated_at: string;
  last_verified_at: string | null;
}

/** 我家里有什么（§46） */
export type StorageCondition = '常温' | '冷藏' | '冷冻' | null;

export interface InventoryItem {
  id: string;
  product_id: string;
  quantity: number | null;
  unit: string | null;
  purchase_date: string | null;
  production_date: string | null;
  expiry_date: string | null;
  /** 原始保质期文本，例如 “6个月”；由生产日期推算到期日时保留原文 */
  shelf_life: string | null;
  photo_uri: string | null;
  storage_condition: StorageCondition;
  created_at: string;
}

/** 库存紧急程度（§15） */
export type ExpiryStatus = 'expired' | 'today' | 'within3' | 'within7' | 'normal' | 'unknown';

export const EXPIRY_STATUS_ORDER: Record<ExpiryStatus, number> = {
  expired: 0,
  today: 1,
  within3: 2,
  within7: 3,
  normal: 4,
  unknown: 5,
};

/**
 * 摄入当时的营养快照（§13）。
 * 这份数据一旦写入就不再跟随 Product 变化，
 * 因此把展示所需的商品标识也一起固化下来。
 */
export interface NutritionSnapshot {
  productName: string;
  brand: string | null;
  /** 用户实际吃了多少 */
  amount: number;
  unit: string;
  /** 当时的营养基准（每 100g / 每份…） */
  basis: NutritionBasis;
  /** 当时商品包装上的原始营养值，按基准计 */
  nutrition: NutritionFacts;
  /**
   * 换算倍数。null 表示基准缺失或单位不匹配，无法可靠换算，
   * 此时 intakeNutrition 必须整份留空，UI 显示“未记录”。
   */
  scaleFactor: number | null;
  /** 实际摄入量（= nutrition × scaleFactor），已按用户吃的份量算好 */
  intakeNutrition: NutritionFacts;
  /** 快照生成时间，便于排查历史数据来源 */
  snapshotAt: string;
}

/** 我吃了什么（§47） */
export interface NutritionLog {
  id: string;
  product_id: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:mm */
  time: string;
  amount: number;
  unit: string;
  nutrition_snapshot: NutritionSnapshot;
  created_at: string;
}

/** 摄入量快捷选项（§13） */
export const AMOUNT_PRESETS = [0.25, 0.5, 0.75, 1] as const;
