/**
 * 保质期状态计算：纯函数，便于本地单测。
 *
 * 全部按“本地日历日”比较，避免用毫秒差导致今天到期的商品被判成已过期。
 */

import { ExpiryStatus } from './types';
import { parseLocalDate, toLocalDateString } from './dates';

// 日期基础工具统一放在 dates.ts，这里只做保质期语义的计算
export { parseLocalDate, toLocalDateString, toLocalTimeString } from './dates';

/** 相差的整天数：expiry - today。今天到期 = 0，昨天到期 = -1 */
export function daysUntil(expiryDate: string | null | undefined, today: Date = new Date()): number | null {
  const expiry = parseLocalDate(expiryDate);
  if (!expiry) return null;
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffMs = expiry.getTime() - base.getTime();
  return Math.round(diffMs / 86400000);
}

/** 产品需求 §15：已过期 / 今天到期 / 3天内 / 7天内 / 正常 */
export function computeExpiryStatus(
  expiryDate: string | null | undefined,
  today: Date = new Date(),
): { status: ExpiryStatus; daysLeft: number | null } {
  const daysLeft = daysUntil(expiryDate, today);
  if (daysLeft == null) return { status: 'unknown', daysLeft: null };
  if (daysLeft < 0) return { status: 'expired', daysLeft };
  if (daysLeft === 0) return { status: 'today', daysLeft };
  if (daysLeft <= 3) return { status: 'within3', daysLeft };
  if (daysLeft <= 7) return { status: 'within7', daysLeft };
  return { status: 'normal', daysLeft };
}

const STATUS_TEXT: Record<ExpiryStatus, string> = {
  expired: '已过期',
  today: '今天到期',
  within3: '3天内',
  within7: '7天内',
  normal: '正常',
  unknown: '未记录日期',
};

export function expiryStatusText(status: ExpiryStatus, daysLeft: number | null): string {
  if (status === 'normal' && daysLeft != null) return `还有${daysLeft}天`;
  return STATUS_TEXT[status];
}

/**
 * 由生产日期 + 保质期文本推算到期日（§31）。
 * 只处理明确的“N天/N个月/N年”，推不出来就返回 null 交给用户填。
 */
export function estimateExpiryDate(
  productionDate: string | null | undefined,
  shelfLifeText: string | null | undefined,
): string | null {
  const start = parseLocalDate(productionDate);
  if (!start || !shelfLifeText) return null;

  const text = shelfLifeText.replace(/\s/g, '');
  const match = /^(\d+)(天|日|个月|月|年)$/.exec(text);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const result = new Date(start.getTime());
  switch (match[2]) {
    case '天':
    case '日':
      result.setDate(result.getDate() + amount);
      break;
    case '个月':
    case '月':
      result.setMonth(result.getMonth() + amount);
      break;
    case '年':
      result.setFullYear(result.getFullYear() + amount);
      break;
    default:
      return null;
  }
  return toLocalDateString(result);
}
