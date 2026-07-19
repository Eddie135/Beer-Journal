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

## 当前迁移状态（feat/web-ui-direct-port）

本轮已直接复用网页基准的 `core/static/css/app.css`（移动端设计系统、卡片、表单、时间线、详情与个人数据图表样式）以及 `templates/base.html` 的 App Shell 结构，并将本地 `index.html` 的路由内容容器接入同一套 class 命名。

| 页面 | 状态 | 说明 |
|---|---|---|
| App Shell/底部导航 | 代码完成 | 固定 Header、Logo、Bottom Tab 与 route-content 保持一次创建；页面切换只更新主内容。 |
| 我的啤酒列表 | 代码完成 | 已使用 collection hero、search、filter trigger、collection card；筛选数据仍由 LocalDataAdapter 提供。 |
| Beer 新建/编辑 | 代码完成 | 已切换到 reference `record-form`/`form-field`/`beer-edit-photos` 结构；CountryPicker、FiveOptionRating、标签和照片仍由本地组件控制。 |
| Beer 详情 | 代码完成 | 已切换 hero、summary、facts、experience、history 结构；照片路径继续由本地文件系统解析。 |
| 饮用记录列表 | 代码完成 | 已切换 journal hero、period chips、timeline entry 结构。 |
| Tasting 新建/编辑 | 代码完成 | 已切换 daily tasting record form；不改变 TastingRepository 字段和保存逻辑。 |
| Tasting 详情 | 代码完成 | 已切换 diary hero/note/info 结构；统一 Action Sheet 与软删除逻辑保留。 |
| 个人数据 | 代码完成 | 已切换 profile hero、口味画像、偏好卡片、国家/类型/风格分布、12 个月趋势、风味云、花费习惯和最近饮用；统计仍由 statsRepository 提供。 |
| 回收站/备份 | 代码完成 | 继续通过 LocalDataAdapter 调用本地软删除恢复和 JSON 备份服务。 |

本地数据边界统一位于 `mobile/web/assets/local-data-adapter.js`。页面渲染代码不直接执行 SQL；适配器只编排现有 Beer/Tasting/Tag/Photo/Stats/Backup Repository。

本轮实际复用/转换文件：

- 直接复用并纳入本地构建：`D:\BEER-JORNAL-WEB-REFERENCE\core\static\css\app.css` → `mobile/web/assets/app.css`。
- DOM 结构转换：`templates/base.html`、`beer_list.html`、`beer_form.html`、`beer_edit.html`、`beer_detail.html`、`tasting_list.html`、`tasting_select.html`、`tasting_create.html`、`tasting_detail.html`、`tasting_edit.html`、`personal_data.html`、`trash.html` → `mobile/web/index.html` 与 `mobile/web/assets/app.js`。
- Django 专属部分（模板变量、URL、表单 POST、ORM、照片 HTTP URL）由 `localDataAdapter`、本地 Router、现有 Repository 和 `photoRepository` 替换；SQLite schema、migration、Repository 契约未改动。

## 功能对齐明细（P0/P1）

