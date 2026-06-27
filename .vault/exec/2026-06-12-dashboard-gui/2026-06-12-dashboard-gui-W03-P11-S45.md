---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S45'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---

# implement the rag-down text-match fallback with the explicit semantic-search-offline state per G8.a

## Scope

- `frontend/src/app/right/searchFallback.ts`

## Description

- Add `frontend/src/app/right/searchFallback.ts`: `useSearchWithFallback`
  serves semantic results while rag is up; on search failure it degrades
  to title/text match over the vault tree (pure, tested
  `buildFallbackResults`) with `semanticOffline` raised.
- Fallback results stay clickable: node ids derive from vault stems (the
  S39 join), and fallback scores are banded below 1 so a text match never
  masquerades as semantic certainty; the code target degrades to
  vault-only with that stated.
- The search tab now renders the explicit "semantic search offline -
  showing title/text matches" state per G8.a - a designed degradation,
  never a dead control.

## Outcome

The degradation matrix's search row is operational end-to-end (the mock's
degrade() exercises it). Phase W03.P11 is complete. Gates green:
typecheck, eslint, vitest (191 passed), prettier; production build
passes.

## Notes

The fallback matches stems and feature tags (what the vault-tree endpoint
carries); body-text matching activates if the engine ever serves content
excerpts in the tree.
