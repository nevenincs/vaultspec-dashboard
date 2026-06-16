// Category colour for the node BODY (graph/Node-items 83:2, graph/Hero 85:2;
// figma-parity-reconciliation W03.P07.S43).
//
// The binding Figma redesign makes each canvas node a PLAIN FILLED CIRCLE
// coloured by document category — one of eight category hues. Colour is the
// on-canvas TYPE channel (size carries salience, the accent ring carries
// selection); the per-doc-type silhouette mark survives only off-canvas for the
// chrome / legend / hover-card via `marks.ts`.
//
// LITERAL-HEX SCENE TOKENS (themes-are-oklch-generated-from-a-token-tier): the
// eight category colours are scene-read CSS custom properties emitted as LITERAL
// HEX (#rrggbb) per theme by the regenerated foundation token file. The scene
// resolves them through getComputedStyle, which does NOT walk a var() chain for a
// custom property in real browsers — so the token MUST be a flat hex, never a
// var() alias. This module owns ONLY the kind -> token-name mapping; the literal-
// hex read goes through the shared `tokenReads` seam (`cssColorNumber`), the one
// home for the getComputedStyle hex-or-fallback discipline.

import { cssColorNumber } from "./tokenReads";

/** The eight sanctioned node categories (Figma graph/Node-items 83:2). */
export type NodeCategory =
  | "feature"
  | "research"
  | "adr"
  | "plan"
  | "exec"
  | "audit"
  | "index"
  | "code";

/**
 * Map a node's `kind` (doc type, or `feature`/`code`) onto one of the eight
 * categories. The vault doc-type vocabulary carries a few kinds outside the eight
 * Figma swatches; they fold onto the nearest category so every node still reads
 * as a category-coloured circle, never an uncoloured one:
 *   - reference -> research (both are grounding / source documents)
 *   - summary   -> index    (both are roll-up / index artefacts)
 *   - rule      -> adr      (a rule is a codified decision)
 * An unknown kind falls back to `code` (the generic artefact swatch) so even the
 * fallback is an in-family category hue, never the bare ink-muted neutral.
 */
export function nodeCategory(kind: string): NodeCategory {
  switch (kind) {
    case "feature":
    case "research":
    case "adr":
    case "plan":
    case "exec":
    case "audit":
    case "index":
    case "code":
      return kind;
    case "reference":
      return "research";
    case "summary":
      return "index";
    case "rule":
      return "adr";
    default:
      return "code";
  }
}

/**
 * Light-theme literal-hex fallbacks for the node test environment (where
 * `document` is undefined and `cssColorNumber` returns the fallback). These
 * MIRROR the `:root` / light `[data-theme]` values for `--color-scene-category-*`
 * in `styles.css`; the live canvas reads the active theme's emitted hex through
 * the token seam. Keeping these in lockstep with the token file is the contract
 * the `categoryColor.test.ts` spot-checks pin.
 */
const CATEGORY_FALLBACK: Record<NodeCategory, number> = {
  feature: 0xb3823c,
  research: 0x4f7a9e,
  adr: 0x8a72b5,
  plan: 0x3f8457,
  exec: 0xb5703f,
  audit: 0x3f9aa6,
  index: 0x8f9a7e,
  code: 0xb05a6b,
};

/**
 * Resolve the node BODY fill colour for a kind, through the scene token seam.
 * Reads `--color-scene-category-<category>` as literal hex for the active theme
 * via getComputedStyle; falls back to the light-theme value in the node test env.
 */
export function categoryColor(kind: string): number {
  const cat = nodeCategory(kind);
  return cssColorNumber(`--color-scene-category-${cat}`, CATEGORY_FALLBACK[cat]);
}
