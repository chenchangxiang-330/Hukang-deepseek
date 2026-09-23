/**
 * 营养成分表识别与确认（产品需求 §27 / §28 / §33）
 *
 * 流程：Photo → 图片质量检查 → OCR → Raw Text → Nutrition Parser → **用户确认** → 保存
 *
 * 用户确认不是走过场：所有解析出来的值都摆在可编辑的表单里，
 * 不确定的项会高亮提示核对。用户不点保存，什么都不会写库。
 */

import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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

import { KangKang } from '@/components/KangKang';
import { NutritionEditor } from '@/components/NutritionEditor';
import { createProduct, getProduct, updateProduct } from '@/db/repositories/productRepo';
import type { NutritionField } from '@/domain/nutrition';
import {
  createEmptyDraft,
  draftFromValues,
  draftToNutrition,
  type NutritionDraft,
} from '@/domain/nutritionDraft';
import { dedupeFieldNames, validateNutrition } from '@/domain/nutritionValidation';
import { EMPTY_NUTRITION_FACTS } from '@/domain/types';
import { measureImageQuality, runOcr } from '@/services/vision/ocr';
import { evaluateImageQuality, type QualityVerdict } from '@/services/vision/imageQuality';
import {
  hasAnyNutritionValue,
  parseNutritionLabel,
  type ParsedNutrition,
} from '@/services/vision/nutritionParser';
import { colors, radii, spacing, typography } from '@/theme';
import type { ImageQualityMetrics } from '../../../modules/hukang-vision';

type StepStatus = 'running' | 'done' | 'failed';
interface Step {
  id: string;
  label: string;
  status: StepStatus;
  detail?: string;
}

