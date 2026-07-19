# RC2 Android Shell Review

日期：2026-07-18  
包范围：仅 `com.mybeerjournal.app.v1test`，正式包未操作。

## 本轮改动

- App Shell 改为 Header / 可滚动 route-content / Bottom Navigation 三行布局。
- route-content 使用 `overflow-y: auto`、`min-height: 0` 和 `100dvh`，底栏不再覆盖字段。
- Overlay Root 绝对定位，不参与 Shell 网格行。
- 未修改 SQLite、Repository、Schema、生产服务器或正式包。
- 真机初检确认 `.app-content` 的 `height:100%` 会在部分 WebView 尺寸变化时阻止网格行收缩；已移除该强制高度，交由 `minmax(0,1fr)` 决定滚动区域高度。

## 自动验证

| 项目 | 结果 |
|---|---|
| Node 全量测试 | 53/53 通过 |
| JS/MJS 语法检查 | 代码检查通过；递归扫描受 node_modules 缺失 Playwright 目录影响，未扫描依赖目录 |
| Vite production build | 通过；JS `index-Ce2lvQ3N.js`，CSS `index-3oepLfww.css` |
| Capacitor sync | 通过；6 个原生插件注册 |
| Gradle | 未完成：宿主 Gradle 缓存/锁文件权限阻塞 |
| ADB 真机 | 未完成：当前环境未发现 `d493b240` 为 device |

## 真机路线状态

Beer/Tasting 详情和编辑路线需要通过正常 UI 创建测试数据后验证。本轮由于 ADB 设备不可用，未声称这些路线通过，也未生成或安装正式 RC2。

## 截图与日志

本轮要求的 `mobile/tests/android/.artifacts/shell-regression-v2/` 截图和 logcat 收集待宿主设备重新连接后执行；旧目录中的占位详情/编辑截图不作为本轮证据。
## RC2 Shell 回归复测（2026-07-18）

- 测试包：`com.mybeerjournal.app.v1test`，`versionCode=23`，`versionName=1.0.0-rc2-internal`；正式包 `com.mybeerjournal.app` 未安装、未操作。
- 覆盖安装后 `dataDir` 仍为 `/data/user/0/com.mybeerjournal.app.v1test`；重启后 Beer、Tasting、标签和评分仍存在。
- 本次 APK 实际包含 `index-DuVNls7x.js` 与 `index-BTLKIJP1.css`；Vite dist 与 APK assets SHA-256 一致：JS `7AE54283C695CFFEA0662D00CB990286DE9878FD206A1561E4CFA35CACF5F42`，CSS `654B711319666B6C7E1ECE036619009AB9777F9BA1B39628FD1F5F69188A60F9`。（此前预期的 `index-Ce2lvQ3N.js` / `index-3oepLfww.css` 属于旧构建，不是本次包。）
- 通过正常表单创建 Beer（韩国、拉格、淡色拉格、五选项评分、标签）并保存；Beer 详情显示 1 次品饮、评分 9.0、标签与类型。
- 通过正常 Tasting 表单创建记录（时间、地点、330 ml × 2、价格、评分、备注）；Beer 详情历史立即出现记录，强制停止并重启后仍存在。
- Beer 详情、Beer 编辑、Tasting 详情、Tasting 编辑均已打开并核对字段回显；Tasting 编辑页五列日期滚轮自动定位到 `2026 / 7月 / 18日 / 23 / 19`，每列均有选中项且滚动位置在可视区。
- Shell DOM/布局实测：`.app-shell` 为 `auto / minmax(0,1fr) / auto` 三行，`#route-content` `clientHeight=694`、`scrollHeight=2026`，底栏独占 `y=798..866`，滚动区底部为 `y=788`；底栏不覆盖滚动区。Beer/Tasting 表单均可将末尾按钮滚动到导航上方。
- 软键盘：点击 Beer 表单输入后 `mInputShown=true`，按返回收起后 `mInputShown=false`；对应截图已保存。
- 截图目录：`mobile/tests/android/.artifacts/shell-regression-v2/`，包含 `beer-new-top.png`、`beer-new-middle.png`、`beer-new-bottom.png`、`beer-new-keyboard.png`、`beer-detail.png`、`beer-edit-bottom.png`、`tasting-detail.png`、`tasting-edit-bottom.png`。
- 清空日志并重启后严重日志计数均为 0：FATAL EXCEPTION、E/AndroidRuntime、SQLiteException、database is locked、constraint failed、TAG_ID_INVALID、No available connection、console.error、unhandled rejection、ResizeObserver error。
- 测试自动化在连续切换 hash 路由时曾短暂显示一次“关联的啤酒不存在或已删除”加载竞态提示；关闭提示后同一 Tasting 编辑页正确渲染并回显 Beer。正常从 Beer 详情进入 Tasting 的路径未复现该提示，因此本轮未修改路由或数据逻辑。
## Shell regression final verification (2026-07-19)

