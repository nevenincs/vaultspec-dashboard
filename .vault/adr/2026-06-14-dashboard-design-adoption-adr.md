---
tags:
  - '#adr'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - "[[2026-06-14-dashboard-design-language-adr]]"
  - "[[2026-06-14-dashboard-iconography-adr]]"
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
  - '[[2026-06-14-dashboard-design-language-research]]'
---



# `dashboard-design-adoption` adr: `design language adoption cycle` | (**status:** `accepted`)

## Problem Statement

The two grounding design ADRs - the base design-language ADR and the iconography ADR -
are spec work that deliberately defer their own implementation to a later adoption cycle.
That adoption cycle is a feature in its own right: it rebuilds the token layer in OKLCH
and re-skins every surface. The framework lifecycle expects a plan to be backed by an ADR
under the same feature tag, but the adoption work was planned under a fresh feature tag
without a same-feature decision record. This ADR is that record. It does not reopen or
re-decide anything; it pins the decision to execute the adoption against the two accepted
grounding ADRs and inherits every law they set.

## Considerations

The substantive design decisions live in the two authorizing ADRs and are not restated
here. This ADR exists so the adoption feature has a same-feature decision anchor for its
plan and its execution records, and so the lifecycle (research to ADR to plan to exec)
resolves for the adoption tag. The adoption is a coding cycle, not a spec cycle.

## Constraints

This ADR adds no new constraint. It is wholly subordinate to the two grounding ADRs: the
base design-language ADR (theme model, color discipline, depth/form, typography, motion,
density, the human-warmth signature, the preserved product invariants) and the
iconography ADR (the two sanctioned icon families and the bespoke domain-mark plane). The
load-bearing technical constraint they both rest on - design tokens must be readable from
JavaScript via `getComputedStyle` because the canvas scene consumes them - is honored by
the adoption work and is the reason the scene-consumed tokens stay hex-emitting.

## Implementation

The adoption proceeds as the plan sequences it: a foundation wave that replaces the
single-tier hex token block with OKLCH primitive ramps aliased by a Radix-style semantic
token tier, dark / light / high-contrast peer themes as `[data-theme]` remaps, the
Tailwind v4 `@theme static` plus `@theme inline` wiring that keeps the scene token reads
resolving, and the formalized icon dependencies; then a surface wave that carries the
language to each surface gated on each surface's own ADR; then a discretionary codify wave
that promotes the candidate rules once they have held across a cycle. The token names the
existing chrome and scene already consume are preserved so no consumer breaks; the
internal architecture beneath those names is rebuilt.

### Implementation decisions surfaced during foundation

The foundation wave exercised the grounding ADRs against the real stack and resolved
several points the spec ADRs left under-determined at the JavaScript-read boundary. These
are recorded here (not in the grounding ADRs) because they are adoption-mechanics, not
language decisions:

- **`@theme inline` scope.** In Tailwind v4, `@theme inline` bakes the resolved value into
  the utility, which would freeze a token at its light-theme value and defeat the
  `[data-theme]` remap. Therefore theme-remapped tokens stay `@theme static` and emit a
  resolving `var()` chain; `@theme inline` is reserved for theme-invariant aliases only.
- **Scene-consumed tokens are emitted as literal hex.** The base ADR mandates OKLCH, but
  the scene readers (`edgeMeshes.ts`, `minimapLayer.ts`, `nodeSprites.ts`) parse
  `#rrggbb`. The scene-consumed subset of tokens (canvas ground, ink, rule, the four tier
  hues, and the lifecycle-state colors including `complete` and `archived`) is therefore
  emitted as the hex sRGB rendering of the OKLCH step in every theme block — re-derivable
  from the ramp, zero blast radius on the readers. Any token a scene reader consumes must
  appear in this hex subset of every theme, or it silently falls back (the HIGH-1 defect
  the foundation review caught). This is not merely a parser-convenience: `getComputedStyle`
  / `getPropertyValue` returns the *declared text* of a custom property and does NOT resolve
  a `var()` chain for it in real browsers, so a scene-consumed token aliased as
  `var(--semantic-…)` would reach the scene as the literal string `"var(--semantic-…)"` and
  fail to parse. Scene-consumed tokens must therefore be literal hex, never `var()` aliases.
