# Beer Journal beta4 质量门禁报告

## 最新宿主脚本门禁复核（2026-07-17）

### 标签对象契约修复（本地验证）

- `TagRepository` 已统一使用显式 SQL 字段和 canonical mapper；关系表的 `tag_id` 只在关系对象内部使用。
- 已加入 `assertValidTag`，缺少合法 UUID、名称或规范化名称时在 Repository 边界失败，不向界面暴露 SQL。
- Node 全量测试 47/47 通过；JS/MJS 语法检查通过；Vite production build 通过；生产 bundle 未包含生产域名或浏览器测试适配器。
- `git diff --check` 通过；未执行 Capacitor sync，未构建新的 APK，未操作正式包。
- 真机复测尚未执行，当前状态为“代码验证通过，等待宿主脚本构建后的定向门禁”。

### 门禁结论修正（2026-07-17 19:39）

本轮真实设备验证发现标签编辑保存失败：`beer_flavor_tags` 查询结果包含 `tag_id` 而非 `id`，导致 `TAG_ID_INVALID`，事务回滚并提示“标签保存失败，请重试”。因此标签删除/新增/编辑持久化尚未通过，beta4 发布门禁保持 **未通过**。本轮未修改业务代码；待修复后需重新执行标签流程及完整质量门禁。

### 结果

- 内部包 `com.mybeerjournal.app.beta4test` 覆盖安装成功，`versionCode=20`、`versionName=1.0.0-beta4`；第二次覆盖后的 `lastUpdateTime=2026-07-17 19:31:47`，数据目录未变化。
- dist 与 Android assets 的 `index-CfoiqnR5.js` SHA-256 一致，包含 `beer_id` 查询参数保留修复和 `[data-beer-form], [data-tasting-form]` 提交监听修复。
- 既有 Beer 与标签保留且无重复；Schema 仍为 3。
- 新增 Tasting 成功，Beer 关联正确；编辑后地点、瓶数、笔记和详情回显正确，Beer 详情统计同步为 1 次、3 瓶。
- Filter Sheet、分类/标签筛选、活动胶囊删除、重置、CountryPicker 层级和返回键通过。
- 强制停止重启和第二次 `adb install -r` 后 Beer、Tasting、标签、评分、备注仍保留。

### Logcat 门禁

覆盖升级前后核心日志中以下严重错误均为 0：FATAL EXCEPTION、SQLiteException、constraint failed、database is locked、No available connection、plugin_lookup、unhandled rejection。标签编辑复核日志另有 2 条 Capacitor Console error，原因为标签保存失败并回滚；AndroidRuntime 未出现致命异常。

### 结论

beta4 完整原生质量门禁未通过：标签编辑/删除/新增持久化仍需修复后重测。当前不生成用户候选 APK、不提交 Git、不进入照片阶段；本轮未修改业务代码。

## 独立测试包实际复核（2026-07-17）

### 已验证

- 独立测试包与正式包使用不同 `dataDir`，覆盖安装未改变首次安装时间。
- SQLite 原生桥成功注册并初始化 `beer_journal`，目标 Schema 3；启动日志无严重 SQLite 或 AndroidRuntime 错误。
- Beer 新建、韩国、大类/风格、三项评分、两个自定义标签和个人感想保存成功，重启后仍保留。
- 新增路由测试后 Node 自动测试 45/45 通过，JavaScript 语法检查和 Vite 构建通过。

### 发现与修复

1. `readRoute` 丢弃查询参数，导致 `/tastings/new?beer_id=...` 回到选择页；新增 `readRouteWithQuery`。
2. submit 监听原本只匹配 `[data-beer-form]`，导致 Tasting 表单走浏览器默认提交；现已同时匹配 `[data-tasting-form]`。

### 未完成门禁

修复后的 bundle 尚未同步进 Android 生成目录，宿主权限执行在工具审查阶段中断。因此尚未在修复包上确认 Tasting 保存、筛选 Sheet/CountryPicker、返回键、强制停止恢复、覆盖升级和完整 logcat 扫描。

结论：当前不得判定 beta4 门禁通过，也不生成用户候选 APK；不修改生产服务器、正式包或数据库。

更新时间：2026-07-17

## 已完成的本地质量检查

