# Socks 收藏与复购补全设计

## 目标

把当前袜子商城的“收藏、复购、浏览历史”从零散入口补成一个可用闭环：用户可以进入独立心愿单页面管理已收藏商品，可以从订单历史或订单详情再次购买历史商品，也可以查看完整浏览历史列表并继续购买。

本阶段复用现有用户会话、匿名会话、订单历史、`saved_products`、`recent_views` 和购物车 API，不引入外部推荐服务、真实履约系统或第三方账号体系。目标是让商城更接近 Amazon 一类平台的留存和复购体验，同时保持本地演示稳定、低复杂度。

## 范围

包含：

- 新增心愿单页面 `?view=wishlist`。
- 在顶部导航、账户区域或页脚加入心愿单入口。
- 心愿单页面展示已收藏商品，支持移除收藏、查看详情、加入购物车。
- 在订单历史卡片和订单详情页加入“再次购买”入口。
- 新增后端复购接口，把历史订单中仍可购买的 SKU 重新加入当前购物车。
- 新增浏览历史完整页面 `?view=recent`。
- 浏览历史完整页面展示最近浏览商品列表，支持查看详情、加入购物车、清空历史。
- 小型“最近浏览”模块继续保留在商城首页或详情页，用于推荐和快速回访。
- 所有新增前端状态继续跟随当前语言切换和黑白灰商城视觉风格。

不包含：

- 多个心愿单分组、公开分享心愿单、协作心愿单。
- 订阅制补货、自动复购计划。
- 复杂推荐算法、跨设备行为分析。
- 真实物流、真实支付或真实用户画像系统。

## 用户体验

### 心愿单页面

用户从顶部账户区域进入 `?view=wishlist`。页面结构延续商城壳层，包含标题区、商品列表区和空状态。

未收藏时显示空状态：“还没有保存的商品”，并提供“去浏览袜子”按钮。已有收藏时，每个商品以紧凑商品卡展示：商品标题、分类、价格、折扣、评分、库存状态、保存时间感知文案、查看详情、加入购物车、移除收藏。

如果用户是匿名访问，心愿单仍可用，因为现有 `saved_products` 已支持匿名 session。登录后使用当前用户 owner，后续如果需要迁移匿名收藏到用户收藏，可以作为下一阶段增强。

### 再次购买

订单历史卡片新增“再次购买”按钮。订单详情页也在订单摘要附近提供同样按钮。

点击后调用后端复购接口。接口根据订单归属、订单条目、商品/SKU 当前状态和库存执行校验：

- 可购买条目加入当前购物车。
- 已下架、SKU 不存在或售罄的条目跳过。
- 库存不足时按可购买上限加入，并返回 warning。

前端展示结果 toast，并刷新购物车抽屉、顶部购物车数量、商品卡片加购反馈。

### 浏览历史完整列表

新增 `?view=recent` 页面，展示当前 owner 的完整最近浏览商品。页面卡片支持查看详情、加入购物车、从历史中清除单个商品、清空全部历史。

现有首页/详情页“最近浏览”小模块继续使用最近 8 个商品；完整列表同样复用 `recent_views`，但接口允许更大 `limit`，默认展示 24 个。

## 数据模型

现有 `saved_products` 可以直接复用：

```text
saved_products
- id
- owner_type
- user_id
- session_id
- product_id
- saved_at
```

现有 `recent_views` 需要轻量增强：

```text
recent_views
- id
- user_id
- session_id
- product_id
- viewed_at
```

本阶段不新增订单表字段。复购直接读取现有订单条目中的 `productId`、`size`、`skuId`、`quantity`，并用当前商品 SKU 库存做重新校验。

## API 设计

### 心愿单

继续使用现有接口：

- `GET /api/saved-products`
- `POST /api/saved-products`
- `DELETE /api/saved-products/:productId`

`GET /api/saved-products` 返回：

```json
{
  "ok": true,
  "savedProductIds": ["sock-02"],
  "items": []
}
```

后端需要保证 `items` 中包含列表页渲染所需商品字段。现有实现已经通过产品目录映射返回商品对象，本阶段前端直接复用。

### 再次购买

新增：

- `POST /api/orders/:id/reorder`

响应：

```json
{
  "ok": true,
  "cart": {
    "items": [],
    "meta": {
      "itemCount": 2
    }
  },
  "addedItems": [
    {
      "productId": "sock-02",
      "size": "39",
      "quantity": 1
    }
  ],
  "skippedItems": [
    {
      "productId": "sock-04",
      "size": "45",
      "quantity": 1,
      "reason": "OUT_OF_STOCK"
    }
  ]
}
```

错误码：

