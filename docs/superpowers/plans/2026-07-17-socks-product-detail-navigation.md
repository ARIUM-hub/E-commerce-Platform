# Socks Product Detail Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a product detail view to the unified storefront entry so users can navigate from the socks list into a product detail page and back to the filtered list state.

**Architecture:** The existing `socks-product-list.html` single-entry page will gain a third routed view, `?view=detail&id=<productId>`. The detail view will reuse the current products API data, render the selected product client-side, and preserve the originating filter and sort state in the return link.

**Tech Stack:** Node.js HTTP server, HTML, CSS, vanilla JavaScript, Playwright

---

## File Structure

- Modify: `socks-product-list.html`
  Purpose: add the detail view markup, route parsing, detail rendering, and list-to-detail navigation.
- Modify: `tests/socks-product-list.spec.js`
  Purpose: verify navigation into detail view, direct detail rendering, and invalid-product handling.
- Keep: `socks-order-confirmation.html`
  Purpose: continue acting as compatibility redirect to the unified order view.

## Shared Rules

- Detail URLs use `/socks-product-list.html?view=detail&id=<productId>`
- Source `filter` and `sort` must be preserved in detail URLs and the return link
- Detail data comes from the existing `/api/products?filter=all&sort=recommended`
- Invalid IDs render a friendly in-page empty state, not a browser error page

## Tasks

- [ ] Add failing Playwright tests for detail navigation and detail empty state
- [ ] Extend the unified page with a routed detail view and preserved back link
- [ ] Verify targeted tests and then run the full suite
