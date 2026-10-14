# HuKang / 护康 — Phase 1～4 测试报告

最后更新：2026-10，新增第 7 节「PP-OCRv5 引擎离线验证」

---

## 0. 标记含义（严格区分，不允许把"没测"写成 PASS）

| 标记 | 含义 |
| --- | --- |
| `PASS` | 在本机实际执行过，且结果符合预期 |
| `FAIL` | 在本机实际执行过，结果不符合预期 |
| `NOT TESTED` | 需要设备/环境但当前不具备，**完全没跑过** |
| `NOT TESTED ON PHYSICAL DEVICE` | 只有真实 Android 手机才能最终确认的能力 |

**本报告的所有 `PASS` 都只代表"在本机 Mac 上执行并通过"**，不代表设备上可用。
代码写完、类型通过、构建成功，都不等于功能完成。

---

## 1. 交付物

| 项 | 值 |
| --- | --- |
| APK 相对路径 | `releases/android/current/HuKang-1.0.0.apk` |
| APK 绝对路径 | `/Users/yangbing/Ai/deepseek/软件开发/护康/releases/android/current/HuKang-1.0.0.apk` |
| 包名 | `com.hukang.deepseek` |
| versionName | `1.0.0` |
| versionCode | `1` |
| 文件大小 | 180,786,227 字节（约 172 MB） |
| SHA-256 | `ad5027859e71b2fda13a1cb27eacb5610fef29169340faef39a1d17c7e61082d` |
| minSdkVersion | 24（Android 7.0） |
| targetSdkVersion | 36 |
| compileSdkVersion | 36 |
| 应用名 | 护康 |
| 签名 | APK Signature Scheme **v2 有效**，证书 `CN=Android Debug` |
| 可点装 | 是（清单中**无** `testOnly`、**无** `debuggable`） |
| 内嵌 JS bundle | 是（`assets/index.android.bundle`，2,536,548 字节） |
| 原生架构 | `arm64-v8a` / `armeabi-v7a` / `x86` / `x86_64` |
| 权限 | `CAMERA` · `INTERNET` · `ACCESS_NETWORK_STATE` · `READ/WRITE_EXTERNAL_STORAGE`(maxSdk 32) · `VIBRATE`（**无 `RECORD_AUDIO`**） |

> 签名用的是 React Native 模板自带的 debug keystore。它**能正常安装**，
> 但只适合内部测试；正式发布必须换成自己的 keystore。
> 包名一致的情况下，后续换签名需要先卸载再装。

> **本 APK 是在交付目录 `护康/` 内、从零独立构建出来的**
> （`npm ci` 全新安装 497 个包 → `./gradlew assembleRelease`，
> 612 个任务全部从头执行）。这同时验证了交付版是一个可独立构建的完整项目。

### 1.1 当前交付 APK（1.1.0 · PaddleOCR PP-OCRv5）

`HuKang-1.1.0.apk` 取代 1.0.1 成为当前交付版本。它在 **GitHub Actions 云端**
构建（本机无 Android SDK），构建记录：run `38546920449`，用时 14 分 19 秒。

| 项 | 值 |
| --- | --- |
| 文件 | `releases/android/current/HuKang-1.1.0.apk` |
| 文件大小 | 144,801,122 字节（约 **138 MB**） |
| SHA-256 | `c7069de59bfa0094bbfd3b426baaaef89973bc8fc659ec7a142f602d88aef9ee` |
| 包名 | `com.hukang.deepseek` |
| versionName | `1.1.0` |
| versionCode | **`2`** |
| 应用名 | 护康 |
| 原生架构 | **`arm64-v8a` / `armeabi-v7a`**（已砍掉 x86/x86_64，见 D021） |
| 签名 | APK Signature Scheme **v2**，证书 `CN=Android Debug` |
| 证书 SHA-256 | `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` |
| 可覆盖安装 | ✅ 证书指纹与 1.0.0 / 1.0.1 **完全一致**，且 versionCode 升到 2 |
| 内嵌模型 | `assets/models/` 下 3 个文件（4.8MB + 16.6MB + 74KB） |
| ONNX Runtime | `lib/{arm64-v8a,armeabi-v7a}/libonnxruntime.so` |

