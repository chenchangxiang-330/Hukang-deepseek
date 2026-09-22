/**
 * 扫一扫入口（产品需求 §17 / §18）
 *
 * 五种任务分开列出，每一项都有示意图与一句拍摄提示。
 */

import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SCAN_GUIDES } from '@/components/ScanGuide';
import { SCAN_TASKS } from '@/domain/scanTasks';
import { colors, radii, spacing, typography } from '@/theme';

export default function ScanHomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

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
        return (
          <Pressable
            key={task.key}
            accessibilityRole="button"
            accessibilityLabel={`${task.title}。${task.hint}`}
            onPress={() => router.push({ pathname: '/scan/capture', params: { task: task.key } })}
            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          >
            <Guide size={58} />
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{task.title}</Text>
              <Text style={styles.cardHint}>{task.hint}</Text>
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
  cardText: {
    flex: 1,
    gap: spacing.xs,
  },
  cardTitle: {
    ...typography.section,
    color: colors.text,
  },
  cardHint: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
});
