# Beer Journal 生产配置模板

这些文件为 Debian 13 的 `/srv/beer-journal` 目录准备，但本阶段不会复制到服务器、不会启动 Compose，也不会绑定端口。

## 预计服务器文件位置

```text
/srv/beer-journal/
├── .env.production                 # 真实秘密；不提交到 Git
├── app/                            # 本仓库内容
│   ├── docker-compose.prod.yml
│   └── deploy/nginx/
├── postgres/                       # PostgreSQL 持久化数据
├── media/                          # 私有照片
├── static/                         # collectstatic 输出
└── backups/                        # 完整备份
```

在服务器上执行 Compose 时，工作目录为 `/srv/beer-journal/app`，并显式使用上层秘密文件：

```text
docker compose --env-file ../.env.production -f docker-compose.prod.yml <命令>
```

## 配置阶段说明

- `.env.production.example` 只包含占位值；真实 `.env.production` 必须由 `beer-journal` 在服务器上创建，权限为 `0600`，不能提交或传回仓库。
- `postgres`、`media`、`static` 是宿主机绑定目录。Nginx 只读挂载 `static`，不会挂载或公开 `media`。
- `nginx` 使用 HTTP 引导模板作为默认值，它只提供 ACME 验证并返回 503，不会通过明文 HTTP 提供私人数据。该引导 Nginx 不依赖 Web 服务，便于后续先完成证书申请；证书申请成功后才切换到 HTTPS 模板。
- `letsencrypt_data` 和 `certbot_webroot` 是证书任务稍后使用的 Docker 命名卷；本阶段不会创建它们。
- `web` 和 `postgres` 没有主机端口映射。仅 Nginx 的 80/443 映射会在未来明确启动 Nginx 时生效。

## 启动前仍需完成的前置项

v4.0-C6 已补齐 `DATABASE_URL`、`STATIC_ROOT`、可信反向代理头和由环境变量控制的 Cookie/CSRF/HTTPS 设置。模板同时保留 `POSTGRES_*`，因此本地开发继续兼容。

正式启动前仍必须完成并验证单用户登录保护与 `check --deploy`。当前所有私人页面尚未强制登录，不能直接对公网启动。

## 资源限制

基于 2 核 CPU、3.8GB 内存且 AstrBot/NapCat 继续在宿主机运行，Compose 使用保守上限：PostgreSQL 768MB / 0.75 CPU，Web 512MB / 0.75 CPU，Nginx 128MB / 0.25 CPU，Gunicorn 初始只运行 1 个 worker。

## 本阶段不做

- 不创建或启动 Docker 容器、卷或网络；
- 不绑定 80/443，不申请证书；
- 不运行迁移、`collectstatic` 或 Django；
- 不修改 AstrBot、NapCat、Python 环境或防火墙。
