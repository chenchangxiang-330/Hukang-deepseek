# 护康 HuKang

**食品识别 + 食品库存 + 营养记录 + 保质期管理**的个人食品健康工具。

核心价值：**知道我有什么，也知道我今天吃了什么。**

护康**不是**医疗 App：不做诊断、不做疾病判断、不做药物推荐、不做"AI 医生"、
不做社交与会员、不做没有可靠依据的"健康评分"。

---

## 项目介绍

扫一下、拍一下、确认一下，剩下的护康自己完成。用户不需要懂 OCR、Vision、
Parser、API、SQLite 或网络数据源。

### 五种识别入口（分开，不合并）

| 入口 | 拍摄提示 | 输出 |
| --- | --- | --- |
| 商品条形码 | 对准包装背面或侧面的商品条形码。 | 商品身份 |
| 拍商品 | 拍完整包装正面，让品牌名、商品名和规格尽量清晰。 | 商品身份 |
| 营养成分表 | 拍完整营养成分表。 | 营养数据 |
| 配料表 | 拍清楚完整配料文字。 | 配料数据（Phase 5） |
| 生产日期 / 保质期 | 拍清楚包装上的日期或喷码。 | 保质期（Phase 6） |

### 当前进度

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| Phase 1 | 项目骨架 · Navigation · SQLite · Camera · 图片导入 | ✅ |
| Phase 2 | 条形码 · 本地商品库 · 联网 Barcode Lookup | ✅ |
| Phase 3 | 拍商品 · 本地 OCR · 图片质量 · 商品身份提取 · 商品搜索 | ✅ |
| Phase 4 | 营养成分表 OCR · Nutrition Parser · 用户确认 | ✅ |
| Phase 5～8 | 配料表 · 日期/库存/通知 · 营养记录/历史 · 视觉统一 | ⬜ 未开始 |

**重要**：相机、条码、OCR、拍商品识别等依赖真实手机的能力，
**尚未在真机上验证过**，一律标记 `NOT TESTED ON PHYSICAL DEVICE`。
详见 `TEST_REPORT.md`。

---

## 技术栈

| 项 | 选择 | 版本 |
| --- | --- | --- |
| 框架 | Expo（React Native） | SDK **57.0.24** |
| RN | react-native | **0.86.3** |
| React | react | **19.2.3** |
| 语言 | TypeScript（strict） | **~6.0.3** |
| 路由 | Expo Router（文件式） | ~57.0.22 |
| 本地库 | expo-sqlite | ~57.0.3 |
| 图片 | expo-file-system（**新 API**） | ~57.0.7 |
| 相机 | expo-camera | ~57.0.5 |
| 相册 | expo-image-picker | ~57.0.19 |
| 显示 | expo-image | ~57.0.5 |
| 测试 | jest-expo + jest | 57.x / 29.7 |
| 原生 | Kotlin + expo-modules-core | 57.0.18 |
| OCR | Google ML Kit 中文识别（bundled 模型，可离线） | 16.0.1 |

> ⚠️ **Expo SDK 57 的 API 变化很大，不要凭记忆写。**
> 已核实的 API 记录在 `docs/expo-sdk-57-api-reference.md`，改动前先看它。
> 三个最容易踩的：`expo-file-system` 旧根函数在 v57 会**运行时抛错**、
> `expo-manipulator` 的 `manipulateAsync` 已废弃、
> `crypto.randomUUID()` 是**同步**的。

---

## 环境要求

> ⚠️ **本机已不再安装 Android SDK 与 Android Studio**（由用户主动删除，改为云端构建）。
> 如果你只是想打一个可安装的 APK，**请直接看 [`CLOUD_BUILD.md`](./CLOUD_BUILD.md)**，
> 不需要在本机装任何 Android 工具链。
>
> 本机做开发/测试只需要 **Node.js + npm**：
> `npx tsc --noEmit`、`npm test`、`npx expo prebuild` 都不需要 Android SDK
> （prebuild 已实测可在无 SDK 环境下运行，且结果可逐字节复现）。

