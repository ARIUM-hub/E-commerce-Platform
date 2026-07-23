# Socks Product Social Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bestseller and recent-purchase social-proof signals to the socks product cards while preserving the current storefront style, backend-driven rendering, and existing rating, fulfillment, and cart behavior.

**Architecture:** This feature extends the existing `GET /api/products` payload with two new metadata fields. The list page will render a lightweight social-proof row inside the current commerce-information block. Verification stays in the current API and Playwright suites.

**Tech Stack:** JSON fixtures, Node.js HTTP server, HTML, CSS, vanilla JavaScript, Playwright

---

## File Structure

- Modify: `data/products.json`
  Purpose: add social-proof metadata to each product.
- Modify: `tests/fixtures/test-data/products.json`
  Purpose: keep test fixtures aligned with the app dataset.
- Modify: `tests/api.spec.js`
  Purpose: verify the new API contract.
- Modify: `socks-product-list.html`
  Purpose: render the social-proof row in each card.
- Modify: `tests/socks-product-list.spec.js`
  Purpose: verify rendering, conditional bestseller display, and mobile readability.

## Shared Data Contract

- Each product returned by `GET /api/products` must include:
  - `recentlyBoughtLabel` as a string
  - `isBestSeller` as a boolean
- The page must visibly render:
  - recently bought text
  - `Best seller` badge only when `isBestSeller` is `true`

## Task 1: Extend product data and API tests

- [ ] Add failing API tests for social-proof metadata
- [ ] Add social-proof fields to both product datasets
- [ ] Verify at least one recommended product is not a bestseller

## Task 2: Render the social-proof row in the commerce block

- [ ] Add failing UI tests for the new row
- [ ] Add minimal styles and markup
- [ ] Verify conditional bestseller rendering

## Task 3: Protect responsive readability and regressions

- [ ] Add or update a mobile readability test
- [ ] Tune wrapping only if needed
- [ ] Run the full suite
