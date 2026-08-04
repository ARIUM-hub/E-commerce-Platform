# 袜子商城工程化底座设计文档

- 日期：2026-07-28
- 主题：拆分单体文件、前后端模块化、数据库迁移、环境配置、日志与基础安全校验
- 推荐方案：第一阶段工程化底座优先，先稳住后端边界和前端入口，再逐步拆完整页面

## 1. 目标

把当前袜子商城从“功能持续堆在单体文件里”的演示项目，升级成更接近真实商城工程结构的项目。第一阶段目标不是一次性重写整站，而是建立可持续扩展的底座：配置集中、日志统一、数据库迁移可追踪、基础安全响应头和请求校验到位，后端路由从 `server.js` 逐步拆出，前端大 HTML 先拆出 JavaScript 入口，为后续 CSS、模板和组件拆分留出稳定路径。

工程化改造必须保持现有商城行为稳定：商品列表、详情页、购物车、结算、订单、用户系统、营销、客服信任体系和后台管理都不能因为拆分而退化。

## 2. 当前上下文

最新开发基线是 `feature/socks-after-sales-payment-admin` 分支，当前项目已经具备：

- 单页商城入口：`socks-product-list.html`
- 后端入口：`server.js`
- SQLite 数据库层：`lib/database.js`
- API 错误工具：`lib/api-errors.js`
- Repository 层：商品、购物车、用户、订单、支付、退换、客服、营销、后台管理
- Playwright API 和 UI 测试
- 演示级真实数据流：SKU 库存、购物车、结算、订单生命周期、用户会话、地址、营销、客服、后台管理

主要工程化痛点：

- `server.js` 已承担配置、静态文件、请求解析、认证、路由、业务编排和错误处理，文件过大。
- `socks-product-list.html` 已包含大量 CSS、HTML 和 JS，后续继续加功能会越来越难安全修改。
- `lib/database.js` 使用 idempotent schema 初始化和少量补丁函数，还没有版本化迁移记录。
- 环境变量散落在入口文件和测试配置中，没有集中校验和默认值说明。
- 日志仍以 `console.log` / `console.error` 为主，不利于区分请求日志、系统错误和测试输出。
- 静态资源和 API 响应缺少统一安全响应头。
- 请求体大小、JSON 解析错误、HTTP 方法限制和常见输入边界仍分散处理。

## 3. 范围

### 3.1 包含

- 新增集中配置模块，统一读取 `PORT`、`HOST`、`DATA_DIR`、`NODE_ENV`、`LOG_LEVEL`、请求体大小限制和安全开关。
- 新增轻量日志模块，支持 `debug`、`info`、`warn`、`error` 等级，默认测试环境降低噪音。
- 新增 HTTP 工具模块，集中 JSON 响应、错误响应、请求体读取、Cookie 工具和静态文件响应。
- 新增基础安全模块，统一设置安全响应头和简单请求限制。
- 新增版本化数据库迁移骨架，记录已执行 migration，并把现有 schema 初始化迁移到可追踪结构。
- 新增路由注册边界，把 `server.js` 拆成“启动入口 + 路由分发 + 领域 route 文件”的结构。
- 前端先拆出 `public/js/storefront-app.js`，保留 HTML 结构和 CSS 在原文件中，降低第一阶段风险。
- 更新 Playwright 配置使用集中环境默认值，同时继续单 worker 友好。
- 增加 API 测试覆盖配置、健康检查、安全头、请求大小限制、migration 幂等性和购物车变更 pricing 快照。

### 3.2 不包含

- 不引入 React、Vue、Vite、Next.js 或大型前端框架。
- 不把全部 CSS 拆成多个文件。
- 不把 HTML 模板完全组件化。
- 不替换 Node 原生 HTTP 服务器为 Express、Fastify 或 Koa。
- 不接入真实生产日志平台、Sentry、OpenTelemetry 或云数据库。
- 不做压力测试、批量健康检查或多模型/多供应商探测。
- 不改变现有用户可见页面风格和核心业务流程。

## 4. 推荐架构

采用“原生 Node HTTP + 小模块边界”的渐进式拆分。

后端仍保留 `server.js` 作为启动入口，但它只负责加载配置、初始化数据库、创建 HTTP server、注册路由和启动监听。实际能力下沉到 `lib/config.js`、`lib/logger.js`、`lib/http/*`、`lib/security.js`、`lib/routes/*` 和 `lib/database/*`。

前端不做框架迁移，第一阶段只把页面脚本从 `socks-product-list.html` 拆到 `public/js/storefront-app.js`，HTML 中改为引用外部脚本。这样能显著降低主 HTML 文件体积，同时避免 CSS 和 DOM 结构大规模移动导致 UI 测试不稳定。

