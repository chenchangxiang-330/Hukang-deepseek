/**
 * 手动创建商品（产品需求 §26 的出口之一）
 *
 * 原则：只有“名称”是必填，其余全部可以留空。
 * 留空 = 未记录（null），绝不是 0（§10 / §28）。
 * 用户在包装上看不到的项目，就应该能留空，而不是被迫填 0。
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
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

import { createProduct } from '@/db/repositories/productRepo';
import { NUTRITION_FIELDS, type NutritionField } from '@/domain/nutrition';
import { FIELD_LABELS, FIELD_UNITS } from '@/domain/nutritionFormat';
import type { NutritionBasisUnit, NutritionFacts } from '@/domain/types';
import { colors, radii, spacing, typography } from '@/theme';

/** 空字符串 → null；非数字 → null。绝不把空输入变成 0。 */
function parseNumber(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

const BASIS_UNITS: { key: NutritionBasisUnit; label: string }[] = [
  { key: 'g', label: '每 100g' },
  { key: 'ml', label: '每 100mL' },
  { key: 'serving', label: '每份' },
];

export default function ProductCreateScreen() {
  const { barcode } = useLocalSearchParams<{ barcode?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [quantity, setQuantity] = useState('');
  const [basisUnit, setBasisUnit] = useState<NutritionBasisUnit>('g');
  const [values, setValues] = useState<Record<NutritionField, string>>(() => {
    const initial = {} as Record<NutritionField, string>;
    for (const field of NUTRITION_FIELDS) initial[field] = '';
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setField = useCallback((field: NutritionField, text: string) => {
    setValues((prev) => ({ ...prev, [field]: text }));
  }, []);

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('请至少填写商品名称。');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const facts = {} as NutritionFacts;
      for (const field of NUTRITION_FIELDS) {
        facts[field] = parseNumber(values[field]);
      }

      const product = await createProduct({
        name: trimmedName,
        brand: brand.trim() || null,
        quantity: quantity.trim() || null,
        barcode: barcode?.trim() || null,
        nutrition_basis_amount: basisUnit === 'serving' ? 1 : 100,
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
  }, [basisUnit, barcode, brand, name, quantity, router, values]);

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
        <Field label="商品名称" required value={name} onChangeText={setName} placeholder="例如 东方树叶 乌龙茶" />
        <Field label="品牌" value={brand} onChangeText={setBrand} placeholder="例如 农夫山泉" />
        <Field label="规格" value={quantity} onChangeText={setQuantity} placeholder="例如 500mL" />
        {barcode ? <Text style={styles.hint}>条形码：{barcode}</Text> : null}

        <Text style={styles.sectionTitle}>营养基准</Text>
        <View style={styles.chipRow}>
          {BASIS_UNITS.map((option) => {
            const active = option.key === basisUnit;
            return (
              <Pressable
                key={option.key}
                accessibilityRole="button"
                onPress={() => setBasisUnit(option.key)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionTitle}>营养成分</Text>
        <Text style={styles.hint}>
          包装上没有的项目请留空，会记为“未记录”。不要填 0 —— 0 表示含量确实为零。
        </Text>
        {NUTRITION_FIELDS.filter((f) => f !== 'energy_kj').map((field) => (
          <Field
            key={field}
            label={`${FIELD_LABELS[field]} (${FIELD_UNITS[field]})`}
            value={values[field]}
            onChangeText={(text) => setField(field, text)}
            keyboardType="decimal-pad"
            placeholder="留空 = 未记录"
          />
        ))}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          disabled={saving}
          style={[styles.primaryButton, saving && styles.buttonDisabled]}
          onPress={handleSave}
        >
          <Text style={styles.primaryButtonText}>{saving ? '正在保存…' : '保存商品'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  required?: boolean;
  keyboardType?: 'default' | 'decimal-pad';
}

function Field({ label, value, onChangeText, placeholder, required, keyboardType }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.required}> *</Text> : null}
      </Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        keyboardType={keyboardType ?? 'default'}
        autoCorrect={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.md },
  sectionTitle: {
    ...typography.section,
    color: colors.text,
    marginTop: spacing.md,
  },
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
  chipRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.mintSoft, borderColor: colors.mintLine },
  chipText: { ...typography.label, color: colors.textSecondary },
  chipTextActive: { color: colors.mintDark },
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
});
