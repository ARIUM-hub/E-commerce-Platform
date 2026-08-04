# 袜子商城后台管理设计文档

- 日期：2026-07-27
- 主题：商品管理、库存管理、订单管理、优惠活动配置、数据看板
- 方案：演示级真实后台
- 分支基础：`feature/socks-after-sales-payment-admin`

## 1. 目标

新增一个可用的演示级运营后台，让当前袜子商城从“用户侧完整商城”继续升级为“可被运营管理的商城”。后台必须接入现有 SQLite 真实数据流，而不是读写 JSON 或前端假状态。

一期交付重点：

- 管理员能查看商品、SKU、库存、订单、优惠和关键运营指标
- 管理员能调整 SKU 库存和低库存阈值
- 管理员能推进订单状态
- 管理员能启用或停用优惠券、促销和组合购买
- 普通用户和匿名用户不能访问后台 API 或后台页面数据

## 2. 当前上下文

项目已经具备：

- SQLite 商品表：`products`
- SQLite SKU 表：`product_variants`
- SQLite 订单表：`orders`、`order_items`、`order_timeline`
- SQLite 支付记录表：`payment_attempts`
- SQLite 营销表：`promotions`、`coupons`、`bundles`
- SQLite 售后表：`return_requests`、`return_request_items`、`return_request_events`
- SQLite 客服工单表：`support_tickets`
- 用户与会话体系：`users`、`sessions`
- 单页多视图壳层：`socks-product-list.html?view=...`

已有代码里也存在演示管理员概念：

- 售后状态接口支持 `x-demo-admin: true`
- 当前还没有统一 `view=admin`
- 当前还没有 `lib/repositories/admin.js`

## 3. 范围

### 3.1 商品管理

后台商品管理一期以查看和轻量编辑为主。

功能：

- 商品列表：商品 ID、标题、分类、价格、原价、评分、评价数、SKU 数
- 商品详情：描述、分类、颜色、材质、尺码表、图片相册信息
- 商品状态只读：不做上下架开关，避免影响前台推荐和筛选规则

一期不做：

- 商品新建
- 图片上传
- 富文本编辑器
- 复杂商品属性模板

### 3.2 库存管理

库存管理直接操作 `product_variants`。

功能：

- SKU 列表：SKU、商品、尺码、颜色、材质、库存、低库存阈值、是否可售
- 低库存预警：`stock_quantity > 0 && stock_quantity <= low_stock_threshold`
- 售罄预警：`stock_quantity <= 0 || is_available = 0`
- 库存调整：修改 `stock_quantity`
- 阈值调整：修改 `low_stock_threshold`
- 可售状态调整：修改 `is_available`

规则：

- 库存数量必须是 `0` 到 `9999` 的整数
- 低库存阈值必须是 `0` 到 `999` 的整数
- 售罄 SKU 允许重新补货
- 库存调整只影响后续购物车和结算校验，不回写历史订单快照

### 3.3 订单管理

订单管理复用现有订单生命周期。

功能：

- 订单列表：订单号、用户、金额、状态、支付状态、创建时间、更新时间
- 订单详情：客户信息、收货地址、商品明细、营销快照、支付记录、时间线
- 状态推进：`pending_payment -> paid -> processing -> shipped -> delivered`
- 取消：`pending_payment -> cancelled`

规则：

- 后台推进订单必须复用现有状态转移规则
- 已取消、已送达订单不可继续推进
- 已支付订单不能重新回到待支付
- 支付成功仍优先通过支付流程完成；后台订单管理只提供运营推进和取消能力

### 3.4 优惠活动配置

优惠管理直接读写现有营销表。

功能：

- 优惠券列表：券码、状态、门槛、折扣、有效期
- 促销列表：类型、状态、目标商品或规则、有效期
- 组合购买列表：组合 ID、状态、商品组合
- 启用/停用：支持对 `coupons`、`promotions`、`bundles` 切换 `status`

一期不做复杂规则编辑器，只做启停和查看。原因是现有营销规则 payload 已经能覆盖优惠券、满减、限时折扣和组合购买，后台一期先让运营可以控制开关，避免引入一套脆弱的规则表单。

### 3.5 数据看板

看板基于真实 SQLite 聚合。

指标：

