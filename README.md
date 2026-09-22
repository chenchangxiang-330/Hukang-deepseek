# HuKang / 护康 — DeepSeek 版

食品识别 + 食品库存 + 营养记录 + 保质期管理的个人食品健康工具。

> 这是一个**从零重新开发**的独立版本，与另一套由 Codex 维护的 HuKang 完全隔离。
> 本项目不读取、不修改、不覆盖任何现有 HuKang 工程。

## 产品定位

核心价值：**知道我有什么，也知道我今天吃了什么。**

不是医疗 App。不做医疗诊断、疾病判断、药物推荐、AI 医生、社交、会员、复杂账号、复杂云同步，也不做没有可靠依据的“健康评分”。

## 技术栈

| 项 | 选择 |
| --- | --- |
| 框架 | React Native + Expo（SDK 57 / RN 0.86） |
| 语言 | TypeScript（strict） |
| 路由 | Expo Router（文件式路由，`src/app/`） |
| 本地库 | SQLite（`expo-sqlite`） |
| 图片 | App 私有目录（`expo-file-system` 新 API） |
| 架构 | Offline First（不是 Offline Only） |

## 目录结构

```
src/
  app/                     Expo Router 路由（每个文件就是一个页面）
    (tabs)/                今日 / 库存 / 我的
    scan/                  扫一扫：index（五种入口）· capture · result
    dev.tsx                开发者选项（需连续点击版本号 7 次开启）
  components/              康康吉祥物、五种扫描示意图
  db/                      SQLite：schema、database、repositories
  domain/                  领域模型与纯函数（营养计算、保质期、日期、错误分类）
  services/                图片落盘与文件校验等
  theme/                   颜色、间距、字号
docs/                      Expo SDK 57 API 核实记录
```

## 三个核心概念严格分离

| 概念 | 表 | 含义 |
| --- | --- | --- |
| Product | `products` | 这是什么商品 |
| InventoryItem | `inventory_items` | 我家里有什么 |
| NutritionLog | `nutrition_logs` | 我吃了什么 |

三者禁止合并。其中 `nutrition_logs.nutrition_snapshot` 保存**摄入当时的营养快照**：
用户以后修改商品营养数据，不会改写已经发生的历史记录。

## 数据正确性约定

- `carbohydrate_g`、`total_sugar_g`、`added_sugar_g` 是三个不同字段，
  **禁止**用碳水推导添加糖；包装未标注时一律存 `NULL`。
- `NULL` 表示“未记录”，与 `0` 完全不同。每日汇总保留 `unknownCount`，
  有未记录项时合计只是下限，界面上必须体现。
- 无法可靠换算份量时（基准缺失或单位不匹配），摄入营养整份留空，不猜。

## 开发环境

已有环境直接复用，**不需要重新安装**：

```
JDK 17 · Android SDK (ANDROID_HOME=/Users/yangbing/Library/Android/sdk)
Node.js · npm · adb · Build Tools · NDK · CMake
```

### 本项目特有的缓存重定向

当前开发沙箱禁止写入工作区之外的目录，而 npm / Gradle / Expo / Android 默认都会写
`~/.npm`、`~/.gradle`、`~/.expo`、`~/.android`。因此本仓库配套一个环境脚本，
把这些缓存全部指向工作区内的 `.dsh-cache/`：

```bash
source ../.dsh-cache/env.sh    # 见下方说明
```

它设置的变量：

| 变量 | 作用 |
| --- | --- |
| `npm_config_cache` | npm 缓存 |
| `GRADLE_USER_HOME` | Gradle 用户目录（wrapper 发行版 + 依赖缓存） |
| `__UNSAFE_EXPO_HOME_DIRECTORY` | Expo CLI 状态目录（官方提供的重定向开关） |
| `ANDROID_USER_HOME` / `ANDROID_AVD_HOME` | adb 密钥与 AVD |

> 如果在一个没有沙箱限制的普通终端里开发，**不需要**这些变量，
> 直接用系统默认的 `~/.gradle`、`~/.npm` 即可。

## 常用命令

```bash
npx tsc --noEmit                 # 类型检查
npm test                         # 单元测试
npx expo start                   # 开发服务器

# Android 本地构建（优先用项目自己的 gradlew）
npx expo prebuild --platform android     # 由 app.json + config plugin 生成 android/
cd android && ./gradlew assembleDebug    # 产出 debug APK
```

APK 位置：`android/app/build/outputs/apk/debug/app-debug.apk`

> `android/` 与 `ios/` 是 CNG 生成目录，已加入 `.gitignore`，
> 不要手工修改；原生行为一律通过 `app.json` 与 config plugin 配置。

## 测试与验收标记

测试结论严格使用四种标记，不允许把“没测”写成 PASS：

`PASS` · `FAIL` · `NOT TESTED` · `NOT TESTED ON PHYSICAL DEVICE`

凡依赖真实手机才能确认的能力（真实摄像头对焦、包装反光、实际扫码速度、
实拍 OCR 质量），即使模拟器或图片导入测试通过，也必须标记为
**NOT TESTED ON PHYSICAL DEVICE**。

## 开发阶段

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| Phase 1 | 项目骨架 · Navigation · SQLite · Camera · 图片导入 | 进行中 |
| Phase 2 | 条形码 · 本地商品库 · 联网 Barcode Lookup | 未开始 |
| Phase 3 | 拍商品 · Vision · OCR · 商品搜索 · 候选商品 | 未开始 |
| Phase 4 | 营养成分表 OCR · Nutrition Parser | 未开始 |
| Phase 5–8 | 配料表 · 日期/库存/通知 · 营养记录/历史 · 视觉统一 | 未开始 |
