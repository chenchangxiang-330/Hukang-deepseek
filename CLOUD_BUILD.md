# 云端构建指南

> 本机已不再安装 Android SDK 与 Android Studio（由用户主动删除）。
> 本文说明如何**完全在云端**构建可安装的 Android APK。

---

## 0. 结论先说

**可以，而且这个项目很适合云构建。** 有两条路线：

| | EAS Build（推荐） | GitHub Actions |
| --- | --- | --- |
| 需要什么 | Expo 账号（免费） | GitHub 仓库 |
| 是否要本地 Android SDK | ❌ 不需要 | ❌ 不需要 |
| 免费额度 | 有限（有排队） | 公开仓库不限 / 私有仓库 2000 分钟/月 |
| 配置文件 | `eas.json`（已就绪） | `.github/workflows/android-build.yml`（已就绪） |
| 签名 | EAS 托管密钥（**与现有 APK 不同签名**） | 沿用仓库里的 debug keystore（**与现有 APK 同签名**） |
| 拿到产物 | 网页链接 / `eas build:run` | Actions 页面下载 Artifact |

---

## 0.1 已经实测确认的前提（不是推测）

| 结论 | 怎么确认的 |
| --- | --- |
| **`npx expo prebuild` 不需要 Android SDK** | 在 SDK 已被删除的情况下实际跑通，成功生成 `android/` |
| **prebuild 可逐字节复现** | `expo prebuild --clean` 重新生成后，`git status android/` 显示 **0 个变更** |
| 云服务可达 | `api.expo.dev` / `expo.dev` / `github.com` / `api.github.com` 均返回 200 |
| `eas.json` 与工作流语法合法 | 已用 Node 解析校验 |
| 项目本地可完整构建 | 交付前实测：`npm ci` + `./gradlew assembleRelease`（612 任务）成功 |

## 0.2 **尚未**实测的部分（不要当成已验证）

- ❌ **没有真正跑过一次 EAS 构建**——需要你的 Expo 账号与令牌
- ❌ **没有真正跑过一次 GitHub Actions 构建**——需要把仓库推到 GitHub
- ❌ 未验证 EAS 上自定义原生模块（`modules/hukang-vision`）的编译结果
  （理论上没问题：`modules/` 会随项目一起上传，autolinking 在云端 Gradle
  配置阶段发现它，与本地构建走的是同一套机制）

---

## 1. EAS Build 方案（推荐）

### 1.1 你需要准备

1. 一个 **Expo 账号**（https://expo.dev 免费注册）
2. 告诉我账号，或者你自己执行下面命令登录

### 1.2 首次配置（只需一次）

```bash
cd 护康
npx eas-cli@latest login          # 交互式登录，或设置 EXPO_TOKEN 环境变量
npx eas-cli@latest init           # 关联 Expo 项目，会在 app.json 写入 extra.eas.projectId
```

> `eas init` 会修改 `app.json`（新增 `extra.eas.projectId`），这是正常的。

### 1.3 构建 APK

```bash
# 打一个可直接装到手机的测试包
npx eas-cli@latest build --platform android --profile preview
```

构建在 Expo 云端进行（约 10～20 分钟，首次更久），完成后终端会给出一个**下载链接**，
把链接发到手机上打开即可安装。

### 1.4 已配置的 profile（`eas.json`）

| profile | 产物 | 用途 |
| --- | --- | --- |
| `development` | APK | 开发客户端（含调试工具），配合 `npx expo start` |
| `preview` | APK | **内部测试包**，日常用这个 |
| `preview-debugkey` | APK | 同上，但**不注入 EAS 签名**，沿用仓库里的 debug keystore |
| `production` | AAB | 上架 Google Play 用 |

### 1.5 ⚠️ 签名问题（很重要）

用默认的 `preview` profile 时，**EAS 会生成一个全新的 release keystore**，
它与当前交付的 APK（`CN=Android Debug`）**签名不同**。

后果：**手机上如果已经装了旧 APK，新的装不上去，必须先卸载。**

| 你的情况 | 用哪个 profile |
| --- | --- |
| 还没装过 / 可以随时卸载重装 | `preview`（推荐，签名稳定，以后能上架） |
| 手机上已有旧 APK，想直接覆盖升级 | `preview-debugkey`（沿用同一 debug 签名） |

> `preview-debugkey` 用的是 `android/app/debug.keystore` ——
> 这是 React Native 模板自带的**公开测试签名**（口令 `android`），只适合内部测试。

### 1.6 不需要本地 Android SDK

EAS 在云端容器里自带 JDK、Android SDK、NDK。
你本地只需要 **Node.js + npm**（用来跑 `eas-cli` 和上传项目）。

---

## 2. GitHub Actions 方案

适合不想注册 Expo 账号的情况，或想完全掌控构建流程。

### 2.1 你需要准备

一个 GitHub 仓库（公开或私有均可）。

### 2.2 步骤

```bash
cd 护康
git remote add origin git@github.com:<你的用户名>/<仓库名>.git
git push -u origin main
git push origin v1.0.0-handoff
```

