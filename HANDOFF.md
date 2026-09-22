# 护康 HuKang — 交接说明

> **给接手的 AI / 开发者**：假设你拿到的只有这个 `护康/` 文件夹，
> 之前的所有对话记录都已删除。这份文档告诉你现在在哪、下一步做什么。

当前状态：**Phase 1～4 功能实现完成，已构建可安装 APK，等待真机验收。**

---

## 1. 当前做到哪里

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| Phase 1 | 项目骨架 · Navigation · SQLite · Camera · 图片导入 | ✅ 已完成 |
| Phase 2 | 条形码 · 本地商品库 · 联网 Barcode Lookup | ✅ 已完成 |
| Phase 3 | 拍商品 · 本地 OCR · 图片质量 · 商品身份提取 · 商品搜索 · 候选商品 | ✅ 已完成 |
| Phase 4 | 营养成分表 OCR · Nutrition Parser · 用户确认 | ✅ 已完成 |
| Phase 5 | 配料表 OCR + Ingredients Parser | ⬜ 未开始 |
| Phase 6 | 日期识别 · 库存 · 临期通知 | ⬜ 未开始 |
| Phase 7 | NutritionLog · 首页营养可视化 · 历史 ·「如果吃下它」 | ⬜ 未开始 |
| Phase 8 | 启动页 · 康康 · 视觉统一 | ⬜ 未开始 |

**本轮只做 Phase 1～4，已按用户要求停止开发，等待真机反馈。**

---

## 2. 已完成什么（可运行的代码）

### 能跑通的完整链路

```
条形码：Camera → Barcode → normalizeBarcode() → SQLite
                                      ↓ 未命中
                              Open Food Facts → 候选 → 用户确认 → 落库

拍商品：Photo → 质量检查 → 图片内条码 → OCR → 身份提取 → 联网搜索 → 候选

营养表：Photo → 质量检查 → OCR → Nutrition Parser → 用户可编辑确认 → 保存
```

### 具体交付

- **导航**：Expo Router，底部三 tab（今日 / 库存 / 我的）+ 完整 Stack
- **SQLite**：三概念分离（products / inventory_items / nutrition_logs）+ app_meta，
  含 `PRAGMA user_version` 迁移框架
- **相机**：权限处理（含拒绝后跳系统设置）、闪光灯、相册导入、图片文件硬校验
- **原生模块** `modules/hukang-vision`：ML Kit 中文 OCR（bundled、可离线）
  + 图片质量度量（亮度 / 拉普拉斯方差 / 反光比 / 过暗比）
- **条形码**：EAN-13 / EAN-8 / UPC-A / UPC-E，GTIN 校验位实算，UPC-E 展开
- **联网数据源**：Open Food Facts v2 / v3 / 关键词搜索 + Wikidata，可插拔架构
- **商品身份提取**：brand / product_name / flavor / quantity / category / barcode
- **营养解析器**：基准、单位、全角字符、包含关系陷阱、上限写法全部处理
- **用户确认页**：解析结果可编辑，高亮需确认项，显示每项来源行
- **开发者选项**：版本号连点 7 次开启，可看 SQLite 表与错误码

### 测试

- 单元测试 **141 通过 / 2 跳过**（离线）
- 集成测试 **14 通过**（真实联网 Open Food Facts）
- TypeScript strict 零错误
- Android debug + release 双构建通过

---

## 3. 未完成什么

### 未实现的 Phase 5～8

见 `PROJECT_SPEC.md` 第 7 节「已确定但尚未完成的需求」——**需求已经写明，不要重新发明**。

### 明确未接入的能力

| 项 | 说明 |
| --- | --- |
| 在线视觉模型 | `FoodVisionProvider` 接口 + 联网授权文案/开关都已落地，**但没接任何厂商**（需要 API Key）。当前识别 100% 本地。 |
| 点击对焦 | expo-camera SDK 57 未暴露该 API，需要自写 CameraX 原生模块 |
| iOS | 原生模块只在 Android 实现 |
| ABI 拆分 | APK 172MB，可降到 60～70MB |

---

## 4. 哪些没有真机测试（最重要的一节）

**下面这些东西一项都没有在真实 Android 手机上验证过。**

代码写完、类型通过、构建成功，**都不等于功能可用**。
完整清单见 `TEST_REPORT.md`，核心是：

| 类别 | 状态 |
| --- | --- |
| 真实摄像头预览与拍照 | `NOT TESTED ON PHYSICAL DEVICE` |
| 近距离自动对焦（食品标签小字） | `NOT TESTED ON PHYSICAL DEVICE` |
| 包装反光 / 过暗 / 过曝 | `NOT TESTED ON PHYSICAL DEVICE` |
| ML Kit 中文 OCR 对真实包装的效果 | `NOT TESTED ON PHYSICAL DEVICE` |
| 实拍营养成分表的识别准确率 | `NOT TESTED ON PHYSICAL DEVICE` |
| 实际扫码速度与成功率 | `NOT TESTED ON PHYSICAL DEVICE` |
| 图片质量阈值是否合理（**未标定**） | `NOT TESTED ON PHYSICAL DEVICE` |
| 拍商品五步链路的设备端表现 | `NOT TESTED ON PHYSICAL DEVICE` |
| 不同品牌手机的 Camera 行为差异 | `NOT TESTED ON PHYSICAL DEVICE` |
| SQLite 增删改查实际执行 | `NOT TESTED` |
| 导航跳转 / 返回栈 / Android 返回键 | `NOT TESTED` |
| 商品落库与商品图下载 | `NOT TESTED` |
| 页面渲染、中文显示、康康造型 | `NOT TESTED` |
| 安装 / 启动 / 是否闪退 | `NOT TESTED` |

