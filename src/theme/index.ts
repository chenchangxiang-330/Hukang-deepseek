/**
 * 视觉基调（产品需求 §50 / §51）
 *
 * 关键词：极简、薄荷绿、轻玻璃、健康科技感、大量留白。
 * 玻璃效果只允许出现在：底部 Dock、日期 Bottom Sheet、Scanner 控制区、弹窗、少量核心区域。
 */

export const colors = {
  /** 薄荷白背景 */
  background: '#F6FAF9',
  surface: '#FFFFFF',
  surfaceMuted: '#F0F6F4',

  /** 主色：薄荷绿 */
  mint: '#2FB894',
  mintDark: '#1F8F72',
  mintSoft: '#E4F4EF',
  mintLine: '#CDE9E1',

  /** 康康主体色 */
  mascotBody: '#BFEBDD',
  mascotInk: '#17332C',

  text: '#12211E',
  textSecondary: '#5F736E',
  textTertiary: '#93A5A1',
  textInverse: '#FFFFFF',

  border: '#E6EDEB',
  divider: '#EFF4F2',

  /** 临期与错误：只用轻微颜色，不做大面积红黄卡片（§14） */
  warn: '#D98A2B',
  warnSoft: '#FBF1E2',
  danger: '#CF5B54',
  dangerSoft: '#FAEBEA',
  calm: '#4E9E86',

  /** 半透明“如果吃下它”的新增区域（§48） */
  projectedFill: 'rgba(47, 184, 148, 0.28)',

  glass: 'rgba(255, 255, 255, 0.72)',
  glassBorder: 'rgba(255, 255, 255, 0.9)',
  scrim: 'rgba(9, 26, 22, 0.38)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const typography = {
  /** 页面大标题，例如“今天” */
  title: { fontSize: 28, fontWeight: '600' as const, letterSpacing: 0.2 },
  section: { fontSize: 16, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  label: { fontSize: 13, fontWeight: '500' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
  /** 营养大数字 */
  metric: { fontSize: 34, fontWeight: '600' as const, letterSpacing: -0.5 },
} as const;

/** 数字与进度条共用的浅色轨道 */
export const track = {
  height: 8,
  color: '#E9F1EE',
} as const;
