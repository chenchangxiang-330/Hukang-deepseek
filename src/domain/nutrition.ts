/**
 * 营养计算：纯函数，无 IO，可直接在 Mac 上做单元测试（测试策略第一层）。
 *
 * 三条铁律（产品需求 §10 / §13 / §28）：
 *   1. null 与 0 语义不同。包装没标 = null，绝不当成 0，也绝不用 carbohydrate 推导 added_sugar。
 *   2. 历史摄入来自写入当时的快照，不随商品数据变化。
 *   3. 无法可靠换算时，宁可留空（未记录），也不猜。
 */

import {
  NutritionBasis,
  NutritionFacts,
  NutritionBasisUnit,
  EMPTY_NUTRITION_FACTS,
} from './types';

export const NUTRITION_FIELDS = [
  'energy_kcal',
  'energy_kj',
  'protein_g',
  'fat_g',
  'carbohydrate_g',
  'total_sugar_g',
  'added_sugar_g',
  'fiber_g',
  'sodium_mg',
] as const;

export type NutritionField = (typeof NUTRITION_FIELDS)[number];

/** 把用户/包装上的单位写法归一到基准单位 */
const UNIT_ALIASES: Record<string, NutritionBasisUnit> = {
  g: 'g',
  gram: 'g',
  grams: 'g',
  克: 'g',
  ml: 'ml',
  mL: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  毫升: 'ml',
  serving: 'serving',
  份: 'serving',
  package: 'package',
  包: 'package',
  袋: 'package',
  盒: 'package',
  瓶: 'package',
  罐: 'package',
};

export function normalizeUnit(unit: string | null | undefined): NutritionBasisUnit | null {
  if (!unit) return null;
  return UNIT_ALIASES[unit.trim()] ?? null;
}

/**
 * 计算“吃了 amount 个 unit”相对于营养基准的倍数。
 *
 * 返回 null 表示无法可靠换算 —— 调用方必须把摄入营养显示为“未记录”，
 * 而不是按倍数 1 假装算出来了。
 */
export function computeScaleFactor(
  basis: NutritionBasis,
  amount: number,
  unit: string | null | undefined,
): number | null {
  if (basis.amount == null || basis.amount <= 0) return null;
  const basisUnit = basis.unit;
  if (!basisUnit) return null;

  const eatenUnit = normalizeUnit(unit ?? null);
  if (!eatenUnit) return null;

  if (eatenUnit !== basisUnit) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return amount / basis.amount;
}

/** 保留合理精度：能量取整，其余保留 1 位小数 */
function roundField(field: NutritionField, value: number): number {
  if (field === 'energy_kcal' || field === 'energy_kj' || field === 'sodium_mg') {
    return Math.round(value);
  }
  return Math.round(value * 10) / 10;
}

/**
 * 按倍数换算实际摄入。factor 为 null 时整份返回 null 字段。
 */
export function scaleNutrition(facts: NutritionFacts, factor: number | null): NutritionFacts {
  if (factor == null) return { ...EMPTY_NUTRITION_FACTS };
  const out = { ...EMPTY_NUTRITION_FACTS };
  for (const field of NUTRITION_FIELDS) {
    const value = facts[field];
    out[field] = value == null ? null : roundField(field, value * factor);
  }
  return out;
}

export interface AggregatedFact {
  /** 已记录部分的合计；全部未记录时为 null */
  total: number | null;
  /** 有几个来源没有记录该项（total 因此是下限，不是完整值） */
  unknownCount: number;
}

export type AggregatedNutrition = Record<NutritionField, AggregatedFact>;

export function emptyAggregatedNutrition(): AggregatedNutrition {
  const out = {} as AggregatedNutrition;
  for (const field of NUTRITION_FIELDS) {
    out[field] = { total: null, unknownCount: 0 };
  }
  return out;
}

/**
 * 汇总多份摄入。
 *
 * 关键：某一项只要有来源“未记录”，unknownCount 就会 > 0。
 * UI 必须据此提示“未记录”，不能把合计当成完整值展示（§10）。
 * 若全部来源都未记录，total 保持 null —— 而不是 0。
 */
export function aggregateNutrition(list: NutritionFacts[]): AggregatedNutrition {
  const out = emptyAggregatedNutrition();
  for (const facts of list) {
    for (const field of NUTRITION_FIELDS) {
      const value = facts[field];
      if (value == null) {
        out[field].unknownCount += 1;
      } else {
        out[field].total = (out[field].total ?? 0) + value;
      }
    }
  }
  for (const field of NUTRITION_FIELDS) {
    const total = out[field].total;
    if (total != null) out[field].total = roundField(field, total);
  }
  return out;
}

/** 用具体事实说话，不做“健康评分”（§11） */
export interface NutritionInsight {
  tone: 'info' | 'attention';
  text: string;
}

export function buildInsights(
  aggregated: AggregatedNutrition,
  targets: NutritionTargets,
): NutritionInsight[] {
  const insights: NutritionInsight[] = [];

  const ratio = (field: NutritionField, target: number): number | null => {
    const total = aggregated[field].total;
    if (total == null || target <= 0) return null;
    return total / target;
  };

  const sodium = ratio('sodium_mg', targets.sodium_mg);
  if (sodium != null && sodium >= 0.8) {
    insights.push({
      tone: 'attention',
      text: sodium >= 1 ? '今天钠摄入已经超过参考值。' : '今天钠摄入较高。',
    });
  }

  const addedSugar = ratio('added_sugar_g', targets.added_sugar_g);
  if (addedSugar != null && addedSugar >= 0.8) {
    insights.push({
      tone: 'attention',
      text:
        addedSugar >= 1
          ? '添加糖已经超过今日参考值。'
          : '添加糖接近今日参考值。',
    });
  }

  const protein = ratio('protein_g', targets.protein_g);
  if (protein != null && protein < 0.6) {
    insights.push({ tone: 'info', text: '蛋白质还有空间。' });
  }

  const fiber = ratio('fiber_g', targets.fiber_g);
  if (fiber != null && fiber < 0.5) {
    insights.push({ tone: 'info', text: '膳食纤维还可以再多一些。' });
  }

  if (aggregated.energy_kcal.unknownCount > 0 && aggregated.energy_kcal.total != null) {
    insights.push({ tone: 'info', text: '有记录缺少能量数据，今日能量是下限。' });
  }

  return insights;
}

/**
 * 每日参考值。
 * 这是可编辑的用户设置，不是医学建议；App 不做诊断（产品定位 §1）。
 */
export interface NutritionTargets {
  energy_kcal: number;
  protein_g: number;
  fat_g: number;
  carbohydrate_g: number;
  total_sugar_g: number;
  added_sugar_g: number;
  fiber_g: number;
  sodium_mg: number;
}

export const DEFAULT_TARGETS: NutritionTargets = {
  energy_kcal: 2100,
  protein_g: 80,
  fat_g: 60,
  carbohydrate_g: 280,
  total_sugar_g: 50,
  added_sugar_g: 25,
  fiber_g: 25,
  sodium_mg: 2000,
};