| 功能 | 网页源文件 | 本地目标 | 本地状态 | 离线必要差异 | 真机状态 |
|---|---|---|---|---|---|
| 自定义风味标签 | `beer_form.html`、`app.js` | `app.js` + `TagRepository` | 代码完成 | 通过 SQLite 保存标签关系 | 未运行 |
| 多标签删除与编辑回显 | `beer_edit.html` | `app.js` | 代码完成 | 无 | 未运行 |
| Beer 图片、多图、封面 | `beer_form.html`、`beer_detail.html` | `photoGallery` + `PhotoRepository` | 代码完成 | Filesystem 相对路径替代 HTTP media | 未运行 |
| Tasting 图片 | `tasting_create.html`、`tasting_edit.html` | `tastingForm` + `PhotoRepository` | 代码完成 | Filesystem 相对路径替代 HTTP media | 未运行 |
| 图片删除/恢复 | `trash.html`、编辑页 | `app.js` + LocalDataAdapter | 代码完成 | 软删除后可在回收站恢复 | 未运行 |
| CountryPicker | `beer_form.html`、`beer_list.html` | `openCountryPicker` | 代码完成 | 完整离线国家源，并合并本地自定义国家 | 未运行 |
| 五选项体验评分 | `beer_form.html`、`beer_detail.html` | `FiveOptionRating` | 真机基线已通过 | 无 | RC1 基线已验证，本轮未重测 |
| 搜索/筛选/排序 | `beer_list.html` | `renderBeerListPage` + Repository | 代码完成 | 查询改为本地 SQLite | 未运行 |
| 个人数据全量展示 | `personal_data.html` | `profilePage` + `StatsRepository` | 代码完成 | 统计不出设备 | 未运行 |
| Action Sheet/Bottom Sheet | `base.html`、详情/筛选模板 | `OverlayManager` + 本地 sheet | 代码完成 | 不写入 URL 历史 | 未运行 |
| 空状态/错误状态 | 各页面模板 | `emptyState`、数据库诊断页 | 代码完成 | 原生桥错误显示本地诊断 | 未运行 |
| Android 返回键/锁屏恢复 | 网页端返回脚本 + 本地壳 | `overlay-manager`、`App` 监听 | 代码完成 | Capacitor 生命周期替代浏览器会话 | 未运行 |
| JSON 备份与回收站 | 本地扩展能力 | `BackupService`、`trash` | 代码完成 | 网页端无对应服务器页面 | 未运行 |

## 本轮直迁补齐项

- 日期时间字段改为网页参考版的五列滚轮面板；打开并完成渲染后将当前值滚动到视觉中心，确认后才写回原始字段，取消不会改变表单值。
- 品饮详情增加统一“更多”操作面板，查看、编辑和删除均通过 Overlay Manager，删除确认作为嵌套浮层处理。
- 个人数据页补齐网页版本的口味画像、偏好分析、国家/类型/风格分布、近 12 个月双柱趋势、风味标签云、花费习惯和最近饮用入口；数据仍由本地统计 Repository 提供。
- Beer 卡片的“最近品饮”状态由 `latest_tasted_at` 查询结果计算，不改变查询或存储结构。
- 三视口脚本已更新为当前参考 class（`collection-card`、`filter-sheet`、`collection-filters` 等），但当前环境没有 Playwright 包，尚未实际运行浏览器回归。

尚未进入 RC2 条件：三视口截图对比、Android 内部测试包、覆盖安装持久化和整套照片/统计人工回归仍待在宿主环境统一执行；本轮未运行 `cap sync`、Gradle 或真机测试，也没有生成用户 APK。

## 本轮验证记录

- Node 全量测试：52/52 通过。
- JavaScript/MJS 语法检查：16 个文件通过。
- `git diff --check`：通过（仅有 Git 的 CRLF 转换提示）。
- Vite production build：最近一次成功构建生成 `dist/assets/index-Co9a_4Ym.js` 与 `dist/assets/index-BAzUr2bF.css`；随后仅调整了日期滚轮年份范围，尚未重新生成 bundle。
- Playwright 三视口回归：未运行，当前 `mobile/node_modules` 没有 Playwright 包；未下载新浏览器或修改生产依赖。

## RC2 收尾门禁记录（本轮）

- 最终 Vite production build：成功，bundle 为 `index-CCwjUC4Q.js`，CSS 为 `index-BAzUr2bF.css`；主 JS SHA-256：`A5851581A40A71EAEBE5397EA48B801ED34772C32D9574A9FBB8EA7DEE48B064`。
- 禁止内容扫描：生产域名、测试包名、调试 Build/Version/Route 文案和乱码均为 0。
- Capacitor sync：成功，6 个插件已同步；`dist/assets` 与 `android/app/src/main/assets/public/assets` 文件名及 SHA-256 一致。
- Playwright：lockfile 和 `node_modules` 均无 Playwright，Edge 虽已安装，但当前页面依赖原生 SQLite，未执行无意义的浏览器假数据回归。
- ADB：`adb devices` 当前无 `device` 状态设备，因此没有安装或操作任何内部/正式 App。
- Gradle：wrapper 尝试联网下载被环境拒绝；使用本地 Gradle 8.14.3 后，指定独立缓存缺少 `com.android.tools.build:gradle:8.13.0` 和 `com.google.gms:google-services:4.4.4`，内部 APK 未构建。
- 因真机和 Android 构建门禁未通过，本轮不创建 `v1.0.0-rc2` 提交或 tag。
## App Shell integration audit

