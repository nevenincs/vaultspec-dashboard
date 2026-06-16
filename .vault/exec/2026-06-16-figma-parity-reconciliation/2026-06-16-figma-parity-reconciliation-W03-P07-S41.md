---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S41'
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
     The S41 and 2026-06-16-figma-parity-reconciliation-plan placeholders are machine-filled by
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
     The Rewrite the Pixi field renderer to the binding connection-field treatment driven through the preserved SceneController and ## Scope

- `frontend/src/scene/field/pixiField.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Rewrite the Pixi field renderer to the binding connection-field treatment driven through the preserved SceneController

## Scope

- `frontend/src/scene/field/pixiField.ts`

## Description

- Rewrote `pixiField.ts` as the clean GPU substrate for the binding connection-field treatment (graph/Hero 85:2): the Pixi Application, its warm paper ground, and the camera-driven world container the sprite/edge/overlay layers parent under.
- Established the field ground the clean connection lines and category circles read against, sourced from the `--color-canvas-bg` scene token as literal hex per theme (themes-are-oklch; resolvable by getComputedStyle, no var() chain).
- Corrected the canvas-background fallback from the stale `0xfaf9f7` to the actual light-theme token value `0xfdfaf6` so the node-test-env ground matches the live `:root` literal hex.
- Lifted the data-theme MutationObserver wiring into a private `watchTheme` helper, keeping the field ground synced to the active theme on a `[data-theme]` flip.
- Documented the file as the renderer side of the FROZEN SceneController seam: it widens neither the command nor the event union, receives data only via the forwarded command channel, and never fetches or reaches into the stores layer (dashboard-layer-ownership).

## Outcome

The connection-field GPU substrate is rewritten cleanly and faithfully on the frozen contract and the regenerated literal-hex foundation. Scoped gate green: eslint exit 0, prettier --check clean, project tsc -b exit 0, and the field-assembly + token-read scene tests pass (20/20). The change is render-only; no graph compute moved and no LOD/ceiling semantics changed.

## Notes

Figma MCP read of the binding `graph/Hero 85:2` frame was not reachable from this executor session (the figma plugin tools are not exposed as callable functions here, and the local `figma-snapshot.json` is a stale capture of the retired seed file, not the live binding frames). Proceeded on the documented ADR fallback: the current scene, already restyled toward graph/Hero this cycle, as the faithful base, rewritten cleanly on the frozen SceneController contract and the new literal-hex foundation tokens.

The aggregate `just dev lint frontend` was not used as the green signal because a concurrent scene agent has live scorecard/gate WIP in this directory; scope was isolated and confirmed clean on the touched file plus the scene tests.
