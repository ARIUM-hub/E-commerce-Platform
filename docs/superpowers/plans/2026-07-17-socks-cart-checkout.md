# Socks Cart Checkout Area Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a realistic checkout area to the cart drawer with a checkout CTA, earliest-delivery summary, and trust copy, while preserving the current cart behavior and pricing summary.

**Architecture:** This enhancement stays client-side. The cart drawer derives its delivery summary from product metadata already loaded into the page. No backend API changes are required.

**Tech Stack:** HTML, CSS, vanilla JavaScript, Playwright

---

## File Structure

- Modify: `socks-product-list.html`
  Purpose: add checkout-area markup, styles, and delivery-summary helpers.
- Modify: `tests/socks-product-list.spec.js`
  Purpose: verify CTA state, delivery summary, and pending-state behavior.

## Shared Rules

- Empty cart: checkout button disabled, placeholder delivery copy shown
- Cart mutation pending: checkout button disabled
- Non-empty cart: show earliest delivery date in absolute-date format

## Tasks

- [ ] Add failing checkout-area tests
- [ ] Add minimal markup and styles
- [ ] Add earliest-delivery helper and CTA state wiring
- [ ] Run targeted tests and full suite
