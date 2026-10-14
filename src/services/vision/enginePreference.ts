/**
 * 本地 OCR 引擎选择。
 *
 * 为什么需要这个开关（而不是直接写死 PP-OCRv5）：
 * 我们换引擎的依据是**离线验证**（Python 侧跑真实商品照片），
 * 但真机表现可能不同 —— 不同手机的降采样、摄像头噪点、
 * 内存压力都会影响结果。留一个开关就能在**同一台手机、同一张照片**上
 * 直接 A/B 对比，而不是靠装两个 APK 来回猜。
 *
 * 默认 `paddle`：实测在商品包装上召回几乎翻倍（5 行/17 字 → 10 行/~30 字）。
 */

import { getMeta, META_KEYS, setMeta } from '@/db/repositories/metaRepo';
import type { OcrEngine } from '../../../modules/hukang-vision';

export const OCR_ENGINES: readonly OcrEngine[] = ['paddle', 'mlkit'] as const;

export const DEFAULT_OCR_ENGINE: OcrEngine = 'paddle';

export const OCR_ENGINE_LABELS: Record<OcrEngine, string> = {
  paddle: 'PaddleOCR PP-OCRv5',
  mlkit: 'Google ML Kit',
};

function isOcrEngine(value: unknown): value is OcrEngine {
  return typeof value === 'string' && (OCR_ENGINES as readonly string[]).includes(value);
}

/**
 * 读取当前引擎。存的值非法（例如将来删掉某个引擎后遗留的旧值）时回落到默认值，
 * 而不是把非法值透传给原生层导致识别直接失败。
 */
export async function getOcrEngine(): Promise<OcrEngine> {
  const stored = await getMeta(META_KEYS.ocrEngine);
  return isOcrEngine(stored) ? stored : DEFAULT_OCR_ENGINE;
}

export async function setOcrEngine(engine: OcrEngine): Promise<void> {
  await setMeta(META_KEYS.ocrEngine, engine);
}