**体积对比 —— 加了 21MB 模型，净结果反而小了 34MB：**

| 版本 | 体积 | 差异 |
| --- | --- | --- |
| 1.0.0 / 1.0.1（4 个 ABI） | 180,798,523 字节（172 MB） | — |
| **1.1.0（2 个 ABI + 模型 + ONNX Runtime）** | **144,801,122 字节（138 MB）** | **−36 MB（−20%）** |

砍掉仅用于模拟器的 x86/x86_64 省下的空间，超过了 ONNX Runtime 与模型的增量。
这是 D021 的意外收获，也说明「加功能必然变胖」并不成立。

> **之前 1.0.0 与 1.0.1 的 versionCode 都是 1**，从系统设置里分辨不出装了哪一版。
> 1.1.0 起改为递增，后续每次交付都应继续递增。

---

## 2. 测试结果汇总

| # | 测试层 | 方法 | 结果 |
| --- | --- | --- | --- |
| 1 | TypeScript 类型 | `npx tsc --noEmit` | `PASS` — 0 错误 |
| 2 | 单元测试（离线） | `npm test` | `PASS` — 141 通过 / 0 失败 / 2 跳过 |
| 3 | 集成测试（真实联网） | `npm run test:integration` | `PASS` — 14 通过 / 0 失败 |
| 4 | JS 依赖图 | `npx expo export --platform android` | `PASS` — 生成 3.1MB Hermes 字节码 |
| 5 | 原生模块注册 | 检查生成的 `ExpoModulesPackageList.kt` | `PASS` — 含 `com.hukang.vision.HukangVisionModule` |
| 6 | 中文 OCR 模型打包 | 检查 APK 内容 | `PASS` — 含 `libmlkit_google_ocr_pipeline.so` 与 Hani(汉字) CTC 模型 |
| 7 | Android 本地构建 | `./gradlew assembleDebug assembleRelease` | `PASS` — BUILD SUCCESSFUL |
| 8 | APK 校验 | `aapt2` + `apksigner` | `PASS` — 见第 1 节 |
| 9 | App 运行时行为 | 需要设备 | `NOT TESTED` |
| 10 | 真实相机 / OCR / 扫码 | 需要真机 | `NOT TESTED ON PHYSICAL DEVICE` |

---

## 3. 单元测试明细（141 通过）

| 套件 | 用例数 | 覆盖内容 |
| --- | --- | --- |
| `nutritionParser.test.ts` | 35 | 营养成分表解析：基准、单位、包含关系、上限写法 |
| `productIdentity.test.ts` | 25 | 包装正面身份提取、规格归一、品类猜测、OCR 行拍平 |
| `barcode.test.ts` | 22 | EAN-13/8、UPC-A/E 归一化、GTIN 校验位、UPC-E 展开 |
| `expiry.test.ts` | 15 | 保质期状态边界、日期推算、本地日期不跨日错位 |
| `nutritionDraft.test.ts` | 13 | 草稿层：清空 = 未记录，填 0 = 0 |
| `nutrition.test.ts` | 13 | 营养换算与汇总：`null ≠ 0`、无法换算时留空 |
| `openFoodFacts.test.ts` | 12 | OFF 字段映射、钠克→毫克、添加糖缺失必须为 null |
| `providerResponses.test.ts` | 6 | 缺失 / 404 / 503 限流 / 网络故障 → 结果状态映射 |
| `realLabels.test.ts` | 2 跳过 | 真实包装照片验证，**fixture 采集失败，未执行**（见第 6 节） |

重点守住的规则（都有对应用例）：

- `carbohydrate_g` / `total_sugar_g` / `added_sugar_g` 三者互不顶替；
  「添加糖」缺失时必须是 `null`，绝不用总糖或碳水回填
