/**
 * 条形码查询结果页（产品需求 §19 / §21 / §22 / §43）
 *
 * 本页把查询结果**按状态分开呈现**，绝不合并成一句“不认识这款食品”：
 *   本地命中 / 联网候选 / 校验失败要重扫 / 确实没收录 / 网络不通
 *
 * 联网找到的商品必须由用户点“就是这个”确认后才落库（§22）。
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KangKang } from '@/components/KangKang';
import { NutritionFactsList, ProductIdentity, SourceNotice } from '@/components/ProductFacts';
import {
  lookupBarcode,
  type BarcodeLookupResult,
  type LookupProgress,
} from '@/services/barcode/lookup';
import { saveCandidateAsProduct } from '@/services/barcode/saveProduct';
import type { ProductCandidate } from '@/services/providers/types';
import { colors, radii, spacing, typography } from '@/theme';

export default function BarcodeResultScreen() {
  const { raw, type } = useLocalSearchParams<{ raw?: string; type?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [result, setResult] = useState<BarcodeLookupResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /** 联网进度：让用户知道正在查什么，而不是干等一个转圈 */
  const [progress, setProgress] = useState<LookupProgress | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const cancelSignal = useRef<{ cancelled: boolean }>({ cancelled: false });

  const runLookup = useCallback(async () => {
    if (!raw) return;
    setResult(null);
    setSaveError(null);
    setProgress(null);
    setElapsed(0);
    cancelSignal.current = { cancelled: false };

    const outcome = await lookupBarcode(raw, type, {
      cancelSignal: cancelSignal.current,
      onProgress: setProgress,
    });
    setResult(outcome);
  }, [raw, type]);

  useEffect(() => {
    void runLookup();
  }, [runLookup]);

  // 查询期间显示已用时间：超过几秒用户至少知道"它还在动"
  useEffect(() => {
    if (result !== null) return;
    const timer = setInterval(() => setElapsed((v) => v + 1), 1000);
    return () => clearInterval(timer);
  }, [result]);

  const handleCancel = useCallback(() => {
    cancelSignal.current.cancelled = true;
  }, []);

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

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
    >
      {result === null ? (
        <View style={styles.centerBlock}>
          <KangKang size={84} mood="thinking" />
          <ActivityIndicator color={colors.mint} />
          <Text style={styles.dimText}>
            {progress
              ? `正在联网查询…（${progress.label}）`
              : '正在翻本地的小本子…'}
          </Text>
          {elapsed >= 2 ? (
            <Text style={styles.elapsedText}>已经等了 {elapsed} 秒</Text>
          ) : null}
          <Pressable accessibilityRole="button" style={styles.textButton} onPress={handleCancel}>
            <Text style={styles.textButtonText}>不等了</Text>
          </Pressable>
        </View>
      ) : null}

      {/* 用户主动取消：如实说明，不假装"查不到" */}
      {result?.kind === 'cancelled' ? (
        <View style={styles.centerBlock}>
          <KangKang size={84} mood="idle" />
          <Text style={styles.headline}>已经停止查询</Text>
          <Text style={styles.dimText}>可以再试一次，或者直接手动创建商品。</Text>
          <Pressable accessibilityRole="button" style={styles.primaryButton} onPress={runLookup}>
            <Text style={styles.primaryButtonText}>重新查询</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={styles.textButton}
            onPress={() => router.replace({ pathname: '/product/create', params: {} })}
          >
            <Text style={styles.textButtonText}>手动创建商品</Text>
          </Pressable>
        </View>
      ) : null}

      {/* 本地命中：断网也能用（§22） */}
      {result?.kind === 'local' ? (
        <>
          <Text style={styles.headline}>本地已经认识这款商品</Text>
          <ProductIdentity
            name={result.product.name}
            brand={result.product.brand}
            variant={result.product.variant}
            quantity={result.product.quantity}
            barcode={result.product.barcode}
            imageUri={result.product.image_uri}
          />
          <NutritionFactsList
            facts={result.product}
            basis={{
              amount: result.product.nutrition_basis_amount,
              unit: result.product.nutrition_basis_unit,
            }}
          />
          <Pressable
            accessibilityRole="button"
            style={styles.primaryButton}
            onPress={() =>
              router.replace({ pathname: '/product/[id]', params: { id: result.product.id } })
            }
          >
            <Text style={styles.primaryButtonText}>查看商品</Text>
          </Pressable>
        </>
      ) : null}

      {/* 联网找到候选：必须用户确认（§22） */}
      {result?.kind === 'online' ? (
        <>
          <Text style={styles.headline}>
            {result.candidates.length > 1 ? '找到几个可能的商品' : '找到这个商品'}
          </Text>
          <Text style={styles.subline}>请确认是不是这一款：</Text>

          {result.candidates.map((candidate, index) => (
            <View key={`${candidate.source}-${candidate.sourceId ?? index}`} style={styles.card}>
              <ProductIdentity
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

          <SourceNotice text="以上信息来自公开食品数据库，建议和包装上的标签核对一下。确认后会保存在本机，下次断网也能打开。" />

          {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}

          <Pressable accessibilityRole="button" style={styles.textButton} onPress={runLookup}>
            <Text style={styles.textButtonText}>都不是，重新查一次</Text>
          </Pressable>
        </>
      ) : null}

      {/* 校验位不对：让用户重扫，而不是说“查不到” */}
      {result?.kind === 'invalid' ? (
        <View style={styles.centerBlock}>
          <KangKang size={84} mood="concerned" />
          <Text style={styles.headline}>这个条形码没扫清楚</Text>
          <Text style={styles.dimText}>
            数字看起来不完整或者有误。把条形码放进取景框，让条纹尽量占满再试一次。
          </Text>
          <Pressable
            accessibilityRole="button"
            style={styles.primaryButton}
            onPress={() => router.replace({ pathname: '/scan/capture', params: { task: 'barcode' } })}
          >
            <Text style={styles.primaryButtonText}>重新扫</Text>
          </Pressable>
        </View>
      ) : null}

      {/* 确实没收录 */}
      {result?.kind === 'not_found' ? (
        <View style={styles.centerBlock}>
          <KangKang size={84} mood="idle" />
          <Text style={styles.headline}>暂时没有找到完全匹配的商品</Text>
          <Text style={styles.dimText}>
            数据库里没有收录这个条形码。这不代表商品不存在，可以拍营养成分表自己建一个。
          </Text>
          <Pressable
            accessibilityRole="button"
            style={styles.primaryButton}
            onPress={() =>
              router.replace({
                pathname: '/product/create',
                params: { barcode: result.barcode.digits },
              })
            }
          >
            <Text style={styles.primaryButtonText}>手动创建商品</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={styles.textButton}
            onPress={() =>
              router.replace({
                pathname: '/scan/capture',
                params: { task: 'nutrition_label' },
              })
            }
          >
            <Text style={styles.textButtonText}>继续拍营养成分表</Text>
          </Pressable>
        </View>
      ) : null}

      {/* 网络不通 ≠ 商品不存在 */}
      {result?.kind === 'unavailable' ? (
        <View style={styles.centerBlock}>
          <KangKang size={84} mood="concerned" />
          <Text style={styles.headline}>网络似乎不太顺畅</Text>
          <Text style={styles.dimText}>
            现在连不上商品数据库，所以还没查到。这不代表没有这款商品。
          </Text>
          <Pressable accessibilityRole="button" style={styles.primaryButton} onPress={runLookup}>
            <Text style={styles.primaryButtonText}>再试一次</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={styles.textButton}
            onPress={() => router.replace({ pathname: '/product/create', params: {} })}
          >
            <Text style={styles.textButtonText}>手动创建商品</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, gap: spacing.lg },
  centerBlock: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.xxl },
  headline: { ...typography.section, fontSize: 18, color: colors.text, textAlign: 'center' },
  subline: { ...typography.body, color: colors.textSecondary },
  dimText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  elapsedText: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  card: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  primaryButton: {
    backgroundColor: colors.mint,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  buttonDisabled: { opacity: 0.5 },
  primaryButtonText: { color: colors.textInverse, fontSize: 15, fontWeight: '600' },
  textButton: { padding: spacing.md },
  textButtonText: { color: colors.textSecondary, fontSize: 14 },
  errorText: { ...typography.body, color: colors.danger, textAlign: 'center' },
});