export default function NutritionResultScreen() {
  const params = useLocalSearchParams<{
    uri?: string;
    productId?: string;
    name?: string;
    brand?: string;
    barcode?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [steps, setSteps] = useState<Step[]>([]);
  const [quality, setQuality] = useState<{ metrics: ImageQualityMetrics; verdict: QualityVerdict } | null>(null);
  const [parsed, setParsed] = useState<ParsedNutrition | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [running, setRunning] = useState(true);

  const [name, setName] = useState(params.name ?? '');
  const [brand, setBrand] = useState(params.brand ?? '');
  const [draft, setDraft] = useState<NutritionDraft>(() => createEmptyDraft());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const update = (id: string, status: StepStatus, detail?: string) =>
    setSteps((prev) => {
      const next = prev.filter((s) => s.id !== id);
      return [...next, { id, label: STEP_LABELS[id] ?? id, status, detail }];
    });

  useEffect(() => {
    const uri = params.uri;
    if (!uri) {
      setFatal('没有拿到图片。');
      setRunning(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      // 0) 如果是给已有商品补充营养，先把现有商品名带出来
      if (params.productId) {
        const existing = await getProduct(params.productId);
        if (!cancelled && existing) {
          setName(existing.name);
          setBrand(existing.brand ?? '');
        }
      }

      // 1) 质量（只提示，不阻断）
      update('quality', 'running');
      const metrics = await measureImageQuality(uri);
      if (cancelled) return;
      if (metrics) {
        setQuality({ metrics, verdict: evaluateImageQuality(metrics) });
        update('quality', 'done', `亮度 ${Math.round(metrics.brightness)} · 清晰度 ${Math.round(metrics.blurScore)}`);
      } else {
        update('quality', 'failed', '质量分析不可用');
      }

      // 2) OCR
      update('ocr', 'running');
      let rawText: string;
      let lines: string[];
      try {
        const ocr = await runOcr(uri);
        if (cancelled) return;
        rawText = ocr.rawText;
        lines = ocr.blocks.flatMap((b) => b.lines.map((l) => l.text)).filter(Boolean);
        update('ocr', 'done', `${lines.length} 行 / ${rawText.length} 字`);
      } catch (error) {
        if (cancelled) return;
        const code = (error as { code?: string })?.code ?? 'OCR_FAILED';
        update('ocr', 'failed', code);
        setFatal(
          code === 'OCR_NO_TEXT'
            ? '没有读出营养成分表上的文字。靠近一点、正对标签再拍一次。'
            : '文字识别没有完成，请再拍一次。',
        );
        setRunning(false);
        return;
      }

      // 3) 解析
      update('parse', 'running');
      const result = parseNutritionLabel(rawText, lines);
      if (cancelled) return;

      // 3a) 先判断"这到底是不是一张营养成分表"。
      //     真机实测教训：用户拍的是瓶子正面（压根没有营养表），
      //     却因为背面漏进来一行「蛋白质」就解析出了数值，界面当成正常数据显示。
      //     宁可让用户重拍，也不能给出一个看起来正常的错数字。
      if (!result.looksLikeTable) {
        update('parse', 'failed', '这张照片里没有营养成分表');
        setFatal(
          '这张照片里没有找到营养成分表。请把包装翻过来，对着印着「营养成分表」的那一块拍。',
        );
        setRunning(false);
        return;
      }

      if (!hasAnyNutritionValue(result)) {
        update('parse', 'failed', '没有识别出任何营养项目');
        setFatal('营养表读到了，但一项数值都没认出来。靠近一点、正对着再拍一次。');
        setRunning(false);
        return;
      }

      update('parse', 'done', `解析出 ${result.evidence.length} 项`);
      setParsed(result);
      setDraft(draftFromValues(result.facts, result.basis));
      setRunning(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.uri, params.productId]);

  const evidenceByField = useMemo(() => {
    const map: Partial<Record<NutritionField, string>> = {};
    for (const item of parsed?.evidence ?? []) {
      map[item.field] = item.matched;
    }
    return map;
  }, [parsed]);

  /**
   * 保存前的合理性校验。
   *
   * 真机实测教训：一瓶无糖茶被识别出「蛋白质 43g/100g」，
   * 界面毫无反应，用户点保存就存进去了。
   * 物理上不可能的值必须拦下来（reject），偏高的值提示核对（warn）。
   */
  const validationIssues = useMemo(() => {
    const { facts, basisAmount, basisUnit } = draftToNutrition(draft);
    return validateNutrition({ facts, basis: { amount: basisAmount, unit: basisUnit } });
  }, [draft]);

  const blockingIssues = useMemo(
    () => validationIssues.filter((i) => i.severity === 'reject'),
    [validationIssues],
  );
  const warningIssues = useMemo(
    () => validationIssues.filter((i) => i.severity === 'warn'),
    [validationIssues],
  );

  const handleSave = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setSaveError('请填写商品名称。');
      return;
    }

    // 有物理上不可能的值时不许保存 —— 宁可让用户多改一次
    if (blockingIssues.length > 0) {
      setSaveError(blockingIssues[0].message);
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const { facts, basisAmount, basisUnit } = draftToNutrition(draft);

      let productId = params.productId;
      if (productId) {
        await updateProduct(productId, {
          name: trimmedName,
          brand: brand.trim() || null,
          nutrition_basis_amount: basisAmount,
          nutrition_basis_unit: basisUnit,
          ...facts,
          data_source: 'vision',
        });
      } else {
        const created = await createProduct({
          name: trimmedName,
          brand: brand.trim() || null,
          barcode: params.barcode?.trim() || null,
          nutrition_basis_amount: basisAmount,
          nutrition_basis_unit: basisUnit,
          ...facts,
          data_source: 'vision',
        });
        productId = created.id;
      }

      router.replace({ pathname: '/product/[id]', params: { id: productId } });
    } catch {
      setSaveError('保存失败，请再试一次。');
    } finally {
      setSaving(false);
    }
  }, [blockingIssues, brand, draft, name, params.barcode, params.productId, router]);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        {params.uri ? (
          <Image source={{ uri: params.uri }} style={styles.preview} contentFit="contain" />
        ) : null}

        {quality && quality.verdict.issues.length > 0 ? (
          <View style={styles.qualityCard}>
            {quality.verdict.issues.map((issue) => (
              <Text key={issue.code} style={styles.qualityText}>
                {issue.advice}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.stepsCard}>
          {steps.map((step) => (
            <View key={step.id} style={styles.stepRow}>
              <Text style={[styles.stepMark, step.status === 'failed' && styles.stepMarkFailed]}>
                {step.status === 'done' ? '✓' : step.status === 'failed' ? '!' : '·'}
              </Text>
              <Text style={styles.stepLabel}>{step.label}</Text>
              {step.detail ? (
                <Text style={styles.stepDetail} numberOfLines={1}>
                  {step.detail}
                </Text>
              ) : null}
            </View>
          ))}
          {running ? <ActivityIndicator color={colors.mint} /> : null}
        </View>

        {fatal ? (
          <View style={styles.errorBlock}>
            <KangKang size={84} mood="concerned" />
            <Text style={styles.errorText}>{fatal}</Text>
            <Pressable
              accessibilityRole="button"
              style={styles.primaryButton}
              onPress={() =>
                router.replace({ pathname: '/scan/capture', params: { task: 'nutrition_label' } })
              }
            >
              <Text style={styles.primaryButtonText}>重新拍一张</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={styles.secondaryButton}
              onPress={() => router.replace({ pathname: '/product/create', params: {} })}
            >
              <Text style={styles.secondaryButtonText}>手动填写</Text>
            </Pressable>
          </View>
        ) : null}

        {parsed && !fatal ? (
          <>
            <Text style={styles.sectionTitle}>核对一下</Text>
            <Text style={styles.hint}>
              下面是识别结果，可以直接修改。确认无误后再保存。
            </Text>

            <View style={styles.field}>
              <Text style={styles.fieldLabel}>商品名称 *</Text>
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
                placeholder="可以留空"
                placeholderTextColor={colors.textTertiary}
              />
            </View>

            {parsed.missingFields.length > 0 ? (
              <Text style={styles.missingHint}>
                包装上没有标注（已记为未记录）：
                {dedupeFieldNames(parsed.missingFields).join('、')}
              </Text>
            ) : null}

            {parsed.uncertainFields.length > 0 ? (
              <View style={styles.uncertainCard}>
                {parsed.uncertainFields.map((note) => (
                  <Text key={note} style={styles.uncertainText}>
                    {note}
                  </Text>
                ))}
              </View>
            ) : null}

            <NutritionEditor
              draft={draft}
              onChange={setDraft}
              uncertainFields={parsed.uncertainFieldKeys}
              evidenceByField={evidenceByField}
            />

            {/* 数值合理性：不可能的值必须拦下，偏高的提示核对 */}
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

            {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}

            <Pressable
              accessibilityRole="button"
              disabled={saving || blockingIssues.length > 0}
              style={[styles.primaryButton, saving && styles.buttonDisabled]}
              onPress={handleSave}
            >
              <Text style={styles.primaryButtonText}>{saving ? '正在保存…' : '确认并保存'}</Text>
            </Pressable>
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const STEP_LABELS: Record<string, string> = {
  quality: '检查照片',
  ocr: '读文字',
  parse: '解析营养成分',
};

const FIELD_SHORT: Partial<Record<NutritionField, string>> = {
  energy_kcal: '能量',
  energy_kj: '能量',
  protein_g: '蛋白质',
  fat_g: '脂肪',
  carbohydrate_g: '碳水化合物',
  total_sugar_g: '总糖',
  added_sugar_g: '添加糖',
  fiber_g: '膳食纤维',
  sodium_mg: '钠',
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.lg },
  preview: {
    width: '100%',
    height: 180,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceMuted,
  },
  qualityCard: {
    backgroundColor: colors.warnSoft,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  qualityText: { ...typography.body, color: colors.warn },
  stepsCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepMark: { width: 14, fontSize: 14, fontWeight: '700', color: colors.mintDark },
  stepMarkFailed: { color: colors.warn },
  stepLabel: { ...typography.body, color: colors.text, width: 96 },
  stepDetail: { ...typography.caption, color: colors.textTertiary, flex: 1 },

  errorBlock: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.lg },
  errorText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },

  sectionTitle: { ...typography.section, fontSize: 18, color: colors.text },
  hint: { ...typography.caption, color: colors.textTertiary, lineHeight: 18 },
  missingHint: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  uncertainCard: {
    backgroundColor: colors.warnSoft,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  uncertainText: { ...typography.caption, color: colors.warn, lineHeight: 18 },

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

  field: { gap: spacing.xs },
  fieldLabel: { ...typography.label, color: colors.textSecondary },
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

  primaryButton: {
    alignSelf: 'stretch',
    backgroundColor: colors.mint,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: colors.textInverse, fontSize: 15, fontWeight: '600' },
  secondaryButton: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    alignItems: 'center',
  },
  secondaryButtonText: { color: colors.text, fontSize: 15, fontWeight: '500' },
});
