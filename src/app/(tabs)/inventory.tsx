/**
 * 库存（产品需求 §14 / §15）
 *
 * 保持简约：文字 + 小标签 + 轻微颜色表达临期，不做大量红黄大卡片。
 * 数据全部来自本地 SQLite，没有假数据（§49）。
 */

import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KangKang } from '@/components/KangKang';
import { listInventoryOverview, type InventoryOverview } from '@/db/repositories/inventoryRepo';
import { expiryStatusText } from '@/domain/expiry';
import { ExpiryStatus } from '@/domain/types';
import { colors, radii, spacing, typography } from '@/theme';

/** 临期只用轻微颜色区分（§14） */
const STATUS_COLOR: Record<ExpiryStatus, string> = {
  expired: colors.danger,
  today: colors.danger,
  within3: colors.warn,
  within7: colors.warn,
  normal: colors.textTertiary,
  unknown: colors.textTertiary,
};

function formatAmount(quantity: number | null, unit: string | null): string {
  if (quantity == null && !unit) return '';
  const q = quantity == null ? '' : Number.isInteger(quantity) ? String(quantity) : quantity.toFixed(1);
  return `${q}${unit ?? ''}`;
}

export default function InventoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [overview, setOverview] = useState<InventoryOverview | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setOverview(await listInventoryOverview());
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <Text style={styles.heading}>库存</Text>
        {overview && overview.totalCount > 0 ? (
          <View style={styles.summaryRow}>
            <Text style={styles.summaryStrong}>需要处理 {overview.needAttentionCount}</Text>
            <Text style={styles.summaryWeak}>全部 {overview.totalCount}</Text>
          </View>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xxl }]}
        showsVerticalScrollIndicator={false}
      >
        {failed ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>库存暂时读取失败。</Text>
          </View>
        ) : overview == null ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>正在读取…</Text>
          </View>
        ) : overview.entries.length === 0 ? (
          <View style={styles.emptyState}>
            <KangKang size={88} mood="idle" />
            <Text style={styles.emptyTitle}>还没有库存</Text>
            <Text style={styles.emptyBody}>
              拍下包装或扫描条形码后，可以把食品加入库存，护康会帮你盯着保质期。
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {overview.entries.map((entry) => (
              <View key={entry.item.id} style={styles.row}>
                <View style={styles.rowMain}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {entry.product.name}
                  </Text>
                  <Text style={[styles.rowStatus, { color: STATUS_COLOR[entry.status] }]}>
                    {expiryStatusText(entry.status, entry.daysLeft)}
                  </Text>
                </View>
                <Text style={styles.rowAmount}>
                  {formatAmount(entry.item.quantity, entry.item.unit)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={[styles.dock, { paddingBottom: insets.bottom + spacing.md }]}>
        <Pressable
          accessibilityRole="button"
          style={styles.dockButton}
          onPress={() => router.push('/scan')}
        >
          <Text style={styles.dockButtonText}>扫码入库</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.xl, gap: spacing.xs },
  heading: { ...typography.title, color: colors.text },
  summaryRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  summaryStrong: { ...typography.label, color: colors.text },
  summaryWeak: { ...typography.label, color: colors.textTertiary },

  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  list: { gap: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
    gap: spacing.md,
  },
  rowMain: { flex: 1, gap: 3 },
  rowTitle: { ...typography.body, color: colors.text, fontWeight: '500' },
  rowStatus: { ...typography.caption },
  rowAmount: { ...typography.body, color: colors.textSecondary },

  emptyState: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.xxl },
  emptyTitle: { ...typography.section, color: colors.text },
  emptyBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: spacing.lg,
  },
  notice: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  noticeText: { ...typography.body, color: colors.textSecondary },

  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    backgroundColor: colors.glass,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  dockButton: {
    backgroundColor: colors.mint,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  dockButtonText: { color: colors.textInverse, fontSize: 15, fontWeight: '600' },
});
