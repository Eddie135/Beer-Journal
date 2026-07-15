# BEER JOURNAL 数据库设计

文档状态：v2.0 逻辑设计已确认，待迁移实现
更新日期：2026-07-12
目标数据库：PostgreSQL 17

## 1. 设计目标

- 严格区分一款啤酒的基本资料和每次实际品饮。
- 支持同一款啤酒的多次独立品饮、多张照片、自定义标签和动态评分维度。
- 让组合筛选、排序、统计、JSON/CSV 导出和完整恢复具有清楚、稳定的含义。
- 用数据库约束保护关键关系，同时保持个人项目的简单度。
- 不提前加入多人、库存、社交、条码和离线同步等尚未确定的模型。
- Beer 作为长期个人资料库中的“啤酒实体”，保存可跨多次品饮复用的规格、来源和配方信息；Tasting 只保存一次实际饮用的事实与体验。

单用户版本不在每张业务表增加 `user_id`。登录使用 Django 内置用户，但所有啤酒数据都属于唯一的应用所有者。未来真要改为多人使用时，再通过迁移统一增加所有者和权限规则。

## 2. 核心关系

```text
BeerCategory 1 ─── N BeerStyle 1 ─── N Beer

Brewery 1 ─── N Beer
Brand 1 ─── N Beer

Beer 1 ─── N Tasting 1 ─── N Photo
 │                 │
 │                 └── 1 ─── N TastingRating N ─── 1 RatingDimension
 │
 ├── N ─── M Hop（通过 BeerHop）
 ├── N ─── M Malt（通过 BeerMalt）
 └── N ─── M FlavorTag（通过 BeerFlavorTag）

Tasting N ─── M TastingTag（食物搭配、饮用场景等）
```

### 字段归属

| 信息 | 表 | 原因 |
|---|---|---|
| 名称、品牌、酒厂、国家、产区、两级类型、ABV、IBU、颜色、Plato、口感档案、酒花、麦芽、风味标签 | `beers` 及其关系表 | 代表这款啤酒的长期资料，多次饮用时复用 |
| 饮用时间、地点、容量、饮用瓶数、价格、购买渠道和地点 | `tastings` | 每次饮用可能不同 |
| 品饮感想、总体评分、多维评分 | `tastings` 及评分关系表 | 每次体验可能不同；v2.0 新 UI 只录入总体评分 |
| 照片 | `photos`，关联 `tastings` | 每次喝酒可能拍不同照片 |
| 食物搭配、饮用场景 | `tasting_tags`，通过关系表关联 Tasting | 保留历史兼容；v2.0 新 UI 不再录入 |

品牌和酒厂不是简单的自由标签：它们是可复用、可合并、可筛选的来源实体，建议使用独立的 `brands`、`breweries` 表，由 Beer 通过外键关联。国家使用标准代码，地区保留可搜索的文本；不要把国家、地区、品牌或酒厂塞进通用标签。

酒花和麦芽也不是标签。它们是配方/原料资料，分别使用规范化的 `hops`、`malts` 表及 Beer 的多对多关系；关系表可保存添加阶段、用量或备注等可选信息。风味标签则使用带类别的标签系统，允许“柑橘”“松脂”“焦糖”等多个值，并与酒花/麦芽严格区分。

高级筛选的主要查询单位是 `Tasting`，再关联显示 `Beer` 信息。这样价格、日期、地点和评分的筛选不会产生“到底是哪一次”的歧义。

## 3. 通用约定

- 主键统一使用应用生成的 UUID，便于导出、恢复和未来数据合并。
- `created_at`、`updated_at` 使用带时区时间，数据库保存 UTC，界面显示 Asia/Shanghai。
- 实际饮用时间使用 `TIMESTAMPTZ`，数据库保存 UTC、界面按 Asia/Shanghai 显示；按日统计时先转换到用户时区。
- 未知或未填写使用 `NULL`；不得用空字符串、0 或“未知”假装有效值。
- 金额和评分使用 `NUMERIC`/十进制，禁止浮点数。
- 文本统一 UTF-8；用户笔记保存纯文本或受控 Markdown，不保存未经清理的 HTML。
- 所有结构变化通过 Django 数据库迁移管理。
- 不用一个巨大的 JSON 字段替代正常关系表；否则约束、筛选和导出都会变得不可靠。
- 表名和内部字段使用英文，用户界面与错误提示使用中文。

## 4. 数据表

### 4.1 `beer_categories` 与 `beer_styles`：两级啤酒分类

分类采用固定两级，而不是让 Beer 直接挂在一个混合的类型列表中：`BeerCategory` 保存大类，`BeerStyle` 保存具体风格。Beer 仍只关联具体 `BeerStyle`，因此现有 Beer 的外键含义保持稳定。