- The web reference renders its page hero from the child template; the base template owns only the brand header, content mount, bottom navigation, and overlay root. Django template inheritance emits the child hero once.
- The direct port previously rendered a generic `BEER JOURNAL` heading in `shell()` around route content. Beer and tasting form routes already had their own `screen-heading`, so the hero appeared twice.
- `shell()` now adds a fallback route heading only when route content has no `h1`; routes that already own a hero are not wrapped with another hero. The App Shell itself has no route title.
- Bottom navigation remains fixed. `#route-content.app-content` is the scroll surface and reserves `--bottom-nav-height + safe-area + 24px`; no body-level duplicate padding is added.
- Boundary: `index.html` owns the shell only; `app.js` route renderers own one hero, back control, and page body; `#overlay-root` owns overlays only.

## RC2 内部包 Shell 真机回归（2026-07-18）

- 内部包：`com.mybeerjournal.app.v1test`，versionCode 23，versionName `1.0.0-rc2-internal`；正式包 `com.mybeerjournal.app` 未安装、未操作。
- 构建资源：`index-B888YLFn.js` / `index-CvqwqQxJ.css`；dist 与 Android assets 的 JS SHA-256 均为 `377419E66EFDA140CF861E53AE77BDDAFDB714ECBC9B8D820B357A4DE6A5077F`。
- UI hierarchy 实测：Beer 列表、新建 Beer、饮用记录列表、个人数据均各有一个 Header、一个 route content 和三个底部导航项；新建 Beer 只有一个 `NEW BEER`、一个 H1、一个副标题和一个返回按钮。
- Filter Sheet 和 CountryPicker 已实际打开并截图；CountryPicker 位于筛选浮层之上，底层内容未切换路由。
- 新建 Beer 表单可以通过滚动把“保存啤酒”按钮移到固定底栏上方；顶部静止时底栏会覆盖中段字段，回归截图将该现象记录为需要继续修复的移动端布局阻塞，未在本轮修改代码。
- 由于内部包数据库为空，Beer 详情/编辑及 Tasting 详情/编辑无法取得有效记录，本轮对应截图为未执行占位，不标记为通过。
- 本轮截图目录：`mobile/tests/android/.artifacts/shell-regression/`；完整 logcat 保存为 `logcat.txt`。清空日志后重启内部包，未发现 FATAL EXCEPTION、E/AndroidRuntime、SQLiteException、TAG_ID_INVALID、database is locked、console.error 或 unhandled rejection。

### 截图逐项结果

| 文件 | 结果 | 说明 |
|---|---|---|
| `beer-list.png` | 通过 | Header、列表空状态和底部导航单实例 |
| `beer-new-top.png` | 需要修复 | 标题结构通过；固定底栏在顶部静止画面覆盖中段字段 |
| `beer-new-bottom.png` | 通过 | 可滚动到表单底部；保存按钮可移至底栏上方 |
| `tasting-list.png` | 通过 | PRIVATE DIARY、统计卡和空状态正常 |
| `tasting-new-top.png` | 通过 | NEW TASTING 与返回入口各一次 |
| `tasting-new-bottom.png` | 通过 | 表单可滚动 |
| `stats.png` | 通过 | MY BEER PROFILE 与统计区正常 |
| `filter-sheet.png` | 通过 | 筛选面板可见，分类/国家/标签/排序/重置/应用均存在 |
| `country-picker.png` | 通过 | 国家列表浮层位于筛选面板之上 |
| `beer-edit.png`、`beer-detail.png` | 未执行 | 内部包为空，未能取得有效 Beer 记录 |
| `tasting-edit.png`、`tasting-detail.png` | 未执行 | 内部包为空，未能取得有效 Tasting 记录 |
| `trash.png`、`backup.png` | 通过（页面入口） | 个人数据页的数据管理入口可见并可打开；未执行真实数据恢复闭环 |

