/**
 * hukang-vision 本地原生模块的 TypeScript 接口。
 *
 * 职责边界（§32 分层）：
 *   原生侧只到 OCR Raw Text + 位置信息；语义解析全部在 TS 侧完成。
 *
 * 用 requireOptionalNativeModule 而不是 requireNativeModule：
 * 模块只在 Android 上实现，其它平台拿到 null 后由上层降级，
 * 而不是让整个 App 直接崩掉。
 */

import { requireOptionalNativeModule } from 'expo-modules-core';

export interface OcrBoundingBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface OcrElement {
  text: string;
  boundingBox: OcrBoundingBox | null;
}

export interface OcrLine {
  text: string;
  boundingBox: OcrBoundingBox | null;
  elements: OcrElement[];
}

export interface OcrBlock {
  text: string;
  boundingBox: OcrBoundingBox | null;
  lines: OcrLine[];
}

export interface OcrResult {
  text: string;
  /** 识别时使用的图片尺寸（已按 EXIF 纠正方向） */
  width: number;
  height: number;
  blocks: OcrBlock[];
}

export interface ImageQualityMetrics {
  width: number;
  height: number;
  /** 平均亮度 0..255 */
  brightness: number;
  /** 拉普拉斯方差，越大越清晰 */
  blurScore: number;
  /** 接近纯白的像素占比（反光） */
  glareRatio: number;
  /** 过暗像素占比 */
  darkRatio: number;
}

export interface HukangVisionNativeModule {
  recognizeText(uri: string): Promise<OcrResult>;
  analyzeQuality(uri: string): Promise<ImageQualityMetrics>;
}

const HukangVision = requireOptionalNativeModule<HukangVisionNativeModule>('HukangVision');

export default HukangVision;

/** 原生模块是否可用（iOS / Web 上为 false） */
export const isHukangVisionAvailable = HukangVision != null;
