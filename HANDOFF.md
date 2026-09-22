# HuKang / 护康 — 交接说明

项目：**HuKang-DeepSeek**（独立于 Codex 版 HuKang 的全新实现，两者完全隔离）
当前阶段：**Phase 1～4 已完成并构建，等待真机验收**

---

## 1. 本轮交付物

| 项 | 值 |
| --- | --- |
| **APK 绝对路径** | `/Users/yangbing/Ai/deepseek/软件开发/HuKang-DeepSeek/apk/HuKang-DeepSeek-Phase4.apk` |
| 包名 | `com.hukang.deepseek` |
| 版本 | versionName `1.0.0` / versionCode `1` |
| 大小 | 180,786,227 字节（约 172 MB） |
| SHA-256 | `9d14a72dde06f078dad48d6971afeb60c0e2c353c48d16b74007bd2da714e4a5` |
| 签名 | APK Signature Scheme v2 有效（证书 `CN=Android Debug`） |

> 这个 APK 是 **release 构建**，**已内嵌 JS bundle**，不需要连电脑、不需要 Metro，
> 拷到手机上点开就能装、装上就能跑。
>
> 用的签名是 React Native 模板自带的 debug keystore。它能正常安装，
> 只适合内部测试。**包名不变的情况下，后续换正式签名必须先卸载旧版再装。**

---

## 2. 安装步骤

1. 把 `HuKang-DeepSeek-Phase4.apk` 传到手机（数据线 / 网盘 / 微信文件传输均可）
2. 手机上点开该文件
3. 系统会提示"未知来源应用" → 允许该来源安装（不同品牌路径不同，
   一般在「设置 → 安全 → 安装未知应用」）
4. 安装完成后桌面会出现 **护康**

首次进入「扫一扫」时系统会申请**相机权限**，需要允许，否则拍不了照。

APK 体积偏大的原因：包含 4 个 CPU 架构的原生库 + ML Kit 中文 OCR 模型（约 40MB）。
真机通常只需要 arm64-v8a，将来做 ABI 拆分可以显著减小。

---

## 3. 请重点验证的功能（按优先级）

按产品优先级「真实可用 > 识别可靠 > 数据正确 > 操作简单 > UI > 功能数量」排序：

### 3.1 最优先：识别链是否真的能用

| # | 操作 | 期望 |
| --- | --- | --- |
| 1 | 扫一扫 → **商品条形码** → 对准真实商品条码 | 自动识别并跳到查询页；本地没有则自动联网；查到候选后点「就是这个」能存进商品库 |
| 2 | 再扫**同一个**条码 | 应直接命中本地，**不再联网**（可开飞行模式验证） |
| 3 | 扫一扫 → **拍商品** → 拍完整包装正面 | 能看到五步进度（检查照片/找条码/读文字/理解商品/联网搜索），最后给出候选商品 |
| 4 | 扫一扫 → **营养成分表** → 拍完整营养表 | 能读出各项数值，界面上可以逐项修改，确认后保存 |
| 5 | 「我的」→ 本机数据 | 商品/库存/记录数量随上面的操作增长 |

### 3.2 重点观察：识别质量

- 营养成分表能不能读出**中文项目名**（能量/蛋白质/脂肪/碳水化合物/钠）
- **添加糖、总糖**这两项：包装没标的，界面上必须显示「未记录」，
  **绝不能显示 0**
- **钠**的单位是不是 mg（标签上常写 mg，我们存 mg）
- 基准是否正确识别为「每 100g」还是「每 100mL」

### 3.3 相机稳定性（P0）

- 近距离拍小字能不能对上焦
- 包装反光时有没有提示（「包装反光较强，换个角度试试。」）
- 光线暗时有没有提示（「光线有点暗。」）
- 拍完是**正常出结果**，还是**明确报错**——最怕的是拍完什么反应都没有

### 3.4 基础可用性

- 底部三个 tab 能正常切换；从子页面按返回键能回上一页；根页面再按返回才退出
- 权限被拒绝后，能不能重新授权 / 跳到系统设置

**发现问题时请尽量记下**：哪一步、屏幕上的原话、手机型号与 Android 版本。
如果能截图更好。

---

## 4. 项目结构

```
HuKang-DeepSeek/
  apk/                        交付的 APK（未纳入 git，见第 8 节）
  src/
    app/                      Expo Router 路由
      (tabs)/                 今日 / 库存 / 我的
      scan/                   扫一扫：index · capture · result · barcode-result
                              · product-result · nutrition-result
      product/                商品详情 · 手动创建
      dev.tsx                 开发者选项（版本号连点 7 次开启）
    components/               康康吉祥物、五种扫描示意图、商品信息、营养编辑器
    db/                       SQLite：schema · database · repositories
    domain/                   纯函数：条码 · 营养 · 保质期 · 日期 · 错误分类 · 表单草稿
    services/
      barcode/                查询链编排、候选落库
      providers/              联网数据源（Open Food Facts / Wikidata，可插拔）
      network/                HTTP 基础层
      vision/                 图片质量 · OCR 包装 · 商品身份提取 · 营养解析 · 识别编排 · 联网授权
      media/                  图片落盘与文件校验
    theme/                    颜色 · 间距 · 字号
  modules/
    hukang-vision/            本地 Kotlin 原生模块（ML Kit 中文 OCR + 图片质量度量）
  tools/mac-ocr/              开发期验证工具（macOS Vision OCR，不进 App）
  docs/                       Expo SDK 57 API 核实记录
  TEST_REPORT.md              测试报告（含 NOT TESTED ON PHYSICAL DEVICE 清单）
  BUGS.md                     已知问题与限制
```

