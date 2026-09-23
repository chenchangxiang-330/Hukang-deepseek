/**
 * 营养数值合理性校验的单元测试
 *
 * 这些用例来自**真机实测暴露的真实事故**：
 * 一瓶「无糖茶」被识别成「蛋白质 43g / 100g」——这在物理上不可能，
 * 但界面毫无反应，用户点保存就会把错数据存进数据库。
 *
 * 所以这里重点守两件事：
 *   1. 物理上不可能的值必须被拦住（reject）
 *   2. 偏高的值要提示核对（warn），但不能误伤真实数据（比如蛋白粉）
 */

import {
  dedupeFieldNames,
  hasBlockingIssue,
  issuesForField,
  toPer100,
  validateNutrition,
  validateNutrientValue,
} from '../nutritionValidation';
import { isMisreadNumber } from '../../services/vision/nutritionParser';

const per100g = { amount: 100, unit: 'g' as const };
const per100ml = { amount: 100, unit: 'ml' as const };

describe('toPer100 —— 基准折算', () => {
  it('每 100g 原样返回', () => {
    expect(toPer100(3.2, per100g)).toBeCloseTo(3.2);
  });

  it('每份（30g）折算成每 100g', () => {
    // 每份 30g 里有 3g 蛋白质 → 每 100g 是 10g
    expect(toPer100(3, { amount: 30, unit: 'g' })).toBeCloseTo(10);
  });

  it('每份 / 每包装且拿不到克数时无法折算', () => {
    expect(toPer100(3, { amount: 1, unit: 'serving' })).toBeNull();
    expect(toPer100(3, { amount: null, unit: null })).toBeNull();
  });
});

describe('validateNutrientValue —— 物理上不可能的值', () => {
  it('真机事故：无糖茶出现 43g 蛋白质，虽然还在物理上限内，但要提示核对', () => {
    const issues = validateNutrientValue('protein_g', 43, per100ml);
    // 43 < 100，不属于"不可能"，但已经远超常见范围 → 必须 warn
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].severity).toBe('warn');
    expect(issues[0].message).toContain('偏高');
  });

  it('超过 100g/100g 直接拒绝', () => {
    const issues = validateNutrientValue('protein_g', 120, per100g);
    expect(issues[0].severity).toBe('reject');
    expect(hasBlockingIssue(issues)).toBe(true);
  });

  it('钠超过 40000mg 直接拒绝（纯食盐也就这么多）', () => {
    expect(validateNutrientValue('sodium_mg', 50000, per100g)[0].severity).toBe('reject');
  });

  it('能量超过 900kcal 直接拒绝（纯脂肪也就 900）', () => {
    expect(validateNutrientValue('energy_kcal', 1200, per100g)[0].severity).toBe('reject');
  });

  it('负数和非法数字直接拒绝', () => {
    expect(validateNutrientValue('protein_g', -1, per100g)[0].severity).toBe('reject');
    expect(validateNutrientValue('protein_g', NaN, per100g)[0].severity).toBe('reject');
  });

  it('null（未记录）不产生任何问题', () => {
    expect(validateNutrientValue('added_sugar_g', null, per100g)).toEqual([]);
  });

  it('正常值不报警', () => {
    expect(validateNutrientValue('protein_g', 3.2, per100ml)).toEqual([]);
    expect(validateNutrientValue('sodium_mg', 50, per100ml)).toEqual([]);
  });

  it('蛋白粉这类高蛋白是真实存在的，不该被误判为不可能', () => {
    // 80g/100g 的蛋白粉是合法商品
    expect(validateNutrientValue('protein_g', 80, per100g)[0]?.severity).not.toBe('reject');
  });

  it('每份基准拿不到克数时不做上限判断，避免误伤', () => {
    expect(validateNutrientValue('protein_g', 500, { amount: 1, unit: 'serving' })).toEqual([]);
  });
});

describe('validateNutrition —— 整套数据', () => {
  it('真机事故复现：蛋白质 43 必须被提示', () => {
    const issues = validateNutrition({
      facts: { protein_g: 43, fat_g: 0, carbohydrate_g: 0 },
      basis: per100ml,
    });
    expect(issues.some((i) => i.field === 'protein_g')).toBe(true);
  });

  it('宏量之和超过 100g 直接拒绝', () => {
    const issues = validateNutrition({
      facts: { protein_g: 50, fat_g: 40, carbohydrate_g: 30 },
      basis: per100g,
    });
    const sumIssue = issues.find((i) => i.field === 'sum');
    expect(sumIssue?.severity).toBe('reject');
  });

  it('宏量之和接近 100g 只提示', () => {
    const issues = validateNutrition({
      facts: { protein_g: 40, fat_g: 35, carbohydrate_g: 22 },
      basis: per100g,
    });
    const sumIssue = issues.find((i) => i.field === 'sum');
    expect(sumIssue?.severity).toBe('warn');
  });

  it('缺项不参与总量判断', () => {
    const issues = validateNutrition({
      facts: { protein_g: 5, fat_g: null, carbohydrate_g: 10 },
      basis: per100g,
    });
    expect(issues.find((i) => i.field === 'sum')).toBeUndefined();
  });

  it('基准数量非法直接拒绝', () => {
    const issues = validateNutrition({ facts: {}, basis: { amount: 0, unit: 'g' } });
    expect(issues[0].field).toBe('basis');
    expect(issues[0].severity).toBe('reject');
  });

  it('正常的一瓶牛奶不报警', () => {
    const issues = validateNutrition({
      facts: { energy_kj: 180, protein_g: 3.2, fat_g: 3.6, carbohydrate_g: 4.8, sodium_mg: 50 },
      basis: per100ml,
    });
    expect(issues).toEqual([]);
  });
});

describe('issuesForField', () => {
  it('只取指定字段的问题', () => {
    const issues = validateNutrition({
      facts: { protein_g: 120, sodium_mg: 50 },
      basis: per100g,
    });
    expect(issuesForField(issues, 'protein_g').length).toBe(1);
    expect(issuesForField(issues, 'sodium_mg').length).toBe(0);
  });
});

describe('dedupeFieldNames —— 能量只显示一次', () => {
  it('energy_kcal 与 energy_kj 是同一项，不重复显示', () => {
    expect(dedupeFieldNames(['energy_kcal', 'energy_kj', 'fat_g'])).toEqual(['能量', '脂肪']);
  });

  it('其他项正常显示', () => {
    expect(dedupeFieldNames(['protein_g', 'sodium_mg'])).toEqual(['蛋白质', '钠']);
  });
});

describe('isMisreadNumber —— OCR 丢小数点的识别', () => {
  it('真机事故：OCR 把 "0.45g" 读成 "045G"', () => {
    expect(isMisreadNumber('045')).toBe(true);
    expect(isMisreadNumber('043')).toBe(true);
  });

  it('正常的 0.45 不误判', () => {
    expect(isMisreadNumber('0.45')).toBe(false);
  });

  it('正常的 45 不误判', () => {
    expect(isMisreadNumber('45')).toBe(false);
  });

  it('单个 0 不误判（真的是 0 克）', () => {
    expect(isMisreadNumber('0')).toBe(false);
  });
});
