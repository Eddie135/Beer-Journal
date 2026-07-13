# Beer Journal Debian 13 生产部署设计

文档状态：v4.0-B 设计完成，等待用户确认实施
更新日期：2026-07-13

## 1. 范围与原则

本方案用于一台由用户控制的 Debian 13 服务器，部署单用户 Beer Journal。当前仅定义部署方案，不创建服务器文件、不连接服务器、不生成密钥，也不启动生产容器。

- 保持 Django 服务端模板、PostgreSQL、Pillow、Gunicorn 和 Docker Compose 单体架构。
- 生产入口改用 **Nginx + Certbot**：Nginx 负责反向代理与静态资源；Certbot 负责 Let's Encrypt 证书的申请和续期。
- 只公开 HTTPS 入口；PostgreSQL、Gunicorn 和照片存储均不直接暴露到互联网。
- PWA 继续只缓存应用壳和离线提示，不缓存私人页面、照片或任何写入结果；未来 Capacitor APK 仍使用同一 HTTPS 服务，不引入第二套后端或公开 API。
- 部署实现前必须先完成单用户登录加固；未登录访问私人页面、导出和照片必须被拒绝。

## 2. 目标拓扑

```text
手机浏览器 / 已安装 PWA / 未来 Capacitor APK
                    │ HTTPS :443
                    ▼
          Nginx（唯一对外入口）
          ├─ /static/：只读静态文件
          ├─ /.well-known/acme-challenge/：证书校验
          └─ 其他请求：转发至 Gunicorn
                    │ 内部网络
                    ▼
          Django + Gunicorn（web）
          ├─ PostgreSQL 17（db，内部网络）
          └─ 私有 media 卷（仅 Django 与备份任务访问）

Certbot（按需申请、由定时任务续期）
```

长期运行的服务只有 `web`、`db`、`nginx`。`certbot` 是按需运行的维护任务，不常驻。不会加入 Redis、队列、独立前端、对象存储或新的业务服务。

## 3. 生产 Docker Compose 设计

实施阶段将新增独立的生产 Compose 文件（建议命名为 `docker-compose.production.yml`），不会复用当前带源码挂载和 Django 开发服务器的 `docker-compose.yml`。

| 服务 | 运行内容 | 网络与端口 | 持久化与安全要求 |
|---|---|---|---|
| `nginx` | Nginx 稳定镜像 | 唯一映射 `80:80`、`443:443`；同时接入公网网络和内部网络 | 只读挂载静态文件、证书和 ACME 校验目录；不挂载 media 卷 |
| `web` | 项目镜像 + Gunicorn | 仅内部网络，监听容器 `8000`，不映射主机端口 | 读写 media 卷、只读静态卷以外的应用代码；不使用源码热挂载 |
| `db` | PostgreSQL 17 固定补丁镜像 | 仅内部网络，不映射主机端口 | `postgres_data` 命名卷；数据库口令仅来自生产秘密文件 |
| `certbot` | Certbot 镜像 | 不开放端口；按需运行 | 读写 Let's Encrypt 证书卷和 ACME 校验目录 |

建议卷与宿主机目录：

| 名称 | 保存内容 | 访问方 |
|---|---|---|
| `postgres_data` | PostgreSQL 数据目录 | 仅 `db` |
| `media_data` | 已处理的私有照片与缩略图 | `web`、备份/恢复维护任务 |
| `static_data` | `collectstatic` 产生的公开静态文件 | `web` 写入，`nginx` 只读读取 |
| `letsencrypt_data` | 证书与账户资料 | `nginx` 只读，`certbot` 读写 |
| `certbot_webroot` | HTTP-01 验证文件 | `nginx` 只读，`certbot` 读写 |
| `/srv/beer-journal/backups` | 完整备份与校验清单 | 仅宿主机维护任务与恢复任务 |

`web` 以 Gunicorn 运行 WSGI 应用，例如绑定 `0.0.0.0:8000`、使用保守数量的 worker 和 60 秒超时；具体 worker 数在部署时按照服务器 CPU 和内存确定。迁移和静态文件收集不放进容器启动命令，以免重启或多实例启动时意外并发执行。

