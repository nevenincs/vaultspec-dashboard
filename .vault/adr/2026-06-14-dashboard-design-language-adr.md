---
tags:
  - '#adr'
  - '#dashboard-design-language'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - "[[2026-06-14-dashboard-design-language-research]]"
---

# `dashboard-design-language` adr: `base UI design language` | (**status:** `accepted`)

## Problem Statement

The dashboard frontend is entering a design-driven redefinition. To date its visual
language was an internally-authored, distinctive "paper-warm brand" skin with a
commissioned hand-drawn glyph family. That direction is being deliberately set aside.
The product's audience is programmers and developers who already work inside IDEs and
agentic-coding desktop applications, and the industry is converging on a shared design
language for those tools. The dashboard should read as a native member of that cohort —
a **trend-follower**, not a brand statement.

This ADR pins the **base UI design language**: the identity stance, the theme model, the
color discipline, depth/form, typography, motion, density, iconography, and the human
quality the interface carries. It is **spec work**. It codifies *what the language is*
and the UX laws it obeys; it does not plan the implementation, and it does not reopen the
four-layer architecture (engine / stores / scene / app). A separate later cycle will
sequence adoption across the layers.

## Considerations

The decision is grounded in the research, which gathered (1) the existing in-repo design
DNA, (2) the conceptual model any language here must represent, (3) a focused pass on the
named convergent references, and (4) the foundational token mechanics for the confirmed
stack.

- **The named reference cohort.** Google Antigravity (agent-first VS Code fork; plans as
  reviewable documents; completion as a "visual receipt"), OpenAI Codex Desktop (a theme
  system whose core tokens are `surface` / `ink` / `accent` / `contrast` with system-font
  defaults, shipping Linear and Notion as first-class themes; a thinking-state
  micro-interaction), and Claude Desktop (the warmth reference — warm low-chroma neutrals,
  one muted earthy accent, warmth preserved into dark, rounded geometry, approachable copy
  tone). Their cohort (Cursor, Windsurf, Zed, VS Code, Linear) shows the same convergence.
- **The distilled convergent language.** Dark-first with light as an equal peer and
  system auto-switch; a tiny generative theme core (`surface` + `accent` + `contrast`)
  computed in a perceptual color space rather than hand-listed; restraint as the
  aesthetic (one muted accent, gradient-free, dimmed chrome); "structure felt, not seen"
  (subtle elevation and soft rounded low-contrast borders); keyboard-first with a `Cmd+K`
  palette; compact-but-breathing density with separate UI and code type scales; system /
  variable UI sans plus a dedicated monospace; fast, subtle, state-communicating motion.
- **The reconciliation of warmth.** The human/tactile quality the team values (the Claude
  lineage) is achievable entirely at the token and tone layer and is *not* in tension with
  a clean, modern, reactive register — provided it never becomes decoration.
- **The confirmed stack.** React 19.2, Tailwind CSS v4.3 (CSS-first `@theme`),
  TypeScript 6, Vite 8; render via PixiJS 8 / `@pixi/react` 8 / sigma 3; state via
  zustand 5 and TanStack Query 5; bespoke chrome, no component library. A hard mechanical
  constraint: design tokens must be readable from JavaScript via `getComputedStyle`
  because the canvas scene consumes them — they cannot be utility-class-only.
- **The product is an instrument, not an IDE.** The references are consumer/IDE tools;
  this product is a knowledge-graph instrument over a vault. The convergent language is
  the *base register*; product-specific layers ride on top of it.

## Constraints

- **Token-level mechanics (validated, low risk).** OKLCH is a native CSS color function;
  Tailwind v4's `@theme` is the established single token carrier; the variable-remap
  theming model already ships. The decisions below extend a working foundation rather than
  introducing frontier technology.
- **Cross-layer token read is load-bearing.** The same `:root` token layer must feed
  chrome utilities, bespoke component `var()`, and the Pixi/sigma scene via
  `getComputedStyle`. Color tokens must therefore be emitted even when not referenced as a
  class (Tailwind `@theme static` for the color namespace); aliasing tokens that reference
  another variable need `@theme inline` to avoid shipping unresolved `var()`.
- **Reference documentation is partial (frontier risk).** Antigravity and Codex publish
  little official token-level design documentation; their exact palettes are inferred from
  theming systems and reviewer captures, and the Claude warmth tokens are reconstructed
  from a faithful community capture. The ADR therefore pins *principles and mechanisms*,
  not borrowed hex values; canonical values are produced by this project's own OKLCH ramp.
- **Product invariants the language must not break** (parent features, stable): the
  per-tier `tiers` truthfulness mechanism (every wire response carries it; degradation is a
  designed state, not an error), bounded-by-default graph reads, grayscale-safe tier
  identity, time-travel mode honesty, and the state-isolation invariants in the stores
  layer. These are settled and the design language is built to honor them, not amend them.
- **Scope fence.** This ADR does not authorize implementation. No layer is rebuilt on its
  authority; it is the grounding for a later plan.

## Implementation

