---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace figma-parity-reconciliation with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- PHASE SUMMARY:
     This file rolls up every <Step Record> belonging to one Phase
     of the originating plan. Each Step (S##) in the Phase produces
     one <Step Record> in `.vault/exec/`; this summary aggregates
     them, lists modified / created files across the Phase, and
     reports verification status. -->

# `figma-parity-reconciliation` `W02.P05` summary

P05 rebuilt the right activity-rail panes and the stage chrome onto the canonical
Figma role-named token foundation. Across the seven Steps the legacy radius, dense
type, and six-level brand-elevation scales were re-keyed to the canonical
foundation utilities - the xs/md/pill radius steps, the caption and label type
roles, and the three-level raised and overlay elevations - while every surface
stayed a dumb projection over its preserved selector or query: nothing fetched,
mutated a stores shape, or read the raw tiers block.

The rail tab bar (S28) rebuilt the segmented track visually and held the tab-id
identity contract stable. The inspector (S29) projects the preserved selection
store and the enriched node-evidence hooks unchanged. The work tab (S30) projects
the preserved pipeline-status and plan-interior selectors with the grayscale-safe
progress ring, status pill, and bounded plan step tree intact. The search tab
(S31) reads semantic-offline from the controller's tiers-gated truth, never from a
bare transport error, honoring degradation-is-read-from-tiers. The changes
overview and diff view (S32) were made source-agnostic so the diff body renders the
working-tree and the bounded historical two-rev shapes identically, with the sacred
add/remove diff tokens held at full contrast. The stage filter bar and sidebar
(S33) project the preserved filter store and the engine-enumerated vocabulary, and
the minimap (S34) remains app-chrome over the preserved SceneController seam.

Files touched across the phase:

- Modified: `frontend/src/app/right/RailTabs.tsx`
- Modified: `frontend/src/app/right/Inspector.tsx`
- Modified: `frontend/src/app/right/WorkTab.tsx`
- Modified: `frontend/src/app/right/SearchTab.tsx`
- Modified: `frontend/src/app/right/DiffView.tsx`
- Modified: `frontend/src/app/right/ChangesOverview.tsx`
- Modified: `frontend/src/app/stage/FilterBar.tsx`
- Modified: `frontend/src/app/stage/FilterSidebar.tsx`
- Modified: `frontend/src/app/stage/MinimapWidget.tsx`

The phase landed across commits `5894fa3` and `f7a3e81..2bddd63`. Each scoped file
passes eslint, prettier, and tsc cleanly and the affected suites stay green; the
aggregate frontend gate is red only on the concurrent W03 scene agent's in-flight,
untracked scorecard files under `frontend/src/scene/field/`, which are outside this
phase's scope fence and were not touched.

## Description

W02 carried a phase review with a PASS-WITH-NITS verdict and no CRITICAL or HIGH
findings. Two MEDIUM items were carried forward into W04, both surfaced by the
right-rail surfaces rebuilt in this phase:

- The right-rail IA reconciliation. The binding Figma IA renames the four tabs from
  `Status | Inspect | Search | Changes` to `Inspect | Work | Search | Changes`.
  S28 rebuilt the tab bar's visual treatment onto the foundation but deliberately
  held the tab-id union stable, because renaming the id union in the leaf bar alone
  would break the host's typecheck and the rail IA test. The rename lands at
  W04.P10.S57, where the RailTabs id union and the AppShell host's tab-to-pane
  mapping flip together in one change.

- A `useGitHistDiffView` stores read hook. The historical text-diff capability
  (the engine `histdiff` route, its mock mirror, and the conformance test) shipped
  in W01.P02, and S32 made the diff body view source-agnostic so it renders that
  shape unchanged. What is still missing is a stores-layer read hook that fetches
  the `histdiff` verb for a two-rev range, so the historical diff is consumable
  end-to-end; adding it is a stores-layer change that belongs to W04 alongside its
  time-travel consumer.
