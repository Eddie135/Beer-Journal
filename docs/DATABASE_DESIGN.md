# BEER JOURNAL 数据库设计

文档状态：第一版逻辑设计  
更新日期：2026-07-11  
目标数据库：PostgreSQL 17

## 1. 设计目标

- 严格区分一款啤酒的基本资料和每次实际品饮。
- 支持同一款啤酒的多次独立品饮、多张照片、自定义标签和动态评分维度。
- 让组合筛选、排序、统计、JSON/CSV 导出和完整恢复具有清楚、稳定的含义。
- 用数据库约束保护关键关系，同时保持个人项目的简单度。
- 不提前加入多人、库存、社交、条码和离线同步等尚未确定的模型。

单用户版本不在每张业务表增加 `user_id`。登录使用 Django 内置用户，但所有啤酒数据都属于唯一的应用所有者。未来真要改为多人使用时，再通过迁移统一增加所有者和权限规则。

## 2. 核心关系

```text
BeerStyle 1 ─── N Beer

Beer 1 ─── N Tasting 1 ─── N Photo
 │                 │
 │                 └── 1 ─── N TastingRating N ─── 1 RatingDimension
 │
 └── N ─── M Tag（通过 BeerTag）
```

### 字段归属

| 信息 | 表 | 原因 |
|---|---|---|
| 名称、品牌、酒厂、国家、产区、类型、酒精度 | `beers` | 多次饮用时通常不变 |
| 饮用日期、地点、容量、价格、购买渠道和地点 | `tastings` | 每次饮用可能不同 |
| 品饮感想、总分、多维评分 | `tastings` 及评分关系表 | 每次体验可能不同 |
| 照片 | `photos`，关联 `tastings` | 每次喝酒可能拍不同照片 |
| 标签 | `tags`，通过 `beer_tags` 关联 Beer | 第一版用于描述和筛选一款啤酒 |

高级筛选的主要查询单位是 `Tasting`，再关联显示 `Beer` 信息。这样价格、日期、地点和评分的筛选不会产生“到底是哪一次”的歧义。

## 3. 通用约定

- 主键统一使用应用生成的 UUID，便于导出、恢复和未来数据合并。
- `created_at`、`updated_at` 使用带时区时间，数据库保存 UTC，界面显示 Asia/Shanghai。
- 实际饮用日期使用 `DATE`，避免时区换算导致日期变化。
- 未知或未填写使用 `NULL`；不得用空字符串、0 或“未知”假装有效值。
- 金额和评分使用 `NUMERIC`/十进制，禁止浮点数。
- 文本统一 UTF-8；用户笔记保存纯文本或受控 Markdown，不保存未经清理的 HTML。
- 所有结构变化通过 Django 数据库迁移管理。
- 不用一个巨大的 JSON 字段替代正常关系表；否则约束、筛选和导出都会变得不可靠。
- 表名和内部字段使用英文，用户界面与错误提示使用中文。

## 4. 数据表

### 4.1 `beer_styles`：啤酒类型

用于规范 IPA、Lager、Stout 等类型，同时允许用户以后补充自定义类型。

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
- 已被啤酒使用的类型不能直接删除，只能停用。
- 第一版不建立父子类型层级，避免无实际需求的复杂度。

### 4.2 `beers`：啤酒基本资料

一行代表“一款啤酒”，不代表某次饮用。

