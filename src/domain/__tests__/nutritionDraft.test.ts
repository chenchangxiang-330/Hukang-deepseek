/**
 * 营养草稿的单元测试。
 *
 * 这一层守的是一条很容易在 UI 里被破坏的规则：
 * **用户清空输入框 = 未记录（null），不是 0。**
 */

import {
  createEmptyDraft,
  draftFromValues,
  draftToNutrition,
  emptyFields,
  parseDraftNumber,
} from '../nutritionDraft';
import { NUTRITION_FIELDS } from '../nutrition';

describe('parseDraftNumber', () => {
  it('空字符串 → null（不是 0）', () => {
    expect(parseDraftNumber('')).toBeNull();
    expect(parseDraftNumber('   ')).toBeNull();
  });

  it('显式的 0 → 0（与未记录区分开）', () => {
    expect(parseDraftNumber('0')).toBe(0);
    expect(parseDraftNumber('0.0')).toBe(0);
  });

  it('正常数字', () => {
    expect(parseDraftNumber('3.2')).toBe(3.2);
    expect(parseDraftNumber(' 180 ')).toBe(180);
  });

  it('非数字 → null，不猜', () => {
    expect(parseDraftNumber('abc')).toBeNull();
    expect(parseDraftNumber('3.2g')).toBeNull();
    expect(parseDraftNumber('--')).toBeNull();
  });
});

describe('createEmptyDraft', () => {
  it('所有营养项都是空的，基准默认 100g', () => {
    const draft = createEmptyDraft();
    expect(draft.basisAmount).toBe('100');
    expect(draft.basisUnit).toBe('g');
    for (const field of NUTRITION_FIELDS) {
      expect(draft.values[field]).toBe('');
    }
  });

  it('每份基准的数量是 1', () => {
    expect(createEmptyDraft('serving').basisAmount).toBe('1');
  });
});

describe('draftFromValues —— 从解析结果生成草稿', () => {
  it('解析出来的填进去，没解析出来的保持空白', () => {
    const draft = draftFromValues(
      { energy_kj: 180, protein_g: 3.2, fat_g: null },
      { amount: 100, unit: 'ml' },
    );

    expect(draft.values.energy_kj).toBe('180');
    expect(draft.values.protein_g).toBe('3.2');
    expect(draft.values.fat_g).toBe('');
    expect(draft.values.added_sugar_g).toBe('');
    expect(draft.basisAmount).toBe('100');
    expect(draft.basisUnit).toBe('ml');
  });

  it('显式的 0 会被填成 “0”，不会被当成空', () => {
    const draft = draftFromValues({ fiber_g: 0 }, { amount: 100, unit: 'g' });
    expect(draft.values.fiber_g).toBe('0');
  });

  it('基准缺失时数量留空，不假装是 100', () => {
    const draft = draftFromValues({}, { amount: null, unit: null });
    expect(draft.basisAmount).toBe('');
  });
});

describe('draftToNutrition —— 草稿转可写库数据', () => {
  it('空项写 null，0 写 0', () => {
    const draft = createEmptyDraft();
    draft.values.fiber_g = '0';
    draft.values.protein_g = '3.2';

    const { facts, basisAmount, basisUnit } = draftToNutrition(draft);

    expect(facts.fiber_g).toBe(0);
    expect(facts.protein_g).toBe(3.2);
    expect(facts.added_sugar_g).toBeNull();
    expect(facts.energy_kcal).toBeNull();
    expect(basisAmount).toBe(100);
    expect(basisUnit).toBe('g');
  });

  it('往返转换不丢信息', () => {
    const original = {
      energy_kj: 180,
      protein_g: 3.2,
      fat_g: 3.6,
      carbohydrate_g: 4.8,
      sodium_mg: 50,
    };
    const draft = draftFromValues(original, { amount: 100, unit: 'ml' });
    const { facts } = draftToNutrition(draft);

    expect(facts.energy_kj).toBe(180);
    expect(facts.protein_g).toBe(3.2);
    expect(facts.sodium_mg).toBe(50);
    expect(facts.total_sugar_g).toBeNull();
  });
});

describe('emptyFields', () => {
  it('列出仍为空的项', () => {
    const draft = createEmptyDraft();
    draft.values.protein_g = '3.2';
    const empty = emptyFields(draft);
    expect(empty).not.toContain('protein_g');
    expect(empty).toContain('added_sugar_g');
  });

  it('填了 0 的项不算空', () => {
    const draft = createEmptyDraft();
    draft.values.fiber_g = '0';
    expect(emptyFields(draft)).not.toContain('fiber_g');
  });
});
