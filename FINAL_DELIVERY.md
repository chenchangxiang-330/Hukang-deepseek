# 护康 HuKang — 最终交付说明

> 一页看完：这是什么、交付了什么、什么没验证、怎么接着做。

---

## 1. 项目基本info

| 项 | 值 |
| --- | --- |
| **项目名称** | 护康 HuKang（工程代号 HuKang-DeepSeek） |
| **当前版本** | `1.0.0`（Phase 1～4 交接版本） |
| **项目定位** | 食品识别 + 食品库存 + 营养记录 + 保质期管理的个人食品健康工具 |
| **核心价值** | 知道我有什么，也知道我今天吃了什么 |
| **不是** | 医疗 App（不做诊断 / 疾病判断 / 药物推荐 / AI 医生 / 健康评分） |

### 技术栈

| 项 | 版本 |
| --- | --- |
| Expo SDK | 57.0.24 |
| React Native | 0.86.3 |
| React | 19.2.3 |
| TypeScript | ~6.0.3（strict） |
| 路由 | Expo Router ~57.0.22（文件式） |
| 本地库 | expo-sqlite ~57.0.3 |
| 原生模块 | Kotlin + expo-modules-core 57.0.18（`modules/hukang-vision`） |
| OCR | Google ML Kit 中文识别 16.0.1（**bundled 模型，可离线**） |
| 测试 | jest-expo 57.x + jest 29.7 |

---

## 2. 交付物

| 项 | 值 |
| --- | --- |
| **package name** | `com.hukang.deepseek` |
| **versionName** | `1.0.0` |
| **versionCode** | `1` |
| **APK 名称** | `HuKang-1.0.0.apk` |
| **APK 绝对路径** | `/Users/yangbing/Ai/deepseek/软件开发/护康/releases/android/current/HuKang-1.0.0.apk` |
| **APK 大小** | 180,786,227 字节（约 172 MB） |
| **APK SHA-256** | `ad5027859e71b2fda13a1cb27eacb5610fef29169340faef39a1d17c7e61082d` |
| **APK 签名状态** | ✅ **有效**。APK Signature Scheme v2，证书 `CN=Android Debug`，2048 位 RSA |
| 可点装 | ✅ 清单中无 `testOnly`、无 `debuggable` |
| 内嵌 JS bundle | ✅ `assets/index.android.bundle`（2,536,548 字节），**装完即可独立运行** |
| minSdk / targetSdk / compileSdk | 24 / 36 / 36 |
| 原生架构 | `arm64-v8a` · `armeabi-v7a` · `x86` · `x86_64` |
| 权限 | `CAMERA` · `INTERNET` · `ACCESS_NETWORK_STATE` · `READ/WRITE_EXTERNAL_STORAGE`(maxSdk 32) · `VIBRATE`（**无 `RECORD_AUDIO`**） |

> 签名用的是 React Native 模板自带的 debug keystore（`android/app/debug.keystore`，
> 口令 `android`）。**能正常安装，只适合内部测试**，不能上架。
> **包名不变时换正式签名必须先卸载旧版。**

> 这个 APK 是在交付目录 `护康/` 内**从零独立构建**的
> （`npm ci` 全新装 497 个包 → `./gradlew assembleRelease`，612 任务全部执行）。
> 这同时证明了交接版是可独立构建的完整项目。

---

## 3. Git 记录

| 项 | 值 |
| --- | --- |
| **Git commit** | `674c38559a32882db674814d2a3e585123241c9a`（短哈希 `674c385`） |
| **Git commit 标题** | `chore: prepare HuKang project handoff` |
| **Git Tag** | `v1.0.0-handoff` |
| 分支 | `master` |
| 历史保留 | ✅ 保留全部 6 个提交，未做任何重写 |
| APK 是否入库 | ❌ 未入库（`.gitignore` 的 `*.apk` 规则忽略，符合项目约定） |

> Tag 指向交接提交之后的文档补全提交（内容与交接提交一致，仅补充了本页的哈希），
> 用 `git rev-parse v1.0.0-handoff` 可查看确切指向。

