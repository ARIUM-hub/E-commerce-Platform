# Socks User Session Design

## 目标

在当前袜子商城演示站中增加一套“演示级真实用户系统”，让用户可以注册、登录、登出，并把匿名购物车自然转成用户购物车。结算流程将优先使用当前登录用户的收货地址，订单创建后绑定用户，订单历史只展示当前用户自己的订单。

这次设计保持现有技术路线：Node HTTP 服务、JSON 文件持久化、单页 HTML/CSS/JS 多视图。它不引入数据库、第三方登录、真实支付或外部鉴权服务，目标是做出接近真实商城的数据闭环，同时保持本地演示可控。

## 范围

本阶段包含：

- 注册、登录、登出、读取当前会话。
- 使用 HTTP-only cookie 保存 session id。
- 登录时合并匿名购物车到用户购物车。
- 登录后购物车读写走用户购物车；未登录继续使用匿名购物车。
- 用户收货地址新增、编辑、删除、设为默认。
- checkout 页面可选择或保存用户地址。
- 创建订单时写入 `userId`，并保存订单的地址快照。
- 用户订单历史页展示当前用户订单列表，可进入订单详情。

本阶段不包含：

- 邮箱验证码、短信验证码、找回密码。
- 第三方登录或 OAuth。
- 管理后台、用户权限体系。
- 真实支付、退款、物流接口。
- 多设备冲突合并策略。

## 数据模型

新增 `data/users.json`：

```json
{
  "users": [
    {
      "id": "user-0001",
      "name": "Alex Chen",
      "email": "alex@example.com",
      "passwordHash": "sha256:4f2a7d8c9b0e1f23456789abcdef0123456789abcdef0123456789abcdef0123",
      "passwordSalt": "demo-salt-0001",
      "createdAt": "2026-07-23T00:00:00.000Z",
      "addresses": [
        {
          "id": "addr-0001",
          "name": "Alex Chen",
          "contact": "alex@example.com",
          "address": "100 Demo Street",
          "city": "Seattle",
          "region": "WA",
          "postalCode": "98101",
          "note": "Leave at the door",
          "isDefault": true
        }
      ]
    }
  ]
}
```

新增 `data/sessions.json`：

```json
{
  "sessions": [
    {
      "id": "session-token",
      "userId": "user-0001",
      "createdAt": "2026-07-23T00:00:00.000Z",
      "expiresAt": "2026-08-06T00:00:00.000Z"
    }
  ]
}
```

新增 `data/user-carts.json`：

```json
{
  "carts": [
    {
      "userId": "user-0001",
      "items": [
        { "productId": "sock-01", "size": "39", "quantity": 2 }
      ]
    }
  ]
}
```

继续使用 `data/cart.json` 作为匿名购物车，继续使用 `data/orders.json` 保存订单。订单新增 `userId` 字段；未登录结算如果被允许，`userId` 为 `null`，但本阶段推荐结算前要求登录或注册。

## 会话与安全

密码不明文保存。服务端用 Node 内置 `crypto` 生成 salt，并使用 SHA-256 派生 `passwordHash`。这不是生产级密码策略，但比明文更接近真实系统，也足够用于本地演示。

登录成功后服务端创建 session，响应设置：

```text
Set-Cookie: socks_session=<session-id>; HttpOnly; SameSite=Lax; Path=/; Max-Age=1209600
```

前端不能直接读取 cookie，只通过 `GET /api/session` 获取当前用户摘要。登出时删除 session，并清除 cookie。过期 session 在读取时视为未登录。

## API 设计