`beer_categories` 字段：`id`、`name`、`normalized_name`（唯一）、`code`（唯一，如 `lager`、`ale`）、`sort_order`、`is_active`、时间戳。首批显示数据为“拉格”“艾尔”，内部稳定代码分别为 `lager`、`ale`；以后新增大类必须通过迁移/管理流程明确决定。

`beer_styles` 在原有字段基础上增加：

| 字段 | 类型 | 规则 | 说明 |
|---|---|---|---|
| `category_id` | UUID | 必填、外键、限制删除 | 所属 BeerCategory |

| 字段 | 类型 | 规则 | 说明 |
|---|---|---|---|
| `id` | UUID | 主键 | 稳定 ID |
| `name` | VARCHAR(120) | 必填 | 中文或常见显示名称 |
| `normalized_name` | VARCHAR(120) | 必填、唯一 | 去首尾空格并统一大小写后的名称 |
| `description` | TEXT | 可空 | 可选说明 |
| `sort_order` | SMALLINT | 默认 0 | 显示顺序 |
| `is_active` | BOOLEAN | 默认 true | 是否允许用于新记录 |
| `created_at` | TIMESTAMPTZ | 必填 | 创建时间 |
| `updated_at` | TIMESTAMPTZ | 必填 | 更新时间 |

规则：

- `name` 去除首尾空格后不能为空。
- 已被啤酒使用的类型不能直接删除，只能停用；唯一例外是受控数据迁移先完整改指向替代类型后再删除旧类型。
- v2.0 明确采用两级结构：拉格下包含皮尔森、淡色拉格、黑拉格；艾尔下包含 IPA、小麦啤酒、世涛。分类的中文显示名称可调整，但稳定 `code` 不能随意改写。旧的泛称小类 “Lager” 会先将所有关联 Beer 改指向“淡色拉格”，再物理删除。

### 4.2 `beers`：啤酒基本资料

一行代表“一款啤酒”，不代表某次饮用。

| 字段 | 类型 | 规则 | 说明 |
|---|---|---|---|
| `id` | UUID | 主键 | 啤酒 ID |
| `name` | VARCHAR(200) | 必填 | 啤酒名称 |
| `brand_id` | UUID | 可空、外键 | 关联可复用的品牌 |
| `brewery_id` | UUID | 可空、外键 | 关联可复用的酒厂 |
| `origin_country_code` | CHAR(2) | 可空 | ISO 3166-1 两位国家或地区代码 |
| `origin_region` | VARCHAR(120) | 可空 | 州、省、城市或产区 |
| `style_id` | UUID | 可空、外键 | 关联 `beer_styles` |
| `abv` | NUMERIC(5,2) | 可空 | 酒精度百分比，例如 6.50 |
| `ibu` | NUMERIC(6,2) | 可空、历史兼容 | 苦度 IBU；保留原值，但不在日常 UI 展示或编辑，不能据此自动推导主观苦度星级 |
| `color_ebc` | NUMERIC(6,2) | 可空 | 颜色的 EBC 数值；展示层可换算 SRM |
| `plato` | NUMERIC(5,2) | 可空 | 麦汁浓度（°P）；未知为 NULL |
| `mouthfeel_profile` | VARCHAR(20) | 可空、历史兼容 | 旧版口感档案；保留原值，不在日常 UI 展示或编辑 |
| `mouthfeel_score` | SMALLINT | 可空、1–5 | 长期主观口感：1 清爽、3 平衡、5 醇厚 |
| `bitterness_score` | SMALLINT | 可空、1–5 | 长期主观苦度：1 淡、3 平衡、5 苦；不由 IBU 自动换算 |
| `flavor_complexity_score` | SMALLINT | 可空、1–5 | 长期主观风味复杂度：1 简单、3 平衡、5 复杂 |
| `catalog_notes` | TEXT | 可空 | 与某次品饮无关的基本说明 |
| `created_at` | TIMESTAMPTZ | 必填 | 创建时间 |
| `updated_at` | TIMESTAMPTZ | 必填 | 更新时间 |
| `deleted_at` | TIMESTAMPTZ | 可空 | 回收站标记；空表示有效 |

约束：

- `name` 去除首尾空格后不能为空。
- `abv` 为空或位于 0.00–100.00。
- 国家代码为空或为两个大写英文字母。
- `style_id`、`brand_id`、`brewery_id` 使用限制删除；被引用的实体不能静默删除。
- `abv` 为空或位于 0.00–100.00；`ibu`、`color_ebc`、`plato` 为空或大于等于 0。
- 三项长期体验评分为空或介于 1–5 的整数；它们属于 Beer，不替代 Tasting 的总体评分或风味标签。
- `mouthfeel_profile` 只为历史兼容保留；迁移时 `crisp`、`light` 映射为口感 1、2，`balanced`、`medium` 映射为 3，`full` 映射为 5，但不会覆盖已经填写的新评分。
- 不对“名称 + 品牌 + 酒厂”设置强唯一约束。年份、批次和同名酒可能合法存在，应用只做疑似重复提示。
- 容量和价格不得放进本表，因为同一款酒可能以不同包装和价格饮用。

