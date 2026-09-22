/**
 * 营养成分表解析（产品需求 §27 / §28 / §38）
 *
 * 输入：OCR 得到的原始文字（可带每行的位置）
 * 输出：结构化营养数据 + **每一项的来源证据**
 *
 * 三条不可违背的规则：
 *   1. 包装没标的项 → null。绝不用常识补（§38），也绝不用碳水推添加糖（§10）。
 *   2. 不确定的值（例如 “＜0.1g” 这种上限写法、缺单位的裸数字）→ 不赋值，
 *      记入 uncertainFields 交给用户确认。
 *   3. kJ 与 kcal 是两个独立字段。包装只写千焦时，energy_kcal 保持 null ——
 *      换算放在展示层做，并且必须显式标注“由千焦换算”。
 */

import type { NutritionBasisUnit, NutritionFacts } from '@/domain/types';
import { EMPTY_NUTRITION_FACTS } from '@/domain/types';
import type { NutritionField } from '@/domain/nutrition';

/** 解析出来的一个字段及其证据 */
export interface ParsedField {
  field: NutritionField;
  value: number;
  unit: string;
  /** 命中的原始片段，例如 “180kJ” */
  matched: string;
  /** 它来自哪一行 OCR 文本 */
  line: string;
}

export interface ParsedNutrition {
  basis: { amount: number | null; unit: NutritionBasisUnit | null };
  facts: NutritionFacts;
  evidence: ParsedField[];
  /** 读到了但不敢确定的值（缺单位、上限写法等），人类可读说明 */
  uncertainFields: string[];
  /** 与 uncertainFields 对应的字段名，供界面高亮需要确认的输入框 */
  uncertainFieldKeys: NutritionField[];
  /** 包装上没有 / 没读出来的项，UI 应提示可手动补 */
  missingFields: NutritionField[];
  rawText: string;
}

/** 全角转半角：OCR 经常把手写体或印刷体识别成全角数字 */
export function normalizeLabelText(input: string): string {
  return input
    .replace(/[\uFF10-\uFF19]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[\uFF21-\uFF3A\uFF41-\uFF5A]/g, (c) =>
      String.fromCharCode(c.charCodeAt(0) - 0xfee0),
    )
    .replace(/[．。]/g, '.')
    .replace(/[％]/g, '%')
    .replace(/[：]/g, ':')
    // 全角空格在中文标签的表格对齐里非常常见
    .replace(/[\u00A0\u3000]/g, ' ');
}

/**
 * 解析营养基准（§28）。
 *
 * 注意 “每份（30g）” 这种写法：它同时给了“份”的概念和一个明确克数，
 * 后者才是真正可换算的基准，优先采用。
 */
export function parseNutritionBasis(text: string): {
  amount: number | null;
  unit: NutritionBasisUnit | null;
} {
  const normalized = normalizeLabelText(text).replace(/\s+/g, '');

  // 每份（30g） / 每份30克
  const servingWithGram = /每\s*份\s*[（(]?\s*(\d+(?:\.\d+)?)\s*(g|克|ml|毫升)\s*[)）]?/.exec(
    normalized,
  );
  if (servingWithGram) {
    const amount = Number(servingWithGram[1]);
    const rawUnit = servingWithGram[2];
    if (Number.isFinite(amount) && amount > 0) {
      return { amount, unit: rawUnit === 'g' || rawUnit === '克' ? 'g' : 'ml' };
    }
  }

  // 每100克 / 每100g / 每100毫升 / 每100mL
  const per100 = /每\s*(\d+(?:\.\d+)?)\s*(g|克|ml|毫升|mL|ML)/.exec(normalized);
  if (per100) {
    const amount = Number(per100[1]);
    const rawUnit = per100[2];
    if (Number.isFinite(amount) && amount > 0) {
      return { amount, unit: rawUnit === 'g' || rawUnit === '克' ? 'g' : 'ml' };
    }
  }

  if (/每\s*份|每\s*1\s*份|per\s*serving/i.test(normalized)) {
    return { amount: 1, unit: 'serving' };
  }
  if (/每\s*(袋|包|瓶|罐|盒|条|块|支)/.test(normalized)) {
    return { amount: 1, unit: 'package' };
  }

  return { amount: null, unit: null };
}

