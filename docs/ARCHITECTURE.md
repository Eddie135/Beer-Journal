# BEER JOURNAL 技术架构

文档状态：第一版架构决定  
更新日期：2026-07-13

## 1. 结论

第一版采用 **Django 单体应用**，而不是 Vue + FastAPI 前后端分离。

推荐技术组合：

- 应用框架：Django 5.2 LTS；
- 页面：Django 服务端模板、本地打包的 Bootstrap 和少量原生 JavaScript；
- 数据库：PostgreSQL 17；
- 图片处理：Pillow，在上传请求中同步压缩；
- 应用服务器：Gunicorn；
- HTTPS 与反向代理：Nginx；证书由 Certbot 申请和续期；
- 本地开发与生产部署：Docker Compose；
- 自动测试：Django 自带测试体系，关键流程逐步增加浏览器冒烟测试。

选择理由：项目只有一位用户，主要是表单、查询、图片、统计和备份。Django 已把数据模型、迁移、表单校验、登录、会话、管理后台和测试放在一个体系中，能减少独立前端、API 契约、两套依赖和两套校验带来的故障点。

## 2. 架构图

```text
手机 / 电脑浏览器 / 已安装 PWA
                │
                │ HTTPS
                ▼
         Nginx + Certbot
       证书、限流、反向代理
                │
                ▼
       Gunicorn + Django 单体应用
       ├─ 中文页面与少量前端交互
       ├─ 登录、表单和业务规则
       ├─ 搜索、筛选、统计、导出
       ├─ 图片验证、压缩和鉴权读取
       └─ Django Admin（紧急维护）
            │              │
            ▼              ▼
      PostgreSQL 17    私有照片目录
      结构化数据        展示图与缩略图
```

生产环境只需要三个长期运行的服务：`web`、`db` 和 `nginx`。Certbot 只作为按需申请和定时续期任务运行；不加入 Redis、队列、独立前端服务器或对象存储。

## 3. 为什么不采用 Vue + FastAPI

| 方面 | Django 单体 | Vue + FastAPI 分离 |
|---|---|---|
| 开发环境 | 主要是一套 Python 依赖 | Python、Node、两个工程和两套锁文件 |
| 页面与业务通信 | 同一应用直接处理 | 需要设计、版本化和测试 REST API |
| 登录与安全 | Django 内置会话、CSRF 和权限 | 需要自行组合跨域、令牌或会话方案 |
| 数据与迁移 | ORM 与迁移内置 | 还要选择并整合 ORM、迁移工具 |
| 表单校验 | 一套服务端规则 | 经常需要前后端各维护一套 |
| 测试 | 一个主测试体系 | 前端、后端和 API 契约三部分 |
| PWA | 可以实现 | 可以实现 |
| 高度动态交互 | 足够应付本项目 | 更有优势 |
| 新手长期维护 | 部件少，容易定位问题 | 集成故障点更多 |

PWA 并不要求使用单页应用。Django 页面同样可以提供 manifest、图标、Service Worker、响应式布局和“添加到主屏幕”。若未来确定要开发原生 App，再为 Django 增加受控 API，不需要现在提前承担这部分复杂度。

### PWA 应用壳策略

v4.0-A 使用 Web App Manifest、根路径 Service Worker 和本地图标实现可安装体验。Service Worker 仅预缓存版本化 CSS、JavaScript、Manifest、应用图标和不含私人数据的离线提示页；动态 HTML、Beer/Tasting 数据、照片、表单响应和任何 `/photos/` 内容始终走网络且不写入 Cache Storage。Service Worker 脚本本身使用 `no-cache` 响应头，以便浏览器及时检查新版本；激活新版后清理旧缓存。断网访问动态页只返回静态离线提示，不承诺离线新建、编辑或同步。此策略保持 Django 单体、PWA 和未来 Capacitor 包装兼容。

## 4. 版本策略

- Django 使用 5.2 LTS 系列，并持续升级到该系列最新安全补丁；官方扩展支持至 2028 年 4 月。
- Python 使用 Django 5.2 正式支持的版本；容器镜像计划使用 Python 3.13 系列。
- PostgreSQL 使用 17 系列最新补丁。PostgreSQL 17 仍在官方支持期，预计支持至 2029 年 11 月。
- Docker Compose 使用 Docker 官方 Compose v2 插件，不使用旧的独立 `docker-compose` 程序。
- Nginx 使用受支持的稳定版本；Certbot 证书数据使用独立持久化卷。
- 实施时在依赖文件和容器镜像中固定可复现版本；升级由单独任务完成，升级前必须备份并运行全部测试。

## 5. 应用边界

### 5.1 Django 负责

- 中文页面、响应式布局和 PWA 文件；
- 单用户登录、会话、CSRF 和访问控制；
- Beer、Tasting、照片、标签和评分维度的业务规则；
- 搜索、组合筛选、排序、分页和统计；
- JSON/CSV 导出；
- 图片解码、压缩、缩略图和鉴权读取；
- 数据库迁移、管理命令和健康检查。

### 5.2 PostgreSQL 负责

