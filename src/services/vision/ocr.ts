/**
 * 本地 OCR 包装层（产品需求 §32 / §33）
 *
 * 失败绝不静默：读不到文字抛 OCR_NO_TEXT，原生异常抛 OCR_FAILED，
 * 上层据此进入明确的错误状态并给出“重拍 / 改文字 / 手动填写”的出路。
 */

import HukangVision from '../../../modules/hukang-vision';
import type { ImageQualityMetrics, OcrBlock } from '../../../modules/hukang-vision';
import { HuKangError } from '@/domain/errors';

export interface OcrOutcome {
  rawText: string;
  blocks: OcrBlock[];
  width: number;
  height: number;
  /** 行数，Developer Mode 用 */
  lineCount: number;
}

export function isLocalOcrAvailable(): boolean {
  return HukangVision != null;
}

export async function runOcr(imageUri: string): Promise<OcrOutcome> {
  if (!HukangVision) {
    throw new HuKangError('OCR_FAILED', {
      technical: { message: '本地 OCR 原生模块不可用（可能未在该平台实现）' },
    });
  }

  let result;
  try {
    result = await HukangVision.recognizeText(imageUri);
  } catch (error) {
    const err = error as { code?: string; message?: string };
    // 原生层区分的“读不到图片”要保留语义差异
    if (err?.code === 'OCR_IMAGE_UNREADABLE') {
      throw new HuKangError('PHOTO_FILE_INVALID', {
        technical: { message: err.message, fileUri: imageUri, nativeCode: err.code },
      });
    }
    throw new HuKangError('OCR_FAILED', {
      technical: { message: err?.message, fileUri: imageUri, nativeCode: err?.code },
    });
  }

  const rawText = (result?.text ?? '').trim();

  if (rawText === '') {
    throw new HuKangError('OCR_NO_TEXT', {
      technical: {
        message: 'OCR 执行成功但没有任何文字',
        fileUri: imageUri,
        extra: { width: result?.width, height: result?.height },
      },
    });
  }

  const lineCount = (result.blocks ?? []).reduce((sum, b) => sum + (b.lines?.length ?? 0), 0);

  return {
    rawText,
    blocks: result.blocks ?? [],
    width: result.width,
    height: result.height,
    lineCount,
  };
}

/** 读取图片质量指标；失败不阻断识别主流程，返回 null */
export async function measureImageQuality(
  imageUri: string,
): Promise<ImageQualityMetrics | null> {
  if (!HukangVision) return null;
  try {
    return await HukangVision.analyzeQuality(imageUri);
  } catch {
    return null;
  }
}
