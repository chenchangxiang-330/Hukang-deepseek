# releases/android/current — 当前交付的 APK

## 文件

| 项 | 值 |
| --- | --- |
| 文件 | `HuKang-1.0.0.apk` |
| 包名 | `com.hukang.deepseek` |
| versionName / versionCode | `1.0.0` / `1` |
| 大小 | 180,786,227 字节（约 172 MB） |
| SHA-256 | `ad5027859e71b2fda13a1cb27eacb5610fef29169340faef39a1d17c7e61082d` |
| 构建类型 | **release**（已内嵌 JS bundle，装完即可独立运行） |
| 签名 | APK Signature Scheme v2 有效，证书 `CN=Android Debug` |
| minSdk / targetSdk | 24（Android 7.0） / 36 |
| 原生架构 | `arm64-v8a` · `armeabi-v7a` · `x86` · `x86_64` |
| 应用名 | 护康 |

> 这里放的是 **release** 构建而不是 debug 构建。
> debug APK **不含 JS bundle**，必须配合 `npx expo start` 才能跑，
> 装到手机上单独打开会白屏，不适合交付测试。

## 安装

1. 把 `HuKang-1.0.0.apk` 传到手机（数据线 / 网盘 / 微信文件传输均可）
2. 手机上点开该文件
3. 系统提示"未知来源应用"时，允许该来源安装
   （不同品牌路径不同，一般在「设置 → 安全 → 安装未知应用」）
4. 装好后桌面会出现 **护康**
5. 首次进入「扫一扫」会申请**相机权限**，需要允许，否则拍不了照

APK 偏大（172MB）是因为包含 4 个 CPU 架构的原生库与 ML Kit 中文 OCR 模型。
真机通常只需要 `arm64-v8a`，将来做 ABI 拆分可降到约 60～70MB。

## 关于签名

沿用 React Native 模板自带的 debug keystore（`android/app/debug.keystore`，口令 `android`）。

- ✅ **能正常安装到普通 Android 手机**
- ❌ 不能上架应用商店
- ⚠️ **包名不变时换正式签名，必须先卸载旧版**（签名不同无法覆盖安装）

## 校验

```bash
BT=$ANDROID_HOME/build-tools/36.0.0
APK=releases/android/current/HuKang-1.0.0.apk

# SHA-256 是否与上表一致
shasum -a 256 "$APK"

# 包名 / 版本 / 架构
$BT/aapt2 dump badging "$APK" | head -5

# 签名是否有效
$BT/apksigner verify --print-certs "$APK"

# 是否内嵌 JS bundle（决定能否独立运行）
unzip -l "$APK" | grep index.android.bundle
```

## 重新生成

```bash
cd 护康
source ../.dsh-cache/env.sh          # 仅本机需要（见 README「环境要求」）

npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
cd ..
cp android/app/build/outputs/apk/release/app-release.apk \
   releases/android/current/HuKang-1.0.0.apk
```

## 注意：APK 不纳入 git

`.gitignore` 中的 `*.apk` 规则会忽略本目录下的安装包
（项目约定禁止提交 APK，且 172MB 的二进制会让仓库迅速膨胀）。
只有本 README 会被提交。

需要把 APK 也纳入版本管理的话，改 `.gitignore` 即可。
