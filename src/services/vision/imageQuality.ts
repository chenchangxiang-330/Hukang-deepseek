/**
 * 图片质量判定（产品需求 §41）
 *
 * 原生侧只给客观指标，这里负责**把指标翻译成用户能照做的建议**：
 *   “照片有点糊，再靠近一点。” / “光线有点暗。” / “包装反光较强，换个角度试试。”
 *
 * 全部是纯函数，阀值可以随时调、也能被单元测试覆盖。
 * 绝不把各种问题笼统地说成“识别失败”。
 */

import type { ErrorCode } from '@/domain/errors';
import type { ImageQualityMetrics } from '../../../modules/hukang-vision';

export interface QualityThresholds {
  /** 平均亮度下限 */
  minBrightness: number;
  /** 平均亮度上限（过曝） */
  maxBrightness: number;
  /** 拉普拉斯方差下限（低于此值判为模糊） */
  minBlurScore: number;
  /** 反光像素占比上限 */
  maxGlareRatio: number;
  /** 过暗像素占比上限 */
  maxDarkRatio: number;
}

/**
 * 默认阈值。
 *
 * 说明：这些数值是工程经验值，**尚未在真实食品包装照片上标定**
 * （当前无真机、无模拟器，无法用实拍样本调参）。
 * 因此判定结果只用于给出拍摄建议，绝不作为“拒绝识别”的硬门槛。
 */
export const DEFAULT_QUALITY_THRESHOLDS: QualityThresholds = {
  minBrightness: 60,
  maxBrightness: 235,
  minBlurScore: 60,
  maxGlareRatio: 0.08,
  maxDarkRatio: 0.35,
};

export type QualityLevel = 'good' | 'warn' | 'bad';

export interface QualityIssue {
  code: ErrorCode;
  level: QualityLevel;
  /** 面向用户的建议（禁止技术词汇） */
  advice: string;
}

export interface QualityVerdict {
  /** 最严重的问题等级 */
  level: QualityLevel;
  issues: QualityIssue[];
  /** 是否建议用户重拍；注意：即使为 true 也仍然继续尝试识别 */
  shouldRetake: boolean;
}

/**
 * 判定顺序刻意从“最影响识别”到“最不影响”：
 * 糊 > 过暗 > 反光 > 过曝
 */
export function evaluateImageQuality(
  metrics: ImageQualityMetrics,
  thresholds: QualityThresholds = DEFAULT_QUALITY_THRESHOLDS,
): QualityVerdict {
  const issues: QualityIssue[] = [];

  if (metrics.blurScore < thresholds.minBlurScore) {
    issues.push({
      code: 'IMAGE_TOO_BLURRY',
      level: 'bad',
      advice: '照片有点糊，再靠近一点。',
    });
  }

  const tooDark =
    metrics.brightness < thresholds.minBrightness || metrics.darkRatio > thresholds.maxDarkRatio;
  if (tooDark) {
    issues.push({ code: 'IMAGE_TOO_DARK', level: 'bad', advice: '光线有点暗。' });
  }

  if (metrics.glareRatio > thresholds.maxGlareRatio) {
    issues.push({
      code: 'IMAGE_GLARE',
      level: 'warn',
      advice: '包装反光较强，换个角度试试。',
    });
  }

  if (metrics.brightness > thresholds.maxBrightness) {
    issues.push({
      code: 'IMAGE_TOO_BRIGHT',
      level: 'warn',
      advice: '光线太亮了，避开直射光。',
    });
  }

  const level: QualityLevel = issues.some((i) => i.level === 'bad')
    ? 'bad'
    : issues.length > 0
      ? 'warn'
      : 'good';

  return {
    level,
    issues,
    // 只有“拍糊了”和“太暗”这类几乎必然导致识别失败的问题才建议重拍
    shouldRetake: issues.some((i) => i.level === 'bad'),
  };
}
