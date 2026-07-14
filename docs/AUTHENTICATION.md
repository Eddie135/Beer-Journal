# 单用户登录保护

Beer Journal 是私人应用，不提供注册、社交登录、找回密码邮件、多用户或角色管理。

## 访问边界

- 啤酒、品饮、个人数据、回收站、图片读取和所有写入操作都必须先登录。
- 未登录访问私有地址时，Django 会跳转到 `/accounts/login/`，并在登录成功后回到原页面。
- Django Admin 继续使用自身的 `/admin/login/` 登录入口。
- `/health/` 只用于容器健康检查，`/service-worker.js` 只用于 PWA 应用壳；二者不返回私人数据，因此保持公开可访问。

## 生产准备

部署管理员在首次启动后，使用 Django 的 `createsuperuser` 命令创建唯一账号；账号密码和 Django `SECRET_KEY` 均不得提交到 Git。生产环境变量示例已使用 `mybeerjournal.com` 与 `https://mybeerjournal.com` 作为允许主机和可信 CSRF 来源。