## RC2 Shell 收尾：结构性底栏修复（2026-07-18）

本轮只处理全局 Shell 的两个阻塞项：固定底栏覆盖表单，以及 Beer/Tasting 详情和编辑路线需要真实数据才能验证。

### Shell 边界

- `mobile/web/index.html` 现在由单一 `.app-shell` 承载 Header、`#route-content`、底部导航和 `#overlay-root`。
- `mobile/web/assets/app.css` 将 Shell 改为 `auto / minmax(0, 1fr) / auto` 三行布局；`#route-content` 是唯一滚动面，底部导航使用独立布局行，不再使用 `position: fixed` 覆盖内容。
- `mobile/web/assets/local.css` 不再给 `#route-content` 叠加底栏高度补偿；仅保留 24px 末端安全间距，safe-area 由滚动区和导航行各自承担一次。
- `app.js` 继续只替换 `#route-content`，Header、Logo、底栏和 Overlay Root 保持单例。

### 离线必要差异

网页参考版的底栏使用固定层；Android 离线版使用独立底栏布局行。这是为了让 WebView 中的表单和详情内容拥有真实可见高度，避免静止页面被底栏遮挡。Overlay Root 使用绝对定位，不参与网格隐式行。

### 本轮验证状态

- 53 项 Node 测试：通过。
- Vite production build：通过，生成 `dist/assets/index-Ce2lvQ3N.js`、`dist/assets/index-3oepLfww.css`。
- Capacitor sync：通过，6 个原生插件已同步，Android assets 已更新。
- Gradle/ADB 真机回归：当前 Codex 环境未完成；ADB 未发现 `device` 状态设备，Gradle 直接构建受到宿主文件权限/缓存限制。详情和编辑路线因此待宿主设备可用后验证，不将占位截图标记为通过。
## RC2 Shell 回归补充（2026-07-18）

本轮用宿主脚本生成并覆盖安装内部包后，完成 Beer/Tasting 正常 UI 闭环。网页参考版的页面 hero 仍由路由页面负责；离线 App 使用独立的三行 Shell 布局（Header / 可滚动 route-content / Bottom Navigation），这是为 Android WebView 避免固定底栏覆盖表单的必要差异。

实际设备测量：`.app-shell` 三行高度为 `93.67px / 694.33px / 102px`，route-content 的 `scrollHeight` 大于 `clientHeight`，底栏位于滚动区下方而非覆盖层。Beer 新建、Beer 详情/编辑、Tasting 详情/编辑均只保留一个 Shell、一个 Header、一个 route-content 和一个底栏；日期五列打开后自动滚动到保存值。

本轮截图和 logcat 位于 `mobile/tests/android/.artifacts/shell-regression-v2/`。本轮未修改产品代码、未操作正式包、未生成正式 RC2、未提交 Git。
## RC2 Shell regression final note (2026-07-19)

The internal RC2 package was rebuilt and installed as `com.mybeerjournal.app.v1test`. The current Vite bundle is `index-DBBJ5SKF.js` with CSS `index-BTLKIJP1.css`; both copies in `mobile/dist` and Android `assets/public` have identical SHA-256 values. The Shell uses a three-row grid (header, scrollable route content, navigation), so the navigation owns layout space instead of overlaying forms. Beer and Tasting detail/edit routes were exercised; the Tasting edit submit boundary now resolves `tasting.beer_id` before calling the existing repository update. The five-column date picker restored the saved value after render, and keyboard open/close left the route scroll area usable. No formal RC2 APK was generated and no Git commit was made.
## 1.0 release status

The web reference remains a read-only behavior and visual reference. The released Android app uses the local SQLite/Filesystem boundary and does not connect to the production Django service. The direct port is frozen for 1.0; follow-up candidates are listed in `docs/ROADMAP.md`.