品牌、酒厂、酒花和麦芽均不使用 Beer 内的逗号分隔文本；它们通过独立实体和关系表保存，避免同义词、拼写差异和筛选失真。

### 4.2.1 `breweries` 与 `brands`：来源实体

两张表都至少包含 `id`、`name`、`normalized_name`、`country_code`、`region`、`notes`、`created_at`、`updated_at`、`deleted_at`。`normalized_name` 用于去重提示，不做绝对唯一，以容纳同名实体。Beer 的 `brewery_id` 和 `brand_id` 可为空，因为包装资料可能只有部分来源信息；合作酿造等复杂关系暂不扩展为多对多，确认真实需求后再迁移。

### 4.2.2 `hops`、`malts` 及 Beer 原料关系

`hops` 与 `malts` 各自保存 `id`、`name`、`normalized_name`、`notes` 和时间戳。Beer 通过 `beer_hops`、`beer_malts` 关联它们；关系表至少包含 `beer_id`、原料 ID、`sort_order`、`notes`，可选保存 `addition_stage` 或 `amount_text`。没有可靠配方时保持空值，不用“未知”标签伪造信息。

### 4.3 `tastings`：品饮记录

一行代表一次实际饮用。同一 `beer_id` 可以有任意多行。

| 字段 | 类型 | 规则 | 说明 |
|---|---|---|---|
| `id` | UUID | 主键 | 品饮 ID |
| `beer_id` | UUID | 必填、外键 | 对应啤酒 |
| `tasted_at` | TIMESTAMPTZ | 必填 | 实际饮用日期和时间；界面可只填写日期并补当天默认时间 |
| `drinking_location` | VARCHAR(255) | 可空 | 饮用地点 |
| `capacity` | INTEGER | 可空 | 本次容量，单位毫升；由旧 `volume_ml` 重命名迁移 |
| `bottle_count` | NUMERIC(5,2) | 可空 | 本次实际饮用的瓶/罐数量；允许半瓶等非整数 |
| `price_amount` | NUMERIC(12,2) | 可空 | 本次价格 |
| `currency_code` | CHAR(3) | 默认 CNY | ISO 4217 货币代码 |
| `purchase_channel` | VARCHAR(100) | 可空 | `online`、`offline`、`gift`；历史旧值按迁移规则保留或映射 |
| `purchase_location` | VARCHAR(255) | 可空 | 商店、平台或具体地点 |
| `notes` | TEXT | 可空 | 本次品饮感想 |
| `overall_score` | NUMERIC(3,1) | 可空 | 用户填写的总体评分 0–10 |
| `created_at` | TIMESTAMPTZ | 必填 | 创建时间 |
| `updated_at` | TIMESTAMPTZ | 必填 | 更新时间 |
| `deleted_at` | TIMESTAMPTZ | 可空 | 回收站标记 |

约束：

- `beer_id` 使用限制删除，不能删除 Beer 时静默级联清除全部品饮历史。
- `capacity` 为空或大于 0；`bottle_count` 为空或大于 0。
- `price_amount` 为空或大于等于 0。
- `currency_code` 为三个大写英文字母；有价格时必须有货币代码。
- `overall_score` 为空或位于 0.0–10.0；0.5 步进由表单与模型校验，数据库同时保留范围约束。
- 不对未来时间设置数据库硬限制，界面可以提示，避免时区或预先录入造成无法保存。
- 第一版不保存 `overall_score_method`，因为总分明确由用户手工填写，不做自动加权。

价格筛选必须限定同一货币。第一版默认使用人民币 CNY，不进行汇率换算。

食物搭配和饮用场景不做固定列。它们属于一次 Tasting，可通过 `tasting_tags` 和关系表记录“烧烤”“海鲜”“独饮”“聚会”等多个值；v2.0 只保留历史读取与导出兼容，不再在新建、编辑或再次品饮 UI 中写入。若需要补充细节，使用 `notes`。

### 4.3.1 `tasting_tags` 与 `tasting_tag_links`：品饮级标签

品饮级标签独立于 Beer 风味标签。标签至少包含 `id`、`name`、`normalized_name`、`category`（`food_pairing` 或 `occasion`）、`created_at`；关系表保存 `tasting_id`、`tag_id` 和 `created_at`，并以 `(tasting_id, tag_id)` 为联合唯一键。这样同一款酒在不同场合可以拥有不同搭配和场景，而不会污染 Beer 的长期资料。

### 4.4 `photos`：品饮照片

