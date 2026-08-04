# 袜子商城支付体系升级设计

- 日期：2026-07-30
- 阶段：支付体系升级
- 范围：支付方式配置、支付状态回调、税费/运费计算、发票
- 策略：采用演示级真实支付系统，不接真实第三方支付网关

## 1. 目标

把当前“点击按钮直接创建支付结果”的演示支付流程，升级为更接近真实电商的支付闭环。用户在支付页可以看到更完整的支付方式配置、税费和运费明细；支付结果通过模拟回调落库；支付成功后生成发票；支付失败可以重试，并且订单状态不会被错误推进。

本阶段不接 Stripe、PayPal、Amazon Pay 或银行网关，也不处理真实资金。所有支付、回调和发票数据继续保存在本地 SQLite，但数据模型、接口和页面交互按真实商城拆分，方便后续替换为外部支付服务。

## 2. 现有基础

项目当前已经具备：

- SQLite-backed 商品、SKU、库存、购物车、用户、地址、订单、支付、退款、履约数据。
- 订单状态：`pending_payment`、`paid`、`processing`、`shipped`、`delivered`、`cancelled`、`refund_pending`、`refunded`。
- `payment_attempts` 表，记录支付尝试。
- 支付方式：`card`、`paypal`、`gift_card`。
- 支付结果：`succeeded`、`failed`。
- 支付成功会把订单推进到 `paid`。
- 下单时已有运费快照，来自地址感知物流方式。
- 已有退款生命周期和取消订单规则。

当前不足：

- 支付状态由支付接口同步决定，没有模拟真实网关回调。
- 没有支付回调事件表，无法展示或审计“回调已收到/重复回调/签名失败/处理失败”。
- 没有支付方式配置表，支付方式文案、启用状态、排序、手续费规则写死在代码里。
- 税费和运费没有独立计算快照，订单总价缺少更细的 `tax` / `shipping` / `grandTotal` 结构。
- 支付成功后没有发票记录和发票页面入口。

## 3. 推荐架构

新增独立支付配置、结算金额和发票模块，不继续把所有支付逻辑塞进 `payments.js`。

新增后端模块：

- `lib/repositories/payment-methods.js`：支付方式配置、启用状态、排序、手续费规则。
- `lib/repositories/payment-events.js`：支付回调事件、幂等键、回调处理结果。
- `lib/repositories/invoices.js`：发票生成、发票查询、发票快照。
- `lib/checkout-totals.js`：统一税费、运费、优惠和总价计算。

保留 `payments.js` 作为支付尝试主仓储：

- `payment_attempts` 继续记录用户发起的支付尝试。
- 新增 `status` 取值：`requires_action`、`processing`、`succeeded`、`failed`、`cancelled`。
- 支付接口创建或更新 payment attempt，但最终订单状态以回调结果为准。
- 回调事件负责推进 payment attempt 和 order。
- 发票只在支付成功后生成，一张订单只生成一张 active invoice。

## 4. 支付生命周期设计

### 4.1 支付尝试状态

支付尝试状态：

- `requires_action`：需要用户完成支付动作。
- `processing`：支付处理中，等待回调。
- `succeeded`：支付成功。
- `failed`：支付失败，可重试。
- `cancelled`：支付取消。

状态流转：

- 用户进入支付页后仍可选择支付方式。
- 用户提交支付：创建 payment attempt，初始为 `processing`。
- 模拟回调成功：`processing -> succeeded`，订单变为 `paid`，生成发票。
- 模拟回调失败：`processing -> failed`，订单保持 `pending_payment`。
- 用户重试：创建新的 payment attempt，不覆盖旧尝试。
- 如果订单已进入 `paid`、`cancelled`、`refund_pending`、`refunded`，不允许创建新的支付尝试。

### 4.2 支付回调

新增模拟回调接口：

`POST /api/payments/webhook`

请求示例：

```json
{
  "eventId": "evt-demo-0001",
  "paymentId": "PAY-000001",
  "orderId": "SOCK-20260730-0001",
  "status": "succeeded",
  "provider": "demo_gateway",
  "idempotencyKey": "demo-callback-PAY-000001-succeeded",
  "signature": "demo-signature",
  "locale": "zh-CN"
}
```

规则：

- `eventId` 或 `idempotencyKey` 已处理过时，直接返回已处理结果，不重复推进订单。
- `paymentId` 和 `orderId` 必须匹配。
- 只接受 demo 签名规则，不做真实加密签名。
- `succeeded` 回调生成发票并推进订单到 `paid`。
- `failed` 回调记录失败原因，订单保持 `pending_payment`。
- 订单已终态时拒绝非幂等回调，返回标准错误。

