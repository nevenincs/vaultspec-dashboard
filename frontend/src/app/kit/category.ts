// Kit category vocabulary (figma-frontend-rewrite W01.P02 — binding Figma kit
// board 135:2). The single mapping from a document category to its bound scene/
// category color token, shared by Chip/Badge and StatusDot so the category color
// is defined exactly once (design-system-is-centralized).
//
// The binding Figma board labels the category chips by the human doc-type vocabulary
// (Decision/Audit/Code/Step/Feature/Summary/Plan/Research/Reference). Those map onto
// the canonical scene/category tokens emitted on :root (adr/audit/code/exec/feature/
// plan/reference/research). For the seven graph-node categories the chip and its node
// share the SAME bound color, so they always agree. `code` is the one exception: it is
// a chip / Files / search-result category only — `code` artefacts are NOT knowledge-
// graph nodes (excluded at the engine projection and dropped in `adaptGraphSlice`), and
// the scene node colour/glyph vocabulary (`categoryColor`/`glyphAtlas`) carries no
// `code`. So a Code chip has no graph-node counterpart by design. The color is consumed
// via the CSS custom property (`var(--color-scene-category-<token>)`); no raw hex here.
//
// `index` is deliberately NOT a category, on ANY surface (chip, badge, node, viewer):
// `.vault/index` feature-index documents are metanodes the engine drops at ingest
// (index-node-exclusion ADR), a strictly-ignored element. There is no index category
// token, color, or chip anywhere in the dashboard.

import type { MessageDescriptor } from "../../platform/localization/message";
import { DOC_TYPE_PRESENTATION } from "../../stores/server/docTypeVocabulary";

/** The canonical category tokens emitted as --color-scene-category-*. */
export type CategoryToken =
  | "adr"
  | "audit"
  | "code"
  | "exec"
  | "feature"
  | "plan"
  | "reference"
  | "research";

/** The stable raw category order. Presentation never changes these identities. */
export const CATEGORY_TOKENS = Object.freeze([
  "adr",
  "audit",
  "code",
  "exec",
  "feature",
  "plan",
  "reference",
  "research",
] as const) satisfies readonly CategoryToken[];

export interface CategoryPresentation<Id extends CategoryToken = CategoryToken> {
  readonly id: Id;
  readonly label: MessageDescriptor;
}

type CategoryPresentationMap = Readonly<{
  [Id in CategoryToken]: CategoryPresentation<Id>;
}>;

const CODE_LABEL = Object.freeze({
  key: "documents:categories.code",
} satisfies MessageDescriptor<"documents:categories.code">);
const FEATURE_LABEL = Object.freeze({
  key: "features:labels.feature",
} satisfies MessageDescriptor<"features:labels.feature">);

/** Exhaustive localized presentation, kept separate from raw category identity. */
export const CATEGORY_PRESENTATION = Object.freeze({
  adr: Object.freeze({ id: "adr", label: DOC_TYPE_PRESENTATION.adr.label }),
  audit: Object.freeze({ id: "audit", label: DOC_TYPE_PRESENTATION.audit.label }),
  code: Object.freeze({ id: "code", label: CODE_LABEL }),
  exec: Object.freeze({ id: "exec", label: DOC_TYPE_PRESENTATION.exec.label }),
  feature: Object.freeze({ id: "feature", label: FEATURE_LABEL }),
  plan: Object.freeze({ id: "plan", label: DOC_TYPE_PRESENTATION.plan.label }),
  reference: Object.freeze({
    id: "reference",
    label: DOC_TYPE_PRESENTATION.reference.label,
  }),
  research: Object.freeze({
    id: "research",
    label: DOC_TYPE_PRESENTATION.research.label,
  }),
} as const satisfies CategoryPresentationMap);

/** Resolve presentation only for an exact canonical raw identity. */
export function categoryPresentation(value: unknown): CategoryPresentation | null {
  return value === "adr" ||
    value === "audit" ||
    value === "code" ||
    value === "exec" ||
    value === "feature" ||
    value === "plan" ||
    value === "reference" ||
    value === "research"
    ? CATEGORY_PRESENTATION[value]
    : null;
}

/** The Figma-facing category labels (board 135:2 Chip Category variants) plus
 *  the canonical tokens themselves, so callers may pass either vocabulary. */
export type Category =
  | CategoryToken
  | "decision" // → adr
  | "step" // → exec
  | "summary"; // → exec

/** Resolve any accepted category label to its canonical scene/category token. */
export function categoryToken(category: Category): CategoryToken {
  switch (category) {
    case "decision":
      return "adr";
    case "step":
    case "summary":
      return "exec";
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