### 查询方式

```bash
cd 护康
git log --oneline            # 完整历史
git log -1 --format='%H'     # 交接提交哈希
git show v1.0.0-handoff      # Tag 指向的提交
git status                   # 应显示干净
```

### 提交历史

```
674c385  chore: prepare HuKang project handoff        ← 交接提交
b16e0f9  Phase 1～4 交付：可安装 APK + 测试报告 + 交接与问题清单
e8a4361  Phase 4: 营养成分表 OCR / Nutrition Parser / 用户确认
77a6df8  Phase 3: 拍商品 / 本地 OCR / 图片质量 / 商品身份提取 / 商品搜索 / 候选商品
ac9bfe1  Phase 2: 条形码 / 本地商品库 / 联网 Barcode Lookup
cb055a2  Phase 1: 项目骨架 / Navigation / SQLite / Camera / 图片导入
c7f3e8a  Initial commit
```

---

## 4. 测试状态

| 统计口径 | PASS | FAIL | NOT TESTED | NOT TESTED ON PHYSICAL DEVICE |
| --- | --- | --- | --- | --- |
| **自动化测试用例** | **155** | 0 | 2（跳过） | — |
| **测试层**（TEST_REPORT 第 2 节，共 10 项） | 8 | 0 | 1 | 1 |
| **功能验收项**（TEST_REPORT 第 5 节，共 24 项） | 0 | 0 | 7 | 17 |

### 已 PASS 的具体内容

| 项 | 结果 |
| --- | --- |
| TypeScript strict 类型检查 | 0 错误 |
| 单元测试（离线） | **141 通过 / 2 跳过** |
| 集成测试（真实联网 Open Food Facts） | **14 通过** |
| Metro 打包 | 成功（3.1MB Hermes 字节码） |
| 原生模块注册 | `ExpoModulesPackageList.kt` 含 `com.hukang.vision.HukangVisionModule` |
| ML Kit 中文模型打包 | APK 内含 `libmlkit_google_ocr_pipeline.so` + Hani(汉字) CTC 模型 |
| Android 构建 | debug + release 均 BUILD SUCCESSFUL |
| APK 校验 | 包名 / 版本 / 签名 / 架构 / 权限 / bundle 全部核对通过 |

### 2 个跳过的用例

`src/services/vision/__tests__/realLabels.test.ts` —— 真实包装照片验证。
fixture 采集失败（图片主机不可达，见 HK-008），**状态是「跳过」不是「通过」**。

### 未验证功能（`NOT TESTED ON PHYSICAL DEVICE`，17 项）

**所有依赖真实 Android 手机的相机、条码、OCR、拍商品识别功能，一项都没有真机验证过。**
完整清单见 `TEST_REPORT.md` 第 5 节，摘要：

- 真实摄像头预览与拍照、近距离自动对焦、包装反光、过暗 / 过曝
- 不同品牌手机的 Camera 行为差异、拍照后 EXIF 方向是否正确
- ML Kit 中文 OCR 对真实食品包装的识别效果、实拍营养表识别准确率
- 图片质量四项指标的实际分布与阈值合理性（**当前阈值未标定**）
- 实际扫码速度与成功率、弯曲 / 反光 / 磨损条码
- 拍商品五步链路的设备端表现、商品身份提取准确率
- 权限拒绝 / 重新授权 / 跳转系统设置的实际流程

### 未验证功能（`NOT TESTED`，7 项）

需要设备但非"真机特有"的运行时行为：SQLite 实际增删改查、导航跳转与返回键、
商品落库与商品图下载、三个 tab 页面渲染、开发者模式、康康与示意图显示效果、
安装 / 启动 / 是否闪退。

---

## 5. 已知 Bug

**当前没有任何"已确认的功能性缺陷"**——因为设备端一次都没跑过。
完整清单（含复现步骤、期望结果、实际结果、状态）见 `BUGS.md`。

### 最需要警惕的 3 项未验证风险

