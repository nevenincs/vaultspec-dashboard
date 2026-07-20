---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-20'
step_id: 'S37'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---




# Carry the resolved token-hash lease identity with the authenticated principal while keeping the raw header value one-use and inaccessible to handlers

## Scope

- `engine/crates/vaultspec-api/src/authoring/principal.rs`

## Description

- Extended `AuthenticatedPrincipal` to carry an optional non-secret run-lease identity, exposed read-only via `lease_id()` so a handler can observe it but never set it.
- Added `resolve_lease_principal`, the second path to a principal witness: it resolves a presented token against the dedicated lease repository, taking BOTH the actor identity and the lease identity from the server-held lease store, so the compile-time actor fence still holds and nothing is client-claimed.
- Left the authoring-store resolution path unchanged; an authoring-session principal carries no lease id.

## Outcome

The principal witness carries the resolved lease identity for a2a run tokens without any forgeable path. Gate: build + fmt + lib-clippy clean; principal/http/lease tests 97/0 including the a2a-run-token-to-lease-principal proof.

## Notes

None.