The base UI design language, codified as layers. Each layer states the law; concrete
token values are produced during adoption from the OKLCH ramp, not hard-coded here.

**1 — Identity and stance.** The dashboard adopts the convergent agentic-desktop design
language: clean, modern, reactive. It is a deliberate trend-follower; it does not pursue a
distinctive brand identity. Its one differentiator is a restrained human warmth carried at
the token and tone layer (layer 9), kept subordinate to legibility and reactivity.

**2 — Theme model.** Dark and light are equal peers, with system auto-switch and a manual
override; identity must survive both. Themes are expressed through a tiny generative core
in the spirit of `surface` / `accent` / `contrast`, computed in OKLCH so colors of equal
lightness appear equally light. The token layer is split into explicit tiers — primitive
OKLCH ramps (intent-free) aliased by semantic tokens (named for *why*, not *what*) — both
inside the existing Tailwind `@theme` carrier; component tokens are deferred until a
component must override a semantic default. A theme is a remap of the semantic tier under a
`[data-theme]` selector, with no component aware of which theme is active; high-contrast is
just another remap of the same semantic set. The semantic steps follow a Radix-style
12-step role model, which supplies the currently-missing discrete hover, pressed, and
focus-ring states. The `dark:` utility variant is not adopted; the variable-remap model is
the single theming mechanism.

**3 — Color discipline.** Surfaces are warm-hued, very-low-chroma neutrals (a faint warm
cast, not pure white and not blue-gray), and the warmth is carried into dark as a
warm-tinted near-black rather than a cold blue-black. Color is *spent*, not sprinkled:
hue is reserved for the single muted earthy accent (interactive highlights and selection
rings), for semantic state, and for graph node/edge type. Categorical identity — the four
provenance tiers and node types — is carried by shape and line treatment first, with hue
as redundant reinforcement that may be stripped without collapse; built in OKLCH at fixed
lightness and chroma, the tier hues stay distinguishable in their grayscale projection by
construction. Diff legibility is sacred: added/removed semantics keep their high-contrast
green/red even within a warm theme, overriding warmth on conflict.

**4 — Depth and form.** Structure is felt, not seen. Hierarchy is expressed through subtle
multi-level elevation (background → foreground → panel → dialog → modal) and through soft,
rounded, low-contrast 1px borders; borders without a reason are pruned; heavy boxes and
hard high-contrast rules are avoided. Geometry is consistently rounded. Supporting chrome
(rails, nav) is attenuated so the work surface leads — "don't compete for attention you
haven't earned."

**5 — Typography.** A system / variable UI sans and a dedicated system monospace, with the
UI type scale and the code/buffer type scale tracked as separate tokens (the cohort
pattern). The scale stays compact and instrument-grade; sizes are fixed, not fluid.
Tabular numerals are mandated on all data-bearing contexts (timestamps, counts, ahead /
behind, the tiers block); the monospace is reserved for true identity and code (hashes,
byte spans, provenance stable keys, paths). No bundled identity face for a web-served tool.

**6 — Motion.** Motion is fast, subtle, reactive, and communicates state — never ambient
decoration. UI animation is short; keyboard-initiated actions never animate (they must feel
instant); `prefers-reduced-motion` swaps animated transitions for instant state changes.
Where the interface animates a change between data states (the timeline diff/replay), it
obeys the established animated-transitions grammar: add fades in, remove fades out,
re-link/re-tier is a distinct staged transition, the same semantic operation always looks
the same, object constancy is preserved by stable ids, and states that share no structure
are cut, not tweened. A small, purposeful liveness cue (the Codex thinking-state lesson) is
sanctioned for genuine in-progress work, tied to real state.

**7 — Density and layout register.** Compact-but-breathing: high information density with
deliberate padding and pixel-precise alignment, felt rather than noticed. The interface is
keyboard-first, with a `Cmd/Ctrl+K` command palette as a lifted surface and `Cmd/Ctrl+,`
for settings. Navigation/chrome is dimmed; the active surface is brightest.

**8 — Iconography.** Hybrid, and the hand-drawn / hand-generated glyph family is retired
in full. The structural chrome uses a conventional maintained set; the expressive /
domain plane (node species, the four tier marks, lifecycle state, event kinds, the
progress ring) adopts a maintained icon framework rather than a bespoke hand-drawn brand
family, with any irreducibly domain-specific marks authored in-family on that framework's
grid. The grayscale-safe, 14px-legible, shape-first identity requirement is preserved
regardless of source. The concrete framework selection and the chrome-versus-domain split
are decided in a dedicated bespoke iconography ADR; this layer only fixes the direction
(retire hand-drawn; adopt existing frameworks; keep the a11y identity gates).

**9 — The human/tactile signature.** Warmth is injected only through five token-level
devices: warm-hued low-chroma neutrals (carried into dark); one muted earthy accent; soft
depth and consistent radius; alive, purposeful micro-interactions; and an approachable copy
tone in plans, approvals, and empty states. Guardrail: warmth must never become textures,
skeuomorphism, gradients, multiple accents, or reduced contrast. Contrast, diff legibility,
density, and reactivity always override warmth where they conflict.

