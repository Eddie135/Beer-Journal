# Local-first v1.0 功能对齐审计

> 本文是 Local-first v1.0 的 P0 审计基线，不是实现计划之外的业务代码变更。网页端只读参考工作树：`D:\BEER-JORNAL-WEB-REFERENCE`。

## 1. 基准版本与审计边界

通过 Git 历史确认，网页端最后一个完整可用版本是：

```text
cf1651dccbfd181bb6cafe8d2161c6dcc1a636f8  feat: finalize f2.3 audit fixes
```

证据：`34d5482 feat: add offline local app shell` 的父提交就是 `cf1651d`；`34d5482` 移除了 `mobile/capacitor.config.json` 中的 `server.url`，并开始把 APK 改为加载本地资源。因此 `cf1651d` 是“开始 Local-first 改造之前”的网页端基准，而不是凭功能名称猜测的提交。

只读参考工作树已创建：

```text
D:\BEER-JORNAL-WEB-REFERENCE
```

该工作树处于 detached HEAD 的 `cf1651d`，本轮没有在其中开发或提交。

审计依据：

- `core/models.py`、`core/forms.py`、`core/views.py`、`core/countries.py`、`core/photo_service.py`
- `config/urls.py`
- `templates/` 全部 Beer/Tasting/个人数据模板
- `core/static/css/app.css`、`core/static/js/app.js`、PWA 静态资源
- `core/tests.py`
- `core/management/commands/seed_admin_demo.py`
- 当前 `mobile/web/` 的 SQLite schema、Repository、路由和 App Shell

### 运行限制

按要求尝试在参考工作树使用本地 Docker Compose 启动网页端。Docker 能读取 Compose 配置，但构建 `python:3.13-slim` 时因 Docker Desktop 没有可用的 HTTPS 代理而无法从 Cloudfront 拉取镜像；本机也没有可用的 Python 命令。因此本轮没有实际启动旧网页、没有写入数据库、没有导入演示数据。页面行为以固定提交中的源码、模板、测试和 `seed_admin_demo` 为准，不能把未运行的页面标记为真机或用户验收通过。

## 2. 网页端页面和路由清单

网页端基准实际包含：

- `/`：重定向到我的啤酒。
- `/beers/`：收藏列表、搜索、筛选、排序、收藏概览、空状态、添加 FAB。
- `/beers/add/`：啤酒资料录入；保存后进入首次品饮选择。
- `/beers/<uuid>/first-tasting/`：选择“添加本次品饮”或“稍后添加”。
- `/beers/<uuid>/`：啤酒收藏档案、照片、长期评分、风味标签、历史品饮时间线。
- `/beers/<uuid>/edit/`：编辑资料、标签、照片。
- `/beers/<uuid>/tastings/add/`：已有啤酒再次品饮。
- `/tastings/`：饮用记录时间线、统计、全部/最近30天/本年度/历史筛选、添加 FAB。
- `/tastings/add/`：选择已有啤酒；支持名称搜索，也可进入创建新啤酒。
- `/tastings/<uuid>/`：饮酒日记详情和 Action Sheet。
- `/tastings/<uuid>/edit/`：编辑饮用时间、地点、价格、评分、笔记、照片。
- `/personal/`：我的啤酒画像、偏好、分布、近12个月趋势、花费、最近记录、退出登录。
- `/trash/`：已删除 Beer/Tasting 和恢复入口（旧网页保留，当前产品 UI 曾要求隐藏入口，但数据恢复路由仍存在）。
- `/photos/<uuid>/display/`、`/photos/<uuid>/thumbnail/`：登录保护的应用内照片读取。
- `/manifest.json`、`/service-worker.js`、`/health/`：公开 PWA/健康资源。

### 演示数据和自动测试基准

`core/management/commands/seed_admin_demo.py` 的演示数据是对照网页的重要验收样本：3 款不同国家的 Beer（中国、德国、美国），覆盖淡色拉格、IPA、小麦啤酒；4 个 FlavorTag（水果/树脂/麦芽类别）；同一 Sierra Nevada 有 2 条 Tasting，Weihenstephaner 有 1 条 Tasting；还建立香气、味道、口感 3 个动态 RatingDimension，并为品饮记录建立食物搭配/饮用场景 TastingTag。网页端 `core/tests.py` 覆盖登录保护、模型约束、Beer/Tasting 独立记录、标签去重、筛选排序、首次品饮、照片重编码/删除、软删除恢复、个人统计和时间线等场景。后续本地版应把这些样本转换为 SQLite fixture 或 Repository 测试数据，而不是把 Django 作为运行依赖。

