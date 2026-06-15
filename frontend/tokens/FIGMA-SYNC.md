# Pushing the token tier into Figma (one-way, code -> Figma)

Figma is a **mirror**, never the source of truth (figma-design-bridge ADR). Tokens are
authored as DTCG under `tokens/`; this push projects them into Figma Variables. Figma
cannot store OKLCH, so the export resolves every value to sRGB hex (verified to match the
authored scene hex). Re-run after any token change; never edit colors in Figma.

## What gets pushed

`npm run tokens:figma` regenerates `tokens/figma/tokens.json` (Tokens Studio format):

- set `primitives` -> a **Primitives** collection (one mode), hex values.
- sets `semantic-light` / `semantic-dark` / `semantic-high-contrast` -> a **Semantic**
  collection with **Light / Dark / High Contrast** modes, aliasing the primitives where
  the source does, else a resolved hex.
- `$themes` binds each mode for Tokens Studio's variable export.

## Live steps (Tokens Studio, no Enterprise REST needed)

1. In the **Figma desktop app**, open (or create) the dashboard design file.
2. Install the **Tokens Studio for Figma** plugin (free tier is enough for a local
   import + variable export).
3. In the plugin: **Tools -> Load from file/folder** (or paste) and select
   `frontend/tokens/figma/tokens.json`. The four sets and three themes appear.
4. Open **Themes**, confirm Light / Dark / High Contrast each enable `primitives`
   (as source) + their `semantic-*` set.
5. **Export -> Create Variables** (Styles & Variables). Tokens Studio writes the
   Primitives collection and the Semantic collection with the three modes via the
   Plugin API.
6. Verify: the Semantic collection shows three modes; spot-check a few values against
   `tokens/figma/tokens.json` (e.g. `semantic.surface.base` aliases `primitive.neutral.50`;
   dark `public.scene.canvas-bg` = `#1a1713`).

The read-only Figma MCP (`get_variable_defs`, `get_metadata`) can confirm the variables
landed once they exist.
