---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
step_id: 'S54'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

# Rebuild the Tune knobs (Spacing, Connection-reach, Clustering) mapped onto the preserved d3-force driver

## Scope

- `frontend/src/scene/field/forceLayout.ts`

## Description

- Pin the binding Tune-control contract (`graph/Controls` 88:2) onto the preserved d3-force driver `LayoutParams` so the driver is the single source of truth for the plain-language knob mapping: Spacing maps to `repel`, Connection-reach to `linkDistance`, Clustering to `linkForce`.
- Document the `center` (gravity) knob as deliberately unsurfaced by the binding Tune control (no plain-language slot in the design, recorded as a UI gap in research F4), kept as a driver knob held at its default so the Tune control exposes only knobs the driver actually has and ships no dead control.
- Annotate `LAYOUT_DEFAULTS` to record that the default values are deliberately left UNCHANGED in this step: they seed the scene-layer layout-quality calibration, so the binding Tune control is mapped onto the driver without re-tuning the defaults.

## Outcome

The d3-force driver carries the binding plain-language Tune mapping as a documented contract; the Tune sliders in the controls shell already drive exactly `repel`/`linkDistance`/`linkForce` through `set-layout-params`. The exported API surface is byte-for-byte stable: `FieldLayout`, `FrameScheduler`, `LayoutEdgeRef`, `LayoutParams`, `LAYOUT_DEFAULTS`, and every method and field name and default value are unchanged. Scope gate green: tsc exit 0, eslint clean, prettier clean; `forceLayout.test.ts` and `GraphControls.render.test.tsx` pass (49/49).

## Notes

forceLayout.ts is shared with the concurrent scene agent's layout-quality gates (`forceGate.ts` imports `FieldLayout`/`FrameScheduler`/`LayoutEdgeRef`; the scorecard property/perturbation gates run the driver at `LAYOUT_DEFAULTS`). To honor the no-break directive on the shared module, this step changed ONLY documentation comments on `LayoutParams` and `LAYOUT_DEFAULTS` — no behavioural change, no API change, no default-value change. The Tune-knob mapping was already implemented in the controls shell against these exact knobs; the deliverable here is making the driver the documented contract for that mapping. No export was changed, so no scene-agent consumer needed flagging.
