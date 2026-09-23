/**
 * 扫一扫入口（产品需求 §17 / §18）
 *
 * 五种任务分开列出，每一项都有示意图与一句拍摄提示。
 *
 * 真机实测后加了一条：**没做完的能力必须在入口上写清楚**。
 * 原本五个入口长得一样，用户点进去才发现有两个是空的。
 */

import { useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SCAN_GUIDES } from '@/components/ScanGuide';
import {
  COMING_SOON_MESSAGE,
  COMING_SOON_TITLE,
  SCAN_TASKS,
  type ScanTaskDefinition,
} from '@/domain/scanTasks';
import { colors, radii, spacing, typography } from '@/theme';

export default function ScanHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handlePress = (task: ScanTaskDefinition) => {
    if (task.status === 'coming_soon') {
      Alert.alert(COMING_SOON_TITLE, COMING_SOON_MESSAGE, [{ text: '知道了' }]);
      return;
    }
    router.push({ pathname: '/scan/capture', params: { task: task.key } });
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: insets.bottom + spacing.xxl },
      ]}
    >
      <Text style={styles.intro}>选择要识别的内容</Text>

      {SCAN_TASKS.map((task) => {
        const Guide = SCAN_GUIDES[task.key];
        const comingSoon = task.status === 'coming_soon';
        return (
          <Pressable
            key={task.key}
            accessibilityRole="button"
            accessibilityLabel={
              comingSoon
                ? `${task.title}。${COMING_SOON_TITLE}`
                : `${task.title}。${task.hint}`
            }
            onPress={() => handlePress(task)}
            style={({ pressed }) => [
              styles.card,
              comingSoon && styles.cardDisabled,
              pressed && styles.cardPressed,
            ]}
          >
            <View style={comingSoon ? styles.guideDimmed : undefined}>
              <Guide size={58} />
            </View>
            <View style={styles.cardText}>
              <View style={styles.titleRow}>
                <Text style={[styles.cardTitle, comingSoon && styles.cardTitleDisabled]}>
                  {task.title}
                </Text>
                {comingSoon ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>即将支持</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.cardHint}>
                {comingSoon ? COMING_SOON_MESSAGE : task.hint}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  intro: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cardPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  /** 未完成的入口整体压暗，让人一眼看出"这个还不能用" */
  cardDisabled: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.divider,
  },
  guideDimmed: {
    opacity: 0.45,
  },
  cardText: {
    flex: 1,
    gap: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardTitle: {
    ...typography.section,
    color: colors.text,
  },
  cardTitleDisabled: {
    color: colors.textSecondary,
  },
  badge: {
    backgroundColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 2,
  },
  badgeText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  cardHint: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
});
