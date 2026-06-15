# Figma mirror — seed record (real buildout, 2026-06-15)

The Figma mirror was built **code → Figma** directly through the claude.ai Figma MCP
(`use_figma`, Plugin API), from the real React component source. Figma is a **mirror**,
never canonical (see the design-tokens-are-code-canonical principle and the
`figma-design-bridge` ADR).

> Supersedes earlier drafts of this file. An initial pass created 50 name-only
> placeholder stub frames (still present as Figma frame `4:2`, retained only as
> scaffolding) that did not reflect a real design; a second concurrent session was
> authoring the same file in parallel. The live, canonical mirror is the single
> `MIRROR` container described below — all real, faithful, variable-bound regions.

## The file

- File: **Vaultspec Dashboard — Design System (code mirror)**
- URL: https://www.figma.com/design/8WDmXNOURdRQwdefWNGsBb
- fileKey: `8WDmXNOURdRQwdefWNGsBb`

## What is seeded (all inside the `MIRROR` container, node `23:2`, Page 1)

**Foundations**
- **Variables** — `Primitives` (OKLCH-derived hex) + `Semantic` collections across
  **Light / Dark / High-Contrast** modes (`public/chrome/*`, `public/scene/*`). Every
  fill in the mirror is *bound* to these, so switching the Figma variable mode recolours
  the whole mirror — the same contract the code's `[data-theme]` honours.
- **Iconography** (`Foundations · Icons & Type`, node `13:2`) — all 30 in-house domain
  marks (doc-type / event / tier / lifecycle-state / status-severity / status-tier)
  imported as **true vectors** from `src/scene/field/marks.ts`, plus the type scale.
- **Colour foundations** (node `5:2`) — the public token surface as variable-bound swatches.
- **Lucide + Phosphor chrome glyphs** — extracted by `scripts/figma-icons.mjs` →
  `figma/icons.json` (the durable icon artifact; re-run to refresh/extend).

**Components** — ~47 surfaces, each a faithful, variable-bound, theme-aware frame named
1:1 with its React component. Six are assembled *in context* (Left rail, Stage, Right
activity rail, Timeline, Overlays, Settings); the rest are standalone panels. Every node
id is recorded in `component-map.json`.

**Not mirrored, by constraint:** the PixiJS scene/canvas (it rasterizes under any
importer and has no faithful Figma representation — `figma-design-bridge` ADR §Constraints).
Surfaces that render over the canvas show a neutral `canvas-bg` ground with a
"not mirrored" note.

## Verified

- `npm run figma:registry` → 50 components mapped, 43/43 design surfaces bound.
- `npm run figma:parity` → 49/49 bound components match their Figma node by name.
- `get_variable_defs` resolves bound tokens on component nodes per theme mode.
- **Code Connect** remains unavailable (Org/Enterprise-only at the Pro tier); the
  repo-maintained `component-map.json` registry is the sanctioned substitute.

## Re-seeding / extending

- Re-extract icons: `node scripts/figma-icons.mjs` (from `frontend/`) — add an
  import-name → kebab/def entry to the `LUCIDE`/`PHOSPHOR` maps for a new glyph.
- Rebuild a component frame via `use_figma`; then refresh its node id in
  `component-map.json` and the snapshot, and re-run the registry + parity gates.
- See `FIGMA-WORKFLOW.md` for the day-to-day code ↔ Figma workflow.
