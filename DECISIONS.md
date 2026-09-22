# 护康 HuKang — 关键技术决策记录

> 记录「为什么这么写」。接手时如果发现某处写法奇怪，先来这里找原因，
> 不要因为"看起来可以更简单"就改掉——很多决定是为了满足产品硬性规则。

格式：**决策 / 背景 / 备选 / 结论 / 后果**

---

## D001 · 用 Expo Router 做导航

**背景**：产品要求"使用正式 Navigation 架构，不要自制脆弱的状态切页面"。

**备选**：
1. React Navigation 手写（native-stack + bottom-tabs）
2. Expo Router 文件式路由

**结论**：Expo Router。

**理由**：项目自带的 `AGENTS.md` 明确要求 Expo Router，路由放 `src/app/`；
它本身就是 React Navigation 的封装，同样满足"正式导航"要求，且文件即页面、
心智负担更低。

**后果**：新增页面 = 在 `src/app/` 下加文件；不要写手工的路由表。

---

## D002 · 自写 Kotlin 原生模块，而不是用第三方 ML Kit 封装

**背景**：需要 Google ML Kit 中文文字识别（要求 bundled 模型、可离线）。

**备选**：
1. `@react-native-ml-kit/text-recognition` 等第三方包
2. `expo-mlkit-ocr` 等社区 Expo 模块
3. 自己写本地 Expo Module 包 ML Kit

**结论**：自己写（`modules/hukang-vision/`）。

**理由**：
- 第三方 RN 模块对 Expo SDK 57 / RN 0.86 的兼容性不可控，风险高
- 我们需要的接口很小（两个方法），自己写反而更快更可控
- 产品明确允许 Kotlin Native Module

**后果**：需要维护 Kotlin 代码；但换来接口完全自主。
已实测验证：`:hukang-vision:compileDebugKotlin` 成功，
`ExpoModulesPackageList.kt` 正确注册了模块。

---

## D003 · 原生侧只产出 OCR Raw Text + 位置，不做语义解析

**背景**：营养成分表需要从 OCR 结果里解析出"能量 180kJ"这样的结构化数据。
这部分逻辑放原生（Kotlin）还是 TypeScript？

**结论**：**全部放 TypeScript**。原生只返回文字与 `boundingBox`。

**理由**：
- 解析规则一定会反复调整（各种包装写法千奇百怪），
  放 TS 侧改完直接生效，放 Kotlin 侧每次都要重新编译原生代码
- 放 TS 侧可以用 **jest 单元测试**覆盖（现有 35 个解析器用例），
  Kotlin 侧测试成本高得多
- 符合产品要求的分层：`Image → OCR → Raw Text → Parser → Structured Data`

**后果**：原生接口必须带位置信息（`boundingBox` 到 line/element 两级），
否则 TS 侧无法还原表格行列关系。

---

## D004 · 图片质量只返回客观指标，阈值放 TS

**背景**：产品要求区分"严重模糊 / 过暗 / 反光"，而不是笼统说"识别失败"。

**结论**：原生返回 `brightness` / `blurScore` / `glareRatio` / `darkRatio`
四个数值；**判定阈值与用户建议放 `src/services/vision/imageQuality.ts`**。

**理由**：同 D003——阈值一定要调，放 TS 侧调参不用重编译，而且可以单测。

**后果**：当前阈值是**工程经验值，尚未用真实样本标定**（见 `BUGS.md` R002）。
真机测试后应该优先回来调这几个数。

---

## D005 · 图片质量问题只提示，不阻断识别

**背景**：检测到照片糊了 / 暗了，要不要直接拒绝识别？

**结论**：**不阻断**，照常走识别流程，同时把建议显示出来。

**理由**：拍糊了也可能读得出；直接拒绝会让用户更困惑，
而且会掩盖"其实能识别"的情况。用户看到建议后可以自己决定是否重拍。

**后果**：可能出现"提示说糊了但结果其实是对的"，这是可接受的。

---

## D006 · 解析层不做 kJ ↔ kcal 换算

**背景**：国产标签绝大多数只写千焦（kJ），但首页能量环需要 kcal。

**备选**：
1. 解析时按 `1 kcal = 4.184 kJ` 换算并填充 `energy_kcal`
2. 只存包装上确实写了的值，换算留给展示层

**结论**：**选 2**。包装只写千焦时 `energy_kcal` 保持 `null`。

**理由**：
- 产品硬性要求"包装没有的值：null，绝对不能猜"，
  数据库里应该只存"包装上确实写了的值"
- 换算会引入包装自身取整带来的偏差，且用户核对时会对不上

**后果**：**Phase 7 做首页能量环时必须额外处理**——
当 `energy_kcal` 为 null 而 `energy_kj` 有值时，需要在展示层换算
并**显式标注"由千焦换算"**。这是已知待办，不要忘记。

---

## D007 · 品类猜测偏保守，宁可留空

**背景**：包装上写"乌龙茶"时，无法区分它是茶饮料还是茶叶。

