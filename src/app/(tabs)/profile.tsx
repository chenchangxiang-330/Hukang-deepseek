/**
 * 我的（产品需求 §55）
 *
 * 数据统计全部是 SQLite 的真实计数，不用占位数字。
 * 开发者模式：连续点击版本号 7 次开启。
 */

import Constants from 'expo-constants';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { countProducts } from '@/db/repositories/productRepo';
import { getDatabase } from '@/db/database';
import { getMetaBoolean, META_KEYS, setMetaBoolean } from '@/db/repositories/metaRepo';
import { countLogs } from '@/db/repositories/nutritionLogRepo';
import { colors, radii, spacing, typography } from '@/theme';

const DEVELOPER_TAP_COUNT = 7;

interface Counts {
  products: number;
  inventory: number;
  logs: number;
}

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [counts, setCounts] = useState<Counts | null>(null);
  const [developerMode, setDeveloperMode] = useState(false);
  const [tapHint, setTapHint] = useState<string | null>(null);
  const tapCount = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    try {
      const db = await getDatabase();
      const [products, logs, inventoryRow] = await Promise.all([
        countProducts(),
        countLogs(),
        db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM inventory_items;'),
      ]);
      setCounts({ products, logs, inventory: inventoryRow?.n ?? 0 });
    } catch {
      setCounts(null);
    }
    setDeveloperMode(await getMetaBoolean(META_KEYS.developerMode));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const version = Constants.expoConfig?.version ?? '1.0.0';

  const handleVersionTap = useCallback(async () => {
    if (developerMode) return;

    tapCount.current += 1;
    const remaining = DEVELOPER_TAP_COUNT - tapCount.current;

    if (tapTimer.current) clearTimeout(tapTimer.current);
    // 连续点击的判定窗口
    tapTimer.current = setTimeout(() => {
      tapCount.current = 0;
      setTapHint(null);
    }, 1500);

    if (remaining <= 0) {
      tapCount.current = 0;
      await setMetaBoolean(META_KEYS.developerMode, true);
      setDeveloperMode(true);
      setTapHint('开发者模式已开启');
      return;
    }

    if (remaining <= 3) {
      setTapHint(`再点 ${remaining} 次开启开发者模式`);
    }
  }, [developerMode]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xxl },
      ]}
    >
      <Text style={styles.heading}>我的</Text>

      <View style={styles.card}>
        <Text style={styles.cardHeader}>本机数据</Text>
        <View style={styles.statRow}>
          <Stat label="商品" value={counts?.products} />
          <Stat label="库存" value={counts?.inventory} />
          <Stat label="饮食记录" value={counts?.logs} />
        </View>
        <Text style={styles.cardFootnote}>
          {counts == null ? '数据暂时读取失败。' : '全部保存在本机，不需要账号。'}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardHeader}>关于护康</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`版本 ${version}`}
          onPress={handleVersionTap}
          style={styles.aboutRow}
        >
          <Text style={styles.aboutLabel}>版本</Text>
          <Text style={styles.aboutValue}>{version}</Text>
        </Pressable>
        {tapHint ? <Text style={styles.tapHint}>{tapHint}</Text> : null}
      </View>

      {developerMode ? (
        <View style={styles.card}>
          <Text style={styles.cardHeader}>开发者</Text>
          <Pressable
            accessibilityRole="button"
            style={styles.aboutRow}
            onPress={() => router.push('/dev')}
          >
            <Text style={styles.aboutLabel}>开发者选项</Text>
            <Text style={styles.aboutValue}>›</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={styles.aboutRow}
            onPress={async () => {
              await setMetaBoolean(META_KEYS.developerMode, false);
              setDeveloperMode(false);
              setTapHint(null);
            }}
          >
            <Text style={styles.aboutLabel}>关闭开发者模式</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: number | undefined }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value == null ? '—' : value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: spacing.xl, gap: spacing.lg },
  heading: { ...typography.title, color: colors.text, marginBottom: spacing.xs },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: spacing.md,
  },
  cardHeader: { ...typography.section, color: colors.text },
  cardFootnote: { ...typography.caption, color: colors.textTertiary },

  statRow: { flexDirection: 'row', gap: spacing.xl },
  stat: { gap: 2 },
  statValue: { fontSize: 22, fontWeight: '600', color: colors.text },
  statLabel: { ...typography.caption, color: colors.textSecondary },

  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  aboutLabel: { ...typography.body, color: colors.text },
  aboutValue: { ...typography.body, color: colors.textSecondary },
  tapHint: { ...typography.caption, color: colors.mintDark },
});