- **High-contrast needs explicit border and elevation exceptions.** Unlike the
  felt-not-seen light/dark borders, high-contrast borders are load-bearing and must clear a
  visible floor; and because shadows are unreliable as an a11y depth cue, high-contrast
  expresses elevation through outline rings rather than the shadow scale.
- **Grayscale tier identity is shape-primary, hue-reinforcing.** The base ADR's "tier hues
  stay distinguishable in their grayscale projection by construction" holds comfortably in
  light but not for every adjacent pair in dark and high-contrast. Identity is preserved
  because line/shape treatment (solid / dotted / haze in `edgeMeshes.ts`) is the primary,
  always-sufficient channel and hue is redundant reinforcement; the foundation spreads the
  dark/HC tier lightness values as far as hue identity allows, and the residual is accepted
  under the shape-primary rule rather than treated as a contrast failure.
- **The texture seam needs a `currentColor` substitution.** Phosphor and the domain marks
  ship `fill=currentColor`; this resolves naturally for React chrome via the CSS cascade,
  but Pixi's SVG parser throws on the literal `currentColor` keyword, so the texture seam
  substitutes a concrete ink (white, matching the placeholder white-ink-then-tint contract)
  before rasterizing. This is the one prose refinement the iconography ADR's "feeds both
  planes" claim needs.
- **The 14px grayscale-by-shape gate is an ink-coverage comparison, not a geometric/containment
  test.** A containment test (Pixi `containsPoint`) collapses a hollow ring (e.g. state:complete)
  onto a solid disc (state:active) and reports a false pass, defeating the whole point of the
  gate. The gate must reproduce true ink coverage — winding-rule holes plus stroke bands —
  rasterized to a small bitmap and compared (the domain-mark plane implements this as
  `scene/field/svgRaster.ts`, a Hamming distance over a 14×14 ink grid). The iconography ADR's
  "grayscale-by-shape gate" must be read as ink-coverage distinctness, not silhouette geometry.

### Surface scope that outran the engine contract (git-diff-browser)

The git-diff-browser ADR scopes an EXPANSION — a per-file changed-files list and a read-only
diff body — that the current live engine does not serve: it whitelists only `/ops/core/*` and
`/ops/rag/*` (no `/ops/git/*`), serves git status as `dirty: boolean` (no per-file list), and
fixes the tiers block to the four provenance tiers (there is no `git` tier). Under
`engine-read-and-infer` the adoption cycle must not invent an engine endpoint, and under
`mock-mirrors-live-wire-shape` the mock must not fabricate a richer shape than live serves.
The adoption decision, therefore: the status header (branch, ahead/behind as `Option<u32>` —
absent means no upstream, not zero, clean/dirty) is realized truthfully against the live wire;
the per-file changed-files list and the structured diff body are realized as honest
ENGINE-BLOCKED states (the UI element exists and is token-complete, but renders "not yet served
by the engine" rather than fabricated data), and the mock mirrors the live `dirty: boolean`
shape, mocking the unbuilt capability as blocked so the engine-blocked path is exercised
end-to-end. The structured `GitFileDiff` / per-entry-dirty shapes are recorded as a PROPOSED
future contract amendment (a separate engine feature + reference amendment), not shipped as if
live. This keeps the UI ADR fully realized — every element built and verified — while staying
honest about which data the engine actually provides today.

## Rationale

Pinning the adoption decision against the two accepted grounding ADRs lets the
implementation cycle proceed without reopening settled design questions, and gives the
adoption feature the same-feature ADR anchor its plan and execution records require. The
decision is to execute, not to re-decide.

## Consequences

The adoption feature now has a coherent lifecycle anchor; its plan and execution records
trace to a same-feature ADR that defers to the two grounding decisions. No design
authority is duplicated or forked. The only cost is one additional pointer document; the
gain is a lifecycle that resolves cleanly and an execution trail that stays attached to
its own feature tag rather than borrowing another feature's namespace.

## Codification candidates

The codification candidates for this cycle are owned by the two grounding ADRs (the base
design-language ADR names `warmth-lives-in-tokens-not-decoration` and
`themes-are-oklch-generated-from-a-token-tier`; the iconography ADR names
`icons-come-from-the-two-sanctioned-families`). This adoption ADR introduces no new
durable constraint of its own; promotion of those candidates is the codify wave's work
after they have held across one full execution cycle.
