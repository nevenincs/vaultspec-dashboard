---
tags:
  - '#exec'
  - '#code-deduplication'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:0a5bc6222e6226f619da6af8501b49ae17aa16fc00a37226e5f329a74bc8365f'
step_id: 'S24'
related:
  - "[[2026-08-01-code-deduplication-plan]]"
---
## Description

Added a private generic generation-aware listing drain adjacent to the engine client. It owns baseline capture, straddle discard and bounded restart, page caps, cursor continuation, latest tiers, final baseline omission, and guaranteed settlement. It exposes callbacks so route-specific partials, progress, yielding, and final response shaping remain caller policy. No caller is migrated in this step.

## Outcome

- VaultSpec RAG semantic discovery succeeded against the resident available and consistent index.
- Four deterministic real Promise page-sequence tests passed: normal latest tiers, restart discard, exhausted straddle with cap, and rejection settlement.
- Prettier passed.
- Independent Sol review approved.
- A broad typecheck is blocked by an unrelated shared unused local in `ContextMenuHost.interactive.test.tsx`; it reports no helper source error.

## Notes

Evidence and scope limits are recorded above.
