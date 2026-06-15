---
tags:
  - '#exec'
  - '#node-visual-richness'
date: '2026-06-15'
modified: '2026-06-15'
step_id: 'S12'
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
     The S12 and 2026-06-14-node-visual-richness-plan placeholders are machine-filled by
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
     The render the status-stamp channel mapping class to one treatment under LOD discipline and ## Scope

- `frontend/src/scene/field/nodeSprites.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# render the status-stamp channel mapping class to one treatment under LOD discipline

## Scope

- `frontend/src/scene/field/nodeSprites.ts`

## Description

- Render the single status treatment per node (the rule of one) by mapping the stamp descriptor to one shape: a coarse outline ring (solid/dashed) and slash drawn as a `Graphics` just outside the silhouette, a ghost reading that drops the sprite fill to the archived token and dims to a ghost floor, and the fine severity-dot / tier-notch drawn through the glyph provider as a positioned tinted sprite (severity at 4-5 o'clock, tier at 7-8 o'clock).
- Split the treatment by LOD: the coarse ring/slash/ghost shows at all LOD beside the sprite, while the exact severity level and tier step unfold only in the near-LOD anatomy, mirroring the existing far/near split.
- Read the reinforcing tint through the existing `getCssColor` token seam, keep the progress ring intact so tiered and progress coexist, and make `textureForMark` an optional seam method so a provider lacking it skips only the fine stamp.

## Outcome

A node now carries exactly one status stamp: type stays on the silhouette, salience on size, status on the stamp. The coarse mark survives the far field; the magnitude unfolds on zoom/focus. Ghost dim, slash, and ring all track the recede and visibility passes so the stamp never desyncs from its sprite.

## Notes

`textureForMark` was promoted to an optional method on the glyph-provider interface (the placeholder fallback omits it); the fine dot/notch then no-ops on a provider without it while the coarse ring/slash/ghost still renders. The ghost dim is applied in the refresh and visibility alpha math, consistent with how recede is applied (not in the initial sync set).
