/**
 * Wikidata 作为**独立**的第二个商品数据源（产品需求 §21：不要只依赖 Open Food Facts）。
 *
 * 实测结论（2026-09 真实请求验证）：
 * - 接口可达，GTIN 属性为 P3962
 * - 但商品条码覆盖极少（实测查可口可乐条码命中 0 条）
 *   所以它排在 Open Food Facts 之后，命中率低但确实是另一个来源。
 *
 * 它只能提供**商品身份**（名称/品牌），不提供营养数据 —— 这恰好印证 §20：
 * 条形码只是商品标识符。拿不到的营养字段一律留 null，绝不用常识补（§38）。
 */

import { fetchJson } from '@/services/network/http';
import { guardLookup } from './helpers';
import type { BarcodeProvider, LookupOutcome, ProductCandidate } from './types';

const API = 'https://www.wikidata.org/w/api.php';
const GTIN_PROPERTY = 'P3962';

interface WdSearchResponse {
  query?: { search?: { title?: string; description?: string }[] };
}

interface WdEntityResponse {
  entities?: Record<
    string,
    {
      labels?: Record<string, { value?: string }>;
      descriptions?: Record<string, { value?: string }>;
      claims?: Record<string, { mainsnak?: { datavalue?: { value?: unknown } } }[]>;
    }
  >;
}

function pickLabel(
  labels: Record<string, { value?: string }> | undefined,
  langs: string[],
): string | null {
  if (!labels) return null;
  for (const lang of langs) {
    const v = labels[lang]?.value;
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/** P176 = brand；取品牌实体的 Q-id 后按需再查一次标签 */
function pickBrandId(entity: {
  claims?: Record<string, { mainsnak?: { datavalue?: { value?: unknown } } }[]>;
}): string | null {
  const claim = entity.claims?.['P176']?.[0];
  const value = claim?.mainsnak?.datavalue?.value as { id?: string } | undefined;
  return value?.id ?? null;
}

export const wikidataProvider: BarcodeProvider = {
  id: 'wikidata',
  label: 'Wikidata (GTIN P3962)',
  requiresKey: false,
  lookupByBarcode: (barcode) => guardLookup('wikidata', () => queryWikidata(barcode)),
};

/**
 * 该数据源在本开发环境实测不稳定（经常连不通），
 * 所以给一个更短的超时，避免拖慢整个查询链。
 */
const WIKIDATA_TIMEOUT_MS = 6000;

async function queryWikidata(barcode: string): Promise<LookupOutcome> {
  const searchUrl =
    `${API}?action=query&list=search&format=json&srlimit=3` +
    `&srsearch=${encodeURIComponent(`haswbstatement:${GTIN_PROPERTY}=${barcode}`)}`;

  const search = await fetchJson<WdSearchResponse>(searchUrl, { timeoutMs: WIKIDATA_TIMEOUT_MS });
  if (!search.ok || !search.data) {
    return { kind: 'unavailable', source: 'wikidata', reason: `HTTP ${search.status}` };
  }

  const hit = search.data.query?.search?.find((s) => /^Q\d+$/.test(s.title ?? ''));
  if (!hit?.title) {
    return { kind: 'no_match', source: 'wikidata' };
  }

  const entityUrl =
    `${API}?action=wbgetentities&format=json&props=labels|descriptions|claims` +
    `&languages=zh|zh-cn|en&ids=${hit.title}`;

  const entityResult = await fetchJson<WdEntityResponse>(entityUrl, {
    timeoutMs: WIKIDATA_TIMEOUT_MS,
  });
  const entity = entityResult.data?.entities?.[hit.title];
  if (!entity) {
    return { kind: 'no_match', source: 'wikidata' };
  }

  const name = pickLabel(entity.labels, ['zh', 'zh-cn', 'en']);
  if (!name) {
    return { kind: 'no_match', source: 'wikidata' };
  }

  const brandId = pickBrandId(entity);
  let brand: string | null = null;
  if (brandId) {
    const brandResult = await fetchJson<WdEntityResponse>(
      `${API}?action=wbgetentities&format=json&props=labels&languages=zh|zh-cn|en&ids=${brandId}`,
      { timeoutMs: WIKIDATA_TIMEOUT_MS },
    );
    brand = pickLabel(brandResult.data?.entities?.[brandId]?.labels, ['zh', 'zh-cn', 'en']);
  }

  const candidate: ProductCandidate = {
    source: 'wikidata',
    sourceId: hit.title,
    barcode,
    brand,
    name,
    variant: null,
    quantity: null,
    category: null,
    imageUrl: null,
    basisAmount: null,
    basisUnit: null,
    // Wikidata 不提供营养数据 —— 全部留 null，等用户拍营养成分表补全
    energy_kcal: null,
    energy_kj: null,
    protein_g: null,
    fat_g: null,
    carbohydrate_g: null,
    total_sugar_g: null,
    added_sugar_g: null,
    fiber_g: null,
    sodium_mg: null,
    ingredientsRawText: null,
    ingredientsList: null,
  };

  return { kind: 'candidates', source: 'wikidata', candidates: [candidate] };
}
