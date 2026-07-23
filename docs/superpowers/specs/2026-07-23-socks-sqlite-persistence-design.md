# Socks SQLite Persistence Design

## Goal

Upgrade the socks storefront backend from JSON-file persistence to a SQLite-backed demo backend that feels closer to a real commerce service. The upgrade keeps the existing HTTP API and frontend flows stable while adding database persistence, durable session IDs, transaction-based inventory validation, and a consistent API error contract.

## Current State

The project currently uses a single Node HTTP server in `server.js`. Products, carts, users, sessions, user carts, and orders are read from and written to JSON files under `data/`, with tests using mirrored files under `tests/fixtures/test-data/`.

This works for demos, but it has real limitations:

- JSON file writes are not transaction-safe across cart, order, user, and inventory updates.
- Inventory validation can check SKU stock, but order creation cannot atomically reserve or deduct stock.
- Session and cart state are stored as mutable JSON collections instead of keyed database rows.
- Error responses mostly share a shape, but there is no central error-code registry or helper for structured details.

## Recommended Approach

Use SQLite as the persistence layer and keep the current vanilla Node HTTP server. Add a small database adapter and repository layer instead of moving to a full framework.

Driver strategy:

- Prefer `better-sqlite3` as the runtime SQLite dependency because it provides straightforward synchronous transactions and stable behavior.
- If dependency installation is blocked in the local environment, use Node's available `node:sqlite` only as a fallback, behind the same adapter interface.
- Do not introduce an ORM in this phase. The schema is small, and explicit SQL will make transactions and SKU inventory behavior easier to audit.

Database files:

- Runtime database: `data/socks-store.db`
- Test database: `tests/fixtures/test-data/socks-store.test.db`
- Existing JSON product data remains as seed input during migration and can be kept for readability.

## Database Schema

Products and SKU inventory:

- `products`: core product fields such as id, series, title, category, prices, discount, description, rating, shipping, visual metadata, localized content JSON, and merchandising flags.
- `product_variants`: one row per sellable SKU size, with `sku_id`, `product_id`, `size`, `color`, `material`, `stock_quantity`, `low_stock_threshold`, and `is_available`.
- `product_gallery`: product image rows with id, product id, src, alt, and sort order.
- `product_size_chart`: one row per size chart entry.

Users, sessions, and addresses:

- `users`: id, name, email, password hash or demo password value, created/updated timestamps.
- `sessions`: session id, user id, created/updated timestamps, expires at.
- `addresses`: id, user id, delivery fields, default flag, timestamps.

Carts:

- `carts`: id, owner type (`anonymous` or `user`), optional user id, anonymous session id, timestamps.
- `cart_items`: cart id, product id, sku id, size, quantity, timestamps.
- Add a unique index on `(cart_id, sku_id)` so the same SKU merges instead of duplicating.

Orders:

- `orders`: id, user id, status, customer fields, shipping address JSON or columns, shipping method fields, subtotal, savings, shipping, total, timestamps.
- `order_items`: order id, product id, sku id, title snapshot, size, quantity, price, original price.
- `order_timeline`: order id, status, label, timestamp.

## Data Flow

Products:

- On startup or explicit initialization, create tables if missing.
- Seed products from `data/products.json` when the database has no products.
- `/api/products` reads from SQLite and returns the same shape the frontend already consumes, including `variants`, `gallery`, `colors`, `materials`, and `sizeChart`.

Sessions:

- Keep cookie name `socks_session`.
- Store session rows in SQLite, not JSON.
- Anonymous browsing gets a session id so the anonymous cart can survive reloads and be merged after login.
- Login/register creates or refreshes a session row and returns the same cookie behavior the frontend already expects.

Carts:

- `/api/cart` resolves the current cart by logged-in user id or anonymous session id.
- Add/update/remove/clear cart operations use cart repositories and SKU ids.
- Cart additions continue to validate against SKU stock, but do not deduct stock yet.
- Login merges anonymous cart into user cart inside a transaction and caps merged quantities at SKU stock.

Orders and inventory:

- Creating an order runs inside one SQLite transaction.
- The transaction re-reads every SKU row from `product_variants`.
- If any SKU is missing, unavailable, or lacks enough stock, the whole order fails and the cart remains unchanged.
- If all rows are valid, decrement `stock_quantity`, create `orders`, `order_items`, and `order_timeline`, then clear cart items.
- This makes checkout the source of truth for inventory deduction and avoids overselling under concurrent order requests.

## Concurrency Model

SQLite allows one writer at a time, which is acceptable for this local demo store. Order creation should use a write transaction:

```sql
BEGIN IMMEDIATE;
SELECT stock_quantity, is_available FROM product_variants WHERE sku_id = ?;
UPDATE product_variants
SET stock_quantity = stock_quantity - ?
WHERE sku_id = ?
  AND is_available = 1
  AND stock_quantity >= ?;
COMMIT;
```

The implementation should check that each inventory `UPDATE` affected exactly one row. If any update affects zero rows, rollback and return `INSUFFICIENT_STOCK` or `OUT_OF_STOCK`.

