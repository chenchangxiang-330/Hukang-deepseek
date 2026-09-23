/**
 * 营养数值的合理性校验
 *
 * 背景（真实事故）：真机测试时，一瓶「无糖茶」的营养成分表被识别成
 * **蛋白质 43g / 100g**——这在物理上不可能（43% 的蛋白质？），
 * 但界面没有任何提示，用户点保存就会把错数据存进数据库。
 *
 * 产品原则是「数据正确 > 操作简单」，所以这里做两道关卡：
 *   reject —— 物理上不可能，**禁止保存**
 *   warn   —— 明显偏离常见范围，提示核对，但不阻止（可能是真的，比如蛋白粉）
 *
 * 全部是纯函数，可单元测试。
 */

import type { NutritionField } from './nutrition';
import type { NutritionBasis } from './types';

export type ValidationSeverity = 'reject' | 'warn';

export interface ValidationIssue {
  /** 出问题的字段；'sum' 表示总量问题，'basis' 表示基准问题 */
  field: NutritionField | 'sum' | 'basis';
  severity: ValidationSeverity;
  /** 面向用户的一句话，禁止技术词汇 */
  message: string;
  value?: number;
}

/**
 * 每 100g / 每 100mL 基准下的**物理上限**，超过即不可能。
 *
 * 依据：
 *   蛋白质/脂肪/碳水/糖/纤维 —— 每 100g 里不可能超过 100g
 *   钠   —— 纯食盐含钠约 39.3%，即每 100g 最多约 39300mg
 *   能量 —— 纯脂肪约 900 kcal/100g，换算约 3766 kJ/100g
 */
const ABSOLUTE_MAX_PER_100: Partial<Record<NutritionField, number>> = {
  protein_g: 100,
  fat_g: 100,
  carbohydrate_g: 100,
  total_sugar_g: 100,
  added_sugar_g: 100,
  fiber_g: 100,
  energy_kcal: 900,
  energy_kj: 3766,
  sodium_mg: 40000,
};

/**
 * 超过这个值就提示「偏高，请核对」。
 * 刻意设得保守：宁可多提示几次，也不要让用户默默存下错数据。
 */
const SUSPICIOUS_PER_100: Partial<Record<NutritionField, number>> = {
  protein_g: 35,
  fat_g: 60,
  carbohydrate_g: 95,
  total_sugar_g: 60,
  added_sugar_g: 40,
  fiber_g: 45,
  energy_kcal: 600,
  energy_kj: 2500,
  sodium_mg: 1500,
};

export const FIELD_NAMES: Record<NutritionField, string> = {
  energy_kcal: '能量',
  energy_kj: '能量',
  protein_g: '蛋白质',
  fat_g: '脂肪',
  carbohydrate_g: '碳水化合物',
  total_sugar_g: '总糖',
  added_sugar_g: '添加糖',
  fiber_g: '膳食纤维',
  sodium_mg: '钠',
};

const FIELD_UNITS: Record<NutritionField, string> = {
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

/** 基准能不能换算成"每 100 份量" */
function isPer100Computable(basis: NutritionBasis): boolean {
  return (
    basis.amount != null &&
    basis.amount > 0 &&
    (basis.unit === 'g' || basis.unit === 'ml')
  );
}

/** 把"每 X 份量"的值折算成"每 100 份量"；无法折算时返回 null */
export function toPer100(value: number, basis: NutritionBasis): number | null {
  if (!isPer100Computable(basis)) return null;
  return (value * 100) / (basis.amount as number);
}

/**
 * 校验单个营养值。
 *
 * 基准是「每份」「每包装」且拿不到具体克数时，**不做上限判断**——
 * 因为不知道一份到底多少克，贸然拒绝会把正确数据挡在外面。
 */
export function validateNutrientValue(
  field: NutritionField,
  value: number | null,
  basis: NutritionBasis,
): ValidationIssue[] {
  if (value == null) return [];

  const issues: ValidationIssue[] = [];
  const name = FIELD_NAMES[field];
  const unit = FIELD_UNITS[field];

  if (!Number.isFinite(value) || value < 0) {
    issues.push({
      field,
      severity: 'reject',
      message: `${name}的数值不正常，请重新填写。`,
      value,
    });
    return issues;
  }

  const per100 = toPer100(value, basis);

  // 只有能折算成每 100 份量时才做上限判断
  if (per100 == null) return issues;

  const max = ABSOLUTE_MAX_PER_100[field];
  if (max != null && per100 > max) {
    issues.push({
      field,
      severity: 'reject',
      message: `${name} ${value}${unit} 超出了可能范围，八成是读错了，请核对包装。`,
      value,
    });
    return issues;
  }

  const suspicious = SUSPICIOUS_PER_100[field];
  if (suspicious != null && per100 > suspicious) {
    issues.push({
      field,
      severity: 'warn',
      message: `${name} ${value}${unit} 偏高，建议核对包装。`,
      value,
    });
  }

  return issues;
}

export interface NutritionValidationInput {
  facts: Partial<Record<NutritionField, number | null>>;
  basis: NutritionBasis;
}

/**
 * 校验一整套营养数据。
 *
 * 除逐项检查外，还做一次**宏量营养素总量检查**：
 * 蛋白质 + 脂肪 + 碳水化合物 不可能超过 100g/100g。
 * 单项都"看起来正常"但加起来超过 100 的情况，只有总量检查能发现。
 */
export function validateNutrition(input: NutritionValidationInput): ValidationIssue[] {
  const { facts, basis } = input;
  const issues: ValidationIssue[] = [];

  // 基准本身要合理
  if (basis.amount != null && (!Number.isFinite(basis.amount) || basis.amount <= 0)) {
    issues.push({
      field: 'basis',
      severity: 'reject',
      message: '营养基准的数量不对，请检查。',
      value: basis.amount,
    });
  }

  for (const [field, value] of Object.entries(facts) as [NutritionField, number | null][]) {
    issues.push(...validateNutrientValue(field, value ?? null, basis));
  }

  // 宏量之和
  if (isPer100Computable(basis)) {
    const sumFields: NutritionField[] = ['protein_g', 'fat_g', 'carbohydrate_g'];
    const values = sumFields.map((f) => facts[f] ?? null);
    if (values.every((v) => v != null)) {
      const totalPer100 = values.reduce<number>((acc, v) => acc + (v as number), 0);
      const totalPer100Normalized = toPer100(totalPer100, basis) ?? totalPer100;
      if (totalPer100Normalized > 105) {
        issues.push({
          field: 'sum',
          severity: 'reject',
          message: '蛋白质、脂肪、碳水加起来超过了 100g，肯定有一项读错了，请核对。',
          value: Math.round(totalPer100Normalized),
        });
      } else if (totalPer100Normalized > 95) {
        issues.push({
          field: 'sum',
          severity: 'warn',
          message: '蛋白质、脂肪、碳水加起来接近 100g，建议核对。',
          value: Math.round(totalPer100Normalized),
        });
      }
    }
  }

  return issues;
}

/** 是否存在必须阻止保存的问题 */
export function hasBlockingIssue(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === 'reject');
}

/** 取某个字段上的问题（用于在输入框旁高亮） */
export function issuesForField(
  issues: ValidationIssue[],
  field: NutritionField,
): ValidationIssue[] {
  return issues.filter((i) => i.field === field);
}

/** 去重后的缺失项名称：能量只显示一次（energy_kcal 与 energy_kj 是同一项） */
export function dedupeFieldNames(fields: NutritionField[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const field of fields) {
    const name = FIELD_NAMES[field];
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}