- 「糖类」不算糖（它是碳水）、「饱和脂肪」「反式脂肪酸」不算脂肪
- 显式的 `0` 保持 `0`，与「未记录」在数据层和界面层都不混淆
- `＜0.1g` 这种上限写法不赋值
- 包装只写千焦时 `energy_kcal` 保持 `null`，不做换算
- 校验位错误的条码判为「重扫」，不判为「查不到」
- HTTP 503 限流必须映射成 `unavailable`，**不能变成 `no_match`**

---

## 4. 集成测试明细（14 通过，真实联网）

真实访问 Open Food Facts，非 mock：

| 用例 | 结果 |
| --- | --- |
| 可口可乐 `5449000000996` 查到真实商品，能量/碳水/钠齐全 | `PASS` |
| 钠从克正确换算为毫克（0.0428g → 42.8mg） | `PASS` |
| 中国商品 茉莉花茶 `6921168558049` 查到，基准正确识别为**每 100ml** | `PASS` |
| 中文关键词搜「农夫山泉」返回国产商品 | `PASS` |
| 本地命中 → 不联网 | `PASS` |
| 本地未命中 → 自动联网（用户无需点「联网搜索」） | `PASS` |
| UPC-A 按 `036000291452` → `0036000291452` 两种键依次查询 | `PASS` |
| 校验位错误 → `invalid`，且完全不联网、不查本地 | `PASS` |
| stub 数据源全 `no_match` → `not_found` | `PASS` |
| stub 数据源全 `unavailable` → `unavailable`（不等于商品不存在） | `PASS` |
| 数据源抛异常 → 降级为 `unavailable`，查询不崩 | `PASS` |
| 503 限流结果**不是** `no_match`（单独断言该不变量） | `PASS` |

---

## 5. 必须真机验证的项目 —— 全部 `NOT TESTED ON PHYSICAL DEVICE`

以下项目**一项都没有在真实 Android 手机上验证过**。代码已写完、构建通过，
但这**不构成**功能完成。

### 5.1 相机与拍摄

| 项目 | 状态 |
| --- | --- |
| 真实摄像头预览与拍照 | `NOT TESTED ON PHYSICAL DEVICE` |
| 近距离自动对焦（食品标签小字） | `NOT TESTED ON PHYSICAL DEVICE` |
| 包装反光下的成像与识别 | `NOT TESTED ON PHYSICAL DEVICE` |
| 过暗 / 过曝场景 | `NOT TESTED ON PHYSICAL DEVICE` |
| 不同品牌手机的 Camera 行为差异 | `NOT TESTED ON PHYSICAL DEVICE` |
| 拍照后图片方向（EXIF）在各种机型上是否正确 | `NOT TESTED ON PHYSICAL DEVICE` |
| 权限拒绝 / 重新授权 / 跳转系统设置的实际流程 | `NOT TESTED ON PHYSICAL DEVICE` |

### 5.2 条形码

| 项目 | 状态 |
| --- | --- |
| 实际扫码速度与成功率 | `NOT TESTED ON PHYSICAL DEVICE` |
| 弯曲 / 反光 / 磨损包装上的条码 | `NOT TESTED ON PHYSICAL DEVICE` |
| 从相册导入图片解码条码 | `NOT TESTED ON PHYSICAL DEVICE` |
| EAN-13 / EAN-8 / UPC-A / UPC-E 在真机上的识别率 | `NOT TESTED ON PHYSICAL DEVICE` |

### 5.3 OCR 与识别

| 项目 | 状态 |
| --- | --- |
| ML Kit 中文 OCR 对真实食品包装的识别效果 | `NOT TESTED ON PHYSICAL DEVICE` |
| 实拍营养成分表的识别准确率 | `NOT TESTED ON PHYSICAL DEVICE` |
| 图片质量四项指标（亮度/清晰度/反光/过暗）的实际分布 | `NOT TESTED ON PHYSICAL DEVICE` |
| 图片质量阈值是否合理（当前是工程经验值，**未标定**） | `NOT TESTED ON PHYSICAL DEVICE` |
| 拍商品五步链路的设备端表现 | `NOT TESTED ON PHYSICAL DEVICE` |
| 商品身份提取在真实包装照片上的准确率 | `NOT TESTED ON PHYSICAL DEVICE` |