| 字段 | 类型 | 规则 | 说明 |
|---|---|---|---|
| `id` | UUID | 主键 | 啤酒 ID |
| `name` | VARCHAR(200) | 必填 | 啤酒名称 |
| `brand_name` | VARCHAR(200) | 可空 | 品牌 |
| `brewery_name` | VARCHAR(200) | 可空 | 酒厂 |
| `origin_country_code` | CHAR(2) | 可空 | ISO 3166-1 两位国家或地区代码 |
| `origin_region` | VARCHAR(120) | 可空 | 州、省、城市或产区 |
| `style_id` | UUID | 可空、外键 | 关联 `beer_styles` |
| `abv` | NUMERIC(5,2) | 可空 | 酒精度百分比，例如 6.50 |
| `catalog_notes` | TEXT | 可空 | 与某次品饮无关的基本说明 |
| `created_at` | TIMESTAMPTZ | 必填 | 创建时间 |
| `updated_at` | TIMESTAMPTZ | 必填 | 更新时间 |
| `deleted_at` | TIMESTAMPTZ | 可空 | 回收站标记；空表示有效 |

约束：

- `name` 去除首尾空格后不能为空。
- `abv` 为空或位于 0.00–100.00。
- 国家代码为空或为两个大写英文字母。
- `style_id` 使用限制删除；被引用的类型只能停用。
- 不对“名称 + 品牌 + 酒厂”设置强唯一约束。年份、批次和同名酒可能合法存在，应用只做疑似重复提示。
- 容量和价格不得放进本表，因为同一款酒可能以不同包装和价格饮用。

第一版把品牌和酒厂保存为文本。以后出现合作酿造、酒厂主页或严重去重需求时，再迁移为独立表。

### 4.3 `tastings`：品饮记录

一行代表一次实际饮用。同一 `beer_id` 可以有任意多行。

| 字段 | 类型 | 规则 | 说明 |
|---|---|---|---|
| `id` | UUID | 主键 | 品饮 ID |
| `beer_id` | UUID | 必填、外键 | 对应啤酒 |
| `tasted_on` | DATE | 必填 | 实际饮用日期 |
| `drinking_location` | VARCHAR(255) | 可空 | 饮用地点 |
| `volume_ml` | INTEGER | 可空 | 本次容量，单位毫升 |
| `price_amount` | NUMERIC(12,2) | 可空 | 本次价格 |
| `currency_code` | CHAR(3) | 默认 CNY | ISO 4217 货币代码 |
| `purchase_channel` | VARCHAR(100) | 可空 | 超市、酒吧、网购、朋友赠送等 |
| `purchase_location` | VARCHAR(255) | 可空 | 商店、平台或具体地点 |
| `notes` | TEXT | 可空 | 本次品饮感想 |
| `overall_score` | NUMERIC(3,1) | 可空 | 用户填写的总体评分 0–10 |
| `created_at` | TIMESTAMPTZ | 必填 | 创建时间 |
| `updated_at` | TIMESTAMPTZ | 必填 | 更新时间 |
| `deleted_at` | TIMESTAMPTZ | 可空 | 回收站标记 |

约束：

- `beer_id` 使用限制删除，不能删除 Beer 时静默级联清除全部品饮历史。
- `volume_ml` 为空或大于 0。
- `price_amount` 为空或大于等于 0。
- `currency_code` 为三个大写英文字母；有价格时必须有货币代码。
- `overall_score` 为空或位于 0.0–10.0；0.5 步进由表单与模型校验，数据库同时保留范围约束。
- 不对未来日期设置数据库硬限制，界面可以提示，避免时区或预先录入造成无法保存。
- 第一版不保存 `overall_score_method`，因为总分明确由用户手工填写，不做自动加权。

价格筛选必须限定同一货币。第一版默认使用人民币 CNY，不进行汇率换算。

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

### 4.5 `tags`：标签

| 字段 | 类型 | 规则 | 说明 |
|---|---|---|---|
| `id` | UUID | 主键 | 标签 ID |
| `name` | VARCHAR(80) | 必填 | 显示名称 |
| `normalized_name` | VARCHAR(80) | 必填、唯一 | 规范化名称 |
| `created_at` | TIMESTAMPTZ | 必填 | 创建时间 |

`normalized_name` 由去首尾空格并统一大小写得到，避免 `IPA`、`ipa` 和带空格的重复标签。删除一个未使用标签不会删除任何啤酒。