## 3. 五选项评分规则（必须原样迁移）

网页端使用 `TypedChoiceField + RadioSelect`，不是数字输入框，也不是可自由输入的星级。每个字段都有一个“未填写”选项，随后是五个固定选项；选中后通过单选控件回显，详情和卡片用 `★`/`☆` 展示，筛选按存储值筛选。

| 字段 | 存储值与准确文字 | 选中/详情展示 | 筛选行为 |
|---|---|---|---|
| `mouthfeel_score` | `1 清爽`、`2 偏清爽`、`3 平衡`、`4 偏醇厚`、`5 醇厚` | 两端文案“清爽 — 醇厚”；例如值 4 显示 `★★★★☆` | 按 1–5 筛选；旧 `mouthfeel_profile` 的 `crisp/light/balanced/medium/full` 分别兼容映射到 1/2/3/3/5 |
| `bitterness_score` | `1 淡`、`2 微苦`、`3 平衡`、`4 偏苦`、`5 苦` | 两端文案“淡 — 苦”；例如值 3 显示 `★★★☆☆` | 按 1–5 筛选 |
| `flavor_complexity_score` | `1 简单`、`2 较简单`、`3 平衡`、`4 较复杂`、`5 复杂` | 两端文案“简单 — 复杂”；例如值 5 显示 `★★★★★` | 详情和画像展示；收藏筛选没有把它另设为固定条件 |

实现细节：

- 表单控件由 `star_score_field()` 生成，选项值是整数 1–5，空值为 `None`。
- 详情页通过 `Beer.mouthfeel_stars`、`bitterness_stars`、`flavor_complexity_stars` 生成五格显示。
- 收藏卡片只显示简短的“口/苦/味”摘要，避免卡片信息过载。
- 评分是 Beer 的长期资料，不覆盖单次 Tasting；Tasting 的总评分仍是 0–10、0.5 步进的十进制值。

本地版当前把三个 Beer 评分渲染为 `input type="number"`，这是明确的错误简化；后续应建立统一的 `FiveOptionRating` 组件，不能自行改成另一套星级交互。

## 4. 功能对齐矩阵

“本地版状态”只使用约定的状态值；“真机状态”单独记录，自动测试不等同于真机或用户验收。

