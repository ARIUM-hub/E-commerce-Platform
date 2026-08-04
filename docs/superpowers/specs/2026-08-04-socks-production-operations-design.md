# 商城生产运维基础设施设计

**日期：** 2026-08-04  
**状态：** 已确认  
**范围：** CI、Ubuntu VPS 部署、SQLite 备份、Sentry 错误监控、生产结构化日志

## 目标

为现有 Node.js、SQLite 和原生前端商城补齐可审计、可恢复、可回滚的生产运维基础设施。生产环境使用 Ubuntu VPS、Docker Compose 和 Caddy；GitHub Actions 自动验证代码，但生产发布必须经过 GitHub Environment 人工审批。

本阶段不引入 Kubernetes、多节点部署、数据库集群、集中式日志平台或性能追踪。所有测试、备份、部署和外部请求保持串行或低并发，避免 SQLite 竞争和不必要的供应商请求。

## 生产架构

生产环境由以下组件组成：

- `app`：运行 Node.js 商城服务，只监听 Compose 内部网络。容器以非 root 用户运行，挂载 SQLite 数据目录、上传目录和本地备份目录。
- `caddy`：唯一公网入口，自动申请和续期 HTTPS 证书，把请求反向代理到 `app`，并传递可信代理头。
- `backup`：复用应用镜像，以一次性任务运行数据库备份、校验、压缩、保留清理和 S3 上传，不常驻轮询。
- GitHub Actions：CI 负责静态检查、单 worker API/UI 测试和镜像构建；CD 负责经审批后的镜像发布与 SSH 部署。
- Sentry：接收脱敏后的后端未处理异常和明确错误事件；未配置或不可用时不影响业务请求与应用启动。

生产数据不会写入容器可写层。SQLite 数据库、WAL、上传文件和本地备份均存放在显式宿主机目录或命名卷中。生产密钥只存放于 GitHub Environment Secrets 和 VPS 的 `.env.production`，不得写入 Git、Docker 镜像、构建日志或应用日志。

## CI 流程

`.github/workflows/ci.yml` 在 Pull Request 和目标分支推送时运行，并使用工作流 concurrency 取消同一分支已过时的 CI，不并发执行同一提交的数据库测试。

单次 CI 串行执行：

1. 使用锁文件安装依赖。
2. 检查 UTF-8、`git diff --check`、环境示例和生产配置约束。
3. 运行 `npm run test:api -- --workers=1`。
4. 运行 `npm run test:ui -- --workers=1`。
5. 构建生产 Docker 镜像。
6. 启动临时容器并等待 `/api/health` 返回成功。

PR 流程不推送镜像、不连接 VPS、不读取生产 secrets。测试失败、镜像构建失败或健康检查失败都会阻止后续发布。

## 生产部署流程

`.github/workflows/deploy-production.yml` 只允许手动触发。操作者输入或选择已通过 CI 的提交 SHA，工作流进入受保护的 `production` GitHub Environment，等待人工批准。

批准后串行执行：

1. 构建镜像并以不可变提交 SHA 标记后推送到 GitHub Container Registry。
2. 通过 SSH 连接 VPS，验证部署目录与生产环境文件存在。
3. 使用当前运行版本执行一次部署前数据库备份。
4. 记录当前镜像标签作为回滚目标。
5. 拉取指定 SHA 镜像并运行数据库 migration。
6. 使用 Docker Compose 启动新容器。
7. 在限定时间内轮询本机健康地址；每次等待固定间隔，达到上限后停止，不无限重试。
8. 健康检查失败时恢复上一镜像并再次检查；回滚只恢复应用镜像，不自动降级数据库。

部署工作流设置单一 production concurrency 锁，新部署排队而不是打断正在进行的生产部署。数据库 migration 必须保持向后兼容，破坏性 schema 变更需要独立阶段处理。

## Caddy 与网络边界

