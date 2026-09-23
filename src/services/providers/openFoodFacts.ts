/**
 * Open Food Facts 数据源（产品需求 §21）
 *
 * 实测确认的事实（2026-09，真实请求验证）：
 * - 按条码查询：/api/v2/product/{barcode}.json  → 未收录时返回 status:0
 * - 关键词搜索：/cgi/search.pl 支持中文关键词（实测能搜到“农夫山泉”“东方树叶”）
 * - 营养字段：始终使用 `_100g` 后缀，但真正基准由 `nutrition_data_per` 决定
 *   （实测 茉莉花茶 为 "100ml"，Coca-Cola 为 "100g"，而两者键名都是 _100g）
 * - sodium_100g 的单位是**克**，我们的字段是毫克，需要 ×1000
 *
 * 数据质量声明：这是公开众包数据库，字段可能缺失或有误。
 * 因此落库时 data_source 标记来源，界面上必须提示用户核对包装。
 */

import type { NutritionBasisUnit } from '@/domain/types';
import { fetchJson } from '@/services/network/http';
import { guardLookup } from './helpers';
import type { BarcodeProvider, KeywordSearchProvider, LookupOutcome, ProductCandidate } from './types';

const BASE = 'https://world.openfoodfacts.org';

const FIELDS = [
  'code',
  'product_name',
  'product_name_zh',
  'brands',
  'quantity',
  'categories',
  'image_front_url',
  'nutrition_data_per',
  'nutriments',
  'ingredients_text',
  'ingredients_text_zh',
  'ingredients',
].join(',');

/** OFF 的原始营养对象，键名带连字符，只列出我们用到的 */
export interface OffNutriments {
  'energy-kcal_100g'?: number;
  'energy-kj_100g'?: number;
  /** OFF 约定：energy 以 kJ 计 */
  energy_100g?: number;
  proteins_100g?: number;
  fat_100g?: number;
  carbohydrates_100g?: number;
  sugars_100g?: number;
  'added-sugars_100g'?: number;
  fiber_100g?: number;
  /** 单位：克 */
  sodium_100g?: number;
  [key: string]: number | string | undefined;
}

export interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_zh?: string;
  brands?: string;
  quantity?: string;
  categories?: string;
  image_front_url?: string;
  nutrition_data_per?: string;
  nutriments?: OffNutriments;
  ingredients_text?: string;
  ingredients_text_zh?: string;
  ingredients?: { text?: string }[];
}

/** 只取有限数字；空串 / null / NaN 一律当“没有”，绝不变成 0 */
function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function firstNonEmpty(...values: (string | undefined | null)[]): string | null {
  for (const v of values) {
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
  }
  return null;
}

/** 解析营养基准；识别不了就返回 null，让上层显示“未记录”而不是假设 100g */
export function parseOffBasis(nutritionDataPer: string | undefined): {
  amount: number | null;
  unit: NutritionBasisUnit | null;
} {
  if (!nutritionDataPer) return { amount: null, unit: null };
  const text = nutritionDataPer.trim().toLowerCase();
  const match = /^(\d+(?:\.\d+)?)\s*(g|ml)$/.exec(text);
  if (match) {
    const amount = Number(match[1]);
    if (!Number.isFinite(amount) || amount <= 0) return { amount: null, unit: null };
    return { amount, unit: match[2] as NutritionBasisUnit };
  }
  if (text === 'serving') return { amount: 1, unit: 'serving' };
  return { amount: null, unit: null };
}

/**
 * OFF 产品 → 我们的候选商品。
 *
 * 严格规则（§10 / §38）：
 * - added_sugar_g 只取 added-sugars_100g。缺失就是 null，
 *   绝不用 sugars（总糖）或 carbohydrates（碳水）顶替。
 * - sodium 只取 sodium_100g（克 → 毫克）。不拿 salt 反推钠。
 * - 缺失字段全部 null。
 */
export function mapOffProduct(product: OffProduct, fallbackBarcode: string): ProductCandidate | null {
  const name = firstNonEmpty(product.product_name_zh, product.product_name);
  if (!name) return null;

  const n = product.nutriments ?? {};
  const basis = parseOffBasis(product.nutrition_data_per);

  const sodiumG = num(n.sodium_100g);
  const energyKj = num(n['energy-kj_100g']) ?? num(n.energy_100g);

  const ingredientsList =
    product.ingredients
      ?.map((i) => i.text?.trim())
      .filter((t): t is string => !!t && t.length > 0) ?? null;

  return {
    source: 'openfoodfacts',
    sourceId: product.code ?? null,
    barcode: firstNonEmpty(product.code, fallbackBarcode),
    brand: firstNonEmpty(product.brands),
    name,
    variant: null,
    quantity: firstNonEmpty(product.quantity),
    category: firstNonEmpty(product.categories),
    imageUrl: firstNonEmpty(product.image_front_url),

    basisAmount: basis.amount,
    basisUnit: basis.unit,

    energy_kcal: num(n['energy-kcal_100g']),
    energy_kj: energyKj,
    protein_g: num(n.proteins_100g),
    fat_g: num(n.fat_100g),
    carbohydrate_g: num(n.carbohydrates_100g),
    total_sugar_g: num(n.sugars_100g),
    added_sugar_g: num(n['added-sugars_100g']),
    fiber_g: num(n.fiber_100g),
    sodium_mg: sodiumG == null ? null : Math.round(sodiumG * 1000 * 10) / 10,

    ingredientsRawText: firstNonEmpty(product.ingredients_text_zh, product.ingredients_text),
    ingredientsList: ingredientsList && ingredientsList.length > 0 ? ingredientsList : null,
  };
}

