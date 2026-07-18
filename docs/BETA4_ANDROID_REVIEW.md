# Beer Journal beta4 Android 质量门禁记录

## 最新宿主脚本门禁复核（2026-07-17）

### 标签对象契约修复（本地验证，2026-07-17）

- 修复 `mobile/web/assets/tag-repository.js`：所有 Tag 查询改为显式字段映射，关系查询保留独立 `tag_id`，不再把关系行当作 Tag 对象。
- 新增 `mapTagRow` 与 `assertValidTag`，统一验证 `id`、`name`、`normalized_name`；set、list、search、usage count 等方法统一返回 canonical Tag。
- 增加了真实复现路径的删除/新增/恢复、重复去重、关系行 `tag_id` 映射和无效对象回归测试。
- 本地 Node 测试 47/47 通过，所有前端 JS/MJS 语法检查通过，Vite production build 通过，生产 bundle 未发现 `mybeerjournal.com` 或测试适配器导入。
- `mobile/capacitor.config.json` 末尾空行已修复，`git diff --check` 通过。
- 尚未执行新的 Capacitor sync、APK 构建或真机复测；需宿主脚本覆盖安装后重新验证标签编辑流程。

### 本轮标签编辑复核（2026-07-17 19:39）

- 在内部包 `versionCode=20` 上实际执行了 Beer 编辑页的标签删除、添加和保存流程。
- UI 可以删除 `Citrus` 并加入 `Malt`，但点击“保存修改”后出现“标签保存失败，请重试”，事务回滚，页面仍停留在编辑页。
- logcat 显示 `beer_flavor_tags` 查询只返回 `tag_id`，而当前写入流程随后按 `tag.id` 校验，触发 `TAG_ID_INVALID`；本轮未修改代码。
- 因此“标签编辑/删除/新增并持久化”门禁项为 **未通过**，不能将 beta4 判定为完整发布门禁通过。
- 证据日志：`beta4-tag-save-logcat-latest.txt`。此前 Beer/Tasting、筛选、浮层、返回键、强制停止和覆盖安装数据保留仍按前文记录通过。

- 内部包 `com.mybeerjournal.app.beta4test`：`versionCode=20`、`versionName=1.0.0-beta4`；本轮第二次覆盖安装后的 `lastUpdateTime=2026-07-17 19:31:47`，`dataDir` 仍为 `/data/user/0/com.mybeerjournal.app.beta4test`。
- 正式包 `com.mybeerjournal.app` 未安装、未清除、未卸载、未覆盖。
- `mobile/dist/assets/index-CfoiqnR5.js` 与 `android/app/src/main/assets/public/assets/index-CfoiqnR5.js` SHA-256 相同；bundle 确认包含 `beer_id` 查询参数保留逻辑和 Tasting submit 监听修复。
- 覆盖安装后既有 Beer 保留：韩国、拉格、淡色拉格、8.0、三项体验评分、Citrus/NativeTest 标签和备注均正常显示；无重复 Beer。
- Tasting 已真实新增 1 条、编辑并回显：容量 330 ml、瓶数由 2 改为 3、地点和笔记更新；Beer 详情实时显示饮用次数 1、总瓶数 3、最近饮用时间。
- Filter Sheet：分类、标签、应用、活动筛选胶囊删除和重置均通过；Sheet 可见，footer 可见，底部导航 `pointer-events:none`。
- CountryPicker：在 Filter Sheet 上方（z-index 1100）正常显示，韩国可选；返回键在键盘收起后先关闭 CountryPicker，再关闭 Filter Sheet，底层路由保持不变。
- 强制停止并重启后 Beer、Tasting、标签、评分和备注均保留；第二次 `adb install -r` 后 `dataDir` 和 `firstInstallTime` 不变，数据仍保留。
- 覆盖升级前后核心 logcat 严重错误计数为 0；本轮标签编辑日志另有 2 条 Capacitor Console error，内容为标签保存失败并触发回滚，详见本节上方。

