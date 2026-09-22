/**
 * 底部导航（产品需求 §7）：只保留 今日 / 库存 / 我的，不增加一级页面。
 *
 * 图标用纯 View 画的极简几何形状，避免引入图标库依赖，
 * 也与康康的几何风格保持一致。
 */

import { Tabs } from 'expo-router';
import { StyleSheet, View, type ColorValue } from 'react-native';

import { colors, typography } from '@/theme';

interface TabIconProps {
  color: ColorValue;
  focused: boolean;
}

/** 今日：一个圆环，代表“今天”的进度 */
function TodayIcon({ color, focused }: TabIconProps) {
  return (
    <View
      style={[
        styles.todayRing,
        { borderColor: color, borderWidth: focused ? 2.4 : 2 },
      ]}
    />
  );
}

/** 库存：两条横杠，代表架上的物品 */
function InventoryIcon({ color }: TabIconProps) {
  return (
    <View style={styles.stackIcon}>
      <View style={[styles.stackBar, { backgroundColor: color }]} />
      <View style={[styles.stackBar, { backgroundColor: color, width: 14 }]} />
    </View>
  );
}

/** 我的：圆点加弧线，代表一个人 */
function ProfileIcon({ color }: TabIconProps) {
  return (
    <View style={styles.personIcon}>
      <View style={[styles.personHead, { backgroundColor: color }]} />
      <View style={[styles.personBody, { borderColor: color }]} />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.mintDark,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: colors.glass,
          borderTopColor: colors.divider,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 62,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: typography.caption.fontSize, fontWeight: '500' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '今日',
          tabBarIcon: TodayIcon,
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: '库存',
          tabBarIcon: InventoryIcon,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: '我的',
          tabBarIcon: ProfileIcon,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  todayRing: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  stackIcon: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    gap: 5,
  },
  stackBar: {
    height: 2.6,
    width: 20,
    borderRadius: 2,
  },
  personIcon: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  personHead: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 2,
  },
  personBody: {
    width: 16,
    height: 8,
    borderWidth: 2,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomWidth: 0,
    marginTop: 2,
  },
});
