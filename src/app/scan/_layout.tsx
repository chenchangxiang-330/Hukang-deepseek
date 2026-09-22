import { Stack } from 'expo-router';

import { colors } from '@/theme';

export default function ScanLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTintColor: colors.text,
        headerTitleStyle: { fontSize: 17, fontWeight: '600' },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: '扫一扫' }} />
      <Stack.Screen name="capture" options={{ title: '' }} />
      <Stack.Screen name="result" options={{ title: '识别结果' }} />
      <Stack.Screen name="barcode-result" options={{ title: '商品查询' }} />
      <Stack.Screen name="product-result" options={{ title: '拍商品' }} />
    </Stack>
  );
}