当前结论：Beer/Tasting、筛选、浮层、返回键、强制停止和覆盖升级门禁通过；标签编辑/删除/新增持久化未通过，因此 beta4 完整发布门禁未通过。未生成用户候选 APK，未提交 Git，未进入照片阶段。

## 独立测试包门禁复核（2026-07-17）

- 宿主权限修复后 Capacitor sync 成功，SQLite、App、Splash Screen、Status Bar 4 个原生插件均已注册。
- `com.mybeerjournal.app.beta4test` 已通过 `adb install -r` 覆盖安装，`versionCode=20`、`versionName=1.0.0-beta4`，数据目录独立于正式包。
- 正式包 `com.mybeerjournal.app` 未被安装、清除、卸载或覆盖操作。
- 真机启动日志确认 CapacitorSQLite、`createConnection`、`open` 和 Schema 3 表初始化正常；未发现连接、锁、约束或 AndroidRuntime 致命错误。
- Beer 新建流程真实通过：韩国、拉格、淡色拉格、三项五选项评分、NativeTest/Citrus 标签和个人感想保存成功；重启后列表仍保留。
- 复现并修复两个真实前端缺陷：路由规范化丢失 `beer_id` 查询参数；Tasting 表单未被全局提交监听接收。修复已通过 45 项 Node 测试并生成 Vite bundle。
- 修复后的第二个 bundle 尚未能再次写入 Android 生成目录，原因是本轮宿主权限执行在工具审查阶段中断；Tasting 提交、筛选、返回键、强制停止恢复和覆盖升级尚未在修复包上完成。

当前结论：beta4 真机质量门禁仍未通过，不得发布用户候选 APK。

更新时间：2026-07-17

## 本机环境

- SDK：`C:\Users\EDY\AppData\Local\Android\Sdk`
- ADB：37.0.0
- Emulator：36.6.11
- JDK：21.0.9
- WHPX 硬件加速：可用
- `sdkmanager/avdmanager`：缺失；系统镜像和 AVD：缺失

## 真实手机连接

- ADB 设备：`d493b240`
- 型号：`23127PN0CC`
- Android：16
- `com.mybeerjournal.app.beta4test`：未安装
- 正式包 `com.mybeerjournal.app`：未安装、未卸载、未清除数据

## 独立测试包隔离

`mobile/android/app/build.gradle` 增加了仅在 `-Pbeta4Test=true` 时生效的条件：

- 测试 applicationId：`com.mybeerjournal.app.beta4test`
- 默认 applicationId 仍为：`com.mybeerjournal.app`

因此测试包会使用独立 Android 应用数据目录，不会读取或覆盖正式包 SQLite。

## 本轮阻塞点

1. Vite 已成功生成临时内部 bundle，但 Capacitor sync 写入 `android/app/src/main/assets/public` 时被本机文件权限拒绝（EPERM）。
2. Gradle 构建发现本机缺少 Gradle 8.14.3，下载发行包时网络连接被拒绝。
3. 因此没有生成或安装独立测试 APK，无法执行原生 SQLite、Schema 3、标签、筛选、返回键、强制停止恢复和截图门禁。

本轮未修改数据库、未连接生产服务器、未操作正式应用数据，也未提交 Git。

## 环境修复复核（2026-07-17）

- 原 assets/public 已安全重命名为带时间戳的备份，并恢复回原路径；没有删除源码或整个 Android 工程。
- 目录无只读属性、无符号链接、无占用的 Java/Node/Gradle/Android Studio 进程。
- 针对目录授予 EDY 修改权限的操作被当前系统权限拒绝；Capacitor sync 仍在删除生成目录时返回 EPERM。
- 本机已找到完整 Gradle 8.14.3：C:\Users\EDY\.gradle\wrapper\dists\gradle-8.14.3-all\10utluxaxniiv4wxiphsi49nj\gradle-8.14.3。
- 直接执行本地 Gradle 的 --offline --version 成功；版本为 8.14.3，JDK 21.0.9。
- Wrapper 自身仍尝试联网；没有修改 gradle-wrapper.properties。

当前唯一阻塞项是 Android 工程生成目录的 Windows 写/删除权限。

