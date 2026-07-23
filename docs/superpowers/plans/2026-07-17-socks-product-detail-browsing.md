# Socks Product Detail Browsing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the unified product detail view with lightweight recommendations and previous/next product navigation while preserving the existing filter/sort-aware routing.

**Architecture:** The detail page will continue living inside `socks-product-list.html`. It will derive the current browsing context from the detail URL query params, fetch the same product dataset used by that context to compute previous/next links, and separately fetch the default recommended list for the recommendation strip.

**Tech Stack:** Node.js HTTP server, HTML, CSS, vanilla JavaScript, Playwright

---

## File Structure

- Modify: `socks-product-list.html`
  Purpose: add detail recommendations, previous/next navigation, and context-aware link generation.
- Modify: `tests/socks-product-list.spec.js`
  Purpose: verify recommendations exclude the current product and that previous/next navigation preserves context.

## Shared Rules

- Detail URLs remain `/socks-product-list.html?view=detail&id=<productId>`
- Previous/next links preserve `filter` and `sort`
- Recommendations come from `/api/products?filter=all&sort=recommended`
- Recommendations must exclude the currently viewed product

## Tasks

- [ ] Add failing Playwright tests for detail recommendations and previous/next navigation
- [ ] Implement context-aware detail navigation and recommendation rendering
- [ ] Run targeted tests and then full suite verification
