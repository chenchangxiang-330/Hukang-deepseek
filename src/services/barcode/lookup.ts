/**
 * 条形码查询编排（产品需求 §19 / §21 / §22 / §43）
 *
 * 扫描逻辑（§19）：
 *   Camera → Barcode → normalizeBarcode() → SQLite
 *     ├ 本地命中 → 直接显示商品
 *     └ 本地没有 → 自动联网查询（用户不需要点“联网搜索”）
 *
 * 结果状态必须分开（§43）：校验失败 ≠ 查不到 ≠ 网络故障。
 * 三者对用户的含义完全不同，绝不能合并成一句“不认识这款食品”。
 */

import { normalizeBarcode, type NormalizedBarcode } from '@/domain/barcode';
import { findProductByBarcode } from '@/db/repositories/productRepo';
import type { Product as ProductModel } from '@/domain/types';
import { OPEN_FOOD_FACTS_PROVIDERS } from '@/services/providers/openFoodFacts';
import { wikidataProvider } from '@/services/providers/wikidata';
import type { BarcodeProvider, ProductCandidate } from '@/services/providers/types';

export type BarcodeLookupResult =
  /** 本地 SQLite 命中，断网也能用 */
  | { kind: 'local'; barcode: NormalizedBarcode; product: ProductModel }
  /** 联网找到候选，需要用户确认后才落库（§22） */
  | {
      kind: 'online';
      barcode: NormalizedBarcode;
      source: string;
      candidates: ProductCandidate[];
    }
  /** 校验位不对：大概率没扫清楚，应该重扫，而不是说“查不到” */
  | { kind: 'invalid'; barcode: NormalizedBarcode }
  /** 所有数据源都明确回答“没有这个码” */
  | { kind: 'not_found'; barcode: NormalizedBarcode; triedSources: string[] }
  /** 数据源都不可用（网络问题）—— 不等于商品不存在 */
  | { kind: 'unavailable'; barcode: NormalizedBarcode; triedSources: string[] };

/** 默认数据源顺序：先 Open Food Facts（实测对中文商品也有覆盖），再 Wikidata 作为独立来源 */
export const DEFAULT_BARCODE_PROVIDERS: BarcodeProvider[] = [
  ...OPEN_FOOD_FACTS_PROVIDERS,
  wikidataProvider,
];

async function findLocal(barcode: NormalizedBarcode): Promise<ProductModel | null> {
  for (const key of barcode.lookupKeys) {
    const hit = await findProductByBarcode(key);
    if (hit) return hit;
  }
  return null;
}

export interface LookupOptions {
  providers?: BarcodeProvider[];
  /** 跳过联网（离线模式 / 用户关闭联网） */
  offlineOnly?: boolean;
}

export async function lookupBarcode(
  raw: string,
  hint?: string,
  options: LookupOptions = {},
): Promise<BarcodeLookupResult> {
  const barcode = normalizeBarcode(raw, hint);

  // 空码或校验位错误：先让用户重扫，不要浪费一次联网请求，也不要谎报“查不到”
  if (!barcode.valid || barcode.lookupKeys.length === 0) {
    return { kind: 'invalid', barcode };
  }

  // 第一步：本地
  const local = await findLocal(barcode);
  if (local) {
    return { kind: 'local', barcode, product: local };
  }

  if (options.offlineOnly) {
    return { kind: 'unavailable', barcode, triedSources: [] };
  }

  // 第二步：联网，逐个数据源、逐个查询键
  const providers = options.providers ?? DEFAULT_BARCODE_PROVIDERS;
  const triedSources: string[] = [];
  let sawUnavailable = false;
  let sawDefiniteMiss = false;

  for (const provider of providers) {
    for (const key of barcode.lookupKeys) {
      triedSources.push(`${provider.id}:${key}`);
      try {
        const outcome = await provider.lookupByBarcode(key);
        if (outcome.kind === 'candidates' && outcome.candidates.length > 0) {
          return {
            kind: 'online',
            barcode,
            source: outcome.source,
            candidates: outcome.candidates,
          };
        }
        if (outcome.kind === 'unavailable') {
          sawUnavailable = true;
        } else {
          sawDefiniteMiss = true;
        }
      } catch {
        // 单个数据源异常不影响整体流程，继续试下一个
        sawUnavailable = true;
      }
    }
  }

  // 只要有一个源明确回答“没有”，就说明确实没收录；
  // 全部不可用才归为网络问题。
  if (sawDefiniteMiss) {
    return { kind: 'not_found', barcode, triedSources };
  }
  if (sawUnavailable) {
    return { kind: 'unavailable', barcode, triedSources };
  }
  return { kind: 'not_found', barcode, triedSources };
}
