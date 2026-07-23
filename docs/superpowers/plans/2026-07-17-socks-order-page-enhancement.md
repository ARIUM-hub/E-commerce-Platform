# Socks Order Page Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the order confirmation page with a richer pricing summary and a small recommended-products module, while keeping the current confirmation flow intact.

**Architecture:** This enhancement extends the stored demo order snapshot with derived pricing and purchased-product IDs. The order page reads that snapshot and fetches the current recommended products list from the existing products API, excluding already purchased items.

**Tech Stack:** Node.js HTTP server, HTML, CSS, vanilla JavaScript, Playwright

---

## File Structure

- Modify: `socks-product-list.html`
  Purpose: store richer order snapshot data at checkout time.
- Modify: `socks-order-confirmation.html`
  Purpose: render the expanded summary and recommended-products section.
- Modify: `tests/socks-product-list.spec.js`
  Purpose: keep navigation coverage aligned if needed.
- Modify: `tests/socks-order-confirmation.spec.js`
  Purpose: verify summary rendering and recommendation behavior.

## Shared Rules

- Summary uses stored `subtotal`, `savings`, and `total`
- Recommendation source is `/api/products?filter=all&sort=recommended`
- Purchased products must not appear in recommendations
- Empty-state behavior must remain intact

## Tasks

- [ ] Add failing order-page tests for summary and recommendations
- [ ] Extend the stored order snapshot
- [ ] Render enhanced summary and recommended products
- [ ] Run targeted tests and full suite