### 5.4 App 运行时行为 —— `NOT TESTED`

以下需要设备但没有"真机特有"的属性，统一记为 `NOT TESTED`：

| 项目 | 状态 |
| --- | --- |
| SQLite 建表与增删改查实际执行 | `NOT TESTED` |
| 导航跳转、返回栈、Android 返回键行为 | `NOT TESTED` |
| 商品落库与商品图下载 | `NOT TESTED` |
| 「今日 / 库存 / 我的」页面实际渲染 | `NOT TESTED` |
| 开发者模式（版本号连点 7 次）实际开启 | `NOT TESTED` |
| 康康吉祥物与示意图的实际显示效果 | `NOT TESTED` |
| 安装 / 启动 / 崩溃情况 | `NOT TESTED` |

---

## 6. 未执行与未覆盖的测试

### 6.1 真实包装照片验证 —— 部分已补上（2026-10 更新）

原计划：Open Food Facts 真实商品照片 → macOS Vision OCR → 真实 OCR 文本 →
喂给营养解析器验证（工具见 `tools/mac-ocr/`）。

**这条路仍然走不通**：图片主机在本机不可达。

```
images.openfoodfacts.org   DNS 可解析(217.182.132.133)，TCP 连接超时(curl errno 28)
upload.wikimedia.org       同样超时
```

商品数据 API（`world.openfoodfacts.org`）是**可用**的，已确认茉莉花茶、农夫山泉、
红牛等商品确实带有营养成分表照片，但图片本身下载不下来。
GitHub 上也没有找到中文营养标签的公开图片集。

**但是**：真机测试录屏（`recording.mp4`，45 秒）已经抽出 16 帧真实商品画面，
其中 frame-08 是完整的瓶身正面照（东鹏「焙好茶」茉莉乌龙）。
这补上了「真实商品照片」这一环 —— 见第 7 节的 PP-OCRv5 离线验证。

**仍未补上的**：真实**营养成分表**照片的验证。录屏里瓶子是正面朝向，
没有拍到背面的营养成分表，所以：

> **营养解析器至今只在人工构造的标签文本上验证过，
> 没有在任何真实照片的 OCR 输出上验证过。** 这是当前最大的测试缺口。

建议：下次真机测试时，**务必拍一张营养成分表的照片**并入录屏，
这样才能验证 Phase 4 的整条链路。

### 6.2 模拟器测试

未执行。本机无任何 AVD、未安装 system-image。
（按你的要求，本轮不再尝试创建模拟器或安装镜像。）

### 6.3 未实现的能力（不是"已测试"）

| 项目 | 说明 |
| --- | --- |
| 在线视觉模型 | `FoodVisionProvider` 接口与联网授权已落地，但**未接入任何厂商**（需要 API Key）。当前识别 100% 本地。 |
| 点击对焦 | expo-camera SDK 57 未暴露对焦 API，需要原生模块，未实现 |
| 配料表解析 | Phase 5，未开始 |
| 日期 / 库存 / 通知 | Phase 6，未开始 |
| 营养记录 / 历史 / 如果吃下它 | Phase 7，未开始 |
| 启动页 / 视觉统一 | Phase 8，未开始 |
| iOS | 原生模块只在 Android 实现，iOS 返回 null 并降级 |

---

## 7. PP-OCRv5 引擎离线验证（2026-10 新增）

**这一节全部是"在本机 Mac 上跑 Python 脚本"，不是真机测试。**
它证明的是**算法与参数正确**，不能替代装机验证。

### 7.1 字符集映射与 CTC 解码 —— `PASS`

