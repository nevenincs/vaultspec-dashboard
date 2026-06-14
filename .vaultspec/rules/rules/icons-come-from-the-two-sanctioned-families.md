---
name: icons-come-from-the-two-sanctioned-families
---

# Icons come from the two sanctioned families

## Rule

Structural chrome icons come from Lucide and expressive or domain marks from Phosphor (or
are authored in-family on Phosphor's grid); no third icon set is introduced, and every
domain mark passes the 14px grayscale-by-shape gate before it ships.

## Why

The iconography ADR (`2026-06-14-dashboard-iconography-adr`) pins exactly two families —
Lucide for invisible structural chrome, Phosphor (or in-family marks on Phosphor's grid)
for the expressive and domain plane — and requires every bespoke domain mark to remain
legible at 14px when reduced to shape alone, so marks stay distinguishable without color
or detail. The load-bearing adoption finding is HOW that gate is implemented: it is an
INK-COVERAGE comparison, not a geometric or containment test. The mark is rasterized to a
small bitmap that paints true ink (fills with the winding rule so a ring's hole stays
empty, strokes only within their band) and the bitmaps are compared by Hamming distance.
A containment or fill test instead collapses a hollow ring onto a solid disc and falsely
reports the two as identical — exactly the broken-baseline and cross-family-collision
HIGH/MEDIUM findings the domain-mark review caught. The constraint held across the full
cycle: the four tier marks, the lifecycle states, the node-feature mark, and the progress
ring all cleared this gate before shipping, and each review confirmed it.

## How

- Good: a new chrome affordance takes a Lucide glyph; a new doc-type or tier mark is
  authored in-family on Phosphor's grid and run through the ink-coverage gate, which
  rasterizes it with winding-rule fills and stroke bands and asserts it is distinct from
  its siblings at 14px above the squint-test floor.
- Bad: pulling a glyph from a third icon set, or "proving" a mark distinct with a
  geometric containment test that treats a hollow ring as a filled disc — the test passes
  while the marks collide in grayscale, the failure mode the ink-coverage gate exists to
  catch.

## Source

Iconography ADR `2026-06-14-dashboard-iconography-adr` (codification candidate). Held
across the `2026-06-14-dashboard-design-adoption` cycle; the ink-coverage gate
(`svgRaster.ts` plus `markGate.ts`) landed in the domain-mark plane (`W02.P17`). Sibling
rules `warmth-lives-in-tokens-not-decoration`,
`themes-are-oklch-generated-from-a-token-tier`.
