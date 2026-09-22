/**
 * 候选商品落库（产品需求 §22）
 *
 * “任何联网找到并由用户确认的商品：保存 SQLite。
 *   第一次联网认识，第二次优先本地认识。”
 *
 * 落库后 data_source 记录真实来源，界面上必须提示“来自公开数据库，请核对包装”。
 */

import { createProduct, upsertProductByBarcode } from '@/db/repositories/productRepo';
import type { DataSource, Product } from '@/domain/types';
import { downloadRemoteImage } from '@/services/media/remoteImage';
import { newId } from '@/utils/id';
import type { ProductCandidate } from '@/services/providers/types';

/** 数据源标识 → 我们的 DataSource 枚举 */
function toDataSource(candidate: ProductCandidate): DataSource {
  switch (candidate.source) {
    case 'openfoodfacts_v2':
    case 'openfoodfacts_v3':
    case 'openfoodfacts_search':
      return 'barcode_online';
    case 'wikidata':
      return 'product_search';
    default:
      return 'barcode_online';
  }
}

export interface SaveCandidateResult {
  product: Product;
  /** 商品图片是否成功下载到本地（失败不影响落库） */
  imageDownloaded: boolean;
}

export async function saveCandidateAsProduct(
  candidate: ProductCandidate,
): Promise<SaveCandidateResult> {
  const extension = candidate.imageUrl?.match(/\.(jpe?g|png|webp)(?:\?|$)/i)?.[1] ?? 'jpg';
  const localImage = await downloadRemoteImage(
    candidate.imageUrl,
    `product-${newId()}.${extension.toLowerCase()}`,
  );

  const input = {
    brand: candidate.brand,
    name: candidate.name,
    variant: candidate.variant,
    quantity: candidate.quantity,
    category: candidate.category,
    image_uri: localImage,
    nutrition_basis_amount: candidate.basisAmount,
    nutrition_basis_unit: candidate.basisUnit,
    energy_kcal: candidate.energy_kcal,
    energy_kj: candidate.energy_kj,
    protein_g: candidate.protein_g,
    fat_g: candidate.fat_g,
    carbohydrate_g: candidate.carbohydrate_g,
    total_sugar_g: candidate.total_sugar_g,
    added_sugar_g: candidate.added_sugar_g,
    fiber_g: candidate.fiber_g,
    sodium_mg: candidate.sodium_mg,
    ingredients_raw_text: candidate.ingredientsRawText,
    ingredients_list: candidate.ingredientsList,
    data_source: toDataSource(candidate),
  };

  const product = candidate.barcode
    ? await upsertProductByBarcode(candidate.barcode, input)
    : await createProduct(input);

  return { product, imageDownloaded: localImage !== null };
}