## 5. 支付方式配置

新增支付方式配置：

- `card`：银行卡，默认启用。
- `paypal`：PayPal，默认启用。
- `gift_card`：礼品卡，默认启用。
- `cod`：货到付款，默认禁用或仅展示为不可用演示方式。

字段：

- `id`
- `label`
- `description`
- `status`
- `sort_order`
- `fee_type`
- `fee_amount`
- `min_total`
- `max_total`
- `payload`

接口：

- `GET /api/payment-methods?locale=`
- `PATCH /api/admin/payment-methods/:id`

用户支付页只展示启用且满足订单金额限制的方式。后台可启用/禁用支付方式、调整排序、配置演示手续费。

## 6. 税费与运费计算

新增统一计算器 `lib/checkout-totals.js`，让购物车预估、下单、支付页和发票使用同一套规则。

计算输入：

- 商品行项目。
- 营销折扣。
- 优惠券。
- 地址：`region`、`postalCode`。
- 物流方式。
- 支付方式。

计算输出：

- `subtotal`
- `productDiscount`
- `orderDiscount`
- `couponDiscount`
- `shipping`
- `paymentFee`
- `taxableAmount`
- `tax`
- `grandTotal`
- `currency`
- `taxRegion`
- `calculatedAt`

演示税费规则：

- WA：8.8%
- CA：7.25%
- NY：8.875%
- TX：6.25%
- 其他州：5%
- AK、OR：0%

税费基于折扣后商品金额加支付手续费，不对运费征税。发票保存计算快照，后续订单页面不会因为配置变化而改变历史发票金额。

## 7. 发票设计

新增发票表 `invoices`。

字段：

- `id`
- `order_id`
- `user_id`
- `status`
- `invoice_number`
- `issued_at`
- `currency`
- `subtotal`
- `discount_total`
- `shipping`
- `payment_fee`
- `tax`
- `grand_total`
- `payload`

发票生成规则：

- 支付成功回调后生成。
- 同一订单只有一张 active invoice。
- 重复成功回调不重复生成发票。
- 退款不删除发票，后续退款阶段可扩展 credit memo，本阶段不做。

接口：

- `GET /api/orders/:id/invoice`
- `GET /api/invoices/:id`

前端展示：

- 订单详情页新增“查看发票”入口。
- 发票页或发票面板展示商品明细、税费、运费、支付方式、发票号、开票时间。

## 8. API 设计

### 8.1 支付方式

`GET /api/payment-methods?orderId=&locale=`

返回：

```json
{
  "ok": true,
  "methods": [
    {
      "id": "card",
      "label": "银行卡",
      "description": "支持 Visa / Mastercard 演示支付",
      "status": "active",
      "fee": 0,
      "isAvailable": true
    }
  ]
}
```

### 8.2 创建支付尝试

继续使用：

`POST /api/orders/:id/payments`

请求：

```json
{
  "method": "card",
  "locale": "zh-CN"
}
```

返回：

```json
{
  "ok": true,
  "payment": {
    "id": "PAY-000001",
    "status": "processing",
    "method": "card"
  },
  "nextAction": {
    "type": "demo_webhook",
    "webhookUrl": "/api/payments/webhook"
  }
}
```

为了兼容现有测试和演示按钮，允许传入 `outcome`。如果传入 `outcome`，服务端会创建 payment attempt 后立即调用同一套 webhook 处理逻辑，避免前端旧流程断裂。

### 8.3 支付回调

`POST /api/payments/webhook`

返回：

```json
{
  "ok": true,
  "event": {
    "id": "evt-demo-0001",
    "status": "processed"
  },
  "payment": {
    "status": "succeeded"
  },
  "order": {
    "status": "paid"
  },
  "invoice": {
    "invoiceNumber": "INV-20260730-0001"
  }
}
```

### 8.4 发票

`GET /api/orders/:id/invoice`

- 支付成功后返回发票。
- 未支付订单返回 `INVOICE_NOT_READY`。
- 非订单拥有者不可访问。

## 9. 错误码

支付方式：

- `PAYMENT_METHOD_NOT_FOUND`
- `PAYMENT_METHOD_DISABLED`
- `PAYMENT_METHOD_AMOUNT_NOT_ALLOWED`
- `PAYMENT_METHOD_CONFIG_INVALID`

支付尝试：

