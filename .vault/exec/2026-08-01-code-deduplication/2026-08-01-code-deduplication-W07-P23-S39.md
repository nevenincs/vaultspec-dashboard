---
tags:
  - '#exec'
  - '#code-deduplication'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:ff596203841da789c0797e78902585119347873bc331c664b8b222de7b78b775'
step_id: 'S39'
related:
  - "[[2026-08-01-code-deduplication-plan]]"
---
## Description

Replaced the final E2E actor-header protocol literal with a direct import from canonical shared HTTP transport.

## Outcome

The framework-agnostic E2E REST and SSE client preserves its behavior while directly using `AUTHORING_ACTOR_TOKEN_HEADER`. No local literal, alias, shim, or re-export remains.

## Notes

VaultSpec RAG semantic discovery succeeded. The independent Playwright authoring spec passed 7 tests; Prettier and scoped diff checks passed. Independent Sol review approved. Broad typecheck remains blocked only by an unrelated unused menu local.