interface OffProductResponse {
  status?: number;
  code?: string;
  product?: OffProduct;
}

interface OffSearchResponse {
  count?: number;
  products?: OffProduct[];
}

async function queryByBarcode(
  barcode: string,
  apiVersion: 'v2' | 'v3',
  timeoutMs?: number,
): Promise<LookupOutcome> {
  const url = `${BASE}/api/${apiVersion}/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`;
  const result = await fetchJson<OffProductResponse>(url, { timeoutMs });

  if (result.status === 404) {
    return { kind: 'no_match', source: `openfoodfacts_${apiVersion}` };
  }
  if (!result.ok || !result.data) {
    return {
      kind: 'unavailable',
      source: `openfoodfacts_${apiVersion}`,
      reason: `HTTP ${result.status}`,
    };
  }

  // OFF 用 status:0 表示“库里没有这个条码”，而不是错误
  if (result.data.status === 0 && !result.data.product) {
    return { kind: 'no_match', source: `openfoodfacts_${apiVersion}` };
  }

  const product = result.data.product;
  if (!product) {
    return { kind: 'no_match', source: `openfoodfacts_${apiVersion}` };
  }

  const candidate = mapOffProduct(product, barcode);
  if (!candidate) {
    // 有条码记录但没有可用名称 —— 对用户等于没查到，如实归类
    return { kind: 'no_match', source: `openfoodfacts_${apiVersion}` };
  }

  return { kind: 'candidates', source: `openfoodfacts_${apiVersion}`, candidates: [candidate] };
}

/** 主数据源：v2 接口 */
export const openFoodFactsV2: BarcodeProvider = {
  id: 'openfoodfacts_v2',
  label: 'Open Food Facts (v2)',
  requiresKey: false,
  lookupByBarcode: (barcode, options) =>
    guardLookup('openfoodfacts_v2', () => queryByBarcode(barcode, 'v2', options?.timeoutMs)),
};

/** 备用：v3 接口，语义与 v2 略有差异，v2 无结果时再试一次 */
export const openFoodFactsV3: BarcodeProvider = {
  id: 'openfoodfacts_v3',
  label: 'Open Food Facts (v3)',
  requiresKey: false,
  lookupByBarcode: (barcode, options) =>
    guardLookup('openfoodfacts_v3', () => queryByBarcode(barcode, 'v3', options?.timeoutMs)),
};

/** 关键词搜索：用于“拍商品”流程，以及条码未被收录时的兜底（§21 / §24） */
export const openFoodFactsSearch: KeywordSearchProvider = {
  id: 'openfoodfacts_search',
  label: 'Open Food Facts 关键词搜索',
  searchByKeyword(keyword: string, limit = 8, options?): Promise<LookupOutcome> {
    return guardLookup('openfoodfacts_search', async () => {
      const trimmed = keyword.trim();
      if (!trimmed) return { kind: 'no_match', source: 'openfoodfacts_search' };

      const url =
        `${BASE}/cgi/search.pl?search_terms=${encodeURIComponent(trimmed)}` +
        `&search_simple=1&action=process&json=1&page_size=${limit}&fields=${FIELDS}`;

      const result = await fetchJson<OffSearchResponse>(url, { timeoutMs: options?.timeoutMs });
      if (!result.ok || !result.data) {
        return {
          kind: 'unavailable',
          source: 'openfoodfacts_search',
          reason: `HTTP ${result.status}`,
        };
      }

      const candidates = (result.data.products ?? [])
        .map((p) => mapOffProduct(p, p.code ?? ''))
        .filter((c): c is ProductCandidate => c !== null);

      if (candidates.length === 0) {
        return { kind: 'no_match', source: 'openfoodfacts_search' };
      }
      return { kind: 'candidates', source: 'openfoodfacts_search', candidates };
    });
  },
};

export const OPEN_FOOD_FACTS_PROVIDERS: BarcodeProvider[] = [openFoodFactsV2, openFoodFactsV3];
