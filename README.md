# BEER JOURNAL

BEER JOURNAL 是一个仅供个人使用的中文啤酒记录应用。它将分别保存“啤酒基本资料”和“每次品饮记录”，并计划提供多图上传、多维评分、标签、组合筛选、统计、导出、备份以及可安装到手机主屏幕的 PWA 体验。完成后将通过 Docker 部署到个人 Debian 13 服务器，数据和照片默认不交给第三方。

## 当前状态

- 已完成 v2/v3 移动端体验重构、v4 PWA、生产 HTTPS 与单用户登录保护；核心录入、图片、编辑、软删除与再次品饮流程保持可用。
- 产品需求、技术架构、数据库设计、开发计划和长期协作规则已写入 `docs/` 与 `AGENTS.md`。
- 已建立 BeerCategory → BeerStyle → Beer 两级分类关系；分类显示为“拉格/艾尔”，内部稳定代码不变，并移除旧的泛称小类 “Lager”（已有关联安全迁移为“淡色拉格”）。已迁移 Plato、口感、容量、饮用瓶数和购买渠道；历史评分、品饮标签和软删除数据保持兼容。
- 既有 Beer、Tasting、评分、标签、照片及品牌/酒厂流程继续可用；未实现 Hop、Malt、库存、条码或 AI。
- Docker Compose/PostgreSQL、Django 系统检查、迁移一致性检查和 50 个自动测试已通过；PWA 使用根路径公开 Manifest、Service Worker、离线页、版本化静态资源和 v3 啤酒杯图标。
- 已创建 Capacitor 8 Android 外壳并成功编译本机 debug APK；它通过 HTTPS 访问现有 Django 应用，不复制或改变业务逻辑。真机安装与登录流程仍待验收。

## 下一步

下一步将 debug APK 安装到 Android 真机，验收启动、HTTPS 登录、照片上传和底部导航；确认后再单独创建 release 签名与 release APK/AAB。
