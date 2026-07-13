---
tags:
  - '#adr'
  - '#figma-naming-contract'
date: '2026-06-27'
modified: '2026-07-13'
related:
  - '[[2026-06-16-figma-parity-reconciliation-adr]]'
---

# `figma-naming-contract` adr: `Figma board naming + layout contract (name-as-contract after Code Connect)` | (**status:** `accepted`)

## Problem Statement

Figma Code Connect was removed (no Org/Enterprise seat), and with it the entire
component-level join: the `component-map.json` registry, the `registry.schema.json`, the
`figma:registry`/`figma:parity` gates, and the `figma-code-connect-via-cli` rule. The
token/icon pipeline survived; the component-level Figma↔code join did not. Separately, the
binding board `SlhonORmySdoSMTQgDWw3w` had drifted: organizational containers were named
inconsistently (` — ` / ` - ` / ` / ` / ` · ` / `(parens)`), components mixed bare and
slash-prefixed names, and grouping mixed `SECTION` nodes with absolutely-positioned frames.
We need one durable, seat-free way to keep Figma and code aligned, and one standardized way
to represent and lay out elements on the board.

## Considerations

- The only machine-readable join left without a registry is the NAME itself, plus an
  optional cited node id in source. Tokens/icons stay on their generated pipeline (parallel
  naming on purpose); only components need the by-name contract.
- Figma variants REQUIRE `Property=Value` syntax to function; dot-paths cannot be literal
  variant children. Themes are Figma variable modes, not name dimensions.
- `SECTION` nodes cannot carry auto-layout; standardized layout requires frames.
- Some top-level frames (`AppShell`, state/component mockups) are faithful UI renders, not
  galleries — auto-layout would scramble them.

## Constraints

Pro-tier Figma: no Code Connect, no Variables REST — the contract must be code-side,
by-name, and MCP read-only parity, never a paid binding mechanism. Mutating the binding file
`SlhonORmySdoSMTQgDWw3w` is high blast radius but version-history reversible; destructive
reflows (section→auto-layout) must preserve caption↔tile pairing recovered from original
geometry, never guessed. The `figma:names` gate is local-only: it validates citation format
and the binding fileKey, but cannot verify live name↔node parity without the MCP.

## Implementation

One ruleset classifies every node and renders it one way: **components** bare PascalCase
equal to their React export; **variant leaves** keep Figma `Property=Value` axes;
**sub-components** (no standalone export) use `_Parent/Part` (underscore hides them);
**container boards / sections / foundations** use `[Band] Topic`,
Band ∈ {Foundations, Kit, Surface, Graph, Mobile, States}; **standalone state previews** use
a `Component.state[.qualifier]` dot-path; **studies** use `[Study] Topic`. State vocabulary
matches Figma's existing words (`Typical/Loading/Degraded/Empty/Skeleton`); theme stays a
variable mode. The registry is replaced by an opt-in source citation
`// @figma <Name> · <fileKey> · <nodeId>[ · alias-of <Export>]`, validated by a lean local
gate `figma:names` in `just dev lint frontend`; resolution is grep-the-node-id (or bare name)
for Figma→code and MCP `search_design_system` by symbol for code→Figma. **Layout** is
standardized by converting every organizational `SECTION` to an auto-layout `FRAME` and
arranging gallery children as `{caption ⌄ tile}` cells in a horizontal wrap grid (padding 48,
gap 32). Faithful screen/component mockups (`AppShell`, state/surface renders) are left
absolute by design.

## Rationale

Without a registry the name IS the contract, so components converge on identical names while
boards/sections carry organization — the strongest seat-free join and the least drift. The
hybrid variant/dot-path encoding respects Figma's variant mechanics while honoring the
requested `Component.state.theme` addressing. Converting sections to auto-layout frames is the
only way to get standardized, reflow-safe layout; recovering caption↔tile pairing from saved
original geometry made the destructive reflow safe (validated on a pilot that first exposed
the naive failure). The campaign renamed 60+ nodes, converted all sections (0 orphaned
labels), and the full frontend gate including `figma:names` is green.

## Consequences

A new component is reachable from Figma by its bare React name with no registry upkeep;
renames become a deliberate two-sided contract event; the board reads as one system and new
boards drop into the wrap-grid standard for free. Costs: the by-name join is
convention-enforced (the local gate validates citation format, not live name↔node parity — a
Figma rename silently breaks the join until the React side follows). Residual: a few
Figma-only primitives marked `_`, and genuinely stale/dead nodes (`WorkspacePicker` dups,
`Discover`) plus a tangled HoverCard node mapping (84:2 / 319:1024 / 110:2) are left for a
deletion/dedup decision rather than mass-mutated.

## Codification candidates

- **Rule slug:** `figma-binding-is-name-plus-cited-node`.
  **Rule:** The Figma↔code join is name-as-contract — a component's Figma node name equals its
  React export symbol, with an opt-in `@figma <Name> · <fileKey> · <nodeId>[ · alias-of
  <Export>]` source citation as the only fallback; there is no Code Connect and no central
  registry; organizational nodes use `[Band] Topic`, sub-components `_Parent/Part`, variants
  `Property=Value`, state previews `Component.state`; every organizational container is an
  auto-layout frame, while faithful UI mockups stay absolute.
