---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S129'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Replace hover-card store presentation strings and evidence fallbacks with typed descriptors

## Scope

- `frontend/src/stores/view/hoverCard.ts`
- `frontend/src/stores/view/hoverCardEvidence.ts`

## Description

- Verified `hoverCard.ts` resolves its presentation strings through a typed
  message-key descriptor and `hoverCardEvidence.ts` carries no owned display strings
  at all (a pure evidence-shape derivation).
- Ran the bounded localization scanner against both files and confirmed zero exact
  findings.

## Outcome

The hover-card store's presentation and evidence-fallback logic carry no unlocalized
copy.

## Notes

Reconciliation pass (bookkeeping only, no code changes). The work landed in bulk commit
`3562d0262a` ("localize frontend and split oversized modules"), which also merged the
former `hoverCardContent.ts` module into `hoverCard.ts` (see `W04.P13.S77`'s note on
that consolidation). This record retroactively documents and ticks the plan step;
verification was file inspection plus a scoped scanner run, not a fresh implementation.