- Node 自动测试：44/44 通过
- JavaScript 语法检查：通过
- `git diff --check`：通过
- Vite 生产构建：通过
- Vite 测试构建：通过
- Playwright/Edge 三种手机宽度 UI 测试：通过
- 33 张 UI 截图已逐张检查（包含分类和风格选择器）

## 真机门禁状态

| 检查 | 结果 |
|---|---|
| ADB 设备 | 已连接 `d493b240`，Android 16 |
| 独立测试包 | 未安装；尚未生成 APK |
| Capacitor sync | 失败：Android assets 写入 EPERM |
| Gradle debug build | 失败：缺少 Gradle 8.14.3，网络下载被拒绝 |
| SQLite 原生桥 | 未执行 |
| Schema 3 首次初始化 | 未执行 |
| Beer/标签/筛选流程 | 未执行 |
| Android 返回键与强制停止恢复 | 未执行 |
| 覆盖升级数据保留 | 未执行 |

## 结论

beta4 真机质量门禁未通过。当前阻塞是本机 Android 工程写权限和 Gradle 发行包获取问题，不代表业务测试失败。没有生成供用户手动安装的 APK，没有提交 Git，没有修改生产服务器或正式应用数据。

恢复条件：允许本机写入 `mobile/android/app/src/main/assets/public`，并使 Gradle 8.14.3 可用；之后再执行独立测试包的 ADB 自动安装和完整门禁。

## 构建环境修复结果（2026-07-17）

- 已找到本地 Gradle 8.14.3 分发目录，并用 --offline --version 验证成功。
- Gradle Wrapper 的 distributionUrl 仍保持官方 8.14.3-all，未修改项目构建版本。
- assets/public 已安全备份并恢复原路径；Capacitor sync 仍因删除生成目录时 EPERM 失败。
- 未构建、未安装内部测试 APK；未执行真机 SQLite 或业务门禁。

当前唯一阻塞项：当前执行环境无法对 mobile/android/app/src/main/assets/public 执行删除/重建操作。

## 构建环境修复结果（2026-07-17）

- 本地 Gradle 8.14.3 已找到并离线版本验证通过。
- Gradle Wrapper 配置保持不变，未降级 Gradle/AGP。
- Capacitor sync 仍失败于 assets/public 的 EPERM；没有继续构建 APK。
- 旧 Android 项目 Gradle 缓存已保留在带时间戳备份目录；未删除完整缓存。
- 真机仍仅连接 ADB，未安装内部测试包，未执行 SQLite 或业务门禁。

当前唯一阻塞项：当前执行环境无法让 Capacitor 对生成目录执行删除/重建。

## 宿主权限修复后复核（2026-07-17）

- Vite 内部构建：通过。
- Capacitor sync：仍失败，准确操作为删除 android/app/src/main/assets/public，错误为 EPERM；更新 capacitor.plugins.json 也被拒绝。
- Gradle 8.14.3：本地分发已存在，可离线运行版本检查；本轮未继续构建 APK。
- 已提供 scripts/beta4-native-gate.ps1，供普通 Windows PowerShell 在宿主权限上下文中一次完成内部构建、sync、ADB 安装和正式包状态校验。
- beta4 真机 SQLite/标签/筛选门禁：未执行。

结论：当前唯一阻塞项是 Codex 沙箱对 Android 生成目录的删除/重建限制。
## 标签契约修复后门禁结果（2026-07-17）

本轮仅复测标签、筛选、浮层和持久化，没有修改业务代码、数据库或正式包。内部包版本为 `1.0.0-beta4 (20)`，bundle 为 `index-BV1vffQM.js`；dist、Android assets 哈希一致，正式包未被操作。

真机结果：Citrus/NativeTest 删除、Malt 新增、再次恢复 Citrus、编辑回显、搜索和标签筛选均通过；Beer、Tasting、Schema 3 数据在强制停止和第二次覆盖安装后保留。返回键按键盘→CountryPicker→Filter Sheet 顺序处理，底层路由不变。严重 logcat 项均为 0。

自动测试 47/47 通过，`git diff --check` 通过。Playwright 三视口本轮未通过：`mobile/package.json` 未声明依赖，运行环境缺少 `playwright-core`，因此记录为环境阻塞，不宣称通过。

最终门禁：**未通过（仅因 Playwright 环境阻塞）**。不生成用户候选 APK，不提交 Git，不进入照片阶段。
