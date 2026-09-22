/**
 * 营养计算单元测试（测试策略第一层：Mac 本地）
 *
 * 这里守的是产品需求里最容易写错、后果最严重的三条：
 *   §10  added_sugar_g 绝不能由 carbohydrate_g 推导；unknown != 0
 *   §13  摄入换算来自快照
 *   §28  无法可靠换算时留空，不猜
 */

import {
  aggregateNutrition,
  buildInsights,
  computeScaleFactor,
  DEFAULT_TARGETS,
  scaleNutrition,
} from '../nutrition';
import { EMPTY_NUTRITION_FACTS } from '../types';
import type { NutritionFacts } from '../types';

const per100ml: NutritionFacts = {
  energy_kcal: 62,
  energy_kj: 261,
  protein_g: 3.2,
  fat_g: 3.6,
  carbohydrate_g: 4.8,
  total_sugar_g: null,
  added_sugar_g: null,
  fiber_g: null,
  sodium_mg: 50,
};

describe('computeScaleFactor', () => {
  it('同单位按比例换算（250mL / 每100mL = 2.5 倍）', () => {
    expect(computeScaleFactor({ amount: 100, unit: 'ml' }, 250, 'ml')).toBeCloseTo(2.5);
  });

  it('克与毫升不能互相换算，必须返回 null 而不是硬算', () => {
    expect(computeScaleFactor({ amount: 100, unit: 'g' }, 250, 'ml')).toBeNull();
  });

  it('中文单位别名可以归一（毫升 / 克）', () => {
    expect(computeScaleFactor({ amount: 100, unit: 'ml' }, 250, '毫升')).toBeCloseTo(2.5);
    expect(computeScaleFactor({ amount: 100, unit: 'g' }, 50, '克')).toBeCloseTo(0.5);
  });

  it('每份基准下，份数即倍数', () => {
    expect(computeScaleFactor({ amount: 1, unit: 'serving' }, 2, '份')).toBeCloseTo(2);
  });

  it('缺少基准或基准非法时返回 null', () => {
    expect(computeScaleFactor({ amount: null, unit: 'ml' }, 250, 'ml')).toBeNull();
    expect(computeScaleFactor({ amount: 0, unit: 'ml' }, 250, 'ml')).toBeNull();
    expect(computeScaleFactor({ amount: 100, unit: null }, 250, 'ml')).toBeNull();
  });

  it('数量非法时返回 null', () => {
    expect(computeScaleFactor({ amount: 100, unit: 'ml' }, 0, 'ml')).toBeNull();
    expect(computeScaleFactor({ amount: 100, unit: 'ml' }, -5, 'ml')).toBeNull();
  });
});

describe('scaleNutrition', () => {
  it('按倍数放大，但 null 字段必须保持 null（不能变成 0）', () => {
    const intake = scaleNutrition(per100ml, 2.5);
    expect(intake.energy_kcal).toBe(155);
    expect(intake.protein_g).toBe(8);
    expect(intake.sodium_mg).toBe(125);
    // 包装没标的三项必须还是 null
    expect(intake.total_sugar_g).toBeNull();
    expect(intake.added_sugar_g).toBeNull();
    expect(intake.fiber_g).toBeNull();
  });

  it('无法换算时整份留空，而不是按 1 倍假装算出来', () => {
    const intake = scaleNutrition(per100ml, null);
    expect(intake).toEqual(EMPTY_NUTRITION_FACTS);
    expect(intake.energy_kcal).toBeNull();
  });
});

describe('aggregateNutrition', () => {
  it('全部有记录时给出完整合计', () => {
    const a: NutritionFacts = { ...EMPTY_NUTRITION_FACTS, energy_kcal: 155, protein_g: 8 };
    const b: NutritionFacts = { ...EMPTY_NUTRITION_FACTS, energy_kcal: 247, protein_g: 30 };
    const result = aggregateNutrition([a, b]);
    expect(result.energy_kcal.total).toBe(402);
    expect(result.protein_g.total).toBe(38);
    expect(result.energy_kcal.unknownCount).toBe(0);
  });

  it('有一项未记录时保留 unknownCount，合计只是下限', () => {
    const a: NutritionFacts = { ...EMPTY_NUTRITION_FACTS, energy_kcal: 155, added_sugar_g: null };
    const b: NutritionFacts = { ...EMPTY_NUTRITION_FACTS, energy_kcal: 100, added_sugar_g: 5 };
    const result = aggregateNutrition([a, b]);

    expect(result.energy_kcal.total).toBe(255);
    expect(result.energy_kcal.unknownCount).toBe(0);

    // 添加糖只有一项有数据：合计 5，但必须标记有 1 项未记录
    expect(result.added_sugar_g.total).toBe(5);
    expect(result.added_sugar_g.unknownCount).toBe(1);
  });

  it('全部未记录时合计为 null，而不是 0', () => {
    const result = aggregateNutrition([EMPTY_NUTRITION_FACTS, EMPTY_NUTRITION_FACTS]);
    expect(result.added_sugar_g.total).toBeNull();
    expect(result.added_sugar_g.unknownCount).toBe(2);
  });
});

describe('buildInsights —— 只用事实，不做健康评分（§11）', () => {
  it('钠接近参考值时给出具体提示', () => {
    const facts: NutritionFacts = { ...EMPTY_NUTRITION_FACTS, sodium_mg: 1900 };
    const insights = buildInsights(aggregateNutrition([facts]), DEFAULT_TARGETS);
    expect(insights.some((i) => i.text.includes('钠'))).toBe(true);
  });

  it('绝不产生“健康评分”这类文案', () => {
    const facts: NutritionFacts = { ...EMPTY_NUTRITION_FACTS, sodium_mg: 2500, added_sugar_g: 30 };
    const insights = buildInsights(aggregateNutrition([facts]), DEFAULT_TARGETS);
    for (const insight of insights) {
      expect(insight.text).not.toMatch(/评分|指数|打分/);
    }
  });
});
