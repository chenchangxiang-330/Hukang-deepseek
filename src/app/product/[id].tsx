/**
 * 商品详情。
 *
 * Phase 2 只展示真实落库的内容。加入库存、记录一餐、“如果吃下它”
 * 分别在 Phase 6 / 7 接入 —— 在那之前这里不放假的按钮（§64）。
 */

import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KangKang } from '@/components/KangKang';
import { NutritionFactsList, ProductIdentity, SourceNotice } from '@/components/ProductFacts';
import { getProduct } from '@/db/repositories/productRepo';
import type { DataSource, Product } from '@/domain/types';
import { colors, radii, spacing, typography } from '@/theme';

const SOURCE_LABEL: Record<DataSource, string> = {
  manual: '手动录入',
  barcode_local: '本地已有',
  barcode_online: '联网商品数据库',
  product_search: '联网商品搜索',
  vision: '拍照识别',
  seed: '内置数据',
};

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        if (!id) {
          setLoading(false);
          return;
        }
        const found = await getProduct(id);
        if (!cancelled) {
          setProduct(found);
          setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [id]),
  );

  if (loading) {
    return (
      <View style={styles.centerBlock}>
        <KangKang size={72} mood="thinking" />
        <Text style={styles.dimText}>正在读取…</Text>
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.centerBlock}>
        <KangKang size={72} mood="sad" />
        <Text style={styles.dimText}>没有找到这个商品。</Text>
      </View>
    );
  }

  const fromOnline =
    product.data_source === 'barcode_online' || product.data_source === 'product_search';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
    >
      <ProductIdentity
        name={product.name}
        brand={product.brand}
        variant={product.variant}
        quantity={product.quantity}
        barcode={product.barcode}
        imageUri={product.image_uri}
      />

      <Text style={styles.sourceLine}>来源：{SOURCE_LABEL[product.data_source]}</Text>

      {fromOnline ? (
        <SourceNotice text="营养数据来自公开食品数据库，可能与包装有出入，建议核对包装标签。" />
      ) : null}

      <NutritionFactsList
        facts={product}
        basis={{
          amount: product.nutrition_basis_amount,
          unit: product.nutrition_basis_unit,
        }}
      />

      {product.ingredients_raw_text || product.ingredients_list ? (
        <View style={styles.ingredientsCard}>
          <Text style={styles.cardTitle}>配料</Text>
          {product.ingredients_list && product.ingredients_list.length > 0 ? (
            <View style={styles.ingredientChips}>
              {product.ingredients_list.map((item, index) => (
                <View key={`${item}-${index}`} style={styles.ingredientChip}>
                  <Text style={styles.ingredientChipText}>{item}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.ingredientsRaw}>{product.ingredients_raw_text}</Text>
          )}
        </View>
      ) : null}

      <View style={styles.pendingCard}>
        <Text style={styles.pendingTitle}>接下来</Text>
        <Text style={styles.pendingBody}>
          加入库存、记录一餐和“如果吃下它”会在后续阶段接入。现在这个商品已经存在本机，
          断网也能打开。
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        style={styles.textButton}
        onPress={() => router.replace('/scan')}
      >
        <Text style={styles.textButtonText}>再扫一个</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.lg },
  centerBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  dimText: { ...typography.body, color: colors.textSecondary },
  sourceLine: { ...typography.caption, color: colors.textTertiary },

  ingredientsCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: spacing.md,
  },
  cardTitle: { ...typography.section, color: colors.text },
  ingredientChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  ingredientChip: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  ingredientChipText: { ...typography.caption, color: colors.textSecondary },
  ingredientsRaw: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },

  pendingCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  pendingTitle: { ...typography.section, color: colors.text },
  pendingBody: { ...typography.caption, color: colors.textSecondary, lineHeight: 19 },

  textButton: { padding: spacing.md, alignItems: 'center' },
  textButtonText: { color: colors.textSecondary, fontSize: 14 },
});
