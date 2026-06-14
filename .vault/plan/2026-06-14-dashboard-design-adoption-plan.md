---
tags:
  - '#plan'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-06-14'
tier: L3
related:
  - '[[2026-06-14-dashboard-design-language-adr]]'
  - '[[2026-06-14-dashboard-iconography-adr]]'
  - '[[2026-06-14-dashboard-design-language-research]]'
---

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the
       related: field above.
     - The related: field carries the AUTHORISING documents
       (ADR, research, reference, prior plan) for every Step in
       this plan. Steps inherit this chain; per-row reference
       footers do not exist.
     - NEVER use [[wiki-links]] or markdown links in the
       document body. -->

# `dashboard-design-adoption` plan

## Wave `W01` - Foundation - the OKLCH token tier and icon dependency base

W01 rebuilds the token layer from the single-tier hex theme into the layered OKLCH model the base design-language ADR pins: intent-free primitive ramps, a Radix-style 12-step semantic tier aliasing them, dark/light/high-contrast as peer remaps, and the formalized Lucide + Phosphor icon dependencies with the Pixi texture-seam path proven. It is the hard prerequisite for every surface wave and is ready to execute now against the accepted base and iconography ADRs. No surface re-skin may begin until W01 lands, because every surface consumes only the new semantic tokens and sanctioned icons it establishes. Authorized by the base design-language ADR and the iconography ADR.

Adopt the accepted base UI design language and iconography across the dashboard: rebuild the token layer in OKLCH, then re-skin every surface onto it.

### Phase `W01.P01` - OKLCH primitive ramps and the semantic token tier

Establishes the intent-free OKLCH primitive ramps and the Radix-style 12-step semantic tier that aliases them, named for why not what, supplying the discrete hover/pressed/focus-ring states the single-tier file lacks.

- [x] `W01.P01.S01` - Author the intent-free OKLCH primitive lightness/chroma/hue ramps (neutral, accent, tier, and state hue families) as the base ramp tokens; `frontend/src/styles.css`.
- [x] `W01.P01.S02` - Alias the primitive ramps into a Radix-style 12-step semantic token tier named for role (surface/ink/border/accent/focus), supplying discrete hover, pressed, and focus-ring steps; `frontend/src/styles.css`.
- [x] `W01.P01.S03` - Remap the existing chrome and scene var() consumers onto the new semantic role tokens, keeping every current --color-* custom property resolving so no consumer breaks; `frontend/src/styles.css`.

### Phase `W01.P02` - Theme remaps and Tailwind v4 wiring

Builds dark, light, and high-contrast as peer [data-theme] remaps of the semantic tier with system auto-switch plus manual override, and wires Tailwind v4 so color tokens emit for the scene getComputedStyle reads while alias tokens resolve.

- [x] `W01.P02.S04` - Wire Tailwind v4 @theme static for the color namespace so every color token emits to :root even when not class-referenced (the scene getComputedStyle requirement); `frontend/src/styles.css`.
- [x] `W01.P02.S05` - Wire @theme inline for the aliasing tokens that reference another variable, so no unresolved var() ships to the wire; `frontend/src/styles.css`.
- [x] `W01.P02.S06` - Build the dark theme as a [data-theme=dark] remap of the semantic tier with warm-tinted near-black neutrals, as an equal peer to light; `frontend/src/styles.css`.
- [x] `W01.P02.S07` - Build the light theme as a [data-theme=light] remap of the semantic tier, peer to dark with warm low-chroma neutral ground; `frontend/src/styles.css`.
- [x] `W01.P02.S08` - Build the first-class high-contrast theme as a [data-theme=high-contrast] remap of the same semantic set, no component aware of the active theme; `frontend/src/styles.css`.
- [x] `W01.P02.S09` - Implement system auto-switch plus manual theme override in the platform/app theme controller, without adopting the dark: utility variant; `frontend/src/platform`.
- [x] `W01.P02.S10` - Verify the scene's three token-reading files resolve their colors from the rebuilt token layer via getComputedStyle; `frontend/src/scene/field/edgeMeshes.ts`.

