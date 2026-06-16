---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S32'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace figma-parity-reconciliation with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S32 and 2026-06-16-figma-parity-reconciliation-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Rebuild the changes overview and diff view from their binding frames over the preserved diff query, including the historical text-diff route and ## Scope

- `frontend/src/app/right/DiffView.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

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