- 结构化数据的持久化；
- 主外键、唯一、检查和删除约束；
- 事务、筛选、排序和聚合统计；
- 可恢复的逻辑备份。

### 5.3 Nginx 与 Certbot 负责

- Nginx 接收互联网请求，Certbot 通过 ACME 申请、续期 HTTPS 证书；
- HTTP 自动跳转 HTTPS；
- 将请求反向代理给 Django；
- 设置合理上传体积限制和登录失败限流；
- 直接提供公开静态文件，但不直接公开私人照片目录。

### 5.4 文件系统负责

- 照片以随机相对路径保存在独立持久化卷；
- 只保留重新编码后的展示图和缩略图；
- 数据库只保存相对存储键及尺寸、类型等元数据，不保存图片二进制或绝对路径。

## 6. 页面与前端策略

- 页面由 Django 服务端渲染，表单提交和筛选可在没有复杂 JavaScript 的情况下工作。
- Bootstrap 静态文件下载并随应用部署，不依赖运行时 CDN，避免第三方获知访问记录。
- 少量原生 JavaScript只用于图片预览、触控体验和渐进增强；关键保存逻辑仍由服务端验证。
- 高级筛选使用 GET 查询参数，方便刷新、返回、收藏和排错。
- 第一版不需要 Node.js 构建链，因此 Windows 本机无需另外安装 Node.js。

## 7. PWA 边界

第一版 PWA 提供：

- Web App Manifest、图标、主题色和独立窗口显示；
- 必要静态资源缓存；
- 断网时的中文离线提示；
- 手机上“添加到主屏幕”的安装体验。

第一版不提供：

- 离线新增或编辑；
- 离线照片队列；
- 跨设备同步冲突处理；
- Service Worker 长期缓存私人页面、导出或照片。

断网时表单必须明确阻止提交或显示失败，不能让用户误以为记录已经保存。

## 8. 照片处理流程

```text
选择照片
  → 浏览器做基础大小提示
  → 服务器限制请求大小
  → 临时文件
  → Pillow 实际解码与像素上限检查
  → 修正 EXIF 方向并移除元数据
  → 长边缩放至约 1600–2000 像素
  → 重新编码为 WebP 或 JPEG
  → 生成缩略图
  → 原子移动到私有照片卷
  → 在数据库事务中保存相对路径与元数据
```

首批支持 JPEG、PNG、WebP。HEIC/HEIF 需要额外解码依赖和真实 iPhone 样本验证，因此不承诺在第一版首个照片阶段支持。

照片读取由需要登录的 Django 视图完成，并设置适当的内容类型、下载策略和缓存头。即使知道存储键，未登录访问也必须失败。

## 9. 登录与安全

- 使用 Django 内置用户、密码散列和服务端会话；只创建一个所有者账户。
- 不提供公开注册、社交登录或找回密码邮件服务。
- 全部业务页面、照片、统计和导出默认要求登录。
- 生产环境启用 HTTPS、安全 Cookie、CSRF、`ALLOWED_HOSTS`、可信代理头和 HSTS。
- `DEBUG` 在生产必须关闭，`SECRET_KEY`、数据库口令和域名配置来自未提交的环境变量。
- Django 默认认证不包含登录暴力破解限速，因此在入口层或应用层加入保守限流。
- 上传图片限制体积和像素，并重新编码，不能原样公开用户上传文件。
- 部署前运行生产安全检查；高风险警告未解决时不能上线。

## 10. 开发与部署拓扑

### 10.1 Windows 本地开发

下一阶段使用 Docker Desktop + Docker Compose：

- `web` 容器运行 Django 开发环境；
- `db` 容器运行 PostgreSQL 17；
- 源码由当前项目目录挂载；
- 测试在容器内执行，避免依赖用户本机 Python 或 Node.js。

本地第一阶段暂不需要 Nginx，浏览器通过本机端口访问；生产配置再启用 Nginx。

### 10.2 Debian 13 生产

- Docker Engine 和 Compose v2 插件；
- `web` 使用 Gunicorn，不使用 Django 开发服务器；
- `db`、照片、静态文件和 Nginx/Certbot 证书使用持久化卷；
- 数据库端口不暴露到互联网；
- 只有 Nginx 的 80/443 端口对外开放；
- 生产 Compose 使用两个网络：`frontend` 仅连接 Nginx，用于接收 80/443 请求；`backend` 标记为内部网络，连接 Nginx、Web 与 PostgreSQL。Web 和 PostgreSQL 不加入 `frontend`，因此不会发布 8000 或 5432；
- 当 HTTPS 强制跳转启用时，Web 容器健康检查会附带 `X-Forwarded-Proto: https`，与 Nginx 的可信反向代理语义一致，避免内部 HTTP 探针被误重定向；
- 容器设置健康检查和重启策略；
- 升级前执行备份，迁移失败时停止新版本并回退应用镜像。

Docker 官方文档已明确支持 Debian 13（Trixie），因此该部署方向与目标服务器兼容。

## 11. 测试策略

### 自动测试