推送后：
1. 打开仓库的 **Actions** 页面
2. 选择 **Build Android APK** 工作流
3. 点 **Run workflow**（或直接向 `main` 推送代码即自动触发）
4. 等约 10 分钟，在运行详情页底部下载 **Artifacts → HuKang-APK-<commit>**

工作流会依次执行：检出代码 → 装 Node 24 → 装 JDK 17 → 准备 Android SDK
→ `npm ci` → 类型检查 → 单元测试 → `./gradlew assembleRelease` → 校验 APK → 上传。

### 2.3 签名与现有 APK 一致

工作流直接用仓库里 `android/app/debug.keystore` 构建 release 包，
所以**产出的 APK 与当前交付的 APK 同签名，可以直接覆盖安装**。

> 安全说明：这个 keystore 是 React Native 模板自带的公开测试签名，
> 提交进仓库是官方允许的做法（EAS 文档明确说 debug keystore 是唯一例外）。
> **将来要上架时，必须换成自己的正式 keystore，并且不要把它的密码提交进仓库。**

---

## 3. 两条路线都适用的注意事项

### 3.1 自定义原生模块会被正确打包

项目里有手写的 Kotlin 原生模块 `modules/hukang-vision`（ML Kit 中文 OCR）。
它在云端构建时会被 Expo autolinking 自动发现并编译，**不需要额外配置**。

验证方法：构建完成后检查产物里是否有 OCR 模型：

```bash
unzip -l app-release.apk | grep -E 'libmlkit_google_ocr|index.android.bundle'
```

应该能看到：
- `assets/index.android.bundle`（JS bundle，决定能否独立运行）
- `lib/*/libmlkit_google_ocr_pipeline.so` 与 `assets/mlkit-google-ocr-models/`

### 3.2 `android/` 目录当前是提交进仓库的

这意味着 EAS **不会**在云端跑 `npx expo prebuild`（官方文档：该步骤仅对 CNG 项目执行），
而是直接构建仓库里的 `android/`。这是最低风险的选择——构建的就是我们本地验证过的工程。

**代价**：如果你改了 `app.json` 或 config plugin（例如加权限、换应用名），
必须重新生成 `android/`：

```bash
npx expo prebuild --platform android --clean
git add android/ && git commit -m "chore: 重新生成 android/"
```

好消息：**这一步不需要 Android SDK**（已实测），只需要 Node。

**如果你更希望改成 CNG 模式**（由云端自动 prebuild，本地永远不用管 `android/`）：

```bash
# 1) 让 android/ 不再进版本管理
echo "/android" >> .gitignore
git rm -r --cached android/
git commit -m "chore: 切换为 CNG，android/ 交由云端生成"

# 2) GitHub Actions 用户还要在 workflow 的构建步骤前加一行：
#    npx expo prebuild --platform android --clean
```

两种模式产出的 APK 等价（已实测 prebuild 可逐字节复现）。

### 3.3 应用版本号

当前 `app.json` 里是 `version: 1.0.0`，`versionCode` 由 `android/app/build.gradle`
或 EAS 管理（`eas.json` 里设为 `appVersionSource: "local"`，即以前者为准）。

每次发布新测试包时，记得**把 versionCode +1**，否则手机会拒绝覆盖安装。

### 3.4 不要提交的东西

已在 `.gitignore` 中排除，但再强调一次：

- ❌ API Key / Token / 密码 / 私钥 / OAuth Secret
- ❌ 正式 keystore 及其密码
- ❌ `node_modules/`、构建产物、APK

需要配置密钥时参考 `.env.example`，并在 EAS 上用
`eas secret:create` 或环境变量注入，不要写进仓库。

---

## 4. 我需要你给什么才能替你跑一次云构建

我无法在 `api.expo.dev` 上代表你登录，也无法推送代码到你的 GitHub 仓库。想让我接手，需要下列之一：

| 方案 | 需要你提供 | 风险提示 |
| --- | --- | --- |
| **EAS Build** | Expo 账号的 `EXPO_TOKEN`（在 https://expo.dev/settings/access-tokens 创建） | 该 token 可操作你账号下的项目，请在构建完成后吊销 |
| **GitHub Actions** | 一个 GitHub 仓库地址 + 有推送权限的凭据 | 同上，建议用细粒度 token 或临时 SSH key |
| **你自己跑** | 什么都不用给 | 最安全，命令见第 1、2 节 |

**推荐第三种**：两条路线都只需要一条命令，配置我已经写好了。

---

## 5. 相关文件

| 文件 | 说明 |
| --- | --- |
| `eas.json` | EAS Build 的 4 个 profile |
| `.github/workflows/android-build.yml` | GitHub Actions 工作流 |
| `app.json` | 应用配置（`android.package` = `com.hukang.deepseek`） |
| `android/` | prebuild 生成的原生工程（当前提交进仓库） |
| `releases/android/current/` | 本地构建的交付 APK |
