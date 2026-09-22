# 护康 HuKang — 技术架构

> 面向接手开发的人/AI。看完这份应该知道每一块代码在哪、为什么这么写。

---

## 1. 技术栈

| 项 | 选择 | 版本 |
| --- | --- | --- |
| 框架 | Expo (React Native) | SDK **57.0.24** |
| RN | react-native | **0.86.3** |
| React | react | **19.2.3** |
| 语言 | TypeScript (strict) | **~6.0.3** |
| 路由 | Expo Router（文件式） | ~57.0.22 |
| 本地库 | expo-sqlite | ~57.0.3 |
| 图片 | expo-file-system（**新 API**） | ~57.0.7 |
| 相机 | expo-camera | ~57.0.5 |
| 相册 | expo-image-picker | ~57.0.19 |
| 显示 | expo-image | ~57.0.5 |
| 测试 | jest-expo + jest | 57.x / 29.7 |
| 原生 | Kotlin + expo-modules-core | 57.0.18 |

**Expo SDK 57 的 API 变化很大**，不要凭记忆写。项目里已核实过的 API 记录在
`docs/expo-sdk-57-api-reference.md`，改动前请先看它。

### 三个最容易踩的 API 变化

1. **expo-file-system 旧根函数在 v57 会运行时抛错**。
   必须用新的 `File` / `Directory` / `Paths` 类，不能用 `FileSystem.copyAsync` 等。
2. **`expo-image-manipulator` 的 `manipulateAsync` 已废弃**，
   改用 `ImageManipulator.manipulate(uri)` + `renderAsync` + `saveAsync`。
3. **`crypto.randomUUID()` 是同步的**（expo-crypto），不是 Promise。

---

## 2. 项目结构

```
护康/
├── src/
│   ├── app/                      Expo Router 路由（每个文件是一个页面）
│   │   ├── _layout.tsx           根 Stack
│   │   ├── (tabs)/
│   │   │   ├── _layout.tsx       底部导航（今日/库存/我的）
│   │   │   ├── index.tsx         今日
│   │   │   ├── inventory.tsx     库存
│   │   │   └── profile.tsx       我的
│   │   ├── scan/
│   │   │   ├── _layout.tsx
│   │   │   ├── index.tsx         五种扫描入口（含示意图）
│   │   │   ├── capture.tsx       采集：相机 / 相册
│   │   │   ├── result.tsx        通用图片结果（Phase 1 产物）
│   │   │   ├── barcode-result.tsx 条形码查询结果
│   │   │   ├── product-result.tsx 拍商品识别结果
│   │   │   └── nutrition-result.tsx 营养成分表识别与确认
│   │   ├── product/
│   │   │   ├── _layout.tsx
│   │   │   ├── [id].tsx          商品详情
│   │   │   └── create.tsx        手动创建商品
│   │   └── dev.tsx               开发者选项
│   ├── components/               共享组件
│   ├── db/                       SQLite：schema / database / repositories
│   ├── domain/                   纯函数领域层（无 IO，可单测）
│   ├── services/                 有 IO 的服务层
│   ├── theme/                    颜色 / 间距 / 字号
│   └── utils/                    小工具
├── modules/hukang-vision/        Android 原生模块（Kotlin）
├── android/                      prebuild 生成的 Android 工程
├── assets/                       图标与启动图
├── tools/mac-ocr/                开发期验证工具（不进 App）
├── docs/                         API 核实记录
└── releases/android/current/     交付的 APK
```

### 分层原则

```
app/        页面：只做编排与渲染，不写业务规则
  ↓
services/   编排：网络、原生模块、文件、识别流程
  ↓
domain/     纯函数：规则、换算、解析、状态机 —— 无 IO，必须可单测
  ↓
db/         持久化
```

**核心业务规则一律放在 `domain/` 且是纯函数**，这样能用单元测试钉住
（现有 141 个单测主要就测这一层）。

---

## 3. SQLite

### 表结构（`src/db/schema.ts`）

三概念严格分离：

