/**
 * 开发者选项（产品需求 §34 / §55）
 *
 * 只有开启开发者模式后才可达。普通用户界面绝不能出现
 * OCR raw text / JSON / API / file:// / Parser / HTTP status 这类内容。
 */

import { Redirect, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getDatabase, listTables } from '@/db/database';
import { getMetaBoolean, META_KEYS } from '@/db/repositories/metaRepo';
import { ERROR_CODES } from '@/domain/errors';
import {
  getOcrEngine,
  OCR_ENGINE_LABELS,
  OCR_ENGINES,
  setOcrEngine,
} from '@/services/vision/enginePreference';
import { colors, radii, spacing, typography } from '@/theme';
import type { OcrEngine } from '../../modules/hukang-vision';

interface TableCount {
  table: string;
  rows: number | null;
}

export default function DeveloperScreen() {
  const insets = useSafeAreaInsets();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tables, setTables] = useState<TableCount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [engine, setEngine] = useState<OcrEngine | null>(null);

  useEffect(() => {
    void (async () => {
      const enabled = await getMetaBoolean(META_KEYS.developerMode);
      setAllowed(enabled);
      if (!enabled) return;

      try {
        setEngine(await getOcrEngine());
      } catch {
        // 引擎偏好读不到不该挡住整个开发者页面
      }

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

  const chooseEngine = async (next: OcrEngine) => {
    setEngine(next);
    try {
      await setOcrEngine(next);
    } catch (err) {
      setError(String(err));
    }
  };

  if (allowed === false) return <Redirect href="/(tabs)/profile" />;

  return (
    <>
      <Stack.Screen options={{ title: '开发者选项', headerShown: true }} />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
      >
        <View style={styles.card}>
          <Text style={styles.cardHeader}>本地 OCR 引擎</Text>
          <Text style={styles.hint}>
            两套引擎都在包里。切到这里之后回到拍照识别，用同一张照片就能直接比出高下。
          </Text>
          {OCR_ENGINES.map((candidate) => {
            const active = engine === candidate;
            return (
              <Pressable
                key={candidate}
                onPress={() => void chooseEngine(candidate)}
                style={[styles.engineRow, active && styles.engineRowActive]}
              >
                <Text style={[styles.engineLabel, active && styles.engineLabelActive]}>
                  {OCR_ENGINE_LABELS[candidate]}
                </Text>
                <Text style={styles.mono}>{active ? '使用中' : '切换'}</Text>
              </Pressable>
            );
          })}
          <Text style={styles.hint}>
            {engine === 'paddle'
              ? 'PP-OCRv5：离线 ONNX 模型，商品包装召回更高，首次识别会慢一两秒（释放模型）。'
              : 'ML Kit：响应更快、体积更小，但包装上的文字召回明显偏低。'}
          </Text>
        </View>

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
  hint: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  monoLabel: { fontSize: 12, color: colors.textSecondary, fontFamily: 'monospace' },
  mono: { fontSize: 12, color: colors.textSecondary, fontFamily: 'monospace' },
  engineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginTop: spacing.xs,
  },
  engineRowActive: { borderColor: colors.mint, backgroundColor: colors.background },
  engineLabel: { fontSize: 14, color: colors.text },
  engineLabelActive: { color: colors.mint, fontWeight: '600' },
});
