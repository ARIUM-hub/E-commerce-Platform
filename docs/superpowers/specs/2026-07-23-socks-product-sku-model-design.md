# Socks Product SKU Model Design

## Goal

Upgrade the socks storefront product data model so each sellable size has its own SKU, independent stock, and stock warning state. The model should also support richer product merchandising data: image gallery, colors, materials, and size chart. The upgrade must keep the existing shopping flow stable while making SKU inventory the single source of truth.

## Scope

This phase covers:

- Product JSON schema upgrade from product-level `sizes` and optional product-level `stockQuantity` to product-level `variants`.
- Per-size SKU inventory, low-stock warning threshold, and sellable state.
- Product gallery data for listing/detail rendering.
- Product color, material, and size chart metadata.
- Backend stock validation based on SKU variants.
- Cart and order payloads carrying `skuId` alongside `productId` and `size`.
- Frontend display updates for gallery, SKU stock state, color/material copy, and size chart.

This phase does not cover:

- Real inventory reservation or payment capture.
- Warehouse fulfillment integration.
- Multi-color variant selection that changes SKU combinations beyond the existing socks size choice.
- Database migration beyond the current JSON-file persistence model.

## Recommended Approach

Use SKU variants as the inventory truth source. Each product owns a `variants` array. Every variant represents one sellable size for the current product.

Example:

```json
{
  "id": "sock-01",
  "title": "Minimal Crew Socks",
  "sizes": ["39", "40", "41"],
  "variants": [
    {
      "skuId": "sock-01-39",
      "size": "39",
      "color": "Black",
      "material": "Cotton blend",
      "stockQuantity": 8,
      "lowStockThreshold": 5,
      "isAvailable": true
    }
  ],
  "gallery": [
    {
      "id": "main",
      "src": "data:image/svg+xml,...",
      "alt": "Minimal crew socks product image"
    }
  ],
  "colors": ["Black", "White", "Gray"],
  "materials": ["Cotton blend"],
  "sizeChart": [
    {
      "size": "39",
      "footLengthCm": "24.5-25",
      "usMen": "6.5-7",
      "usWomen": "8-8.5"
    }
  ]
}
```

The legacy `sizes` array remains for compatibility but is derived from `variants` where possible. New validation and stock calculations must read `variants`, not product-level `stockQuantity`.

## Data Model

### Product Fields

- `variants`: Required array for sellable size SKUs.
- `gallery`: Required array with at least one clean product image entry.
- `colors`: Required array of display color names.
- `materials`: Required array of material names.
- `sizeChart`: Required array mapping sizes to fit information.
- `stockLabel` and `isLowStock`: Kept temporarily for backward compatibility but should be computed from variant stock for new code.

### Variant Fields

- `skuId`: Stable unique SKU identifier, formatted as `<productId>-<size>` for this phase.
- `size`: Size value shown in UI and submitted by the cart.
- `color`: Display color for the SKU.
- `material`: Display material for the SKU.
- `stockQuantity`: Integer stock for this SKU only.
- `lowStockThreshold`: Integer threshold for low-stock warnings.
- `isAvailable`: Boolean sellable flag. If false, the SKU cannot be added even when `stockQuantity` is positive.

### Derived State

Backend and frontend can derive:

- Available sizes: variants where `isAvailable` is true and `stockQuantity > 0`.
- Sold-out sizes: variants where `isAvailable` is false or `stockQuantity <= 0`.
- Low-stock sizes: variants where `stockQuantity > 0` and `stockQuantity <= lowStockThreshold`.
- Product-level low-stock summary: true if any visible variant is low stock.

## Backend Behavior

### Product APIs

`GET /api/products` continues to return products, but each product includes `variants`, `gallery`, `colors`, `materials`, and `sizeChart`.

The localized product copy flow remains unchanged. Localization applies to text fields such as `title`, `categoryLabel`, and `description`; SKU identifiers and numeric stock fields are not localized.

### Cart APIs

Cart mutations still accept:

```json
{
  "productId": "sock-01",
  "size": "39",
  "quantity": 1
}
```

The server resolves the matching variant from `product.variants`:

- If no matching variant exists, return `INVALID_SIZE`.
- If the variant is unavailable or has no stock, return `OUT_OF_STOCK`.
- If requested cart quantity exceeds that SKU's stock, return `INSUFFICIENT_STOCK`.
- On success, the stored cart item includes `skuId`.

