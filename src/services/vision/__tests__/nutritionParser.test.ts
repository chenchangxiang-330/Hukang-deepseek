/**
 * 营养成分表解析单元测试（§27 / §28 / §38）
 *
 * 这些用例守的是“数据正确”里最容易出错、也最容易被用户信任的部分：
 * 单位、基准、包含关系（添加糖 vs 糖 vs 糖类、饱和脂肪 vs 脂肪）、
 * 上限写法、以及“没标就是 null”。
 */

import {
  hasAnyNutritionValue,
  normalizeLabelText,
  parseNutritionBasis,
  parseNutritionLabel,
} from '../nutritionParser';

describe('normalizeLabelText —— 全角与异体字符归一', () => {
  it('全角数字转半角', () => {
    expect(normalizeLabelText('１２３．５ｇ')).toBe('123.5g');
  });

  it('全角冒号与百分号归一', () => {
    expect(normalizeLabelText('蛋白质：３．２ｇ　５％')).toBe('蛋白质:3.2g 5%');
  });
});

describe('parseNutritionBasis —— 营养基准（§28）', () => {
  it('每100克 / 每100g', () => {
    expect(parseNutritionBasis('每100克')).toEqual({ amount: 100, unit: 'g' });
    expect(parseNutritionBasis('每100g')).toEqual({ amount: 100, unit: 'g' });
  });

  it('每100毫升 / 每100mL', () => {
    expect(parseNutritionBasis('每100毫升')).toEqual({ amount: 100, unit: 'ml' });
    expect(parseNutritionBasis('每100mL')).toEqual({ amount: 100, unit: 'ml' });
  });

  it('每份（30g）优先采用明确的克数，而不是笼统的“份”', () => {
    expect(parseNutritionBasis('每份（30g）')).toEqual({ amount: 30, unit: 'g' });
    expect(parseNutritionBasis('每份(25克)')).toEqual({ amount: 25, unit: 'g' });
  });

  it('只说“每份”时基准为 1 份', () => {
    expect(parseNutritionBasis('每份')).toEqual({ amount: 1, unit: 'serving' });
  });

  it('每袋 / 每瓶 → 每包装', () => {
    expect(parseNutritionBasis('每袋')).toEqual({ amount: 1, unit: 'package' });
    expect(parseNutritionBasis('每瓶')).toEqual({ amount: 1, unit: 'package' });
  });

  it('认不出来就留空，不默认成每 100g', () => {
    expect(parseNutritionBasis('营养成分表')).toEqual({ amount: null, unit: null });
  });
});

describe('parseNutritionLabel —— 标准每100mL 牛奶标签', () => {
  const label = [
    '营养成分表',
    '项目         每100mL    NRV%',
    '能量         180kJ      2%',
    '蛋白质       3.2g       5%',
    '脂肪         3.6g       6%',
    '碳水化合物   4.8g       2%',
    '钠           50mg       3%',
  ];

  const parsed = parseNutritionLabel(label.join('\n'));

  it('基准是每 100mL', () => {
    expect(parsed.basis).toEqual({ amount: 100, unit: 'ml' });
  });

  it('各字段正确解析', () => {
    expect(parsed.facts.energy_kj).toBe(180);
    expect(parsed.facts.protein_g).toBe(3.2);
    expect(parsed.facts.fat_g).toBe(3.6);
    expect(parsed.facts.carbohydrate_g).toBe(4.8);
    expect(parsed.facts.sodium_mg).toBe(50);
  });

  it('包装只写千焦时 energy_kcal 必须是 null —— 绝不在解析层做换算', () => {
    expect(parsed.facts.energy_kcal).toBeNull();
  });

  it('包装没标的项一律 null，不用常识补（§38）', () => {
    expect(parsed.facts.total_sugar_g).toBeNull();
    expect(parsed.facts.added_sugar_g).toBeNull();
    expect(parsed.facts.fiber_g).toBeNull();
  });

  it('NRV% 列不会被误读成营养值', () => {
    // 若误读，钠会是 3 而不是 50
    expect(parsed.facts.sodium_mg).toBe(50);
  });

  it('未标注项进入 missingFields，供界面提示手动补', () => {
    expect(parsed.missingFields).toContain('total_sugar_g');
    expect(parsed.missingFields).toContain('added_sugar_g');
    expect(parsed.missingFields).toContain('fiber_g');
    // 能量读到了，就不该报缺失
    expect(parsed.missingFields).not.toContain('energy_kj');
    expect(parsed.missingFields).not.toContain('energy_kcal');
  });

  it('每一项都带来源证据，便于用户核对', () => {
    const protein = parsed.evidence.find((e) => e.field === 'protein_g');
    expect(protein?.value).toBe(3.2);
    expect(protein?.line).toContain('蛋白质');
  });
});

