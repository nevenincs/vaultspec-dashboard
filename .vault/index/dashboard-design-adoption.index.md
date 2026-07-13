---
generated: true
tags:
  - '#index'
  - '#dashboard-design-adoption'
date: '2026-06-15'
modified: '2026-07-12'
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
  - '[[2026-06-14-dashboard-design-adoption-W01-P04-S18]]'
  - '[[2026-06-14-dashboard-design-adoption-W01-P04-S19]]'
  - '[[2026-06-14-dashboard-design-adoption-W01-P04-S20]]'
  - '[[2026-06-14-dashboard-design-adoption-W02-P05-S21]]'
  - '[[2026-06-14-dashboard-design-adoption-W02-P06-S22]]'
  - '[[2026-06-14-dashboard-design-adoption-W02-P07-S23]]'
  - '[[2026-06-14-dashboard-design-adoption-W02-P08-S24]]'
  - '[[2026-06-14-dashboard-design-adoption-W02-P09-S25]]'
  - '[[2026-06-14-dashboard-design-adoption-W02-P10-S26]]'
  - '[[2026-06-14-dashboard-design-adoption-W02-P11-S27]]'
  - '[[2026-06-14-dashboard-design-adoption-W02-P12-S28]]'
  - '[[2026-06-14-dashboard-design-adoption-W02-P13-S29]]'
  - '[[2026-06-14-dashboard-design-adoption-W02-P14-S30]]'
  - '[[2026-06-14-dashboard-design-adoption-W02-P15-S31]]'
  - '[[2026-06-14-dashboard-design-adoption-W02-P16-S32]]'
  - '[[2026-06-14-dashboard-design-adoption-W02-P17-S33]]'
  - '[[2026-06-14-dashboard-design-adoption-W02-P17-S34]]'
  - '[[2026-06-14-dashboard-design-adoption-W02-P17-S35]]'
  - '[[2026-06-14-dashboard-design-adoption-W02-P17-S36]]'
  - '[[2026-06-14-dashboard-design-adoption-W02-P17-S37]]'
  - '[[2026-06-14-dashboard-design-adoption-adr]]'
  - '[[2026-06-14-dashboard-design-adoption-audit]]'
  - '[[2026-06-14-dashboard-design-adoption-plan]]'
---

# `dashboard-design-adoption` feature index

Auto-generated index of all documents tagged with `#dashboard-design-adoption`.

## Documents

### adr

- `2026-06-14-dashboard-design-adoption-adr` - `dashboard-design-adoption` adr: `design language adoption cycle` | (**status:** `accepted`)

### audit

- `2026-06-14-dashboard-design-adoption-audit` - `dashboard-design-adoption` audit: `W01 P01-P03 OKLCH token foundation review`

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
- `2026-06-14-dashboard-design-adoption-W01-P04-S18` - Declare lucide-react as a real dependency at the in-tree installed version, ending the phantom-import state
- `2026-06-14-dashboard-design-adoption-W01-P04-S19` - Add the Phosphor icon dependency for the expressive/domain plane
- `2026-06-14-dashboard-design-adoption-W01-P04-S20` - Prove the Phosphor SVG to texture path against the GlyphTextureProvider seam as a spike, deferring full domain marks to a surface wave
- `2026-06-14-dashboard-design-adoption-W02-P05-S21` - Re-skin the sidebar/vault-browser to consume only the new semantic tokens and Lucide chrome per its accepted surface ADR, preserving layer ownership (no new fetch, no raw tiers read), with design review and the full lint gate green
- `2026-06-14-dashboard-design-adoption-W02-P06-S22` - Re-skin the nav toolbar and controls to consume only the new semantic tokens and Lucide chrome per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green
- `2026-06-14-dashboard-design-adoption-W02-P07-S23` - Rebuild the Cmd/Ctrl+K command palette as a lifted surface on the new tokens per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green
- `2026-06-14-dashboard-design-adoption-W02-P08-S24` - Re-skin the search surface to consume only the new semantic tokens and sanctioned icons per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green
- `2026-06-14-dashboard-design-adoption-W02-P09-S25` - Rebuild the node-canvas scene to consume the new token layer via getComputedStyle and sanctioned domain marks per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green
- `2026-06-14-dashboard-design-adoption-W02-P10-S26` - Re-skin the canvas controls to consume only the new semantic tokens and Lucide chrome per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green
- `2026-06-14-dashboard-design-adoption-W02-P11-S27` - Re-skin the minimap widget and layer to consume the new token layer per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green
- `2026-06-14-dashboard-design-adoption-W02-P12-S28` - Re-skin the timeline surface onto the new tokens and the animated-transitions motion grammar per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green
- `2026-06-14-dashboard-design-adoption-W02-P13-S29` - Re-skin the git-diff browser onto the new tokens with the sacred diff green/red preserved per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green
- `2026-06-14-dashboard-design-adoption-W02-P14-S30` - Re-skin the worktree switcher onto the new tokens and Lucide chrome per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green
- `2026-06-14-dashboard-design-adoption-W02-P15-S31` - Re-skin the rag manager onto the new tokens and sanctioned icons per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green
- `2026-06-14-dashboard-design-adoption-W02-P16-S32` - Re-skin the rag search surface onto the new tokens and sanctioned icons per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green
- `2026-06-14-dashboard-design-adoption-W02-P17-S33` - Author the four bespoke abstract tier marks in-family on Phosphor's grid, each passing the 14px grayscale-by-shape gate
- `2026-06-14-dashboard-design-adoption-W02-P17-S34` - Author the lifecycle state marks in-family from Phosphor primitives honoring the active-versus-node-feature and broken-bolt collision constraints, each passing the 14px grayscale gate
- `2026-06-14-dashboard-design-adoption-W02-P17-S35` - Author the deliberately-asymmetric node-feature species mark in-family honoring its collision constraints against the state-active ring, passing the 14px grayscale gate
- `2026-06-14-dashboard-design-adoption-W02-P17-S36` - Implement the progress ring as a small parametric programmatic component (exact arc fills) rather than static SVGs
- `2026-06-14-dashboard-design-adoption-W02-P17-S37` - Wire the authored domain marks through both the React chrome and the Pixi GlyphTextureProvider texture seam so both planes consume the same currentColor marks

### plan

- `2026-06-14-dashboard-design-adoption-plan` - `dashboard-design-adoption` plan
