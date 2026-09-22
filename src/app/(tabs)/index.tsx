/**
 * 今日（产品需求 §8 / §9 / §12）
 *
 * Phase 1 只落地骨架与真实数据读取：
 *   顶部日期（默认收起，点击展开最近日期）→ 选择日期 → 读取该日真实记录
 *
 * 营养可视化（§9）与时间线（§12）在 Phase 7 接入；
 * 在那之前这里不显示任何编造的营养数字。
 */

import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KangKang } from '@/components/KangKang';
import {
  formatMonthDayWeekday,
  isToday,
  parseLocalDate,
  recentDateOptions,
  toLocalDateString,
} from '@/domain/dates';
import { listLogsByDate } from '@/db/repositories/nutritionLogRepo';
import { colors, radii, spacing, typography } from '@/theme';

export default function TodayScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const today = useMemo(() => new Date(), []);
  const dateOptions = useMemo(() => recentDateOptions(14, today), [today]);
  const [selectedDate, setSelectedDate] = useState(() => toLocalDateString(today));
  const [expanded, setExpanded] = useState(false);
  const [logCount, setLogCount] = useState<number | null>(null);

  const loadDay = useCallback(async (date: string) => {
    try {
      const logs = await listLogsByDate(date);
      setLogCount(logs.length);
    } catch {
      // 读取失败时保持 null，界面显示“未记录”，不假装是 0 条
      setLogCount(null);
    }
  }, []);

  useEffect(() => {
    void loadDay(selectedDate);
  }, [loadDay, selectedDate]);

  const selected = parseLocalDate(selectedDate);
  const heading = isToday(selectedDate, today) ? '今天' : '这一天';
  const dateLine = selected ? formatMonthDayWeekday(selected) : selectedDate;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.header}>
        <Text style={styles.heading}>{heading}</Text>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`选择日期，当前 ${dateLine}`}
          onPress={() => setExpanded((v) => !v)}
          style={styles.dateRow}
        >
          <Text style={styles.dateText}>{dateLine}</Text>
          <Text style={[styles.chevron, expanded && styles.chevronOpen]}>˅</Text>
        </Pressable>
      </View>

      {expanded ? (
        <View style={styles.datePanel}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.dateList}
          >
            {dateOptions.map((option) => {
              const active = option.value === selectedDate;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  onPress={() => {
                    setSelectedDate(option.value);
                    setExpanded(false);
                  }}
                  style={[styles.dateChip, active && styles.dateChipActive]}
                >
                  <Text style={[styles.dateChipLabel, active && styles.dateChipLabelActive]}>
                    {option.label}
                  </Text>
                  <Text style={[styles.dateChipSub, active && styles.dateChipSubActive]}>
                    {option.sublabel}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 96 }]}
        showsVerticalScrollIndicator={false}
      >
        {logCount === 0 ? (
          <View style={styles.emptyState}>
            <KangKang size={96} mood="idle" />
            <Text style={styles.emptyTitle}>
              {isToday(selectedDate, today) ? '今天还没有记录' : '这一天没有记录'}
            </Text>
            <Text style={styles.emptyBody}>
              扫一下条形码，或者拍一张包装正面，就能把吃的东西记下来。
            </Text>
          </View>
        ) : (
          <View style={styles.placeholderBlock}>
            <Text style={styles.placeholderText}>
              {logCount == null
                ? '这一天的记录暂时读取失败。'
                : `这一天有 ${logCount} 条记录。营养汇总与时间线将在后续阶段接入。`}
            </Text>
          </View>
        )}
      </ScrollView>

      <View style={[styles.dock, { paddingBottom: insets.bottom + spacing.md }]}>
        <Pressable
          accessibilityRole="button"
          style={styles.dockButton}
          onPress={() => router.push('/scan')}
        >
          <Text style={styles.dockButtonText}>扫一扫 / 拍一下</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    paddingHorizontal: spacing.xl,
    gap: spacing.xs,
  },
  heading: { ...typography.title, color: colors.text },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  dateText: { ...typography.body, color: colors.textSecondary },
  chevron: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: -2,
  },
  chevronOpen: { transform: [{ rotate: '180deg' }], marginTop: 2 },

  datePanel: { marginTop: spacing.md },
  dateList: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  dateChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    minWidth: 84,
    gap: 2,
  },
  dateChipActive: { backgroundColor: colors.mintSoft, borderColor: colors.mintLine },
  dateChipLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  dateChipLabelActive: { color: colors.mintDark },
  dateChipSub: { ...typography.caption, color: colors.textTertiary },
  dateChipSubActive: { color: colors.calm },

  body: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    gap: spacing.xl,
  },
  emptyState: {
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.xl,
  },
  emptyTitle: { ...typography.section, color: colors.text },
  emptyBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: spacing.lg,
  },
  placeholderBlock: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  placeholderText: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },

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
