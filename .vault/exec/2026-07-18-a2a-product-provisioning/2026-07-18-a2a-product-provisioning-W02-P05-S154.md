---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-21'
step_id: 'S154'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Reserve the internal A2A settlement prefix from SPA fallback routing so callback mistakes fail visibly

## Scope

- `engine/crates/vaultspec-api/src/routes/spa.rs`

## Description

- Reserved the `/internal/*` prefix from the SPA fallback via a dedicated `INTERNAL_PREFIXES` list checked only by the fallback (never by bearer_gate), so a misrouted `/internal/a2a/*` callback fails loud as a 404 rather than being served a silent SPA 200 the gateway would read as a successful settlement.

## Outcome

A settlement callback path mistake fails visibly. Gate: build + clippy clean.

## Notes

Kept separate from `API_PREFIXES` deliberately: adding `/internal` there would machine-bearer-gate it and 401 the gateway's attach-control bearer.
