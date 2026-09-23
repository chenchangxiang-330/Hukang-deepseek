/**
 * 手动创建商品（产品需求 §26 的出口之一）
 *
 * 原则：只有“名称”是必填，其余全部可以留空。
 * 留空 = 未记录（null），绝不是 0（§10 / §28）。
 *
 * 营养部分复用 NutritionEditor —— 与“拍营养成分表”后的确认页共用同一套表单，
 * 避免两处规则不一致（例如一边允许留空、另一边偷偷填 0）。
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NutritionEditor } from '@/components/NutritionEditor';
import { createProduct } from '@/db/repositories/productRepo';
import {
  createEmptyDraft,
  draftToNutrition,
  type NutritionDraft,
} from '@/domain/nutritionDraft';
import { validateNutrition } from '@/domain/nutritionValidation';
import { colors, radii, spacing, typography } from '@/theme';

export default function ProductCreateScreen() {
  const { barcode, name: nameParam, brand: brandParam } = useLocalSearchParams<{
    barcode?: string;
    name?: string;
    brand?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState(nameParam ?? '');
  const [brand, setBrand] = useState(brandParam ?? '');
  const [quantity, setQuantity] = useState('');
  const [draft, setDraft] = useState<NutritionDraft>(() => createEmptyDraft());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 与「拍营养成分表」页共用同一套合理性校验，避免两处规则不一致
  const validationIssues = useMemo(() => {
    const { facts, basisAmount, basisUnit } = draftToNutrition(draft);
    return validateNutrition({ facts, basis: { amount: basisAmount, unit: basisUnit } });
  }, [draft]);
  const blockingIssues = validationIssues.filter((i) => i.severity === 'reject');
  const warningIssues = validationIssues.filter((i) => i.severity === 'warn');

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('请至少填写商品名称。');
      return;
    }

    if (blockingIssues.length > 0) {
      setError(blockingIssues[0].message);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const { facts, basisAmount, basisUnit } = draftToNutrition(draft);

      const product = await createProduct({
        name: trimmedName,
        brand: brand.trim() || null,
        quantity: quantity.trim() || null,
        barcode: barcode?.trim() || null,
        nutrition_basis_amount: basisAmount,
        nutrition_basis_unit: basisUnit,
        ...facts,
        data_source: 'manual',
      });

      router.replace({ pathname: '/product/[id]', params: { id: product.id } });
    } catch {
      setError('保存失败，请再试一次。');
    } finally {
      setSaving(false);
    }
  }, [barcode, blockingIssues, brand, draft, name, quantity, router]);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionTitle}>基本信息</Text>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>
            商品名称<Text style={styles.required}> *</Text>
          </Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="例如 东方树叶 乌龙茶"
            placeholderTextColor={colors.textTertiary}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>品牌</Text>
          <TextInput
            style={styles.input}
            value={brand}
            onChangeText={setBrand}
            placeholder="例如 农夫山泉"
            placeholderTextColor={colors.textTertiary}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>规格</Text>
          <TextInput
            style={styles.input}
            value={quantity}
            onChangeText={setQuantity}
            placeholder="例如 500mL"
            placeholderTextColor={colors.textTertiary}
          />
        </View>

        {barcode ? <Text style={styles.hint}>条形码：{barcode}</Text> : null}

        <Text style={styles.sectionTitle}>营养成分</Text>
        <NutritionEditor draft={draft} onChange={setDraft} />

        {blockingIssues.length > 0 ? (
          <View style={styles.blockingCard}>
            {blockingIssues.map((issue, index) => (
              <Text key={`${issue.field}-${index}`} style={styles.blockingText}>
                {issue.message}
              </Text>
            ))}
          </View>
        ) : null}
        {blockingIssues.length === 0 && warningIssues.length > 0 ? (
          <View style={styles.warningCard}>
            {warningIssues.map((issue, index) => (
              <Text key={`${issue.field}-${index}`} style={styles.warningText}>
                {issue.message}
              </Text>
            ))}
          </View>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          disabled={saving || blockingIssues.length > 0}
          style={[styles.primaryButton, saving && styles.buttonDisabled]}
          onPress={handleSave}
        >
          <Text style={styles.primaryButtonText}>{saving ? '正在保存…' : '保存商品'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.md },
  sectionTitle: { ...typography.section, color: colors.text, marginTop: spacing.md },
  field: { gap: spacing.xs },
  fieldLabel: { ...typography.label, color: colors.textSecondary },
  required: { color: colors.danger },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.text,
  },
  hint: { ...typography.caption, color: colors.textTertiary, lineHeight: 18 },
  primaryButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.mint,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: colors.textInverse, fontSize: 15, fontWeight: '600' },
  errorText: { ...typography.body, color: colors.danger },
  blockingCard: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  blockingText: { ...typography.body, color: colors.danger, lineHeight: 20 },
  warningCard: {
    backgroundColor: colors.warnSoft,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  warningText: { ...typography.body, color: colors.warn, lineHeight: 20 },
});