认证接口：

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/session`

注册请求：

```json
{
  "name": "Alex Chen",
  "email": "alex@example.com",
  "password": "demo1234"
}
```

注册或登录成功响应：

```json
{
  "ok": true,
  "user": {
    "id": "user-0001",
    "name": "Alex Chen",
    "email": "alex@example.com",
    "addresses": []
  },
  "cart": {
    "items": [],
    "meta": { "itemCount": 0 }
  }
}
```

地址接口：

- `GET /api/me/addresses`
- `POST /api/me/addresses`
- `PATCH /api/me/addresses/:addressId`
- `DELETE /api/me/addresses/:addressId`
- `POST /api/me/addresses/:addressId/default`

订单历史接口：

- `GET /api/me/orders`
- `GET /api/orders/:id`
- `PATCH /api/orders/:id/status`

`GET /api/orders/:id` 登录后只允许读取自己的订单；匿名历史订单如果没有 `userId`，仅保留当前演示兼容能力，不进入用户历史列表。

购物车接口保持 URL 不变：

- `GET /api/cart`
- `POST /api/cart/items`
- `PATCH /api/cart/items`
- `DELETE /api/cart/items`
- `POST /api/cart/clear`

区别在于服务端根据 session 自动选择购物车存储。未登录读取 `cart.json`；已登录读取 `user-carts.json` 中当前用户 cart。

## 匿名购物车转用户购物车

登录或注册成功后，服务端执行一次购物车合并：

1. 读取匿名 `cart.json`。
2. 读取当前用户购物车。
3. 按 `productId + size` 合并数量。
4. 使用现有库存校验，超过库存的数量截断到可购买上限。
5. 写回用户购物车。
6. 清空匿名 `cart.json`。
7. 返回合并后的用户购物车。

如果用户购物车已有 `sock-01 / 39 / 1`，匿名购物车也有 `sock-01 / 39 / 2`，登录后用户购物车变为 `sock-01 / 39 / 3`。如果某商品库存只剩 5 件，合并后最多保留 5 件，并在响应中返回 `cartMergeWarnings`，前端用 toast 提示“部分商品因库存不足已调整数量”。

## 前端页面与交互

全站头部的账户区域从“匿名访客”升级为真实状态：

- 未登录：显示“登录 / 注册”入口。
- 已登录：显示用户姓名、订单历史入口、地址管理入口、登出按钮。

新增视图：

- `?view=auth&mode=login`
- `?view=auth&mode=register`
- `?view=account`
- `?view=addresses`
- `?view=orders`

checkout 页面变化：

- 未登录进入 checkout 时显示登录提示和注册入口，同时保留购物车摘要。
- 登录后 checkout 显示地址选择区。
- 如果用户有默认地址，默认选中并填充。
- 用户可以选择“保存为新地址”。
- 提交订单时使用所选地址快照写入订单。

订单页变化：

- `?view=orders` 展示当前用户订单历史列表。
- `?view=order&id=SOCK-20260723-0001` 展示订单详情。
- 订单详情沿用当前状态流转按钮，但只允许当前订单所属用户访问。

## 错误处理

认证错误：

- 邮箱已注册：`EMAIL_ALREADY_REGISTERED`
- 邮箱或密码错误：`INVALID_CREDENTIALS`
- 未登录访问用户接口：`AUTH_REQUIRED`
- session 过期：`SESSION_EXPIRED`

地址错误：

- 地址字段缺失：`ADDRESS_VALIDATION_FAILED`
- 地址不存在：`ADDRESS_NOT_FOUND`
- 删除默认地址后，如果还有其他地址，自动把最新地址设为默认。

订单错误：

- 访问他人订单：返回 `404 ORDER_NOT_FOUND`，不暴露订单存在性。
- 用户订单历史为空：返回空列表，前端显示空状态。

## 测试策略

后端 API 测试：

- 注册成功并创建 session cookie。
- 重复邮箱注册失败。
- 登录成功并返回当前用户。
- 错误密码登录失败。
- 登出后 `GET /api/session` 返回未登录。
- 登录合并匿名购物车到用户购物车。
- 已登录购物车和匿名购物车互不污染。
- 地址 CRUD 和默认地址切换。
- 创建订单写入 `userId`。
- `GET /api/me/orders` 只返回当前用户订单。
- 用户不能读取他人订单。

前端 Playwright 测试：

- 未登录头部显示登录入口。
- 注册后头部显示用户姓名。
- 匿名加购后登录，购物车数量保留并转为用户购物车。
- 地址管理可新增、设默认、删除。
- checkout 使用默认地址创建订单。
- 订单历史出现新订单。
- 登出后订单历史入口要求登录。

验证命令仍使用低频目标测试，不做循环压测：

```powershell
npm test -- tests/api.spec.js --grep "auth|session|address|user cart|user order"
npm test -- --grep "auth|address|order history|user cart"
```

## 迁移与兼容

为了兼容当前演示数据：

- 如果 `users.json`、`sessions.json`、`user-carts.json` 不存在，服务启动时提示缺失文件。
- 现有匿名购物车和旧订单仍能被读取。
- 新订单创建时，如果用户已登录，必须写入 `userId`。
- 旧的无 `userId` 订单不会出现在用户订单历史里，但仍可通过直接订单详情兼容展示，直到后续明确清理策略。

## 实施顺序

1. 增加用户、session、用户购物车 fixture。
2. 实现注册、登录、登出、当前 session API。
3. 改造购物车 API 为 session-aware。
4. 实现地址管理 API。
5. 改造订单创建和订单读取权限。
6. 增加用户订单历史 API。
7. 增加前端 auth、account、addresses、orders 视图。
8. 改造 checkout 使用登录用户地址。
9. 跑目标回归测试，确认匿名购物车、用户购物车、订单生命周期都正常。

## 自检

- 没有引入外部服务或高频请求。
- 没有设计真实支付、验证码或复杂权限系统。
- 匿名态和登录态购物车边界清晰。
- 订单归属、地址快照、订单历史权限清晰。
- 现有 checkout 和订单生命周期可以在此设计上继续演进。
