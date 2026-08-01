---
tags:
  - '#exec'
  - '#code-deduplication'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:f86c9a4e911a9bef483d52d267ef68798576c75764ac444f18d39da1348b755d'
step_id: 'S12'
related:
  - "[[2026-08-01-code-deduplication-plan]]"
---
# Write regression coverage then replace authoring pagination with the canonical paginator

## Scope

- `engine/crates/vaultspec-api/src/authoring/documents.rs`

## Description

- Add a real temporary-vault regression for an absent cursor between sorted paths and a zero requested page size.
- Import `engine_query::envelope::paginate` directly.
- Delete the resolver-local start offset, page collection, and next-cursor algorithm.

## Outcome

The authoring resolver keeps discovery, sorting, cap policy, truncation, and entry projection locally while its page slicing is wholly delegated to the canonical owner. Fourteen focused resolver tests, formatting, diff hygiene, and independent Sol review passed.

## Notes

No forwarding surface or compatibility alias was added.
