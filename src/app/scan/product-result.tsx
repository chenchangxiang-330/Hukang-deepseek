/**
 * 拍商品结果页（产品需求 §23 – §26、§33、§41）
 *
 * 三条硬要求在这个页面体现：
 *  - 每一步都有状态，失败时用户知道走到哪一步（§33 禁止拍照后毫无反应）
 *  - 无法唯一确定时给出候选让用户选，不硬猜（§25）
 *  - 完全没找到时保留已经识别到的品牌/名称/规格，并给出三条出路（§26）
 */

import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KangKang } from '@/components/KangKang';
import { NutritionFactsList, ProductIdentity as ProductIdentityView, SourceNotice } from '@/components/ProductFacts';
import { saveCandidateAsProduct } from '@/services/barcode/saveProduct';
import type { ProductCandidate } from '@/services/providers/types';
import {
  recognizeProductPhoto,
  type ProductRecognitionResult,
  type RecognitionStep,
} from '@/services/vision/productRecognition';
import { colors, radii, spacing, typography } from '@/theme';

const STATUS_MARK: Record<RecognitionStep['status'], string> = {
  running: '·',
  done: '✓',
  skipped: '–',
  failed: '!',
};

const STATUS_COLOR: Record<RecognitionStep['status'], string> = {
  running: colors.textTertiary,
  done: colors.mintDark,
  skipped: colors.textTertiary,
  failed: colors.warn,
};