### 通用要求

| 项 | 要求 |
| --- | --- |
| Node.js | 20 或更高（开发时用的是 24.x） |
| npm | 10 或更高（开发时用的是 11.x） |
| JDK | **17**（构建 Android 必需） |
| Android SDK | 需要 platform 36 + build-tools 36 + platform-tools |
| NDK / CMake | 仅在需要编译原生代码时用到；本项目用预编译产物，**通常不需要** |

Android SDK 相关环境变量：

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk      # macOS 默认位置
export ANDROID_SDK_ROOT=$ANDROID_HOME
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
```

### 本机（开发这台 Mac）特有的限制

**当前开发机的沙箱禁止写入工作区之外的目录，且 PATH 上的 `node` 不是标准 Node。**
所以在本机构建前必须先：

```bash
cd /Users/yangbing/Ai/deepseek/软件开发/护康
source ../.dsh-cache/env.sh
```

这个脚本做了 4 件事，每一件都对应一个真实踩过的坑：

| # | 问题 | 处理 |
| --- | --- | --- |
| 1 | 沙箱禁止写 `~/.npm` `~/.gradle` `~/.expo` `~/.android` | 全部重定向到工作区 `.dsh-cache/`（含 Expo 官方提供的 `__UNSAFE_EXPO_HOME_DIRECTORY` 开关） |
| 2 | PATH 上的 `node` 是 DSH 桌面端的 shim，以 `ELECTRON_RUN_AS_NODE=1` 跑 Electron；Electron 版 node 解析 yargs 位置参数与标准 Node 不一致，导致 RN codegen 报 `ENOENT` | 改用系统 `/usr/local/bin/node` |
| 3 | Kotlin 编译守护进程无法写 `~/Library/Application Support/kotlin/daemon/` | 在 `GRADLE_USER_HOME/gradle.properties` 设 `kotlin.compiler.execution.strategy=in-process` |
| 4 | 改了 PATH 后旧 Gradle 守护进程仍持旧环境 | 改完必须 `./gradlew --stop` 再构建 |

**换到一台没有沙箱限制的普通电脑上，以上都不需要**，直接用默认的
`~/.gradle`、`~/.npm`、系统 node 即可。

---

## 安装依赖

```bash
cd 护康
npm ci            # 严格按 package-lock.json 安装（推荐，可复现）
# 或
npm install       # 需要更新依赖时
```

依赖清单见 `package.json`，锁定版本见 `package-lock.json`。
安装约 497 个包。

> 如果加了**带原生代码**的库，需要重新生成原生工程：
> `npx expo install <包名>` 然后 `npx expo prebuild --platform android`。
> 不要手工编辑 `android/`。

---

## 启动方法

```bash
# 1) 类型检查（提交前必跑）
npx tsc --noEmit

# 2) 单元测试（离线，应 141 通过 / 2 跳过）
npm test

# 3) 集成测试（真实联网，应 14 通过）
npm run test:integration

# 4) 启动开发服务器
npx expo start
```

启动后可以用 Expo Go 扫码，或按 `a` 在已连接的 Android 设备上运行。

> **注意**：本项目含**自定义原生模块**（`modules/hukang-vision`），
> **Expo Go 里跑不了 OCR**。要测 OCR 必须装开发构建或下面构建的 APK。

---

## Android 构建方法

> **本机没有 Android SDK，下面的本地构建跑不了。** 请用云构建：见 [`CLOUD_BUILD.md`](./CLOUD_BUILD.md)。
> 以下步骤留作参考（例如换到有 SDK 的机器上时）。

```bash
# 1) 生成 / 更新原生工程（改了 app.json 或 config plugin 后必须重新跑）
#    这一步不需要 Android SDK，本机可以直接跑
npx expo prebuild --platform android

