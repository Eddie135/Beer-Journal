# BEER JOURNAL

BEER JOURNAL 是一个仅供个人使用的中文啤酒记录应用。它将分别保存“啤酒基本资料”和“每次品饮记录”，并计划提供多图上传、多维评分、标签、组合筛选、统计、导出、备份以及可安装到手机主屏幕的 PWA 体验。完成后将通过 Docker 部署到个人 Debian 13 服务器，数据和照片默认不交给第三方。

## 当前状态

- 当前处于“阶段 0：需求与设计”，尚未生成任何前端、后端或数据库业务代码。
- 产品需求、技术架构、数据库设计、开发计划和长期协作规则已写入 `docs/` 与 `AGENTS.md`。
- 已检查本机环境：当前找不到 Git、Docker、Python、Node.js；所选的容器化方案不要求单独安装 Python 或 Node.js，但下一阶段开始前需要 Git 和 Docker Desktop。
- Git 仓库尚未初始化，因为本机当前没有可用的 Git 命令。

## 下一步

先安装 Git for Windows 与 Docker Desktop，并确认 Docker 使用 WSL 2 后端。随后让 Codex 重新检查环境、初始化 Git、提交本批文档，再创建只包含健康检查、数据库连接和测试框架的最小可运行骨架。详细顺序见 `docs/DEVELOPMENT_PLAN.md`。
