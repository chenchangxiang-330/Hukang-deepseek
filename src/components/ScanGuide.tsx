/**
 * 五种扫描任务的极简示意图（产品需求 §18）
 *
 * 普通用户不一定知道该拍哪里，所以每个入口都要有：
 *   一张示意图 + 一句拍摄提示
 *
 * 全部用基础 View 绘制，尺寸随 size 缩放。
 */

import { StyleSheet, View } from 'react-native';

import { ScanTask } from '@/domain/errors';
import { colors } from '@/theme';

/** 五种任务与错误分类体系共用同一套 key，避免两处定义漂移 */
export type ScanTaskKey = ScanTask;

interface GuideProps {
  size?: number;
}

const BAR_WIDTHS = [2, 1, 3, 1, 2, 1, 1, 3, 2, 1, 3, 1, 2, 1];

/** ① 商品条形码：黑白条纹 */
export function BarcodeGuide({ size = 56 }: GuideProps) {
  const barHeight = size * 0.5;
  return (
    <View style={[styles.frame, { width: size, height: size, backgroundColor: '#FFFFFF' }]}>
      <View style={[styles.barcodeRow, { height: barHeight, gap: size * 0.018 }]}>
        {BAR_WIDTHS.map((w, i) => (
          <View
            key={i}
            style={{
              width: Math.max(1, (w * size) / 46),
              height: barHeight,
              backgroundColor: '#1B1B1B',
            }}
          />
        ))}
      </View>
      <View style={[styles.barcodeDigits, { marginTop: size * 0.06 }]}>
        {Array.from({ length: 13 }).map((_, i) => (
          <View
            key={i}
            style={{
              width: size * 0.028,
              height: size * 0.055,
              backgroundColor: '#C9D2D0',
            }}
          />
        ))}
      </View>
    </View>
  );
}

/** ② 拍商品：完整包装正面，突出品牌 / 商品名 / 口味 / 规格 */
export function ProductPhotoGuide({ size = 56 }: GuideProps) {
  return (
    <View style={[styles.frame, { width: size, height: size, backgroundColor: '#FFFFFF' }]}>
      <View
        style={[
          styles.package,
          { width: size * 0.62, height: size * 0.76, borderColor: colors.mintLine },
        ]}
      >
        {/* 品牌 logo 位置 */}
        <View
          style={{
            width: size * 0.16,
            height: size * 0.16,
            borderRadius: size * 0.08,
            backgroundColor: colors.mintSoft,
            marginTop: size * 0.07,
          }}
        />
        {/* 商品名称 */}
        <View
          style={{
            width: size * 0.42,
            height: size * 0.075,
            borderRadius: 2,
            backgroundColor: colors.mascotInk,
            marginTop: size * 0.07,
          }}
        />
        {/* 口味 */}
        <View
          style={{
            width: size * 0.3,
            height: size * 0.05,
            borderRadius: 2,
            backgroundColor: '#D5DEDC',
            marginTop: size * 0.05,
          }}
        />
        {/* 规格 */}
        <View
          style={{
            width: size * 0.2,
            height: size * 0.05,
            borderRadius: 2,
            backgroundColor: '#E4EAE8',
            marginTop: size * 0.04,
          }}
        />
      </View>
    </View>
  );
}

/** ③ 营养成分表：一张小表格 */
export function NutritionLabelGuide({ size = 56 }: GuideProps) {
  const rows = 5;
  return (
    <View style={[styles.frame, { width: size, height: size, backgroundColor: '#FFFFFF' }]}>
      <View style={{ width: size * 0.68 }}>
        {/* 标题条 */}
        <View
          style={{
            height: size * 0.1,
            borderRadius: 2,
            backgroundColor: colors.mintSoft,
            marginBottom: size * 0.05,
          }}
        />
        {Array.from({ length: rows }).map((_, i) => (
          <View
            key={i}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              marginBottom: size * 0.05,
            }}
          >
            <View
              style={{
                width: size * (0.3 - i * 0.02),
                height: size * 0.05,
                borderRadius: 1,
                backgroundColor: '#D5DEDC',
              }}
            />
            <View
              style={{
                width: size * 0.14,
                height: size * 0.05,
                borderRadius: 1,
                backgroundColor: '#E4EAE8',
              }}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

/** ④ 配料表：连续的文字行 */
export function IngredientsLabelGuide({ size = 56 }: GuideProps) {
  const widths = [0.62, 0.68, 0.5, 0.66, 0.36];
  return (
    <View style={[styles.frame, { width: size, height: size, backgroundColor: '#FFFFFF' }]}>
      <View style={{ width: size * 0.68 }}>
        {/* “配料：” 标记 */}
        <View
          style={{
            width: size * 0.16,
            height: size * 0.07,
            borderRadius: 2,
            backgroundColor: colors.mascotInk,
            marginBottom: size * 0.06,
          }}
        />
        {widths.map((w, i) => (
          <View
            key={i}
            style={{
              width: size * w,
              height: size * 0.055,
              borderRadius: 1,
              backgroundColor: '#D5DEDC',
              marginBottom: size * 0.05,
            }}
          />
        ))}
      </View>
    </View>
  );
}

/** ⑤ 生产日期 / 保质期：两行带标签的日期 */
export function ExpiryDateGuide({ size = 56 }: GuideProps) {
  return (
    <View style={[styles.frame, { width: size, height: size, backgroundColor: '#FFFFFF' }]}>
      <View style={{ width: size * 0.7 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: size * 0.07 }}>
          <View
            style={{
              width: size * 0.16,
              height: size * 0.06,
              borderRadius: 1,
              backgroundColor: '#C9D2D0',
              marginRight: size * 0.05,
            }}
          />
          <View
            style={{
              width: size * 0.4,
              height: size * 0.085,
              borderRadius: 2,
              backgroundColor: colors.mascotInk,
            }}
          />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View
            style={{
              width: size * 0.16,
              height: size * 0.06,
              borderRadius: 1,
              backgroundColor: '#C9D2D0',
              marginRight: size * 0.05,
            }}
          />
          <View
            style={{
              width: size * 0.26,
              height: size * 0.075,
              borderRadius: 2,
              backgroundColor: '#D5DEDC',
            }}
          />
        </View>
      </View>
    </View>
  );
}

export const SCAN_GUIDES: Record<ScanTaskKey, (props: GuideProps) => React.ReactElement> = {
  barcode: BarcodeGuide,
  product_photo: ProductPhotoGuide,
  nutrition_label: NutritionLabelGuide,
  ingredients_label: IngredientsLabelGuide,
  expiry_date: ExpiryDateGuide,
};

const styles = StyleSheet.create({
  frame: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  barcodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  barcodeDigits: {
    flexDirection: 'row',
    gap: 1.5,
  },
  package: {
    borderWidth: 1.2,
    borderRadius: 6,
    alignItems: 'center',
  },
});
