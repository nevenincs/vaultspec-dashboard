# Design tokens (DTCG) — Figma-binding implementation layer

The binding Figma file `SlhonORmySdoSMTQgDWw3w` is the source of truth for dashboard
foundation values. These W3C DTCG files are the implementation layer that preserves the
project's OKLCH generation mechanism, emits CSS for the app, and produces Tokens Studio
output for Figma verification.

When Figma and code disagree, update these files to match the binding Figma foundation
while preserving the semantic tier and scene-read literal-hex contract. Figma cannot
store OKLCH, so this layer keeps OKLCH lossless and projects resolved per-mode hex where
Figma needs it.

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

DTCG owns the foundation families mirrored into code from binding Figma: color, type,
spacing, radius, and elevation. Motion remains outside this token set. The scene-read
subset continues to emit literal hex because the canvas readers parse resolved custom
properties directly.

## Downstream

- **Code:** `style-dictionary` transforms these into the `:root` + `[data-theme]` CSS and
  the Tailwind `@theme` registration (`W01.P02`). A CI drift gate fails the build when the
  generated CSS diverges from committed output (`W01.P05`).
- **Figma:** Tokens Studio reads the generated `tokens/figma/tokens.json` and writes or
  verifies the Primitives, Semantic, and foundation collections in the live binding file.
