# Beer Journal Android

此目录是 Beer Journal 本地优先 v1.0 的 Capacitor Android 工程。APK 使用 `web/` 中打包的本地前端资源，不依赖 `mybeerjournal.com`、Django 或网络连接。

## 本地命令

在本目录中使用内置 pnpm：

```powershell
pnpm install
pnpm cap:sync
pnpm android:debug
```

生成的调试 APK 位于 `android/app/build/outputs/apk/debug/app-debug.apk`。当前 L1 版本为 `1.0.0-beta1`（versionCode 4）。发布 APK/AAB 必须另行创建签名密钥，不能使用调试签名。

L2 已加入本地 SQLite、Beer Repository 和 Beer 新增/查看/编辑/软删除、搜索筛选；Tasting、照片和备份仍在后续 L3-L4 实现。当前 debug APK 版本为 `1.0.0-beta2`（versionCode 5）。
