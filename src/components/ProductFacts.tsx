/**
 * 商品信息展示组件。
 *
 * 关键约束：null 一律显示“未记录”，0 显示 0（§10）。
 * 来源是公开数据库时必须提示用户核对包装（§21 / §22）。
 */

import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { NUTRITION_FIELDS, type NutritionField } from '@/domain/nutrition';
import { FIELD_LABELS, formatBasis, formatNutrientValue } from '@/domain/nutritionFormat';
import type { NutritionFacts } from '@/domain/types';
import { colors, radii, spacing, typography } from '@/theme';

export interface ProductIdentityProps {
  name: string;
  brand: string | null;
  variant?: string | null;
  quantity: string | null;
  barcode?: string | null;
  imageUri?: string | null;
}

export function ProductIdentity({
  name,
  brand,
  variant,
  quantity,
  barcode,
  imageUri,
}: ProductIdentityProps) {
  const subtitleParts = [brand, variant, quantity].filter((v): v is string => !!v && v.trim() !== '');

  return (
    <View style={styles.identityRow}>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.image} contentFit="contain" />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]}>
          <Text style={styles.imagePlaceholderText}>无图</Text>
        </View>
      )}

      <View style={styles.identityText}>
        <Text style={styles.name} numberOfLines={2}>
          {name}
        </Text>
        {subtitleParts.length > 0 ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitleParts.join(' · ')}
          </Text>
        ) : null}
        {barcode ? <Text style={styles.barcode}>{barcode}</Text> : null}
      </View>
    </View>
  );
}

export interface NutritionFactsListProps {
  facts: NutritionFacts;
  basis: { amount: number | null; unit: string | null };
  /** 只显示这些字段；默认显示全部 */
  fields?: NutritionField[];
}

export function NutritionFactsList({ facts, basis, fields }: NutritionFactsListProps) {
  const list = fields ?? [...NUTRITION_FIELDS];

  return (
    <View style={styles.factsBlock}>
      <View style={styles.factsHeader}>
        <Text style={styles.factsTitle}>营养成分</Text>
        <Text style={styles.factsBasis}>{formatBasis(basis)}</Text>
      </View>

      {list.map((field) => {
        const value = facts[field];
        const missing = value === null || value === undefined;
        // 两个能量字段留一个就够，避免重复展示
        if (field === 'energy_kj' && facts.energy_kj === null) return null;
        return (
          <View key={field} style={styles.factRow}>
            <Text style={styles.factLabel}>{FIELD_LABELS[field]}</Text>
            <Text style={[styles.factValue, missing && styles.factValueMissing]}>
              {formatNutrientValue(field, value)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export function SourceNotice({ text }: { text: string }) {
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  identityRow: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center' },
  image: {
    width: 84,
    height: 84,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
  },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  imagePlaceholderText: { ...typography.caption, color: colors.textTertiary },
  identityText: { flex: 1, gap: 3 },
  name: { fontSize: 19, fontWeight: '600', color: colors.text },
  subtitle: { ...typography.body, color: colors.textSecondary },
  barcode: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },

  factsBlock: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  factsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: spacing.xs,
  },
  factsTitle: { ...typography.section, color: colors.text },
  factsBasis: { ...typography.caption, color: colors.textTertiary },
  factRow: { flexDirection: 'row', justifyContent: 'space-between' },
  factLabel: { ...typography.body, color: colors.textSecondary },
  factValue: { ...typography.body, color: colors.text, fontWeight: '500' },
  factValueMissing: { color: colors.textTertiary, fontWeight: '400' },

  notice: {
    backgroundColor: colors.warnSoft,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  noticeText: { ...typography.caption, color: colors.warn, lineHeight: 18 },
});
