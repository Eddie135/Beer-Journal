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
### L3 状态

### L3 bridge build

The local app is built with Vite from `web/` into `dist/`, and Capacitor uses `dist` as `webDir`. `database.js` imports `Capacitor`, `CapacitorSQLite`, `SQLiteConnection`, and `SQLiteDBConnection` from npm packages. Android does not call `initWebStore`. Use `pnpm build`, `pnpm cap:sync`, and `pnpm android:debug`.

SQLite 初始化顺序固定为 `checkConnectionsConsistency` → `isConnection` → `retrieveConnection` 或 `createConnection` → `db.isDBOpen` → `db.open` → schema version/migration。首次启动没有连接时直接创建连接；初始化由单例 Promise 串行化，失败会清除锁以便重试，不会删除或重建数据库。

本地 schema version 2 已支持 Tasting CRUD、软删除、Beer 历史品饮和首次品饮流程；所有数据继续保存在设备 SQLite 中。
