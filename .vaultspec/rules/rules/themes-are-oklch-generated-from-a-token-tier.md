---
name: themes-are-oklch-generated-from-a-token-tier
---

# Themes are OKLCH ramps remapped through one semantic token tier

## Rule

Theme colors are derived from primitive OKLCH ramps aliased by a semantic token tier and
emitted on `:root` for both the DOM chrome and the canvas scene; a theme is a
`[data-theme]` remap of the semantic tier, never per-component color or borrowed hex, and
the high-contrast theme is just another semantic-tier remap. The OKLCH ramp → semantic-tier
→ literal-hex-scene-seam **mechanism** is unchanged; what changed (2026-06-16) is the
**source-of-truth direction**: the token values are now authored to match the binding Figma
file, not the reverse. Figma is binding (see `figma-is-the-binding-source-of-truth`); this
rule governs the *generation mechanism*, not the authority — code no longer originates the
palette, it mirrors Figma through this same OKLCH tier.

## Why

The base design-language ADR (`2026-06-14-dashboard-design-language-adr`) pins the color
model as intent-free OKLCH primitive ramps, aliased by a Radix-style semantic tier named
for role (surface, ink, border, accent, focus), with dark, light, and high-contrast as
peer `[data-theme]` remaps of that one tier — so no component is ever aware of the active
theme and contrast is correct by construction per theme. The load-bearing adoption finding
is the scene seam: the canvas scene reads its colors through `getComputedStyle` /
`getPropertyValue`, which does NOT resolve a `var()` chain for a custom property in real
browsers, so scene-consumed tokens must be emitted as LITERAL HEX, not `var()` aliases.
The foundation review caught exactly this (the HIGH-1 state-color defect): an
`@theme inline` self-alias emitted `--color-x: var(--color-x)` cycles that the scene
readers could not resolve, fixed by declaring the scene-read tokens once as literal hex in
`@theme static` and overriding them per theme. The constraint held across the full cycle:
every surface consumed the tokens this way and every review confirmed it.

## How

- Good: a new color need lands as a step in the OKLCH primitive ramp, aliased into the
  semantic role tier, and each theme remaps that tier under its `[data-theme]` selector;
  adding the high-contrast variant is one more remap of the same semantic set.
- Good: a scene-read token (consumed by `getComputedStyle` in the field readers) is
  emitted as literal `#rrggbb` per theme on `:root`, so the reader resolves it directly
  with no `var()` chain to walk.
- Bad: a component hard-coding a hex value or aliasing a scene-read token as
  `var(--color-x)`; the chrome drifts off the tier and the scene reader resolves nothing
  because the browser will not flatten the `var()` chain for the custom property — the
  HIGH-1 defect.

## Status

Active, with an amended source-of-truth direction. The OKLCH generation mechanism and the
literal-hex scene seam are unchanged and load-bearing. The 2026-06-16
`2026-06-16-figma-parity-reconciliation-adr` flipped the authority: Figma is the binding
source and the token tier is authored to match it, superseding the prior code-canonical,
one-way-code-to-Figma framing (and the `FIGMA-SYNC.md` mirror note). See
`figma-is-the-binding-source-of-truth`.

## Source

Base design-language ADR `2026-06-14-dashboard-design-language-adr` (codification
candidate; the OKLCH theme model). The literal-hex scene-seam finding is the foundation
review's HIGH-1 state-color defect in audit
`2026-06-14-dashboard-design-adoption-audit` (the `scene-hex-contract` and
`theme-inline-cycle-avoided` findings). Held across the
`2026-06-14-dashboard-design-adoption` cycle. Sibling rules
`warmth-lives-in-tokens-not-decoration`, `dashboard-layer-ownership`.