Caddy 自动管理域名 HTTPS，并将流量转发到 Compose 内部的 `app` 服务。Node 服务不直接暴露宿主机公网端口。

生产配置启用 `TRUST_PROXY=true`，但应用只信任来自 Caddy 网络边界的代理头。`ALLOWED_ORIGINS` 必须设置为正式 HTTPS 域名。安全 Cookie、CSRF、Fetch Metadata 和 Origin 校验沿用现有安全网关。

健康检查分为：

- 存活检查：进程可以响应 `/api/health`。
- 就绪检查：应用可以打开数据库并完成只读查询；失败时返回非 2xx，但不暴露数据库路径或异常详情。

## SQLite 备份

### 一致性快照

备份脚本使用 SQLite 在线一致性快照能力，不直接复制正在运行的主数据库、WAL 和 SHM 文件。备份输出先写入临时文件，成功后执行 `PRAGMA integrity_check`；仅结果为 `ok` 时才原子重命名为正式备份。

正式文件使用 UTC 时间与短提交版本命名，例如：

```text
socks-store-20260803T193000Z-3e45734.db.gz
socks-store-20260803T193000Z-3e45734.db.gz.sha256
```

压缩后生成 SHA-256 校验文件。备份 metadata 记录创建时间、应用版本、压缩前后大小和校验值，但不记录业务数据。

### 调度与保留

- 每天北京时间 03:30 运行一次。
- 每次生产部署前额外运行一次。
- 本地成功备份保留 7 天。
- S3 兼容对象存储保留 30 天，通过 bucket lifecycle 执行远端过期清理。
- 清理只匹配固定备份文件格式，绝不递归删除任意用户输入路径。

S3 上传串行执行，最多尝试 3 次并采用有上限的退避等待。上传失败时保留本地备份、记录错误并通知 Sentry，不阻止商城继续服务。部署前备份失败则阻止部署，日常定时备份失败则退出非零并由主机调度器记录。

### 恢复

恢复脚本必须由操作者手动执行并提供精确备份路径与显式确认参数。恢复流程：

1. 验证目标路径位于允许的备份目录。
2. 验证 SHA-256 和压缩文件完整性。
3. 解压到临时数据库并运行 `PRAGMA integrity_check`。
4. 确认应用已经停止，拒绝覆盖正在使用的数据库。
5. 先为当前生产数据库生成紧急备份。
6. 原子替换主数据库，并清理旧 WAL/SHM。
7. 启动应用并执行就绪检查。

恢复失败时保留原数据库和临时文件供排查，不自动反复恢复，也不自动覆盖第二次。

## 生产日志

`lib/logger.js` 扩展为单行 JSON 结构化日志。每条日志至少包含：

- `timestamp`
- `level`
- `event`
- `environment`
- `serviceVersion`
- `requestId`（请求范围事件）
- 经白名单过滤的事件上下文

HTTP 请求完成日志包含 method、规范化 route、statusCode 和 durationMs。请求 ID 优先接受 Caddy 传入且符合长度与字符约束的值，否则由应用生成，并通过响应头返回。

日志禁止记录密码、密码 hash、原始账户 Token、Cookie、Authorization、支付签名、完整邮箱、原始 IP、请求体和 SMTP 凭据。客户、会话与网络标识只能使用现有 HMAC 哈希 helper 或稳定内部 ID。

应用只写 stdout/stderr，不在容器内管理长期日志文件。Compose 配置 Docker `json-file` 驱动，单文件最大 10 MB，最多保留 5 个文件。开发环境保留适合阅读的文本格式，测试可注入 sink 做确定性断言。

## 错误监控与进程生命周期

新增独立错误报告适配器，避免业务代码直接依赖 Sentry SDK。适配器提供：

- 初始化与关闭。
- 捕获未处理异常。
- 捕获已明确记录的高严重级错误。
- 设置 release、environment、requestId、route 和安全用户 ID。

