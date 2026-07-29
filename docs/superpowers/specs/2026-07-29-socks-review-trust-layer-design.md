# Socks Review Trust Layer Design

## Goal

补全商品详情页评论信任层，让评价区更接近真实电商平台：买家晒图、Verified Purchase、有帮助点赞、差评原因标签。

## Scope

本阶段只增强详情页评论体系，不扩展后台审核、真实买家订单校验或图片上传。评论仍从 `product_reviews` 表和 API 读取，前端不硬编码展示。

## Data Model

扩展 `product_reviews`：

- `verified_purchase`：是否显示 Verified Purchase。
- `helpful_count`：评论“有帮助”数量。
- `media_urls`：买家晒图 URL 数组，存 JSON 字符串。
- `reason_tags`：差评原因标签数组，存 JSON 字符串。

新增 `product_review_helpful_votes`：

- 用于记录某个用户或匿名会话是否已经给某条评论点过“有帮助”。
- 同一用户/会话对同一评论重复点击不重复增加数量。

## API

- `GET /api/products/:id/reviews` 返回增强字段。
- `POST /api/products/:id/reviews/:reviewId/helpful` 创建匿名会话或使用登录用户记录投票，返回更新后的评论和评论列表。

## UI

详情页评论卡片显示：

- Verified Purchase 标签。
- 买家晒图缩略图。
- 差评原因标签，仅当评论包含 `reasonTags` 时显示。
- “有帮助”按钮和当前计数。

## Testing

使用 Playwright 单 worker：

- API 测试验证增强字段和有帮助投票幂等。
- UI 测试验证详情页可见标签、晒图、差评标签和点击有帮助后的计数更新。
