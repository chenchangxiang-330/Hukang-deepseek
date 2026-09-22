/**
 * 拍商品识别编排（产品需求 §23 / §24 / §25 / §26）
 *
 * 流程：
 *   Photo
 *     → 图片质量检查（给建议，不阻断）
 *     → 如果照片里有条形码，先用条码查（最可靠）
 *     → OCR 读文字
 *     → 提取商品身份（品牌/商品名/口味/规格/品类）
 *     → 自动联网搜索
 *     → 候选商品
 *
 * 每一步都有明确状态，失败时用户至少能看到“走到哪一步、为什么没结果”，
 * 而不是拍照后什么都没发生（§33）。
 */

import { Camera, type BarcodeType } from 'expo-camera';

import { SUPPORTED_BARCODE_TYPES, normalizeBarcode, type NormalizedBarcode } from '@/domain/barcode';
import { HuKangError, toHuKangError } from '@/domain/errors';
import { lookupBarcode, type BarcodeLookupResult } from '@/services/barcode/lookup';
import { openFoodFactsSearch } from '@/services/providers/openFoodFacts';
import type { ProductCandidate } from '@/services/providers/types';
import { evaluateImageQuality, type QualityVerdict } from '@/services/vision/imageQuality';
import { measureImageQuality, runOcr, type OcrOutcome } from '@/services/vision/ocr';
import {
  buildSearchKeyword,
  extractProductIdentity,
  flattenOcrLines,
} from '@/services/vision/productIdentity';
import type { ProductIdentityExtraction } from '@/services/vision/types';
import type { ImageQualityMetrics } from '../../../modules/hukang-vision';

export type StepId = 'quality' | 'barcode' | 'ocr' | 'extract' | 'search';
export type StepStatus = 'running' | 'done' | 'skipped' | 'failed';

export interface RecognitionStep {
  id: StepId;
  label: string;
  status: StepStatus;
  /** 面向开发者的细节，最多显示在 Developer Mode */
  detail?: string;
}

export interface ProductRecognitionResult {
  quality: { metrics: ImageQualityMetrics; verdict: QualityVerdict } | null;
  /** 照片里的条形码（如果有） */
  barcode: NormalizedBarcode | null;
  /** 条码查询结果（走的是 Phase 2 的完整链路） */
  barcodeLookup: BarcodeLookupResult | null;
  ocr: OcrOutcome | null;
  identity: ProductIdentityExtraction | null;
  searchKeyword: string | null;
  candidates: ProductCandidate[] | null;
  candidatesSource: string | null;
  /** 只有真正失败时才有值；“没找到”不是异常 */
  error: HuKangError | null;
  steps: RecognitionStep[];
}

const STEP_LABELS: Record<StepId, string> = {
  quality: '检查照片',
  barcode: '找条形码',
  ocr: '读文字',
  extract: '理解商品',
  search: '联网搜索',
};

function makeSteps(): RecognitionStep[] {
  return (['quality', 'barcode', 'ocr', 'extract', 'search'] as StepId[]).map((id) => ({
    id,
    label: STEP_LABELS[id],
    status: 'running' as StepStatus,
  }));
}

export type StepListener = (steps: RecognitionStep[]) => void;