### Phase `W01.P03` - Color discipline, typography, motion, and form tokens

Derives the warm low-chroma neutrals, the single earthy accent, grayscale-safe tier hues, sacred diff colors, the split UI/code type scales with tabular numerals, motion tokens with reduced-motion instant-swap, and the elevation/radius/density tokens.

- [x] `W01.P03.S11` - Derive the warm low-chroma neutral surfaces carried into dark as warm near-black, plus the single muted earthy accent for highlights and selection rings; `frontend/src/styles.css`.
- [x] `W01.P03.S12` - Rebuild the four tier hues in OKLCH at fixed lightness and chroma so they stay distinguishable in grayscale projection by construction; `frontend/src/styles.css`.
- [x] `W01.P03.S13` - Define the diff added/removed green/red as high-contrast sacred tokens that override warmth even in the warm theme; `frontend/src/styles.css`.
- [x] `W01.P03.S14` - Define separate UI and code type-scale tokens, mandate tabular numerals on data-bearing contexts, and reserve monospace for identity/code with no bundled identity face; `frontend/src/styles.css`.
- [x] `W01.P03.S15` - Define motion tokens with prefers-reduced-motion instant-swap, ensuring keyboard-initiated actions never animate; `frontend/src/styles.css`.
- [x] `W01.P03.S16` - Define the multi-level elevation, radius, and density tokens (background to foreground to panel to dialog to modal); `frontend/src/styles.css`.
- [x] `W01.P03.S17` - Contrast-prove every text and border token against each theme (warm ground shifts effective contrast), recording the per-theme ratios; `frontend/src/styles.css`.

### Phase `W01.P04` - Icon dependency formalization and texture-seam spike

Formalizes lucide-react as a real dependency at the in-tree version, adds Phosphor, and proves the Phosphor SVG to texture path against the GlyphTextureProvider seam as a spike, with full domain marks deferred to a surface wave.

- [x] `W01.P04.S18` - Declare lucide-react as a real dependency at the in-tree installed version, ending the phantom-import state; `frontend/package.json`.
- [x] `W01.P04.S19` - Add the Phosphor icon dependency for the expressive/domain plane; `frontend/package.json`.
- [x] `W01.P04.S20` - Prove the Phosphor SVG to texture path against the GlyphTextureProvider seam as a spike, deferring full domain marks to a surface wave; `frontend/src/scene/field/glyphs.ts`.

## Wave `W02` - Surface adoption - re-skin each surface onto the new tokens and sanctioned icons

W02 carries the adoption across every dashboard surface and the bespoke Phosphor domain-mark plane. Each surface phase is gated on that surface's own ADR reaching accepted status (most are still being authored), and gated on W01 landing; after W01 the surface phases are mutually independent and pipeline as their ADRs land. Each surface phase re-skins or rebuilds the surface to consume only the new semantic tokens and sanctioned icons per its ADR, while preserving the four-layer ownership boundaries (no new fetch, no raw tiers read in chrome, views project over the one model). The phase frame is extensible: step detail is filled in as each surface ADR lands, but the gating step rows exist now. Authorized by the base design-language ADR and the iconography ADR plus each surface's own ADR on acceptance.

### Phase `W02.P05` - Sidebar surface adoption

Re-skins the sidebar/vault-browser chrome onto the new semantic tokens and Lucide icons, gated on the sidebar surface ADR reaching accepted.

- [ ] `W02.P05.S21` - Re-skin the sidebar/vault-browser to consume only the new semantic tokens and Lucide chrome per its accepted surface ADR, preserving layer ownership (no new fetch, no raw tiers read), with design review and the full lint gate green; `frontend/src/app/left/VaultBrowser.tsx`.

### Phase `W02.P06` - Nav-controls surface adoption

Re-skins the navigation toolbar and controls onto the new tokens and Lucide chrome, gated on the nav-controls surface ADR reaching accepted; supplies the nav model command-palette and search reference.