# 2) 构建 debug APK（不含 JS bundle，需要配合 npx expo start 运行）
cd android
./gradlew assembleDebug
```

产物：`android/app/build/outputs/apk/debug/app-debug.apk`

> **debug APK 不含 JS bundle**，装到手机上单独运行会白屏，必须同时跑 Metro。
> 要一个「装上就能跑」的包，请用下面的 release 构建。

如果要清理干净重来：

```bash
cd android && ./gradlew clean
# 或彻底重来
npx expo prebuild --platform android --clean
```

---

## APK 构建方法（可直接安装到手机）

> **本机没有 Android SDK，无法本地构建 APK。**
> 用云端构建，见 [`CLOUD_BUILD.md`](./CLOUD_BUILD.md)：
>
> ```bash
> npx eas-cli@latest build --platform android --profile preview   # EAS Build（推荐）
> ```
>
> 或者在 GitHub 仓库的 Actions 页面手动触发 `Build Android APK` 工作流。
>
> 以下本地步骤留作参考（换到有 SDK 的机器上时用）。

```bash
cd 护康
source ../.dsh-cache/env.sh          # 仅这台开发机需要，见「环境要求」

npx expo prebuild --platform android --clean --no-install
cd android
./gradlew assembleRelease
```

产物：`android/app/build/outputs/apk/release/app-release.apk`

复制到交付目录并按版本命名：

```bash
cd ..
mkdir -p releases/android/current
cp android/app/build/outputs/apk/release/app-release.apk \
   releases/android/current/HuKang-1.0.0.apk
```

### 校验 APK

```bash
BT=$ANDROID_HOME/build-tools/36.0.0

# 包名 / 版本 / 支持的 CPU 架构
$BT/aapt2 dump badging releases/android/current/HuKang-1.0.0.apk | head -5

# 签名是否有效
$BT/apksigner verify --print-certs releases/android/current/HuKang-1.0.0.apk

# 是否内嵌 JS bundle（决定能否独立运行）
unzip -l releases/android/current/HuKang-1.0.0.apk | grep index.android.bundle

# SHA-256
shasum -a 256 releases/android/current/HuKang-1.0.0.apk
```

### 关于签名

release 构建沿用 React Native 模板自带的 **debug keystore**
（`android/app/debug.keystore`，口令 `android`），
**能正常安装，只适合内部测试**。

正式发布必须换成自己的 keystore，并注意：
**包名不变时换签名需要先卸载旧版**。

---

## 新电脑恢复方法

假设你只有这个 `护康/` 文件夹，按下面步骤就能恢复出完整可开发、可构建的环境。

### 1. 装必备工具（只需一次）

```bash
# Node.js 20+ 与 npm（推荐用 nvm 或官网安装包）
node -v && npm -v

# JDK 17
java -version        # 应显示 17.x
export JAVA_HOME=$(/usr/libexec/java_home -v 17)   # macOS

# Android SDK（命令行工具即可，不必装 Android Studio）
# 需要：platform-tools、platforms;android-36、build-tools;36.0.0
export ANDROID_HOME=$HOME/Library/Android/sdk
export ANDROID_SDK_ROOT=$ANDROID_HOME
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

### 2. 恢复项目

```bash
cd 护康

# 依据 lock 文件精确还原依赖（约 497 个包）
npm ci

# 验证环境
npx tsc --noEmit        # 应零错误
npm test                # 应 141 通过 / 2 跳过
```

### 3. 恢复 Android 构建

`android/` 目录**已经在仓库里**（交接版特意保留了），所以：

```bash
cd android
./gradlew assembleRelease
```

如果 `android/` 被删了、或修改过 `app.json`／config plugin，重新生成：

```bash
cd ..
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
```

### 4. 首次构建会下载什么

- Gradle 发行版（wrapper 指定 9.3.1，约 145MB）
- Android Gradle Plugin、Kotlin 编译器、React Native 与 Expo 的依赖（约 1GB）
- ML Kit 中文识别模型与原生库（约 40MB，随依赖一起下来）

