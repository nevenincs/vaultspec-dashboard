---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-06-14'
step_id: 'S36'
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
     The S36 and 2026-06-14-dashboard-design-adoption-plan placeholders are machine-filled by
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
     The Implement the progress ring as a small parametric programmatic component (exact arc fills) rather than static SVGs and ## Scope

- `frontend/src/scene/field/glyphs.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Implement the progress ring as a small parametric programmatic component (exact arc fills) rather than static SVGs

## Scope

- `frontend/src/scene/field/glyphs.ts`

## Description

- Implemented the progress ring as a small parametric programmatic component (`progressRing.ts`), not a static SVG icon: a pure `ringArc(fraction)` that anchors the start at 12 o'clock and sweeps the exact done/total fraction clockwise, and a `drawProgressRing` that maps that geometry onto a Pixi `Graphics` (optional faint full-circle track plus the exact progress arc, omitting the arc at fraction 0 so a zero-sweep cap is never drawn).
- Rewired the node sprite layer's inline anatomy arc to draw through this primitive, so the canvas progress ring and the parametric component share one exact-arc implementation instead of duplicating the arc math.
- Added pure unit tests for the arc geometry (start fixed at 12 o'clock, sweep equals the fraction of a full turn, quarter-progress ends at 3 o'clock, out-of-range fractions clamp to a single revolution, ringless on non-positive or non-finite total) and a happy-dom draw test asserting the primitive produces real Pixi geometry and skips the arc at fraction 0.

## Outcome

The progress ring is a parametric arc-fill primitive driven by `done/total`, grayscale-safe and legible at small size by arc length alone (no hue, no gradient). The exact arc math is pure and unit-tested GPU-free; the draw step maps it onto the GPU primitive the same way the sprite layer maps node radius and state colour. The node-canvas anatomy now consumes this one primitive, so plan and feature nodes render their progress through the sanctioned component rather than an inline arc.

## Notes

The ring is explicitly NOT an icon and does not pass through the mark texture seam or the grayscale-shape gate — it is a parametric primitive per the iconography ADR, so it carries its own geometry tests rather than a silhouette-distinctness assertion. No skipped work; no scaffolds.