| 字段 | 类型 | 规则 | 说明 |
|---|---|---|---|
| `id` | UUID | 主键 | 照片 ID |
| `tasting_id` | UUID | 必填、外键 | 所属品饮 |
| `storage_key` | VARCHAR(500) | 必填、唯一 | 展示图相对存储路径 |
| `thumbnail_key` | VARCHAR(500) | 必填、唯一 | 缩略图相对存储路径 |
| `original_filename` | VARCHAR(255) | 可空 | 上传时文件名，仅供显示 |
| `mime_type` | VARCHAR(100) | 必填 | 重新编码后的真实类型 |
| `byte_size` | BIGINT | 必填 | 展示图大小 |
| `width` | INTEGER | 必填 | 展示图宽度 |
| `height` | INTEGER | 必填 | 展示图高度 |
| `sort_order` | SMALLINT | 默认 0 | 同一次品饮中的顺序 |
| `checksum_sha256` | CHAR(64) | 可空 | 完整性校验；可在备份阶段补齐 |
| `created_at` | TIMESTAMPTZ | 必填 | 创建时间 |

规则：

- `tasting_id` 在永久删除品饮时级联删除照片数据库记录。
- 数据库级联不会自动删除磁盘文件；应用必须在提交后安全清理，并提供孤儿文件检查。
- `storage_key` 和 `thumbnail_key` 只保存如 `photos/2026/07/<uuid>.webp` 的相对路径，不保存操作系统绝对路径。
- 原图处理成功后再写正式记录；第一版默认不保留原图。
- `byte_size`、`width`、`height` 必须大于 0，`sort_order` 不能为负。
- 啤酒卡片默认使用最近一次有效品饮的第一张照片作为展示图；第一版不额外开发封面选择模型。

### 4.5 `flavor_tags`：啤酒风味标签

| 字段 | 类型 | 规则 | 说明 |
|---|---|---|---|
| `id` | UUID | 主键 | 标签 ID |
| `name` | VARCHAR(80) | 必填 | 显示名称 |
| `normalized_name` | VARCHAR(80) | 必填、唯一 | 规范化名称 |
| `category` | VARCHAR(40) | 必填 | 水果、香料、烘烤、树脂等风味类别 |
| `created_at` | TIMESTAMPTZ | 必填 | 创建时间 |

`normalized_name` 由 Unicode NFKC 规范化、去首尾空格、合并连续空白并进行大小写折叠得到。用户可在 Beer 表单直接输入一个或多个自定义风味标签；保存时先按 `normalized_name` 查找，存在即复用，不存在才新建。风味标签只描述嗅味/味觉印象，不用来代替啤酒类型、原料、国家或酒厂。删除一个未使用标签不会删除任何啤酒。

标签去重的数据库最终约束仍是 `normalized_name` 唯一；前端仅提供即时提示，不能替代数据库约束。历史标签名称保持原样显示，后续如需合并同义标签，必须提供可审计的迁移工具。

### 4.6 `beer_flavor_tags`：啤酒与风味标签关系

| 字段 | 类型 | 规则 |
|---|---|---|
| `beer_id` | UUID | 外键，删除 Beer 时级联删除关系 |
| `tag_id` | UUID | 外键，删除风味标签时级联删除关系 |
| `created_at` | TIMESTAMPTZ | 必填 |

联合唯一键为 `(beer_id, tag_id)`，保证同一风味标签不会重复添加到同一啤酒。

### 4.7 `rating_dimensions`：评分维度

评分维度不能设计为 `aroma_score`、`flavor_score` 等七个固定列，否则新增或停用维度都需要改数据库结构。

| 字段 | 类型 | 规则 | 说明 |
|---|---|---|---|
| `id` | UUID | 主键 | 维度 ID |
| `code` | VARCHAR(50) | 必填、唯一 | 稳定内部代码 |
| `name` | VARCHAR(80) | 必填 | 中文显示名称 |
| `description` | TEXT | 可空 | 评分说明 |
| `scale_min` | NUMERIC(6,3) | 默认 0 | 最低分 |
| `scale_max` | NUMERIC(6,3) | 默认 10 | 最高分 |
| `step` | NUMERIC(6,3) | 默认 0.5 | 允许步进 |
| `sort_order` | SMALLINT | 默认 0 | 显示顺序 |
| `is_active` | BOOLEAN | 默认 true | 是否用于新品饮 |
| `created_at` | TIMESTAMPTZ | 必填 | 创建时间 |
| `updated_at` | TIMESTAMPTZ | 必填 | 更新时间 |

约束：

- `code` 创建后不修改，只允许小写英文、数字和下划线。
- `scale_min < scale_max`，`step > 0`。
- 已被评分使用的维度不能删除，只能 `is_active = false`。
- 名称可以修改，但旧评分继续显示保存时的名称快照。

初始维度：

| code | name |
|---|---|
| `aroma` | 香气 |
| `flavor` | 味道 |
| `mouthfeel` | 口感 |
| `appearance` | 外观 |
| `finish` | 回味 |
| `balance` | 平衡度 |
| `value` | 性价比 |

### 4.8 `tasting_rating_values`：每次品饮的多维评分

