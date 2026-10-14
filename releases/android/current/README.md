# releases/android/current — 当前交付的 APK

## 文件

| 项 | 值 |
| --- | --- |
| 文件 | `HuKang-1.1.0.apk` |
| 包名 | `com.hukang.deepseek` |
| versionName / versionCode | `1.1.0` / `2` |
| 大小 | 144,801,126 字节（约 138 MB） |
| SHA-256 | `c7069de59bfa0094bbfd3b426baaaef89973bc8fc659ec7a142f602d88aef9ee` |
| 构建类型 | **release**（已内嵌 JS bundle，装完即可独立运行） |
| 构建方式 | **GitHub Actions 云端构建**（本机已无 Android SDK） |
| 签名 | APK Signature Scheme v2 有效，证书 `CN=Android Debug` |
| 证书 SHA-256 | `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` |
| minSdk / targetSdk | 24（Android 7.0） / 36 |
| 原生架构 | `arm64-v8a` · `armeabi-v7a` |
| 应用名 | 护康 |
| 识别引擎 | **PaddleOCR PP-OCRv5**（离线 ONNX，默认）＋ ML Kit（可在开发者选项切换对比） |

> 这里放的是 **release** 构建而不是 debug 构建。
> debug APK **不含 JS bundle**，必须配合 `npx expo start` 才能跑，
> 装到手机上单独打开会白屏，不适合交付测试。

## 这一版改了什么

**换掉了文字识别引擎**。上一版用 Google ML Kit，在商品包装上召回很低
（一张清晰的瓶身照只读出 5 行 17 个字）。现在默认用 PaddleOCR PP-OCRv5，
同一张照片能读出约 10 行 30 字，包括「茉莉」「乌龙」「原味茶饮料」「净含量500m」，
竖排商品名「焙好茶」也能读出来。

体积**反而小了 34MB**（172MB → 138MB）——因为同时砍掉了只有模拟器才用的
x86/x86_64 架构，省下的比新增的 21MB 模型 + ONNX Runtime 还多。

## 安装

1. 把 `HuKang-1.1.0.apk` 传到手机（数据线 / 网盘 / 微信文件传输均可）
2. 手机上点开该文件
3. 系统提示"未知来源应用"时，允许该来源安装
   （不同品牌路径不同，一般在「设置 → 安全 → 安装未知应用」）
4. 装好后桌面会出现 **护康**
5. 首次进入「扫一扫」会申请**相机权限**，需要允许，否则拍不了照

### 从旧版升级：直接装，不用卸载

证书指纹与 1.0.0 / 1.0.1 **完全一致**，且 versionCode 从 1 升到 2，
所以可以直接覆盖安装，**数据不会丢**。

> 提醒：1.0.0 和 1.0.1 的 versionCode 都是 1，在系统设置里分辨不出装了哪一版。
> 1.1.0 起会递增，可以在「设置 → 应用 → 护康」看到版本号是 `1.1.0`。

### 装完建议先做这件事

进「我的 → 开发者选项」（需先开启开发者模式），里面有一个
**本地 OCR 引擎**切换开关。默认是 PP-OCRv5，可以切到 ML Kit。

**用同一瓶商品、同一张照片分别试两个引擎**，这样最直观。
开发者选项里还会显示这次识别实际用了哪个引擎。

## 关于签名

沿用 React Native 模板自带的 debug keystore（`android/app/debug.keystore`，口令 `android`）。

- ✅ **能正常安装到普通 Android 手机**
- ❌ 不能上架应用商店
- ⚠️ **包名不变时换正式签名，必须先卸载旧版**（签名不同无法覆盖安装）

## 校验

本机没有 Android SDK，所以 `aapt2` / `apksigner` 用不了。
云端构建日志里已经跑过这两个校验，输出见 `TEST_REPORT.md` 第 1.1 节。
本机能做的是：

```bash
APK=releases/android/current/HuKang-1.1.0.apk

# SHA-256 是否与上表一致
shasum -a 256 "$APK"

# 是否内嵌 JS bundle（决定能否独立运行）
unzip -l "$APK" | grep index.android.bundle

# 内置的 ONNX 模型
unzip -l "$APK" | grep 'assets/models'

# 原生架构
unzip -l "$APK" | grep 'lib/' | awk -F'lib/' '{print $2}' | cut -d/ -f1 | sort -u
```

## 重新生成（云端）

本机已无 Android SDK，构建走 GitHub Actions：

```bash
cd 护康
git add -A && git commit -m "..." && git push
# push 到 main 会自动触发；也可以在仓库的 Actions 页面手动触发
# 构建约 15 分钟，完成后在运行详情页下载 Artifact
```

仓库：<https://github.com/chenchangxiang-330/Hukang-deepseek>

如需本机构建，必须先装 Android SDK，然后：

```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
```

## 注意：APK 不纳入 git

`.gitignore` 中的 `*.apk` 规则会忽略本目录下的安装包
（项目约定禁止提交 APK，且 138MB 的二进制会让仓库迅速膨胀）。
只有本 README 会被提交。

**因此这个 APK 只存在于本机**。GitHub Actions 上的 Artifact 只保留 30 天。
需要长期留存请自行备份。