**结论**：`guessCategory()` 只在包装**明确写了**「茶饮料」「酸奶」等词时才填品类；
只有「乌龙茶」时返回 `null`。

**理由**：产品优先级是"数据正确 > 操作简单"。填错品类比留空更糟。
有专门的测试用例钉住这个行为（`productIdentity.test.ts`）。

**后果**：部分商品的品类会为空，这是预期行为，不要"优化"成猜。

---

## D008 · `null` 与 `0` 在每一层都强制区分

**背景**：营养数据里"包装没标"和"含量为零"是完全不同的意思。

**结论**：在**数据层、表单层、界面层**三处都强制区分，且各有测试：

| 层 | 做法 |
| --- | --- |
| 数据层 | `NutritionFacts` 全字段 `number \| null`；汇总保留 `unknownCount` |
| 表单层 | 草稿用**字符串**保存，`''` → `null`，`'0'` → `0` |
| 界面层 | `formatNutrientValue()` 是 `null` → 「未记录」的唯一落点 |

**理由**：这条规则极易在 UI 层被无意破坏（例如用 `value ?? 0`、用 `Number('')`）。
分层设防 + 测试才能守住。

**后果**：写任何涉及营养值的代码前，先想清楚 `null` 该怎么传播。

---

## D009 · 条形码校验位错误 → 让用户重扫，而不是"查不到"

**背景**：扫描器可能给出读错的码（校验位不合法）。

**结论**：`normalizeBarcode()` 返回 `valid: false`，
`lookupBarcode()` 直接返回 `{ kind: 'invalid' }`，
**完全不查本地、不联网**。

**理由**：码本身不可信。如果拿它去查然后报"没找到"，
用户会以为商品不存在，而实际上是"没扫清楚"——两者对用户的含义完全不同。

**后果**：多了 `invalid` 这个状态，UI 要给出"重新扫"而不是"没找到"的界面。

---

## D010 · 数据源 503 限流必须映射成 `unavailable`，不能变成 `no_match`

**背景**：Open Food Facts 在连续请求时会返回 HTTP 503（实测到了）。

**结论**：`unavailable` 与 `no_match` 严格分开，
并**单独写了一个断言** `expect(outcome.kind).not.toBe('no_match')`。

**理由**：把限流当成"商品不存在"会直接误导用户。
这是整个 Provider 契约里最容易写错、后果最严重的一条。

**后果**：Provider 契约规定**永不抛异常**，异常由 `guardLookup()` 统一翻译成
`unavailable`。（早期版本让异常穿透了，导致上层把它当成"没查到"，已修复。）

---

## D011 · HTTP 404 不当成网络错误

**背景**：查商品时接口返回 404。

**结论**：`fetchJson()` 只在**传输失败/超时**时抛 `NETWORK_ERROR`；
HTTP 4xx/5xx 不抛，把 `status` 交给调用方判断。

**理由**：对商品数据库来说 404 = "这个码没收录"，是正常业务结果，
不是故障。混在一起会让用户看到"网络不好"而不是"没这个商品"。

---

## D012 · 网络是增强，本地优先；Provider 可插拔

**背景**：产品要求"不要只依赖 Open Food Facts"（中国商品覆盖不足）。

**结论**：定义 `BarcodeProvider` / `KeywordSearchProvider` 接口，
默认链为 `Open Food Facts v2 → v3 → Wikidata`。

**实测结果**：
- Open Food Facts：可用，且**对国产商品有覆盖**（实测搜到农夫山泉、东方树叶等）
- Wikidata：接口可达，但**GTIN 覆盖几乎为零**（查可口可乐命中 0 条）
- UPCitemdb：连不上（HTTP 000）
- barcodespider：需要密钥（HTTP 403）

**后果**：**实际上第二个源几乎不出结果**。加商业数据源只需实现接口，
不需要改编排层与 UI。

---

## D013 · 集成测试用独立 jest 配置

**背景**：需要一个真实联网的测试层，但默认单测必须离线可跑。

**结论**：`jest.integration.config.js` + `npm run test:integration`；
默认配置用 `testPathIgnorePatterns` 排除 `.integration.test.ts`。

**两个必须知道的坑**（都踩过）：

1. **必须 `testEnvironment: 'node'`**。
   jest-expo 预设的 RN 环境里全局 `fetch` 是 whatwg-fetch polyfill，
   底层 `XMLHttpRequest` 在 jest 下不存在——请求根本没发出去，
   却"成功返回"一个 `status=undefined` 的假响应。
   **集成测试会变成假通过**，比没有测试更危险。
2. **不能靠 `preset + setupFiles: []` 清掉 RN setup**。
   jest 合并 preset 时对 `setupFiles` 这类数组字段是**拼接**，空数组覆盖不掉。
   必须手动展开 preset 再覆盖。

---

## D014 · 营养编辑器做成共享组件

**背景**：`product/create`（手动创建）和 `scan/nutrition-result`（OCR 确认）
都需要同一套营养输入表单。

**结论**：抽出 `src/components/NutritionEditor.tsx`，两处共用。

**理由**：避免两边规则不一致——最怕一边允许留空、另一边偷偷把空填成 0。