/** 单位归一，便于比较与显示 */
function normalizeUnit(raw: string): 'kj' | 'kcal' | 'g' | 'mg' | null {
  const unit = raw.toLowerCase();
  if (unit === 'kj' || raw === '千焦' || raw === '千焦耳') return 'kj';
  if (unit === 'kcal' || raw === '千卡' || raw === '大卡' || raw === '千卡路里') return 'kcal';
  if (unit === 'g' || raw === '克') return 'g';
  if (unit === 'mg' || raw === '毫克') return 'mg';
  return null;
}

const VALUE_PATTERN = '(<|＜|≤|≦)?\\s*(\\d+(?:\\.\\d+)?)\\s*(千焦耳|千焦|千卡路里|千卡|大卡|kcal|kj|毫克|mg|克|g)';

/** 每个营养项的中文写法。顺序重要：先匹配更具体的（添加糖 先于 糖） */
const FIELD_ALIASES: { field: NutritionField; aliases: string[] }[] = [
  { field: 'added_sugar_g', aliases: ['添加糖'] },
  { field: 'total_sugar_g', aliases: ['总糖', '糖'] },
  { field: 'carbohydrate_g', aliases: ['碳水化合物', '碳水'] },
  { field: 'protein_g', aliases: ['蛋白质', '蛋白'] },
  { field: 'fat_g', aliases: ['脂肪'] },
  { field: 'fiber_g', aliases: ['膳食纤维', '纤维素', '纤维'] },
  { field: 'sodium_mg', aliases: ['钠'] },
  { field: 'energy_kj', aliases: ['能量', '热量'] },
];

/**
 * 否定语境。
 *
 * 中文营养表里有大量“包含关系”的坑：
 *   “添加糖” 含 “糖”、“饱和脂肪” 含 “脂肪”、“反式脂肪酸” 含 “脂肪”、
 *   “糖类” 含 “糖”（但糖类其实是碳水化合物）。
 * 不做这个排除，就会把子项错当成主项，把数据记错。
 */
const NEGATIVE_CONTEXT: Partial<
  Record<NutritionField, { beforeEndsWith?: string[]; afterStartsWith?: string[] }>
> = {
  total_sugar_g: {
    beforeEndsWith: ['添加', '蔗', '白砂', '果', '葡萄', '麦芽', '乳', '果葡'],
    afterStartsWith: ['类'],
  },
  fat_g: {
    beforeEndsWith: ['饱和', '反式'],
    afterStartsWith: ['酸'],
  },
};

function unitMatchesField(field: NutritionField, unit: 'kj' | 'kcal' | 'g' | 'mg'): boolean {
  switch (field) {
    case 'energy_kj':
      return unit === 'kj';
    case 'energy_kcal':
      return unit === 'kcal';
    case 'sodium_mg':
      return unit === 'mg';
    default:
      return unit === 'g';
  }
}

/**
 * 解析一行文本里的某个营养项。
 * 返回 null 表示这行没有可用的该项数据。
 */
function parseFieldFromLine(
  field: NutritionField,
  aliases: string[],
  line: string,
): { parsed: ParsedField } | { uncertain: string; field: NutritionField } | null {
  const normalized = normalizeLabelText(line);

  const alias = aliases.find((a) => normalized.includes(a));
  if (!alias) return null;

  const aliasIndex = normalized.indexOf(alias);
  const before = normalized.slice(0, aliasIndex);
  const after = normalized.slice(aliasIndex + alias.length);

  const negatives = NEGATIVE_CONTEXT[field];
  if (negatives?.beforeEndsWith?.some((n) => before.endsWith(n))) return null;
  if (negatives?.afterStartsWith?.some((n) => after.startsWith(n))) return null;

  // 只看别名之后的文本，避免把 “每100克” 里的数字当成分值
  const match = new RegExp(VALUE_PATTERN, 'i').exec(after);
  if (!match) return null;

  const boundPrefix = match[1];
  const value = Number(match[2]);
  const unit = normalizeUnit(match[3]);

  if (!Number.isFinite(value)) return null;

  // “＜0.1g” 这类写法只给出了上限，真实值未知 —— 不能当 0.1 存
  if (boundPrefix) {
    return { uncertain: `${line.trim()}（是上限写法，实际值未知）`, field };
  }

  if (!unit) {
    return { uncertain: `${line.trim()}（没有单位）`, field };
  }

  // 能量项要按单位决定落在 energy_kj 还是 energy_kcal
  if (field === 'energy_kj') {
    if (unit === 'kj') {
      return {
        parsed: { field: 'energy_kj', value, unit: 'kJ', matched: match[0].trim(), line: line.trim() },
      };
    }
    if (unit === 'kcal') {
      return {
        parsed: {
          field: 'energy_kcal',
          value,
          unit: 'kcal',
          matched: match[0].trim(),
          line: line.trim(),
        },
      };
    }
    return { uncertain: `${line.trim()}（能量单位不是千焦或千卡）`, field };
  }

  if (!unitMatchesField(field, unit)) {
    return { uncertain: `${line.trim()}（单位 ${match[3]} 与项目不匹配）`, field };
  }

  return {
    parsed: {
      field,
      value,
      unit: unit === 'mg' ? 'mg' : 'g',
      matched: match[0].trim(),
      line: line.trim(),
    },
  };
}

