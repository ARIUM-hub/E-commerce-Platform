# Socks Search And List Experience Design

## Goal

Upgrade the socks storefront list experience into a more realistic commerce search page while keeping the current single-main-category socks positioning. The feature adds pagination/load-more, price range filtering, size filtering, inventory filtering, rating filtering, and search no-result recommendations.

## Scope

- Extend the existing `/api/products` endpoint instead of adding a new endpoint.
- Keep current query parameters working: `filter`, `sort`, `locale`, and `q`.
- Add query parameters:
  - `page`: 1-based integer, default `1`.
  - `pageSize`: integer, default `8`, capped to a safe maximum such as `24`.
  - `minPrice`: optional inclusive minimum current price.
  - `maxPrice`: optional inclusive maximum current price.
  - `size`: optional SKU size value such as `39`, `40`, or `43`.
  - `stock`: optional value, one of `all`, `in-stock`, `low-stock`, `out-of-stock`.
  - `ratingMin`: optional minimum rating such as `4`, `4.5`.
- Add front-end controls for pagination/load more and the new filters.
- Add a no-result state with recommended products and clear recovery actions.

Out of scope:

- Full-text search engine integration.
- Cross-category marketplace search beyond socks.
- Infinite scroll. Use explicit load more for better control and easier testing.
- Server-side rendered pages.

## API Design

`GET /api/products` should return a stable shape:

```json
{
  "items": [],
  "recommendations": [],
  "meta": {
    "filter": "all",
    "sort": "recommended",
    "q": "",
    "count": 0,
    "totalCount": 0,
    "page": 1,
    "pageSize": 8,
    "totalPages": 0,
    "hasMore": false,
    "filters": {
      "minPrice": null,
      "maxPrice": null,
      "size": "",
      "stock": "all",
      "ratingMin": null
    }
  }
}
```

Filtering order:

1. Start from SQLite product rows and variant rows.
2. Apply category filter.
3. Apply localized search against title, description, and category label.
4. Apply price, size, stock, and rating filters.
5. Apply sort.
6. Paginate after filtering and sorting.

Filter semantics:

- Price filters use current `price`, not `originalPrice`.
- Size filter matches products with a variant for that size.
- `in-stock` means at least one matching variant has `stockQuantity > 0`.
- `low-stock` means at least one matching variant is available and low stock.
- `out-of-stock` means the product has no sellable matching variants.
- `ratingMin` uses `ratingValue >= ratingMin`.
- Invalid filters should be ignored or normalized to defaults rather than returning `400`, matching the existing forgiving storefront API style.

Recommendations:

- When filtered `totalCount > 0`, `recommendations` can be empty.
- When filtered `totalCount === 0`, return up to 4 recommended products chosen from in-stock, high-rating, recommended or best-seller socks.
- Recommendations should respect locale but do not need to respect every failed filter, because their purpose is recovery.

## Front-End Experience

The current dense marketplace shell stays intact. The list page gains a search refinement area:

- Desktop: left-side filter rail plus existing top title/search/sort/result area.
- Mobile: compact "Filters" disclosure panel above the grid.
- Product grid initially renders `pageSize` items.
- "Load more" appends the next page to the current visible list without resetting cart state, selected sizes, or current query.
- Changing any search/filter/sort resets to page `1` and replaces the visible list.
- URL state should include active filters so detail/back navigation preserves context.

Filter UI:

- Price range: two number inputs for min and max price with an Apply button.
- Size: button chips for available sizes, with a clear option.
- Stock: segmented buttons for all, in stock, low stock, out of stock.
- Rating: chips such as `4.0+`, `4.5+`.
- Active filters summary: small removable chips near result count.

No-result UI:

- Show a clear title such as "No exact matches".
- Show a short recovery sentence based on current query/filter state.
- Provide actions:
  - Clear all filters.
  - Keep search, clear filters.
  - View all socks.
- Render recommendation cards below the message.

## State And Data Flow

- URL is the source for initial list state.
- Front-end state tracks:
  - active filters and sort/query.
  - current page.
  - accumulated products for load-more.
  - meta returned from API.
- `fetchProducts()` sends all active query parameters.
- `loadMoreProducts()` sends the same filters with `page + 1`, then appends returned `items`.
- Cart state continues to come from `/api/cart`; product list filtering must not reset cart UI feedback.

## Accessibility And UX Requirements

- Filter buttons use `aria-pressed` or native form controls.
- Price inputs have visible labels and numeric input modes.
- Load-more button has loading and disabled states.
- No-result recommendation section has a heading.
- Keyboard users can operate all filters and load more.
- Touch targets remain at least 44px high on mobile.
- The design keeps the existing black/white/gray visual language rather than introducing unrelated color systems.

## Testing Plan

API tests:

- Paginates `/api/products` and returns correct `page`, `pageSize`, `hasMore`, and `totalCount`.
- Applies price range filters.
- Applies size filters against SKU variants.
- Applies stock filters for in-stock, low-stock, and out-of-stock.
- Applies rating minimum filters.
- Combines search, category, filter, sort, and pagination.
- Returns recommendations when search/filter produces no results.

UI tests:

- Shows the filter rail/panel and active filter chips.
- Price range changes product results and URL state.
- Size filter changes product results and URL state.
- Stock and rating filters change product results.
- Load more appends products and updates the button state.
- Changing a filter resets to page 1.
- No-result state shows recommendations and recovery actions.
- Detail page links preserve the active list context.

## Risks

- Some older UI tests still seed `cart.json` directly. This feature should avoid expanding that legacy pattern and should prefer API-driven setup.
- Product count is currently small, so pagination must still feel real with a low `pageSize`.
- Existing search tests may have encoding-sensitive Chinese assertions; new tests should avoid adding escaped Unicode and should preserve UTF-8 text directly.

## Self-Review

- No placeholders remain.
- API and UI behavior are aligned around the existing `/api/products` endpoint.
- The design preserves existing storefront identity and current cart/session/order architecture.
- Scope is limited to search/list experience and does not alter checkout or user account flows.