## 5. 后端模块设计

### 5.1 配置模块

新增 `lib/config.js`：

- `createConfig(env = process.env)`
- 统一输出 `host`、`port`、`rootDir`、`dataDir`、`nodeEnv`、`isTest`、`logLevel`、`requestBodyLimitBytes`、`securityHeadersEnabled`
- 对非法端口、非法请求体限制、空 `DATA_DIR` 返回可读错误
- 测试环境默认 `PORT=4173`，生产/开发默认同现有行为

配置模块只负责解析和校验，不启动服务，不访问数据库。

### 5.2 日志模块

新增 `lib/logger.js`：

- `createLogger({ level, sink })`
- 输出结构化文本日志，包含时间、级别、事件名和上下文 JSON
- 默认 `info`
- `NODE_ENV=test` 默认 `warn`
- 支持测试传入内存 sink，避免污染测试输出

后端入口和 route 捕获错误时使用 logger，不再直接散落 `console.error`。

### 5.3 HTTP 工具模块

新增目录 `lib/http/`：

- `responses.js`：`sendJson`、`sendJsonWithHeaders`、`sendError`
- `request-body.js`：`readJsonBody(request, { limitBytes })`
- `cookies.js`：`getCookieValue`、`createCookie`、`expireCookie`
- `static-files.js`：静态路径解析、MIME 类型和文件响应
- `router.js`：轻量 route 注册和 method/path 匹配

请求体读取应支持：

- JSON 解析失败返回 `INVALID_JSON`
- 超过限制返回 `REQUEST_BODY_TOO_LARGE`
- 空 body 按 `{}` 处理或由具体 route 校验必填字段

### 5.4 安全模块

新增 `lib/security.js`：

- 为 HTML、JS、JSON 响应添加基础安全头
- 禁止静态路径穿越
- 对非允许 HTTP 方法返回统一 `METHOD_NOT_ALLOWED`
- 对未知资源返回统一 `NOT_FOUND`

建议响应头：

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `X-Frame-Options: DENY`
- `Permissions-Policy: geolocation=(), microphone=(), camera=()`
- `Content-Security-Policy` 第一阶段使用保守兼容策略，允许当前内联样式，外部脚本仅同源

由于当前页面仍有内联样式和大量动态 DOM，本阶段不强行启用严格无内联 CSP。严格 CSP 作为后续前端拆分后的第二阶段目标。

## 6. 路由模块化

新增 `lib/routes/`，按业务边界拆分：

- `health-routes.js`
- `product-routes.js`
- `cart-routes.js`
- `auth-routes.js`
- `user-routes.js`
- `order-routes.js`
- `payment-routes.js`
- `return-routes.js`
- `marketing-routes.js`
- `support-routes.js`
- `admin-routes.js`

每个 route 文件导出 `registerXRoutes(router, context)`。`context` 包含：

- `config`
- `logger`
- `db` 或 `withDatabase`
- repositories
- 共享服务函数，例如 session、cart payload、pricing

第一阶段优先迁移低耦合路由和基础设施：

- health
- products
- marketing
- trust/support
- cart

订单、支付、退换、后台管理可在第一阶段保留在 `server.js` 或按计划逐步迁移。原则是每次迁移都必须有测试保护，并保持 API 响应完全兼容。

## 7. 数据库迁移设计

新增目录 `lib/database/`：

- `connection.js`：数据库驱动加载、路径解析、连接创建
- `migrations.js`：migration 列表、执行器和记录表
- `schema.js`：当前 schema SQL 或初始 migration
- `seed.js`：产品和营销 seed
- `index.js`：对外导出兼容现有 `createDatabase`、`initializeDatabase`、`resetDatabase`、`getDatabasePath`

