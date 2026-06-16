---
tags:
  - '#audit'
  - '#node-visual-richness'
date: '2026-06-16'
modified: '2026-06-16'
related:
  - "[[2026-06-14-node-visual-richness-plan]]"
  - "[[2026-06-14-node-visual-richness-adr]]"
---



# `node-visual-richness` audit: `typed hover-card review`

## Scope

The typed-content extension of this feature's hover-bloom card (step `P04.S21`):
the new pure derivation seam `hoverCardContent.ts`, the per-type rendering and
category-accent strip added to `HoverCard.tsx`, and the host wiring in
`HoverCardLayer.tsx`. Audited for the No-Crash safety policy, layer-ownership and
projection rules, theme parity, and intent against the Figma 110:2 contract. The
companion tests were audited for tautology and for real-rendering fidelity.

## Findings

### Safety (No-Crash) — PASS

- No new throwing paths. The derivation seam is total: a discriminated union over
  `node.kind` with a `generic` fallback for every unmapped type, and every numeric
  accessor guards absence (`?? 0`, `> 0`, `Number.isNaN`/`Number.isFinite` checks
  in `relativeDate`). No unguarded null deref.
- React hooks discipline holds in `HoverCardIsland`: `useNodeAnchor`,
  `useNodeDetail`, and the newly-added `usePlanInterior` are all called
  unconditionally before the single early `return null`; only the query's
  `enabled` flag toggles. No conditional-hook violation.
- No resource leak introduced. The added `usePlanInterior` rides the existing
  bounded query cache; it is disabled (`enabled: planId !== null`) for every
  non-plan node, so a hover never mints a plan-interior fetch it cannot consume —
  consistent with `graph-queries-are-bounded-by-default`.

### Intent & rule compliance — PASS

- `dashboard-layer-ownership` / `views-are-projections-of-one-model`: the seam
  imports only wire TYPES (`EngineNode`, `PlanInterior`) plus the scene
  `nodeCategory` mapping; it performs no fetch and reads no raw `tiers` block. The
  card is dumb app chrome fed by the stores hooks through the host. No new backend
  route was added — the plan card reuses the SAME cached plan-interior the Work
  step-tree already fetches.
- `warmth-lives-in-tokens-not-decoration`: warmth is carried by the single
  per-category accent token (strip + header hue); no gradient, texture, or second
  accent was introduced.
- `themes-are-oklch-generated-from-a-token-tier`: the accent is consumed as a DOM
  `var(--color-scene-category-*)`. The token is declared per theme on `:root`
  (light/dark/high-contrast), and DOM CSS resolves the `var()` natively — the
  literal-hex scene-seam constraint applies only to the canvas `getComputedStyle`
  readers, not this DOM card, so the `var()` consumption is correct here.
- `icons-come-from-the-two-sanctioned-families`: the header reuses the existing
  `DocTypeMark`/`MarkById` Phosphor-family marks; no new icon set.
- Figma 110:2 intent: every per-type plane the spec names is rendered from real
  wire data, and genuinely-absent data degrades gracefully (omitted, never
  fabricated). The recorded gaps (adr supersedes-count, exec parent-plan title,
  research/audit findings counts, per-node git-dirty) are documented in the step
  record with their backend follow-up shape; none was papered over with an invented
  value.

### Tests — PASS

- `hoverCardContent.test.ts` exercises the pure seam against constructed wire
  nodes, asserting each type's sourced fields AND the gaps as `toBeUndefined()` —
  these are real contract assertions, not tautologies. The relative-date helper is
  pinned against a fixed clock so it is deterministic.
- `HoverCard.typed.render.test.tsx` renders the real component (no doubles) through
  the real `cardModelFromNode` projection, asserting each type's text, the
  category-accent token reference, the type identity on the card, and per-theme
  `var()` stability across all three `[data-theme]` values. No skips, no `xfail`.

### Quality — PASS

- Idiomatic with the surrounding island code: pure derivation isolated from the
  view, the model extended additively (the prototype's cardless path still reads),
  doc comments on every exported symbol. No drift beyond the requested scope.

## Recommendations

- Accept and proceed. No required revisions.
- For the recorded data gaps, raise a single backend-projection decision (a
  supersedes count, a findings count, and an exec parent-plan handle are all
  graph-derived fields) IF product wants those lines populated; do not add ad-hoc
  routes per card line. The card already degrades honestly without them.

## Verdict

PASS. The change reuses the existing card and projections, respects every named
layer and design rule, is safe and concurrency-clean, and is covered by
real-rendering tests. The full frontend gate (`just dev lint frontend`) was run
independently by the review and exited 0.

## Codification candidates

None. This is a single-cycle content extension that follows already-codified
rules (`dashboard-layer-ownership`, `views-are-projections-of-one-model`,
`warmth-lives-in-tokens-not-decoration`, `themes-are-oklch-generated-from-a-token-tier`)
rather than surfacing a new durable constraint. An empty section here is a positive
signal.


