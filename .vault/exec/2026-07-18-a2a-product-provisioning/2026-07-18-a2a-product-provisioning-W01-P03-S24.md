---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S24'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---




# Reserve the lifecycle prefix from SPA fallback routing so route mistakes fail visibly

## Scope

- `engine/crates/vaultspec-api/src/routes/spa.rs`

## Description

- Reserve the `/a2a` prefix in the SPA fallback API-prefix list so an unknown
  `/a2a/lifecycle/*` path fails loud as a bearer-gated JSON 404 instead of
  rendering the SPA shell.

## Outcome

The lifecycle prefix is reserved from SPA fallback and is on the bearer boundary;
a route mistake under `/a2a` fails visibly.

## Notes

The `API_PREFIXES` list is a security boundary bound to `CONTRACT_ROUTES`; adding
`/a2a` there keeps the new routes gated and the two lists non-drifting.
