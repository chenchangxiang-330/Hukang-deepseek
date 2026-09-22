/**
 * 联网商品数据源接口（产品需求 §21 / §36 的思路）
 *
 * UI 绝不直接依赖某一个数据源。这里定义统一的 Provider 形状，
 * 以后要加新来源（含需要 API Key 的商业库）只需实现这个接口。
 *
 * 数据源只提供**它确实有的字段**。没有的字段一律留 null，
 * 绝不用常识补齐（§38）。
 */

import type { NutritionBasisUnit } from '@/domain/types';

/** 单个候选商品，尚未落库 */
export interface ProductCandidate {
  /** 数据源标识，落库时写入 data_source */
  source: string;
  /** 数据源内部 id，便于 Developer Mode 追溯 */
  sourceId: string | null;
  barcode: string | null;
  brand: string | null;
  name: string;
  variant: string | null;
  quantity: string | null;
  category: string | null;
  imageUrl: string | null;

  /** 数据源是否明确给出了营养基准 */
  basisAmount: number | null;
  basisUnit: NutritionBasisUnit | null;

  energy_kcal: number | null;
  energy_kj: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbohydrate_g: number | null;
  total_sugar_g: number | null;
  added_sugar_g: number | null;
  fiber_g: number | null;
  sodium_mg: number | null;

  ingredientsRawText: string | null;
  ingredientsList: string[] | null;
}

export type LookupOutcome =
  /** 数据源明确回答：库里没有这个码 */
  | { kind: 'no_match'; source: string }
  /** 数据源给出候选 */
  | { kind: 'candidates'; source: string; candidates: ProductCandidate[] }
  /** 数据源暂时不可用（网络/服务异常），不代表商品不存在 */
  | { kind: 'unavailable'; source: string; reason: string };

export interface BarcodeProvider {
  /** 稳定的数据源标识 */
  readonly id: string;
  /** 展示名（Developer Mode 用） */
  readonly label: string;
  /** 是否需要 API Key */
  readonly requiresKey: boolean;
  /** 当前是否可用（例如商业库没配 Key 就不可用） */
  lookupByBarcode(barcode: string): Promise<LookupOutcome>;
}

export interface KeywordSearchProvider {
  readonly id: string;
  readonly label: string;
  searchByKeyword(keyword: string, limit?: number): Promise<LookupOutcome>;
}