| 项 | 值 |
| --- | --- |
| 方法 | 用 PIL 画已知内容的文字图 → 识别模型 → CTC 解码 → 与原文比对 |
| 为什么用合成图 | 真实照片错了分不清是「字符集错位」还是「模型本来就认不出」，合成图没有这个歧义 |
| 结果 | **8/8 全对**，置信度 0.95 ~ 0.999 |
| 用例 | 农夫山泉 / 配料表 / 净含量550ml / 营养成分表 / 能量 180kJ / 白砂糖 / 保质期12个月 / ABC123 |

**顺带查出的关键事实**：PaddleOCR 的类别布局是
`["blank"] + 18383 字符 + [" "]` = **18385**，不是 `18383 + 1`。
少算这个会让每个字都错位。

### 7.2 检测后处理 —— `PASS`（目视确认）

| 项 | 值 |
| --- | --- |
| 输入 | 真机录屏抽帧（576×1130 相机取景区域），东鹏「焙好茶」茉莉乌龙 |
| 结果 | 检出 11 个框，**位置准确**，连艺术字体的「茉莉」「乌龙」「原味茶饮料」「净含量500m」都框住 |
| 方式 | 输出画了红框的标注图，人工目视确认 |

### 7.3 端到端识别对比 —— `PASS`（离线）

同一帧图像：

| 引擎 | 行数 | 字符数 | 读出的内容 |
| --- | --- | --- | --- |
| ML Kit | 5 行 | 17 字 | 基本只有包装上的小徽标 |
| PP-OCRv5 | 10 行 | ~30 字 | 茉莉、乌龙、原味茶饮料、净含量500m |

### 7.4 竖排文字修复 —— `PASS`

| 区域 | 原样 | 逆时针 90° | 结论 |
| --- | --- | --- | --- |
| 竖排「焙好茶」 | `c` (0.18) | **`焙好茶` (0.99)** | 取旋转后 |
| 横排「茉莉」 | **`茉莉` (0.93)** | `Y` (0.22) | 取原样 |
| 横排「乌龙」 | **`乌龙` (0.99)** | `4` (0.05) | 取原样 |

置信度区分度极大，所以「竖长框取三个方向的最高置信度」是可靠判据。
**不能一律旋转** —— 那会把本来正确的横排文字转成乱码。

### 7.5 仍然 `NOT TESTED ON PHYSICAL DEVICE`

| 项 | 说明 |
| --- | --- |
| 真机推理速度 | 离线是 Mac CPU；手机上是否可接受**完全未知** |
| 真机召回是否同离线一致 | 降采样、摄像头噪点、内存压力都可能影响 |
| 首次识别的模型释放耗时 | 预期 1-2 秒，未实测 |
| 内存占用 | ONNX Runtime 会话 + 位图，未在低端机上验证 |
| APK 体积与安装 | 模型 21MB + ONNX Runtime，实际增量待构建后测量 |

---

## 8. 复现命令

```bash
cd /Users/yangbing/Ai/deepseek/软件开发/护康
source ../.dsh-cache/env.sh          # 仅本机需要：缓存重定向 + 使用系统 Node（见 README「环境要求」）

npx tsc --noEmit                     # 类型检查
npm test                             # 单元测试（离线）
npm run test:integration             # 集成测试（真实联网）

npx expo prebuild --platform android
cd android && ./gradlew assembleDebug assembleRelease
```

> `android/` 源码已在交付版中保留，所以 `expo prebuild` 不是必需的；
> 只有改过 `app.json` 或 config plugin 时才需要重跑它。

APK 校验：

```bash
BT=/Users/yangbing/Library/Android/sdk/build-tools/36.0.0
APK=/Users/yangbing/Ai/deepseek/软件开发/护康/releases/android/current/HuKang-1.0.0.apk

$BT/aapt2 dump badging "$APK" | head -5
$BT/apksigner verify --print-certs "$APK"
shasum -a 256 "$APK"
```
