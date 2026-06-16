---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S26'
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
     The S26 and 2026-06-16-figma-parity-reconciliation-plan placeholders are machine-filled by
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
     The Rebuild the code tree browser from the binding CodeTree Kit primitive over the preserved code-selection store and ## Scope

- `frontend/src/app/left/CodeTree.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Rebuild the code tree browser from the binding CodeTree Kit primitive over the preserved code-selection store

## Scope

- `frontend/src/app/left/CodeTree.tsx`

## Description

- Migrate the code tree browser onto the W01.P01 Figma foundation: every deprecated dense-metadata type utility re-keys to the canonical caption role utility (the degraded banner, the truncated note, the per-level loading and error cues) and every deprecated radius alias re-keys to the canonical xs radius utility (the retry control, degraded banner, and the directory/file rows).
- Keep the browser a dumb projection over the preserved code-selection store and the bounded, lazy file-tree query: the root level reads through the file-tree query hook for the active scope, each expanded directory fetches its children one level at a time through the same hook (cached per scope), degradation is read only through the file-tree availability selector (never the raw tiers block), and selection joins on the stable code node id through the shared code click handler.
- Preserve the bounded-read honesty (capped levels render a truncated note rather than a silent partial result), the four honest states, the lazy directory disclosure with its keyboard contract, the quiet linkage marker, and the grayscale-safe accent-bar selection cue; the true-circle accent bar and linkage dot keep the full-round utility.

## Outcome

The code tree browser renders on the canonical Figma foundation utilities (caption type, xs radius) while staying a pure projection over the preserved file-tree query and code-selection store. The tree is bounded and lazy, degradation is read from the availability selector, and the in-rail filter narrows the visible tree client-side with no wire request. No fetch, no model minted, no stores shape change. eslint, prettier, and tsc are all clean for this step's file, and the code-tree test suite (17 tests across the render and code-selection files) stays green.

## Notes

Figma read tools were unavailable; the rebuild was grounded in the existing browser (restyled to the binding CodeTree Kit primitive this cycle per research F3), the Code Connect mapping (node 158:126), and the frozen contract reference. Gate caveat unchanged: the aggregate frontend lint gate exits non-zero only because of the concurrent W03 scene agent's in-flight, untracked scorecard files under the scene layer, which are outside this phase's scope fence and were not touched.
