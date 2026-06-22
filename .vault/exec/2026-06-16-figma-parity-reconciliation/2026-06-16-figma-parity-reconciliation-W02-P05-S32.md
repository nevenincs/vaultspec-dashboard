---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
step_id: 'S32'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---




# Rebuild the changes overview and diff view from their binding frames over the preserved diff query, including the historical text-diff route

## Scope

- `frontend/src/app/right/DiffView.tsx`
- `frontend/src/app/right/ChangesOverview.tsx`

## Description

- Rebuild the diff view and the changes overview onto the new Figma role-named
  token foundation, binding to the DiffView frame (Figma node 17:965).
- Make the diff view explicitly source-agnostic: it renders a parsed diff body
  identically whether it came from the working-tree `diff` verb or the new bounded
  read-only HISTORICAL two-rev `histdiff` route (the W01.P02.S14 engine route, the
  S17 mock mirror, and the S18 conformance test all already serve this shape).
- Migrate the status header, rows, pills, and badges from the legacy radius and
  six-level shadow scales to the canonical `rounded-fg-md` / `rounded-fg-xs` /
  `rounded-fg-pill` and `shadow-fg-raised`, and dense metadata to the `caption`
  type role; keep the SACRED diff add/remove tokens at full contrast, never
  foundation-overridden.

## Outcome

The diff view stays a pure projection of a `GitFileDiff` body — fetching nothing,
writing nothing (read-and-infer) — and renders the working-tree and historical
diff shapes the same way. The changes overview is a dumb projection over the
preserved `useGitStatus` / `useChangedFiles` / `useGitFileDiff` / `useEngineEvents`
selectors; degradation is read from those selectors' interpreted tiers truth, and
the colour-is-never-the-sole-signal diff grammar (the +/- glyphs and labels) is
preserved verbatim.

## Notes

The historical text-diff CAPABILITY (engine route, client `histdiff` verb, mock
mirror, conformance test) shipped in W01.P02; the diff body view renders it without
change because it is source-agnostic by construction. A dedicated stores READ HOOK
that fetches the `histdiff` verb for a two-rev range does not yet exist in the
preserved stores layer; adding one is a stores-layer change outside this Step's
scope fence (the stores layer is frozen/preserved). The consumer wiring of a
two-rev range belongs to the stores layer plus its time-travel consumer; flagged
for follow-up. No store shape or query-key change was made here. The aggregate
frontend gate is red on unrelated uncommitted scene-layer WIP from a concurrent
builder; both scoped files here pass eslint, prettier, and tsc cleanly.
