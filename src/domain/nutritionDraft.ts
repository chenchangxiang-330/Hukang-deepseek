/**
 * 营养编辑草稿（产品需求 §27 用户确认、§28）
 *
 * 为什么用字符串而不是数字存草稿：用户必须能**把已填的项清空**。
 * 如果草稿是 number，清空输入框会变成 0，而 0 表示“含量确实为零”——
 * 这与“未记录”是完全不同的意思。
 *
 * 纯函数，可单元测试。
 */

import { NUTRITION_FIELDS, type NutritionField } from './nutrition';
import { EMPTY_NUTRITION_FACTS, type NutritionBasisUnit, type NutritionFacts } from './types';

export interface NutritionDraft {
  /** 基准数量，字符串形式（可被清空） */
  basisAmount: string;
  basisUnit: NutritionBasisUnit;
  /** 每个营养项的输入文本 */
  values: Record<NutritionField, string>;
}

/** 空字符串 → null；非数字 → null。绝不把空输入变成 0。 */
export function parseDraftNumber(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

export function createEmptyDraft(basisUnit: NutritionBasisUnit = 'g'): NutritionDraft {
  const values = {} as Record<NutritionField, string>;
  for (const field of NUTRITION_FIELDS) values[field] = '';
  return {
    basisAmount: basisUnit === 'serving' ? '1' : '100',
    basisUnit,
    values,
  };
}

function stringify(value: number | null): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

/** 从解析结果生成草稿：只把**确实解析出来**的值填进去，其余留空 */
export function draftFromValues(
  facts: Partial<NutritionFacts>,
  basis: { amount: number | null; unit: NutritionBasisUnit | null },
  fallbackUnit: NutritionBasisUnit = 'g',
): NutritionDraft {
  const values = {} as Record<NutritionField, string>;
  for (const field of NUTRITION_FIELDS) {
    values[field] = stringify(facts[field] ?? null);
  }

  const unit = basis.unit ?? fallbackUnit;
  return {
    basisAmount: basis.amount === null ? '' : String(basis.amount),
    basisUnit: unit,
    values,
  };
}

/** 草稿 → 可写库的数据 */
export function draftToNutrition(draft: NutritionDraft): {
  basisAmount: number | null;
  basisUnit: NutritionBasisUnit;
  facts: NutritionFacts;
} {
  const facts: NutritionFacts = { ...EMPTY_NUTRITION_FACTS };
  for (const field of NUTRITION_FIELDS) {
    facts[field] = parseDraftNumber(draft.values[field]);
  }

  return {
    basisAmount: parseDraftNumber(draft.basisAmount),
    basisUnit: draft.basisUnit,
    facts,
  };
}

/** 哪些项还是空的（用于提示“这些可以手动补”） */
export function emptyFields(draft: NutritionDraft): NutritionField[] {
  return NUTRITION_FIELDS.filter((field) => parseDraftNumber(draft.values[field]) === null);
}
