# 更新日志

本项目遵循「按阶段交付」的节奏。每个阶段完成即本地 Android 构建通过。

---

## [1.0.0] — Phase 1～4 交接版本

**状态**：功能实现完成，等待真机验收。
**Git Tag**：`v1.0.0-handoff`

### 新增

#### Phase 1 · 项目骨架 / Navigation / SQLite / Camera / 图片导入

- Expo SDK 57 + React Native 0.86 + TypeScript strict 工程搭建
- Expo Router 文件式路由：底部导航（今日 / 库存 / 我的）+ 完整 Stack
- SQLite 三张表（`products` / `inventory_items` / `nutrition_logs`）
  + `app_meta` 键值表，含 `PRAGMA user_version` 迁移框架
- 三个仓储层 + 商品 / 库存 / 摄入记录领域模型
- 相机采集：权限处理（含拒绝后引导到系统设置）、闪光灯、相册导入
- 图片文件硬校验：`FILE_EXISTS` → `FILE_SIZE > 0` → 落盘到 App 文档目录
- 五种扫描任务入口，每个入口带极简示意图 + 一句拍摄提示
- 康康吉祥物（纯 View 绘制，无图标库 / SVG 依赖）
- 开发者选项：版本号连点 7 次开启，可查看 SQLite 表与错误码清单

#### Phase 2 · 条形码 / 本地商品库 / 联网 Barcode Lookup

- 条形码归一化：EAN-13 / EAN-8 / UPC-A / UPC-E（+ GTIN-14）
  - GTIN 标准校验位实算；UPC-E 先展开成 UPC-A 再验证与查询
  - UPC-A 同时给出原始形式与补零 EAN-13 形式
- 查询链编排：`normalizeBarcode → SQLite 本地优先 → 未命中自动联网`
- 五种结果状态严格分开：`local` / `online` / `invalid` / `not_found` / `unavailable`
- 可插拔数据源：Open Food Facts v2 / v3 / 关键词搜索 + Wikidata(GTIN)
- Provider 契约：永不抛异常；503 限流必须映射成 `unavailable`
- 联网商品需用户点「就是这个」才落库；商品图下载到本地供断网查看
- 商品详情页 / 手动创建商品页（留空 = 未记录）

#### Phase 3 · 拍商品 / 本地 OCR / 图片质量 / 商品身份提取 / 商品搜索

- **自写 Kotlin 原生模块 `modules/hukang-vision`**
  - ML Kit 中文文字识别（bundled 模型，可离线）
  - 返回 `text` + 每级 `boundingBox`（营养成分表这类二维表格必需）
  - `analyzeQuality` 返回亮度 / 拉普拉斯方差 / 反光比 / 过暗比
  - EXIF 方向纠正；超大图按需降采样
- 图片质量判定：阈值与用户建议放在 TS 纯函数里，可调可测
- 商品身份提取（纯函数）：brand / product_name / variant / flavor /
  quantity / category / barcode，并拼搜索关键词
  - 规格单位归一：`500ml` / `500ML` / `500毫升` → `500mL`
  - 从照片文字里找校验位合法的条码，命中即优先用条码查
  - 品类只在包装明确写了才填，不硬猜
- 识别编排五步：质量检查 → 图片内条码 → OCR → 身份提取 → 联网搜索
  - 每步都有状态，失败时用户能看到走到哪一步
- 找不到时保留已识别信息，给出三条出路：
  继续拍营养成分表 / 继续拍配料表 / 手动创建商品
- 联网增强识别授权文案与持久化（默认关闭，设置页可切换）

#### Phase 4 · 营养成分表 OCR / Nutrition Parser / 用户确认

- 营养解析器（纯函数）：
  - 基准：每100g / 每100mL / 每份 / 每包装；「每份（30g）」优先取明确克数
  - 单位：千焦/千卡/克/毫克 与 kJ/kcal/g/mg，大小写与中文写法都识别
  - 全角数字、全角冒号、全角空格归一
  - 整表被 OCR 读成一行时也能解析
- 包含关系的坑全部处理：`添加糖`≠`糖`≠`糖类`；`饱和脂肪`/`反式脂肪酸`≠`脂肪`
- 不确定就不赋值：上限写法（`＜0.1g`）、缺单位、单位不匹配
- 包装只写千焦时 `energy_kcal` 保持 `null`（不做换算）
- 用户确认页：解析结果全部可编辑，高亮需确认项，显示每项来源行
- 表单草稿层（纯函数）：草稿用字符串保存，清空 = `null`，填 `0` = `0`
- 抽出共享 `NutritionEditor`，创建页与确认页共用

### 测试

- 单元测试 **141 通过 / 2 跳过**（离线）
- 集成测试 **14 通过**（真实联网 Open Food Facts）
- TypeScript strict 零错误
- Android debug + release 双构建通过

### 构建产物

| 产物 | 大小 |
| --- | --- |
| `releases/android/current/HuKang-1.0.0.apk` | 180,786,227 字节（约 172 MB） |

### 已知问题

见 `BUGS.md`。当前**没有已确认的功能性缺陷**——
因为所有设备端行为都还没在真机上跑过。真机测试后本节会更新。

### 未验证

所有依赖真实 Android 手机的相机、条码、OCR、拍商品识别功能，
统一标记为 `NOT TESTED ON PHYSICAL DEVICE`，详见 `TEST_REPORT.md`。

---

## 未发布 · 计划中

### Phase 5 · 配料表
- 配料表 OCR + Ingredients Parser
- 保存 `ingredients_raw_text` 与 `ingredients_list`
- 添加糖来源只提示，**不据此计算添加糖克数**

### Phase 6 · 日期 / 库存 / 通知
- 日期识别（多种格式 + EXP / Best Before 标记）
- 库存管理：已过期 / 今天到期 / 3天内 / 7天内 / 正常
- 临期本地通知（7天 / 3天 / 1天 / 当天，可关闭）

### Phase 7 · 营养记录 / 历史 / 如果吃下它
- NutritionLog 时间线，支持改份量 / 改时间 / 删除
- 首页营养可视化（能量环形 + 其余横向进度条）
- 历史日期查询（真实 SQLite 数据）
- 「如果吃下它」：当前 + 预计变化，新增部分半透明

### Phase 8 · 视觉统一
- 启动页、康康在各场景的运用、玻璃效果收敛、细节打磨