### 三个核心概念严格分离

| 概念 | 表 | 含义 |
| --- | --- | --- |
| Product | `products` | 这是什么商品 |
| InventoryItem | `inventory_items` | 我家里有什么 |
| NutritionLog | `nutrition_logs` | 我吃了什么 |

`nutrition_logs.nutrition_snapshot` 保存**摄入当时的营养快照**：
用户以后修改商品营养数据，不会改写已经发生的历史记录。

---

## 5. 构建环境（重要：4 个必须知道的坑）

工作区之外的缓存目录被沙箱拒绝写入，且 PATH 上的 `node` 不是标准 Node。
因此**所有构建命令都必须先 source 环境脚本**：

```bash
cd /Users/yangbing/Ai/deepseek/软件开发/HuKang-DeepSeek
source ../.dsh-cache/env.sh
```

脚本做了 4 件事，每一件都对应一个真实踩过的坑：

| # | 问题 | 处理 |
| --- | --- | --- |
| 1 | 沙箱禁止写 `~/.npm` `~/.gradle` `~/.expo` `~/.android` | 全部重定向到工作区 `.dsh-cache/`（含 Expo 官方提供的 `__UNSAFE_EXPO_HOME_DIRECTORY` 开关） |
| 2 | PATH 上的 `node` 是 DSH 桌面端的 shim，以 `ELECTRON_RUN_AS_NODE=1` 跑 Electron；Electron 版 node 解析 yargs 位置参数与标准 Node 不一致，导致 RN codegen 报 `ENOENT` 构建失败 | 改用系统 `/usr/local/bin/node` |
| 3 | Kotlin 编译守护进程无法写 `~/Library/Application Support/kotlin/daemon/` | 在 `GRADLE_USER_HOME/gradle.properties` 设 `kotlin.compiler.execution.strategy=in-process` |
| 4 | 改了 PATH 后旧 Gradle 守护进程仍持旧环境 | 改 PATH 后必须 `./gradlew --stop` 再构建 |

**如果换到一台没有沙箱限制的普通电脑上开发，这些都不需要**，
直接用默认的 `~/.gradle`、`~/.npm`、系统 node 即可。

### 常用命令

```bash
npx tsc --noEmit                 # 类型检查
npm test                         # 单元测试（离线，141 通过）
npm run test:integration         # 集成测试（真实联网，14 通过）

npx expo prebuild --platform android
cd android && ./gradlew assembleDebug      # 需配合 npx expo start
cd android && ./gradlew assembleRelease    # 内嵌 bundle，可直接安装
```

`android/` 与 `ios/` 是 CNG 生成目录，已加入 `.gitignore`，**不要手工修改**；
原生行为一律通过 `app.json` 与 config plugin 配置。
`modules/hukang-vision/` 是手写的原生模块，需要修改时改那里。

---

## 6. 数据正确性的硬性约定（改动代码时必须守住）

- `carbohydrate_g`、`total_sugar_g`、`added_sugar_g` 是**三个不同字段**，
  禁止用碳水推导添加糖；包装未标注时一律存 `NULL`
- `NULL` = 未记录，与 `0`（含量确实为零）**完全不同**。
  每日汇总保留 `unknownCount`，有未记录项时合计只是下限
- 无法可靠换算份量时（基准缺失或单位不匹配），摄入营养整份留空，不猜
- 包装只写千焦时 `energy_kcal` 保持 `null`，不做单位换算
- 条形码校验位错误 → 让用户重扫，**不能**报"查不到"
- 数据源 503 限流 → `unavailable`，**不能**报"商品不存在"
- 五种扫描任务各有独立错误码与结果页，禁止统一成一句"不认识这款食品"
- 不做任何"健康评分"，只用具体事实（如"今天钠摄入较高。"）

---

## 7. 下一步（Phase 5～8，尚未开始）

| 阶段 | 内容 |
| --- | --- |
| Phase 5 | 配料表 OCR + Ingredients Parser（含「可能含添加糖来源」提示，但**不据此算添加糖克数**） |
| Phase 6 | 日期识别 · 库存 · 临期本地通知 |
| Phase 7 | NutritionLog · 首页营养可视化 · 历史日期 ·「如果吃下它」 |
| Phase 8 | 启动页 · 康康 · 视觉统一 |

本轮按你的要求**已停止开发**，等你真机反馈后再继续。

---

## 8. 关于 apk/ 目录与 git

`apk/HuKang-DeepSeek-Phase4.apk` **已生成在项目根目录的 `apk/` 下，但未纳入 git**。

原因：项目初始约定（§56）明确禁止提交 `*.apk`，而 172MB 的二进制放进 git 也会
让仓库迅速膨胀。`.gitignore` 里的 `*.apk` 规则会把 `apk/` 下的 APK 忽略掉，
同目录的 `apk/README.md` 会被正常提交。

**如果你希望把 APK 也纳入版本管理，告诉我，我可以改 `.gitignore`。**

## 9. 版本历史

| commit | 阶段 |
| --- | --- |
| `cb055a2` | Phase 1：项目骨架 / Navigation / SQLite / Camera / 图片导入 |
| `ac9bfe1` | Phase 2：条形码 / 本地商品库 / 联网 Barcode Lookup |
| `77a6df8` | Phase 3：拍商品 / 本地 OCR / 图片质量 / 商品身份提取 / 商品搜索 / 候选商品 |
| `e8a4361` | Phase 4：营养成分表 OCR / Nutrition Parser / 用户确认 |
