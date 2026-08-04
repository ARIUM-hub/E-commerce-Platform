# Socks Product Page Commerce Depth Design

## Goal

把袜子商城的商品页增强到更接近亚马逊式商品详情体验：支持收藏/稍后购买、商品问答 Q&A、评论筛选排序，并全部接入现有真实数据流。

## Scope

本阶段只做商品页相关增强，不扩展真实支付、物流、发票或后台审核流。功能覆盖列表页商品卡片和详情页：

- 收藏/稍后购买：用户可以在商品卡片和详情页保存商品。登录用户归属到 `user_id`，未登录用户归属到 `session_id`。
- 商品 Q&A：详情页展示每个商品的示例问答，用户可以提交新问题。问答从后端读取，不硬编码在前端。
- 评论筛选排序：详情页评论区支持按最新、评分高到低、评分低到高排序，并支持只看 5 星或 4 星评论。

## Data Model

新增 SQLite 表：

- `saved_products`：保存用户或匿名会话收藏的商品，包含 `owner_type`、`user_id`、`session_id`、`product_id`、`saved_at`。
- `product_questions`：保存商品问答，包含 `product_id`、`author`、`question`、`answer`、`locale`、`created_at`。

评论排序筛选复用现有 `product_reviews` 表，不新增表。

## API Design

- `GET /api/saved-products`：返回当前用户/会话保存的商品 ID 和商品摘要。
- `POST /api/saved-products`：保存一个商品，必要时创建匿名会话。
- `DELETE /api/saved-products/:productId`：取消保存一个商品。
- `GET /api/products/:id/questions`：返回商品问答列表和数量摘要。
- `POST /api/products/:id/questions`：提交一个问题，回答可以为空，后续后台能力再补审核/答复。
- `GET /api/products/:id/reviews?sort=newest|rating-desc|rating-asc&rating=5|4|3|2|1`：返回排序筛选后的评论。

## UI Design

商品卡片增加“收藏”小按钮，详情页主购买区增加“保存到稍后购买”。按钮状态需要跟随接口返回切换，并用轻提示反馈成功/失败。

详情页评论区在标题下方增加筛选排序控件，评论列表和评分摘要随筛选结果刷新。Q&A 放在评论区上方或商品详情段落之后，展示 3 条种子问答和提交问题表单。

## Testing

使用 Playwright 单 worker：

- API 测试覆盖保存/取消保存、匿名会话保存、商品问答读取/提交、评论排序筛选。
- UI 测试覆盖详情页保存按钮状态、Q&A 展示与提交、评论筛选排序改变列表。
