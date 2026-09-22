/**
 * 日期工具：本地日历日为准，不用 UTC，避免跨日错位。
 */

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 取本地日期的 YYYY-MM-DD */
export function toLocalDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function toLocalTimeString(date: Date = new Date()): string {
  const h = `${date.getHours()}`.padStart(2, '0');
  const m = `${date.getMinutes()}`.padStart(2, '0');
  return `${h}:${m}`;
}

/** 解析 YYYY-MM-DD；非法日期（如 2026-02-31）返回 null */
export function parseLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = DATE_PATTERN.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const;

export function weekdayName(date: Date): string {
  return WEEKDAYS[date.getDay()];
}

/** “9月21日 周一” —— 首页日期行的展示格式（§8） */
export function formatMonthDayWeekday(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日 ${weekdayName(date)}`;
}

/** 相对今天的口语化名称，用于最近日期列表 */
export function relativeDayLabel(date: Date, today: Date = new Date()): string | null {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((base.getTime() - target.getTime()) / 86400000);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff === 2) return '前天';
  return null;
}

export interface DateOption {
  /** YYYY-MM-DD */
  value: string;
  /** 主标签：今天 / 昨天 / 9月18日 */
  label: string;
  /** 次标签：日期或星期 */
  sublabel: string;
}

/** 最近 N 天的可选日期（§8：默认收起，展开显示最近日期） */
export function recentDateOptions(days = 14, today: Date = new Date()): DateOption[] {
  const out: DateOption[] = [];
  for (let i = 0; i < days; i += 1) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const relative = relativeDayLabel(date, today);
    out.push({
      value: toLocalDateString(date),
      label: relative ?? `${date.getMonth() + 1}月${date.getDate()}日`,
      sublabel: relative ? formatMonthDayWeekday(date) : weekdayName(date),
    });
  }
  return out;
}

export function isToday(dateString: string, today: Date = new Date()): boolean {
  return dateString === toLocalDateString(today);
}