Sentry 不上传请求体、Cookie、Authorization、支付签名、邮箱、IP 和原始 Token。`beforeSend` 再执行一层字段删除，防止调用方误传。默认关闭性能追踪和 session replay，避免额外采样流量。Sentry 初始化或发送失败只写本地降级日志，不重试阻塞请求。

进程处理：

- `SIGTERM`/`SIGINT`：停止接受新连接，等待有限时间完成当前请求，刷新监控队列后退出。
- `uncaughtException`/`unhandledRejection`：记录并上报，开始一次受限优雅关闭，避免在未知状态继续服务。
- 启动配置错误、数据库 migration 失败或端口监听失败：记录结构化 fatal 事件并非零退出。

## 配置

新增 `.env.production.example`，至少记录：

```text
NODE_ENV=production
HOST=0.0.0.0
PORT=4173
DATA_DIR=/app/data
LOG_FORMAT=json
SERVICE_VERSION=
PUBLIC_BASE_URL=
SENTRY_DSN=
SENTRY_ENVIRONMENT=production
BACKUP_DIR=/app/backups
BACKUP_LOCAL_RETENTION_DAYS=7
S3_ENDPOINT=
S3_REGION=
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
```

现有 CSRF、哈希、支付 webhook、SMTP 与 bootstrap 管理员变量继续作为生产必填项。生产启动时严格校验域名、日志格式、目录、备份保留天数和 S3 配置；错误信息只指出缺失变量名，不打印值。

## 文件边界

计划新增或修改：

- `.github/workflows/ci.yml`
- `.github/workflows/deploy-production.yml`
- `Dockerfile`
- `.dockerignore`
- `compose.production.yml`
- `deploy/Caddyfile`
- `scripts/backup-database.js`
- `scripts/restore-database.js`
- `scripts/deploy-production.sh`
- `lib/logger.js`
- `lib/monitoring/error-reporter.js`
- `lib/http/request-context.js`
- `lib/database-backup.js`
- `lib/config.js`
- `server.js`
- `.env.production.example`
- `README.md`
- API、运维脚本和配置测试文件

部署、备份、监控和请求上下文分别封装，避免继续把基础设施逻辑堆入 `server.js`。

## 测试与验收

自动测试覆盖：

- JSON 日志字段、级别过滤、白名单上下文和敏感字段脱敏。
- 请求 ID 生成、可信输入校验、响应传播与请求耗时。
- Sentry 缺少 DSN 时降级、上下文过滤、发送失败不影响请求。
- SQLite 快照可读取、`integrity_check`、SHA-256、压缩、保留清理和 S3 上传失败。
- 恢复脚本拒绝缺少显式确认、越界路径、校验失败、损坏数据库和运行中覆盖。
- 生产配置缺失或不安全时启动失败。
- Docker 容器使用非 root 用户、健康检查成功、数据目录持久化。
- GitHub workflow 保持 API/UI 单 worker、生产人工审批、部署 concurrency 锁和 secrets 边界。

验收命令保持单 worker。Docker 与网络相关验证串行执行，不进行压力测试、批量健康探测或循环重试。

## 失败处理原则

- CI 失败：停止，不构建发布产物。
- 生产审批未通过：不连接服务器。
- 部署前备份失败：停止部署。
- 新容器不健康：恢复上一镜像，不自动回滚数据库。
- 定时备份上传失败：保留本地副本并告警。
- Sentry 不可用：降级到本地日志，不影响业务。
- GitHub、镜像仓库或对象存储网络失败：使用有限且带等待的少量重试；达到上限立即停止，禁止循环请求。

## 非目标

本阶段不包含 Kubernetes、多 VPS 高可用、PostgreSQL 迁移、蓝绿部署、Prometheus/Grafana/Loki、自建 Sentry、前端性能追踪、真实支付密钥托管或自动数据库降级。上述能力应在业务规模和可靠性要求提升后单独设计。
