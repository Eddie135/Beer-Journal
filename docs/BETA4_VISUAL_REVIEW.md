# beta4 视觉回归逐图审阅

审阅日期：2026-07-17
浏览器：Microsoft Edge + Playwright 1.61.1
视口：360×800、393×852、412×915
截图目录：`mobile/tests/e2e/.artifacts/`

以下 33 张截图均已逐张打开审阅（覆盖用户要求的 30 张，并将分类和风格选择器分别记录）。所有页面均未出现乱码、调试信息或不可用控件。固定底部导航在内容滚动到底部后留有安全空间；部分长页面初始视口会覆盖可滚动内容，这是固定导航的预期行为。

| 文件名 | 页面 | viewport | 审阅结果 | 问题等级 | 问题描述 | 是否已修复 | 修复后截图 |
|---|---|---:|---|---|---|---|---|
| beers-360.png | 我的啤酒列表 | 360×800 | PASS | 无 | 列表、搜索、卡片和导航正常 | 否 | beers-360.png |
| beers-393.png | 我的啤酒列表 | 393×852 | PASS | 无 | 长卡片可滚动，导航不影响末项 | 否 | beers-393.png |
| beers-412.png | 我的啤酒列表 | 412×915 | PASS | 无 | 宽度变化无溢出 | 否 | beers-412.png |
| filter-360.png | Filter Sheet | 360×800 | FIXED_AND_PASSED | 中 | 筛选层级与固定页脚需统一 | 是 | filter-360.png |
| filter-393.png | Filter Sheet | 393×852 | FIXED_AND_PASSED | 中 | 筛选层级与固定页脚需统一 | 是 | filter-393.png |
| filter-412.png | Filter Sheet | 412×915 | FIXED_AND_PASSED | 中 | 筛选层级与固定页脚需统一 | 是 | filter-412.png |
| beer-new-360.png | 添加 Beer | 360×800 | PASS | 无 | 表单、五选项、标签区可见 | 否 | beer-new-360.png |
| beer-new-393.png | 添加 Beer | 393×852 | PASS | 无 | 表单无横向溢出 | 否 | beer-new-393.png |
| beer-new-412.png | 添加 Beer | 412×915 | PASS | 无 | 表单间距稳定 | 否 | beer-new-412.png |
| beer-edit-360.png | 编辑 Beer | 360×800 | PASS | 无 | 原值、标签和保存按钮正常 | 否 | beer-edit-360.png |
| beer-edit-393.png | 编辑 Beer | 393×852 | PASS | 无 | 评分选项未挤压 | 否 | beer-edit-393.png |
| beer-edit-412.png | 编辑 Beer | 412×915 | PASS | 无 | 长表单可滚动 | 否 | beer-edit-412.png |
| beer-detail-360.png | Beer 详情 | 360×800 | PASS | 无 | 评分、标签、历史区域正常 | 否 | beer-detail-360.png |
| beer-detail-393.png | Beer 详情 | 393×852 | PASS | 无 | 操作按钮可见 | 否 | beer-detail-393.png |
| beer-detail-412.png | Beer 详情 | 412×915 | PASS | 无 | 内容无溢出 | 否 | beer-detail-412.png |
| country-picker-360.png | CountryPicker | 360×800 | FIXED_AND_PASSED | 中 | 嵌套时必须位于筛选层之上 | 是 | country-picker-360.png |
| country-picker-393.png | CountryPicker | 393×852 | FIXED_AND_PASSED | 中 | 嵌套时必须位于筛选层之上 | 是 | country-picker-393.png |
| country-picker-412.png | CountryPicker | 412×915 | FIXED_AND_PASSED | 中 | 嵌套时必须位于筛选层之上 | 是 | country-picker-412.png |
| category-picker-360.png | 分类选择 | 360×800 | FIXED_AND_PASSED | 中 | Bottom Sheet 层级统一 | 是 | category-picker-360.png |
| category-picker-393.png | 分类选择 | 393×852 | FIXED_AND_PASSED | 中 | Bottom Sheet 层级统一 | 是 | category-picker-393.png |
| category-picker-412.png | 分类选择 | 412×915 | FIXED_AND_PASSED | 中 | Bottom Sheet 层级统一 | 是 | category-picker-412.png |
| style-picker-360.png | 风格选择 | 360×800 | FIXED_AND_PASSED | 中 | Bottom Sheet 层级统一 | 是 | style-picker-360.png |
| style-picker-393.png | 风格选择 | 393×852 | FIXED_AND_PASSED | 中 | Bottom Sheet 层级统一 | 是 | style-picker-393.png |
| style-picker-412.png | 风格选择 | 412×915 | FIXED_AND_PASSED | 中 | Bottom Sheet 层级统一 | 是 | style-picker-412.png |
| tastings-360.png | 饮用记录首页 | 360×800 | PASS | 无 | 空状态、搜索和导航正常 | 否 | tastings-360.png |
| tastings-393.png | 饮用记录首页 | 393×852 | PASS | 无 | 空状态间距稳定 | 否 | tastings-393.png |
| tastings-412.png | 饮用记录首页 | 412×915 | PASS | 无 | 空状态无溢出 | 否 | tastings-412.png |
| tasting-select-beer-360.png | 记录饮用选择 Beer | 360×800 | PASS | 无 | Beer 选择卡片可滚动 | 否 | tasting-select-beer-360.png |
| tasting-select-beer-393.png | 记录饮用选择 Beer | 393×852 | PASS | 无 | Beer 选择卡片可滚动 | 否 | tasting-select-beer-393.png |
| tasting-select-beer-412.png | 记录饮用选择 Beer | 412×915 | PASS | 无 | Beer 选择卡片可滚动 | 否 | tasting-select-beer-412.png |
| beer-profile-360.png | 个人数据 | 360×800 | PASS | 无 | 统计卡片和导航正常 | 否 | beer-profile-360.png |
| beer-profile-393.png | 个人数据 | 393×852 | PASS | 无 | 统计卡片无溢出 | 否 | beer-profile-393.png |
| beer-profile-412.png | 个人数据 | 412×915 | PASS | 无 | 统计卡片无溢出 | 否 | beer-profile-412.png |

注：表格包含 33 行页面记录，当前目录截图文件总数也是 33 张；其中分类和风格选择器分别记录。浏览器自动断言另行覆盖可见性、尺寸、命中层、筛选结果和末卡安全空间。
## 本轮真机补充（2026-07-17）

- 设备 `d493b240` 上确认 Filter Sheet 可见、footer 可见、底部导航不覆盖浮层；CountryPicker 叠加在 Filter Sheet 上方。
- Android 返回键实测遵循键盘收起 → CountryPicker → Filter Sheet 的层级顺序；关闭后底层页面和筛选状态保留。
- 标签编辑后的 Beer 卡片显示 Citrus、Malt、NativeTest，无重复标签或透明阻挡层。
- 本轮未运行 Playwright 三视口回归，因为本地缺少 `playwright-core`；现有截图记录不作为本轮重新通过的证据。