- 总订单数
- 待支付订单数
- 已支付/处理中订单数
- 总销售额：统计非取消订单 `totals.total`
- 今日订单数
- 低库存 SKU 数
- 售罄 SKU 数
- 待处理售后数：`submitted`、`reviewing`
- 待处理客服工单数：`open`
- 当前启用优惠数量

展示：

- 顶部 KPI 卡片
- 最近订单表
- 库存预警表
- 待处理事项列表

## 4. 权限设计

一期采用演示管理员权限，不做复杂 RBAC。

管理员判定：

- 必须先登录
- 管理员邮箱白名单：`admin@socks.test`
- 可通过常量维护：`DEMO_ADMIN_EMAILS = new Set(["admin@socks.test"])`

API 规则：

- 未登录访问后台 API：`401 ADMIN_AUTH_REQUIRED`
- 已登录但不是管理员：`403 ADMIN_FORBIDDEN`
- 管理员可访问全部后台 API

页面规则：

- `view=admin` 未登录时展示登录提示
- 非管理员展示无权限提示
- 管理员展示后台 dashboard

保留兼容：

- 既有售后状态接口中的 `x-demo-admin: true` 可以暂时保留，避免破坏现有测试
- 新增后台 API 不使用 header 绕过，统一走登录用户邮箱判定

## 5. 后端架构

新增文件：

- `lib/repositories/admin.js`

职责：

- 聚合后台 summary
- 列出商品和 SKU
- 更新 SKU 库存字段
- 列出订单和订单详情
- 推进订单状态
- 列出营销资源
- 更新营销资源状态
- 列出售后和客服待处理数据

`server.js` 新增路由：

- `GET /api/admin/summary`
- `GET /api/admin/products`
- `GET /api/admin/inventory`
- `PATCH /api/admin/inventory/:skuId`
- `GET /api/admin/orders`
- `GET /api/admin/orders/:id`
- `PATCH /api/admin/orders/:id/status`
- `GET /api/admin/marketing`
- `PATCH /api/admin/marketing/:type/:id/status`

可选后续路由：

- `GET /api/admin/returns`
- `GET /api/admin/support-tickets`

说明：一期看板可以先在 `summary` 中返回售后和客服摘要；如果页面需要独立 tab，再补独立接口。

## 6. API 设计

### 6.1 `GET /api/admin/summary`

返回：

```json
{
  "ok": true,
  "summary": {
    "ordersTotal": 12,
    "ordersToday": 3,
    "pendingPayment": 2,
    "activeFulfillment": 4,
    "grossSales": 578,
    "lowStockSkuCount": 5,
    "outOfStockSkuCount": 2,
    "pendingReturnCount": 1,
    "openTicketCount": 2,
    "activeMarketingCount": 4
  },
  "recentOrders": [],
  "stockAlerts": [],
  "workQueue": []
}
```

### 6.2 `GET /api/admin/products`

返回后台商品列表，字段包含：

- `id`
- `title`
- `category`
- `price`
- `originalPrice`
- `ratingValue`
- `reviewCount`
- `variantCount`
- `totalStock`
- `lowStockCount`
- `outOfStockCount`

### 6.3 `GET /api/admin/inventory`

返回所有 SKU。

支持 query：

- `stock=all|low-stock|out-of-stock|in-stock`
- `q=<商品标题/SKU/分类>`

### 6.4 `PATCH /api/admin/inventory/:skuId`

请求：

```json
{
  "stockQuantity": 12,
  "lowStockThreshold": 3,
  "isAvailable": true
}
```

规则：

- 三个字段都可选，但至少传一个
- 只更新传入字段
- 返回更新后的 SKU 和对应商品库存摘要

错误码：

- `ADMIN_SKU_NOT_FOUND`
- `ADMIN_STOCK_INVALID`
- `ADMIN_LOW_STOCK_THRESHOLD_INVALID`

### 6.5 `GET /api/admin/orders`

返回后台订单列表。

支持 query：

- `status=pending_payment|paid|processing|shipped|delivered|cancelled`
- `q=<订单号/用户联系方式>`

### 6.6 `GET /api/admin/orders/:id`

返回订单详情，包含：

- 订单 payload
- 支付尝试列表
- 可执行状态动作
- 关联售后单数量

### 6.7 `PATCH /api/admin/orders/:id/status`

请求：