- [ ] `W02.P06.S22` - Re-skin the nav toolbar and controls to consume only the new semantic tokens and Lucide chrome per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green; `frontend/src/app/stage/NavToolbar.tsx`.

### Phase `W02.P07` - Command-palette surface adoption

Rebuilds the Cmd/Ctrl+K command palette as a lifted surface on the new tokens, gated on the command-palette surface ADR reaching accepted; references the nav model.

- [ ] `W02.P07.S23` - Rebuild the Cmd/Ctrl+K command palette as a lifted surface on the new tokens per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green; `frontend/src/app`.

### Phase `W02.P08` - Search surface adoption

Re-skins the search surface onto the new tokens and sanctioned icons, gated on the search surface ADR reaching accepted; references the nav model.

- [ ] `W02.P08.S24` - Re-skin the search surface to consume only the new semantic tokens and sanctioned icons per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green; `frontend/src/app`.

### Phase `W02.P09` - Node-canvas surface adoption

Rebuilds the node-canvas scene to consume the new token layer through getComputedStyle and the sanctioned domain marks, gated on the node-canvas surface ADR reaching accepted.

- [ ] `W02.P09.S25` - Rebuild the node-canvas scene to consume the new token layer via getComputedStyle and sanctioned domain marks per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green; `frontend/src/scene/field/nodeSprites.ts`.

### Phase `W02.P10` - Canvas-controls surface adoption

Re-skins the canvas controls onto the new tokens and Lucide chrome, gated on the canvas-controls surface ADR reaching accepted; references the node-canvas surface.

- [ ] `W02.P10.S26` - Re-skin the canvas controls to consume only the new semantic tokens and Lucide chrome per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green; `frontend/src/app/stage/AlgorithmPanel.tsx`.

### Phase `W02.P11` - Minimap surface adoption

Re-skins the minimap widget and layer onto the new token layer, gated on the minimap surface ADR reaching accepted; references the node-canvas surface.

- [ ] `W02.P11.S27` - Re-skin the minimap widget and layer to consume the new token layer per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green; `frontend/src/app/stage/MinimapWidget.tsx`.

### Phase `W02.P12` - Timeline surface adoption

Re-skins the timeline surface onto the new tokens and the animated-transitions motion grammar, gated on the timeline surface ADR reaching accepted.

- [ ] `W02.P12.S28` - Re-skin the timeline surface onto the new tokens and the animated-transitions motion grammar per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green; `frontend/src/app`.

### Phase `W02.P13` - Git-diff-browser surface adoption

Re-skins the git-diff browser onto the new tokens with the sacred diff green/red preserved, gated on the git-diff-browser surface ADR reaching accepted.

- [ ] `W02.P13.S29` - Re-skin the git-diff browser onto the new tokens with the sacred diff green/red preserved per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green; `frontend/src/app`.

### Phase `W02.P14` - Worktree-switcher surface adoption

Re-skins the worktree switcher onto the new tokens and Lucide chrome, gated on the worktree-switcher surface ADR reaching accepted.

- [ ] `W02.P14.S30` - Re-skin the worktree switcher onto the new tokens and Lucide chrome per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green; `frontend/src/app`.

### Phase `W02.P15` - Rag-manager surface adoption

Re-skins the rag manager onto the new tokens and sanctioned icons, gated on the rag-manager surface ADR reaching accepted.

- [ ] `W02.P15.S31` - Re-skin the rag manager onto the new tokens and sanctioned icons per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green; `frontend/src/app`.

### Phase `W02.P16` - Rag-search surface adoption

Re-skins the rag search surface onto the new tokens and sanctioned icons, gated on the rag-search surface ADR reaching accepted.

- [ ] `W02.P16.S32` - Re-skin the rag search surface onto the new tokens and sanctioned icons per its accepted surface ADR, preserving layer ownership, with design review and the full lint gate green; `frontend/src/app`.

### Phase `W02.P17` - Phosphor domain-mark plane

