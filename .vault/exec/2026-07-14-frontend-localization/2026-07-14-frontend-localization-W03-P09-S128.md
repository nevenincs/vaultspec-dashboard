---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S128'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Localize right-menu hover-card accessible names, states, overflow counts, and actions without raw IDs

## Scope

- `frontend/src/app/right/menus/HoverCard.tsx`

## Description

- Verified the component resolves its accessible names, states, overflow counts, and
  action copy through `useLocalizedMessage` over typed descriptors (8 call sites),
  with no raw node/entity id ever rendered as visible text.
- Ran the bounded localization scanner against the file and confirmed zero exact
  findings.

## Outcome

The right-menu hover card renders only localized, typed-descriptor copy with no
internal identifiers.

## Notes

Reconciliation pass (bookkeeping only, no code changes). The work landed in bulk commit
`3562d0262a` ("localize frontend and split oversized modules"). This record
retroactively documents and ticks the plan step; verification was file inspection plus a
scoped scanner run, not a fresh implementation.

RETIREMENT CROSS-REFERENCE: this is the ONE canonical hover card. The same bulk commit
performed a HIGH-1 reconciliation that retired the old, separately typed
`frontend/src/app/islands/HoverCard.tsx` rung and its two render-test files, consolidating
every hover-card render (right-rail AND on-canvas island) onto this component — the
on-canvas path now mounts it through `frontend/src/app/islands/HoverCardLayer.tsx`,
which owns no strings of its own and delegates entirely to this file. The plan's
`W03.P09.S128` steps `S180` and `S181` named the retired module and its tests; per the
team lead's ruling (2026-07-17), those two steps were RETIRED via
`vaultspec-core vault plan step remove` rather than re-scoped to
`HoverCardLayer.tsx`, since re-scoping would manufacture work for a surface this step
already fully satisfies. `S180`/`S181` no longer appear in the plan; their canonical ids
are preserved in the plan's `RETIRED` annotation comment.
