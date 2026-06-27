---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S05'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---

# Register the route and add it to CONTRACT_ROUTES, bearer-gated by the existing middleware

## Scope

- `engine/crates/vaultspec-api/src/lib.rs`

## Description

- Register the content module in the routes module tree.
- Wire `GET /nodes/{id}/content` into the router beside the rest of the nodes family, behind the existing bearer gate.
- Add `/nodes/{id}/content` to the `CONTRACT_ROUTES` inventory so the implementation and the contract drift loudly rather than silently.
- Add `ingest-struct` as a direct dependency for the body reader.

## Outcome

The route is registered, bearer-gated, and recorded in the contract inventory. The crate builds clean.

## Notes

The node-id path segment carries slashes for `code:<path>` ids; the client must percent-encode them into one segment, since axum captures a single path segment for `{id}`.