Authors the bespoke tier, lifecycle, node-feature, and progress-ring marks in-family on Phosphor's grid and wires them through both the React chrome and the Pixi GlyphTextureProvider texture seam, gated on the iconography ADR (accepted) and W01.P04.

- [ ] `W02.P17.S33` - Author the four bespoke abstract tier marks in-family on Phosphor's grid, each passing the 14px grayscale-by-shape gate; `frontend/src/scene/field/glyphs.ts`.
- [ ] `W02.P17.S34` - Author the lifecycle state marks in-family from Phosphor primitives honoring the active-versus-node-feature and broken-bolt collision constraints, each passing the 14px grayscale gate; `frontend/src/scene/field/glyphs.ts`.
- [ ] `W02.P17.S35` - Author the deliberately-asymmetric node-feature species mark in-family honoring its collision constraints against the state-active ring, passing the 14px grayscale gate; `frontend/src/scene/field/glyphs.ts`.
- [ ] `W02.P17.S36` - Implement the progress ring as a small parametric programmatic component (exact arc fills) rather than static SVGs; `frontend/src/scene/field/glyphs.ts`.
- [ ] `W02.P17.S37` - Wire the authored domain marks through both the React chrome and the Pixi GlyphTextureProvider texture seam so both planes consume the same currentColor marks; `frontend/src/scene/field/nodeSprites.ts`.

## Wave `W03` - Codify - promote the durable design-language rules

W03 promotes the three codification candidates the grounding ADRs named, but only after one full execution cycle of W01 plus the surface waves has held them. Per the codify discipline a constraint is an audit finding on first encounter and a rule only once it has held across a cycle; this wave is the discretionary sixth-phase follow-on. Authorized by the base design-language ADR (candidates warmth-lives-in-tokens-not-decoration and themes-are-oklch-generated-from-a-token-tier) and the iconography ADR (candidate icons-come-from-the-two-sanctioned-families).

### Phase `W03.P18` - Rule promotion

Promotes the three codification candidates to project rules after they have held across one full execution cycle.

- [ ] `W03.P18.S38` - Promote the warmth-lives-in-tokens-not-decoration candidate to a project rule after the foundation and surface cycle has held it; `.vaultspec/rules/rules/warmth-lives-in-tokens-not-decoration.md`.
- [ ] `W03.P18.S39` - Promote the themes-are-oklch-generated-from-a-token-tier candidate to a project rule after the foundation has proven out across a cycle; `.vaultspec/rules/rules/themes-are-oklch-generated-from-a-token-tier.md`.
- [ ] `W03.P18.S40` - Promote the icons-come-from-the-two-sanctioned-families candidate to a project rule after the icon planes have held across a cycle; `.vaultspec/rules/rules/icons-come-from-the-two-sanctioned-families.md`.

## Description

