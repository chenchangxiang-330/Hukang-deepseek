/**
 * 联网增强识别的用户授权（产品需求 §37）
 *
 * 首次上传食品图片前必须明确告知，并且**默认不开启**：
 *   “为了提高食品标签识别准确率，护康可以在本地识别不足时使用联网增强识别，
 *     仅上传当前食品图片用于识别。”
 *
 * 本地 OCR 始终是默认路径；联网只是 fallback，用户随时可以在设置里关掉。
 *
 * 注意：当前阶段（Phase 3）没有接入任何在线视觉模型，
 * 因此这里还没有“是否已经问过”的实际触发点 —— 先把授权状态与文案落地，
 * 等在线 Provider 接进来时直接复用，避免那时再补一个“默认已同意”的窟窿。
 */

import { getMetaBoolean, META_KEYS, setMetaBoolean } from '@/db/repositories/metaRepo';

/** 必须原文使用的告知文案 */
export const ONLINE_VISION_CONSENT_TEXT =
  '为了提高食品标签识别准确率，护康可以在本地识别不足时使用联网增强识别，仅上传当前食品图片用于识别。';

/** 用户是否允许联网增强识别（默认关闭） */
export function isOnlineVisionAllowed(): Promise<boolean> {
  return getMetaBoolean(META_KEYS.onlineVisionAllowed, false);
}

export async function setOnlineVisionAllowed(allowed: boolean): Promise<void> {
  await setMetaBoolean(META_KEYS.onlineVisionAllowed, allowed);
  await setMetaBoolean(META_KEYS.onlineVisionAsked, true);
}

/** 是否已经问过用户（用于“只在第一次问一次”） */
export function hasAskedOnlineVision(): Promise<boolean> {
  return getMetaBoolean(META_KEYS.onlineVisionAsked, false);
}

/**
 * 真正上传图片前的守卫。
 *
 * 返回 false 表示“不要联网”，调用方必须走本地路径或如实报错，
 * 绝不能因为拿不到授权就悄悄上传。
 */
export async function canUploadImageForRecognition(): Promise<boolean> {
  return isOnlineVisionAllowed();
}
