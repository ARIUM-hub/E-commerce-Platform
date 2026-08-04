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
