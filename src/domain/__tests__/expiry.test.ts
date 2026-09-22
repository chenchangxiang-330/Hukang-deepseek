/**
 * 保质期与日期单元测试（测试策略第一层：Mac 本地）
 *
 * 守的是：今天到期 ≠ 已过期；非法日期不能被 Date 自动进位；
 * 由“生产日期 + 保质期”推算到期日只在能确定时给出结果。
 */

import {
  computeExpiryStatus,
  daysUntil,
  estimateExpiryDate,
  expiryStatusText,
} from '../expiry';
import { formatMonthDayWeekday, recentDateOptions, relativeDayLabel, toLocalDateString } from '../dates';

/** 固定“今天”，避免测试随真实日期漂移 */
const TODAY = new Date(2026, 8, 21); // 2026-09-21

describe('computeExpiryStatus', () => {
  it('昨天到期 → 已过期', () => {
    const r = computeExpiryStatus('2026-09-20', TODAY);
    expect(r.status).toBe('expired');
    expect(r.daysLeft).toBe(-1);
  });

  it('今天到期 → today，而不是已过期', () => {
    const r = computeExpiryStatus('2026-09-21', TODAY);
    expect(r.status).toBe('today');
    expect(r.daysLeft).toBe(0);
  });

  it('3 天内 / 7 天内 / 正常 的边界', () => {
    expect(computeExpiryStatus('2026-09-22', TODAY).status).toBe('within3');
    expect(computeExpiryStatus('2026-09-24', TODAY).status).toBe('within3');
    expect(computeExpiryStatus('2026-09-25', TODAY).status).toBe('within7');
    expect(computeExpiryStatus('2026-09-28', TODAY).status).toBe('within7');
    expect(computeExpiryStatus('2026-09-29', TODAY).status).toBe('normal');
  });

  it('没有到期日时是 unknown，不是 0 天也不是已过期', () => {
    expect(computeExpiryStatus(null, TODAY)).toEqual({ status: 'unknown', daysLeft: null });
    expect(computeExpiryStatus('', TODAY)).toEqual({ status: 'unknown', daysLeft: null });
  });

  it('非法日期不被接受', () => {
    expect(computeExpiryStatus('2026-02-31', TODAY).status).toBe('unknown');
    expect(computeExpiryStatus('2026/09/21', TODAY).status).toBe('unknown');
  });

  it('跨月计算正确', () => {
    expect(daysUntil('2026-10-01', TODAY)).toBe(10);
  });

  it('文案：正常状态显示剩余天数', () => {
    expect(expiryStatusText('normal', 16)).toBe('还有16天');
    expect(expiryStatusText('expired', -2)).toBe('已过期');
  });
});

describe('estimateExpiryDate —— 生产日期 + 保质期', () => {
  it('6个月', () => {
    expect(estimateExpiryDate('2026-03-21', '6个月')).toBe('2026-09-21');
  });

  it('45天', () => {
    expect(estimateExpiryDate('2026-09-01', '45天')).toBe('2026-10-16');
  });

  it('1年', () => {
    expect(estimateExpiryDate('2026-09-21', '1年')).toBe('2027-09-21');
  });

  it('无法确定时返回 null，交给用户填（不猜）', () => {
    expect(estimateExpiryDate('2026-09-21', '常温阴凉处')).toBeNull();
    expect(estimateExpiryDate('2026-09-21', null)).toBeNull();
    expect(estimateExpiryDate(null, '6个月')).toBeNull();
  });
});

describe('日期展示', () => {
  it('本地日期字符串不使用 UTC，避免跨日错位', () => {
    expect(toLocalDateString(new Date(2026, 8, 21, 23, 30))).toBe('2026-09-21');
    expect(toLocalDateString(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01');
  });

  it('相对日期标签', () => {
    expect(relativeDayLabel(new Date(2026, 8, 21), TODAY)).toBe('今天');
    expect(relativeDayLabel(new Date(2026, 8, 20), TODAY)).toBe('昨天');
    expect(relativeDayLabel(new Date(2026, 8, 19), TODAY)).toBe('前天');
    expect(relativeDayLabel(new Date(2026, 8, 18), TODAY)).toBeNull();
  });

  it('日期行格式为“9月21日 周一”', () => {
    expect(formatMonthDayWeekday(new Date(2026, 8, 21))).toBe('9月21日 周一');
  });

  it('最近日期列表默认第一条是今天', () => {
    const options = recentDateOptions(3, TODAY);
    expect(options).toHaveLength(3);
    expect(options[0].value).toBe('2026-09-21');
    expect(options[0].label).toBe('今天');
    expect(options[1].value).toBe('2026-09-20');
    expect(options[2].label).toBe('前天');
  });
});
