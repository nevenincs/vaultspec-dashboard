---
tags:
  - '#exec'
  - '#code-deduplication'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:4e12e93b24694bb4e21e71db2528f67a38e7873c40a8f3c442e51b27f55edbb8'
step_id: 'S36'
related:
  - "[[2026-08-01-code-deduplication-plan]]"
---
## Description

Removed duplicated document-type identity ordering from both listing projections. Each directly seeds from canonical `DOC_TYPE_ORDER`; projection-specific grouping, sorting, index exclusion, unknown ordering, and untagged behavior remain local.

## Outcome

Both local six-type arrays are deleted. Cross-projection behavior proves all canonical types, a custom unknown, index, and an untagged ADR retain their established projection-specific semantics while using canonical order.

## Notes

VaultSpec RAG semantic discovery succeeded. The focused listings suite passed 33 tests, formatting and scoped diff checks passed, and independent Sol review approved after adding the untagged feature-bucket assertion. Broad typecheck has no S36 error and remains blocked only by an unrelated unused local in ContextMenuHost interactive tests.
