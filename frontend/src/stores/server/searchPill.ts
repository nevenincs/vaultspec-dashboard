// The search-result PILL view (figma SearchResultPill set 650:1790) — the stores-
// layer projection a `SearchResult` renders as in the Cmd-K search surface. It is
// the pill counterpart of `deriveSearchResultRowView` (the right-rail row): both are
// pure, tiers-free presentation derivations, but the pill obeys the UX simplicity
// law set on the binding Figma frames — show the ANSWER, hide the MECHANISM. The
// face carries exactly four things: a plain colour-coded TYPE WORD, the TITLE, a
// one-line WHY, and (for docs) the feature tag. The relevance score, commit hash,
// file encoding, lifecycle status, and the semantic-vs-text-match distinction are
// deliberately NOT projected onto the pill face (they stay backend context).
//
// Layer law: pure over its inputs, no fetch, no raw `tiers` read — the chrome
// `SearchResultPill` component renders this verbatim.

import type { SearchResultEntity } from "../../platform/actions/entity";
import { docTypeLabel } from "./docTypeVocabulary";
import type { SearchResult } from "./engine";
import { searchResultSpecies, type SearchResultSpecies } from "./searchController";

// The eight canonical scene/category tokens emitted on :root as
// --color-scene-category-* — the SAME colours the graph nodes and the kit Chip/
// StatusDot paint with (centralised in app/kit/category). The bound colour is
// referenced here as the css custom property string only (no raw hex, no upward
// import into the app layer): the stores layer decides WHICH category a result is,
// and the css variable carries the colour. Mirrors `categoryColorVar`.
type CategoryToken =
  | "adr"
  | "audit"
  | "code"
  | "exec"
  | "feature"
  | "plan"
  | "reference"
  | "research";

function categoryColorVar(token: CategoryToken): string {
  return `var(--color-scene-category-${token})`;
}

export interface SearchPillView {
  result: SearchResult;
  /** Stable key (node id where present) so a re-rank does not thrash the list. */
  key: string;
  nodeId: string | null;
  species: SearchResultSpecies;
  /** The plain, colour-coded type WORD (Research / Decision / Code / Change / …). */
  typeWord: string;
  /** The bound category colour for the type word, as an inline-style css var. */
  typeColorVar: string;
  /** The human title (prettified doc name, code filename, or change subject). */
  title: string;
  /** Code titles/lines render in the mono family (figma JetBrains Mono variant). */
  titleMono: boolean;
  /** The one-line WHY: a doc dek, a code line, or a change's relative date. */
  why: string | null;
  whyMono: boolean;
  /** Doc feature tag (`#feature`) for the trailing chip; null for code/change. */
  featureTag: string | null;
  selectable: boolean;
  ariaLabel: string;
  entity: SearchResultEntity;
}

// The plain type WORD per vault doc-type is read from the ONE canonical doc-type
// vocabulary (terminology-standardization ADR D1) — never a per-surface map. Unknown
// doc-types fall back to a Title-cased form inside `docTypeLabel`. (UX simplicity
// law: never the raw `adr`/`exec` codes.)

// The bound scene/category colour per doc-type (the SAME colour the graph node
// paints with, via the centralised category vocabulary). `reference` now has its
// own bound `scene/category-reference` token (ADR D3).
const DOC_TYPE_CATEGORY: Record<string, CategoryToken> = {
  research: "research",
  adr: "adr",
  plan: "plan",
  audit: "audit",
  exec: "exec",
  reference: "reference",
  feature: "feature",
};

function capitalize(word: string): string {
  return word.length > 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

/** Prettify a vault stem into a human title: drop the ISO date prefix and the
 *  trailing doc-type word, turn dashes into spaces, and capitalise. Lossless
 *  enough to stay honest (it only strips the date and the type suffix the pill's
 *  own type word already shows). */
export function prettifyStem(stem: string): string {
  let s = stem.replace(/^\d{4}-\d{2}-\d{2}-/, "");
  s = s.replace(/-(adr|research|plan|audit|exec|reference|index|summary)$/i, "");
  s = s.replace(/-/g, " ").trim();
  return s.length > 0 ? capitalize(s) : stem;
}

/** The final path segment of a path (the filename). */
function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

/** Clean the rag wire's H1 `title` into a plain human title. Vault H1s follow the
 *  `\`{feature}\` {type}: \`{title}\`` convention, so the backtick-wrapped segment
 *  after the colon is the human title; other titles just shed their backticks. */
export function cleanWireTitle(raw: string): string {
  const m = raw.match(/:\s*`([^`]+)`/);
  const base = m ? m[1] : raw.replace(/`/g, "");
  return base.trim();
}

