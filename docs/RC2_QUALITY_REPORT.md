# RC2 Shell Quality Report

日期：2026-07-18

## 结论

代码层已完成结构性底栏修复，并根据真机初检移除了阻止网格行收缩的强制高度。自动测试和 Vite/Capacitor 资源同步通过；RC2 Shell 真机门禁仍需重新安装本次修复包后完成。

## 通过项

- Shell 单例结构测试通过。
- route-content 是唯一滚动容器，底栏为独立布局行。
- 53/53 Node 测试通过。
- Vite bundle 已生成并同步到 Android assets。
- 未操作 `com.mybeerjournal.app`，未连接生产环境。

## 待宿主验证项

1. 内部包覆盖安装和 Schema 4 保留。
2. 通过 UI 创建 Beer、标签、照片和 Tasting。
3. Beer/Tasting 详情与编辑回显、保存和滚动到底部。
4. 键盘弹出/关闭时 route-content 可见高度恢复。
5. 三视口截图和 Android 截图逐张审阅。
6. 清空 logcat 后严重错误计数为 0。

本报告不把未执行项目描述为真机通过，也不生成正式 RC2。
## Shell 回归门禁结果（2026-07-18）

本轮只验证已修复的 Shell 与详情/编辑路径，没有新增功能、没有生成正式 RC2、没有提交 Git。

| 检查项 | 结果 |
|---|---|
| 最新内部 APK 覆盖安装 | 通过，`com.mybeerjournal.app.v1test` / versionCode 23 |
| Bundle 校验 | 通过，`index-DuVNls7x.js` / `index-BTLKIJP1.css`，dist 与 APK assets SHA-256 一致 |
| Beer 创建、详情、编辑 | 通过，字段/国家/分类/风格/评分/标签回显正常 |
| Tasting 创建、详情、编辑 | 通过，beer_id、时间、地点、容量、瓶数、价格、评分、备注回显正常 |
| 日期五列自动定位 | 通过，打开后五列均定位到当前保存值的可视选中项 |
| 底栏独立布局 | 通过，route-content 与 bottom navigation 不重叠，末尾按钮可滚动可见 |
| 键盘打开/关闭 | 通过，输入框上方滚动与关闭后恢复正常 |
| 强制停止后持久化 | 通过，Beer/Tasting/标签/统计保留 |
| Logcat 严重错误 | 通过，全部 0 |

截图和完整日志：`mobile/tests/android/.artifacts/shell-regression-v2/`。Playwright、正式 RC2 构建和 Git 提交均未执行（按本轮限制）。
备注：连续 hash 路由自动化切换期间出现过一次瞬时关联对象加载提示，随后页面正确完成渲染；这不是在正常用户路径中复现的稳定 Shell 故障，本轮未改动业务代码。
## Final Shell regression gate (2026-07-19)

| Check | Result |
|---|---|
| Current internal bundle | `index-DBBJ5SKF.js` / `index-BTLKIJP1.css`; Vite and Android assets SHA-256 match |
| Beer create/detail/edit | Passed through the normal UI; fields and navigation remained usable |
| Tasting detail/edit | Passed; edit save completed after resolving the tasting-to-beer association |
| Five-column date picker | Passed; existing value auto-centered to 2026 / 7月 / 18日 / 23 / 19 |
| Bottom navigation layout | Passed; dedicated grid row, route content ends above navigation |
| Keyboard recovery | Passed; opening and closing keyboard restored scrolling |
| Shell counts | One app shell, header, route-content, bottom navigation, hero and back button on the tested routes |
| Screenshots | Saved under `mobile/tests/android/.artifacts/shell-regression-v2/` |
| Severe logcat errors | 0 (see `logcat.txt`) |

The only code change needed during this regression was the narrowly scoped Tasting edit submit-boundary fix in `mobile/web/assets/app.js`; no database, schema, production server, or formal package was changed.
## RC2 final functional gate (2026-07-19)

| 门禁 | 结果 | 证据/备注 |
|---|---|---|
| Beer/Tasting 多图、封面、删除/恢复、实际文件 | 已通过（旧内部包） | UI 操作 + `run-as` 文件存在 + 重启保留 |
| 搜索、组合筛选、单项清除、重置、排序 | 已通过（旧内部包） | 2 条内部 Beer 数据，组合筛选返回 1 条，清除胶囊可见且保留其他条件 |
| 统计与数据库核对 | 已通过（旧内部包） | SQLite native bridge 查询与界面数值一致 |
| Beer/Tasting 回收站 | 代码已修正，需新包复测 | `listDeleted*` 现在只返回 deleted_at 非空记录 |
| JSON 导出真实文件 | 代码已修正，需新包复测 | Android native 改为 Filesystem DATA/backups 写入；旧包 WebView 锚点未生成可见下载文件 |
| 强制停止/覆盖安装数据保留 | 已通过（旧内部包） | Schema 4、数据和照片保留 |
| 严重 logcat | 已通过 | 本轮所有指定严重模式 0 |
| 自动测试 | 已通过 | Node 56/56；语法 16/16；Vite、Capacitor sync、diff check 通过 |
| 最新修正进入 APK | 阻塞 | Gradle 缓存写锁在 Codex 沙箱中拒绝，未能重建/安装新内部包 |

RC2 当前结论：**未达到正式发布门禁**。不得生成正式 `com.mybeerjournal.app` APK、提交或创建 `v1.0.0-rc2` tag，直到宿主 PowerShell 重建最新内部包并复测回收站列表和 Android 备份文件。
