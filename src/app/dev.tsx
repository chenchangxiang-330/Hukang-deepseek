/**
 * 开发者选项（产品需求 §34 / §55）
 *
 * 只有开启开发者模式后才可达。普通用户界面绝不能出现
 * OCR raw text / JSON / API / file:// / Parser / HTTP status 这类内容。
 */

import { Redirect, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getDatabase, listTables } from '@/db/database';
import { getMetaBoolean, META_KEYS } from '@/db/repositories/metaRepo';
import { ERROR_CODES } from '@/domain/errors';
import { colors, radii, spacing, typography } from '@/theme';

interface TableCount {
  table: string;
  rows: number | null;
}

export default function DeveloperScreen() {
  const insets = useSafeAreaInsets();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tables, setTables] = useState<TableCount[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const enabled = await getMetaBoolean(META_KEYS.developerMode);
      setAllowed(enabled);
      if (!enabled) return;

      try {
        const db = await getDatabase();
        const names = await listTables();
        const result: TableCount[] = [];
        for (const table of names) {
          try {
            const row = await db.getFirstAsync<{ n: number }>(
              `SELECT COUNT(*) AS n FROM ${table};`,
            );
            result.push({ table, rows: row?.n ?? 0 });
          } catch {
            result.push({ table, rows: null });
          }
        }
        setTables(result);
      } catch (err) {
        setError(String(err));
      }
    })();
  }, []);

  if (allowed === false) return <Redirect href="/(tabs)/profile" />;

  return (
    <>
      <Stack.Screen options={{ title: '开发者选项', headerShown: true }} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
      >
        <View style={styles.card}>
          <Text style={styles.cardHeader}>SQLite</Text>
          {error ? <Text style={styles.mono}>{error}</Text> : null}
          {tables.map((t) => (
            <View key={t.table} style={styles.row}>
              <Text style={styles.monoLabel}>{t.table}</Text>
              <Text style={styles.mono}>{t.rows == null ? '读取失败' : `${t.rows} 行`}</Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardHeader}>错误分类（§42，禁止统一 UNKNOWN_PRODUCT）</Text>
          {ERROR_CODES.map((code) => (
            <Text key={code} style={styles.mono}>
              {code}
            </Text>
          ))}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  cardHeader: { ...typography.section, color: colors.text, marginBottom: spacing.xs },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  monoLabel: { fontSize: 12, color: colors.textSecondary, fontFamily: 'monospace' },
  mono: { fontSize: 12, color: colors.textSecondary, fontFamily: 'monospace' },
});
