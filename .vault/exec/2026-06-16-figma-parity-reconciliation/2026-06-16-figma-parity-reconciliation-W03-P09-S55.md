---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S55'
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
     The S55 and 2026-06-16-figma-parity-reconciliation-plan placeholders are machine-filled by
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
     The Rebuild the Zoom and Navigate canvas controls per the binding Controls frame over the preserved camera state and ## Scope

- `frontend/src/app/stage/CanvasControls.render.test.tsx` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Rebuild the Zoom and Navigate canvas controls per the binding Controls frame over the preserved camera state

## Scope

- `frontend/src/app/stage/CanvasControls.render.test.tsx`

## Description

- Add a binding Zoom + Navigate canvas-controls render-test block to `CanvasControls.render.test.tsx` that exercises the controls through the real `SceneController` singleton and the real view store, asserting the canvas-camera contract over the PRESERVED camera state: Navigate emits the four real camera SceneCommands (zoom-in/out, fit-to-view, reset-view), the Zoom flanking minus/plus issue real incremental camera-zoom commands, and the Zoom (LOD) descent both reads and writes the preserved granularity.
- Assert the read half of the projection explicitly: an already-document granularity renders the Zoom slider at the Detail stop on mount, proving the control is a projection of the preserved state rather than a private camera model.
- Repair a pre-existing stale assertion in the same file: the FilterBar cost-chip test still expected the retired `rounded-full` utility; the current FilterBar source (rebuilt onto the Figma foundation in W02.P05.S33) carries the canonical `rounded-fg-pill` token. The expected value is derived from the committed source, not copied from a failing run.

## Outcome

The Zoom and Navigate canvas controls are verified as dumb projections over the preserved `SceneController` command channel and the view-store granularity: they emit real camera commands and read/write the LOD descent without fetching or minting a camera model. The full file passes (19/19) and the scope gate is green: tsc exit 0, eslint clean, prettier clean.

## Notes

The plan row names `CanvasControls.render.test.tsx` "(+ its source)". The Zoom and Navigate controls' source is `GraphControls.tsx` (the NavigateGroup icon row and the ZoomGroup LOD descent), which already emits the binding camera commands and was committed under S52/S53; this step adds the canvas-camera-state coverage rather than duplicating a separate source. The new assertions are framed on the preserved-state round-trip (read + write over the SceneController and granularity) to avoid duplicating the write-only coverage in the out-of-fence `GraphControls.render.test.tsx`. The repaired FilterBar assertion was a pre-existing failure introduced when the FilterBar source was rebuilt in W02.P05.S33; because the failing test lives in this phase's in-fence test file, it was corrected here to the current canonical token rather than left red.