```
products          这是什么商品
inventory_items   我家里有什么    (FK → products)
nutrition_logs    我吃了什么      (FK → products)
app_meta          应用级键值设置
```

`products` 关键字段：

```
id, barcode, brand, name, variant, quantity, category, image_uri,
nutrition_basis_amount, nutrition_basis_unit,
energy_kcal, energy_kj, protein_g, fat_g, carbohydrate_g,
total_sugar_g, added_sugar_g, fiber_g, sodium_mg,
ingredients_raw_text, ingredients_json,
data_source, created_at, updated_at, last_verified_at
```

`nutrition_logs.nutrition_snapshot`（TEXT/JSON）保存**摄入当时的营养快照**，
用户以后修改商品数据不会改写历史。

### 迁移机制（`src/db/database.ts`）

用 `PRAGMA user_version` 驱动，当前 `SCHEMA_VERSION = 1`。
建表语句是 `CREATE TABLE IF NOT EXISTS`，幂等。

> ⚠️ **Phase 5～8 如果改表结构，必须补增量迁移**，
> 否则已装 App 的用户升级后表结构对不上。

### 连接

`getDatabase()` 单例，失败时不缓存坏 Promise。
开启 `journal_mode = WAL` 与 `foreign_keys = ON`。
外键 `ON DELETE CASCADE`：删商品会连带清掉它的库存与摄入记录。

---

## 4. Android 原生模块 `hukang-vision`

本地 Kotlin 模块，用 **ML Kit 中文文字识别（bundled 模型）**，
装好即可**离线**识别中文食品标签。

### 位置

```
modules/hukang-vision/
├── expo-module.config.json        注册 com.hukang.vision.HukangVisionModule
├── index.ts                       TypeScript 接口（requireOptionalNativeModule）
└── android/
    ├── build.gradle               依赖 ML Kit 中文识别 + androidx.exifinterface
    └── src/main/java/com/hukang/vision/
        ├── HukangVisionModule.kt    模块定义与两个 AsyncFunction
        ├── BitmapLoader.kt          EXIF 方向纠正 + 按需降采样
        └── ImageQualityAnalyzer.kt  亮度 / 拉普拉斯方差 / 反光比 / 过暗比
```

### 暴露的接口

| 方法 | 返回 |
| --- | --- |
| `recognizeText(uri)` | `{ text, width, height, blocks[] }`，每块带 `boundingBox` |
| `analyzeQuality(uri)` | `{ width, height, brightness, blurScore, glareRatio, darkRatio }` |

### 两条硬性设计决定

1. **原生侧只到 OCR Raw Text**。
   语义解析（哪些字是"能量"、数值是多少）全部在 TypeScript 侧。
   好处：解析规则能用单测覆盖、能随时改，不用重编译原生代码。
2. **质量只返回客观指标**，阈值与"给用户什么建议"放在
   `src/services/vision/imageQuality.ts`，同理可测可调。

### 为什么带 boundingBox

营养成分表是**二维表格**。只靠纯文本无法还原"哪一行的数值属于哪个项目"。
`boundingBox`（以及 line/element 两级）是解析表格的必要信息。

### 平台支持

只在 `expo-module.config.json` 声明了 `android`。
iOS 上 `requireOptionalNativeModule` 返回 `null`，App 不崩但 OCR 不可用。

---

## 5. OCR

### 分层（产品要求明确指定）

```
Image → OCR → Raw Text → Parser → Structured Data
```

- **OCR**：`src/services/vision/ocr.ts` 包装原生模块
- **Parser**：`src/services/vision/nutritionParser.ts`（Phase 4）

### 失败必须分类（不允许静默）

| 情况 | 抛出 |
| --- | --- |
| 原生模块不可用 | `OCR_FAILED` |
| 图片读不了 | `PHOTO_FILE_INVALID` |
| 执行成功但没文字 | `OCR_NO_TEXT` |
| 原生异常 | `OCR_FAILED` |

上层据此进入明确错误状态，用户至少可以重拍 / 改文字 / 手动填。

---

## 6. Barcode

### `src/domain/barcode.ts`（纯函数）