Sequence the adoption of the accepted base UI design language and iconography
decisions across the dashboard frontend - the implementation cycle the base
design-language ADR explicitly deferred ("a separate later cycle will sequence
adoption across the layers"). This is a coding plan, not a spec plan: it rebuilds the
token layer and re-skins every surface onto it, it does not reopen the design
decisions.

The grounding is two accepted ADRs. The base design-language ADR codifies the language
as eleven layers (identity/stance, theme model, color discipline, depth/form,
typography, motion, density, iconography, the human-warmth signature, instrument
grammar, and the preserved product invariants); concrete token values are derived
during adoption from an OKLCH ramp, not copied from the references. The iconography ADR
pins Lucide for structural chrome and Phosphor for the expressive/domain plane,
formalizes the phantom `lucide-react` dependency, and requires the bespoke domain marks
(four tier marks, lifecycle states, the node-feature species mark, the progress ring) to
be authored in-family on Phosphor's grid and wired through both the React chrome and the
Pixi `GlyphTextureProvider` texture seam, each passing the 14px grayscale-by-shape gate.

The work is three waves. W01 (Foundation) replaces today's single-tier hex `@theme`
block in `frontend/src/styles.css` with intent-free OKLCH primitive ramps, a Radix-style
12-step semantic tier aliasing them, dark/light/high-contrast peer themes as
`[data-theme]` remaps, the Tailwind v4 `@theme static` plus `@theme inline` wiring that
keeps the scene's `getComputedStyle` token reads resolving, and the formalized icon
dependencies with the Phosphor-to-texture path proven by spike. W01 is a hard
prerequisite for every surface. W02 (Surface adoption) carries the language to each
surface - one Phase per surface, each gated on that surface's own ADR reaching accepted
(most are still being authored) - plus the bespoke Phosphor domain-mark plane. W03
(Codify) promotes the three codification candidates the ADRs named, after they have held
across one full execution cycle. Throughout, the four-layer ownership boundaries hold:
chrome never fetches and never reads the raw `tiers` block, and surfaces remain dumb
views projecting over the one model via stores selectors.

## Steps







## Parallelization

W01 (Foundation) is the hard prerequisite for everything; no surface adoption may begin
until it lands, because every surface consumes only the new semantic tokens and
sanctioned icons it establishes. Within W01 the phases carry a soft ordering: P01
(primitive ramps and semantic tier) must precede P02 (theme remaps and Tailwind wiring),
and the color/typography/motion/form derivation in P03 builds on the tier from P01; P04
(icon dependency formalization and the texture-seam spike) is independent of P01-P03 and
may run alongside them.

After W01, the W02 surface phases (P05-P16) are mutually independent and gated only on
their own surface ADR reaching accepted, so they pipeline as those ADRs land rather than
running on a fixed sequence. Soft references exist but are not hard ordering: the
canvas-controls (P10) and minimap (P11) phases reference the node-canvas surface (P09),
and the command-palette (P07) and search (P08) phases reference the nav model the
nav-controls phase (P06) establishes; a referencing phase should land after the phase it
references where the dependency is real. The Phosphor domain-mark plane (P17) is gated on
the iconography ADR (already accepted) and on W01.P04, and is otherwise independent of
the surface re-skins.

W03 (Codify) is sequenced last by the codify discipline: a candidate becomes a rule only
after it has held across one full execution cycle, so the promotions cannot begin until
W01 and the surface waves have run.

## Verification

A foundation or surface Step closes only when every one of these checks passes:

- The full lint gate `just dev lint frontend` exits 0 (eslint plus prettier plus tsc); a
  partial run such as eslint-only is not a green gate.
- The frontend test suite is green.
- Tokens are contrast-proven per theme (dark, light, and high-contrast), because the warm
  ground shifts effective contrast; the per-theme text and border ratios are recorded.
- The scene's `getComputedStyle` token reads still resolve their colors against the
  rebuilt token layer (the three reader files under `frontend/src/scene/field/` keep
  rendering).
- No layer-ownership violation: chrome never fetches the engine and never reads the raw
  `tiers` block, and every surface stays a dumb view projecting over the one model via
  stores selectors.
- Icons come only from the two sanctioned families: Lucide for structural chrome,
  Phosphor (or marks authored in-family on Phosphor's grid) for the expressive/domain
  plane; every domain mark passes the 14px grayscale-by-shape gate.
- A design-review subagent has recorded a verdict and any required revisions have landed
  and passed the reviewer's re-check before downstream phase work begins.

W01 closes when the OKLCH primitive ramps, the semantic 12-step tier, the three peer
themes, the Tailwind wiring, the derived color/typography/motion/form tokens, and the
formalized icon dependencies with the proven texture-seam spike are all in place and the
scene still resolves its tokens. Each W02 surface phase closes when its surface consumes
only the new semantic tokens and sanctioned icons per its accepted ADR and the per-Step
checks above pass; the domain-mark phase additionally closes only when all four tier
marks, the lifecycle states, the node-feature mark, and the progress ring pass the 14px
grayscale gate and feed both the React chrome and the texture seam. W03 closes when the
three codification candidates are promoted to project rules after holding across one full
execution cycle.

The plan is complete when every Step is closed (`- [x]`).
