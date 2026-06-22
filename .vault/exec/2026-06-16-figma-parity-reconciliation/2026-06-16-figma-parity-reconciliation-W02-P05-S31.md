---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
step_id: 'S31'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---




# Rebuild the search tab from the binding SearchField Kit primitive over the preserved discover query, reading semantic-offline from tiers

## Scope

- `frontend/src/app/right/SearchTab.tsx`

## Description

- Rebuild the search tab onto the new Figma role-named token foundation, binding
  to the SearchField Kit primitive (Figma node 136:30).
- Migrate the search field, target radio chips, fallback tags, and result rows
  from the legacy radius and rounded-full scales to the canonical `rounded-fg-xs`
  and `rounded-fg-pill`, and the dense receipts to the `caption` type role.
- Keep semantic-offline read from the controller's tiers-gated `semanticOffline`,
  never from a bare transport error.

## Outcome

The search tab is a dumb projection over the preserved `useSearchController`
selector — the sole wire client for search, which owns the fallback, debounce /
cancel, node-id derivation, and the tiers-gated degradation. The view holds only
ephemeral input state, reads degradation only through the selector's interpreted
`semanticOffline` (never the raw tiers block), and emits selection intent through
`selectNode`. The full state machine (idle / loading / results / no-results /
degraded / error-with-retry) is preserved verbatim.

## Notes

The degradation-is-read-from-tiers law is honored unchanged: the semantic-offline
state is the controller's tiers truth, not a transport guess. No store shape or
query-key change. The aggregate frontend gate is red on unrelated uncommitted
scene-layer WIP from a concurrent builder; the scoped file here passes eslint,
prettier, and tsc cleanly.