- 支持 **EAN-13 / EAN-8 / UPC-A / UPC-E**（+ GTIN-14）
- **校验位按 GTIN 标准实算**，不是"看着像就放过"
- **UPC-E 必须先展开成 UPC-A** 才能验证与查询
- UPC-A 同时给出原始形式与补零的 EAN-13 形式（`lookupKeys`），
  因为同一个商品在不同数据库里可能以两种形式存储

### 查询链 `src/services/barcode/lookup.ts`

```
normalizeBarcode → SQLite 本地优先 → 未命中自动联网
```

结果状态**严格分开**（不允许合并成一句"不认识这款食品"）：

| 状态 | 含义 |
| --- | --- |
| `local` | 本地命中，断网可用 |
| `online` | 联网找到候选，需用户确认后落库 |
| `invalid` | 校验位不对 → **让用户重扫**，不是"查不到" |
| `not_found` | 所有数据源都明确说没有 |
| `unavailable` | 数据源不可用（网络/限流）→ **不等于商品不存在** |

`invalid` 时**完全不联网、也不查本地**——码本身不可信。

### 影像解码

相册导入的图片走 `Camera.scanFromURLAsync` 解码条码，
与实时扫码进入同一条查询链。这是没有真机时验证扫码逻辑的路径。

---

## 7. 商品识别（拍商品）

`src/services/vision/productRecognition.ts` 编排五步：

```
1. 图片质量检查（只给建议，绝不阻断）
2. 照片里的条形码（Camera.scanFromURLAsync）—— 命中就直接用条码查，不再猜文字
3. OCR
4. 商品身份提取（productIdentity.ts）
5. 联网关键词搜索（Open Food Facts search）
```

每一步都有 `RecognitionStep` 状态（running / done / skipped / failed），
失败时用户能看到**走到哪一步、为什么没结果**，而不是拍照后毫无反应。

### 商品身份提取（`productIdentity.ts`，纯函数）

提取 `brand` / `product_name` / `variant` / `flavor` / `quantity` /
`category` / `visible_text` / `barcode`，再拼搜索词。

启发式规则（**不保证都对，只用于生成候选，最终由用户确认**）：

| 字段 | 规则 |
| --- | --- |
| `quantity` | 正则匹配「净含量 / 规格 / 数字+单位」，单位归一（500ml/500ML/500毫升 → 500mL） |
| `barcode` | 从全文找校验位合法的 8/12/13/14 位数字串 |
| `flavor` | 「口味 / 风味 / 味」前面的词 |
| `category` | 关键词表匹配，**只在包装明确写了才填** |
| `brand` | 最靠上、长度 2～8、无数字无标点的行（**最容易出错的一环**） |
| `product_name` | 字号最大（boundingBox 高度最大）的行 |

---

## 8. Nutrition Parser

`src/services/vision/nutritionParser.ts`（纯函数，35 个单测）

### 处理能力

- **基准**：每100g / 每100mL / 每份 / 每包装；
  「每份（30g）」这种写法优先采用明确克数
- **单位**：千焦/千卡/克/毫克 与 kJ/kcal/g/mg，大小写与中文写法都识别
- **字符归一**：全角数字、全角冒号、**全角空格**（中文表格对齐常用）
- **整表被读成一行**时也能解析

### 包含关系的坑（都有测试守着）

| 陷阱 | 处理 |
| --- | --- |
| `添加糖` 含 `糖` | 检查别名前的文本是否以「添加」等结尾 → 排除 |
| `糖类` 含 `糖` | 「糖类」其实是碳水化合物 → 排除 |
| `饱和脂肪` / `反式脂肪酸` 含 `脂肪` | 检查前缀 → 排除 |
| NRV% 列 | 正则要求数字后必须跟单位，天然跳过百分比 |

### 不确定就不赋值

| 情况 | 处理 |
| --- | --- |
| `＜0.1g` 上限写法 | 不赋值，记入 `uncertainFields` |
| 缺单位的裸数字 | 不赋值 |
| 单位与项目不匹配 | 不赋值 |
| 包装只写千焦 | `energy_kcal` 保持 `null`，**不做换算** |

