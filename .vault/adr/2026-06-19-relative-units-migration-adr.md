---
tags:
  - '#adr'
  - '#relative-units-migration'
date: '2026-06-19'
modified: '2026-07-12'
related:
  - "[[2026-06-19-relative-units-migration-research]]"
---

# `relative-units-migration` adr: `px-to-relative units migration` | (**status:** `accepted`)

## Problem Statement

The frontend must carry no hardcoded pixel values in its CSS and styling. Sizing,
spacing, padding, margins, radii, borders, shadows, and type must be expressed in
relative units (rem at the established 16px basis; em where a metric is naturally
font-relative), so the UI is consistently scalable and a future global UI-scale
preference is mechanically possible. This is a hard mandate: the relative-sizing
constraint is applied regardless of difficulty.

The research established that the foundation is already relative — the DTCG token
families (spacing, type, radius) emit rem `--*-fg-*` custom properties through Style
Dictionary at a 16px basis, guarded by a CI drift gate, with Tokens Studio round-
tripping for Figma. Figma itself is px-native and cannot express relative units; rem
is a code-side projection, and Figma remains the binding px source. So the
architectural problem is not building a relative system but **driving the remaining
hardcoded px in the implementation onto the relative scale that already exists, and
making that constraint structural so it cannot regress** — while honestly fencing the
one layer where relative units are undefined (the WebGL scene/canvas).

## Considerations

- **Measured surface.** ~73 Tailwind `[Npx]` arbitrary values across ~20 `*.tsx`
  files (timeline, viewer, left rail, kit) are the prime target — both off-scale and
  px. ~31 hand-authored literals in the app stylesheet (shadows, hairline borders,
  letter-spacing, dockview integration vars). ~117 `*.ts` hits are mostly scene/canvas
  render coordinates, layout math, and test fixtures — not stylesheet declarations.
- **Token pipeline is the lever.** The `--spacing-fg-*` / `--text-fg-*` /
  `--radius-fg-*` rem tokens already register into Tailwind utilities
  (`gap-fg-*`, `px-fg-*`, `text-body`, `rounded-fg-md`). Migration routes inline px
  through these, adding DTCG tokens (regenerated, never hand-edited between the
  managed markers) where the scale has a genuine gap, keeping Figma binding.
- **Layer ownership.** The DOM chrome (`frontend/src/app/`) and the app stylesheet are
  in scope. The scene layer (`frontend/src/scene/`) is owned by a parallel three.js
  migration team and is deferred — the campaign must not contend its render math.
- **Guard mechanism.** A grep-based CI gate wired into the existing
  `just dev lint frontend` recipe (path-scoped to exclude the scene layer, test
  fixtures, and the CLI-managed token region) is chosen over a bespoke ESLint plugin:
  cheaper, deterministic, and consistent with the project's "the full lint gate is the
  thing actually run" discipline.

## Constraints

- **Figma cannot store rem** — it is px-native (research F1/F2). This is not a blocker:
  the rem projection is code-side and already proven across the foundation families,
  so the binding-source direction is preserved, not violated.
- **The scene/canvas has no root font size**, so rem/em are undefined in WebGL render
  space (research F6). This hard-fences the scene layer out of the find-and-replace
  scope. The live graph surface is mid-migration to three.js by a parallel team;
  enrolling the canvas into UI scaling is a deliberate downstream feature, built with
  that graph, after the DOM surfaces are clean. Parent-feature stability: the three.js
  graph is actively changing, so depending on it now would be unstable — hence the
  deferral, not a co-edit.
- **The CLI-managed token region** of the app stylesheet is generator-owned; values
  there are already rem and must be regenerated, never hand-edited.
- **Sub-pixel blur** is the one accepted technical cost: rem borders/shadows can blur
  at fractional device-pixel ratios. Accepted by decision; mitigated by per-surface
  visual verification.

## Implementation

The campaign proceeds in four layered movements, respecting the existing pipeline and
the four-layer ownership boundary.

