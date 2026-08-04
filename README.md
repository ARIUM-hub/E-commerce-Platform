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

生产环境采用 Ubuntu VPS、Docker Compose 和 Caddy。应用容器不直接暴露端口，由 Caddy 提供 HTTPS；SQLite、上传文件和备份挂载到主机持久化目录。部署只使用已经通过 CI 的不可变提交 SHA，失败时只自动回滚应用镜像，不自动回滚数据库。

## 首次部署

1. 将域名解析到 VPS，开放 `80/443`，安装 Docker Engine、Compose plugin 和 systemd。
2. 创建部署目录，并仅把持久化目录交给容器内 UID/GID 1000：

```bash
sudo mkdir -p /opt/socks-store/{data,public/uploads,backups,deploy,scripts}
sudo chown -R 1000:1000 /opt/socks-store/data /opt/socks-store/public/uploads /opt/socks-store/backups
sudo chmod 750 /opt/socks-store/data /opt/socks-store/public/uploads /opt/socks-store/backups
```

3. 根据 `.env.production.example` 创建 `/opt/socks-store/.env.production`，填入独立生成的生产密钥，并执行 `chmod 600`。不得提交该文件，也不要手工创建 `.env.image`，它会在首次成功发布后原子生成。
4. 用只读 GitHub Container Registry token 在 VPS 执行一次 `docker login ghcr.io`。
5. 在 GitHub 创建受保护的 `production` Environment，启用人工审批，并配置以下 secrets：

```text
PRODUCTION_SSH_HOST
PRODUCTION_SSH_USER
PRODUCTION_SSH_KEY
PRODUCTION_SSH_KNOWN_HOSTS
```

6. 手动运行 GitHub Actions 的 `Deploy Production`，输入已通过 CI 的完整 40 位提交 SHA。首次部署没有旧数据库，因此跳过部署前备份。
7. 从同一批准版本安装备份单元，并在首次部署成功后启用定时器：

```bash
sudo install -m 0644 deploy/systemd/socks-backup.service /etc/systemd/system/
sudo install -m 0644 deploy/systemd/socks-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now socks-backup.timer
systemctl status socks-backup.timer
```

## 常规发布

先确认目标提交的 `CI` workflow 完整通过，再从 GitHub Actions 手动运行 `Deploy Production` 并等待 `production` Environment 审批。发布流程串行执行部署前备份、镜像拉取、数据库 migration、应用启动和有界就绪检查。成功后 `.env.image` 会保存当前 `APP_IMAGE` 与 `SERVICE_VERSION`，供定时备份和受控恢复使用。

发布完成后检查：

```bash
curl --fail --silent https://shop.example.com/api/health
curl --fail --silent https://shop.example.com/api/ready
docker inspect --format '{{.Config.Image}} {{.State.Health.Status}}' socks-store-app-1
```

`/api/health` 只表示进程存活，`/api/ready` 还会执行数据库就绪检查。外部流量只应在两个接口均正常后恢复。

## 备份与 S3 检查

定时器每天按上海时区在 `03:30` 附近串行运行一次备份。查看定时器、最近执行结果和结构化输出：

```bash
systemctl status socks-backup.timer
systemctl status socks-backup.service
journalctl -u socks-backup.service --since '24 hours ago' --no-pager
```

需要立即验证时只启动一次 service，不要循环重试：

```bash
sudo systemctl start socks-backup.service
find /opt/socks-store/backups -maxdepth 1 -type f -name 'socks-store-*.db.gz*' -printf '%f\n'
cd /opt/socks-store/backups && sha256sum -c socks-store-YYYYMMDDTHHMMSSZ-abcdef0.db.gz.sha256
```

在具有只读对象存储权限的运维终端检查 S3，不在命令行写 access key：

```bash
aws s3api list-objects-v2 \
  --bucket socks-backups \
  --prefix sqlite/ \
  --max-items 20 \
  --query 'Contents[].{Key:Key,Size:Size,Modified:LastModified}'
```

一次成功备份应产生 `.db.gz` 与对应 `.sha256` 两个对象。本地默认保留 7 天；S3 生命周期策略应在对象存储侧单独配置。

## 受控恢复

恢复会覆盖当前数据库，必须在维护窗口由授权运维人员执行。先把归档和对应 checksum 放入 `/opt/socks-store/backups`，然后停止应用并确认已无运行中的 app service：

