# Beer Journal

Beer Journal 是一个移动优先的个人啤酒收藏应用。当前路线已调整为 Local-first v1.0：数据、照片和核心操作全部保存在 Android 设备本地，离线也可以使用，不连接生产 Django 服务。

## 当前状态

- Capacitor 8 + Vite Android 工程。
- SQLite 数据库 `beer_journal`，当前 Schema version 4，使用迁移升级而不是重建数据库。
- Beer、Tasting、风味标签、搜索筛选、软删除/恢复、个人统计、照片压缩与本地备份功能已纳入 v1.0 实现范围。
- 视觉基于现有 Beer Journal App Shell、CountryPicker、FiveOptionRating、Bottom Sheet 和 Android 返回键处理。
- 生产 Django/PostgreSQL 代码保留给 v1.1 同步后端，不作为 v1.0 运行依赖。

## 本地开发

```powershell
cd mobile
pnpm install
pnpm build
pnpm test
```

Android 构建使用 Capacitor 8 与本机 Android SDK；构建产物和 APK 不应提交 Git。

## 下一步

RC1 源码检查点已冻结。下一阶段在独立 `feat/web-ui-direct-port` 分支上，直接迁移网页最终版本 `cf1651d` 的表现层，并仅替换 Django/HTTP 为本地适配层；迁移完成前不生成中间 APK。账号、服务器同步、多语言和深色模式属于 v1.1。
