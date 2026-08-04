# 袜子商城真实履约升级设计

- 日期：2026-07-29
- 阶段：真实履约与订单生命周期升级
- 范围：按地址计算预计送达、物流方式、发货单号、物流轨迹、订单取消、退款进度
- 策略：单独一阶段开发，不混入收藏、复购、营销或后台大改

## 1. 目标

把当前商城从“订单可支付、可推进状态”的演示流程，升级为更接近真实电商的履约闭环。用户下单后不仅能看到订单状态，还能看到物流方式、预计送达、发货单号、轨迹节点、取消入口和退款进度。

本阶段不接真实物流商、不接真实退款网关。所有履约与退款数据仍由本地 SQLite 持久化，但模型、接口和页面交互按真实商城拆分，方便后续替换为第三方物流或支付服务。

## 2. 现有基础

项目当前已经具备：

- SQLite-backed 商品、SKU、库存、购物车、用户、地址、订单、支付、售后、营销数据。
- 订单状态：`pending_payment`、`paid`、`processing`、`shipped`、`delivered`、`cancelled`。
- 支付记录：`payment_attempts`，支付成功会把订单推进到 `paid`。
- 售后记录：`return_requests`，可追踪退换货申请状态。
- 前端订单历史、订单详情、支付页、售后页和后台订单管理。

当前不足：

- 预计送达主要由物流方式的固定天数给出，没有按地址差异计算。
- 订单 `shipped` 只是一个状态，没有发货单号和物流轨迹。
- 取消订单只是状态推进，缺少用户侧取消规则和退款进度。
- 退款没有独立生命周期，无法展示“退款申请中/处理中/已退款”。

## 3. 推荐架构

新增独立履约模块，而不是把所有逻辑继续堆进 `orders.js`。

新增后端模块：

- `lib/repositories/fulfillment.js`：物流方式、预计送达、发货、物流轨迹。
- `lib/repositories/refunds.js`：取消后退款进度、退款状态流转。

保留订单作为交易主对象：

- `orders.status` 继续表示订单整体阶段。
- `order.fulfillment` 表示履约状态和物流信息快照。
- `order.refund` 表示退款状态和金额快照。
- `order.timeline` 继续记录订单主生命周期节点。
- 新增独立表记录更细的物流轨迹和退款事件，避免订单 payload 越来越重。

## 4. 生命周期设计

### 4.1 订单主状态

继续使用现有状态，并新增退款相关状态：

- `pending_payment`：待支付。
- `paid`：已支付，尚未开始仓库处理。
- `processing`：仓库处理中。
- `shipped`：已发货。
- `delivered`：已送达。
- `cancelled`：已取消，通常用于未支付取消。
- `refund_pending`：已取消且需要退款，退款处理中。
- `refunded`：已退款完成。

允许的用户侧取消规则：

- `pending_payment` 可直接取消，订单变为 `cancelled`，不产生退款。
- `paid` 可取消，订单变为 `refund_pending`，创建退款记录。
- `processing` 可取消，订单变为 `refund_pending`，创建退款记录。
- `shipped` 和 `delivered` 不允许直接取消，引导用户走售后退换流程。
- `cancelled`、`refund_pending`、`refunded` 不允许重复取消。

允许的后台/演示推进规则：

- `paid -> processing`
- `processing -> shipped`
- `shipped -> delivered`
- `refund_pending -> refunded`

### 4.2 履约状态

履约状态与订单主状态分离：

- `not_started`：未开始。
- `preparing`：仓库处理中。
- `label_created`：已生成发货单。
- `in_transit`：运输中。
- `out_for_delivery`：派送中。
- `delivered`：已送达。
- `cancelled`：履约取消。

订单状态与履约状态同步规则：

- 创建订单时：`fulfillment.status = not_started`。
- 支付成功后：仍为 `not_started`。
- 订单进入 `processing`：履约变为 `preparing`。
- 订单进入 `shipped`：生成发货单号，履约变为 `label_created`，并创建第一批轨迹。
- 后台或演示按钮可继续推进物流：`label_created -> in_transit -> out_for_delivery -> delivered`。
- 物流到 `delivered` 时，订单主状态同步为 `delivered`。