服务设置 `restart: unless-stopped` 和健康检查。`db` 通过 `pg_isready` 报告就绪状态，`web` 通过应用 `/health/` 供 Nginx 与人工检查使用。

## 4. Nginx 与 HTTPS 设计

### Nginx 职责

- 将 HTTP 的业务请求永久跳转至 HTTPS；HTTP 仅保留 `/.well-known/acme-challenge/` 供证书校验。
- 将 HTTPS 动态请求反向代理到 `web:8000`，传递 `Host`、`X-Forwarded-For` 和 `X-Forwarded-Proto` 等可信代理头。
- 直接提供 `/static/`，并为带版本的 CSS、JavaScript、Manifest、图标设置合适的缓存策略。
- 对动态 HTML、Service Worker 和 manifest 使用不会妨碍更新的缓存头；Service Worker 脚本继续由 Django 的现有策略返回 `no-cache`。
- 设置与应用上传限制一致的 `client_max_body_size`，过大文件在入口层被拒绝，Django 仍负责实际解码、像素检查与重新编码。
- 不配置 `/media/` 的静态公开路径；照片始终经 Django 的已鉴权视图读取，且不被 Nginx 或 Service Worker 长期缓存。

### 证书流程

1. 用户先准备域名，并将 A/AAAA 记录指向服务器公网地址；服务器防火墙只允许 TCP 80 与 443。
2. 首次部署时，Nginx 先提供 ACME 校验目录；Certbot 使用 HTTP-01 挑战申请证书。
3. 成功后 Nginx 加载证书并启用 HTTPS 与 HTTP 跳转。
4. Debian 的 systemd timer 每日执行 Certbot 续期检查；仅在证书实际更新后平滑重载 Nginx。
5. 证书私钥不进入 Git、镜像或 `.env`，只位于受限权限的证书卷中。

HTTPS 是 PWA 安装和 Service Worker 在真实手机上可靠运行的前提；Capacitor 包装后仍保留这个正式 HTTPS 地址用于在线页面与照片访问。

## 5. Django 生产配置与环境变量

实施阶段会新增未提交的 `/srv/beer-journal/.env.production`，权限为 `0600`，并只在 Compose 的 `web`/`db` 服务中读取。仓库只保留不含真实值的 `.env.production.example`。

生产秘密和配置至少包括：

| 配置 | 要求 |
|---|---|
| `DJANGO_SECRET_KEY` | 在服务器生成的长随机值；绝不提交或复制到日志 |
| `DJANGO_DEBUG` | 固定为 `0`/`False` |
| `DJANGO_ALLOWED_HOSTS` | 明确的正式域名；不使用 `*` |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | 明确的 `https://正式域名` |
| `POSTGRES_DB`、`POSTGRES_USER`、`POSTGRES_PASSWORD` | 独立强口令；不使用开发默认值 |
| `POSTGRES_HOST`、`POSTGRES_PORT` | Compose 内部服务名与端口 |
| 上传与站点配置 | 与现有应用限制一致，不记录用户照片或请求体 |

Django 将增加并验证生产安全设置：`SECURE_PROXY_SSL_HEADER`、安全 Cookie、HTTPS 重定向、正确的静态与 media 存储根目录，以及在 HTTPS 稳定后启用 HSTS。每次发布前运行 `python manage.py check --deploy`；高风险警告未解决则不发布。

## 6. 首次部署与数据库迁移流程

首次部署与每次升级均按下列顺序执行；实施阶段会把这些步骤写成面向用户的明确命令与检查表。

