# 网页端到 Local-first 直接迁移记录

## 基准

- 网页端基准提交：`cf1651dccbfd181bb6cafe8d2161c6dcc1a636f8`（`cf1651d`）
- 只读参考 worktree：`D:\BEER-JORNAL-WEB-REFERENCE`
- 本地开发目录：`D:\BEER-JORNAL`
- 迁移分支指针：`feat/web-ui-direct-port`
- 当前本地数据库：SQLite `beer_journal`，Schema 4

RC1 已冻结。迁移只替换表现层和 Django 专属边界，不删除现有 Capacitor、SQLite、迁移、Repository、照片文件系统、备份恢复、回收站或 Overlay Manager。

## 迁移原则

1. 网页端最终版本是 UI、文案、字段顺序、控件类型和交互的唯一基准。
2. 优先原样复用网页端 DOM class、结构、CSS 和 JavaScript 行为。
3. Django 模板变量、URL、CSRF、ModelForm、ORM、POST、Session、服务器文件上传和 redirect 由本地 ViewModel/LocalDataAdapter 替换。
4. 页面只调用 LocalDataAdapter，不直接执行 SQL。
5. 每个页面整体迁移完成后，才进入下一个页面；不并行维护第二套相似 UI。

## 页面迁移顺序

| 页面 | 网页端基准文件 | 本地状态 | 离线边界 |
|---|---|---|---|
| App Shell/底部导航 | `templates/base.html`、`core/static/css/app.css`、`core/static/js/app.js` | 最小转换 | 保留固定 App Shell、Overlay Manager 和 Android 返回键 |
| 我的啤酒列表 | `templates/beer_list.html` | 最小转换 | 查询改由 `BeerRepository`/LocalDataAdapter 提供 |
| 添加 Beer | `templates/beer_form.html`、`templates/beer_first_tasting.html` | 最小转换 | POST/redirect 改为本地表单控制器 |
| Beer 详情 | `templates/beer_detail.html` | 最小转换 | 照片改用 Capacitor Filesystem |
| 编辑 Beer | `templates/beer_edit.html` | 最小转换 | 保留原表单顺序和控件 |
| 筛选和排序 | `templates/beer_list.html` 内 Filter Sheet | 最小转换 | 国家、标签和评分使用本地查询 |
| 饮用记录列表 | `templates/tasting_list.html` | 最小转换 | 查询改由 `TastingRepository` |
| 添加 Tasting | `templates/tasting_select.html`、`templates/tasting_create.html` | 最小转换 | 选择 Beer 和提交走本地路由 |
| Tasting 详情/编辑 | `templates/tasting_detail.html`、`templates/tasting_edit.html` | 最小转换 | 照片改用本地文件 |
| 个人数据 | `templates/personal_data.html` | 最小转换 | 统计改由 `statsRepository` |
| 回收站 | `templates/trash.html` | 最小转换 | 保留软删除/恢复，不物理删除 |
| 备份恢复 | 网页端无对应页面；本地已有 `backup-service.js` | 离线必要差异 | 继续使用本地 JSON 文件系统 |

状态仅使用：原样复用、最小转换、离线必要差异、尚未完成、已验证一致。

## Django 专属替换边界

| 网页端能力 | 本地替换 |
|---|---|
| `{{ beer.* }}`、`{% for %}`、`{% if %}` | ViewModel 数据绑定和本地渲染 |
| `{% url %}` | 本地 `navigate()`/Router |
| ModelForm 和 HTTP POST | 本地表单提交控制器 |
| ORM 查询 | `BeerRepository`、`TastingRepository`、`TagRepository`、`statsRepository` |
| 服务器照片 URL | `photoRepository` + Capacitor Filesystem/Camera |
| HTTP redirect | 本地 Router 路由跳转 |
| Session/登录 | v1.0 不引入服务器账号；保持完全离线 |

## 统一适配层接口

页面只依赖以下接口，内部继续调用现有 Repository：

- `listBeers`、`getBeer`、`createBeer`、`updateBeer`、`deleteBeer`、`restoreBeer`
- `listTastings`、`createTasting`、`updateTasting`、`deleteTasting`、`restoreTasting`
- `listTags`、`setBeerTags`
- `searchBeers`、`filterBeers`
- `getStatistics`
- `selectBeerPhotos`、`selectTastingPhotos`
- `exportBackup`、`importBackup`

## 验证基线

使用相同本地测试数据对比网页端参考版本和本地迁移版本，覆盖 360×800、393×852、412×915 三个视口。对比项目包括字段数量与顺序、文案、控件类型、卡片结构、弹层、搜索、筛选、排序、统计、空状态和错误状态。

RC1 冻结材料、APK、debug keystore 和工作区差异保存在 `C:\Users\EDY\Documents\BeerJournalBackups`，不进入 Git。