- `ORDER_NOT_FOUND`：订单不存在，或当前登录用户无权访问该订单。
- `REORDER_EMPTY`：订单没有任何可复购条目。
- `CART_STOCK_LIMIT_EXCEEDED`：所有条目都因库存限制无法加入。

匿名订单继续保持当前兼容策略：如果订单没有 `userId`，允许当前演示访问按订单 id 再次购买；如果订单有 `userId`，必须是当前登录用户。

### 浏览历史

新增：

- `GET /api/recent-views?limit=24`
- `DELETE /api/recent-views/:productId`
- `POST /api/recent-views/clear`

现有 `POST /api/recent-views` 继续用于详情页记录浏览。

`GET /api/recent-views?limit=24` 返回：

```json
{
  "ok": true,
  "items": [],
  "productIds": ["sock-02", "sock-01"]
}
```

清空历史返回：

```json
{
  "ok": true,
  "items": [],
  "productIds": []
}
```

## 前端路由与状态

新增视图 key：

- `WISHLIST_VIEW_KEY = "wishlist"`
- `RECENT_VIEW_KEY = "recent"`

新增 DOM 区域：

- `[data-wishlist-view]`
- `[data-wishlist-panel]`
- `[data-recent-view]`
- `[data-recent-panel]`

新增渲染函数：

- `renderWishlistPage()`
- `renderRecentHistoryPage()`
- `createSavedProductCardMarkup(product)`
- `createRecentProductCardMarkup(product)`

新增绑定函数：

- `bindWishlistInteractions()`
- `bindRecentHistoryInteractions()`
- `bindReorderButtons()`

页面切换继续由现有 `syncViews()` 和 `initializePage()` 调度。购物车变更后复用 `renderCartState()`、`refreshVisibleCartFeedback()` 和现有卡片反馈逻辑。

## UI 设计

整体延续黑、白、灰、信息密度偏高的商城风格。新页面使用现有商城壳层、hero 标题区、卡片边框、圆角按钮，不引入新的视觉语言。

心愿单和浏览历史卡片采用“列表 + 紧凑商品信息”的布局，不再复制完整商品大卡，避免页面显得过重。桌面端双列或三列，移动端单列。按钮保持至少 44px 高，主要操作为黑底白字，次要操作为白底黑字边框。

再次购买按钮在订单卡片中作为次级 CTA，避免压过“查看订单详情”。订单详情页中按钮放在订单总览区域，点击后使用 toast 展示加入结果。

## 错误处理

- 心愿单加载失败：显示可恢复空态和“重试”按钮。
- 移除收藏失败：保留原状态并显示 toast。
- 再次购买部分成功：刷新购物车，并展示“部分商品因库存不足未加入”。
- 再次购买全部失败：不改变购物车，显示“暂无可再次购买的商品”。
- 浏览历史为空：显示“还没有浏览记录”，并提供返回商城按钮。
- 清空浏览历史失败：保留列表并显示 toast。

## 测试策略

API 测试：

- `GET /api/saved-products` 返回当前 owner 收藏商品。
- `POST /api/orders/:id/reorder` 可把历史订单条目加入当前购物车。
- `POST /api/orders/:id/reorder` 不允许读取其他用户订单。
- `POST /api/orders/:id/reorder` 跳过售罄或无效 SKU。
- `GET /api/recent-views?limit=24` 返回完整历史列表。
- `DELETE /api/recent-views/:productId` 移除单条历史。
- `POST /api/recent-views/clear` 清空当前 owner 历史。

UI 测试：

- 心愿单页面展示已收藏商品，并支持移除收藏。
- 心愿单页面可把收藏商品加入购物车。
- 订单历史里的“再次购买”刷新购物车数量和抽屉明细。
- 订单详情里的“再次购买”同样可用。
- 浏览历史完整页面展示多个历史商品。
- 浏览历史页面支持清空历史并显示空状态。

验证命令保持单 worker：

```powershell
npx playwright test tests/api.spec.js -g "saved products|reorder|recent views" --workers=1
npx playwright test tests/socks-product-list.spec.js -g "wishlist|reorder|recent history" --workers=1
```

## 实施顺序

1. 先补 API 测试和后端 recent/reorder 能力。
2. 再补心愿单页面 UI 和测试。
3. 再补订单历史/详情页“再次购买”UI 和测试。
4. 最后补浏览历史完整页面 UI 和测试。
5. 跑聚焦回归和全量单 worker 验证。

## 自检

- 没有引入高频外部请求、模型调用或后台智能体。
- 没有新增真实支付、真实物流或复杂推荐算法。
- 复用了现有 owner/session 模型。
- 心愿单、复购、浏览历史都能连接现有购物车和商品详情。
- API 错误码和前端提示都具备可恢复路径。
