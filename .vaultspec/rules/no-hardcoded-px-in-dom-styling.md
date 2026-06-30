---
name: no-hardcoded-px-in-dom-styling
---

# Sizing is relative: no hardcoded px in the frontend

## Rule

Every size, spacing, padding, margin, radius, border, shadow, and type value in the
frontend is expressed in relative units — `rem` at the 16px basis (or `em` for a
naturally font-relative metric), routed through the DTCG `--*-fg-*` token scale where a
token fits. Hardcoded `px` is a defect in: `frontend/src/**` DOM CSS, and `*.tsx`
Tailwind arbitrary values (`gap-[8px]`, `text-[13px]`, `w-[248px]`) and inline style
strings. This is enforced by the `lint:px` gate (`frontend/scripts/scan-px.mjs`, wired
into `just dev lint frontend`); its allowlist must stay empty. The WebGL scene/canvas
(`frontend/src/scene/`, `three-lab`, `graph-lab`), test fixtures, the `prototype` dir,
and the CLI-managed token regions of `styles.css` are the ONLY sanctioned exceptions —
and the scene is not exempt from relative sizing, it bridges it: screen-space px in the
canvas are multiplied by `uiScale()` (`src/scene/three/uiScale.ts`, = rootFontPx/16) so
the graph scales with the DOM under one UI-scale change. New off-scale values convert to
value-preserving rem (px÷16), never a snapped token that would drift the binding Figma.

## Why

The `2026-06-19-relative-units-migration` cycle (ADR
`2026-06-19-relative-units-migration-adr`, accepted) established this as a hard mandate:
no absolute px may remain so the UI scales coherently and a global UI-scale preference is
mechanically possible. The foundation token families were already rem; the defect was the
implementation that bypassed them (~73 `[Npx]` arbitrary values, ~31 stylesheet literals)
plus Tailwind's framework-default 1px hairline utilities (`border` alone had ~170 call
sites). Figma is px-native and cannot store rem (research F1/F2), so the relative layer is
code-side and Figma stays the binding source — meaning off-scale values are converted
value-preserving (rem = px÷16), NOT snapped to a nearer token, because snapping drifts the
implementation off the binding design (the 23×`14px` rail-gap case). rem/em are undefined
in WebGL space, so the canvas cannot author rem directly; the `uiScale()` seam is how the
scene is still enrolled in the contract rather than exempted from it. A px typed inline
re-scatters absolute sizing the token scale and the guard exist to prevent.

## How

- **Good:** a surface needs spacing/type/radius → use the `fg-*` token utility
  (`gap-fg-2`, `text-body`, `rounded-fg-md`); an off-scale or component-dimension value →
  a value-preserving rem arbitrary value (`h-[1.875rem]`, `top-[2.125rem]`); a hairline →
  `0.0625rem` (or the global `border`/`w-px` utilities, already re-expressed in rem once
  in `styles.css`).
- **Good:** the canvas needs a screen-px constant (node/edge size clamp band, pick
  tolerance, ring gap, label offset) → multiply it by `uiScale()` so it tracks the DOM;
  label fonts resolve rem tokens against `rootFontPx()`.
- **Good:** a new foundation value with no token → add it to the DTCG source and
  regenerate (never hand-edit between the managed markers); Figma is updated to match.
- **Bad:** typing `gap-[11px]`, `text-[13px]`, a raw `1px` border, or `style={{width:
  '12px'}}` in a component — `lint:px` fails; convert to rem.
- **Bad:** snapping an off-scale px to a nearer token "to be clean" when the binding Figma
  value is off-scale — that drifts the design; preserve the value in rem instead.
- **Bad:** hardcoding a screen px in the scene layer with no `uiScale()` factor — it stops
  tracking UI scale, the one thing the scene bridge exists to guarantee.

## Status

Active. Promoted at the close of the `2026-06-19-relative-units-migration` cycle (research
→ accepted ADR → plan 29/29 → execute → verify), including the deferred scene half (the
`uiScale` canvas bridge) and the framework-default hairline sweep. Codified on explicit
user direction. Sibling of `figma-is-the-binding-source-of-truth` (why off-scale values
are preserved, not snapped), `design-system-is-centralized` and
`themes-are-oklch-generated-from-a-token-tier` (the token scale this routes through), and
`dashboard-layer-ownership` (the scene-vs-DOM boundary the canvas bridge respects).

## Source

ADR `2026-06-19-relative-units-migration-adr` (codification candidate
`no-hardcoded-px-in-dom-styling`) and research `2026-06-19-relative-units-migration-research`
(F0 foundation-already-rem, F1/F2 Figma px-native, F6 scene deferral). Enforced by
`frontend/scripts/scan-px.mjs` (`lint:px`) and the `uiScale` seam in
`frontend/src/scene/three/uiScale.ts`.