### 4.3 退款状态

退款状态独立：

- `none`：无退款。
- `requested`：已发起退款。
- `processing`：退款处理中。
- `succeeded`：退款成功。
- `failed`：退款失败。

取消已支付订单时：

- 创建 refund 记录。
- 订单状态变为 `refund_pending`。
- 退款状态初始为 `requested`。
- 演示推进可从 `requested -> processing -> succeeded`。
- 退款成功后订单状态变为 `refunded`。

本阶段不做真实原路退回，只做演示级退款生命周期与金额快照。

## 5. 物流方式与预计送达

物流方式从当前固定对象升级为可计算配置：

- `standard`：标准配送，默认免费。
- `express`：加急配送，收取运费。
- `economy`：经济配送，较慢但可模拟更低成本。

预计送达按地址计算：

- 基础天数来自物流方式。
- `region` / `postalCode` 影响额外天数。
- 示例规则：
- WA、CA、OR：基础天数不变。
- NY、FL、TX：基础天数 +1。
- AK、HI 或邮编无法识别：基础天数 +2。
- 加急配送最短 1 天，标准配送最短 3 天，经济配送最短 5 天。

返回数据需要包含：

- `estimatedDeliveryDate`
- `estimatedDeliveryLabel`
- `deliveryWindow`
- `shippingMethod`
- `addressZone`

## 6. 数据模型

### 6.1 `fulfillments`

字段：

- `id`
- `order_id`
- `user_id`
- `status`
- `shipping_method_id`
- `carrier`
- `tracking_number`
- `estimated_delivery_date`
- `delivery_window_start`
- `delivery_window_end`
- `address_zone`
- `created_at`
- `updated_at`
- `payload`

### 6.2 `fulfillment_events`

字段：

- `id`
- `fulfillment_id`
- `order_id`
- `status`
- `label`
- `location`
- `description`
- `at`

### 6.3 `refunds`

字段：

- `id`
- `order_id`
- `user_id`
- `status`
- `amount`
- `reason`
- `method`
- `created_at`
- `updated_at`
- `payload`

### 6.4 `refund_events`

字段：

- `id`
- `refund_id`
- `order_id`
- `status`
- `label`
- `description`
- `at`

## 7. API 设计

### 7.1 履约 API

`GET /api/shipping-methods?postalCode=&region=&locale=`

- 返回可选物流方式。
- 每个方式包含费用、预计送达日期、送达窗口。
- 用于结算页选择物流方式前预览。

`GET /api/orders/:id/fulfillment`

- 返回订单履约信息、发货单号、物流轨迹。
- 只有订单归属用户或演示管理员可访问。

`PATCH /api/orders/:id/fulfillment/status`

- 演示管理员推进履约状态。
- 可选状态：`in_transit`、`out_for_delivery`、`delivered`。
- 普通用户不可调用。

### 7.2 订单取消 API

`POST /api/orders/:id/cancel`

请求：

```json
{
  "reason": "changed_mind",
  "locale": "zh-CN"
}
```

规则：

- 未登录用户只能取消当前匿名会话可见订单。
- 登录用户只能取消自己的订单。
- `pending_payment` 取消返回订单 `cancelled`。
- `paid` / `processing` 取消返回订单 `refund_pending`，并返回退款记录。
- `shipped` / `delivered` 返回 `ORDER_CANCEL_NOT_ALLOWED`。

### 7.3 退款 API

`GET /api/orders/:id/refunds`

- 返回订单退款记录和进度事件。

`PATCH /api/refunds/:id/status`

- 演示管理员推进退款状态。
- `requested -> processing -> succeeded`
- `succeeded` 后订单状态同步为 `refunded`。

## 8. 错误码

订单取消：

- `ORDER_NOT_FOUND`
- `ORDER_CANCEL_NOT_ALLOWED`
- `ORDER_CANCEL_ALREADY_FINAL`
- `ORDER_CANCEL_FORBIDDEN`

履约：