describe('parseNutritionLabel —— 包含关系的坑', () => {
  it('添加糖 与 糖 是两个不同字段，不能互相顶替', () => {
    const parsed = parseNutritionLabel(
      ['营养成分表', '每100克', '能量 2252kJ', '碳水化合物 57.5g', '糖 56.3g', '添加糖 52.13g'].join(
        '\n',
      ),
    );
    expect(parsed.facts.total_sugar_g).toBe(56.3);
    expect(parsed.facts.added_sugar_g).toBe(52.13);
  });

  it('添加糖在前时也不会被当成“糖”', () => {
    const parsed = parseNutritionLabel(
      ['每100克', '添加糖 52.13g', '糖 56.3g'].join('\n'),
    );
    expect(parsed.facts.total_sugar_g).toBe(56.3);
    expect(parsed.facts.added_sugar_g).toBe(52.13);
  });

  it('只有添加糖、没有总糖时，总糖保持 null（绝不回填）', () => {
    const parsed = parseNutritionLabel(['每100克', '添加糖 10g'].join('\n'));
    expect(parsed.facts.added_sugar_g).toBe(10);
    expect(parsed.facts.total_sugar_g).toBeNull();
  });

  it('“糖类”是碳水化合物的另一种写法，不能当成糖', () => {
    const parsed = parseNutritionLabel(['每100克', '糖类 10g'].join('\n'));
    expect(parsed.facts.total_sugar_g).toBeNull();
  });

  it('“饱和脂肪”不能当成脂肪', () => {
    const parsed = parseNutritionLabel(['每100克', '脂肪 30.9g', '饱和脂肪 10.6g'].join('\n'));
    expect(parsed.facts.fat_g).toBe(30.9);
  });

  it('“反式脂肪酸”不能当成脂肪', () => {
    const parsed = parseNutritionLabel(['每100克', '反式脂肪酸 0g'].join('\n'));
    expect(parsed.facts.fat_g).toBeNull();
  });

  it('“碳水化合物”不会被当成糖', () => {
    const parsed = parseNutritionLabel(['每100克', '碳水化合物 57.5g'].join('\n'));
    expect(parsed.facts.carbohydrate_g).toBe(57.5);
    expect(parsed.facts.total_sugar_g).toBeNull();
  });
});

describe('parseNutritionLabel —— 不确定的值不赋值', () => {
  it('“＜0.1g”是上限写法，真实值未知，不能当 0.1 存', () => {
    const parsed = parseNutritionLabel(['每100克', '钠 ＜0.1g'].join('\n'));
    expect(parsed.facts.sodium_mg).toBeNull();
    expect(parsed.uncertainFields.length).toBeGreaterThan(0);
    expect(parsed.uncertainFields[0]).toContain('上限');
  });

  it('缺单位的裸数字不赋值', () => {
    const parsed = parseNutritionLabel(['每100克', '蛋白质 3.2'].join('\n'));
    expect(parsed.facts.protein_g).toBeNull();
  });

  it('单位与项目不匹配时不赋值', () => {
    // 钠用了 g 而不是 mg
    const parsed = parseNutritionLabel(['每100克', '钠 0.05g'].join('\n'));
    expect(parsed.facts.sodium_mg).toBeNull();
    expect(parsed.uncertainFields.length).toBeGreaterThan(0);
  });
});

describe('parseNutritionLabel —— 单位与写法变体', () => {
  it('中文单位：千焦 / 千卡 / 毫克 / 克', () => {
    const parsed = parseNutritionLabel(
      ['每100克', '能量 180千焦', '蛋白质 3.2克', '钠 50毫克'].join('\n'),
    );
    expect(parsed.facts.energy_kj).toBe(180);
    expect(parsed.facts.protein_g).toBe(3.2);
    expect(parsed.facts.sodium_mg).toBe(50);
  });

  it('kcal 标签落到 energy_kcal', () => {
    const parsed = parseNutritionLabel(['每100克', '能量 43kcal'].join('\n'));
    expect(parsed.facts.energy_kcal).toBe(43);
    expect(parsed.facts.energy_kj).toBeNull();
  });

  it('“热量”也是能量的写法', () => {
    const parsed = parseNutritionLabel(['每100克', '热量 180kJ'].join('\n'));
    expect(parsed.facts.energy_kj).toBe(180);
  });

  it('kJ 大小写都能识别', () => {
    expect(parseNutritionLabel(['能量 180KJ'].join('\n')).facts.energy_kj).toBe(180);
    expect(parseNutritionLabel(['能量 180kj'].join('\n')).facts.energy_kj).toBe(180);
  });

  it('全角数字的标签也能解析', () => {
    const parsed = parseNutritionLabel(['每１００克', '蛋白质　３．２ｇ'].join('\n'));
    expect(parsed.facts.protein_g).toBe(3.2);
    expect(parsed.basis).toEqual({ amount: 100, unit: 'g' });
  });

  it('整张表被 OCR 读成一行时仍能解析', () => {
    const oneLine =
      '营养成分表 项目 每100克 NRV% 能量 2252kJ 27% 蛋白质 6.3g 11% 脂肪 30.9g 52% 碳水化合物 57.5g 19% 钠 42.8mg 2%';
    const parsed = parseNutritionLabel(oneLine);
    expect(parsed.facts.energy_kj).toBe(2252);
    expect(parsed.facts.protein_g).toBe(6.3);
    expect(parsed.facts.fat_g).toBe(30.9);
    expect(parsed.facts.carbohydrate_g).toBe(57.5);
    expect(parsed.facts.sodium_mg).toBe(42.8);
  });

  it('膳食纤维能被识别', () => {
    const parsed = parseNutritionLabel(['每100克', '膳食纤维 2.5g'].join('\n'));
    expect(parsed.facts.fiber_g).toBe(2.5);
  });
});

describe('hasAnyNutritionValue —— 一项都没解析出来才算失败', () => {
  it('正常的表返回 true', () => {
    expect(hasAnyNutritionValue(parseNutritionLabel('蛋白质 3.2g'))).toBe(true);
  });

  it('完全无关的文字返回 false', () => {
    expect(hasAnyNutritionValue(parseNutritionLabel('农夫山泉 东方树叶'))).toBe(false);
  });

  it('空输入返回 false 且不崩溃', () => {
    const parsed = parseNutritionLabel('');
    expect(hasAnyNutritionValue(parsed)).toBe(false);
    expect(parsed.basis).toEqual({ amount: null, unit: null });
  });
});
