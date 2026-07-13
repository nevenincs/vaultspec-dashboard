---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-07-12'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

# `figma-parity-reconciliation` `W03.P08` summary

Phase W03.P08 rebuilt the three node states (default, selected, filtered-out), the
hover-card from the binding graph HoverCard frame 84:2 over the enriched node-evidence
query, and routed node selection and hover intent back through the preserved
`SceneController` event channel. All five Steps (S47 to S51) are closed. The interaction
work stayed render-and-bookkeeping only: no SceneController command or event union was
widened, no fetch was added, and the seam lock was honoured throughout.

- Modified: `frontend/src/scene/field/nodeSprites.ts` (S47)
- Modified: `frontend/src/scene/field/egoHighlight.ts` (S48)
- Modified: `frontend/src/scene/visibility.ts` (S49)
- Created: `frontend/src/app/right/menus/HoverCard.tsx` and `frontend/src/app/right/menus/hoverCardEvidence.ts` with their tests (S50)
- Modified: `frontend/src/scene/sceneController.ts` (S51)

## Description

S47 made the DEFAULT node state faithful to the binding Node-items frame by adding a
faint in-family hairline rim to the category disc: a pure clamped `darkenColor` helper
and `bodyRimColor` derive the rim as a darkened shade of the body's OWN resolved hue, so
the rim tracks the theme and the ghost desaturation with no second accent and no borrowed
neutral. The rim is drawn in the body-sync pass with inner alignment so it never inflates
the hit/island radius, and is redrawn only on the radius/colour-change path so it stays
off the per-frame hot path. The rim is a property of the circle present in every state,
keeping the disc's edge under the selection ring and the ego recede.

S48 made the SELECTED node state faithful by giving the single-accent selection ring a
persistence policy: a pure `selectedRingAlpha(egoHeld, lifted)` in `egoHighlight.ts`
returns full strength when no ego is held or when the selected node is itself the lifted
ego, and otherwise holds a legibility floor above the body recede (the new
`SELECTED_RING_RECEDE_FLOOR`). `nodeSprites` `refresh()` drives the ring alpha through
that policy rather than plainly following the body recede, so the accent ring stays the
one legible, persistent selection cue across the default, hover-ego, and ego-recede
interactions; the ring never follows the ghost floor (a selected retired node shows a
clear ring). The accent stays the single muted `state-active` token.

S49 made the FILTERED-OUT state faithful to the binding Hidden frame: a removed node
recedes toward transparent AND shrinks slightly, so a filter reads as the field pulling
back rather than a hard pop-out. The presentation curve is owned in the visibility module
as two pure mappings from membership-progress - `filteredAlpha` (linear, clamped) and
`filteredScale` (receding to the `FILTERED_OUT_SCALE` floor) - replacing the inline
magic numbers in `nodeSprites` `applyVisibility`. The established "N hidden" membership
semantics (full removal after the fade settles) are unchanged; filter SEMANTICS stay
engine/view-side and this step owns only the treatment.

S50 built the binding graph/HoverCard 84:2 hover-card in `frontend/src/app/right/menus/`
as a strict dumb projection over the enriched node-evidence. A pure `hoverCardEvidence.ts`
fold turns the stores-served `NodeEvidence` (documents, code-locations keyed on path with
resolution state, commits) into bounded, headed groups with a per-group cap and a
`+N more` overflow tail, omitting empty groups - no React, no fetch, no `tiers` read. The
presentational `HoverCard.tsx` renders the identity header (kind glyph in the category
accent, title), the grouped evidence lines, the single resolution-state tint from the
semantic state tokens, and the monospace identity tail, staying in the instrument
register (no gradients, textures, or second accent). Both are covered by tests fed a typed
model directly, exercising the real fold with no component-internal doubles. The card is
consumed via the `useNodeEvidence` stores hook by the wiring layer, never fetched here.

S51 routed selection and hover intent through the PRESERVED SceneController event channel
using the existing surface without widening it: the `select`/`hover` events out and the
`set-selected` command in were already on the locked union. `set-selected` was moved from
the no-op forwarding group into a retaining case holding a defensive `_selectedIds` copy
(mirroring the layout/representation/overlays cases) while still forwarding the command to
the field below, and a synchronous `getSelectionState()` was added returning a defensive
copy so a consumer can root a re-layout or focus on the current selection. No new command
or event kind was added.

## Verification

Each Step shipped its own commit and passed the scoped gate (eslint exit 0, prettier
--check clean, tsc exit 0) with its in-fence scene/menu tests green; the S51 full scene
suite ran 642 tests across 46 files green, confirming the `set-selected` field-forward
path is intact, and the full `right/menus/` directory ran 24 tests green at S50. The
aggregate frontend gate was not used as the green signal during the phase because of the
concurrent scene agent's live untracked WIP under the scene directory; scope was isolated
and confirmed clean per step.

Two scoped notes from the steps are recorded here. The live visibility module is
`frontend/src/scene/visibility.ts`; the plan row and the machine-filled Scope block name a
`field/` path that does not exist, so the established home one directory up was edited
(S49). The evidence value-add LOW-1 carry-forward (a `confidence` field) is engine-served
on the wire but not yet declared on the stores-layer `NodeEvidence` type; adding it is a
stores/type change outside this phase's preserved-and-frozen fence, so the derivation seam
folds only the typed fields available and gains the detail the moment the stores type
carries it - deferred to the stores owner (S50).

The W03 wave review returned REVISE, carrying HIGH-1: the new evidence-driven hover-card
(`frontend/src/app/right/menus/HoverCard.tsx`) was an orphaned surface - delivered in the
plan-named location but not wired into a consumer, while the sibling islands hover-bloom
card remained the live LOD rung. The HIGH-1 remediation has since landed gate-green. The
remaining state and routing work in the phase introduced no CRITICAL or HIGH findings.
