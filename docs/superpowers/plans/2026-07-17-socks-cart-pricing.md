# Socks Cart Pricing Summary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a more realistic pricing summary to the cart drawer, including subtotal, savings, shipping, and estimated total, while preserving the current cart interactions and visual style.

**Architecture:** This enhancement stays fully client-side. The drawer summary is derived from the existing product catalog plus persisted cart items already returned by `/api/cart`. No backend route changes are required.

**Tech Stack:** HTML, CSS, vanilla JavaScript, Playwright

---

## File Structure

- Modify: `socks-product-list.html`
  Purpose: add summary markup, styles, and client-side pricing calculations.
- Modify: `tests/socks-product-list.spec.js`
  Purpose: verify initial summary rendering and recalculation after cart mutations.

## Shared Pricing Rules

- `subtotal` uses `originalPrice * quantity`
- `savings` uses `(originalPrice - price) * quantity`
- `shipping` is fixed to `FREE`
- `estimated total` uses `price * quantity`

## Tasks

- [ ] Add failing drawer-summary tests
- [ ] Add summary styles and markup
- [ ] Add client-side pricing helpers and render logic
- [ ] Verify quantity updates and item removal keep the summary correct
- [ ] Run the full suite
