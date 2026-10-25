// Pure presentation data for a search result. Internal ranking and transport
// details remain outside the user-facing projection.

import type { SearchResultEntity } from "../../platform/actions/entity";
import type { MessageDescriptor } from "../../platform/localization/message";
import { DOCUMENT_TYPE_MESSAGES, docTypePresentation } from "./docTypeVocabulary";
import type { SearchResult } from "./engine";
import type { SearchProviderEntry } from "./searchProviders";
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
  /** Stable key (node id where present) so a re-rank does not thrash the list. */
  key: string;
  nodeId: string | null;
  species: SearchResultSpecies;
  /** The plain, colour-coded type WORD (Research / Decision / Code / Change / …). */
  typeWord: MessageDescriptor;
  /** The bound category colour for the type word, as an inline-style css var. */
  typeColorVar: string;
  /** The authored title, or a localized safe fallback. */
  title: string | MessageDescriptor;
  /** Code titles and lines render in the mono family. */
  titleMono: boolean;
  /** The one-line WHY: a doc dek, a code line, or a change's relative date. */
  why: string | SearchPillRelativeDate | null;
  whyMono: boolean;
  /** Doc feature tag (`#feature`) for the trailing chip; null for code/change. */
  featureTag: string | null;
  /** Exact authored excerpt available to a generic expanded preview. */
  preview: string | null;
  selectable: boolean;
  entity: SearchResultEntity;
}

export interface SearchPillRelativeDate {
  readonly kind: "relative-date";
  readonly unit: "day" | "month" | "year";
  readonly value: number;
}

export const SEARCH_PILL_MESSAGES = {
  change: { key: "common:searchPalette.labels.change" },
  code: { key: "common:searchPalette.labels.code" },
  result: { key: "common:searchPalette.labels.result" },
  unavailableTitle: { key: "common:searchPalette.labels.untitledResult" },
} as const satisfies Record<string, MessageDescriptor>;

// Document types share the canonical document vocabulary and category colors.
const DOC_TYPE_CATEGORY: Record<string, CategoryToken> = {
  research: "research",
  adr: "adr",
  plan: "plan",
  audit: "audit",
  exec: "exec",
  reference: "reference",
  feature: "feature",
};

/** A coarse human relative-date from an ISO date, e.g. "3 days ago" (inlined to
 *  keep this stores/server module free of a stores/view dependency). */
export function pillRelativeDate(
  iso: string | undefined,
  now: number = Date.now(),
): SearchPillRelativeDate | undefined {
  if (!iso) return undefined;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return undefined;
  const deltaMs = Math.max(0, now - then);
  const day = 86_400_000;
  const days = Math.floor(deltaMs / day);
  if (days <= 0) return { kind: "relative-date", unit: "day", value: 0 };
  if (days < 30) return { kind: "relative-date", unit: "day", value: -days };
  const months = Math.floor(days / 30);
  if (months < 12) return { kind: "relative-date", unit: "month", value: -months };
  const years = Math.floor(days / 365);
  return { kind: "relative-date", unit: "year", value: -years };
}

interface PillFace {
  typeWord: MessageDescriptor;
  typeColorVar: string;
  title: string | MessageDescriptor;
  titleMono: boolean;
  why: string | SearchPillRelativeDate | null;
  whyMono: boolean;
  featureTag: string | null;
}

function deriveFace(result: SearchResult, species: SearchResultSpecies): PillFace {
  const excerpt = result.excerpt?.length ? result.excerpt : null;
  const wireTitle = result.title?.length ? result.title : null;
  if (species === "code") {
    return {
      typeWord: SEARCH_PILL_MESSAGES.code,
      typeColorVar: categoryColorVar("code"),
      title: wireTitle ?? SEARCH_PILL_MESSAGES.unavailableTitle,
      titleMono: true,
      why: excerpt,
      whyMono: true,
      featureTag: null,
    };
  }
  if (species === "commit") {
    const when = pillRelativeDate(result.date);
    return {
      typeWord: SEARCH_PILL_MESSAGES.change,
      typeColorVar: "var(--color-accent)",
      title: wireTitle ?? SEARCH_PILL_MESSAGES.unavailableTitle,
      titleMono: false,
      why: when ?? excerpt,
      whyMono: false,
      featureTag: null,
    };
  }
  // Doc (and unknown, which renders a neutral generic pill).
  const docType = result.doc_type?.trim().toLowerCase() ?? "";
  const typeWord =
    species === "doc"
      ? (docTypePresentation(docType)?.label ?? DOCUMENT_TYPE_MESSAGES.document)
      : SEARCH_PILL_MESSAGES.result;
  const category: CategoryToken =
    species === "doc" ? (DOC_TYPE_CATEGORY[docType] ?? "feature") : "feature";
  const title = wireTitle ?? SEARCH_PILL_MESSAGES.unavailableTitle;
  return {
    typeWord,
    typeColorVar:
      species === "doc" ? categoryColorVar(category) : "var(--color-ink-faint)",
    title,
    titleMono: false,
    why: excerpt,
    whyMono: false,
    featureTag: result.feature?.length ? result.feature : null,
  };
}

export function deriveSearchPillView(
  result: SearchResult,
  index: number,
  scope: string | null,
): SearchPillView {
  const nodeId = result.node_id;
  const species = searchResultSpecies(nodeId);
  const face = deriveFace(result, species);
  const selectable = nodeId !== null;
  return {
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
    preview: result.excerpt?.length ? result.excerpt : null,
    selectable,
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

export function deriveSearchPillViewsFromProviderEntries(
  entries: readonly SearchProviderEntry[],
  scope: string | null,
): SearchPillView[] {
  return deriveSearchPillViews(
    entries.map((entry) => entry.result),
    scope,
  );
}
