# AI Commute Android

AI Commute 的个人原生 Android 客户端。它不依赖 AI-Commute 自建后端，也没有账号密码和 Telegram 入口。

## 架构

- Kotlin + Jetpack Compose
- Room / SQLite：本地保存行程、历史与通勤记忆
- Android Keystore：加密保存 AI Key、高德 Key 和 SMTP 密码/授权码
- WorkManager：本地出发提醒和路线变化定期检查
- Android Notification：系统通知
- SMTP：可选邮件提醒
- OpenAI-compatible Chat Completions：手机直连 AI
- 高德 Web Service：地点、逆地理编码、天气与路线
- ZXing：本地生成带二维码的行程分享图

## 首次使用

首次打开 App 只需要配置一次：

1. OpenAI-compatible Base URL
2. 模型名称
3. AI API Key
4. 高德 Web Service Key
5. 可选：默认城市、默认出发点和通勤偏好
6. 可选：SMTP 与提醒接收邮箱

之后 App 直接进入首页，不需要登录。

> App 没有 AI-Commute 自建服务器，但 AI、高德、SMTP 本身仍需要联网。

## 本地构建

环境要求：

- JDK 17
- Android SDK 35
- Gradle 8.9

```bash
cd android
gradle :app:assembleDebug
```

APK：

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## GitHub Actions

`.github/workflows/android-apk.yml` 会在 Android 分支/相关文件变化时构建可安装 APK，并上传名为 `AI-Commute-Android-APK` 的 artifact。

## 无后端模式的限制

- 公共只读 Web 分享链接改为本地分享图片/文本/二维码。
- 数据默认只保存在当前手机，没有跨设备同步。
- Android 后台调度受系统省电策略约束，路线变化监控不是服务器常驻任务。
- 不应把私人 API Key 写死进源码或公开 APK；本客户端要求首次安装时自行配置。