### 4.6 `beer_tags`：啤酒与标签关系

| 字段 | 类型 | 规则 |
|---|---|---|
| `beer_id` | UUID | 外键，删除 Beer 时级联删除关系 |
| `tag_id` | UUID | 外键，删除 Tag 时级联删除关系 |
| `created_at` | TIMESTAMPTZ | 必填 |

联合唯一键为 `(beer_id, tag_id)`，保证同一标签不会重复添加到同一啤酒。

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

## 6. 索引

数据量较小时不建立大量复合索引。第一版建议：

### Beer

- 有效记录上的规范化名称或 `lower(name)`；
- `lower(brand_name)`、`lower(brewery_name)`；
- `origin_country_code`、`style_id`、`abv`。

### Tasting

- 有效记录上的 `(beer_id, tasted_on DESC, created_at DESC)`；
- `tasted_on DESC`；
- 非空 `overall_score`；
- 非空 `price_amount` 与 `currency_code`。

### 关系

- `beer_tags(tag_id, beer_id)`；
- `tasting_rating_values(dimension_id, value, tasting_id)`；
- `photos(tasting_id, sort_order, created_at)`。

普通 B-tree 不能有效优化“任意位置包含关键词”的模糊搜索。个人数据量在数千条时直接使用不区分大小写的包含查询即可；只有实际测量变慢后，才考虑 PostgreSQL `pg_trgm` 和 GIN 索引。

## 7. 组合筛选语义

- 查询以有效 `Tasting` 为主，关联有效 `Beer`、类型和标签。
- 名称、品牌、酒厂、国家、类型、标签和酒精度来自 Beer。
- 总体评分、价格、饮用日期、容量和地点来自 Tasting。
- 不同类别之间使用 AND；同一多选类别内部使用 OR。
- 多标签第一版采用“包含任一所选标签”；若以后需要“同时包含全部”，必须在界面明确切换。
- 价格比较必须限定同一货币；未填写值不参加区间筛选。
- 动态维度筛选以后可通过评分值关系查询，无需改表结构；第一版必做筛选只要求总体评分。

排序定义：

- 日期：`tasted_on`，再按创建时间和 ID 保证稳定；
- 评分：`overall_score`，空值排最后；
- 名称：关联 Beer 的 `name`；
- 价格：`price_amount`，空值排最后，并限定货币。

## 8. 统计口径

- 啤酒款数：有效 Beer 数量。
- 品饮次数：有效 Tasting 数量。
- 国家或地区数量：至少关联一条有效 Tasting 的 Beer 中，非空国家代码去重数量。
- 最常喝类型：按有效 Tasting 次数聚合，不按 Beer 款数。
- 平均评分：有效且 `overall_score` 非空的 Tasting 平均值。
- 每月记录数：按 `tasted_on` 月份统计有效 Tasting。
- 某款啤酒平均分：该 Beer 的有效且有分 Tasting 平均值。
- 最新品饮：按 `tasted_on`、`created_at` 和 ID 的稳定倒序取第一条。

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

### JSON

完整 JSON 顶层至少包含：

```text
schema_version
exported_at
application_version
beer_styles
beers
tastings
photos
tags
beer_tags
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
beers.csv
tastings.csv
photos.csv
tags.csv
beer_tags.csv
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

- 酒厂、品牌独立表与合作酿造关系；
- 品饮级场景标签；
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

- `breweries`、`brands` 和合作酿造关系；
- `purchases` 与库存；
- `beer_identifiers` 条形码和外部 ID；
- 多套、带版本的评分方案；
- 品饮级标签；
- 照片原图和更多尺寸；
- 经纬度与地图；
- 多用户 `owner_id`；
- 离线同步版本和冲突解决字段；
- 年份、批次和桶陈版本模型。

不得为了不确定的未来功能预先添加无定义的 `extra_data JSONB`。有清楚需求后通过可测试的数据库迁移增加字段或关系更安全。