/** The vault stem from a `doc:{stem}` node id. */
function stemFromDocNodeId(nodeId: string): string {
  return nodeId.startsWith("doc:") ? nodeId.slice(4) : nodeId;
}

/** The filename from a `code:{path}[#symbol]` node id. */
function fileFromCodeNodeId(nodeId: string): string {
  const withoutPrefix = nodeId.startsWith("code:") ? nodeId.slice(5) : nodeId;
  const withoutSymbol = withoutPrefix.split("#")[0];
  return basename(withoutSymbol);
}

/** A coarse human relative-date from an ISO date, e.g. "3 days ago" (inlined to
 *  keep this stores/server module free of a stores/view dependency). */
export function pillRelativeDate(
  iso: string | undefined,
  now: number = Date.now(),
): string | undefined {
  if (!iso) return undefined;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return undefined;
  const deltaMs = Math.max(0, now - then);
  const day = 86_400_000;
  const days = Math.floor(deltaMs / day);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? "1 month ago" : `${months} months ago`;
  const years = Math.floor(days / 365);
  return years === 1 ? "1 year ago" : `${years} years ago`;
}

interface PillFace {
  typeWord: string;
  typeColorVar: string;
  title: string;
  titleMono: boolean;
  why: string | null;
  whyMono: boolean;
  featureTag: string | null;
}

function deriveFace(
  result: SearchResult,
  species: SearchResultSpecies,
  nodeId: string | null,
): PillFace {
  const excerpt = result.excerpt?.trim() ? result.excerpt.trim() : null;
  const wireTitle = result.title?.trim() ? cleanWireTitle(result.title) : null;
  if (species === "code") {
    return {
      typeWord: "Code",
      typeColorVar: categoryColorVar("code"),
      // Figma code pill title = the filename (mono). Prefer the stable node-id path.
      title: nodeId ? fileFromCodeNodeId(nodeId) : (wireTitle ?? "code"),
      titleMono: true,
      why: excerpt,
      whyMono: true,
      featureTag: null,
    };
  }
  if (species === "commit") {
    const when = pillRelativeDate(result.date);
    return {
      typeWord: "Change",
      // The "Change" word reads in the single muted accent (figma accent/base).
      typeColorVar: "var(--color-accent)",
      title: wireTitle ?? (nodeId ? nodeId.replace(/^commit:/, "") : "change"),
      titleMono: false,
      why: when ?? excerpt,
      whyMono: false,
      featureTag: null,
    };
  }
  // Doc (and unknown, which renders a neutral generic pill).
  const docType = result.doc_type?.trim().toLowerCase() ?? "";
  const typeWord =
    species === "doc" ? (docType ? docTypeLabel(docType) : "Document") : "Result";
  const category: CategoryToken =
    species === "doc" ? (DOC_TYPE_CATEGORY[docType] ?? "feature") : "feature";
  // Prefer the wire H1 title; fall back to a prettified node-id stem (the identity),
  // never the `source` corpus name.
  const title =
    wireTitle ??
    (nodeId ? prettifyStem(stemFromDocNodeId(nodeId)) : prettifyStem(result.source));
  return {
    typeWord,
    typeColorVar:
      species === "doc" ? categoryColorVar(category) : "var(--color-ink-faint)",
    title,
    titleMono: false,
    why: excerpt,
    whyMono: false,
    featureTag: result.feature?.trim() ? `#${result.feature.trim()}` : null,
  };
}

export function deriveSearchPillView(
  result: SearchResult,
  index: number,
  scope: string | null,
): SearchPillView {
  const nodeId = result.node_id;
  const species = searchResultSpecies(nodeId);
  const face = deriveFace(result, species, nodeId);
  const selectable = nodeId !== null;
  return {
    result,
    key: nodeId ?? `${result.source}:${index}`,
    nodeId,
    species,
    typeWord: face.typeWord,
    typeColorVar: face.typeColorVar,
    title: face.title,
    titleMono: face.titleMono,
    why: face.why,
    whyMono: face.whyMono,
    featureTag: face.featureTag,
    selectable,
    ariaLabel: selectable
      ? `${face.typeWord}: ${face.title}`
      : `${face.typeWord}: ${face.title}, no graph node — not selectable`,
    entity: {
      kind: "search-result",
      id: nodeId ?? result.source,
      scope,
      source: result.source,
      nodeId: nodeId ?? undefined,
      score: result.score,
      isCode: species === "code",
    },
  };
}

export function deriveSearchPillViews(
  results: readonly SearchResult[],
  scope: string | null,
): SearchPillView[] {
  return results.map((result, index) => deriveSearchPillView(result, index, scope));
}
