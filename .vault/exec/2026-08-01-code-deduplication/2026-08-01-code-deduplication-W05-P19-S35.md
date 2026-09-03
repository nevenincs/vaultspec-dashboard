---
tags:
  - '#exec'
  - '#code-deduplication'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:7ddc46f66715a737bd9e98a646c2cb6016b2de3c39099c0a901bd6e03f621e95'
step_id: 'S35'
related:
  - "[[2026-08-01-code-deduplication-plan]]"
---
## Description

Centralized actor-header transport composition in the existing stores-owned HTTP transport module. Agent and Authoring now import the canonical actor transport directly; their endpoint, actor-selection, idempotency, typed-adapter, and business policies remain local.

## Outcome

The duplicate local actor constants and wrappers were deleted. A real loopback HTTP suite proves actor injection composes with bearer transport, preserves caller Authorization precedence, and is a no-op without an actor.

## Notes

VaultSpec RAG semantic discovery succeeded. Four focused tests, Prettier, scoped diff hygiene, and independent Sol review passed. Broad typecheck has no S35 error and remains blocked only by an unrelated unused local in ContextMenuHost interactive tests.