| 功能 | 旧版代码位置 | 旧版行为 | 本地版状态 | 缺失内容 | 计划修改文件 | 真机状态 |
|---|---|---|---|---|---|---|
| 我的啤酒列表 | `core/views.py:beer_list`、`templates/beer_list.html` | 服务端查询有效 Beer，显示封面、状态、国家、名称、品牌、分类、评分、体验摘要、最多3个标签、品饮次数 | 部分实现 | 无照片封面、无标签、无体验摘要、无状态标签，查询能力较简化 | `mobile/web/assets/app.js`、`beer-repository.js`、`local.css` | 未执行 |
| 添加啤酒 | `CreateBeerTastingForm`、`beer_form.html` | Beer 字段按固定顺序填写，保存后进入首次品饮选择 | 部分实现 | 缺少标签和照片；评分控件错误；字段顺序/分组未完全对齐 | `app.js`、`beer-repository.js` | 未执行 |
| 啤酒详情 | `beer_detail`、`beer_detail.html` | Hero 照片、基础资料、摘要、三项长期评分、标签、历史时间线、再次品饮 | 部分实现 | 缺照片、标签、三项固定选项展示，历史内容较少 | `app.js`、Repository、`local.css` | 未执行 |
| 编辑啤酒 | `edit_beer`、`beer_edit.html` | 顶部已有照片、新增多图、资料和标签回显，保存替换标签 | 部分实现 | 无照片/标签；评分不是五选项；回显不完整 | `app.js`、Repository | 未执行 |
| 删除啤酒 | `delete_beer`、`trash.html` | 二次确认后软删除，可在回收站恢复 | 代码完成 | 本地没有恢复入口和回收站页面；需确认是否仅隐藏 UI、仍保留恢复能力 | `app.js`、Repository、必要时新增本地恢复页 | 未执行 |
| 饮用记录列表 | `tasting_list`、`tasting_list.html` | 时间线、图片、啤酒信息、日期、评分、容量×瓶数、笔记、顶部统计和时间筛选 | 部分实现 | 无照片；缺全部/30天/本年度/历史筛选和顶部统计 | `app.js`、`tasting-repository.js` | 未执行 |
| 新增饮用记录 | `start_tasting`、`tasting_select.html`、`tasting_create.html` | 先搜索选择 Beer，再填写完整单次记录和多图 | 部分实现 | 选择页样式/搜索较简；无照片；未完整复刻旧字段和控件 | `app.js`、`tasting-repository.js` | 未执行 |
| 饮用记录详情 | `tasting_detail`、`tasting_detail.html` | 日记 Hero、大图、评分、笔记、饮用信息、图集、Action Sheet | 部分实现 | 无照片图集；Action Sheet 内容和展示层级不完整 | `app.js`、`local.css` | 未执行 |
| 编辑饮用记录 | `edit_tasting`、`tasting_edit.html` | 编辑时间、地点、价格、总评分、笔记；保留并删除已有照片 | 部分实现 | 无照片和删除照片；日期仍是基础控件；字段视觉未完全对齐 | `app.js`、Repository | 未执行 |
| 首次品饮流程 | `create_beer_tasting`、`beer_first_tasting` | 先保存 Beer，不创建空 Tasting；Action Sheet 选择稍后或完整首次品饮 | 代码完成 | 业务主路径已存在；缺旧版完整字段/照片 | `app.js`、`tasting-repository.js` | 未执行 |
| 国家选择 | `CountrySelect`、`core/static/js/app.js` | 中文名、英文名、代码、国旗，搜索和最近选择，添加/编辑/筛选统一 | 代码完成 | 当前数据/文案编码质量需修复并用完整源验证；最近选择未完全对齐 | `countries.js`、`app.js` | 未执行 |
| 啤酒大类 | `category` 字段、选择 Sheet 增强 | 两级 BeerCategory → BeerStyle，Style 随大类联动 | 部分实现 | 本地使用字符串，未完全采用旧版查询/联动规则 | `app.js`、Repository | 未执行 |
| 啤酒风格 | `style` 字段、`StyleSelect` | 显示“大类 · 小类型”，编辑回显，服务端验证归属 | 部分实现 | 缺持久化分类实体查询和服务端同等约束 | `schema.mjs`、`beer-repository.js`、`app.js` | 未执行 |
| 总体评分 | `overall_score`、`DailyTastingForm` | Tasting 0–10，0.5 步进，十进制保存 | 部分实现 | 本地输入步进和校验未完全按旧版固定为 0.5 | `tasting-repository.js`、`app.js` | 未执行 |
| 口感评分 | `mouthfeel_score`、Beer 表单/详情 | 五选项 RadioSelect，固定文字和星格详情展示 | 部分实现 | 本地是数字输入，缺五选项组件和准确文字 | `app.js`、新增 `FiveOptionRating` 组件 | 未执行 |
| 苦味评分 | `bitterness_score`、Beer 表单/详情 | 五选项 RadioSelect，淡—苦两端 | 部分实现 | 同上；当前不能保证旧值回显语义 | `app.js`、新增 `FiveOptionRating` 组件 | 未执行 |
| 风味复杂度评分 | `flavor_complexity_score`、Beer 表单/详情 | 五选项 RadioSelect，简单—复杂两端 | 部分实现 | 本地数字输入，详情没有旧版展示 | `app.js`、新增 `FiveOptionRating` 组件 | 未执行 |
| 自定义标签 | `FlavorTag`、`BeerFlavorTag`、`CreateBeerTastingForm` | 逗号/顿号自由输入，多标签、规范化去重、编辑回显、详情/卡片/搜索/筛选 | 未实现 | 本地虽有表和关联表，但 Repository/页面没有读写和查询 | `schema.mjs`、`beer-repository.js`、`app.js` | 未执行 |
| 图片上传 | `photo_service.py`、`Photo`、各表单 | JPEG/PNG/WebP 多图；解码、旋转、压缩、WebP 重编码、缩略图 | 未实现 | 本地只有未完成的 `photos` 表，没有文件系统、压缩、校验或 Repository | 新增本地 PhotoRepository/文件服务、`app.js` | 未执行 |
| 已有图片 | `beer_edit.html`、`tasting_detail.html` | Beer 以最新有效 Tasting 汇总封面，详情显示图集 | 未实现 | 没有从本地文件读取或展示 | `app.js`、PhotoRepository | 未执行 |
| 图片删除 | `delete_photo`、`tasting_edit.html` | 登录保护、事务删除记录并清理展示图/缩略图 | 未实现 | 没有文件清理和孤儿文件策略 | PhotoRepository、文件存储模块 | 未执行 |
| 列表封面 | `beer_list.html` | 最新有效 Tasting 的第一张照片作为封面，无图占位 | 未实现 | 本地卡片没有图片查询和占位规则 | `beer-repository.js`、`app.js` | 未执行 |
| 详情图集 | `beer_detail.html`、`tasting_detail.html` | 时间线首图和详情更多照片 | 未实现 | 没有图集读取 | `app.js`、PhotoRepository | 未执行 |
| 饮用记录照片 | `DailyTastingForm`、`TastingEditForm` | 创建/编辑均可多图，保存后缩略图可用 | 未实现 | 本地 Tasting 表单没有照片控件 | `app.js`、PhotoRepository | 未执行 |
| 搜索 | `beer_list`、`start_tasting` | Beer 名称、品牌、酒厂、国家代码/中文名、风味标签；选 Beer 按名称搜索 | 部分实现 | 本地不搜标签；Tasting 搜索字段和旧版不完全一致 | `beer-repository.js`、`tasting-repository.js` | 未执行 |
| 筛选 | `beer_list` | 大类、风格、国家、口感、风味标签、平均评分范围 | 部分实现 | 本地只有大类、国家、总体评分范围；缺风格/口感/标签，且评分来源错误 | `beer-repository.js`、`app.js` | 未执行 |
| 排序 | `beer_list` | 最近品饮、平均评分、品饮次数，无品饮记录靠后 | 未实现 | 本地固定名称排序，没有服务端等价排序 | `beer-repository.js`、`app.js` | 未执行 |
| 个人数据 | `personal_data`、`personal_data.html` | 画像、偏好、国家/大类/风格分布、近12月趋势、风味云、花费、最近记录、退出 | 部分实现 | 只有少量数字卡片，缺全部偏好、图表、趋势、花费和最近记录 | `tasting-repository.js`、`beer-repository.js`、`app.js` | 未执行 |
| 基础统计 | `core/views.py:personal_data` | Beer 数、有效 Tasting 数、平均评分、ABV、Plato、价格等，排除软删除 | 部分实现 | 仅计算 Beer 数、Tasting 数、瓶数、国家数、两个平均值，缺完整聚合 | `beer-repository.js`、`tasting-repository.js`、`app.js` | 未执行 |
| 返回箭头 | 各二级模板 `back-link` | 编辑、详情、选择、记录等二级页面统一返回 | 代码完成 | 页面层级比旧版少，需逐页核对目标返回路径 | `app.js` | 未执行 |
| Android 返回键 | `core/static/js/app.js` | 先关闭键盘/浮层，再路由返回，根页面双击退出 | 代码完成 | 已有 Overlay Manager，但无真机验收证据 | `app.js`、`overlay-manager.mjs` | 未执行 |
| Bottom Sheet | `enhanceSelect`、日期/筛选 Sheet | 国家、分类、风格、日期、筛选均为 App 风格 Sheet | 部分实现 | 本地有国家/分类/风格/筛选 Sheet，日期仍是 `datetime-local`，缺旧版滚轮 | `app.js`、`local.css` | 未执行 |
| Action Sheet | `tasting_detail.html`、旧版 JS | 查看、编辑、删除、取消；嵌套确认按层关闭 | 部分实现 | 本地仅部分 Tasting 操作，缺完整统一层级和内容 | `app.js`、`overlay-manager.mjs` | 未执行 |
| 空状态 | 各列表模板 | 收藏、品饮、选择页分别提供上下文文案和下一步按钮 | 代码完成 | 文案/页面覆盖需按旧版逐项复刻 | `app.js`、`local.css` | 未执行 |
| 加载状态 | 旧版服务器请求和模板状态 | 网页依赖请求返回；静态资源有渐进加载 | 部分实现 | 本地有数据库初始化中/失败状态，但没有旧版图片渐进加载和各页面加载态 | `app.js`、`local.css` | 未执行 |
| 错误状态 | 表单 errors、404、PhotoProcessingError | 错误回显不丢表单；照片失败不创建半成品记录 | 部分实现 | 本地多为 alert，缺字段级错误和照片事务失败清理 | `app.js`、Repository | 未执行 |