### 输出

```ts
{
  basis: { amount, unit },
  facts: NutritionFacts,           // 只含确实解析出来的值
  evidence: ParsedField[],         // 每一项的来源行，用于用户核对
  uncertainFields: string[],       // 人类可读的不确定说明
  uncertainFieldKeys: NutritionField[],  // 对应的字段名，用于界面高亮
  missingFields: NutritionField[], // 包装上没标的
  rawText: string
}
```

### 表单草稿层 `src/domain/nutritionDraft.ts`

草稿用**字符串**而非数字保存，因为用户必须能**把已填项清空**。
`''` → `null`（未记录），`'0'` → `0`（确实为零）。两者不允许互相污染。

---

## 9. Vision / 联网识别

### 统一接口 `src/services/vision/types.ts`

```ts
interface FoodVisionProvider {
  id, label, capabilities
  analyzeProduct(uri)     → ProductIdentityExtraction
  analyzeNutrition(uri)   → NutritionExtraction
  analyzeIngredients(uri) → IngredientsExtraction
  analyzeExpiry(uri)      → ExpiryExtraction
}
```

**UI 绝不直接依赖某个模型厂商**，将来替换 DeepSeek / OpenAI / 其它 Provider
时 UI 一行都不用改。

### 当前状态

**没有接入任何在线视觉模型。** 识别 100% 本地（ML Kit OCR + 规则解析）。

原因是需要 API Key。授权文案与持久化已经落地
（`src/services/vision/consent.ts` + 我的页面的开关），
接入时直接复用，**不要另起一套**。

### 默认策略

本地优先，联网作为增强 / fallback。
`canUploadImageForRecognition()` 是上传前的守卫，
拿不到授权必须走本地路径或如实报错，**绝不能悄悄上传**。

---

## 10. 联网数据源

`src/services/providers/` — 可插拔 Provider 架构。

| Provider | 状态 |
| --- | --- |
| Open Food Facts v2（按条码） | ✅ 可用，实测对国产商品有覆盖 |
| Open Food Facts v3（按条码） | ✅ 可用，v2 无结果时再试 |
| Open Food Facts 关键词搜索 | ✅ 可用，实测能搜到「农夫山泉」等 |
| Wikidata（GTIN P3962） | ⚠️ 接口可达但**商品条码覆盖几乎为零** |

### Provider 契约（重要）

**Provider 永远不抛异常。**

- 网络故障 → `{ kind: 'unavailable' }`
- 明确没收录 → `{ kind: 'no_match' }`
- HTTP 503 限流 → **必须映射成 `unavailable`**，不能变成 `no_match`
  （把限流当成"商品不存在"是严重误导）

`guardLookup()` 统一兜住异常。

### HTTP 层 `src/services/network/http.ts`

故意区分两类失败：

- 传输失败 / 超时 → 抛 `NETWORK_ERROR`（可重试）
- HTTP 4xx/5xx → **不抛**，把 `status` 交给调用方判断

理由：对商品数据库来说 404 = "这个码没收录"，与网络故障对用户的含义完全不同。

---

## 11. 关键源码文件职责速查