- `PAYMENT_ORDER_NOT_PAYABLE`
- `PAYMENT_METHOD_INVALID`
- `PAYMENT_ALREADY_SUCCEEDED`

支付回调：

- `PAYMENT_WEBHOOK_INVALID`
- `PAYMENT_WEBHOOK_SIGNATURE_INVALID`
- `PAYMENT_WEBHOOK_DUPLICATE`
- `PAYMENT_WEBHOOK_ORDER_MISMATCH`
- `PAYMENT_WEBHOOK_FINAL_ORDER`

发票：

- `INVOICE_NOT_READY`
- `INVOICE_NOT_FOUND`
- `INVOICE_FORBIDDEN`

继续使用标准 API 错误信封：

```json
{
  "ok": false,
  "error": {
    "code": "INVOICE_NOT_READY",
    "message": "Invoice is not ready until payment succeeds.",
    "details": {}
  }
}
```

## 10. 前端设计

### 10.1 支付页

支付页新增：

- 支付方式卡片列表，来自 `/api/payment-methods`。
- 订单金额明细：商品小计、优惠、运费、支付手续费、税费、应付总额。
- 支付处理中状态。
- 支付失败提示和重试按钮。
- 支付成功后跳转订单详情，并展示发票入口。

### 10.2 订单详情页

订单详情新增：

- 支付状态卡片。
- 税费/运费/手续费明细。
- 发票入口。
- 发票未生成时显示“支付成功后可查看发票”。

### 10.3 后台页

后台新增或扩展：

- 支付方式配置。
- 支付回调事件查看。
- 发票状态查看。

本阶段不新增复杂支付对账页，只在现有 admin 架构里补最小可用入口。

## 11. 数据模型

新增表：

- `payment_methods`
- `payment_events`
- `invoices`

扩展现有表：

- `payment_attempts.payload` 中新增 `provider`、`providerPaymentId`、`idempotencyKey`、`failureReason`、`nextAction`。
- `orders.payload.totals` 中新增 `paymentFee`、`taxableAmount`、`tax`、`grandTotal`、`currency`、`taxRegion`。
- `orders.payload.payment` 中新增 `provider`、`latestEventId`、`invoiceId`。

## 12. 测试策略

### 12.1 API 测试

新增覆盖：

- 初始化支付方式、支付事件、发票表。
- 返回启用支付方式，并按订单金额过滤。
- 创建支付尝试时状态为 `processing`。
- 成功 webhook 推进支付和订单到 `paid`。
- 失败 webhook 保持订单 `pending_payment`。
- 重复 webhook 幂等，不重复生成发票。
- 支付成功后能查询订单发票。
- 未支付订单查询发票返回 `INVOICE_NOT_READY`。
- 税费按地址区域计算并写入订单快照。
- 禁用支付方式不可支付。

### 12.2 UI 测试

新增覆盖：

- 支付页展示支付方式配置。
- 支付页展示税费、运费、手续费和总额。
- 支付成功后订单详情显示发票入口。
- 支付失败后展示重试状态。
- 订单详情可打开发票明细。
- 后台可禁用支付方式并影响支付页。

### 12.3 回归测试

重点回归：

- 下单、支付、订单详情。
- 取消已支付订单进入退款。
- 发票生成不影响履约和退款。
- 购物车价格、营销优惠、运费显示。
- 后台订单管理、支付方式管理。

## 13. 验收标准

本阶段完成后：

- 用户能在支付页看到配置化支付方式。
- 支付状态通过模拟 webhook 推进，并记录回调事件。
- 重复回调不会重复推进订单或重复生成发票。
- 订单金额包含税费、运费、支付手续费和总额快照。
- 支付成功后自动生成发票。
- 订单详情可查看发票。
- 支付失败可以重试。
- 现有订单取消、退款、履约、售后流程不回退。

## 14. 明确不做

- 不接真实 Stripe、PayPal、Amazon Pay 或银行网关。
- 不保存真实卡号、CVV 或敏感支付凭证。
- 不做真实签名验签，只做 demo 签名校验。
- 不做 PCI 合规流程。
- 不做真实发票 PDF 下载。
- 不做退款 credit memo。
- 不做多币种汇率。
- 不做高并发支付压测。

## 15. 自检

- 范围聚焦支付方式、回调、税费、发票，不混入新的营销或履约功能。
- 支付成功仍然接到现有订单生命周期，不绕过订单状态规则。
- 税费和发票用订单快照，历史订单不会被后续配置变化污染。
- 回调有幂等规则，避免重复支付成功造成重复发票。
- 所有新增中文直接使用 UTF-8 中文字符。
