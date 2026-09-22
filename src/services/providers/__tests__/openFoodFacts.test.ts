/**
 * Open Food Facts 映射器单元测试（离线，用真实结构的 fixture）
 *
 * 守的是最容易出错、后果最严重的两件事：
 *   §10  添加糖缺失必须是 null，绝不能拿总糖或碳水顶替；显式的 0 必须保持 0
 *   §28  营养基准认不出来就留空，不能默认成每 100g
 */

import { mapOffProduct, parseOffBasis, type OffProduct } from '../openFoodFacts';

describe('parseOffBasis —— 营养基准', () => {
  it('识别 100g / 100ml', () => {
    expect(parseOffBasis('100g')).toEqual({ amount: 100, unit: 'g' });
    expect(parseOffBasis('100ml')).toEqual({ amount: 100, unit: 'ml' });
    expect(parseOffBasis('100 ml')).toEqual({ amount: 100, unit: 'ml' });
  });

  it('识别每份', () => {
    expect(parseOffBasis('serving')).toEqual({ amount: 1, unit: 'serving' });
  });

  it('认不出来就留空，不默认成 100g', () => {
    expect(parseOffBasis(undefined)).toEqual({ amount: null, unit: null });
    expect(parseOffBasis('')).toEqual({ amount: null, unit: null });
    expect(parseOffBasis('per packet')).toEqual({ amount: null, unit: null });
    expect(parseOffBasis('0g')).toEqual({ amount: null, unit: null });
  });
});

describe('mapOffProduct —— 字段映射', () => {
  const nutella: OffProduct = {
    code: '3017620422003',
    product_name: 'Nutella',
    brands: 'Ferrero',
    quantity: '400 g',
    categories: 'Spreads,Sweet spreads',
    nutrition_data_per: '100g',
    nutriments: {
      'energy-kcal_100g': 539,
      'energy-kj_100g': 2252,
      proteins_100g: 6.3,
      fat_100g: 30.9,
      carbohydrates_100g: 57.5,
      sugars_100g: 56.3,
      'added-sugars_100g': 52.13,
      fiber_100g: 0,
      sodium_100g: 0.0428,
    },
    ingredients_text: 'Sugar, palm oil, hazelnuts 13%, skimmed milk powder 8.7%',
  };

  it('完整字段正确映射', () => {
    const c = mapOffProduct(nutella, '3017620422003');
    expect(c).not.toBeNull();
    expect(c!.name).toBe('Nutella');
    expect(c!.brand).toBe('Ferrero');
    expect(c!.basisAmount).toBe(100);
    expect(c!.basisUnit).toBe('g');
    expect(c!.energy_kcal).toBe(539);
    expect(c!.energy_kj).toBe(2252);
    expect(c!.carbohydrate_g).toBe(57.5);
    expect(c!.total_sugar_g).toBe(56.3);
    expect(c!.added_sugar_g).toBe(52.13);
  });

  it('钠从克换算成毫克', () => {
    const c = mapOffProduct(nutella, '3017620422003');
    expect(c!.sodium_mg).toBeCloseTo(42.8, 1);
  });

  it('显式的 0 保持 0，不能变成 null', () => {
    const c = mapOffProduct(nutella, '3017620422003');
    expect(c!.fiber_g).toBe(0);
    expect(c!.fiber_g).not.toBeNull();
  });

  it('缺少添加糖时必须为 null —— 绝不用总糖或碳水顶替', () => {
    const noAddedSugar: OffProduct = {
      ...nutella,
      nutriments: {
        'energy-kcal_100g': 42,
        carbohydrates_100g: 10.6,
        sugars_100g: 10.6,
        // 注意：没有 added-sugars_100g
      },
    };
    const c = mapOffProduct(noAddedSugar, '5449000000996');
    expect(c!.added_sugar_g).toBeNull();
    // 总糖与碳水照常保留，三者互不替代
    expect(c!.total_sugar_g).toBe(10.6);
    expect(c!.carbohydrate_g).toBe(10.6);
  });

  it('不拿 salt 反推钠', () => {
    const saltOnly: OffProduct = {
      ...nutella,
      nutriments: { 'energy-kcal_100g': 100, salt_100g: 1.5 },
    };
    const c = mapOffProduct(saltOnly, '1234567890123');
    expect(c!.sodium_mg).toBeNull();
  });

  it('缺少 nutrition_data_per 时基准留空，但营养数值仍然保留', () => {
    const noBasis: OffProduct = {
      ...nutella,
      nutrition_data_per: undefined,
    };
    const c = mapOffProduct(noBasis, '3017620422003');
    expect(c!.basisAmount).toBeNull();
    expect(c!.basisUnit).toBeNull();
    expect(c!.energy_kcal).toBe(539);
  });

  it('没有名字的记录视为不可用', () => {
    expect(mapOffProduct({ code: '1', nutriments: { fiber_100g: 1 } }, '1')).toBeNull();
    expect(mapOffProduct({ code: '1', product_name: '   ' }, '1')).toBeNull();
  });

  it('中文名优先于英文名', () => {
    const c = mapOffProduct(
      { code: '6921168558049', product_name: 'Jasmine Tea', product_name_zh: '茉莉花茶' },
      '6921168558049',
    );
    expect(c!.name).toBe('茉莉花茶');
  });

  it('液体商品按 100ml 建立基准', () => {
    const drink: OffProduct = {
      code: '6921168558049',
      product_name_zh: '茉莉花茶',
      nutrition_data_per: '100ml',
      nutriments: { 'energy-kcal_100g': 0, sugars_100g: 0 },
    };
    const c = mapOffProduct(drink, '6921168558049');
    expect(c!.basisUnit).toBe('ml');
    expect(c!.basisAmount).toBe(100);
  });
});
