/**
 * 统一视觉能力接口（产品需求 §36）
 *
 * UI 绝不直接依赖某一个模型厂商。本地 OCR 与在线多模态模型都实现这个接口，
 * 未来替换 DeepSeek / OpenAI / 其它 Provider 时，UI 一行都不用改。
 *
 * 本地优先、联网增强（§35）：默认走本地实现，只有本地不足且用户允许时才联网。
 */

import type { NutritionBasisUnit } from '@/domain/types';

/** 从包装正面提取出的商品身份（§24） */
export interface ProductIdentityExtraction {
  brand: string | null;
  productName: string | null;
  variant: string | null;
  flavor: string | null;
  quantity: string | null;
  category: string | null;
  /** OCR 读到的全部文字，Developer Mode 可见 */
  visibleText: string;
  /** 照片里如果同时出现条形码，一并利用 */
  barcode: string | null;
  /**
   * 属于"猜出来的、不保证对"的字段名。
   *
   * 真机实测教训：品牌名被认成"東鵬吹将"（实际是"东鹏饮料"），
   * 界面照常显示、用户照常信。凡是靠启发式猜出来的字段，
   * 都应该让界面提醒一句"请核对"，而不是装作确定。
   */
  uncertainFields: string[];
}

/** 营养成分表的结构化结果（Phase 4 使用） */
export interface NutritionExtraction {
  basis: { amount: number | null; unit: NutritionBasisUnit | null };
  energy_kj: number | null;
  energy_kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbohydrate_g: number | null;
  total_sugar_g: number | null;
  added_sugar_g: number | null;
  fiber_g: number | null;
  sodium_mg: number | null;
  /** 模型/解析器自己都不确定的字段，必须显式列出，不能默默填数 */
  uncertainFields: string[];
  rawText: string;
}

export interface IngredientsExtraction {
  rawText: string;
  items: string[];
  /** 只是“可能含有添加糖”的提示，绝不据此计算添加糖克数（§30） */
  addedSugarHints: string[];
}

export interface ExpiryExtraction {
  productionDate: string | null;
  expiryDate: string | null;
  shelfLifeText: string | null;
  estimatedExpiryDate: string | null;
  rawText: string;
}

export interface VisionProviderCapabilities {
  /** 是否必须联网 */
  requiresNetwork: boolean;
  /** 支持哪些分析能力 */
  supports: {
    product: boolean;
    nutrition: boolean;
    ingredients: boolean;
    expiry: boolean;
  };
}

export interface FoodVisionProvider {
  readonly id: string;
  readonly label: string;
  readonly capabilities: VisionProviderCapabilities;

  analyzeProduct(imageUri: string): Promise<ProductIdentityExtraction>;
  analyzeNutrition(imageUri: string): Promise<NutritionExtraction>;
  analyzeIngredients(imageUri: string): Promise<IngredientsExtraction>;
  analyzeExpiry(imageUri: string): Promise<ExpiryExtraction>;
}
