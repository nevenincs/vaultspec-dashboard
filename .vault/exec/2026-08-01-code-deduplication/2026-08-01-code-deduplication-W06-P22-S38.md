---
tags:
  - '#exec'
  - '#code-deduplication'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:7768c3200edf72ece28201bef598c4f2b9178dfc24808e7bc60ea316eadb8e11'
step_id: 'S38'
related:
  - "[[2026-08-01-code-deduplication-plan]]"
---
## Description

Replaced actor-header protocol literals in all identified live and transport tests with direct imports of `AUTHORING_ACTOR_TOKEN_HEADER` from the canonical shared HTTP transport.

## Outcome

No frontend test literal or local alias remains. Production ownership and behavior are unchanged.

## Notes

VaultSpec RAG and exact source search identified five literal sites. Five focused test files passed 18 tests with exit zero; Prettier and scoped diff checks passed. Independent Sol review approved. Broad typecheck remains blocked only by an unrelated unused menu local.