/**
 * 主解析入口。
 *
 * @param rawText OCR 全文
 * @param lines 按行切分的文本（若没有位置信息，直接按换行切分即可）
 */
export function parseNutritionLabel(rawText: string, lines?: string[]): ParsedNutrition {
  const text = normalizeLabelText(rawText ?? '');
  const allLines =
    lines && lines.length > 0
      ? lines
      : text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);

  // OCR 有时把整张表读成一行，所以要同时准备“逐行”和“整段”两个视图
  const searchUnits = allLines.length > 0 ? allLines : [text];

  const basis = parseNutritionBasis(text);

  const facts: NutritionFacts = { ...EMPTY_NUTRITION_FACTS };
  const evidence: ParsedField[] = [];
  const uncertainFields: string[] = [];
  const uncertainFieldKeys: NutritionField[] = [];
  const filled = new Set<NutritionField>();

  for (const { field, aliases } of FIELD_ALIASES) {
    // energy_kj 这个 entry 实际会产出 energy_kj 或 energy_kcal
    const targets: NutritionField[] =
      field === 'energy_kj' ? ['energy_kj', 'energy_kcal'] : [field];
    if (targets.every((t) => filled.has(t))) continue;

    let resolved = false;
    for (const unit of searchUnits) {
      const outcome = parseFieldFromLine(field, aliases, unit);
      if (!outcome) continue;

      if ('uncertain' in outcome) {
        if (!uncertainFields.includes(outcome.uncertain)) {
          uncertainFields.push(outcome.uncertain);
          uncertainFieldKeys.push(outcome.field);
        }
        continue;
      }

      const target = outcome.parsed.field;
      // 同一个字段以第一次成功解析为准，后面的（通常是 NRV% 列）不再覆盖
      if (filled.has(target)) {
        resolved = true;
        break;
      }
      facts[target] = outcome.parsed.value;
      filled.add(target);
      evidence.push(outcome.parsed);
      resolved = true;
      break;
    }

    // 整段再兜一次（表被读成一行的情况）
    if (!resolved && searchUnits.length > 1) {
      const outcome = parseFieldFromLine(field, aliases, text);
      if (outcome && 'parsed' in outcome && !filled.has(outcome.parsed.field)) {
        facts[outcome.parsed.field] = outcome.parsed.value;
        filled.add(outcome.parsed.field);
        evidence.push(outcome.parsed);
      }
    }
  }

  const ALL_FIELDS: NutritionField[] = [
    'energy_kcal',
    'energy_kj',
    'protein_g',
    'fat_g',
    'carbohydrate_g',
    'total_sugar_g',
    'added_sugar_g',
    'fiber_g',
    'sodium_mg',
  ];

  // 能量只要有一个单位读到就算读到，不把另一个报成“缺失”
  const energyRead = filled.has('energy_kj') || filled.has('energy_kcal');
  const missingFields = ALL_FIELDS.filter((f) => {
    if (filled.has(f)) return false;
    if (f === 'energy_kj' || f === 'energy_kcal') return !energyRead;
    return true;
  });

  return {
    basis,
    facts,
    evidence,
    uncertainFields,
    uncertainFieldKeys,
    missingFields,
    rawText: text,
  };
}

/** 是否解析出了任何一项 —— 一项都没有才算解析失败（§42 NUTRITION_PARSE_FAILED） */
export function hasAnyNutritionValue(parsed: ParsedNutrition): boolean {
  return parsed.evidence.length > 0;
}
