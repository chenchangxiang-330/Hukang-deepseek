/**
 * 康康 —— 护康的吉祥物（产品需求 §52）
 *
 * 造型：淡薄荷绿圆形主体 + 深色圆眼睛 + 简单绿色弧形嘴巴 + 一侧弧形眉毛。
 * 全部用基础 View 绘制，不引入图片资源与 SVG 依赖，保证任何分辨率都清晰。
 *
 * 使用场合受限：启动页、空状态、扫描状态、成功/失败、临期提醒。
 * 不要每个页面都出现。
 */

import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

export type KangKangMood =
  /** 默认，平静 */
  | 'idle'
  /** 开心：嘴角更弯、眉毛上扬（识别成功） */
  | 'happy'
  /** 思考：一只眼眯起（扫描中 / 识别中） */
  | 'thinking'
  /** 关切：眉毛压低（临期提醒、需要注意） */
  | 'concerned'
  /** 遗憾：眼睛变小、嘴角向下（失败） */
  | 'sad';

interface Props {
  size?: number;
  mood?: KangKangMood;
}

export function KangKang({ size = 96, mood = 'idle' }: Props) {
  const s = size;
  const eyeSize = s * 0.13;
  const mouthWidth = s * 0.3;
  const mouthHeight = mouthWidth * 0.5;

  const eyeStyle = {
    width: eyeSize,
    height: mood === 'sad' ? eyeSize * 0.55 : eyeSize,
    borderRadius: eyeSize,
    backgroundColor: colors.mascotInk,
  };

  // 思考时右眼眯成一条线
  const rightEyeStyle =
    mood === 'thinking'
      ? { ...eyeStyle, height: Math.max(2, eyeSize * 0.22), borderRadius: eyeSize }
      : eyeStyle;

  const mouthColor = colors.mintDark;
  const isSad = mood === 'sad';

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="护康吉祥物康康"
      style={[
        styles.body,
        {
          width: s,
          height: s,
          borderRadius: s / 2,
          backgroundColor: colors.mascotBody,
        },
      ]}
    >
      {/* 眉毛：只在左侧一条，是康康的标志性表情线 */}
      <View
        style={[
          styles.arc,
          {
            width: s * 0.16,
            height: s * 0.08,
            borderBottomWidth: Math.max(1.5, s * 0.028),
            borderColor: mouthColor,
            borderBottomLeftRadius: s * 0.08,
            borderBottomRightRadius: s * 0.08,
            top: s * 0.16,
            left: s * 0.2,
            transform: [
              { rotate: mood === 'concerned' ? '18deg' : '-8deg' },
              { scaleY: mood === 'concerned' ? -1 : 1 },
            ],
          },
        ]}
      />

      <View style={[styles.eyesRow, { gap: s * 0.2, marginTop: s * 0.12 }]}>
        <View style={eyeStyle} />
        <View style={rightEyeStyle} />
      </View>

      {/* 嘴巴：向下弯的弧 → 微笑；翻转即难过 */}
      <View
        style={[
          styles.arc,
          {
            width: mouthWidth,
            height: isSad ? mouthHeight * 0.6 : mouthHeight,
            marginTop: s * 0.12,
            borderBottomWidth: Math.max(1.5, s * 0.03),
            borderColor: mouthColor,
            borderBottomLeftRadius: mouthWidth / 2,
            borderBottomRightRadius: mouthWidth / 2,
            transform: [
              { scaleY: isSad ? -1 : 1 },
              { scaleX: mood === 'happy' ? 1.15 : 1 },
            ],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyesRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  arc: {
    backgroundColor: 'transparent',
  },
});