Stored cart item shape:

```json
{
  "productId": "sock-01",
  "skuId": "sock-01-39",
  "size": "39",
  "quantity": 1
}
```

Existing carts without `skuId` are tolerated. When read or updated, the server resolves `skuId` from `productId + size` where possible.

### Cart Merge

Anonymous-to-user cart merge must aggregate by `skuId` when available, otherwise by `productId + size`. Stock caps are applied per SKU, not per product.

If anonymous and user carts both contain the same SKU, quantities merge up to that SKU's `stockQuantity`. The response may include existing `cartMergeWarnings` for capped quantities.

### Orders

Order items should persist `skuId`:

```json
{
  "productId": "sock-01",
  "skuId": "sock-01-39",
  "title": "Minimal Crew Socks",
  "size": "39",
  "quantity": 1,
  "price": 39,
  "originalPrice": 59
}
```

Historical orders must keep working even if product variants later change.

## Frontend Behavior

### Listing Cards

Product cards keep the current compact layout but add SKU-aware stock hints:

- Size buttons can show available, low-stock, or sold-out states.
- Low-stock display example: `39 码仅剩 3 件`.
- Sold-out sizes are disabled and cannot be added to cart.
- Existing add-to-cart split/feedback behavior remains unchanged for available sizes.

### Detail Page

The detail page becomes the main merchandising surface:

- Render image gallery with a primary image and thumbnail buttons.
- Show color and material metadata near price/social proof.
- Render a size chart section.
- Render size buttons from `variants`, not raw `sizes`.
- Show SKU-level stock state for the selected size.
- Add-to-cart uses the selected variant and receives/stores `skuId`.

### Cart Drawer

Cart drawer item rows continue to display title, size, quantity, and subtotal. If `skuId` exists, it can be used for debugging/test selectors but does not need to be prominent customer-facing text.

### Stock Warning UX

Stock warnings should be actionable and close to size selection:

- Low stock: show warning text on the selected size and product card.
- Out of stock: disable the size button and show the existing small toast if a stale interaction attempts to add it.
- Quantity cap: existing "无货" toast remains acceptable when adding beyond SKU stock.

## Compatibility And Migration

The implementation should upgrade `data/products.json` and `tests/fixtures/test-data/products.json` together.

Compatibility rules:

- Keep `sizes` for existing code and tests during the migration.
- Generate `sizes` from `variants` for any new products.
- Keep accepting cart items without `skuId`.
- Preserve existing `productId + size` API contract for frontend calls.
- Do not rewrite existing user carts or orders unless they are touched by a normal cart/order API operation.

## Testing Strategy

API tests should cover:

- Product payload includes `variants`, `gallery`, `colors`, `materials`, and `sizeChart`.
- Variant SKU IDs are unique per product.
- Adding a valid size stores `skuId` on the cart item.
- Adding a sold-out size returns `OUT_OF_STOCK`.
- Adding above per-size stock returns `INSUFFICIENT_STOCK`.
- Different sizes of the same product respect independent stock limits.
- Orders persist `skuId` on order items.
- Anonymous-user cart merge caps quantities per SKU.

Frontend tests should cover:

- Listing cards render SKU-level low-stock and sold-out states.
- Detail page renders gallery, color, material, size chart, and SKU stock state.
- Sold-out size buttons are disabled.
- Adding selected size updates cart state with the expected selected size.
- Quantity cap still shows the existing stock toast.
- Checkout and order detail continue to work with SKU-backed cart items.

## Risks

- The current `server.js` and `socks-product-list.html` are large, so model changes should be implemented in small verified slices.
- Existing tests assert product-level low-stock labels. Those assertions should be updated only after SKU-derived stock labels are implemented.
- The repository has a dirty worktree with earlier changes, so commits should stage only files touched by each implementation slice.

## Acceptance Criteria

- Product data exposes SKU variants and richer merchandising metadata.
- Cart stock validation is per size/SKU.
- Cart items and order items include `skuId` after new mutations.
- Listing and detail pages visibly reflect SKU stock states.
- Existing cart, checkout, user session, and order lifecycle flows still pass targeted regression tests.