export async function recognizeProductPhoto(
  imageUri: string,
  onStep?: StepListener,
): Promise<ProductRecognitionResult> {
  const steps = makeSteps();
  const emit = () => onStep?.(steps.map((s) => ({ ...s })));
  const setStep = (id: StepId, status: StepStatus, detail?: string) => {
    const step = steps.find((s) => s.id === id);
    if (step) {
      step.status = status;
      step.detail = detail;
    }
    emit();
  };

  emit();

  const result: ProductRecognitionResult = {
    quality: null,
    barcode: null,
    barcodeLookup: null,
    ocr: null,
    identity: null,
    searchKeyword: null,
    candidates: null,
    candidatesSource: null,
    error: null,
    steps,
  };

  // ---------- 1. 图片质量（只给建议，绝不因此拒绝识别） ----------
  const metrics = await measureImageQuality(imageUri);
  if (metrics) {
    const verdict = evaluateImageQuality(metrics);
    result.quality = { metrics, verdict };
    setStep(
      'quality',
      'done',
      `亮度 ${Math.round(metrics.brightness)} · 清晰度 ${Math.round(metrics.blurScore)} · 反光 ${(metrics.glareRatio * 100).toFixed(1)}%`,
    );
  } else {
    setStep('quality', 'skipped', '质量分析不可用');
  }

  // ---------- 2. 照片里的条形码 ----------
  // §23：拍商品时如果照片里有条码，要一并利用 —— 它比纯文字可靠得多
  let barcodeFromImage: NormalizedBarcode | null = null;
  try {
    const found = await Camera.scanFromURLAsync(imageUri, [
      ...SUPPORTED_BARCODE_TYPES,
    ] as BarcodeType[]);
    const first = found.find((r) => !!r?.data);
    if (first) {
      const normalized = normalizeBarcode(first.data, first.type);
      if (normalized.valid) {
        barcodeFromImage = normalized;
        result.barcode = normalized;
        setStep('barcode', 'done', `${normalized.format} ${normalized.digits}`);
      } else {
        setStep('barcode', 'failed', '图片里的条码校验位不合法');
      }
    } else {
      setStep('barcode', 'skipped', '照片里没有条形码');
    }
  } catch (error) {
    setStep('barcode', 'failed', String((error as Error)?.message ?? error));
  }

  if (barcodeFromImage) {
    try {
      const lookup = await lookupBarcode(barcodeFromImage.digits, barcodeFromImage.format);
      result.barcodeLookup = lookup;
      if (lookup.kind === 'local' || lookup.kind === 'online') {
        // 条码命中就不必再猜文字了
        setStep('ocr', 'skipped', '已用条码命中商品');
        setStep('extract', 'skipped', '已用条码命中商品');
        setStep('search', 'done', lookup.kind === 'local' ? '本地命中' : '联网命中');
        return result;
      }
    } catch (error) {
      // 条码查询失败不影响继续走 OCR
      setStep('search', 'running', `条码查询失败：${String((error as Error)?.message ?? error)}`);
    }
  }

  // ---------- 3. OCR ----------
  let ocr: OcrOutcome;
  try {
    ocr = await runOcr(imageUri);
    result.ocr = ocr;
    setStep('ocr', 'done', `${ocr.lineCount} 行 / ${ocr.rawText.length} 字`);
  } catch (error) {
    const hkError = toHuKangError(error, 'OCR_FAILED', 'product_photo');
    result.error = hkError;
    setStep('ocr', 'failed', hkError.code);
    setStep('extract', 'skipped');
    setStep('search', 'skipped');
    return result;
  }

  // ---------- 4. 提取商品身份 ----------
  const lines = flattenOcrLines(ocr.blocks, ocr.height);
  const identity = extractProductIdentity(ocr.rawText, lines);
  result.identity = identity;
  const hasSomething = Boolean(identity.brand || identity.productName);
  setStep(
    'extract',
    hasSomething ? 'done' : 'failed',
    hasSomething
      ? `品牌=${identity.brand ?? '—'} 商品=${identity.productName ?? '—'} 规格=${identity.quantity ?? '—'}`
      : '没能从文字里认出品牌或商品名',
  );

  if (!hasSomething) {
    setStep('search', 'skipped', '缺少可搜索的关键词');
    result.error = new HuKangError('PRODUCT_VISUAL_FAILED', {
      task: 'product_photo',
      technical: { rawText: ocr.rawText, fileUri: imageUri },
    });
    return result;
  }

  // ---------- 5. 联网搜索 ----------
  const keyword = buildSearchKeyword(identity);
  result.searchKeyword = keyword;

  try {
    const outcome = await openFoodFactsSearch.searchByKeyword(keyword, 8);
    if (outcome.kind === 'candidates') {
      result.candidates = outcome.candidates;
      result.candidatesSource = outcome.source;
      setStep('search', 'done', `关键词「${keyword}」找到 ${outcome.candidates.length} 个候选`);
    } else if (outcome.kind === 'unavailable') {
      setStep('search', 'failed', `数据源不可用：${outcome.reason}`);
      result.error = new HuKangError('NETWORK_ERROR', {
        task: 'product_photo',
        technical: { message: '搜索数据源不可用', extra: { reason: outcome.reason } },
      });
    } else {
      setStep('search', 'failed', `关键词「${keyword}」没有结果`);
      result.error = new HuKangError('PRODUCT_SEARCH_NO_MATCH', {
        task: 'product_photo',
        technical: { message: '没有任何数据源返回候选', extra: { keyword } },
      });
    }
  } catch (error) {
    const hkError = toHuKangError(error, 'NETWORK_ERROR', 'product_photo');
    result.error = hkError;
    setStep('search', 'failed', hkError.code);
  }

  return result;
}