## 构建环境修复结果（2026-07-17）

- 已找到完整本地 Gradle 8.14.3：C:\Users\EDY\.gradle\wrapper\dists\gradle-8.14.3-all\10utluxaxniiv4wxiphsi49nj\gradle-8.14.3。
- 直接执行本地 Gradle 的 --offline --version 成功，JDK 为 21.0.9。
- wrapper.properties 仍要求官方 gradle-8.14.3-all.zip；未修改。
- Wrapper 的缓存标记存在（.ok/.sha256），没有发现 .part 或 .tmp。
- assets/public 已安全备份并恢复；目录权限修改被系统拒绝，Capacitor sync 仍在删除该目录时返回 EPERM。
- 为避免 Android 项目缓存锁继续失败，旧的 mobile/android/.gradle 已保留为带时间戳备份；新的项目缓存尝试可写入 D:\BEER-JORNAL\.gradle-run，但离线配置随后缺少可解析的 AGP/Google Services 依赖。

当前唯一阻塞项仍是生成目录的 Windows 写/删除权限；未生成 APK，未安装测试包。

## 宿主权限修复后复核（2026-07-17）

- Vite 内部构建成功，输出到临时内部目录。
- Capacitor sync 仍在删除 android/app/src/main/assets/public 时返回 EPERM；同时更新 capacitor.plugins.json 也被拒绝。
- 因此判断为当前 Codex 沙箱限制，不能继续反复修改 ACL。
- 已生成普通 Windows PowerShell 一键脚本：scripts/beta4-native-gate.ps1。
- 脚本会构建内部 bundle、临时切换 webDir、执行 sync、使用本地 Gradle 8.14.3 离线构建，并通过 ADB 安装 beta4test；结束后恢复 capacitor.config.json，且校验正式包状态不变。
- 本轮未生成用户候选 APK，未安装内部测试包，未执行真机门禁。
## 标签契约修复后的真机复测（2026-07-17 20:20）

- 内部包：`com.mybeerjournal.app.beta4test`，`versionCode=20`，`versionName=1.0.0-beta4`。
- `lastUpdateTime=2026-07-17 20:19:21`；`dataDir` 与首次安装时间保持不变；正式包 `com.mybeerjournal.app` 未安装或操作。
- Vite 与 Android assets 均使用 `index-BV1vffQM.js`，SHA-256 均为 `BB85B919C9A4D545350C08CD7D6F46886C764C18F255D16600B1E2A6AE608D18`；APK 内存在同名 bundle。
- 既有 Beer、Tasting、韩国/拉格/淡色拉格、评分和备注均保留；SQLite 启动日志显示 `createConnection(version=3)`，打开后查询 `schema_migrations` 和全部本地表，未发生迁移错误。
- 标签流程通过：Citrus、NativeTest 回显；删除 Citrus、增加 Malt、保存；详情只显示 NativeTest/Malt；再次增加 Citrus 后显示 Citrus/NativeTest/Malt，未出现重复或 `TAG_ID_INVALID`。
- 标签搜索和 Filter Sheet 通过；Malt 选择、应用、重新打开回显、清除和重置均通过。CountryPicker 位于 Filter Sheet 上方；返回键在键盘收起后先关闭 CountryPicker，再关闭 Filter Sheet，底层路由不变。
- 强制停止重启和第二次 `adb install -r` 后数据、标签关系和 Tasting 仍保留；`firstInstallTime` 未变。
- Logcat：`TAG_ID_INVALID`、SQLiteException、constraint failed、database locked、No available connection、plugin_lookup、FATAL EXCEPTION、console.error、unhandled rejection 均为 0。仅有系统 `baseline.prof` 缺失提示，不属于应用错误。
- Node 自动测试 47/47 通过。Playwright 三视口本轮未能执行：项目未声明 Playwright，当前 node_modules 缺少 `playwright-core`，且不在本轮修改生产依赖。

当前结论：标签契约和真机定向流程通过；由于 Playwright 门禁环境阻塞，beta4 完整门禁暂不判定通过。
