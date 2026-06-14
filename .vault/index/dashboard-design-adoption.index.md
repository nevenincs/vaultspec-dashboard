---
generated: true
tags:
  - '#index'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - '[[2026-06-14-dashboard-design-adoption-W01-P01-S01]]'
  - '[[2026-06-14-dashboard-design-adoption-W01-P01-S02]]'
  - '[[2026-06-14-dashboard-design-adoption-W01-P01-S03]]'
  - '[[2026-06-14-dashboard-design-adoption-W01-P02-S04]]'
  - '[[2026-06-14-dashboard-design-adoption-W01-P02-S05]]'
  - '[[2026-06-14-dashboard-design-adoption-W01-P02-S06]]'
  - '[[2026-06-14-dashboard-design-adoption-W01-P02-S07]]'
  - '[[2026-06-14-dashboard-design-adoption-W01-P02-S08]]'
  - '[[2026-06-14-dashboard-design-adoption-W01-P02-S09]]'
  - '[[2026-06-14-dashboard-design-adoption-W01-P02-S10]]'
  - '[[2026-06-14-dashboard-design-adoption-W01-P03-S11]]'
  - '[[2026-06-14-dashboard-design-adoption-W01-P03-S12]]'
  - '[[2026-06-14-dashboard-design-adoption-W01-P03-S13]]'
  - '[[2026-06-14-dashboard-design-adoption-W01-P03-S14]]'
  - '[[2026-06-14-dashboard-design-adoption-W01-P03-S15]]'
  - '[[2026-06-14-dashboard-design-adoption-W01-P03-S16]]'
  - '[[2026-06-14-dashboard-design-adoption-W01-P03-S17]]'
  - '[[2026-06-14-dashboard-design-adoption-adr]]'
  - '[[2026-06-14-dashboard-design-adoption-plan]]'
---

# `dashboard-design-adoption` feature index

Auto-generated index of all documents tagged with `#dashboard-design-adoption`.

## Documents

### adr

- `2026-06-14-dashboard-design-adoption-adr` - `dashboard-design-adoption` adr: `design language adoption cycle` | (**status:** `accepted`)

### exec

- `2026-06-14-dashboard-design-adoption-W01-P01-S01` - Author the intent-free OKLCH primitive lightness/chroma/hue ramps (neutral, accent, tier, and state hue families) as the base ramp tokens
- `2026-06-14-dashboard-design-adoption-W01-P01-S02` - Alias the primitive ramps into a Radix-style 12-step semantic token tier named for role (surface/ink/border/accent/focus), supplying discrete hover, pressed, and focus-ring steps
- `2026-06-14-dashboard-design-adoption-W01-P01-S03` - Remap the existing chrome and scene var() consumers onto the new semantic role tokens, keeping every current --color-* custom property resolving so no consumer breaks
- `2026-06-14-dashboard-design-adoption-W01-P02-S04` - Wire Tailwind v4 @theme static for the color namespace so every color token emits to :root even when not class-referenced (the scene getComputedStyle requirement)
- `2026-06-14-dashboard-design-adoption-W01-P02-S05` - Wire @theme inline for the aliasing tokens that reference another variable, so no unresolved var() ships to the wire
- `2026-06-14-dashboard-design-adoption-W01-P02-S06` - Build the dark theme as a [data-theme=dark] remap of the semantic tier with warm-tinted near-black neutrals, as an equal peer to light
- `2026-06-14-dashboard-design-adoption-W01-P02-S07` - Build the light theme as a [data-theme=light] remap of the semantic tier, peer to dark with warm low-chroma neutral ground
- `2026-06-14-dashboard-design-adoption-W01-P02-S08` - Build the first-class high-contrast theme as a [data-theme=high-contrast] remap of the same semantic set, no component aware of the active theme
- `2026-06-14-dashboard-design-adoption-W01-P02-S09` - Implement system auto-switch plus manual theme override in the platform/app theme controller, without adopting the dark: utility variant
- `2026-06-14-dashboard-design-adoption-W01-P02-S10` - Verify the scene's three token-reading files resolve their colors from the rebuilt token layer via getComputedStyle
- `2026-06-14-dashboard-design-adoption-W01-P03-S11` - Derive the warm low-chroma neutral surfaces carried into dark as warm near-black, plus the single muted earthy accent for highlights and selection rings
- `2026-06-14-dashboard-design-adoption-W01-P03-S12` - Rebuild the four tier hues in OKLCH at fixed lightness and chroma so they stay distinguishable in grayscale projection by construction
- `2026-06-14-dashboard-design-adoption-W01-P03-S13` - Define the diff added/removed green/red as high-contrast sacred tokens that override warmth even in the warm theme
- `2026-06-14-dashboard-design-adoption-W01-P03-S14` - Define separate UI and code type-scale tokens, mandate tabular numerals on data-bearing contexts, and reserve monospace for identity/code with no bundled identity face
- `2026-06-14-dashboard-design-adoption-W01-P03-S15` - Define motion tokens with prefers-reduced-motion instant-swap, ensuring keyboard-initiated actions never animate
- `2026-06-14-dashboard-design-adoption-W01-P03-S16` - Define the multi-level elevation, radius, and density tokens (background to foreground to panel to dialog to modal)
- `2026-06-14-dashboard-design-adoption-W01-P03-S17` - Contrast-prove every text and border token against each theme (warm ground shifts effective contrast), recording the per-theme ratios

### plan

- `2026-06-14-dashboard-design-adoption-plan` - `dashboard-design-adoption` plan
