# Token sync between Figma (binding) and code

**Direction (amended 2026-06-16, `figma-parity-reconciliation` ADR).** Figma is now the
**binding source of truth** for the design foundation (see the
`figma-is-the-binding-source-of-truth` rule). The DTCG tokens under `tokens/` are authored
to **match** the binding Figma file across every family — color **and** the non-color
families now closed in the pipeline: **type** (display/title/body/body-strong/label/meta/
caption/mono), **spacing**, **radius** (xs/sm/md/lg/pill), and **elevation**
(raised/overlay/popover). Style Dictionary generates `styles.css` from those tokens, and
scene-read tokens are emitted as literal hex (the `themes-are-oklch` scene seam, unchanged).

The `tokens:figma` push below is retained as a **verification mirror**: it projects the
code tokens back into Figma Variables so the two can be diffed and confirmed in agreement.
It is no longer the originating source projection — when Figma and code disagree, **Figma
wins** and the tokens are corrected to match. Figma cannot store OKLCH, so the export
resolves every value to sRGB hex (verified to match the authored scene hex).

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