**10 — Instrument surface grammar.** The agent/instrument surfaces follow the cohort's new
grammar, adapted to this product: detail and plan-like content presented as reviewable,
scannable documents rather than chat logs; streaming or in-progress work shown as subtle
liveness; any accept/reject interactions are granular and explicit; and completion or
status is presented as a legible "receipt" the user can verify at a glance. Progressive
disclosure governs everything — overview first, zoom and filter, details-on-demand.

**11 — Product-specific layers preserved on top.** The base language carries, unchanged,
the product invariants: tier-as-treatment with grayscale-safe identity; bounded-by-default
graph reads with honest truncation; the per-tier `tiers` truthfulness mechanism rendered as
designed degraded states; time-travel as an enforced, unmistakable mode; and the
state-isolation invariants. The language is delivered through the shared `:root` token
layer (consumed by both chrome and the canvas scene); surfaces remain dumb views projecting
over the one model via stores selectors; the engine stays read-and-infer.

## Rationale

The pivot follows the audience. Developers fluent in Antigravity, Codex Desktop, Claude
Desktop, Cursor, Zed, and Linear bring a learned grammar; meeting that grammar lowers the
cost of entry and makes the dashboard feel native rather than idiosyncratic. The research
found this convergence is real and current, and — critically — that the OKLCH plus
generative-core plus token-tier direction is not a bespoke bet but the exact mechanism the
cohort settled on (Codex ships Linear's palette; Linear collapsed ~98 variables to three
OKLCH-generated tokens). Adopting it is therefore both the on-trend and the technically
sound choice, and it retires the manual contrast-darkening hacks the prior single-tier
token file required.

The warmth decision resolves the apparent contradiction in the brief — "trend-follower"
versus "keep the human touch." The research showed Claude Desktop achieves exactly this by
placing warmth in the neutrals' hue and one accent rather than in decoration, and that
Linear independently moved toward warmer grays. Warmth-as-tokens lets the dashboard keep a
subtle human signature (the value the rejected paper-warm brand reached for) while reading
as a clean, modern, reactive member of the cohort. The hybrid iconography decision applies
the same logic to marks: conventional where structure should be invisible, restrained
tactile quality only where the product's own meaning is encoded.

Keeping the product invariants on top of the base language is what lets this ADR pin the
design without reopening the architecture: the language is a token-and-principles layer,
and the existing layer-ownership and projection rules already settle who renders what.

## Consequences

- **Gains.** A familiar, low-friction interface for the target audience; a theming
  foundation that is contrast-correct by construction across dark, light, and high-contrast
  themes; a token architecture that the canvas scene and the DOM chrome genuinely share; a
  retirement of brittle single-tier hex tokens and manual contrast fixes; a clear,
  enforceable boundary on where "warmth" may and may not appear.
- **Costs and difficulties.** Building OKLCH primitive ramps and the semantic 12-step model
  is real foundational work, and every text and border token must be contrast-proven per
  theme (the warm ground shifts effective contrast). The commissioned hand-drawn glyph
  family is largely set aside as the brand direction — a sunk expressive investment, partly
  recoverable as the restrained tactile quality of the expressive marks. "Trend-follower"
  carries a standing maintenance cost: the cohort's language will keep moving, and staying
  native means periodic realignment.
- **Risks.** Reference palettes are inferred, so the project must derive and validate its
  own values rather than copy them. The warmth guardrail is a discipline, not a mechanism;
  without vigilance, "human touch" can creep back into decoration and erode the clean
  register — a codification candidate below addresses this. Diff legibility and contrast
  must be defended explicitly against warm-theme drift.
- **Pathways opened.** A generative theme core makes new themes (including user themes and
  a first-class high-contrast theme) cheap; the instrument surface grammar gives a
  consistent template for presenting plan-like, streaming, and verification content as the
  product grows; the shared token layer keeps future views visually consistent for free.

## Codification candidates

- **Rule slug:** `warmth-lives-in-tokens-not-decoration`.
  **Rule:** Human/tactile warmth in the dashboard UI may be expressed only through
  warm-hued low-chroma neutrals, a single muted accent, soft depth/radius, purposeful
  micro-interactions, and copy tone — never through textures, skeuomorphism, gradients,
  multiple accents, or reduced contrast; contrast, diff legibility, density, and reactivity
  override warmth on any conflict. (Promote only after it has held across one full
  execution cycle.)
- **Rule slug:** `themes-are-oklch-generated-from-a-token-tier`.
  **Rule:** Theme colors are derived from primitive OKLCH ramps aliased by a semantic token
  tier and emitted on `:root` for both chrome and the canvas scene; a theme is a
  `[data-theme]` remap of the semantic tier, never per-component color or borrowed hex.
  (Candidate; promote after the foundation proves out.)

Both are candidates, not yet rules: the codify discipline requires a constraint to hold
across at least one full execution cycle before promotion.
