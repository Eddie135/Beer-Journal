# Beer Journal 本地优先 v1.0 范围

本文件锁定 v1.0 的唯一交付范围。当前实现继续使用 Capacitor 8、Vite、SQLite、Schema migration、BeerRepository、TastingRepository、TagRepository、固定 App Shell、Router、Overlay Manager、CountryPicker、五选项评分和 Android 返回键。

## 功能基准

实现优先级为：用户最新明确要求、`docs/LOCAL_FEATURE_PARITY.md`、网页参考提交 `cf1651dccbfd181bb6cafe8d2161c6dcc1a636f8`。网页端只作为字段、行为和视觉对照，本地 APK 不访问 Django、生产服务器或 `mybeerjournal.com`。

## v1.0 必须交付

- Beer 完整新增、编辑、详情、列表、搜索、筛选、排序、软删除和恢复。
- Beer 字段：名称、品牌、酒厂、中文国家/国旗与自定义国家、拉格/艾尔及风格、ABV、Plato、默认容量、总体评分、口感/苦味/风味复杂度五选项、风味标签、个人感想、创建/更新时间。
- Tasting 完整新增、编辑、详情、列表、时间筛选、软删除和恢复；支持 Beer 关联、时间、地点、容量、瓶数、购买渠道、价格、评分、笔记及多图。
- 新 Beer 保存后可选择添加首次品饮或稍后添加，不创建空 Tasting。
- 本地照片：Beer/Tasting 多图、相册、相机、预览、压缩、方向处理、缩略图、封面、详情图集、删除与文件清理；照片保存在 App 私有目录，SQLite 只保存相对路径和元数据。
- 完整标签创建、编辑、搜索、筛选、去重、软删除关系和恢复。
- 完整搜索、筛选和旧版三种排序；筛选状态可回显、胶囊可单独清除、Filter Sheet 和 CountryPicker 分层显示。
- 个人数据：收藏/品饮/瓶数/容量/国家/品牌/酒厂/风格、评分、偏好、花费、月度趋势、分布和空状态，全部离线查询并排除软删除数据。
- 本地单文件备份导出、校验、导入、回滚、UUID 去重、照片随包恢复、清空数据双重确认。
- Beer、Tasting、照片和标签关系均支持软删除与恢复。
- 手机优先 App Shell、稳定 Logo、44px 触控区、安全区、无系统蓝色高亮、无调试文案、Overlay 分层和 Android 返回键优先关闭浮层。

## 数据库版本

一次性将 Schema 3 迁移到 Schema 4，补齐 Beer/Tasting 照片表、索引、同步预留字段及备份元数据；迁移必须事务化、幂等并保留现有 Beer、Tasting、标签和关系。

## 明确不属于 v1.0

登录注册、云端/多设备同步、Django API、多语言、深色模式、AI、社交功能和应用商店发布均留到 v1.1 以后。

## 最终门禁

全部功能完成后才运行 Playwright 360×800、393×852、412×915 三视口回归，并使用独立测试包 `com.mybeerjournal.app.v1test` 完成一次 Schema 4、照片、备份恢复、强制停止和覆盖安装门禁。只有所有检查通过后生成唯一 `Beer-Journal-v1.0.0-rc1.apk`，开发过程中不生成中间用户 APK。
