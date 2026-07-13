---
tags:
  - '#exec'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S34'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
---

# Author the lifecycle state marks in-family from Phosphor primitives honoring the active-versus-node-feature and broken-bolt collision constraints, each passing the 14px grayscale gate

## Scope

- `frontend/src/scene/field/glyphs.ts`

## Description

- Authored the five lifecycle state marks in-family from Phosphor primitives on the 256 grid: `active` a solid filled disc (settled energy, deliberately NO ring), `complete` a ring-plus-check (Phosphor CheckCircle energy), `archived` the archive-drawer silhouette, `broken` a tall lightning bolt cutting through a gapped baseline with sharp miter joins (the one sanctioned sharp ornament per the redline), and `stale` a counter-clockwise clock.
- Honored the two documented collision constraints by construction: `active` is a single solid disc and grows no ring, so it cannot collide with the node-feature mark's open asymmetric multi-dot cluster nor read as the state-active ring; `broken` was made tall with a widened central line gap so the bolt-through-a-line silhouette survives 14px rather than collapsing to a star or plus.
- Added gate tests asserting the state family is mutually distinct at 14px above the floor, with a named-pair assertion that `active` (solid disc) and `broken` (bolt-through-line) do not collide, plus a decisive test that a hollow ring is not a solid disc (the `complete`-vs-`active` separation the pure rasterizer makes correct).

## Outcome

The five lifecycle state marks are authored in-family and pass the 14px grayscale gate with a minimum pairwise Hamming distance of 27 (floor 8); the closest pair is active/broken and the family clears the floor comfortably. The active-vs-node-feature and broken-bolt collision constraints are satisfied structurally: `active` is a clean filled disc with no ring, and `broken` reads as a bolt through a gapped line at the legibility floor. The marks feed the same `currentColor` texture seam and React chrome plane as the rest of the family.

## Notes

The decisive collision constraint — `active` must not grow a ring — is honored by drawing it as a bare filled disc. This is also what keeps it apart from `complete` (a ring + check): under a naive fill-containment gate the disc and the ring-with-check both read as a filled circle and falsely collide, which is exactly the false pass the pure ink rasterizer (authored under S33) was built to catch. No skipped work; no scaffolds.

Revision (design review, HIGH): the independent reviewer rasterized the marks at 14px and found `state:broken`'s gapped baseline vanished at the gate resolution — at stroke-width 18 anchored on y=128 (which falls between gate cell-center rows 6 and 7, each ~9.1 grid-units away, just outside the half-band of 9), the baseline inked zero cells, so the shipped mark was a bare bolt (coverage 13) and the documented through-a-gapped-line reading was absent. The original guard only asserted distance from `active` (a disc), which a bare bolt passes trivially — vacuous. Fixed by anchoring the baseline on the y=137 cell-center row (gate row 7) and thickening it to stroke-width 30 (~1.6px band), so the baseline now inks cells on that row to BOTH sides of the bolt column; coverage rose to 21 and active-vs-broken distance rose from 27 to 31. The guard was replaced with a non-vacuous assertion that the baseline row inks cells OUTSIDE the bolt column on both sides — proving the through-a-line reading survives the legibility floor, not merely that the mark differs from a disc.
