---
tags:
  - '#exec'
  - '#dashboard-state-centralization'
date: '2026-06-17'
modified: '2026-06-17'
step_id: 'S35'
related:
  - "[[2026-06-17-dashboard-state-centralization-plan]]"
---

# Make the browser mode store reset only canonical scope-local panel state on scope changes

## Scope

- `frontend/src/stores/view/browserMode.ts`

## Description

- Remove `filter` and `setFilter` from the browser-mode store.
- Keep browser-mode state limited to the vault/code mode.
- Update browser-mode and cross-scope isolation tests for the reduced store contract.

## Outcome

Closed S35. Scope and workspace resets now clear only the browser mode in this store; text filtering is owned by canonical dashboard filters.

## Notes

No local browser filter state remains in `browserMode`.
