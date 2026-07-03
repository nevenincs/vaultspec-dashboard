---
tags:
  - '#exec'
  - '#search-providers'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S12'
related:
  - "[[2026-07-03-search-providers-plan]]"
---

# Reword every rendered search string to plain language: the idle prompt drops by-meaning, the degraded StateBlock becomes Full search is unavailable, showing name matches only, with a matching screen-reader twin, and the palette labels read Search

## Scope

- `frontend/src/stores/view/commandPalette.ts`

## Description

- Reword the idle prompt: drop "by meaning" — now "Search across your documents
  and code."
- Reword the degraded StateBlock to the exact plain-language copy: "Full search
  is unavailable — showing name matches only." (states both truths: the fuller
  mode is down, and the shown results are name matches only).
- Match the screen-reader `liveMessage` twin to the same copy for the pure-offline
  (non-error) case.
- Update `commandPalette.test.ts`: the two reworded string assertions plus a new
  vector for the pure-offline case proving the visible copy and its sr-only twin
  match.

## Outcome

Every rendered palette search string is plain language — no "by meaning",
"semantic", "rag", or "vector" on the search plane. Degraded-copy honesty survives
the rewording (fuller mode down + name matches only), and the sr-only twin
matches. Full frontend gate green; commandPalette suite 10 tests pass.

## Notes

The palette labels already read plain and Search-led (`dialogLabel` /
`inputPlaceholder` = "Search documents and code…", `listboxLabel` = "search
results"), so no label change was needed. One remaining "Semantic search is
offline …" string lives in `app/right/railStates.tsx` — but that is the RIGHT
RAIL's activity/history degradation banner ("open items and history may be
incomplete"), not the Cmd+K search plane, so it is out of this feature's scope and
left untouched. `entity.ts:134` is a code comment, not a rendered string.
