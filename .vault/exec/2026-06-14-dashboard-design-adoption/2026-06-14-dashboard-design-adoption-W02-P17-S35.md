---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S35'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-design-adoption with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S35 and 2026-06-14-dashboard-design-adoption-plan placeholders are machine-filled by
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
     The Author the deliberately-asymmetric node-feature species mark in-family honoring its collision constraints against the state-active ring, passing the 14px grayscale gate and ## Scope

- `frontend/src/scene/field/glyphs.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Author the deliberately-asymmetric node-feature species mark in-family honoring its collision constraints against the state-active ring, passing the 14px grayscale gate

## Scope

- `frontend/src/scene/field/glyphs.ts`

## Description

- Authored the deliberately-asymmetric node-feature species mark in-family on the 256 grid, carrying the retired family's redline geometry: three dots of three SIZES (radii 26 / 18 / 13) in a scalene triangle with the largest low-left, an OPEN binding lasso (an arc with a ~70-degree gap at the upper-left, a sketched lasso not a closed head), and one detail-weight thread between the two smaller dots, steeply diagonal with clear air around each dot so it never fuses into a bar.
- Mapped the mark onto the `feature` GLYPH_KINDS species in the shared mark registry so the constellation's center-of-gravity node resolves to it through the same texture seam as every other species.
- Added gate tests asserting the node-feature mark honors its collision constraints: a named-pair distinctness assertion against `state:active` (single solid disc vs multi-dot open cluster — the documented redline), and an asymmetry assertion that its silhouette is not left-right mirror-symmetric (the scalene cluster and the upper-left lasso gap are the mark's identity, so a horizontal mirror must differ).

## Outcome

The node-feature mark is authored in-family and passes the 14px grayscale gate: its silhouette is distinct from `state:active` (the documented collision) well above the floor, and it is provably asymmetric at the legibility floor. The 14px ink bitmap renders as a loose hand-circled cluster of unequal points with the open lasso gap intact — the target reading. It feeds both the texture seam (as the `feature` species texture) and the React chrome plane from one source.

## Notes

The collision guard against the state-active ring is honored at the source: `active` was authored as a bare filled disc with no ring (S34), and this mark's lasso is an explicitly open arc with a deliberate gap, never a clean closed ring — so the two never converge on the same silhouette. The asymmetry test is non-tautological: it folds the silhouette across its vertical axis and asserts a non-zero mismatch, which would fail immediately if a future edit symmetrized the dot cluster or closed the lasso. No skipped work; no scaffolds.