此外，**真实包装照片 fixture 采集失败**（图片主机不可达），
所以营养解析器**只在人工构造的标签文本上验证过**，
`realLabels.test.ts` 的 2 个用例处于跳过状态。

---

## 5. 当前最重要的问题

按优先级排序。详细记录（含复现步骤与期望结果）见 `BUGS.md`。

| # | 问题 | 为什么重要 |
| --- | --- | --- |
| 1 | **HK-001 品牌名启发式提取可能严重出错** | 品牌错了 → 搜索关键词错 → 候选商品全错。「净含量」这类文字很可能被误认成品牌 |
| 2 | **HK-002 OCR 丢失营养表行列对齐** | 解析器没有真正用 `boundingBox` 做行列匹配。**数值错位会被用户当真存进库**，是最严重的数据正确性风险 |
| 3 | **HK-005 ML Kit 对真实包装的效果完全未知** | 整个识别链的地基，没测过 |
| 4 | **HK-004 图片质量阈值未标定** | 当前是工程经验值，很可能误报/漏报 |
| 5 | **HK-003 拍照后可能卡顿** | 大图降采样 + OCR 耗时未测 |
| 6 | **HK-009 Open Food Facts 会限流** | 已正确降级，但没有节流/退避 |

**没有任何"已确认的功能性缺陷"**——因为设备端一次都没跑过。
真机测试后，上面这些可能升级为确切的缺陷。

---

## 6. 下一位 AI 应该从哪里开始

### 第 0 步：先读这几份文档（按顺序）

1. `PROJECT_SPEC.md` —— **产品要求是权威来源**，尤其第 6 节「数据规则」是硬性的
2. `ARCHITECTURE.md` —— 代码在哪、为什么这么写
3. `DECISIONS.md` —— 20 条关键决策，**避免把刻意设计当成 Bug 改掉**
4. `BUGS.md` —— 未验证风险与已知限制
5. `TEST_REPORT.md` —— 什么测过、什么没测过

### 第 1 步：确认能跑起来

```bash
cd 护康
npm ci                          # 依据 package-lock.json 安装
npx tsc --noEmit                # 应零错误
npm test                        # 应 141 通过 / 2 跳过
```

如果构建 Android：

```bash
cd android && ./gradlew assembleRelease
```

> 本机（yangbing 的 Mac）有沙箱限制，构建前需要 `source ../.dsh-cache/env.sh`。
> 换到普通电脑上不需要。见 `README.md` 的「环境要求」。

### 第 2 步：等真机反馈，或按下面优先级推进

**如果用户给了真机反馈** → 优先修 `BUGS.md` 里被证实的问题，
尤其是 HK-001（品牌提取）与 HK-002（营养表行列对齐）。

**如果用户说继续开发** → 按 Phase 顺序推进，下一个是 **Phase 5 配料表**：

1. 在 `src/services/vision/` 新增 `ingredientsParser.ts`（纯函数 + 单测）
   - 输入 OCR 文本，输出 `rawText` + `items[]` + `addedSugarHints[]`
   - 切分规则：按「配料」「：」定位，按 `、，,` 切分，去掉括号内的复合配料说明
   - **添加糖来源只提示，绝不据此计算 `added_sugar_g`**（产品硬性要求）
2. 新增 `src/app/scan/ingredients-result.tsx`，复用 `scan/nutrition-result.tsx` 的结构
   （质量检查 → OCR → 解析 → 用户可编辑确认 → 保存）
3. 采集页已有 `task === 'ingredients_label'` 分支，接上路由即可
4. 数据库字段 `products.ingredients_raw_text` 与 `ingredients_json` **已经存在**，不需要改表

### 绝对不能做的事

- ❌ 把刻意设计当成 Bug 改掉（先看 `DECISIONS.md`）
- ❌ 用常识补缺失的营养数据
- ❌ 用碳水推导添加糖、用总糖顶替添加糖
- ❌ 把 `null`（未记录）当成 `0`
- ❌ 把 503 限流当成"商品不存在"
- ❌ 手改 `android/` 或 `ios/`（改 `app.json` 与 config plugin，然后重新 prebuild）
- ❌ 凭记忆写 Expo API（先查 `docs/expo-sdk-57-api-reference.md` 或版本化文档）
- ❌ 把"代码写完"当成"功能完成"

---

## 7. 交付物位置

| 项 | 路径 |
| --- | --- |
| APK | `releases/android/current/HuKang-1.0.0.apk` |
| 源码 | `src/` |
| 原生模块 | `modules/hukang-vision/` |
| Android 工程 | `android/` |
| 开发期验证工具 | `tools/mac-ocr/` |
| 已核实的 API 记录 | `docs/expo-sdk-57-api-reference.md` |

APK 的包名 / 版本 / 签名 / SHA-256 见 `FINAL_DELIVERY.md`。

---

## 8. 版本历史

| commit | 阶段 |
| --- | --- |
| `cb055a2` | Phase 1：项目骨架 / Navigation / SQLite / Camera / 图片导入 |
| `ac9bfe1` | Phase 2：条形码 / 本地商品库 / 联网 Barcode Lookup |
| `77a6df8` | Phase 3：拍商品 / 本地 OCR / 图片质量 / 商品身份提取 / 商品搜索 / 候选商品 |
| `e8a4361` | Phase 4：营养成分表 OCR / Nutrition Parser / 用户确认 |
| `b16e0f9` | Phase 1～4 交付：可安装 APK + 测试报告 + 交接与问题清单 |
| （交接版新增） | `chore: prepare HuKang project handoff` |

Tag：`v1.0.0-handoff`