| 字段 | 类型 | 规则 | 说明 |
|---|---|---|---|
| `id` | UUID | 主键 | 评分值 ID |
| `tasting_id` | UUID | 必填、外键 | 所属品饮 |
| `dimension_id` | UUID | 必填、外键 | 评分维度 |
| `value` | NUMERIC(6,3) | 必填 | 实际分数 |
| `dimension_name_snapshot` | VARCHAR(80) | 必填 | 保存时的维度名称 |
| `scale_min_snapshot` | NUMERIC(6,3) | 必填 | 保存时最低分 |
| `scale_max_snapshot` | NUMERIC(6,3) | 必填 | 保存时最高分 |
| `step_snapshot` | NUMERIC(6,3) | 必填 | 保存时步进 |
| `created_at` | TIMESTAMPTZ | 必填 | 创建时间 |
| `updated_at` | TIMESTAMPTZ | 必填 | 更新时间 |

约束：

- `(tasting_id, dimension_id)` 联合唯一，一次品饮对同一维度只能有一个分数。
- 永久删除品饮时级联删除评分值；被历史评分引用的维度限制删除。
- `value` 必须位于快照最小值与最大值之间，并符合当时步进。
- 新增或编辑评分值时在同一事务内复制维度名称和量表快照。

快照用于保护历史含义：以后把“香气”改名、改量表或调整默认步进，已经保存的品饮仍显示当时的定义，不会被悄悄重解释。

## 5. 删除与恢复策略

第一版为 `beers` 和 `tastings` 使用 `deleted_at`：

1. 普通删除只设置 `deleted_at`，记录进入回收站。
2. 列表、搜索、筛选和统计默认只读取 `deleted_at IS NULL`。
3. 恢复时清空 `deleted_at`，评分和照片仍保留。
4. 永久删除 Tasting 时，评分和照片记录级联删除，应用在事务提交后删除实际照片文件。
5. 永久删除 Beer 前，必须明确处理其所有 Tasting；数据库外键禁止静默级联清除整段历史。
6. 永久删除必须二次确认，测试必须覆盖成功、失败和文件清理路径。

这一策略比直接硬删除更安全，适合无法通过读代码判断影响的个人用户。

v2.0 不在主要 App 导航展示回收站，也不删除 `deleted_at` 或恢复能力。软删除数据继续排除在默认列表、饮用记录和个人数据统计之外；恢复入口属于低优先级维护/设置页面。

## 5.1 v2.0 UI 隐藏字段与历史兼容

以下关系和字段不会在 v2.0 日常录入、编辑、详情 UI 或业务流程中出现，但不得删除、清空或更改历史含义：

- `RatingDimension`、`TastingRatingValue` 与评分维度快照；新记录默认只填写 `overall_score`。
- `TastingTag`、`TastingTagLink` 中类别为 `food_pairing`、`occasion` 的历史记录。
- `deleted_at` 与已删除 Beer/Tasting 的恢复状态。

JSON/CSV 导出、备份与恢复仍必须包含上述历史数据。任何未来“永久移除复杂评分或品饮标签”的提议，都需要单独的数据迁移、影响报告和用户二次确认。

## 6. 索引

数据量较小时不建立大量复合索引。第一版建议：

### Beer

- 有效记录上的规范化名称或 `lower(name)`；
- `lower(brand_name)`、`lower(brewery_name)`；
- `origin_country_code`、`style_id`、`abv`。

### Tasting

- 有效记录上的 `(beer_id, tasted_at DESC, created_at DESC)`；
- `tasted_at DESC`；
- 非空 `overall_score`；
- 非空 `price_amount` 与 `currency_code`。

### 关系

- `beer_flavor_tags(tag_id, beer_id)`；
- `beer_hops(hop_id, beer_id)`、`beer_malts(malt_id, beer_id)`；
- `tasting_tag_links(tag_id, tasting_id)`；
- `tasting_rating_values(dimension_id, value, tasting_id)`；
- `photos(tasting_id, sort_order, created_at)`。

普通 B-tree 不能有效优化“任意位置包含关键词”的模糊搜索。个人数据量在数千条时直接使用不区分大小写的包含查询即可；只有实际测量变慢后，才考虑 PostgreSQL `pg_trgm` 和 GIN 索引。

## 7. 组合筛选语义

- 查询以有效 `Tasting` 为主，关联有效 `Beer`、类型和标签。
- 名称、品牌、酒厂、国家、类型、ABV、IBU、颜色、原料和风味标签来自 Beer。
- 总体评分、价格、饮用时间、容量、地点、食物搭配和饮用场景来自 Tasting。
- 不同类别之间使用 AND；同一多选类别内部使用 OR。
- 多标签第一版采用“包含任一所选标签”；若以后需要“同时包含全部”，必须在界面明确切换。
- 价格比较必须限定同一货币；未填写值不参加区间筛选。
- 动态维度筛选以后可通过评分值关系查询，无需改表结构；第一版必做筛选只要求总体评分。

