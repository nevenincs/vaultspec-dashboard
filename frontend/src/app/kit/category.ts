// Kit category vocabulary (figma-frontend-rewrite W01.P02 — binding Figma kit
// board 135:2). The single mapping from a document category to its bound scene/
// category color token, shared by Chip/Badge and StatusDot so the category color
// is defined exactly once (design-system-is-centralized).
//
// The binding Figma board labels the category chips by the human doc-type vocabulary
// (Decision/Audit/Code/Step/Topic/Summary/Plan/Research). Those map onto the eight
// canonical scene/category tokens emitted on :root (adr/audit/code/exec/feature/
// index/plan/research) — the SAME colors the graph nodes paint with, so a chip and
// its node always agree. The color is consumed via the CSS custom property
// (`var(--color-scene-category-<token>)`); no raw hex is ever typed here.

/** The eight canonical category tokens emitted as --color-scene-category-*. */
export type CategoryToken =
  | "adr"
  | "audit"
  | "code"
  | "exec"
  | "feature"
  | "index"
  | "plan"
  | "research";

/** The Figma-facing category labels (board 135:2 Chip Category variants) plus
 *  the canonical tokens themselves, so callers may pass either vocabulary. */
export type Category =
  | CategoryToken
  | "decision" // → adr
  | "step" // → exec
  | "summary" // → exec
  | "topic"; // → feature

/** Resolve any accepted category label to its canonical scene/category token. */
export function categoryToken(category: Category): CategoryToken {
  switch (category) {
    case "decision":
      return "adr";
    case "step":
    case "summary":
      return "exec";
    case "topic":
      return "feature";
    default:
      return category;
  }
}

/** The CSS custom-property reference for a category's bound color. Used as an
 *  inline style value (`{ color: categoryColorVar(c) }`) so the bound token
 *  drives the fill — never a literal hex. */
export function categoryColorVar(category: Category): string {
  return `var(--color-scene-category-${categoryToken(category)})`;
}
