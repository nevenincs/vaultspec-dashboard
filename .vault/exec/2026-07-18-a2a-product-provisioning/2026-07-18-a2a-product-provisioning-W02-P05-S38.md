---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-20'
modified: '2026-07-21'
step_id: 'S38'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Resolve actor token hashes against the dedicated A2A run-token lease repository through principal extraction without adding client-claimable lease or run identity fields

## Scope

- `engine/crates/vaultspec-api/src/authoring/http/mod.rs`

## Description

- Reworked the principal-extraction middleware to DUAL-RESOLVE: try the dedicated run-lease repository first (a cheap indexed hash lookup that opens no authoring store and carries the lease identity), then fall back fail-closed to the authoring token store on a miss.
- Kept the raw header value middleware-consumed and inaccessible to handlers, and added no client-claimable lease or run identity field.

## Outcome

A2A worker run tokens authenticate against the dedicated lease repository through the same extraction seam as authoring tokens, with the lease identity server-resolved. Gate: build + fmt + lib-clippy clean; principal/http/lease tests 97/0.

## Notes

Lease-repo-first ordering avoids opening the authoring store for a2a run tokens; a lease-store read fault resolves as UnknownPrincipal (fail-closed) and defers to the authoring store rather than masking an outage into a grant.