## 5. 网页端字段与交互基准

### Beer 长期资料

旧版 Beer 字段顺序为：啤酒名称、品牌、酒厂、国家、BeerCategory、BeerStyle、ABV、Plato、口感五选项、苦味五选项、风味复杂度五选项、风味标签。模型还保留 `ibu`、`color_ebc`、旧 `mouthfeel_profile`、`catalog_notes` 等历史/资料字段。品牌和酒厂是按规范化名称、国家和地区复用的实体，不是简单的自由文本快照。

### Tasting 单次记录

旧版日常记录字段为：品饮时间（自定义日期滚轮）、地点、总体评分（0–10，0.5 步进）、品饮笔记、容量、瓶数、购买渠道（线上/线下/赠送）、价格、多张照片。每次记录独立创建，编辑不覆盖同 Beer 的其他记录。

### 标签

FlavorTag 是 Beer 长期资料，用户可以自由输入多个标签，使用逗号或顿号分隔；规范化名称唯一，编辑时先删除当前 Beer 的关联再按规范化结果重建关联。旧 TastingTag 仍保留历史食物搭配/饮用场景数据，但最终日常 Tasting 表单已隐藏这些输入，不能误删历史模型。

### 照片

照片只属于 Tasting。上传前实际解码、限制大小和像素、旋转并重新编码为 WebP，同时生成缩略图；保存失败不能留下半条 Tasting 或孤儿文件。Beer 列表/详情通过有效 Tasting 汇总封面和图集。

