/**
 * 营养数值的展示格式化（产品需求 §10 / §28）
 *
 * 唯一职责：把 null 正确地显示为“未记录”。
 * 0 必须显示成 0 —— 这两个在界面上绝不能长得一样。
 */

import type { NutritionField } from './nutrition';

export const FIELD_UNITS: Record<NutritionField, string> = {
  energy_kcal: 'kcal',
  energy_kj: 'kJ',
  protein_g: 'g',
  fat_g: 'g',
  carbohydrate_g: 'g',
  total_sugar_g: 'g',
  added_sugar_g: 'g',
  fiber_g: 'g',
  sodium_mg: 'mg',
};

export const FIELD_LABELS: Record<NutritionField, string> = {
  energy_kcal: '能量',
  energy_kj: '能量(kJ)',
  protein_g: '蛋白质',
  fat_g: '脂肪',
  carbohydrate_g: '碳水化合物',
  total_sugar_g: '总糖',
  added_sugar_g: '添加糖',
  fiber_g: '膳食纤维',
  sodium_mg: '钠',
};

/** 未记录的统一样式，避免各页面写出不同措辞 */
export const NOT_RECORDED = '未记录';

export function formatNutrientValue(
  field: NutritionField,
  value: number | null | undefined,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return NOT_RECORDED;
  }
  const unit = FIELD_UNITS[field];
  // 能量与钠取整，其余最多 1 位小数
  if (field === 'energy_kcal' || field === 'energy_kj' || field === 'sodium_mg') {
    return `${Math.round(value)} ${unit}`;
  }
  const rounded = Math.round(value * 10) / 10;
  return `${rounded} ${unit}`;
}

/** 基准文案：每 100g / 每 100mL / 每份 */
export function formatBasis(basis: { amount: number | null; unit: string | null }): string {
  const { amount, unit } = basis;
  if (amount == null || !unit) return '基准未记录';
  switch (unit) {
    case 'g':
      return `每 ${amount}g`;
    case 'ml':
      return `每 ${amount}mL`;
    case 'serving':
      return amount === 1 ? '每份' : `每 ${amount} 份`;
    case 'package':
      return '每包装';
    default:
      return `每 ${amount}${unit}`;
  }
}