export default function ProductResultScreen() {
  const { uri } = useLocalSearchParams<{ uri?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [result, setResult] = useState<ProductRecognitionResult | null>(null);
  const [steps, setSteps] = useState<RecognitionStep[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!uri) return;
    let cancelled = false;
    void (async () => {
      const outcome = await recognizeProductPhoto(uri, (next) => {
        if (!cancelled) setSteps(next);
      });
      if (!cancelled) setResult(outcome);
    })();
    return () => {
      cancelled = true;
    };
  }, [uri]);

  const confirmCandidate = useCallback(
    async (candidate: ProductCandidate) => {
      setSaving(true);
      setSaveError(null);
      try {
        const { product } = await saveCandidateAsProduct(candidate);
        router.replace({ pathname: '/product/[id]', params: { id: product.id } });
      } catch {
        setSaveError('保存商品时出错了，请再试一次。');
      } finally {
        setSaving(false);
      }
    },
    [router],
  );

  const identity = result?.identity ?? null;
  const candidates = result?.candidates ?? null;
  const qualityIssues = result?.quality?.verdict.issues ?? [];
  const running = result === null;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
    >
      {uri ? <Image source={{ uri }} style={styles.preview} contentFit="contain" /> : null}

      {/* §41：质量问题给出可操作建议，而不是笼统的“识别失败” */}
      {qualityIssues.length > 0 ? (
        <View style={styles.qualityCard}>
          {qualityIssues.map((issue) => (
            <Text key={issue.code} style={styles.qualityText}>
              {issue.advice}
            </Text>
          ))}
        </View>
      ) : null}

      {/* 识别过程：每一步都有状态，失败也能看到走到哪一步 */}
      <View style={styles.stepsCard}>
        {steps.map((step) => (
          <View key={step.id} style={styles.stepRow}>
            <Text style={[styles.stepMark, { color: STATUS_COLOR[step.status] }]}>
              {STATUS_MARK[step.status]}
            </Text>
            <Text style={styles.stepLabel}>{step.label}</Text>
            {step.detail ? (
              <Text style={styles.stepDetail} numberOfLines={1}>
                {step.detail}
              </Text>
            ) : null}
          </View>
        ))}
        {running ? (
          <View style={styles.stepRow}>
            <ActivityIndicator color={colors.mint} />
            <Text style={styles.stepLabel}>正在识别…</Text>
          </View>
        ) : null}
      </View>

      {/* 找到候选：让用户确认，不硬猜（§25） */}
      {candidates && candidates.length > 0 ? (
        <>
          <Text style={styles.headline}>
            {candidates.length > 1 ? '找到几个可能的商品' : '找到这个商品'}
          </Text>
          {candidates.map((candidate, index) => (
            <View key={`${candidate.source}-${candidate.sourceId ?? index}`} style={styles.card}>
              <ProductIdentityView
                name={candidate.name}
                brand={candidate.brand}
                variant={candidate.variant}
                quantity={candidate.quantity}
                barcode={candidate.barcode}
                imageUri={candidate.imageUrl}
              />
              <NutritionFactsList
                facts={candidate}
                basis={{ amount: candidate.basisAmount, unit: candidate.basisUnit }}
              />
              <Pressable
                accessibilityRole="button"
                disabled={saving}
                style={[styles.primaryButton, saving && styles.buttonDisabled]}
                onPress={() => confirmCandidate(candidate)}
              >
                <Text style={styles.primaryButtonText}>{saving ? '正在保存…' : '就是这个'}</Text>
              </Pressable>
            </View>
          ))}
          <SourceNotice text="以上信息来自公开食品数据库，建议和包装上的标签核对一下。" />
          {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}
        </>
      ) : null}

      {/* §26：完全没找到 —— 保留已识别信息 + 三条出路 */}
      {result && !running && (!candidates || candidates.length === 0) ? (
        <View style={styles.emptyBlock}>
          <KangKang size={88} mood="idle" />
          <Text style={styles.headline}>
            {result.error?.code === 'OCR_NO_TEXT'
              ? '没有读出包装上的文字'
              : result.error?.code === 'OCR_FAILED'
                ? '文字识别没有完成'
                : result.error?.code === 'NETWORK_ERROR'
                  ? '网络似乎不太顺畅'
                  : '暂时没有找到完全匹配的商品'}
          </Text>
          <Text style={styles.dimText}>{result.error?.userMessage ?? '可以换一种方式继续。'}</Text>

          {/* 已经识别出来的部分要保留，不能因为没搜到就丢掉 */}
          {identity && (identity.brand || identity.productName || identity.quantity) ? (
            <View style={styles.identityCard}>
              <Text style={styles.identityTitle}>已经认出来的信息</Text>
              {identity.brand ? <IdentityRow label="品牌" value={identity.brand} /> : null}
              {identity.productName ? <IdentityRow label="商品" value={identity.productName} /> : null}
              {identity.flavor ? <IdentityRow label="口味" value={identity.flavor} /> : null}
              {identity.quantity ? <IdentityRow label="规格" value={identity.quantity} /> : null}
              {identity.barcode ? <IdentityRow label="条形码" value={identity.barcode} /> : null}
              {result.searchKeyword ? (
                <IdentityRow label="搜索词" value={result.searchKeyword} />
              ) : null}
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            style={styles.primaryButton}
            onPress={() =>
              router.replace({ pathname: '/scan/capture', params: { task: 'nutrition_label' } })
            }
          >
            <Text style={styles.primaryButtonText}>继续拍营养成分表</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={styles.secondaryButton}
            onPress={() =>
              router.replace({ pathname: '/scan/capture', params: { task: 'ingredients_label' } })
            }
          >
            <Text style={styles.secondaryButtonText}>继续拍配料表</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={styles.secondaryButton}
            onPress={() => router.replace({ pathname: '/product/create', params: {} })}
          >
            <Text style={styles.secondaryButtonText}>手动创建商品</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={styles.textButton}
            onPress={() => router.replace({ pathname: '/scan/capture', params: { task: 'product_photo' } })}
          >
            <Text style={styles.textButtonText}>重新拍一张</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

function IdentityRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.identityRow}>
      <Text style={styles.identityLabel}>{label}</Text>
      <Text style={styles.identityValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.lg },
  preview: {
    width: '100%',
    height: 200,
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
  stepMark: { width: 14, fontSize: 14, fontWeight: '700' },
  stepLabel: { ...typography.body, color: colors.text, width: 64 },
  stepDetail: { ...typography.caption, color: colors.textTertiary, flex: 1 },

  headline: { ...typography.section, fontSize: 18, color: colors.text, textAlign: 'center' },
  dimText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },

  card: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.lg,
  },

  emptyBlock: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.lg },
  identityCard: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  identityTitle: { ...typography.section, color: colors.text, marginBottom: spacing.xs },
  identityRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  identityLabel: { ...typography.body, color: colors.textSecondary },
  identityValue: { ...typography.body, color: colors.text, flexShrink: 1 },

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
  textButton: { padding: spacing.md },
  textButtonText: { color: colors.textSecondary, fontSize: 14 },
  errorText: { ...typography.body, color: colors.danger, textAlign: 'center' },
});
