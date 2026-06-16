---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S49'
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
     The S49 and 2026-06-16-figma-parity-reconciliation-plan placeholders are machine-filled by
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
     The Rebuild the filtered-out node state treatment per the binding frame and ## Scope

- `frontend/src/scene/field/visibility.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Rebuild the filtered-out node state treatment per the binding frame

## Scope

- `frontend/src/scene/field/visibility.ts`

## Description

- Make the FILTERED-OUT node state faithful to the binding `graph/Node-items` "Hidden" frame: a removed node recedes toward transparent AND shrinks slightly, so a filter reads as the field PULLING BACK rather than a hard pop-out, letting the user see what the filter removed mid-transition before it settles away.
- Own the filtered-out presentation curve in the visibility module (RL-5a, the home of the membership-progress tracker) as two pure mappings from membership-progress: `filteredAlpha` (linear, clamped) and `filteredScale` (full size at present, receding to the `FILTERED_OUT_SCALE` floor at fully filtered out) plus the exported floor constant.
- Replace the inline magic-number fade/shrink in `nodeSprites` `applyVisibility` with those named mappings, composing the body fade with the per-node ghost floor as before; the ring and anatomy follow the same fade and scale.
- Cover both mappings in `visibility.test.ts`: alpha fades linearly and clamps out-of-range progress, scale recedes monotonically to the shrink floor (a pull-back above zero, never a collapse-to-point).

## Outcome

The filtered-out state recedes faithfully (fade plus pull-back shrink) with the curve in one testable home, and the established "N hidden" membership semantics (full removal after the fade settles) are unchanged. Scoped scene tests green (`visibility.test.ts`, `nodeSprites.test.ts`, `nodeSprites.draw.test.tsx`, `egoHighlight.test.ts`).

## Notes

The live visibility module is `frontend/src/scene/visibility.ts`; the plan row (and the machine-filled Scope block above) names `frontend/src/scene/field/visibility.ts`, but no module exists under `field/` — the established home is one directory up, and that is the file edited. Filter SEMANTICS stay engine/view-side (RL-5a); this step owns only the filtered-out TREATMENT. Scope touched `visibility.ts` and `nodeSprites.ts` (the consumer) plus their tests; no SceneController surface change.