**1. Structural guard first.** Add a px-scan gate to the frontend lint recipe that
fails on a hardcoded `px` in app CSS and in `*.tsx` Tailwind arbitrary values, scoped
by path globs to exclude the scene layer, `*.test.*`, and the managed token region.
Landing the guard first makes the mandate enforceable and prevents regression while the
migration lands incrementally (the guard is seeded with a shrinking allowlist of
known-pending files, emptied as surfaces convert).

**2. Token reconciliation.** Reconcile the off-scale inline values against the DTCG
rem scale. Most snap to an existing step; the genuine gaps (a small number of spacing
or type values that recur) are added to the DTCG sources and regenerated so the
`--*-fg-*` surface and the Tailwind registration pick them up, with Figma updated to
match (binding direction preserved).

**3. Surface-by-surface conversion.** Convert each DOM surface in turn — timeline,
viewer, left rail, kit, shell, and the app stylesheet literals — replacing `[Npx]`
with token utilities (`gap-fg-*`, `px-fg-*`) or rem arbitrary values where no token
fits, converting hairline borders to `0.0625rem`, shadow geometry to rem, and
letter-spacing to em. Each surface is removed from the guard allowlist and visually
verified against its Figma node before it is declared done.

**4. Deferred canvas scaling.** After every DOM surface and the stylesheet are clean
and the guard allowlist is empty, implement scene/canvas UI-scaling as a feature with
the three.js graph: read the computed root scale and multiply render-space px by the
rem ratio, in coordination with the parallel team. Until then the scene px is a
documented, accepted divergence.

## Rationale

Research F0 reframed the problem: the relative system exists, so the cheapest correct
path is to extend its reach and lock it structurally, not to rebuild it. F1–F3
establish that Figma's px-native model is not an obstacle because the rem projection
is already a solved build-time transform and Figma stays the binding source. F4
sized the work and showed the `[Npx]` arbitrary values are both the largest and the
worst offenders (off-scale and px), making them the obvious first target. F5 records
the user's rulings — convert everything including borders/shadows, snap off-scale to
tokens. F6 establishes that the scene layer cannot take rem and is actively owned by a
parallel team, which is why it is deferred rather than forced. The grep-gate-first
ordering mirrors the project's lint-gate discipline: a constraint that is not in the
gate that actually runs will regress.

## Consequences

- **Gains:** one consistent relative scale across the whole DOM; a structural guard
  that makes the mandate self-enforcing; a UI that scales coherently; and the direct
  enabler for a future user-facing global UI-scale / text-size preference (the rem
  basis becomes a single themeable knob).
- **Difficulties:** snapping off-scale values shifts a few pixels and demands per-
  surface visual verification against Figma; rem borders/shadows carry a sub-pixel-blur
  risk at fractional DPR; the timeline carries dense `[Npx]` math that needs care to
  distinguish layout sizing (migrate) from canvas/scroll math (leave).
- **Pathways opened:** the global UI-scale setting; tighter Figma parity because every
  value flows through the binding token scale.
- **Pitfalls:** contending the scene files with the parallel three.js team (mitigated
  by the deferral); accidentally editing the managed token region by hand (mitigated by
  the guard's path exclusion and the regenerate-only discipline).

## Codification candidates

- **Rule slug:** `no-hardcoded-px-in-dom-styling`.
  **Rule:** Frontend DOM CSS and `*.tsx` Tailwind arbitrary values must express all
  sizing, spacing, radius, border, shadow, and type in relative units (rem at the 16px
  basis, em for font-relative metrics) routed through the DTCG `--*-fg-*` token scale;
  hardcoded `px` is a defect there, with the WebGL scene/canvas layer, test fixtures,
  and the CLI-managed token region the only sanctioned exceptions.

  (Promote only after the constraint has held across this full execution cycle, per
  the codify discipline — named here as a candidate, not yet a rule.)