```bash
cd /opt/socks-store
set -a
source .env.image
set +a
docker compose --env-file .env.production -f compose.production.yml stop app
docker compose --env-file .env.production -f compose.production.yml ps --status running --services
scripts/restore-production.sh socks-store-YYYYMMDDTHHMMSSZ-abcdef0.db.gz
docker compose --env-file .env.production -f compose.production.yml up -d app caddy
curl --fail --silent https://shop.example.com/api/ready
```

恢复脚本会先校验文件名、SHA-256 和 SQLite 完整性，再为当前数据库创建一份恢复前备份。任何校验失败都应停止处理，禁止跳过 `RESTORE` 确认或在应用仍运行时直接复制数据库文件。

## 监控与日志

应用以单行 JSON 写入 stdout，Docker 使用 `json-file` 驱动并限制为 `10 MB x 5`。按请求 ID 查询最近日志：

```bash
docker logs socks-store-app-1 --since 30m | jq -c 'select(.requestId == "request-id-placeholder")'
docker compose --env-file /opt/socks-store/.env.production -f /opt/socks-store/compose.production.yml logs --tail 200 app caddy
```

首次接入或轮换 Sentry DSN 后，可在容器内发送一次受控探针，不携带客户数据：

```bash
docker exec socks-store-app-1 node -e "const {createConfig}=require('./lib/config'); const {createErrorReporter}=require('./lib/monitoring/error-reporter'); const c=createConfig(process.env); const r=createErrorReporter({dsn:c.sentry.dsn,environment:c.sentry.environment,release:c.serviceVersion}); r.captureMessage('operations.sentry.probe',{kind:'manual'}); r.flush(2000).then(ok=>process.exit(ok?0:1));"
```

随后在 Sentry 中确认事件环境、release 和事件名正确。日志和 Sentry 上下文不得包含密码、Token、Cookie、Authorization、邮箱、IP、SMTP 密钥或 S3 access key。

## 镜像回滚

新版本未通过有界健康检查时，部署脚本会自动恢复上一镜像，并保留数据库 migration 结果。人工回滚应重新运行 `Deploy Production`，选择已通过 CI 且与当前数据库 schema 向后兼容的旧提交 SHA。不要手工覆盖 SQLite，也不要把镜像回滚误当作数据库恢复。

若旧应用无法读取新 schema，保持站点下线，进入受控恢复流程，并由负责人明确选择恢复点；生产部署脚本不会自动执行数据库降级。

## 密钥轮换

轮换顺序是先在外部服务创建新凭据，再原子更新 `/opt/socks-store/.env.production`，使用当前 `.env.image` 重建 app，验证健康和核心交易，最后撤销旧凭据。CSRF 密钥轮换会使现有页面 Token 失效；支付 webhook 密钥必须先与支付提供方协调；SMTP、S3、Sentry 和管理员凭据应分别轮换，不要一次同时更改全部依赖。

```bash
cd /opt/socks-store
set -a
source .env.image
set +a
docker compose --env-file .env.production -f compose.production.yml up -d --force-recreate app
curl --fail --silent https://shop.example.com/api/ready
```

SSH 主机密钥或部署密钥变更时同步更新 GitHub `production` Environment secrets，并保留人工审批。任何真实 secret 都不能写入 Git、工单、聊天记录或日志。

## 故障升级边界

- 单次备份在最多 3 次有界上传尝试后仍失败：停止自动重试，保留本地归档，检查对象存储、DNS、磁盘和凭据后再人工执行一次。
- `/api/health` 正常但 `/api/ready` 失败：阻断发布和流量，优先检查 SQLite 可读性、挂载权限与磁盘空间。
- 数据库完整性失败、误删或业务数据异常：立即停止 app，禁止在线复制或自动恢复，由负责人选择已校验恢复点。
- 新镜像失败但旧镜像健康：允许镜像回滚；若 migration 不向后兼容，则保持停机并升级给数据库负责人。
- Sentry 不可用：应用继续服务，依靠 JSON 日志和请求 ID 排障；不要通过高频制造异常来探测监控。
- 连续支付回调失败、订单金额异常或疑似密钥泄漏：暂停相关交易入口，保全审计日志，轮换对应密钥并升级给安全与支付负责人。
