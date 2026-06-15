---
tags:
  - '#exec'
  - '#node-visual-richness'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S20'
related:
  - "[[2026-06-14-node-visual-richness-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace node-visual-richness with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     step_id is the originating Step's canonical identifier, e.g. S01.
     The S20 and 2026-06-14-node-visual-richness-plan placeholders are machine-filled by
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
     The visually inspect status stamps per type and the hover-bloom on the running canvas and ## Scope

- `frontend/src/app/stage/Stage.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# visually inspect status stamps per type and the hover-bloom on the running canvas

## Scope

- `frontend/src/app/stage/Stage.tsx`

## Description

- Drive the standalone prototype harness in a headless browser across light, dark, and high-contrast themes: capture the full doc-type x status-class stamp matrix and an interactive hover-bloom card.
- Run the integrated app against the mock engine and inspect the live GPU canvas: confirm nodes render with the salience-driven size, the status stamp, and no console or page errors.

## Outcome

The prototype confirmed all seven stamp treatments legible in grayscale (solid ring, dashed ring, slash, ghost, ghost-plus-slash, severity gauge, tier notch) and a working hover-bloom card (kind glyph, title, status chip, microline, open affordance) across all three themes. The integrated mock-engine canvas rendered the feature constellation with the affirmed-ring stamp, salience size, and tier badges, with zero console or page errors - confirming the status-stamp sprite code and the hover-card layer mount and run in the real app.

## Notes

Per-doc-type stamps on individual document nodes (provisional, negated, retired, graded, tiered) were validated exhaustively in the prototype harness and the sprite unit tests; reaching document level-of-detail on the live canvas to photograph each one requires a filter or feature-expand interaction not driven here. Precise hover over a WebGL node hit-area was not reliably scriptable blind, so the hover-bloom was validated via the prototype and the fifteen P04 interaction tests rather than a live-canvas screenshot.