**这些都是自动的**，不需要手工下载。首次构建约 6～15 分钟，之后增量构建几十秒。

### 5. 需要配置的 Secret

**当前版本不需要任何密钥就能完整运行。**
识别 100% 本地，联网只查公开的 Open Food Facts。

将来接入在线视觉模型时需要填 `VISION_API_KEY`。
配置方法见 `.env.example` 与 `FINAL_DELIVERY.md` 的「Secrets 配置方法」。

> ⚠️ **密钥绝不入库**。真正的 `.env` 已在 `.gitignore` 中。

### 6. 恢复后自检清单

```bash
npx tsc --noEmit                                  # 类型
npm test                                          # 单元测试
npm run test:integration                          # 集成测试（需联网）
cd android && ./gradlew assembleRelease           # Android 构建
$ANDROID_HOME/build-tools/36.0.0/apksigner verify \
  ../releases/android/current/HuKang-1.0.0.apk    # APK 签名
```

四项都过，说明环境恢复完整。

---

## 目录结构

```
护康/
├── src/
│   ├── app/                  Expo Router 路由（每个文件是一个页面）
│   ├── components/           共享组件（康康、示意图、营养编辑器…）
│   ├── db/                   SQLite：schema / database / repositories
│   ├── domain/               纯函数领域层（无 IO，可单测）
│   ├── services/             编排层（网络 / 原生 / 文件 / 识别）
│   ├── theme/                颜色 / 间距 / 字号
│   └── utils/                小工具
├── modules/hukang-vision/    Android 原生模块（Kotlin + ML Kit 中文 OCR）
├── android/                  Android 工程（CNG 生成，但已保留源码）
├── assets/                   图标与启动图
├── tools/mac-ocr/            开发期 OCR 验证工具（不进 App）
├── docs/                     Expo SDK 57 API 核实记录
└── releases/android/current/ 交付的 APK
```

## 文档索引

| 文件 | 内容 |
| --- | --- |
| `PROJECT_SPEC.md` | **产品要求（权威来源）**：定位、页面、扫描模式、数据规则 |
| `ARCHITECTURE.md` | 技术架构：每块代码在哪、关键文件职责 |
| `DECISIONS.md` | 20 条关键决策与理由（**改代码前先看**） |
| `HANDOFF.md` | 交接说明：做到哪、下一步从哪开始 |
| `BUGS.md` | 缺陷 / 限制 / 风险清单（含复现步骤） |
| `TEST_REPORT.md` | 测试报告（严格区分 PASS / NOT TESTED） |
| `CHANGELOG.md` | 版本变更记录 |
| `FINAL_DELIVERY.md` | 交付信息：APK、签名、版本、Secrets 方法 |
| `CLOUD_BUILD.md` | **云端构建指南**（EAS Build / GitHub Actions，本机已无 Android SDK） |
| `docs/expo-sdk-57-api-reference.md` | 已核实的 Expo SDK 57 API |

---

## 数据正确性的硬性约定

改代码前必须知道这些（详见 `PROJECT_SPEC.md` 第 6 节）：

- `null` = 未记录，`0` = 含量确实为零，**两者完全不同**
- `carbohydrate_g` / `total_sugar_g` / `added_sugar_g` 是三个字段，
  **禁止**用碳水推导添加糖，也**禁止**用总糖顶替添加糖
- 无法可靠换算份量时留空，不猜
- 包装只写千焦时 `energy_kcal` 保持 `null`
- 条形码校验位错误 → 让用户重扫，**不能**报"查不到"
- 数据源 503 限流 → `unavailable`，**不能**报"商品不存在"
- 五种扫描任务各有独立错误码与结果页，禁止统一成"不认识这款食品"
- 不做任何"健康评分"

---

## 许可

见 `LICENSE`。