- Internal package: `com.mybeerjournal.app.v1test`, version `1.0.0-rc2-internal` (versionCode 23). The formal package `com.mybeerjournal.app` was not installed or touched.
- Host rebuild installed the current bundle. Vite and Android assets both contain `index-DBBJ5SKF.js` (SHA-256 `4D84D7AC883229D0A8C20B33D38EA6A821668FF94BF4D57767A579E048A9DEC3`) and `index-BTLKIJP1.css` (SHA-256 `654B711319666B6C7E1ECE036619009AB9777F9BA1B39628FD1F5F69188A60F9`). The requested older names `index-Ce2lvQ3N.js`/`index-3oepLfww.css` are not the current build outputs.
- Normal UI flow created and reopened the existing Beer and Tasting data. Beer detail/edit and Tasting detail/edit were exercised after the latest install.
- Tasting edit route fix verified: the submit boundary resolves the tasting's `beer_id`; save completed and the detail page displayed the edited note (`Shell regression tasting edited`). No alert or SQLite error appeared.
- Existing date value `2026-07-18T23:19` reopened in the five-column picker with selected values `2026 / 7月 / 18日 / 23 / 19`; all five lists were centered after render.
- App Shell metrics: grid rows `93.6667px 694.333px 102px`; route-content bottom `788.0`, bottom navigation top `798.0`, navigation bottom `866.0`. The navigation occupies its own layout row and does not cover route content. Beer create/edit and Tasting edit were scrolled to their final controls.
- Android keyboard was opened and closed on a form field; the route scroll container recovered normally. Screenshots are in `mobile/tests/android/.artifacts/shell-regression-v2/` (`beer-new-top.png`, `beer-new-bottom.png`, `beer-new-keyboard.png`, `beer-detail.png`, `beer-edit-bottom.png`, `tasting-detail.png`, `tasting-edit-bottom.png`).
- Final logcat is saved as `mobile/tests/android/.artifacts/shell-regression-v2/logcat.txt`. Severe counts: FATAL EXCEPTION 0, SQLiteException 0, database locked 0, constraint failed 0, TAG_ID_INVALID 0, No available connection 0, plugin_lookup 0, console.error 0, unhandled rejection 0, ResizeObserver error 0. The five `AndroidRuntime` lines are the normal `monkey` launcher process and contain no crash.
## RC2 functional gate (2026-07-19)

本轮使用内部包 `com.mybeerjournal.app.v1test`（Schema 4，versionCode 23）完成了可在当前包中执行的功能门禁。正式包 `com.mybeerjournal.app` 未安装、未启动、未覆盖。

### 已实际验证

- Beer 照片：通过 UI 添加两张照片、切换封面、删除并从回收站恢复；`run-as` 检查确认展示图和缩略图文件真实存在。强制停止并重启后文件仍存在。
- Tasting 照片：通过 UI 添加、回显、删除并恢复；展示图和缩略图文件真实存在，重启后仍保留。
- 搜索：名称 `Amber`、标签 `Hop` 均返回 1 条正确 Beer。
- 筛选：国家美国、分类艾尔、风格 IPA、标签 Hop、最低评分 7 的组合返回 `RC2 Amber Test`；重新打开状态回显；单项标签清除后其他条件保留；重置恢复 2 条记录。
- 排序：平均评分和品饮次数两种排序均改变并返回可解释的卡片顺序。
- 统计：通过 native SQLite bridge 读取内部测试数据库核对：Beer 2、Tasting 2、总瓶数 3、品饮平均分 8.25（界面显示 8.3）、平均价格 ¥15.65、国家/分类/风格/标签分布与记录一致。
- Beer/Tasting 软删除和恢复：数据库层 deleted_at 先写入、再由 UI 恢复为 NULL；关联记录未重复。
- 重启与 `adb install -r`：内部包 dataDir 未清理，Schema 4、Beer/Tasting/标签/照片仍保留。
- 本轮 logcat：FATAL EXCEPTION、SQLiteException、database is locked、constraint failed、TAG_ID_INVALID、No available connection、plugin_lookup、console.error、unhandled rejection、Filesystem/Camera/JSON 错误均为 0。

### 本轮代码修正

- `mobile/web/assets/app.js`：筛选 sheet 重渲染先关闭旧 overlay，避免旧 onClose 清空新 DOM；恢复已存在的单项筛选清除胶囊渲染。
- `mobile/web/assets/beer-repository.js`、`mobile/web/assets/tasting-repository.js`：回收站查询只返回 `deleted_at` 非空记录，不再把活动记录混入回收站。
- `mobile/web/assets/backup-service.js`：Android 原生导出写入 `DATA/backups/beer-journal-backup-YYYY-MM-DD.json`，不再依赖 WebView 的浏览器下载锚点；浏览器仍保留 Blob 下载路径。

### 阻塞项

- 上述最后三处修正已通过 Node 56/56、16 个 JS/MJS 语法检查、Vite production build、Capacitor sync 和 `git diff --check`。
- 最新 dist bundle 为 `index-CvEagc7q.js`（SHA-256 `299544E9DC9C2217CC954B86E203A994CA077958A9F485A9812BAC323D108AF4`），CSS 为 `index-BTLKIJP1.css`（SHA-256 `654B711319666B6C7E1ECE036619009AB9777F9BA1B39628FD1F5F69188A60F9`）。
- 由于当前 Codex 沙箱无法取得 Gradle 8.14.3/AGP 缓存的写锁，宿主 Gradle 重建被环境权限阻塞；因此上述最后三处修正尚未进入手机 APK，Android 备份文件写入和修正后的回收站列表尚未在新 bundle 上复测。

**结论：RC2 门禁暂未通过，不能构建或提交正式 RC2。需要在普通 Windows PowerShell 使用现有 `scripts/rc2-host-gate.ps1` 完成一次内部包构建/覆盖安装后，复测 Android 备份真实文件、回收站列表和持久化。**
