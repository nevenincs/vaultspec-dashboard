---
tags:
  - '#research'
  - '#dashboard-iconography'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - "[[2026-06-14-dashboard-design-language-adr]]"
  - "[[2026-06-14-dashboard-design-language-research]]"
---

# `dashboard-iconography` research: `icon framework selection`

The base design-language ADR retires the hand-drawn / hand-generated glyph family in full
and adopts maintained icon frameworks (hybrid: conventional set for structural chrome, a
framework for the expressive / domain plane). This research compares the leading
open-source icon frameworks against this product's needs to ground the bespoke
iconography ADR.

## Findings

### Project grounding (verified)

- **Stack:** React 19.2, Tailwind v4, Vite 8 for chrome; PixiJS 8 + sigma 3 for the
  canvas. Tokens must be JS-readable for the canvas.
- **`lucide-react` is a phantom dependency.** It is imported in seven chrome files
  (`AppShell`, `VaultBrowser`, `Inspector`, `AlgorithmPanel`, `FilterSidebar`,
  `MinimapWidget`, `NavToolbar`) and physically present in `node_modules` at v1.18.0, but
  it is **not declared** in `frontend/package.json`. This must be formalized regardless of
  the outcome.
- **Current Lucide usage is purely conventional chrome** (chevrons, zoom, theme toggle,
  close, settings, fullscreen, rotate). No domain/expressive marks route through Lucide
  today.
- **Two distinct icon planes exist.** (1) DOM chrome (`frontend/src/app/`) — React
  components, currently Lucide. (2) GPU canvas glyphs (`frontend/src/scene/field/glyphs.ts`
  behind the `GlyphTextureProvider` seam in `nodeSprites.ts`) — programmatic Pixi
  `Graphics` → `Texture` placeholders, not React, not SVG. The retired hand-drawn family
  was meant to land on plane (2) as textures.
- **Retired family scope (26 glyphs):** doc-types (research/adr/plan/exec/audit/reference/
  index), `node-feature`, events (commit/doc-created/doc-modified/lifecycle), the four
  abstract tier marks (declared/structural/temporal/semantic), states (active/complete/
  archived/broken/stale), and a progress ring set (track/25/50/75/complete).
- **Hard constraints any replacement must meet:** distinguishable in pure grayscale at
  14px by shape alone (hue never load-bearing); legible at 14px; a three-weight line
  system (detail / primary / accent); single `currentColor` ink; 24px grid; round joins.

### Comparison (versions queried 2026-06-14)

- **Lucide** — `lucide-react` 1.18.0 (lib 1.19.0), ISC, React 19 peer, ~1,600 icons,
  24px / stroke-2 / `currentColor`, raw SVG via `lucide-static`, strong dev/git/graph
  vocabulary (git-branch/commit/merge, file-text, network, workflow, waypoints). One weight
  only (stroke-width prop, not a semantic tier). Very active (published 2026-06-12). Clean,
  slightly cool Feather lineage.
- **Phosphor** — `@phosphor-icons/react` 2.1.10, MIT, ~9,000 icons (1,500 × 6 weights),
  24px, `weight` prop = thin/light/regular/bold/fill/duotone, raw SVG `fill=currentColor`.
  Covers git/file/graph concepts; rounded-join house style is reproducible for in-family
  authoring. The only mainstream set whose weight axis maps onto detail/primary/accent and
  whose `fill` can encode state without leaving the family.
- **Tabler** — 3.44.0, MIT, ~6,146 icons, 24px / stroke-2, broadest dev coverage, but only
  outline + separate-filled (two styles, not a weight continuum).
- **Radix Icons** — 1.3.2, MIT, ~310, 15px grid (off-spec), stale since 2024, chrome-only.
- **Heroicons** — 2.2.0, MIT, ~330, maintainers refuse new icons (extensibility
  dead-end), thin domain coverage.
- **Material Symbols** — Apache-2.0, ~3,600 × 3 styles, variable font with four axes
  (weight / fill / grade / optical-size) — the richest control and the Antigravity/Google
  register named as the aesthetic anchor — but delivered as a **variable font**; static
  per-SVG exports do not carry the axis range, which is fatal for the GPU texture plane.
  React integration is community-wrapped, not first-party.
- **Iconoir** — 7.11.0, MIT, ~1,600, 24px, single weight.
- **Remix Icon** — 4.9.1, but a **non-standard "Remix Icon License v1.0"** that must be
  vetted against the permissive-license requirement.
- **Carbon** — 11.82.0, Apache-2.0, ~2,600, enterprise-cool register, ships IBM Telemetry
  (opt-out), rigid grid — weak fit for the restrained-tactile warmth.

### Recommendation

**Lucide for structural chrome (formalize the dependency) + Phosphor for the expressive /
domain plane.** This is the hybrid split the design language calls for, and it maps onto
the two icon planes already in the codebase. Lucide is already wired, React-19-native, and
exactly the conventional chrome the hybrid wants; the only required action is to declare
`lucide-react`. Phosphor's six-weight system is the single best fit for the domain plane's
three-weight requirement and its state-by-fill encoding, its rounded joins match the
tactile register, and its clean per-SVG output suits Pixi/sigma texture generation. Cite
Material Symbols as the aesthetic north-star but reject it as the implementation because
its strength is font-axis-only and breaks the texture plane.

### Gap analysis — what is irreducibly bespoke

No framework ships the product's abstract domain semantics; these need in-family authoring
on Phosphor's grid regardless of choice — which is why Phosphor's reproducible grid +
weight axes (versus Tabler's two weights or Material's font-only axes) make ongoing
authoring sustainable:

- **The four abstract tier marks** (declared / structural / temporal / semantic) — bespoke
  product semantics with the hard grayscale-at-14px-by-shape-alone gate. Author all four.
- **The progress ring set** — a parametric primitive (exact arc fills), best as a small
  programmatic component, not static SVGs.
- **`node-feature`** — the deliberately-asymmetric species mark with documented
  redline/collision constraints. Author it.
- **The state set** — partial overlap only (Phosphor has check / archive / warning
  energies); author with Phosphor primitives as base, honoring the active-vs-node-feature
  and broken-bolt collision constraints.

**Adoptable from Phosphor (with a 14px grayscale check):** the doc-type marks and the
event marks (git-commit directly; file-plus / file-text for created/modified; flag-pennant
for lifecycle). **Structural chrome stays on Lucide.**

### Sources

- Lucide github.com/lucide-icons/lucide (`lucide-react@1.18.0`, ISC)
- Phosphor github.com/phosphor-icons/react (`@phosphor-icons/react@2.1.10`, MIT)
- Tabler github.com/tabler/tabler-icons (`@tabler/icons-react@3.44.0`, MIT)
- Radix github.com/radix-ui/icons (`@radix-ui/react-icons@1.3.2`, MIT)
- Heroicons github.com/tailwindlabs/heroicons (`@heroicons/react@2.2.0`, MIT)
- Material Symbols github.com/google/material-design-icons (Apache-2.0)
- Iconoir github.com/iconoir-icons/iconoir (`iconoir-react@7.11.0`, MIT)
- Remix Icon github.com/Remix-Design/RemixIcon (Remix Icon License v1.0 — non-standard)
- Carbon github.com/carbon-design-system/carbon (`@carbon/icons-react@11.82.0`, Apache-2.0)