1. 确认域名、DNS、服务器防火墙、Docker Engine 和 Compose v2 已就绪。
2. 放置生产秘密文件与 Nginx 配置，检查权限；不把秘密写入 Git。
3. 构建或拉取带明确版本标记的应用镜像，启动 `db`，等待健康检查通过。
4. 运行一次性数据库迁移计划检查；确认无异常后执行 `migrate --noinput`。
5. 执行 `collectstatic --noinput` 写入 `static_data`，启动 `web` 和 `nginx`。
6. 申请证书，启用 HTTPS；运行 `check --deploy`、迁移一致性检查、健康检查与 HTTPS 冒烟验证。
7. 创建唯一的所有者账号，验证未登录无法访问私有页面和照片。

迁移始终由单独的一次性任务执行，不在 Gunicorn 容器的每次启动时自动执行。若迁移包含不可逆或数据重写步骤，必须先写单独迁移/恢复方案并获得确认。

## 7. 自动备份与恢复演练

每日 systemd timer 在低使用时段运行备份任务。一次完整备份包含：

1. PostgreSQL 的 `pg_dump` 自包含格式备份；
2. 同一批次 `media_data` 的归档；
3. 应用 Git 提交或镜像摘要、已应用迁移、时间、文件清单；
4. SHA-256 校验值和备份结果日志。

保留策略默认采用 7 份每日、4 份每周、6 份每月；实际保留数量按磁盘空间调整。至少一份已加密副本应离开本机服务器，目的地由用户以后明确选择并授权。备份文件和照片都不公开给 Web 服务。

数据库与照片备份需在低峰期执行。若需要严格的一致时间点，部署维护窗口应暂时停止写入，然后完成备份并恢复服务。每个正式版本上线前，以及至少每季度，必须在隔离测试环境演练一次恢复：恢复数据库、恢复照片、核对记录数/关联/照片校验，并保留结果。

## 8. 更新与回滚

### 常规更新

1. 记录当前 Git 提交、镜像摘要和迁移版本。
2. 先生成并检查完整备份。
3. 在本地 PostgreSQL 环境完成自动测试与迁移检查；在服务器做生产安全预检。
4. 获取新镜像，先查看迁移计划，再执行迁移、静态文件收集并重启相关服务。
5. 检查 `/health/`、HTTPS、登录、照片鉴权、PWA 更新和容器日志。

### 回滚原则

- **没有迁移或迁移向后兼容**：可停止新 `web` 镜像并恢复上一镜像，再进行健康检查。
- **已经执行改变数据的迁移**：不能把“回退镜像”当作完整回滚；应使用与该版本配套的完整备份恢复数据库和 media，再恢复旧镜像。
- 任何不可逆迁移都必须在实施前写清停机窗口、恢复步骤和用户确认点。

发布使用明确版本标签或镜像摘要，不使用无法追踪的 `latest` 作为回滚依据。容器、卷和备份均不以删除重建作为故障处理手段。

## 9. 实施前仍需用户提供的条件

- 一台可 SSH 管理的 Debian 13 服务器及其公网 IP；
- 一个已注册并可配置 DNS 的域名；
- 对外开放 TCP 80/443 的权限；
- 备份异地副本的存放位置与授权方式；
- 用于正式登录的单一所有者账号信息（仅在安全创建账号时提供，不写入文档）。

## 10. 验收标准

- 只有 Nginx 暴露 80/443；数据库、Gunicorn 和 media 不可从公网直接访问。
- 重启容器后 PostgreSQL 数据、照片、静态资源与证书仍存在。
- HTTP 自动跳转 HTTPS，证书有效，`check --deploy` 无未解释的高风险警告。
- 登录外的访问不能读取私人记录、导出或照片。
- 手机可安装 PWA，静态应用壳可离线提示；私人数据和照片没有被缓存。
- 成功完成一次备份与隔离恢复演练；更新和回滚记录可追踪。

## 11. 参考依据

- [Docker Engine for Debian（含 Debian 13）](https://docs.docker.com/engine/install/debian/)
- [Django 5.2 部署清单](https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/)
- [Nginx 反向代理模块](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)
- [Certbot 文档](https://eff-certbot.readthedocs.io/)
- [PostgreSQL 17 逻辑备份](https://www.postgresql.org/docs/17/backup-dump.html)
