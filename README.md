# Beer Journal｜我的啤酒手帐

Beer Journal 1.0 是一款完全离线的 Android 啤酒记录软件：把 Beer 资料、每次品饮、照片、标签和个人感受留在自己的手机里，随时搜索、筛选、回看。

## 1.0.0 正式版

- Android 包名：`com.mybeerjournal.app`
- 版本：`1.0.0`（versionCode 31）
- SQLite Schema：4
- 最低 Android：7.0（API 24）
- 数据：本地 SQLite 与 App 私有照片目录

正式 APK 可从 [GitHub Release v1.0.0](https://github.com/Eddie135/Beer-Journal/releases/tag/v1.0.0) 下载。安装前可查看随 Release 提供的 SHA-256 校验文件。

## 功能

- Beer 新增、编辑、详情、软删除与恢复
- Tasting 新增、编辑、详情、软删除与恢复
- 自定义国家、大分类、小类型与风味标签
- 总体评分，以及口感、苦味、风味复杂度五选项评分
- Beer 与 Tasting 多照片、本地压缩、封面、删除与恢复
- 名称和标签搜索，国家/分类/风格/评分等组合筛选
- 最新录入、最近品饮、评分与次数等排序
- 个人统计、回收站、JSON 备份与恢复
- Android 安全区、Overlay 和系统返回键适配

## 隐私与数据安全

1.0 不需要账号，没有云同步、广告、统计追踪，也不依赖 `mybeerjournal.com`。记录和照片留在本机；卸载 App 或清除数据会删除本地内容。请定期在 App 内导出 JSON 备份。

内部测试包 `com.mybeerjournal.app.v1test` 与正式包是两个独立 App，数据不会自动共享。若要从测试版迁移，请先在测试版导出 JSON，再在正式版导入并核对，然后再考虑卸载测试版。

## 本地构建

```powershell
cd mobile
npm ci
npm test
npm run build
npx cap sync android
```

Android 构建需要 JDK 21、Android SDK 和项目指定的 Gradle/Capacitor 依赖。正式签名文件只应放在仓库外，通过未提交的 `keystore.properties` 或环境变量提供。

## 文档与路线图

- [Beer Journal 产品页](docs/index.html)
- [隐私说明](PRIVACY.md)
- [安全说明](SECURITY.md)
- [数据库设计](docs/DATABASE_DESIGN.md)
- [网页到本地迁移记录](docs/WEB_TO_LOCAL_PORT.md)
- [更新日志](CHANGELOG.md)
- [后续路线图](docs/ROADMAP.md)

当前 1.0 范围已冻结。后续版本仍处于规划阶段，不代表已经实现。