| ID | 级别 | 问题 |
| --- | --- | --- |
| **HK-001** | `P0` | 商品品牌名启发式提取可能严重出错——「净含量」这类文字可能被误认成品牌，导致搜索关键词全错 |
| **HK-002** | `P0` | OCR 丢失营养成分表行列对齐，**数值可能错位并被用户当真存进库**（最严重的数据正确性风险） |
| **HK-005** | `P0` | ML Kit 中文 OCR 对真实包装的效果完全未知——整个识别链的地基 |

其余：HK-003 拍照可能卡顿、HK-004 质量阈值未标定、HK-006 扫码速度未知、
HK-007 解析器未在真实 OCR 输出上验证、HK-008 图片主机不可达、
HK-009 接口限流、HK-010 商品图下载静默失败、HK-011 迁移只有 v1、
HK-012 众包数据有垃圾值、HK-013 读取失败与无数据界面相近。

另有 8 项**已知限制**（不是缺陷），例如未接入在线视觉模型、
未实现点击对焦、iOS 未实现、APK 体积偏大等，详见 `BUGS.md` 第二节。

---

## 6. 外部 API

| 服务 | 用途 | 是否需要密钥 | 状态 |
| --- | --- | --- | --- |
| **Open Food Facts** `world.openfoodfacts.org` | 按条码查商品（v2 / v3）+ 中文关键词搜索 | ❌ 不需要 | ✅ 实测可用，对国产商品有覆盖 |
| **Wikidata** `www.wikidata.org` | 按 GTIN(P3962) 查商品身份 | ❌ 不需要 | ⚠️ 接口可达，但**商品条码覆盖几乎为零** |
| UPCitemdb | 按条码查商品 | 需要（有试用） | ❌ 本机连不上（HTTP 000） |
| barcodespider | 按条码查商品 | 需要 | ❌ 无密钥（HTTP 403） |

**当前没有接入任何在线视觉模型。** 识别 100% 本地：
ML Kit 中文 OCR（bundled 模型，可离线）+ 规则解析。

请求时会带 `User-Agent: HuKang-DeepSeek/1.0 (Android; personal food tracker)`，
见 `src/services/network/http.ts`。

---

## 7. Secrets 配置方法

### 当前版本需要配置什么？

**什么都不需要。** 装完即可完整运行：识别全在本地，联网只查公开接口。

### 将来接入在线视觉模型时

```bash
cd 护康
cp .env.example .env      # .env 已在 .gitignore，不会被提交
```

在 `.env` 中填写：

```bash
VISION_API_KEY=你的密钥
API_BASE_URL=            # 可选，留空用默认地址
```

`VISION_API_KEY=` 为空时表示**不启用在线识别**，App 只走本地路径。

### 硬性规则

- ❌ **禁止**把密钥硬编码进 App
- ❌ **禁止**提交到 git（`.env.example` 是模板，只写空值）
- ✅ 运行时从 Developer Settings 读取，使用 SecureStore / Android Keystore
- ✅ 上传图片前必须检查授权状态（`src/services/vision/consent.ts`），
  默认关闭，且必须让用户明确同意

### 当前 Secrets 检查结果

✅ 交付目录内**不含任何明文密钥**：无 API Key、无 Token、无密码、
无私钥、无 OAuth Secret。
`android/app/debug.keystore` 是 React Native 模板自带的**公开测试签名**
（口令 `android`，人人都有），不属于敏感凭据。

---

## 8. 新 AI 接手第一步

### 立刻做这三件事

```bash
cd 护康

# 1) 确认环境能跑
npm ci
npx tsc --noEmit      # 应零错误
npm test              # 应 141 通过 / 2 跳过

# 2) 花 20 分钟读文档（顺序很重要）
#    PROJECT_SPEC.md   → 产品要求，第 6 节「数据规则」是硬性的
#    ARCHITECTURE.md   → 代码在哪、为什么这么写
#    DECISIONS.md      → 20 条关键决策，避免把刻意设计当 Bug 改掉
#    BUGS.md           → 未验证风险与已知限制
#    TEST_REPORT.md    → 什么测过、什么没测过

# 3) 看当前状态
git log --oneline
git status
```

