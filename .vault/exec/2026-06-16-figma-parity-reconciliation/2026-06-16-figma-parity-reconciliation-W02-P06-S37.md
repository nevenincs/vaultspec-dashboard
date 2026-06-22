---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
step_id: 'S37'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---




# Rebuild the discover overlay from its binding frame over the preserved rag-backed discover query

## Scope

- `frontend/src/app/stage/Discover.tsx`

## Description

- Rebuilt the node-scoped semantic discover overlay faithfully to its binding Figma frame (17:778) on the canonical Figma radius and elevation scales, migrating the trigger chip, the panel, the close button, and the per-candidate pin button from the legacy radius/shadow alias shims.
- Migrated the trigger chip to `rounded-fg-xs` + `shadow-fg-raised`, the panel to `rounded-fg-md` + `shadow-fg-overlay`, and the inner affordances to `rounded-fg-xs`.
- Confirmed the discover-offline degraded state stays read from the stores-derived discovery view (the tiers truth surfaced through `useDiscover`), never from a bare transport error.
- Left the dumb-projection contract unchanged: the panel consumes the interpreted `useDiscover` view and emits pin/unpin/select intent, fetches nothing, and reads no raw tiers block.

## Outcome

The discover overlay now draws on the canonical Figma radius/elevation foundation while remaining a dumb projection over the preserved rag-backed `useDiscover` query. Candidates stay visually quarantined (the question-mark-qualified semantic mark, the session-only pin), the offline state reads from tiers, and the surface mints no model and never fetches. The file is eslint-clean and prettier-clean.

## Notes

The discover-offline truth is derived in the stores layer (`deriveDiscoverView` over the discover query's tiers/error), so the overlay consumes a derived `offline` flag rather than reading the raw tiers block — degradation-is-read-from-tiers is honored without change. The shared worktree's concurrent uncommitted scene WIP still fails the full-tree eslint/tsc steps, outside this scope and not introduced here.