排序定义：

- 日期：`tasted_at`，再按创建时间和 ID 保证稳定；
- 评分：`overall_score`，空值排最后；
- 名称：关联 Beer 的 `name`；
- 价格：`price_amount`，空值排最后，并限定货币。

## 8. 统计口径

- 啤酒款数：有效 Beer 数量。
- 品饮次数：有效 Tasting 数量。
- 国家或地区数量：至少关联一条有效 Tasting 的 Beer 中，非空国家代码去重数量。
- 最常喝类型：按有效 Tasting 次数聚合，不按 Beer 款数。
- 平均评分：有效且 `overall_score` 非空的 Tasting 平均值。
- 每月记录数：按 `tasted_at`（转换为用户时区）月份统计有效 Tasting。
- 某款啤酒平均分：该 Beer 的有效且有分 Tasting 平均值。
- 最新品饮：按 `tasted_at`、`created_at` 和 ID 的稳定倒序取第一条。

回收站记录不进入任何默认统计。

## 9. 写入事务

### 新建啤酒及首次品饮

Beer 和首次 Tasting 必须在同一数据库事务中写入。任何必填、评分或业务校验失败时整体回滚。

### 上传照片

文件系统与数据库不能天然共享同一事务，因此采用补偿流程：

1. 将上传内容写入临时位置并完成全部验证、压缩和缩略图；
2. 原子移动到最终随机路径；
3. 在数据库事务中写入 Photo；
4. 数据库失败时删除刚生成的最终文件；
5. 事务成功后再删除被替换或永久删除的旧文件；
6. 定期运行孤儿文件检查作为最后保护。

## 10. JSON、CSV 与完整备份

### v2.0-A 已实施迁移

- `0002` 创建 `beer_categories`，增加 BeerStyle 分类外键、Beer 的 `plato`/`mouthfeel_profile`、Tasting 的 `bottle_count`，并将 `volume_ml` 无损重命名为 `capacity`。
- `0002` 规范化既有风味标签并合并规范化冲突的关系，映射已知购买渠道旧值；不会删除啤酒、品饮、评分或软删除记录。
- `0003` 补齐拉格/艾尔（稳定代码为 `lager`/`ale`）下的六个规范 BeerStyle；已有非标准历史类型继续保留并归入可用分类，不强行改名。
- `0005` 新增 Beer 的口感、苦度和风味复杂度 1–5 分长期评分；仅从旧 `mouthfeel_profile` 安全映射口感评分，不根据 IBU 生成苦度评分，且不删除旧字段。
- 新字段未知值保持 `NULL`；迁移反向操作不删除已创建的分类和标签，优先保护数据。

### JSON

完整 JSON 顶层至少包含：

```text
schema_version
exported_at
application_version
beer_styles
breweries
brands
hops
malts
beers
beer_hops
beer_malts
tastings
photos
flavor_tags
beer_flavor_tags
tasting_tags
tasting_tag_links
rating_dimensions
tasting_rating_values
```

规则：

- 保留原始 UUID，恢复时不得重新生成。
- 日期和时间使用 ISO 8601。
- 导出评分维度快照和相对照片路径。
- 不包含用户密码、会话、服务器绝对路径、数据库口令或其他秘密。
- 导入前检查 `schema_version`；不兼容版本先执行数据迁移。

### CSV

不能把一对多和多对多关系强塞进一个 CSV。导出包至少分别提供：

```text
breweries.csv
brands.csv
hops.csv
malts.csv
beers.csv
beer_hops.csv
beer_malts.csv
tastings.csv
photos.csv
flavor_tags.csv
beer_flavor_tags.csv
tasting_tags.csv
tasting_tag_links.csv
rating_dimensions.csv
tasting_rating_values.csv
```

CSV 使用 UTF-8 with BOM，方便中文 Windows 表格软件打开。CSV 主要供人工查看，不代替无损 JSON 恢复。

### 完整备份

完整恢复必须同时使用：

- PostgreSQL 逻辑备份；
- 照片卷归档；
- 备份清单与 SHA-256 校验值；
- 应用版本和数据库迁移版本。

## 11. 第一版可推迟与不可裁剪

### 可推迟

- 酒厂、品牌的合作酿造多对多关系；
- 酒花、麦芽及其 Beer 多对多关系（实体定义保留，首版模型暂不创建）；
- 更细的品饮级标签分类；
- 评分方案版本、权重和自动总分；
- 多币种换算；
- 购买、库存、包装和批次模型；
- 地理坐标、地图和外部地点库；
- 原图长期保存、多种展示尺寸和图片去重；
- `pg_trgm` 模糊搜索扩展；
- 条形码及外部数据库 ID。

### 不可裁剪