| 文件 | 职责 |
| --- | --- |
| `src/domain/errors.ts` | 错误分类体系 + 面向用户的安全文案 + 恢复动作 |
| `src/domain/types.ts` | 领域模型（Product / InventoryItem / NutritionLog） |
| `src/domain/nutrition.ts` | 营养换算与汇总（`null ≠ 0` 的核心） |
| `src/domain/nutritionFormat.ts` | 数值格式化，`null` → 「未记录」的唯一落点 |
| `src/domain/nutritionDraft.ts` | 表单草稿（字符串保存，可清空） |
| `src/domain/expiry.ts` | 保质期状态、到期日推算 |
| `src/domain/dates.ts` | 本地日期工具（不用 UTC，避免跨日错位） |
| `src/domain/barcode.ts` | 条码归一化 + GTIN 校验位 + UPC-E 展开 |
| `src/domain/scanTasks.ts` | 五种扫描任务的元数据（标题 + 拍摄提示） |
| `src/db/schema.ts` | 建表 SQL |
| `src/db/database.ts` | 连接与迁移 |
| `src/db/repositories/*.ts` | 三张表的仓储 + `app_meta` 键值 |
| `src/services/barcode/lookup.ts` | 查询链编排 |
| `src/services/barcode/saveProduct.ts` | 候选落库 + 商品图下载 |
| `src/services/providers/*.ts` | 联网数据源 |
| `src/services/vision/*.ts` | 质量 / OCR / 身份提取 / 营养解析 / 识别编排 / 授权 |
| `src/services/media/imageStore.ts` | 图片落盘与文件硬校验 |
| `src/services/media/remoteImage.ts` | 远程商品图下载（失败不阻塞） |
| `src/components/KangKang.tsx` | 康康吉祥物（纯 View 绘制） |
| `src/components/ScanGuide.tsx` | 五种扫描示意图（纯 View 绘制） |
| `src/components/ProductFacts.tsx` | 商品身份 / 营养列表 / 来源提示 |
| `src/components/NutritionEditor.tsx` | 营养编辑器（创建页与确认页共用） |
| `modules/hukang-vision/` | Kotlin 原生模块 |
| `tools/mac-ocr/` | 开发期 OCR 验证工具（不进 App） |

---

## 12. 测试架构

| 层 | 命令 | 说明 |
| --- | --- | --- |
| 类型 | `npx tsc --noEmit` | strict，零错误 |
| 单元（离线） | `npm test` | jest-expo，**不依赖网络** |
| 集成（真实联网） | `npm run test:integration` | 真实访问 Open Food Facts |
| 真实照片 | fixture 驱动 | 见 `tools/mac-ocr/README.md` |

集成测试用**独立配置** `jest.integration.config.js`，原因（踩过的坑）：

1. 必须 `testEnvironment: 'node'`。jest-expo 预设的 RN 环境里全局 `fetch`
   是 whatwg-fetch polyfill，底层 `XMLHttpRequest` 在 jest 下不存在——
   请求根本没发出去却"成功返回" `status=undefined`，**集成测试会变成假通过**。
2. 不能靠 `preset + setupFiles: []` 清掉 RN setup：
   jest 合并 preset 时对 `setupFiles` 这类数组是**拼接**，空数组覆盖不掉。
   必须手动展开 preset 再覆盖。

---

## 13. 构建环境注意事项

### 本机特有的 4 个坑（换普通电脑不需要）

| # | 问题 | 处理 |
| --- | --- | --- |
| 1 | 沙箱禁止写 `~/.npm` `~/.gradle` `~/.expo` `~/.android` | 全部重定向到工作区缓存目录 |
| 2 | PATH 上的 `node` 是 Electron 版（DSH shim），解析 yargs 位置参数与标准 Node 不一致，导致 RN codegen 报 `ENOENT` | 改用系统 `/usr/local/bin/node` |
| 3 | Kotlin 编译守护进程无法写 `~/Library/Application Support/kotlin/daemon/` | `kotlin.compiler.execution.strategy=in-process` |
| 4 | 改 PATH 后旧 Gradle 守护进程仍持旧环境 | 改完必须 `./gradlew --stop` |

详细命令与环境脚本内容见 `README.md` 的「环境要求」与「新电脑恢复方法」。

### 一般电脑上就是标准流程

```bash
npm ci
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
```

---

## 14. 代码约定

- **不要手改 `android/` 与 `ios/`**。它们是 CNG 生成目录，
  原生行为一律通过 `app.json` 与 config plugin 配置。
  （例外：`modules/hukang-vision/` 是手写的原生模块，改那里）
- 业务规则放 `domain/` 且保持纯函数
- 新增面向用户的文案**不允许**出现技术词汇（见 `errors.ts` 的 `USER_MESSAGES`）
- 新增错误必须加进 `ERROR_CODES` 并给出用户文案与恢复动作
- 提交前跑 `npx tsc --noEmit` && `npm test`
