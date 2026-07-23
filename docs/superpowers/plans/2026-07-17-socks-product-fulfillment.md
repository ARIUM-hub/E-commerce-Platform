# Socks Product Fulfillment Signals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add delivery and stock signals to the socks product cards while preserving the current storefront style, rating band, backend-driven rendering, and cart behavior.

**Architecture:** This feature extends the existing product JSON contract returned by `GET /api/products`. No new endpoint is needed. Product cards in `socks-product-list.html` will render a small commerce-information block below the description and above size selection. Verification continues through API tests and Playwright page tests.

**Tech Stack:** JSON fixtures, Node.js HTTP server, HTML, CSS, vanilla JavaScript, Playwright

---

## File Structure

- Modify: `data/products.json`
  Purpose: add delivery and stock metadata to every product.
- Modify: `tests/fixtures/test-data/products.json`
  Purpose: keep test data aligned with app product data.
- Modify: `tests/api.spec.js`
  Purpose: verify the new API metadata contract.
- Modify: `socks-product-list.html`
  Purpose: render delivery and stock signals in each product card.
- Modify: `tests/socks-product-list.spec.js`
  Purpose: verify desktop rendering, low-stock behavior, and mobile readability.

## Shared Data Contract

- Each product returned by `GET /api/products` must include:
  - `shippingLabel` as a string
  - `deliveryEstimate` as a string
  - `stockLabel` as a string
  - `isLowStock` as a boolean
- The page must visibly render:
  - shipping label
  - delivery estimate
  - stock label
  - low-stock styling only when `isLowStock` is `true`

## Task 1: Extend product data and API contract

**Files:**
- Modify: `data/products.json`
- Modify: `tests/fixtures/test-data/products.json`
- Modify: `tests/api.spec.js`

- [ ] Add failing API tests for fulfillment metadata
- [ ] Add the new fields to both product datasets
- [ ] Verify field types and a filtered-response regression for a low-stock product

## Task 2: Render fulfillment signals on the product card

**Files:**
- Modify: `socks-product-list.html`
- Modify: `tests/socks-product-list.spec.js`

- [ ] Add failing page tests for the commerce info block
- [ ] Add styles and markup for delivery and stock signals
- [ ] Verify one normal-stock card and one low-stock card

## Task 3: Protect responsive readability and regression coverage

**Files:**
- Modify: `socks-product-list.html`
- Modify: `tests/socks-product-list.spec.js`

- [ ] Add a mobile test for the commerce block layout
- [ ] Tune small-screen spacing only if needed
- [ ] Run the full suite

## Self-Review

- Preserve black/white/gray style
- Do not add new backend routes
- Keep `isLowStock` independent from recommendation and rating flags
- Do not regress cart drawer interactions
