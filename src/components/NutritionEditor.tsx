/**
 * 营养数据编辑器（产品需求 §27 用户确认）
 *
 * 同一套表单被两个地方复用：
 *   - 手动创建商品（product/create）
 *   - 拍营养成分表后的确认（scan/nutrition-result）
 *
 * 关键行为：留空 = 未记录。界面上必须把这件事讲清楚，
 * 否则用户会把“不知道”填成 0，直接污染数据。
 */

import { StyleSheet, Text, TextInput, View, Pressable } from 'react-native';

import { NUTRITION_FIELDS, type NutritionField } from '@/domain/nutrition';
import type { NutritionDraft } from '@/domain/nutritionDraft';
import { FIELD_LABELS, FIELD_UNITS, NOT_RECORDED } from '@/domain/nutritionFormat';
import type { NutritionBasisUnit } from '@/domain/types';
import { colors, radii, spacing, typography } from '@/theme';

const BASIS_UNITS: { key: NutritionBasisUnit; label: string }[] = [
  { key: 'g', label: '每 100g' },
  { key: 'ml', label: '每 100mL' },
  { key: 'serving', label: '每份' },
  { key: 'package', label: '每包装' },
];

export interface NutritionEditorProps {
  draft: NutritionDraft;
  onChange: (next: NutritionDraft) => void;
  /** 解析时不确定的字段（缺单位、上限写法等），需要提示用户核对 */
  uncertainFields?: NutritionField[];
  /** 每个字段的来源行，帮用户核对 */
  evidenceByField?: Partial<Record<NutritionField, string>>;
  /** 隐藏能量(kJ)——只在同时有 kcal 时才展示 */
  hiddenFields?: NutritionField[];
}

export function NutritionEditor({
  draft,
  onChange,
  uncertainFields = [],
  evidenceByField,
  hiddenFields = [],
}: NutritionEditorProps) {
  const setField = (field: NutritionField, text: string) => {
    onChange({ ...draft, values: { ...draft.values, [field]: text } });
  };

  const visibleFields = NUTRITION_FIELDS.filter((f) => !hiddenFields.includes(f));

  return (
    <View style={styles.container}>
      <View style={styles.basisBlock}>
        <Text style={styles.basisLabel}>营养基准</Text>
        <View style={styles.chipRow}>
          {BASIS_UNITS.map((option) => {
            const active = option.key === draft.basisUnit;
            return (
              <Pressable
                key={option.key}
                accessibilityRole="button"
                onPress={() => onChange({ ...draft, basisUnit: option.key })}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {draft.basisUnit === 'serving' || draft.basisUnit === 'package' ? null : (
          <View style={styles.basisAmountRow}>
            <Text style={styles.fieldLabel}>基准数量</Text>
            <TextInput
              style={[styles.input, styles.basisAmountInput]}
              value={draft.basisAmount}
              onChangeText={(text) => onChange({ ...draft, basisAmount: text })}
              keyboardType="decimal-pad"
              placeholder="100"
              placeholderTextColor={colors.textTertiary}
            />
          </View>
        )}
      </View>

      <Text style={styles.hint}>
        包装上没有的项目请留空，会记为“{NOT_RECORDED}”。不要填 0 —— 0 表示含量确实为零。
      </Text>

      {visibleFields.map((field) => {
        const uncertain = uncertainFields.includes(field);
        const evidence = evidenceByField?.[field];
        return (
          <View key={field} style={styles.field}>
            <View style={styles.fieldHeader}>
              <Text style={styles.fieldLabel}>
                {FIELD_LABELS[field]}（{FIELD_UNITS[field]}）
              </Text>
              {uncertain ? <Text style={styles.uncertain}>需要确认</Text> : null}
            </View>
            <TextInput
              style={[styles.input, uncertain && styles.inputUncertain]}
              value={draft.values[field]}
              onChangeText={(text) => setField(field, text)}
              keyboardType="decimal-pad"
              placeholder={NOT_RECORDED}
              placeholderTextColor={colors.textTertiary}
            />
            {evidence ? <Text style={styles.evidence}>读到：{evidence}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  basisBlock: { gap: spacing.sm },
  basisLabel: { ...typography.section, color: colors.text },
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

  basisAmountRow: { gap: spacing.xs, marginTop: spacing.xs },
  basisAmountInput: { width: 120 },

  hint: { ...typography.caption, color: colors.textTertiary, lineHeight: 18 },

  field: { gap: spacing.xs },
  fieldHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fieldLabel: { ...typography.label, color: colors.textSecondary },
  uncertain: { ...typography.caption, color: colors.warn },
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
  inputUncertain: { borderColor: colors.warn, backgroundColor: colors.warnSoft },
  evidence: { ...typography.caption, color: colors.textTertiary },
});