## 6. 当前本地版的主要简化或错误

当前 `mobile/web/assets/app.js` 和两个 Repository 已经具备 SQLite、软删除、Beer/Tasting 基本 CRUD、首次品饮 Sheet、固定 App Shell、Overlay Manager 和本地 CountryPicker，但仍不是网页端等价迁移：

1. Beer 卡片无图片、标签、状态和三项体验摘要，列表查询按名称排序。
2. Beer 表单把五选项评分简化为三个数字输入，缺准确的五个文案、回显和端点描述。
3. FlavorTag/BeerFlavorTag 只有部分 schema，未接入创建、编辑、详情、搜索、筛选。
4. `photos` 表存在，但没有本地文件存储、实际压缩、预览、删除、图集或封面逻辑。
5. Tasting 列表/详情/编辑缺完整时间筛选、照片和旧版日记层级。
6. Beer 列表筛选缺 BeerStyle、口感、FlavorTag；评分范围当前直接使用 Beer 总体评分，而旧版按有效 Tasting 平均评分。
7. 缺最近品饮/平均评分/品饮次数三种排序及无记录靠后规则。
8. 个人数据页仅有少量数字卡片，缺偏好、分布、近12个月趋势、风味云、花费和最近记录。
9. 日期时间仍是原生 `datetime-local`，没有旧版自定义滚轮 Sheet。
10. 当前工作树中仍可见部分乱码字符串；这属于本地版质量问题，必须在真正搬迁前单独清理，不能把网页端乱码当作产品基准。

## 7. 建议搬迁批次（等待确认后执行）

### P0-1：字段和控件对齐

- 固定 Beer/Tasting 字段顺序、必填规则、缩放单位和 0.5 步进总评分。
- 新增统一 `FiveOptionRating`，原样实现三组五选项、编辑回显和详情星格。
- 保持 SQLite schema version 2，不重建数据库；如需字段变化，先单独设计并迁移。

### P0-2：Beer 标签和收藏查询

- 完成 FlavorTag/BeerFlavorTag Repository 事务写入、规范化去重、编辑回显、详情/卡片显示。
- 把旧版搜索、六类筛选和三类排序迁移到 SQLite 查询层，统计只看未删除 Tasting。
- 复刻 Beer 列表卡片、状态标签、封面占位和详情摘要。

### P0-3：本地照片闭环

- 设计本地文件目录和 PhotoRepository；照片记录只保存相对路径键。
- 迁移旧版的解码、像素/大小限制、WebP 展示图和缩略图、多图预览、删除清理、封面汇总。
- 先补失败回滚和孤儿文件检查，再接入 Beer/Tasting 页面。

### P0-4：Tasting 完整日记

- 复刻选择 Beer、搜索、创建新 Beer 入口、完整新增/编辑/详情/Action Sheet。
- 加入自定义日期滚轮、时间筛选、照片、多条历史排序和 Beer 详情联动。
- 保证首次品饮不自动生成空记录，删除/编辑立即刷新统计。

### P0-5：个人数据对齐

- 将旧版服务端统计转换为本地 SQL 聚合：画像、三项体验评分、国家/大类/风格/标签偏好、分布、12 个月趋势、花费、最近记录。
- 所有统计排除软删除 Beer/Tasting，并加入 Repository 测试。

### P0-6：视觉和真机验收

- 以旧版最终 CSS/模板布局为视觉基准，逐页核对间距、卡片、Sheet、Action Sheet、空/加载/错误态。
- 完成 Android 返回键、锁屏恢复、键盘避让、图片长按限制和固定 App Shell 的真机验收。

## 8. 本轮明确未做的事

- 没有修改 SQLite schema、migration、Repository 或业务代码。
- 没有删除或重建本地数据库。
- 没有连接、修改或部署生产服务器。
- 没有创建 APK、没有提交 Git。
- 没有把自动测试或源码审计写成真机通过/用户验收通过。
