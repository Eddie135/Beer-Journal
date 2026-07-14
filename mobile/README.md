# Beer Journal Android

此目录是 Beer Journal 的 Capacitor Android 外壳。它通过 HTTPS 加载 `https://mybeerjournal.com`，不复制或重写 Django 页面与业务逻辑。

## 本地命令

在本目录中使用内置 pnpm：

```powershell
pnpm install
pnpm cap:sync
pnpm android:debug
```

生成的调试 APK 位于 `android/app/build/outputs/apk/debug/app-debug.apk`。发布 APK/AAB 必须另行创建签名密钥，不能使用调试签名。
