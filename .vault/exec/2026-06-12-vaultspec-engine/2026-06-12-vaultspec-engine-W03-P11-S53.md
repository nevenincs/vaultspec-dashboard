---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S53'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement the whitelisted transparent ops proxies for core and rag verbs and the search pass-through with node-id annotation

## Scope

- `engine/crates/vaultspec-api/src/routes/ops.rs`

## Description

- Implement the transparent ops proxies: /ops/core/{verb} (R1 whitelist exactly - vault-check, vault-stats - run as subprocess --json inside the served root, envelope verbatim), /ops/rag/{verb} (whitelisted forwarding, 502-with-tier-block when rag is down), and /search (rag envelope verbatim plus per-result node-id annotation via the rag-client).
- Unlisted verbs are 403 (tested) - whitelist growth is a sibling filing, not an engine change.

## Outcome

Contract sections 6/8 and D7.5: no engine semantics in the proxy; domain logic stays in the siblings.

## Notes

None.