This keeps validation and mutation in the same critical section instead of relying on a stale pre-check.

## API Error Contract

All API errors should use this shape:

```json
{
  "ok": false,
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Selected size stock is not enough.",
    "details": {}
  }
}
```

Centralize errors through a helper such as `createApiError(code, statusCode, message, details = {})` and keep `sendError` as the response boundary.

Initial error-code groups:

- Auth: `AUTH_REQUIRED`, `AUTH_VALIDATION_FAILED`, `INVALID_CREDENTIALS`, `EMAIL_ALREADY_REGISTERED`, `SESSION_EXPIRED`
- Validation: `INVALID_JSON`, `VALIDATION_FAILED`, `INVALID_QUANTITY`, `INVALID_SIZE`, `INVALID_SHIPPING_METHOD`
- Inventory: `OUT_OF_STOCK`, `INSUFFICIENT_STOCK`
- Cart: `CART_ITEM_NOT_FOUND`, `EMPTY_CART`
- Address: `ADDRESS_NOT_FOUND`, `ADDRESS_VALIDATION_FAILED`
- Order: `ORDER_NOT_FOUND`, `INVALID_ORDER_STATUS`, `INVALID_ORDER_TRANSITION`
- Database/system: `DATABASE_CONFLICT`, `DATABASE_UNAVAILABLE`, `INTERNAL_ERROR`

Frontend code should not need large changes because existing `error.code` checks remain valid.

## File Boundaries

Keep the current app simple but reduce `server.js` pressure:

- `server.js`: HTTP routing, request parsing, response sending, static files.
- `lib/database.js`: open database connection, initialize schema, run migrations, seed data.
- `lib/repositories/products.js`: product list/query/detail assembly.
- `lib/repositories/carts.js`: cart lookup, merge, add/update/remove/clear.
- `lib/repositories/users.js`: users, sessions, addresses.
- `lib/repositories/orders.js`: order creation, order lookup/history, status updates.
- `lib/api-errors.js`: centralized error definitions and response shape helpers.
- `tests/api.spec.js`: existing API behavior plus database persistence, transaction, session, and error-shape tests.

## Migration Strategy

This phase does not need a full migration framework. Use idempotent SQL initialization:

- `CREATE TABLE IF NOT EXISTS`
- `CREATE INDEX IF NOT EXISTS`
- seed products only when `products` is empty
- create empty runtime DB automatically if missing
- reset test DB before each API test or test file setup

Existing JSON files can stay as seed fixtures and as a readable source of product merchandising data.

## Testing Strategy

Use TDD for each backend slice:

- Database initialization test proves empty DB creates tables and seeds product/SKU rows.
- Product API regression proves `/api/products` returns the same frontend payload shape.
- Session tests prove register/login/logout now persist in SQLite and set `socks_session`.
- Anonymous cart tests prove a session id maps to a durable anonymous cart.
- Login merge tests prove anonymous cart merges into user cart in a transaction.
- Cart mutation tests prove SKU quantities still cap at stock.
- Checkout tests prove order creation decrements SKU stock and clears the cart atomically.
- Concurrent checkout simulation test uses two near-simultaneous requests against the same low-stock SKU and expects only one to succeed.
- Error contract tests prove known failures include `ok: false`, `error.code`, `error.message`, and `error.details`.

Avoid pressure tests or high-frequency loops. The concurrency test should use only two requests for the same SKU to verify transaction behavior without stressing the local service.

## Out Of Scope

- Payment integration.
- External managed database.
- Admin dashboard for editing stock.
- Password hashing hardening beyond the current demo-level auth, unless already present.
- Multi-process scaling. SQLite is enough for this local demo.

## Risks And Mitigations

- Native dependency installation may fail on Windows or domestic networks. Mitigation: verify `better-sqlite3` installation first, and keep a fallback plan using `node:sqlite` behind the adapter.
- `server.js` is already large. Mitigation: add repository files instead of growing route internals further.
- Existing UI tests may rely on JSON fixture resets. Mitigation: provide DB reset helpers for tests and keep API shape stable.
- Order creation changes inventory behavior. Mitigation: write transaction tests before implementation and use small, deterministic low-stock fixtures.

## Success Criteria

- The app no longer depends on mutable JSON files for live cart, user, session, address, order, or inventory state.
- Products and SKU metadata are seeded into SQLite and returned through the current product API shape.
- Sessions use durable database rows keyed by the existing `socks_session` cookie.
- Checkout uses a SQLite transaction to atomically validate and decrement SKU stock.
- API errors follow the standardized response shape.
- Existing storefront, detail, cart, checkout, auth, address, order, and SKU tests pass after migration.

## Self-Review

- Placeholder scan: no unresolved markers remain.
- Consistency check: SKU fields use `sku_id` in SQL and map back to `skuId` in API payloads.
- Scope check: this is one focused backend persistence migration, not a payment or admin project.
- Ambiguity check: inventory deduction happens at checkout, not add-to-cart.
