/**
 * 识别结果页（产品需求 §43：五种任务各有自己的结果状态）
 *
 * 当前处于 Phase 1：采集与文件校验链路已经真实工作，
 * 识别（条码查询 / OCR / 营养解析）尚未接入。
 * 这里必须如实显示这一点，不能显示任何假的识别结果（§64 禁止伪完成）。
 */

import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KangKang } from '@/components/KangKang';
import { getScanTaskDefinition } from '@/domain/scanTasks';
import { ScanTask } from '@/domain/errors';
import { colors, radii, spacing, typography } from '@/theme';

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export default function RecognitionResultScreen() {
  const params = useLocalSearchParams<{
    task?: string;
    uri?: string;
    size?: string;
    width?: string;
    height?: string;
  }>();

  const task = (params.task ?? 'product_photo') as ScanTask;
  const definition = getScanTaskDefinition(task);
  const uri = params.uri ?? '';
  const size = Number(params.size ?? '0');
  const width = params.width ? Number(params.width) : null;
  const height = params.height ? Number(params.height) : null;

  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
    >
      {uri ? (
        <Image source={{ uri }} style={styles.preview} contentFit="contain" />
      ) : (
        <View style={[styles.preview, styles.previewEmpty]}>
          <Text style={styles.previewEmptyText}>没有图片</Text>
        </View>
      )}

      <View style={styles.block}>
        <Text style={styles.blockTitle}>{definition?.title ?? '识别'}</Text>
        <Text style={styles.blockBody}>{definition?.hint ?? ''}</Text>
      </View>

      {/* 采集链路的事实：这些是真实测出来的，不是占位 */}
      <View style={styles.factCard}>
        <Text style={styles.factHeader}>图片已就绪</Text>
        <FactRow label="分辨率" value={width && height ? `${width} × ${height}` : '未提供'} />
        <FactRow label="文件大小" value={formatBytes(size)} />
        <FactRow label="文件校验" value={size > 0 ? '通过（存在且非空）' : '未通过'} />
      </View>

      <View style={styles.pendingCard}>
        <KangKang size={64} mood="thinking" />
        <View style={styles.pendingText}>
          <Text style={styles.pendingTitle}>识别能力尚未接入</Text>
          <Text style={styles.pendingBody}>
            当前阶段只完成“拍照 → 图片 → 文件校验”。条码查询、文字识别与营养解析会在后续阶段接入，
            在真正跑通之前不会显示任何识别结果。
          </Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        style={styles.primaryButton}
        onPress={() => router.back()}
      >
        <Text style={styles.primaryButtonText}>重新拍一张</Text>
      </Pressable>
    </ScrollView>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.factRow}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    gap: spacing.lg,
  },
  preview: {
    width: '100%',
    height: 240,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceMuted,
  },
  previewEmpty: { alignItems: 'center', justifyContent: 'center' },
  previewEmptyText: { ...typography.caption, color: colors.textTertiary },

  block: { gap: spacing.xs },
  blockTitle: { ...typography.title, color: colors.text },
  blockBody: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },

  factCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  factHeader: { ...typography.section, color: colors.text, marginBottom: spacing.xs },
  factRow: { flexDirection: 'row', justifyContent: 'space-between' },
  factLabel: { ...typography.body, color: colors.textSecondary },
  factValue: { ...typography.body, color: colors.text, fontWeight: '500' },

  pendingCard: {
    flexDirection: 'row',
    gap: spacing.lg,
    alignItems: 'center',
    backgroundColor: colors.mintSoft,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  pendingText: { flex: 1, gap: spacing.xs },
  pendingTitle: { ...typography.section, color: colors.mintDark },
  pendingBody: { ...typography.caption, color: colors.textSecondary, lineHeight: 19 },

  primaryButton: {
    backgroundColor: colors.mint,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    alignItems: 'center',
  },
  primaryButtonText: { color: colors.textInverse, fontSize: 15, fontWeight: '600' },
});
