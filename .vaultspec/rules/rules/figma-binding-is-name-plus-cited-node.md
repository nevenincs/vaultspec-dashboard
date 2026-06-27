---
name: figma-binding-is-name-plus-cited-node
---

# The Figma↔code binding is name-as-contract, with a cited-node fallback

## Rule

The join between the binding Figma file (`SlhonORmySdoSMTQgDWw3w`) and the React codebase is
the NAME: a component's Figma node name EQUALS its React export symbol (bare PascalCase). The
only fallback is an opt-in source citation
`// @figma <Name> · <fileKey> · <nodeId>[ · alias-of <Export>]` in the component's file
header, validated by the `figma:names` gate (wired into `just dev lint frontend`). There is
NO Figma Code Connect, NO `component-map.json` registry, and NO `.figma.tsx` files — do not
reintroduce them (the seat is Pro-tier; Code Connect is unavailable). Every node on the board
derives its name from ONE ruleset: organizational boards / sections / foundations use
`[Band] Topic` (Band ∈ {Foundations, Kit, Surface, Graph, Mobile, States}); sub-components
with no standalone export use `_Parent/Part`; component variants keep Figma-native
`Property=Value` axes; standalone state-preview frames use the `Component.state[.qualifier]`
dot-path; studies use `[Study] Topic`. State words match Figma's existing vocab
(`Typical/Loading/Degraded/Empty/Skeleton`) — not a normalized set; theme is a Figma variable
mode, never a name dimension. Every ORGANIZATIONAL container is an auto-layout FRAME (no
`SECTION` nodes, no `GROUP` nodes) with uniform padding 48 / gap 32; gallery children are
arranged as `{caption ⌄ tile}` cells in a horizontal wrap grid. Faithful UI mockups
(`AppShell`, surface/state renders) stay absolutely positioned — auto-layout would scramble
them, so they are the deliberate exception.

## Why

The `2026-06-27-figma-naming-contract-adr` settled this after Code Connect and its entire
component-level join (the `component-map.json` registry, `registry.schema.json`, the
`figma:registry`/`figma:parity` gates, and the `figma-code-connect-via-cli` rule) were
removed for lack of an Org/Enterprise seat. Without a registry the only machine-readable join
left is the name itself, so components must CONVERGE on identical names (tokens/icons keep
parallel naming because their join is a generated pipeline — `tokens:figma` / `figma-icons` —
not a name). The board had drifted into inconsistent container naming (` — ` / ` - ` / ` / ` /
` · ` / `(parens)`), mixed bare/slash component names, and mixed `SECTION`/absolute grouping;
one ruleset plus auto-layout containers makes the board read as one system and makes a new
component reachable from Figma by its bare React name with zero registry upkeep. The
load-bearing discoveries during rollout: Figma variants REQUIRE `Property=Value` to function
(a dot-named child breaks the variant set), so the dot-path is for standalone preview frames
only; and a section→auto-layout conversion is destructive — caption↔tile pairing must be
recovered from ORIGINAL geometry (a naive "pull all text to the top" pilot orphaned every
state caption), never guessed.

## How

- **Good:** a new component's Figma node is named exactly its React export (`CommandPalette`,
  `StatusTab`); resolution is `grep <nodeId>` (or the bare name) for Figma→code, and MCP
  `search_design_system` by symbol for code→Figma.
- **Good:** an alias (Figma name ≠ export) or a sub-frame carries
  `// @figma <FigmaName> · SlhonORmySdoSMTQgDWw3w · <nodeId> · alias-of <Export>`; a rename is
  a two-sided contract event landed in one commit.
- **Good:** a new organizational board is an auto-layout frame named `[Band] Topic`, padding
  48 / gap 32; its gallery children are `{caption ⌄ tile}` cells in a horizontal wrap.
- **Bad:** reintroducing `@figma/code-connect`, a `component-map.json` registry, or
  `.figma.tsx` files; a slash-prefixed component name (`kit/Button`) instead of bare
  (`Button`); a `SECTION` or `GROUP` used as an organizational container; auto-layout applied
  to a faithful screen mockup (it scrambles the render); a hand-typed `@figma` citation whose
  fileKey isn't the binding file (the `figma:names` gate rejects it).

## Status

Active. Promoted from the `2026-06-27-figma-naming-contract-adr` codification candidate at the
user's explicit direction, at the close of the board rename + layout-standardization campaign
(60+ nodes renamed, all sections converted to auto-layout frames with 0 orphaned labels, the
`figma:names` gate green in the full frontend lint). It REPLACES the removed
`figma-code-connect-via-cli` rule. Sibling of `figma-is-the-binding-source-of-truth` (Figma is
the authority this join connects to), `design-system-is-centralized`,
`no-hardcoded-px-in-dom-styling`, and `themes-are-oklch-generated-from-a-token-tier` (the
generated token/icon pipelines this rule deliberately exempts from the name-contract).

## Source

ADR `2026-06-27-figma-naming-contract-adr` (accepted; codification candidate). Binding file
`SlhonORmySdoSMTQgDWw3w`. Gate: `frontend/scripts/figma-names-check.mjs` (`figma:names`, in
`just dev lint frontend`). Day-to-day procedure and full ruleset:
`frontend/figma/README.md` and `frontend/figma/FIGMA-WORKFLOW.md`.