- Beer 与 Tasting 分表；
- Tasting 一对多照片；
- 标签关系表；
- 动态评分维度、评分值及历史快照；
- 金额与货币分开保存；
- 稳定 UUID、时间戳和相对照片路径；
- 数据库迁移、约束和防误删策略；
- JSON/CSV 导出所需的稳定关系；
- 数据库与照片成套备份。

## 12. 未来扩展方向

有明确需求后，可以通过迁移增加：

- 酒厂、品牌合作酿造多对多关系；
- `purchases` 与库存；
- `beer_identifiers` 条形码和外部 ID；
- 多套、带版本的评分方案；
- 更多品饮级标签分类；
- 照片原图和更多尺寸；
- 经纬度与地图；
- 多用户 `owner_id`；
- 离线同步版本和冲突解决字段；
- 年份、批次和桶陈版本模型。

不得为了不确定的未来功能预先添加无定义的 `extra_data JSONB`。有清楚需求后通过可测试的数据库迁移增加字段或关系更安全。

## 13. 创建 Django 模型前的最终审核

### 13.1 复杂度结论

这份逻辑设计对于“长期个人啤酒数据库”并不过度复杂：Beer/Tasting 分离、评分快照、照片归属和标签关系都直接保护了数据含义。真正可能让第一版失控的是一次性实现所有原料、来源实体、导入、备份和高级筛选。因此第一版采用“核心关系完整、可选资料延后”的实现策略，不删掉长期设计，但不把所有表同时变成页面和管理功能。

### 13.2 第一版必须实现的实体

第一版 Django 模型范围固定为：

1. `BeerStyle`：啤酒类型规范表。
2. `Beer`：名称、来源国家/地区、类型、ABV、IBU、颜色、基本说明和软删除字段；品牌与酒厂先实现为可复用的简单实体外键。
3. `Brand`、`Brewery`：名称、规范化名称、国家/地区和软删除；第一版不实现合作酿造多对多。
4. `Tasting`：Beer 外键、饮用时间、地点、容量、价格、货币、笔记和总体评分；每次记录独立保存。
5. `Photo`：归属 Tasting 的展示图和缩略图路径，包含安全处理所需元数据。
6. `RatingDimension`、`TastingRatingValue`：动态维度、量表快照和每次品饮评分。
7. `FlavorTag`、`BeerFlavorTag`：啤酒风味标签及其多对多关系。
8. `TastingTag`、`TastingTagLink`：食物搭配和饮用场景标签；第一版可使用统一标签表加 `category` 区分。

这些实体足以完成个人数据库的核心录入、重复品饮、照片、评分、风味筛选和历史导出。第一版不要求录入完整配方；未知资料保持 `NULL`。

### 13.3 保留设计但第一版暂不实现的实体或能力

- `Hop`、`Malt` 及 `BeerHop`、`BeerMalt`：保留关系设计，但只有在实际拥有可靠配方数据、需要按原料筛选时再实现；不要用逗号文本替代它们。
- 酒厂/品牌合作酿造多对多、购买/库存、包装/批次和外部地点库。
- 条码、外部资料来源、版本化导入和自动合并。
- 评分权重、自动总分、AI 分析结果和模型版本。
- 原图长期保存、图片去重、地图和全文搜索扩展。

延期这些内容不会破坏 Beer/Tasting 的核心关系；后续通过迁移增加即可。

### 13.4 关系合理性审核

| 关系 | 结论 | 说明 |
|---|---|---|
| Beer → Tasting | 合理且必须 | 一款 Beer 可有多次独立 Tasting，编辑一次不会覆盖历史。 |
| Beer → Brand/Brewery | 合理 | 多款 Beer 可共享一个来源实体；外键可空，避免资料不完整时造假。 |
| Beer ↔ FlavorTag | 合理 | 风味是可多选、可筛选的描述，不替代类型、ABV、IBU 或原料。 |
| Beer ↔ Hop/Malt | 设计合理，首版延后 | 原料是结构化多对多资料，不应实现为标签或逗号文本。 |
| Tasting → Photo | 合理且必须 | 照片属于具体一次饮用，保留不同时间的现场记录。 |
| Tasting ↔ TastingTag | 合理 | 食物搭配和场景随每次体验变化，不能写入 Beer。 |
| Tasting ↔ RatingDimension | 合理且必须 | 评分值带维度和量表快照，停用或改名不会重解释历史。 |

### 13.5 对未来需求的支持能力

- **条码扫描**：新增 `beer_identifiers`（类型、规范化值、来源、Beer 外键）即可，不改变 Beer/Tasting；同一 Beer 可有多个条码或外部 ID。
- **自动获取啤酒资料**：增加资料来源、抓取时间、原始响应摘要和字段确认状态的独立表；外部数据只能作为候选，不能覆盖用户已确认字段。
- **AI 品饮分析**：增加与 Tasting 关联的分析结果表，保存提示版本、模型标识、输入摘要、生成时间和用户是否采纳；不把 AI 输出写回原始笔记或评分。
- **GitHub 开源**：稳定 UUID、迁移、导出格式、相对照片路径和无秘密配置已经有利于开源；需要另行补充许可证、贡献指南、脱敏示例数据和测试夹具。
- **多用户账号**：未来为 Beer、Tasting、Photo、Tag 等用户拥有的数据增加 `owner_id`，并通过迁移和权限策略隔离；当前单用户设计没有把 `user_id` 提前散落到每张表。

