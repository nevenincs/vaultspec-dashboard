---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S77'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Replace hover-card and shared relative-time presentation with locale-aware formatters and safe labels

## Scope

- `frontend/src/stores/view/hoverCardContent.ts`
- `frontend/src/stores/server/searchPill.ts`

## Description

- `hoverCardContent.ts` no longer exists as a separate module: it was merged into
  `frontend/src/stores/view/hoverCard.ts` in bulk commit `3562d0262a` ("localize
  frontend and split oversized modules") during the same module-split pass that
  localized the codebase. `hoverCard.ts`'s own localization is verified and ticked
  separately under `W04.P13.S129`.
- `searchPill.ts` resolves its relative-date and species copy through typed
  message-key descriptors (4 sites) — already verified and ticked under
  `W04.P11.S67`/`S229`.
- Ran the bounded localization scanner against both live files
  (`stores/view/hoverCard.ts`, `stores/server/searchPill.ts`) and confirmed zero exact
  findings.

## Outcome

Both presentation surfaces this step named are fully typed-message-driven, under
their post-split module names.

## Notes

Reconciliation pass (bookkeeping only, no code changes). This step's `hoverCardContent.ts`
scope target is stale relative to the shipped module layout (the file was merged into
`hoverCard.ts` in the same commit that localized it); the underlying presentation
surface is fully accounted for under `W04.P13.S129`. This record retroactively
documents and ticks the plan step; verification was file inspection plus a scoped
scanner run, not a fresh implementation.