### 然后按情况分支

| 情况 | 做什么 |
| --- | --- |
| 用户给了**真机测试反馈** | 优先修 `BUGS.md` 里被证实的问题，尤其 HK-001（品牌提取）与 HK-002（营养表行列对齐） |
| 用户说**继续开发** | 按 Phase 顺序推进，下一个是 **Phase 5 配料表**（具体步骤见 `HANDOFF.md` 第 6 节） |
| 用户说**要装 APK** | 用 `releases/android/current/HuKang-1.0.0.apk`，直接传给手机点装 |

### 绝对不能做的事

- ❌ 把刻意设计当成 Bug 改掉（先看 `DECISIONS.md`）
- ❌ 用常识补缺失的营养数据
- ❌ 用碳水推导添加糖、用总糖顶替添加糖
- ❌ 把 `null`（未记录）当成 `0`
- ❌ 把 503 限流当成"商品不存在"
- ❌ 手改 `android/` 或 `ios/`（改 `app.json` 与 config plugin 后重新 prebuild）
- ❌ 凭记忆写 Expo API（先查 `docs/expo-sdk-57-api-reference.md`）
- ❌ 把"代码写完"当成"功能完成"

---

## 9. 从新电脑恢复项目

```bash
# ---- 1. 装工具（只需一次）----
# Node.js 20+ / npm 10+
# JDK 17
# Android SDK：platform-tools + platforms;android-36 + build-tools;36.0.0

export JAVA_HOME=$(/usr/libexec/java_home -v 17)          # macOS
export ANDROID_HOME=$HOME/Library/Android/sdk
export ANDROID_SDK_ROOT=$ANDROID_HOME

# ---- 2. 恢复依赖 ----
cd 护康
npm ci                       # 依据 package-lock.json，约 497 个包

# ---- 3. 验证 ----
npx tsc --noEmit             # 零错误
npm test                     # 141 通过 / 2 跳过
npm run test:integration     # 14 通过（需联网）

# ---- 4. 构建 APK ----
cd android && ./gradlew assembleRelease
cp app/build/outputs/apk/release/app-release.apk \
   ../releases/android/current/HuKang-1.0.0.apk
```

`android/` 目录**已在交付版中保留源码**，所以不需要先跑 `expo prebuild`。
若该目录被删或修改过 `app.json`，重新生成：

```bash
npx expo prebuild --platform android
```

首次构建会自动下载 Gradle 9.3.1（约 145MB）与依赖（约 1GB），
耗时约 6～15 分钟，之后增量构建几十秒。

> **如果目标机器有沙箱限制导致无法写 `~/.gradle` 等目录**，
> 需要先做缓存重定向与 Node 切换，做法见 `README.md` 的「环境要求」一节。

---

## 10. 文档索引

| 文件 | 内容 |
| --- | --- |
| `README.md` | 项目介绍 · 技术栈 · 环境要求 · 安装 · 启动 · 构建 · 新电脑恢复 |
| `PROJECT_SPEC.md` | **产品要求（权威来源）** |
| `ARCHITECTURE.md` | 技术架构与关键文件职责 |
| `DECISIONS.md` | 20 条关键决策与理由 |
| `HANDOFF.md` | 交接说明与下一步 |
| `BUGS.md` | 缺陷 / 限制 / 风险（含复现步骤） |
| `TEST_REPORT.md` | 测试报告（PASS / FAIL / NOT TESTED 严格区分） |
| `CHANGELOG.md` | 版本变更记录 |
| `FINAL_DELIVERY.md` | 本文件 |
| `docs/expo-sdk-57-api-reference.md` | 已核实的 Expo SDK 57 API |
| `tools/mac-ocr/README.md` | 开发期 OCR 验证工具说明 |
| `releases/android/current/README.md` | APK 说明与校验命令 |
