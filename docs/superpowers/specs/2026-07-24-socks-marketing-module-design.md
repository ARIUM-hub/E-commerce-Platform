# Socks Marketing Module Design

## Goal

Build a demo-grade but real marketing system for the socks storefront. The module should support coupons, order-level thresholds, limited-time discounts, bundle buying, recommendations, and recently viewed products while keeping cart, checkout, and order totals consistent.

## Current Context

The storefront already uses SQLite-backed products, SKU inventory, carts, sessions, users, addresses, checkout, and orders. Product cards and detail pages already display base discount labels from product data, and there are recommendation surfaces for detail pages, no-result searches, and order confirmation. Pricing is currently calculated in both frontend JavaScript and backend order creation from product `price` and `originalPrice`.

The marketing module must avoid becoming a static UI layer. Promotions should be represented as data, evaluated by backend logic, surfaced through APIs, and snapshotted into orders.

## Scope

### In Scope

- Coupon campaigns with code validation, minimum spend, eligible products or categories, discount amount, and expiration.
- Automatic order promotions such as "spend ¥99, save ¥15" with progress messaging.
- Limited-time product discounts with start/end timestamps and storefront countdown display.
- Bundle offers that add multiple products/SKUs together and apply a bundle discount.
- Recommendation API with typed scenarios: listing empty state, product detail, cart upsell, and order confirmation.
- Recently viewed products tracked by session/user and displayed on storefront/detail surfaces.
- Unified backend pricing summary used by cart, checkout, and order creation.
- Order marketing snapshot so historical orders keep their applied promotion details.

### Out Of Scope

- Production-grade rule engine with complex stacking matrices, user segmentation, campaign auditing, and per-user redemption limits.
- Payment-provider promo codes.
- Multi-currency marketing rules.
- Admin UI for managing campaigns.
- High-frequency analytics or event streaming.

## Data Model

Add marketing-related SQLite tables:

- `promotions`
  Stores automatic campaigns and limited-time discounts. Fields include `id`, `type`, `status`, `starts_at`, `ends_at`, and JSON `payload`.

- `coupons`
  Stores coupon campaigns. Fields include `code`, `status`, `starts_at`, `ends_at`, and JSON `payload`.

- `bundles`
  Stores bundle definitions. Fields include `id`, `status`, and JSON `payload`.

- `recent_views`
  Stores recent product views by `session_id` or `user_id`, with `product_id` and `viewed_at`.

Use seed data inside database initialization so test fixtures remain deterministic. JSON payloads keep this demo flexible without building a full campaign schema too early.

## Promotion Types

### Coupons

Initial coupons:

- `SOCK10`: ¥10 off when eligible cart total is at least ¥59.
- `SOCK20`: ¥20 off when eligible cart total is at least ¥129.
- `FREESHIP`: free standard shipping when cart contains at least one sellable item.

Coupons should be validated by backend API. Invalid, expired, ineligible, or below-threshold coupons return standardized API errors.

### Order Threshold Promotions

Initial automatic promotion:

- Spend ¥99, save ¥15.

Cart and checkout should show both the applied discount and progress toward the next threshold.

### Limited-Time Discounts

Limited-time discounts attach to selected products and override the effective item price during the active window. Product list/detail pages display a countdown and the active promotional price. Backend pricing remains the source of truth.

### Bundle Offers

Initial bundle example:

- Daily refresh bundle: one daily sock plus one no-show sock, with ¥12 bundle savings.

Bundle API returns eligible products and default SKU choices. Add-bundle action posts multiple cart items and returns the updated cart plus pricing.

## Backend API Design

### `GET /api/marketing`

Returns active campaigns for the storefront:

- active coupons that can be displayed or claimed
- automatic promotions
- limited-time discounts
- bundles

### `POST /api/cart/coupon`

Applies a coupon code to the active cart. The cart state stores only the selected coupon code; pricing is recalculated from current campaign data.

### `DELETE /api/cart/coupon`

Removes the selected coupon from the active cart.

### `GET /api/cart`

Extend response with:

- `pricing.subtotal`
- `pricing.productDiscount`
- `pricing.orderDiscount`
- `pricing.couponDiscount`
- `pricing.shipping`
- `pricing.total`
- `pricing.appliedPromotions`
- `pricing.coupon`
- `pricing.thresholdProgress`

### `POST /api/cart/bundles/:bundleId`

Adds the bundle default SKU items to cart after stock validation. The operation should reuse existing cart stock validation and return updated cart/pricing.

### `GET /api/recommendations?scenario=...`

Supported scenarios:

- `detail`
- `cart`
- `empty-search`
- `order`
- `recently-viewed`

The existing recommendation logic can move behind this endpoint while preserving current behavior.

### `POST /api/recent-views`

Records a product view for the active session/user. Ignore unknown products and keep the list bounded.

## Unified Pricing

Create a backend pricing helper that takes:

- cart items
- products
- selected coupon code
- shipping method
- active promotions

It returns a deterministic pricing summary and promotion snapshot. Cart drawer, checkout, and order creation should use this helper.

Order creation must save:

- applied coupon
- applied automatic promotions
- applied limited-time discounts
- applied bundle discounts
- final totals

This keeps order history stable if campaign rules change later.

## Frontend Experience

### Storefront

- Add a compact marketing strip under the hero or toolbar with active campaign copy.
- Product cards show active limited-time discount labels and countdown copy when applicable.
- Recently viewed rail appears below the product grid after there is history.

### Detail Page

- Show available coupon chips near the buy area.
- Show bundle card with "add bundle" action.
- Keep the existing recommendation section, but source it from `/api/recommendations`.
- Record the product as recently viewed when detail page loads.

### Cart Drawer

- Add coupon input/apply/remove UI.
- Show threshold progress copy.
- Show savings breakdown: product discount, order promotion, coupon discount.
- Show cart upsell recommendations.

### Checkout

- Use backend pricing summary.
- Show applied promotions and coupon snapshot before submit.
- Submit order with current coupon/pricing state, not a frontend-only total.

## Error Handling

Use standardized API error envelopes. Planned codes:

- `COUPON_NOT_FOUND`
- `COUPON_EXPIRED`
- `COUPON_NOT_STARTED`
- `COUPON_INELIGIBLE`
- `COUPON_MINIMUM_NOT_MET`
- `BUNDLE_NOT_FOUND`
- `BUNDLE_OUT_OF_STOCK`
- `PROMOTION_CONFLICT`

Coupon errors should show inline near the coupon input. Bundle stock errors should use the existing out-of-stock toast style plus accessible inline copy.

## Accessibility And UX

- Coupon input has a visible label and inline error region.
- Countdown copy includes exact end time text, not only changing numbers.
- Bundle add button disables during request and announces success/failure.
- Recently viewed and recommendation rails use normal links/buttons and keyboard focus states.
- Marketing labels must not rely on color alone; include text such as "限时" or "满减".

## Testing Strategy

### API Tests

- Lists active marketing campaigns.
- Applies valid coupons and rejects invalid/expired/ineligible coupons.
- Calculates automatic full-reduction promotion.
- Applies limited-time product price in cart pricing.
- Adds bundle items with stock validation.
- Saves marketing snapshot on order creation.
- Returns scenario-based recommendations.
- Records and returns recently viewed products.

### UI Tests

- Applies/removes coupon in cart drawer and updates totals.
- Shows threshold progress before and after crossing threshold.
- Shows limited-time discount on product card/detail.
- Adds a bundle from detail page.
- Shows recently viewed products after visiting detail pages.
- Keeps checkout totals aligned with cart pricing.

## Implementation Notes

- Keep implementation incremental: first backend pricing and coupon storage, then cart UI, then limited-time/bundle/recommendations/recently-viewed.
- Do not reintroduce JSON cart/order state reads. SQLite remains the source of truth.
- Use TDD for each behavior change.
- Avoid background agents or high-frequency checks. All verification should be targeted and low-concurrency.

## Self-Review

- Placeholder scan: no TBD/TODO placeholders remain.
- Scope check: the design is one implementation stream but intentionally phased; production campaign management is out of scope.
- Consistency check: cart, checkout, and order all use one backend pricing helper.
- Risk check: no provider/model calls, stress tests, or high-concurrency work are required.
