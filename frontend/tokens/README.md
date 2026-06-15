# Design tokens (DTCG) — the canonical color source

These W3C DTCG token files are the **canonical source of truth** for the dashboard's
color framework. They mirror the OKLCH token tier that currently lives hand-authored in
`frontend/src/styles.css`. The end state (plan phase `W01.P03`) is that the **color**
blocks of `styles.css` are *generated* from these files via Style Dictionary; until that
flip lands, these files are a parity-verified export and `styles.css` remains canonical.

This realizes the `figma-design-bridge` ADR decision: tokens are code-canonical and flow
one way to both the CSS tier and Figma Variables. Figma never holds OKLCH — it receives
the resolved per-mode hex projection. OKLCH stays lossless here in DTCG.

## Files

- `primitives.tokens.json` — intent-free OKLCH ramps (neutral, accent, four tier hues,
  diff hues). Layer 1 of `styles.css`. Not a public surface.
- `semantic.tokens.json` — the semantic role tier (light/default) plus the public
  `--color-*` surface, split into `chrome` (var() aliases) and `scene` (literal hex read
  by the canvas). Layers 2 / 3a / 3b.
- `themes/dark.tokens.json`, `themes/high-contrast.tokens.json` — per-mode overrides of
  the semantic tier and diverging public tokens.
- `resolver.json` — declares the `theme` modifier with `light` / `dark` /
  `high-contrast` modes over the always-on `primitives` + `semantic` sets.

## How a DTCG token maps to a CSS custom property

Every token in the public surface pins its exact CSS variable name and emit mode under
`$extensions["com.vaultspec.css"]`:

- `"emit": "alias"` → `--name: var(--target)` (chrome surface; resolves at runtime so the
  `[data-theme]` remap reaches it).
- `"emit": "hex"` → `--name: #rrggbb` (the scene-read subset; the canvas
  `getComputedStyle` readers parse only `#rrggbb`, so these are literal hex — the HIGH-1
  constraint).
- `"emit": "raw"` → literal `oklch(...)` (the few values that diverge from the tier, e.g.
  `--color-paper-aged`, `--color-state-live`, the accent-pressed steps).

The semantic roles (`--semantic-*`) follow the same convention; primitives emit as
`--primitive-*`. The Style Dictionary format (`W01.P02`) reads these extensions to
reproduce `styles.css` byte-for-byte, which the parity script asserts before the
canonical flip.

## Scope boundary

DTCG owns **color** only. Typography, spacing, shadow, radius, and motion tokens remain
hand-authored in `styles.css` for now (the per-theme shadow remaps in the dark and
high-contrast blocks are deliberately excluded here). The generated output therefore
replaces only the color declarations; the structural integration (a generated color
partial that `styles.css` imports, vs. inlined blocks) is decided in `W01.P02`. Dimension
and type tokens may be promoted into DTCG later if they need to reach Figma as number /
string variables.

## Downstream

- **Code:** `style-dictionary` transforms these into the `:root` + `[data-theme]` CSS and
  the Tailwind `@theme` registration (`W01.P02`). A CI drift gate fails the build when the
  generated CSS diverges from committed output (`W01.P05`).
- **Figma:** Tokens Studio reads the same files (from Git) and writes a Primitives
  collection (one mode) and a Semantic collection (light / dark / high-contrast modes) via
  the Plugin API — no Enterprise REST (`W01.P04`).