- `FULFILLMENT_NOT_FOUND`
- `FULFILLMENT_STATUS_INVALID`
- `FULFILLMENT_TRANSITION_INVALID`
- `FULFILLMENT_FORBIDDEN`

退款：

- `REFUND_NOT_FOUND`
- `REFUND_STATUS_INVALID`
- `REFUND_TRANSITION_INVALID`
- `REFUND_FORBIDDEN`

继续使用标准 API 错误信封：

```json
{
  "error": {
    "code": "ORDER_CANCEL_NOT_ALLOWED",
    "message": "Order can no longer be cancelled."
  }
}
```

## 9. 前端设计

### 9.1 结算页

增强配送方式区：

- 输入地址后展示按地址计算的预计送达。
- 物流方式按钮显示费用和送达窗口。
- 切换物流方式后重新计算订单总价。

### 9.2 订单详情页

新增履约卡片：

- 当前物流状态。
- 物流方式。
- 预计送达。
- 发货单号。
- 物流轨迹时间线。

新增订单操作：

- 待支付：取消订单、继续支付。
- 已支付/处理中：取消订单。
- 已发货/已送达：隐藏取消订单，引导申请售后。
- 退款处理中：展示退款进度。
- 已退款：展示退款完成状态。

### 9.3 订单历史页

订单卡片增加：

- 预计送达或物流状态摘要。
- 可取消状态展示“取消订单”。
- 退款中展示“退款处理中”。
- 已发货展示“查看物流”。

### 9.4 后台页

订单管理增加两个演示操作：

- 推进履约状态。
- 推进退款状态。

本阶段不新增复杂后台页面，只在现有订单 tab 内补操作和状态信息。

## 10. 多语言

新增中英文文案：

- 物流方式名称。
- 预计送达、送达窗口。
- 物流轨迹节点。
- 取消原因。
- 退款状态。
- 取消失败与退款失败提示。

所有前端新增中文直接使用 UTF-8 中文字符，不使用 Unicode 转义写法。

## 11. 测试策略

### 11.1 API 测试

新增覆盖：

- 按地址返回不同预计送达日期。
- 创建订单时保存履约快照。
- 支付后订单仍可展示履约信息。
- 发货时生成 tracking number。
- 推进物流轨迹并同步订单送达状态。
- 未支付订单取消后变为 `cancelled` 且无退款。
- 已支付订单取消后变为 `refund_pending` 且创建 refund。
- 已发货订单不可取消。
- 退款推进到 `succeeded` 后订单变为 `refunded`。

### 11.2 UI 测试

新增覆盖：

- 结算页按地址展示预计送达。
- 订单详情显示物流卡片、发货单号和轨迹。
- 用户取消待支付订单。
- 用户取消已支付订单并看到退款进度。
- 已发货订单隐藏取消入口并保留售后入口。
- 后台订单 tab 可推进物流和退款状态。

### 11.3 回归测试

重点回归：

- 下单、支付、订单详情。
- 订单历史。
- 售后申请。
- 后台订单状态推进。
- 购物车库存扣减。

## 12. 验收标准

本阶段完成后：

- 用户在结算页能看到按地址计算的物流方式与预计送达。
- 下单后订单持久化履约快照。
- 订单详情能展示真实感更强的物流轨迹和发货单号。
- 用户可以按规则取消订单。
- 已付款订单取消会进入退款进度，而不是只改一个订单状态。
- 后台能推进履约和退款状态。
- 现有支付、售后、复购、订单历史不回退。

## 13. 明确不做

- 不接真实物流商 API。
- 不做真实退款打款。
- 不做多包裹拆单。
- 不做跨境清关、税费重新计算。
- 不做物流异常申诉。
- 不做退款到不同支付方式的复杂规则。
- 不引入高并发后台智能体或批量接口压力测试。

## 14. 自检

- 范围聚焦在履约、取消、退款，不覆盖新的营销或客服大功能。
- 数据模型把订单、履约、退款拆开，避免生命周期互相污染。
- API 与现有 `/api/orders/:id/...` 风格一致。
- 用户侧与后台侧权限边界明确。
- 测试策略覆盖核心状态流转和前端展示。