```json
{
  "status": "processing",
  "locale": "zh-CN"
}
```

规则：

- 复用订单状态转移规则
- 返回更新后的订单

错误码：

- `ADMIN_ORDER_NOT_FOUND`
- `ADMIN_ORDER_STATUS_INVALID`
- `ADMIN_ORDER_TRANSITION_INVALID`

### 6.8 `GET /api/admin/marketing`

返回：

- `coupons`
- `promotions`
- `bundles`

包含 active/inactive 全量资源，而不是只返回当前可用资源。

### 6.9 `PATCH /api/admin/marketing/:type/:id/status`

`type` 可选：

- `coupon`
- `promotion`
- `bundle`

请求：

```json
{
  "status": "active"
}
```

规则：

- `status` 只允许 `active`、`inactive`
- 优惠券 ID 使用券码
- 更新对应表的 `status`

错误码：

- `ADMIN_MARKETING_TYPE_INVALID`
- `ADMIN_MARKETING_STATUS_INVALID`
- `ADMIN_MARKETING_RESOURCE_NOT_FOUND`

## 7. 前端页面设计

新增视图：

- `socks-product-list.html?view=admin`

布局：

- 保留现有顶部导航和页脚
- 主区域使用后台 dashboard 风格
- 黑白灰，高信息密度
- 左侧或顶部 tab：看板 / 商品 / 库存 / 订单 / 优惠
- 移动端 tab 横向滚动，表格变为卡片式列表

页面状态：

- `data-admin-view`
- `data-admin-auth-required`
- `data-admin-forbidden`
- `data-admin-tabs`
- `data-admin-panel`

Tab：

- Dashboard：KPI、最近订单、预警、待处理
- Products：商品表格
- Inventory：SKU 库存表格，支持行内调整
- Orders：订单表格，支持进入详情和状态推进
- Marketing：优惠资源表格，支持启停

## 8. 数据一致性

库存：

- 后台库存更新直接改 `product_variants`
- 前台 `/api/products`、购物车加购、结算库存校验都会读新库存
- 历史订单不因库存更新改变

订单：

- 后台订单状态推进仍使用订单 payload 和 `order_timeline`
- 每次状态变化写入 timeline
- 非法状态流转必须拒绝

营销：

- 后台启停改 `status`
- 前台 `/api/marketing`、购物车 pricing、结算 pricing 会自动读取新的 active 状态
- 不改变已有订单 marketing snapshot

看板：

- 实时从 SQLite 聚合
- 不单独缓存

## 9. 测试策略

API 测试：

- 非登录用户访问后台 summary 返回 `ADMIN_AUTH_REQUIRED`
- 普通登录用户访问后台 summary 返回 `ADMIN_FORBIDDEN`
- 管理员可获取 summary
- 管理员可获取商品列表
- 管理员可获取库存列表和低库存筛选
- 管理员可调整 SKU 库存，前台商品接口同步反映
- 管理员可获取订单列表
- 管理员可推进订单状态，非法流转被拒绝
- 管理员可获取营销全量资源
- 管理员可停用优惠券，购物车价格不再应用该券

UI 测试：

- 管理员登录后打开 `view=admin` 能看到后台 tab
- 未登录打开后台显示登录提示
- 普通用户打开后台显示无权限提示
- 看板渲染 KPI
- 商品 tab 渲染商品表格
- 库存 tab 可调整 SKU 库存
- 订单 tab 可推进订单状态
- 优惠 tab 可停用优惠券

## 10. 验收标准

- `view=admin` 可访问并根据权限显示正确状态
- 后台数据来自 SQLite 真实表
- 商品、库存、订单、优惠、看板五个模块都有可见页面
- 库存调整会影响前台商品库存展示和加购/结算校验
- 优惠启停会影响前台营销和购物车价格计算
- 订单状态推进会写入订单时间线
- 现有用户侧购物流程、支付流程、售后流程不被破坏

## 11. 明确不做

- 不做真实企业级 RBAC
- 不做管理员注册页面
- 不做商品新建和图片上传
- 不做富文本商品编辑器
- 不做复杂优惠规则编辑器
- 不做真实财务报表、退款报表或导出 Excel
- 不做客服回复系统
- 不做后台库存批量导入

这些能力可以在后台二期继续扩展。
