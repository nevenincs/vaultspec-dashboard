// Category colour for the node BODY (graph/Node-items 83:2, graph/Hero 85:2;
// figma-parity-reconciliation W03.P07.S43).
//
// The binding Figma redesign makes each canvas node a PLAIN FILLED CIRCLE
// coloured by document category — one of seven category hues (`code` and `index`
// are NOT graph-node categories; see the NodeCategory doc below). Colour is the
// on-canvas TYPE channel (size carries salience, the accent ring carries
// selection); the per-doc-type silhouette mark survives only off-canvas for the
// chrome / legend / hover-card via `marks.ts`.
//
// LITERAL-HEX SCENE TOKENS (themes-are-oklch-generated-from-a-token-tier): the
// seven category colours are scene-read CSS custom properties emitted as LITERAL
// HEX (#rrggbb) per theme by the regenerated foundation token file. The scene
// resolves them through getComputedStyle, which does NOT walk a var() chain for a
// custom property in real browsers — so the token MUST be a flat hex, never a
// var() alias. This module owns ONLY the kind -> token-name mapping; the literal-
// hex read goes through the shared `tokenReads` seam (`cssColorNumber`), the one
// home for the getComputedStyle hex-or-fallback discipline.

import { cssColorNumber } from "./tokenReads";

/** The sanctioned node categories (Figma graph/Node-items 83:2), plus `reference`
 *  (terminology-standardization ADR D3). `code` and `index` are NOT scene node
 *  categories: `code` artefacts and `.vault/index` feature-index documents are never
 *  knowledge-graph nodes (code excluded at the engine projection, index dropped at
 *  ingest), so neither is ever painted on the canvas. The Files/search surface keeps
 *  its own `code` colour token; this scene module no longer references it. */
export type NodeCategory =
  | "feature"
  | "research"
  | "adr"
  | "plan"
  | "exec"
  | "audit"
  | "reference";

/**
 * Map a node's `kind` (doc type, or `feature`/`code`) onto a category. The vault
 * doc-type vocabulary carries a few kinds outside the Figma swatches; they fold
 * onto the nearest category so every displayed node still reads as a category-
 * coloured circle:
 *   - reference -> reference (its own bound colour, ADR D3)
 *   - summary   -> exec      (a summary is an exec document — a Phase Summary of
 *                             execution records under `.vault/exec/`; the prior
 *                             summary->index mapping was the metanode confusion the
 *                             index-node-exclusion ADR corrects)
 *   - rule      -> adr       (a rule is a codified decision)
 *
 * It ALSO accepts the wire node SPECIES (`kind`) for nodes that carry no doc
 * type, so a caller can pass `docType ?? kind` and still land on a category:
 *   - plan-container -> plan (a plan's structural wave/phase/step rows)
 *
 * DEFAULT: an unmapped kind falls back to the `reference` swatch so a stray or
 * diagnostic node still paints a colour instead of crashing. `code` and `index`
 * never reach a displayed knowledge node (index dropped at ingest, code excluded at
 * the engine projection), so this fallback is defensive only.
 */
export function nodeCategory(kind: string): NodeCategory {
  switch (kind) {
    case "feature":
    case "research":
    case "adr":
    case "plan":
    case "exec":
    case "audit":
    case "reference":
      return kind;
    case "summary":
      return "exec";
    case "rule":
      return "adr";
    // Wire node-species fallback (a node with no doc_type): map onto the nearest
    // category so the species still paints a legend colour.
    case "plan-container":
      return "plan";
    default:
      return "reference";
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
  reference: 0x9d5e86,
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
