# Socks Depot 演示商城

一个使用 Node.js、SQLite 和原生前端 JavaScript 构建的单品类电商演示项目，包含商品、购物车、结算、支付、履约、售后、后台管理和账户安全流程。

## 本地运行

```powershell
npm install --registry=https://registry.npmmirror.com
npm run dev
```

默认页面地址：`http://127.0.0.1:4173/`

## 安全配置

生产环境必须显式配置以下变量，不得把真实密钥提交到 Git：

```text
CSRF_SECRET
SECURITY_HASH_SECRET
PAYMENT_WEBHOOK_SECRET
ALLOWED_ORIGINS
SMTP_HOST
SMTP_PORT
SMTP_SECURE
SMTP_USER
SMTP_PASSWORD
SMTP_FROM
```

浏览器写请求使用签名双提交 CSRF Token，并同时校验 Origin 和 Fetch Metadata。普通 API 使用内存限流，登录、注册、邮箱验证和密码重置使用 SQLite 持久化双维度限流。支付 webhook 必须使用 `X-Payment-Signature: sha256=<HMAC>` 对原始请求体签名。

## 邮件与审计

开发和测试环境只写入 SQLite outbox，不连接真实 SMTP。生产环境每次串行投递一封邮件，失败最多尝试 3 次，不执行并发批量重试。开发 outbox 查看接口仅允许回环地址上的 `audit.read` 管理员访问，生产环境返回 404。

安全审计只保存白名单元数据和哈希标识，默认保留 180 天，并采用小批量过期清理。密码、原始 Token、Cookie、Authorization、完整邮箱和原始 IP 不写入审计元数据。

## 测试

```powershell
npm run test:api -- --workers=1
npm run test:ui -- --workers=1
npm run test:ops -- --workers=1
```

测试固定单 worker，避免 SQLite 夹具竞争和不必要的并发请求。

GitHub Actions 在 Pull Request 和目标分支推送时依次执行上述三套测试，再构建本地生产镜像并检查 `/api/ready`。PR 工作流只有仓库只读权限，不读取生产 secrets、不推送镜像，也不连接生产服务器。

## 生产部署

生产环境采用 Ubuntu VPS、Docker Compose 和 Caddy。先在 GitHub 仓库创建受保护的 `production` Environment，并配置以下 secrets：

```text
PRODUCTION_SSH_HOST
PRODUCTION_SSH_USER
PRODUCTION_SSH_KEY
PRODUCTION_SSH_KNOWN_HOSTS
```

服务器部署目录固定为 `/opt/socks-store`。首次部署前需要创建 `data`、`public/uploads`、`backups`、`deploy` 和 `scripts`，将数据目录所有者设为容器用户 UID/GID 1000，并根据 [.env.production.example](.env.production.example) 创建权限为 `600` 的 `.env.production`。服务器需要提前用只读 token 登录 `ghcr.io`，部署 workflow 不会把 registry token 传入 SSH 命令。

生产发布从 GitHub Actions 手动运行 `Deploy Production`，输入已经通过 CI 的完整 40 位提交 SHA，并经过 Environment 人工批准。部署前已有版本会先运行数据库备份，再拉取不可变 SHA 镜像、执行 migration 和健康检查。健康失败只恢复上一应用镜像，不自动降级或恢复数据库。

首次部署没有旧数据库可备份；之后每次发布都必须成功完成部署前备份。需要手动回滚时，应重新运行部署 workflow 并选择已通过 CI、仍与当前 schema 向后兼容的旧提交，不能直接覆盖 SQLite 数据库。
