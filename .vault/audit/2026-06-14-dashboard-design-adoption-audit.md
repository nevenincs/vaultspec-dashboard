---
tags:
  - '#audit'
  - '#dashboard-design-adoption'
date: '2026-06-14'
modified: '2026-07-12'
related:
  - "[[2026-06-14-dashboard-design-adoption-plan]]"
  - "[[2026-06-14-dashboard-design-language-adr]]"
---

# `dashboard-design-adoption` audit: `W01 P01-P03 OKLCH token foundation review`

## Scope

Review of Wave W01 Phases P01-P03 (Steps S01-S17): the OKLCH token foundation that
replaces the single-tier hex theme with intent-free primitive ramps, a Radix-style
twelve-step semantic tier, dark / light / high-contrast peer remaps, the Tailwind v4
wiring, the derived color / typography / motion / form tokens with per-theme contrast
proof, and the platform theme controller. Surfaces audited: the token file, the platform
theme controller and its hook, the chrome theme toggle, the app boot wiring, and the
scene token-read seam. P04 (icons) is out of scope (another owner).

Verdict status: PASS. No CRITICAL or HIGH findings. The full lint gate exits 0 (eslint +
prettier + tsc) and all 86 test files / 501 tests pass.

## Findings

### token-name-preservation | none | the public token surface is preserved, no consumer breaks

The highest-blast-radius risk - a renamed token silently breaking a chrome utility or a
scene getComputedStyle read - is cleared. A production build confirms every consumed
chrome utility resolves (`bg-paper`, `text-ink`, `border-rule-strong`, `bg-accent-subtle`,
`text-accent-text`, the opacity-modified `border-state-active/30` via color-mix, the
`text-*`, `rounded-vs-*`, `px-vs-*`, `shadow-card` families). The 241 utility usages across
24 chrome files and the four scene reader files keep resolving.

### scene-hex-contract | none | scene reads resolve hex from the rebuilt layer

The scene readers parse `#rrggbb`; the scene-read token subset is emitted as literal hex
(three renderings per token, one per theme) on the root selector, verified in the build
output. A new happy-dom test applies the rebuilt hex onto the document element and asserts
the edge-mesh and node-sprite readers resolve it in light, fall back to ink-muted, and
re-resolve on a dark flip. The reader files were not modified - emission was kept hex to
keep their blast radius zero.

### theme-inline-cycle-avoided | none | an early var() self-cycle was caught and corrected

An initial pass placed the scene-read tokens in an `@theme inline` self-alias, which the
build revealed emitted `--color-x: var(--color-x)` cycles on root. Corrected by declaring
the scene-read tokens once as literal hex in `@theme static` and overriding per theme; the
S05 mechanism (inline is for theme-invariant aliases only, never the theme-remapped
surface) is documented in the token file. No unresolved or cyclic var() ships.

### layer-ownership | none | theme ownership sits in the platform substrate, chrome stays dumb

The theme controller (document-element ownership, persistence, OS media listening) lives in
the platform layer as a framework-free primitive; the chrome consumes it through a thin
hook and no longer touches `data-theme` directly anywhere under the app layer. This honors
the dashboard-layer-ownership boundary. The scene's existing `data-theme` MutationObservers
observe (never write) and are unaffected.

### contrast-proof | none | every load-bearing pair clears its floor in every theme

Body text >=4.5:1, large/UI text and the focus ring >=3:1 in light and dark; high-contrast
raises every pair to >=4.5:1. The full WCAG matrix is recorded in the token file. The only
sub-floor tokens are the felt-not-seen rule dividers, documented as intentional
non-load-bearing borders (their load-bearing counterpart, the focus ring, clears 3:1 in
every theme; high-contrast lifts the rule tokens to visible separators).

### adr-scope-gap | low | the adoption feature lacked a same-feature ADR; one was added

The plan was tagged for the adoption feature but its authorizing ADRs carry different
feature tags, so the exec lifecycle gate (same-feature ADR required) blocked record
scaffolding. A thin adoption-feature ADR was authored that defers entirely to the two
accepted grounding ADRs and adds no new design decision. This is vault hygiene the CLI's
own feature check recommended, not new spec authority. Noted so the base ADR's adoption
sequencing can account for the same-feature-ADR requirement.

## Recommendations

- No blocking revisions. The foundation is ready for the W02 surface waves to consume.
- During the surface waves, apply the new typography discipline at call sites: opt surfaces
  into tabular numerals on data-bearing contexts and reserve mono for identity/code (the
  tokens and the data-bearing base rule exist; per-surface application is surface-wave work).
- The `text-heading` and the new code-scale / elevation (`shadow-panel`, `shadow-dialog`) /
  `radius-vs-xl` / `duration-ui-instant` tokens are defined but not yet consumed; they are
  intentional foundation for the surface waves, not drift.
- W03 codify should promote `themes-are-oklch-generated-from-a-token-tier` and
  `warmth-lives-in-tokens-not-decoration` only after the surface waves have held them.

## Codification candidates
