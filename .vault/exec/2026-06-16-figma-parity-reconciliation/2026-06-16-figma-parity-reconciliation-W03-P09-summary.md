---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-07-12'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

# `figma-parity-reconciliation` `W03.P09` summary

Phase W03.P09 rebuilt the consolidated plain-language graph controls (Navigate, Layout,
Zoom, Tune) from the binding graph Controls frame 88:2 and tuned the connection-drawing
fidelity to the binding graph Hero frame, keeping document granularity bounded by the
engine node ceiling. All five Steps (S52 to S56) are closed. Every control stayed a dumb
projection over the preserved `SceneController` and view stores - emitting commands or
writing stores state, fetching nothing and reading no raw `tiers` block - and the two
shared scene modules were touched documentation-only to honour the no-break directive on
the concurrent scene agent's layout work.

- Modified: `frontend/src/app/stage/GraphControls.tsx` (S52)
- Modified: `frontend/src/app/stage/LensSelector.tsx` (S53)
- Modified: `frontend/src/scene/field/forceLayout.ts` (S54, doc-only)
- Modified: `frontend/src/app/stage/CanvasControls.render.test.tsx` (S55)
- Modified: `frontend/src/scene/field/backbone.ts` (S56, doc-only)

## Description

S52 refined the consolidated controls shell `GraphControls.tsx` over the regenerated
Figma foundation, keeping the binding Controls group structure: Navigate (the camera icon
row plus the freeze toggle), Layout (the grouped representation picker), Zoom (the
two-stop LOD descent), and Tune (the plain-language d3-force sliders), with Overview
collapsed beside Tune. The control type usages were migrated off the deprecated W01.P01
legacy aliases scheduled for W04 removal (segment and popover-trigger labels to
`text-label`, slider readouts and end captions to `text-caption`), and the radius and
elevation classes were confirmed to resolve through the foundation alias layer onto the
Figma scales. Icons stay Lucide structural marks with no raw hex.

S53 consolidated the binding Layout control into `LensSelector.tsx` as an exported
`LayoutSelector` so the canonical Network/Tree/Grouped/Timeline picker has a single home,
moving the shared `Segmented` roving-tabstop control and the segment catalogs out of
`GraphControls.tsx`. The plain-language framing is surfaced over the PRESERVED
representation-mode catalog: Network maps to connectivity, Tree to lineage, the
clustering-family modes and grouped-by-meaning semantic mode stay reachable under the
Grouped framing so no catalog mode is orphaned, and Timeline stays distinct as the
temporal time-travel seam. The salience `LensSelector` export was preserved intact in the
same module as a real, store-backed, separately-docked capability rather than destroyed.
Selecting a spatial mode writes the representation mode and Timeline enters time-travel
via `movePlayhead`; the pre-existing six-segment `GraphControls.render.test.tsx` contract
is unchanged and still passes 23/23.

S54 pinned the binding Tune-control contract onto the preserved d3-force driver
`LayoutParams` so the driver is the single source of truth for the plain-language knob
mapping (Spacing to `repel`, Connection-reach to `linkDistance`, Clustering to
`linkForce`). The `center`/gravity knob is documented as deliberately unsurfaced by the
binding control (no plain-language slot, recorded as research gap F4), kept at its default
so the Tune control ships no dead control. Because `forceLayout.ts` is shared with the
concurrent scene agent's layout-quality gates, this step changed ONLY documentation
comments - no behavioural, API, or default-value change - and the Tune-knob mapping was
already implemented in the shell against these exact knobs.

S55 added a binding Zoom + Navigate canvas-controls render-test block to
`CanvasControls.render.test.tsx` exercising the controls through the real `SceneController`
singleton and the real view store: Navigate emits the four real camera commands
(zoom-in/out, fit-to-view, reset-view), the Zoom flanking minus/plus issue real
incremental camera-zoom commands, and the Zoom LOD descent both reads and writes the
preserved granularity (an already-document granularity renders the slider at the Detail
stop on mount, proving the control is a projection of the preserved state). A pre-existing
stale FilterBar cost-chip assertion expecting the retired `rounded-full` was repaired to
the current canonical `rounded-fg-pill` token, derived from the committed source rebuilt
in W02.P05.S33, not from a failing run.

S56 tuned the connection-drawing fidelity contract on `backbone.ts` to the binding Hero
frame: the clean category-circles-on-faint-rule-lines reading is produced by the
anti-hairball split here (lay out on the precise declared-plus-structural backbone,
disparity-thin the noisy tiers into a significant-subset context) while the flat-grey
stroke treatment is rendered in the edge mesh layer from W03.P07.S45. The
bounded-by-default boundary is affirmed: the split operates on the slice the engine
already bounded (constellation LOD, or document granularity capped by `MAX_DOCUMENT_NODES`
and carried through the stores `truncated` block) and only partitions that bounded edge
set, never re-expanding it. Because `backbone.ts` is shared with the scene agent's layout
modules and a pinned contract test, this step changed ONLY documentation comments
(including correcting stale FA2-worker references to the live force driver) - no change to
the split logic, tier set, or any export.

## Verification

Each Step shipped its own commit and passed the scoped gate (tsc exit 0, eslint clean,
prettier clean) with its in-fence tests green: `GraphControls.render.test.tsx` 23/23
through S53, `forceLayout.test.ts` plus the controls test 49/49 at S54,
`CanvasControls.render.test.tsx` 19/19 at S55, and `backbone.test.ts` 11/11 at S56. The
two shared scene modules (S54, S56) were doc-only by deliberate design to honour the
no-break directive on the concurrent scene agent's layout-quality work, so no export
changed and no consumer needed flagging.

The W03 wave review returned REVISE, carrying the HIGH-1 orphaned evidence HoverCard from
P08 plus the carry-forward notes; the HIGH-1 remediation has since landed gate-green. P09
itself - the controls consolidation, the Layout/Tune/Zoom/Navigate fidelity, and the
connection-drawing contract - introduced no CRITICAL or HIGH findings, preserved every
catalog mode and the salience lens as real consumed capabilities, and kept document
granularity bounded by the node ceiling.
