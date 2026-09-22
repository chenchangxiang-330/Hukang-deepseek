import { Stack } from 'expo-router';

import { colors } from '@/theme';

export default function ProductLayout() {
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
      <Stack.Screen name="[id]" options={{ title: '商品' }} />
      <Stack.Screen name="create" options={{ title: '手动创建商品' }} />
    </Stack>
  );
}