新增表：

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);
```

迁移规则：

- migration id 使用递增字符串，例如 `0001_initial_schema`
- 每个 migration 必须幂等或由 `schema_migrations` 保证只执行一次
- `initializeDatabase` 调用 migration runner，再执行 seed
- 测试验证重复初始化不会重复 seed，也不会重复执行 migration
- 现有 `ensureCartCouponColumn` 改成 migration，避免继续堆补丁函数

本阶段不要求拆分每张表为独立 migration 文件，但迁移执行器必须支持后续继续追加 migration。

## 8. 前端拆分设计

第一阶段只做“脚本外置”：

- 创建 `public/js/storefront-app.js`
- 把当前 `socks-product-list.html` 中主 `<script>` 内容移动进去
- HTML 保留 DOM、CSS 和现有 `data-*` 测试选择器
- HTML 底部改为 `<script src="/public/js/storefront-app.js" defer></script>`
- 静态文件服务允许 `/public/js/storefront-app.js`

这样可以先把前端逻辑从 HTML 中抽离，后续再继续拆：

- `public/css/storefront.css`
- `public/js/storefront/state.js`
- `public/js/storefront/api.js`
- `public/js/storefront/cart.js`
- `public/js/storefront/views/*.js`

第一阶段不引入 ES modules，优先使用普通脚本保持浏览器兼容和测试稳定。等脚本稳定外置后，再评估是否按模块拆成多个同源脚本。

## 9. 环境配置

新增 `.env.example` 或 `docs` 中的环境说明：

- `HOST=127.0.0.1`
- `PORT=4173`
- `DATA_DIR=data`
- `NODE_ENV=development`
- `LOG_LEVEL=info`
- `REQUEST_BODY_LIMIT_BYTES=1048576`
- `SECURITY_HEADERS_ENABLED=true`

当前不强制引入 `dotenv` 依赖，避免额外安装风险。运行时仍读取真实环境变量，示例文件只作为协作说明。

## 10. 基础安全校验

新增或统一校验：

- JSON 请求体最大 1MB
- 静态文件路径必须落在允许目录内
- 非 GET/HEAD 静态请求返回 `METHOD_NOT_ALLOWED`
- API 未匹配路径返回标准错误信封
- Cookie 设置统一包含 `HttpOnly`、`SameSite=Lax`，并按开发环境保留非 Secure
- 管理端接口继续只允许 demo admin
- 不输出堆栈到 API 响应

这不是生产安全审计，只是让演示商城具备真实项目应有的基础边界。

## 11. 测试策略

### 11.1 API 和单元测试

新增或调整测试：

- 配置模块能解析默认值和测试环境值
- 非法端口返回清晰错误
- 日志模块按等级过滤输出
- `GET /api/health` 保持可用
- API 响应带基础安全头
- 静态 HTML/JS 响应带正确 content type
- JSON 请求体过大返回 `REQUEST_BODY_TOO_LARGE`
- 无效 JSON 返回 `INVALID_JSON`
- migration 表会创建并记录已执行 migration
- 重复初始化数据库不会重复插入产品和营销 seed
- 购物车变更接口仍返回完整 `cart.pricing`

### 11.2 UI 回归

继续使用现有 UI 测试覆盖：

- 商品列表加载
- 搜索和筛选
- 详情页
- 购物车抽屉
- 结算和订单
- 用户登录注册
- 客服和信任体系
- 后台管理

所有 Playwright 命令默认使用 `--workers=1` 或分批执行，避免端口冲突、SQLite 锁争用和高频请求造成熔断风险。

## 12. 实施顺序

推荐拆成五个提交：

1. 配置、日志、HTTP 响应和安全头基础模块。
2. 数据库 migration runner 和兼容导出。
3. 静态文件服务支持 `public/`，并外置 storefront JS。
4. 路由注册器和低耦合 route 迁移。
5. 测试补齐、文档说明和回归修复。

每个提交都应保持测试可运行，不做“半拆分半不可用”的中间状态。

## 13. 风险与缓解

- 前端脚本外置可能改变执行时机。缓解：使用 `defer`，并保留脚本位于 DOM 后的执行假设测试。
- `server.js` 拆路由可能破坏共享 helper。缓解：先提取纯工具，再迁移低耦合路由。
- migration 改造可能影响旧测试数据库。缓解：保留 `initializeDatabase` 兼容 API，并新增幂等测试。
- 安全头可能影响内联脚本或样式。缓解：第一阶段 CSP 保守兼容，不强行禁止当前内联样式。
- 测试批次耗时增加。缓解：聚焦测试优先，最终单 worker 回归。

## 14. 验收标准

- `server.js` 明显减负，配置、日志、HTTP 工具、安全头和部分 route 已拆入 `lib/`。
- 数据库初始化通过 migration runner 执行，并记录到 `schema_migrations`。
- `socks-product-list.html` 的主脚本已外置到 `public/js/storefront-app.js`。
- 原有商城页面、详情页、购物车、结算、订单、用户、营销、客服和后台管理流程不退化。
- API 错误仍使用标准错误信封。
- 安全响应头在 API 和静态资源上可测试。
- 聚焦测试和关键回归测试通过。

## 15. 自检

- 未决标记检查：没有保留未决标记或空章节。
- 一致性检查：第一阶段只做底座和脚本外置，不承诺完整前端组件化。
- 范围检查：该设计可拆成一个实施计划，避免同时引入框架迁移和完整重写。
- 风险检查：明确保留单 worker、分批测试和低频请求，避免再次触发供应商或本地服务熔断。