**后果**：改营养表单只需改一处。

---

## D015 · 决定"不做什么"

以下都是**有意不做**，不是遗漏：

| 不做 | 原因 |
| --- | --- |
| 健康评分 / 健康指数 | 产品明确禁止：没有可靠依据的数据 |
| 用碳水推导添加糖 | 三个糖类字段语义完全不同 |
| 用 salt 反推钠 | 宁可留空也不推断（虽然 2.5 倍换算是确定的） |
| 用常识补缺失营养 | 产品明确禁止模型根据常识补数据 |
| 每个页面都放康康 | 产品要求"不要每个页面都出现" |
| 大量卡片 / 复杂渐变 / 每个元素都 Glass | 产品 UI 要求极简、大量留白 |
| 点击对焦 | expo-camera SDK 57 未暴露该 API，需自写原生模块 |
| 在线视觉模型 | 需要 API Key，接口与授权已就位但未接厂商 |

---

## D016 · 交接版本包含 `android/` 目录

**背景**：`android/` 与 `ios/` 是 CNG（Continuous Native Generation）生成目录，
通常加入 `.gitignore`，靠 `npx expo prebuild` 重新生成。

**结论**：交接版（`护康/`）**保留 `android/` 源码**，但排除所有构建产物。

**理由**：
- 让接手方**不需要先跑 prebuild** 就能直接 `./gradlew assembleRelease`
- `android/` 里有真实配置（config plugin 的产物、gradle 配置），
  排查问题时能看到实际生效的内容

**后果**：
- 如果后续改了 `app.json` 或 config plugin，**必须重新跑 prebuild**，
  否则 `android/` 会与配置不一致
- `android/build/`、`android/app/build/`、`android/.gradle/`、
  `android/.kotlin/`、`android/app/.cxx/` 都已排除

---

## D017 · `tools/mac-ocr` 作为开发期验证工具保留

**背景**：没有 Android 设备时，怎么验证营养解析器能处理**真实包装照片**？

**结论**：写一个 macOS Vision OCR 命令行工具 + fixture 采集脚本，
放在 `tools/`（**不进 App、不进 APK**）。

**理由**：
- macOS 自带 Vision 框架，`swift` 随 Command Line Tools 提供，**不需要安装任何依赖**
- 能产出真实 OCR 文本喂给解析器，比手写示例文本有价值得多

**诚实边界（必须保留在文档与代码注释里）**：
**macOS Vision ≠ Android ML Kit**。它验证的是"解析器对真实 OCR 文本的处理能力"，
**不能替代** Android 端 ML Kit 的真机验证。

**当前状态**：fixture 采集失败——Open Food Facts 的图片主机
`images.openfoodfacts.org` 在本机连接超时（DNS 可解析，TCP 超时）。
所以 `realLabels.test.ts` 的 2 个用例处于**跳过**状态。

---

## D018 · 交付用 release APK 而不是 debug APK

**背景**：需要给用户一个能直接装到手机上的包。

**结论**：用 `assembleRelease`，签名沿用 RN 模板自带的 debug keystore。

**理由**：
- **debug APK 不含 JS bundle**，必须配合 `npx expo start` 才能跑，装在手机上就是白屏
- release 构建内嵌 `assets/index.android.bundle`，装完即可独立运行
- 模板默认给 release 配了 debug keystore，不需要额外生成签名文件就能产出可安装包

**后果**：
- 该 APK **能正常安装**，但只适合内部测试，不能上架
- **包名不变时换正式签名必须先卸载旧版**（签名不同无法覆盖安装）

---

## D019 · APK 不纳入 git

**背景**：需要把 APK 交付出去，但项目初始约定 §56 明确禁止提交 `*.apk`。

**结论**：APK 放在 `releases/android/current/`，由 `.gitignore` 忽略；
同目录放 `README.md` 说明如何重新生成。

**理由**：170MB+ 的二进制放进 git 会让仓库迅速膨胀，且 APK 是可再生产物。

**后果**：接手方需要自己构建 APK（命令见 README）。
如果确实需要纳入版本管理，改 `.gitignore` 即可。

---

## D020 · 严格遵守 Expo 的真实 API，不凭记忆写

**背景**：Expo 每个 SDK 版本都会改 API，凭记忆写会踩坑。

**结论**：开发前先查版本化文档，并把核实结果沉淀到
`docs/expo-sdk-57-api-reference.md`。

**已确认的三个真实变化**：

| # | 变化 | 影响 |
| --- | --- | --- |
| 1 | `expo-file-system` 的旧根函数（`copyAsync` 等）在 v57 **运行时会抛错** | 必须用新的 `File` / `Directory` / `Paths` 类 |
| 2 | `expo-image-manipulator` 的 `manipulateAsync` 已废弃 | 改用 `ImageManipulator.manipulate()` 对象式 API |
| 3 | expo-crypto 的 `randomUUID()` 是**同步**的 | 不要 `await` 它 |

**后果**：接手后如果要用新的 Expo API，**先查 `docs/` 或版本化文档**，
不要相信记忆。
