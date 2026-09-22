# apk/ — 安装包

本目录存放供真机安装测试的 APK。

## 当前交付

| 项 | 值 |
| --- | --- |
| 文件 | `HuKang-DeepSeek-Phase4.apk` |
| 绝对路径 | `/Users/yangbing/Ai/deepseek/软件开发/HuKang-DeepSeek/apk/HuKang-DeepSeek-Phase4.apk` |
| 包名 | `com.hukang.deepseek` |
| 版本 | versionName `1.0.0` / versionCode `1` |
| 大小 | 180,786,227 字节（约 172 MB） |
| SHA-256 | `9d14a72dde06f078dad48d6971afeb60c0e2c353c48d16b74007bd2da714e4a5` |
| 构建类型 | **release**（已内嵌 JS bundle，装完即可独立运行，不需要连电脑） |
| 签名 | APK Signature Scheme v2 有效，证书 `CN=Android Debug` |
| minSdk / targetSdk | 24 / 36 |
| 原生架构 | arm64-v8a · armeabi-v7a · x86 · x86_64 |

> 这里放的是 release 构建而不是 debug 构建。
> debug APK（301MB）**不含 JS bundle**，必须配合 `npx expo start` 才能跑，
> 不适合直接装到手机上测试。

### 关于签名

用的是 React Native 模板自带的 debug keystore，**能正常安装**，仅适合内部测试。
正式发布必须换成自己的 keystore；**包名不变时换签名需要先卸载旧版**。

## 安装

1. 把 APK 传到手机
2. 点开文件，按提示允许"未知来源应用"安装
3. 首次进入「扫一扫」时允许相机权限

## 校验（可选）

```bash
BT=/Users/yangbing/Library/Android/sdk/build-tools/36.0.0

# 核对 SHA-256 是否与上表一致
shasum -a 256 apk/HuKang-DeepSeek-Phase4.apk

# 包名与版本
$BT/aapt2 dump badging apk/HuKang-DeepSeek-Phase4.apk | head -3

# 签名是否有效
$BT/apksigner verify --print-certs apk/HuKang-DeepSeek-Phase4.apk
```

## 重新生成

```bash
cd /Users/yangbing/Ai/deepseek/软件开发/HuKang-DeepSeek
source ../.dsh-cache/env.sh          # 本机特有的缓存重定向，见 HANDOFF.md 第 5 节

npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
cp app/build/outputs/apk/release/app-release.apk ../apk/HuKang-DeepSeek-Phase4.apk
```

## 注意：APK 不纳入 git

`.gitignore` 中的 `*.apk` 规则会忽略本目录下的安装包
（项目初始约定 §56 禁止提交 APK，且 172MB 的二进制会让仓库迅速膨胀）。
只有本 README 会被提交。

需要把 APK 也纳入版本管理的话，改 `.gitignore` 即可。