结论：先按 13.2 创建核心 Django 模型，13.3 的实体只保留文档设计。本文档状态仍为“待用户确认”，确认后才进入模型实现。

## 14. v1.0 本地 SQLite 设计（L1 审计结果）

v1.0 不复用生产 PostgreSQL，也不迁移生产数据。APK 首次启动创建一个全新的本地 SQLite 数据库；Django 模型是字段含义的来源，SQLite 只是本地持久化实现。

### 14.1 本地表范围

| 本地表 | 主要字段 | 关系与说明 |
|---|---|---|
| `beers` | `id`、`name`、`brand_id`、`brewery_id`、`origin_country_code`、`origin_region`、`style_id`、ABV/Plato 缩放整数、默认容量、三项体验评分、`catalog_notes`、时间戳、`deleted_at`、同步预留字段 | 啤酒长期资料；软删除后默认不显示 |
| `beer_categories` | `id`、`code`、`name`、排序、`is_active`、时间戳 | 拉格/艾尔等大类 |
| `beer_styles` | `id`、`category_id`、`name`、规范化名、排序、`is_active`、时间戳 | 两级分类中的小类 |
| `brands` / `breweries` | `id`、`name`、规范化名、国家、地区、备注、时间戳、`deleted_at` | 可复用来源实体 |
| `flavor_tags` | `id`、`name`、`normalized_name`、`category`、时间戳 | 自定义标签，规范化名唯一 |
| `beer_flavor_tags` | `beer_id`、`tag_id`、时间戳 | Beer 与风味标签多对多 |
| `tastings` | `id`、`beer_id`、`tasted_at`、地点、容量、瓶数、渠道、价格、总评分、笔记、时间戳、`deleted_at`、同步预留字段 | 每次饮用独立记录 |
| `photos` | `id`、`beer_id`、`tasting_id`、本地相对文件键、排序、尺寸、类型、校验值、时间戳、同步预留字段 | 本地照片路径不写绝对路径；v1.0 主要关联 Tasting |
| `settings` | `key`、`value`、时间戳 | 应用设置、首次启动标记、备份信息 |

`photos` 使用“Beer 或 Tasting 恰好一个非空”的约束，为将来保存 Beer 封面预留；第一版业务流程仍优先把照片归属于 Tasting，和当前 Django 规则一致。

### 14.2 SQLite 精度与删除策略

SQLite 没有 PostgreSQL 的 Decimal 类型，因此本地层不使用浮点数保存金额或评分：

- 价格保存为最小货币单位整数（人民币元乘 100）；
- 总评分保存为十分之一整数（例如 8.5 保存为 85）；
- ABV、Plato 保存为百分之一整数；
- 瓶数保存为百分之一整数，容量保存为毫升整数。

所有业务表保留 UUID 文本主键、`created_at`、`updated_at`、`deleted_at`、`sync_status`、`remote_id` 和 `revision`，但 v1.0 不执行同步。删除默认写入 `deleted_at`，清空全部数据必须二次确认。

### 14.3 数据访问层边界

页面不得直接拼接 SQL。L2 起建立 `BeerRepository`、`TastingRepository`、`PhotoRepository` 和 `SettingsRepository`，由统一的 SQLite 适配器负责事务、约束和迁移。v1.1 同步只替换/扩展 Repository 实现，不重写页面。

L1 只记录上述设计并建立前端骨架，不创建 SQLite 表或实现 CRUD。

## 15. v1.0 L2 实现状态

- 已采用 `@capacitor-community/sqlite@8.1.0`，数据库文件名固定为 `beer_journal`，初始 schema 版本为 `1`。
- 已实现 `schema.mjs` 初始迁移：`schema_migrations`、Beer、分类/风格、风味标签、Tasting、Photo 和 Settings 表；迁移使用事务，失败时回滚并保留原数据库。
- 已实现 `BeerRepository`：`createBeer`、`getBeerById`、`listBeers`、`updateBeer`、`softDeleteBeer`、`searchBeers`、`filterBeers`。
- Beer 使用稳定 UUID；v1.0 的 `remote_id`/`owner_id` 为空，创建记录 `sync_status=local`、`revision=1`，修改进入 `pending_update`，软删除进入 `pending_delete`。
- L2 页面已接入名称/品牌/酒厂/国家/风格搜索、分类/国家/评分范围筛选，以及新增、详情、编辑和二次确认软删除。
- 本阶段暂不实现 Tasting CRUD、照片、备份、同步和登录；相关表结构只为后续迁移预留。