- 模型关系、约束和删除策略；
- 表单必填、范围、格式和中文错误；
- 登录保护及未授权照片访问；
- 新增 Beer + 首次 Tasting 的事务行为；
- 多次品饮互不覆盖；
- 动态评分和历史快照；
- 组合筛选、稳定排序、分页和统计口径；
- 图片压缩、恶意或损坏文件及孤儿清理；
- JSON/CSV 导出结构；
- 备份恢复后的记录数和关联完整性。

### 每阶段检查

1. Django 系统检查；
2. 数据库迁移一致性检查；
3. PostgreSQL 环境中的全部自动测试；
4. 实际启动后的浏览器关键流程；
5. 部署前的生产安全检查；
6. 文档与 Git 差异检查。

Django 自带测试客户端足以覆盖大部分页面和数据库流程。关键用户旅程在相应阶段加入真实浏览器自动化或由 Codex完成一轮可复现的浏览器冒烟验证。

## 12. 备份与恢复

完整备份由四部分组成：

1. `pg_dump` 生成的 PostgreSQL 自包含备份；
2. 同一批次的照片目录归档；
3. 包含应用版本、迁移版本、时间和文件清单的元数据；
4. 各文件校验值。

要求：

- 备份过程中避免继续写入；个人应用可在低峰期短暂进入只读维护状态。
- 至少保留一份不在同一服务器硬盘上的副本。
- Docker 卷、JSON 或 CSV 单独都不等于完整备份。
- 建议保留最近 7 个每日、4 个每周和若干每月备份，具体数量按服务器空间调整。
- 1.0 前必须恢复到一个空测试环境，核对数据库关系、记录数和照片校验值。

## 13. 预计资源占用

以下是单用户部署的保守估算，最终以实际镜像和照片策略测量为准：

- 应用、数据库和 Nginx 镜像：约 1–3 GB 磁盘；
- 不含照片的应用数据：长期通常低于 1 GB；
- 空闲到轻量使用时，容器合计常见约 400 MB–1.2 GB 内存，连同 Debian 系统建议至少 2 GB，4 GB 更从容；
- 主要增长来自照片。若每张压缩后约 300–800 KB，5,000 张约占 1.5–4 GB，另加缩略图和备份空间。

服务器优先考虑可靠磁盘和异机备份，而不是增加 CPU。

## 14. 本机环境检查结果

检查时间：2026-07-11  
项目目录：`D:\BEER-JORNAL`

| 项目 | 结果 | 对下一阶段的影响 |
|---|---|---|
| 当前目录 | 空目录 | 可以从干净基线开始 |
| Windows | 64 位，系统构建 26200 | 满足常规开发前提 |
| PowerShell | 5.1 | 可用于启动和检查工具 |
| Git | 未找到 | 必须安装；当前无法初始化仓库或提交 |
| Docker / Docker Compose | 未找到 | 必须安装 Docker Desktop 后才能启动下一阶段环境 |
| WSL | `wsl.exe` 存在，但未发现可用发行版/完整版本状态 | 安装 Docker Desktop 时确认 WSL 2 后端可用，必要时按其提示启用或更新 |
| Python | 未找到 | 容器化方案下无需单独安装 |
| Node.js / npm | 未找到 | 当前架构无前端构建链，无需安装 |
| VS Code | 未找到 | 非必需；Codex 可以直接维护项目文件 |
| Windows Package Manager | 未找到 | Git 和 Docker Desktop 需要通过官方安装程序安装 |

下一阶段开始前的必要工具只有：

1. Git for Windows；
2. Docker Desktop，并确认 Docker Compose 与 WSL 2 后端正常。

不需要现在购买域名、连接 Debian 服务器、安装 PostgreSQL、单独安装 Python 或 Node.js。

## 15. 官方依据

- [Django 5.2 LTS 发布说明](https://docs.djangoproject.com/en/5.2/releases/5.2/)
- [Django 支持版本与路线](https://www.djangoproject.com/download/)
- [Django 测试说明](https://docs.djangoproject.com/en/5.2/topics/testing/overview/)
- [Django 5.2 的 PostgreSQL 支持](https://docs.djangoproject.com/en/5.2/ref/databases/)
- [Django 部署检查清单](https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/)
- [Docker 在 Debian 13 上的官方安装说明](https://docs.docker.com/engine/install/debian/)
- [PostgreSQL 版本支持策略](https://www.postgresql.org/support/versioning/)
- [PostgreSQL 17 逻辑备份说明](https://www.postgresql.org/docs/17/backup-dump.html)
- [Nginx 反向代理模块](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)
- [Certbot 文档](https://eff-certbot.readthedocs.io/)

## 16. 以后何时重新评估架构

只有出现以下真实需求之一，才重新评估独立前端、API、对象存储或后台队列：

- 确定开发原生手机 App；
- 需要复杂离线编辑和同步冲突解决；
- 图片处理已经实际造成请求超时；
- 用户数量或并发明显增加；
- 本地磁盘容量或多服务器部署成为真实问题；
- 页面交互复杂度经测量已无法由服务端页面和少量 JavaScript 合理维护。

架构调整必须先写清收益、迁移成本、数据风险和回退方案，得到用户确认后再实施。
