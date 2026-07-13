// Auto-split from queries.ts (module-decomposition mandate, 2026-07-12).
// Domain submodule of the queries barrel; see ./index.ts.

import {
  EngineError,
  engineClient,
  readTierAvailability,
  tiersFromQuery,
  type ContentResponse,
  type ContentTruncated,
  type TierAvailability,
} from "../engine";
import { docNodeIdFromStem } from "../liveAdapters";
import {
  deriveEditorialTitle,
  sanitizeHeadingText,
  sanitizeReaderBody,
} from "../markdownSanitize";
import { parseDocument, type Frontmatter } from "../parseDocument";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { isAddressableNode, normalizeNodeScopedRequestIdentity } from "./graph";
import { engineKeys } from "./internal";

// --- read-only content fetch (review-rail-viewers ADR) ---------------------------
//
// The viewer backend's wire seam, consumed through these stores hooks so the
// markdown reader and the code viewer (chrome) never fetch the engine or read the
// raw `tiers` block (dashboard-layer-ownership: stores is the sole wire client of
// `/nodes/{id}/content`). The content query is BOUNDED at creation per
// bounded-by-default-for-every-accumulator: an explicit `gcTime` evicts an
// unobserved entry promptly, and `maxPages`-style cache pressure is bounded by the
// per-observer single-entry shape (one open viewer holds one content entry) plus
// the prompt gcTime — the viewer never accumulates every opened file's bytes for
// the session. Disabled until a node is actually open (`nodeId === null` =
// nothing to read), following the `useNodeDetail` enabled-on-id pattern.

/** How long an unobserved content entry survives in cache before garbage
 *  collection (bounded-by-default-for-every-accumulator). 60s is generous for the
 *  back-and-forth of reading a few documents while keeping a long review session
 *  from retaining the bytes of every file ever opened — the prompt eviction is the
 *  bound, since each content entry can be up to MAX_CONTENT_BYTES. */
const CONTENT_GC_TIME = 60_000;

/**
 * The read-only content fetch for one document/file node (review-rail-viewers
 * ADR), the SOLE wire client of `/nodes/{id}/content`. Keyed by (scope, nodeId);
 * disabled when either is null (no node open / no worktree resolved yet). Bounded:
 * an explicit `gcTime` evicts the (potentially MAX_CONTENT_BYTES) entry soon after
 * the viewer closes, so a long session does not retain every opened file's bytes.
 */
export function useNodeContent(nodeId: unknown, scope: unknown) {
  const request = normalizeNodeScopedRequestIdentity(scope, nodeId);
  const enabled = request.scope !== null && isAddressableNode(request.nodeId);
  const query = useQuery({
    queryKey: engineKeys.content(request.scope ?? "", request.nodeId ?? ""),
    queryFn: () => engineClient.content(request.nodeId!, request.scope ?? undefined),
    enabled,
    gcTime: CONTENT_GC_TIME,
  });
  return enabled ? query : { ...query, data: undefined };
}

/**
 * The interpreted content view the markdown reader and the code viewer render. A
 * single shape both viewers consume: `loading` while in flight, `degraded` read
 * from the served `tiers` block (the `structural` tier the content read resolves
 * through), `errored` for a tiers-less transport fault (distinct from degraded),
 * `truncated` carrying the honest byte-cap block, and the content fields when
 * served. The viewers consume this, never `content.data.tiers`.
 */
export interface ContentView extends TierAvailability {
  /** The content query is in flight with no held content. */
  loading: boolean;
  /** A genuine transport failure (no tiers-bearing envelope) — distinct from degraded. */
  errored: boolean;
  /**
   * The engine answered 404 — there is no readable document at this node id in the
   * READ scope (per-tab-scope-binding). Distinct from `errored` (a transport fault)
   * and from an empty document: the file genuinely is not in this workspace, so the
   * viewer renders a designed "not in this workspace" state, never a blank body.
   * Optional like `path`/`blobHash`: `deriveContentView` always sets it, and a
   * fixture that omits it reads as "not a 404" (undefined is falsy).
   */
  notFound?: boolean;
  /** The served repo-relative path, when available. */
  path?: string;
  /** The git-style blob oid of the served bytes, when available. */
  blobHash?: string;
  /** The path-derived highlighter grammar hint; null when none applies. */
  languageHint: string | null;
  /** The (possibly truncated) UTF-8 text; empty while loading/degraded/errored. */
  text: string;
  /** The honest byte-cap block when the body was truncated; null otherwise. */
  truncated: ContentTruncated | null;
  /** True iff the engine answered with content (vs loading/degraded/errored). */
  available: boolean;
}

// The content read is resolved by the engine's STRUCTURAL read of the worktree
// substrate, so the `structural` tier gates content availability (contract §2).
const CONTENT_TIERS = ["structural"] as const;

/**
 * Derive the content view from a content query's data + error + pending flags,
 * reading the served `tiers` block ONLY here in the stores layer so the viewers
 * consume interpreted truth, never the raw block. Degradation is read from the
 * `tiers` block (success data, OR a FRESH error envelope's tiers winning over a
 * stale held-success block via `tiersFromQuery` —
 * degradation-is-read-from-tiers-not-guessed-from-errors). A served block that
 * marks `structural` unavailable — or omits it — is designed degradation
 * (contract §2: absence ≠ available); a tiers-less transport fault is the errored
 * branch, NOT degradation. While degraded the (possibly stale) text is not shown
 * as current; the viewer renders the degraded notice.
 */
export function deriveContentView(
  data: ContentResponse | undefined,
  error: unknown,
  loading: boolean,
): ContentView {
  const tiers = tiersFromQuery({ data, error });
  const availability = readTierAvailability(tiers, CONTENT_TIERS);
  // A tiers-less transport fault (no envelope) is the errored branch; a
  // tiers-bearing error or a degraded served block is designed degradation.
  const errored =
    error instanceof EngineError ? error.tiers === undefined : error != null;
  // A 404 is the "no readable content in this scope" answer — the document is not
  // in the read scope. Rendered as a distinct designed state, never a blank body.
  const notFound = error instanceof EngineError && error.status === 404;
  const available =
    !loading && !errored && !availability.degraded && data !== undefined;
  return {
    ...availability,
    loading,
    errored,
    notFound,
    path: data?.path,
    blobHash: data?.blob_hash,
    languageHint: data?.language_hint ?? null,
    text: availability.degraded || errored ? "" : (data?.text ?? ""),
    truncated: data?.truncated ?? null,
    available,
  };
}

/**
 * Stores hook: the content view for one open document/file node, read through the
 * content query so the markdown reader and the code viewer consume interpreted
 * state (loading / degraded / errored / truncated / content) instead of fetching
 * themselves or reading the raw `tiers` block.
 */
export function useContentView(nodeId: unknown, scope: unknown): ContentView {
  const request = normalizeNodeScopedRequestIdentity(scope, nodeId);
  const enabled = request.scope !== null && isAddressableNode(request.nodeId);
  const query = useNodeContent(nodeId, scope);
  const loading = enabled && query.isPending;
  // Memoize the derived view so it is referentially STABLE across renders where the
  // query state is unchanged. deriveContentView returns a fresh object each call; a
  // fresh ContentView every render churns every consumer that derives further state
  // from it (the markdown editor's frontmatter properties) and feeds the
  // getSnapshot/effect-dependency loops the stable-selector discipline prevents.
  return useMemo(
    () => deriveContentView(query.data, query.error ?? null, loading),
    [query.data, query.error, loading],
  );
}

export type ViewerStateTone = "faint" | "muted" | "broken";

export interface CodeViewerView {
  /** The designed surface state the code viewer renders. */
  state: "loading" | "errored" | "degraded" | "empty" | "missing" | "ready";
  /** Placeholder copy for non-ready states. */
  stateMessage: string | null;
  /** Placeholder tone for non-ready states. */
  stateTone: ViewerStateTone;
  /** Placeholder ink class for non-ready states. */
  stateToneClass: string;
  /** Text passed to the tokenizer; blank outside the ready state. */
  text: string;
  /** Raw, 1:1 source lines for the virtualized line list. */
  rawLines: string[];
  /** Served repo-relative path for the header. */
  path?: string;
  /** Highlighter grammar hint for the tokenizer and language badge. */
  languageHint: string | null;
  /** Honest byte-cap marker shown only with ready content. */
  truncated: ContentTruncated | null;
  /** Header affordance label for the display-only code viewer. */
  readOnlyLabel: string;
  /** Render-ready byte-cap receipt, null when the content is not truncated. */
  truncationMessage: string | null;
}

function codeViewerTruncationMessage(
  truncated: ContentTruncated | null,
): string | null {
  if (truncated === null) return null;
  return `Truncated to the first ${truncated.returned_bytes.toLocaleString("en-US")} of ${truncated.total_bytes.toLocaleString("en-US")} bytes — open the file directly for the full contents.`;
}

function viewerStateToneClass(tone: ViewerStateTone): string {
  if (tone === "broken") return "text-state-broken";
  if (tone === "muted") return "text-ink-muted";
  return "text-ink-faint";
}

/**
 * Derive the code viewer's render model from the tiers-interpreted content view.
 * The app renders virtualization/highlighting chrome; stores owns state
 * classification, degradation copy, and which bytes are safe to tokenize.
 */
export function deriveCodeViewerView(content: ContentView): CodeViewerView {
  const base = {
    text: "",
    rawLines: [] as string[],
    path: content.path,
    languageHint: null,
    truncated: null,
    readOnlyLabel: "read-only",
    truncationMessage: null,
  };
  if (content.loading) {
    const stateTone: ViewerStateTone = "faint";
    return {
      ...base,
      state: "loading",
      stateMessage: "Loading file...",
      stateTone,
      stateToneClass: viewerStateToneClass(stateTone),
    };
  }
  // A 404 in the read scope is a distinct designed state (per-tab-scope-binding): the
  // file is not in this workspace, never a blank body. Checked before `errored` so a
  // tiers-less 404 still lands here rather than the generic transport-error copy.
  if (content.notFound) {
    const stateTone: ViewerStateTone = "muted";
    return {
      ...base,
      state: "missing",
      stateMessage: "This file isn't in this workspace.",
      stateTone,
      stateToneClass: viewerStateToneClass(stateTone),
    };
  }
  if (content.errored) {
    const stateTone: ViewerStateTone = "broken";
    return {
      ...base,
      state: "errored",
      stateMessage: "The file could not be loaded.",
      stateTone,
      stateToneClass: viewerStateToneClass(stateTone),
    };
  }
  if (content.degraded) {
    const reason = content.reasons.structural;
    const stateTone: ViewerStateTone = "muted";
    return {
      ...base,
      state: "degraded",
      stateMessage: `File unavailable${reason ? `: ${reason}` : ""}.`,
      stateTone,
      stateToneClass: viewerStateToneClass(stateTone),
    };
  }
  if (!content.available || content.text.length === 0) {
    const stateTone: ViewerStateTone = "faint";
    return {
      ...base,
      state: "empty",
      stateMessage: "This file is empty.",
      stateTone,
      stateToneClass: viewerStateToneClass(stateTone),
    };
  }

  const text = content.text;
  const stateTone: ViewerStateTone = "faint";
  return {
    state: "ready",
    stateMessage: null,
    stateTone,
    stateToneClass: viewerStateToneClass(stateTone),
    text,
    rawLines: text.replace(/\n$/, "").split("\n"),
    path: content.path,
    languageHint: content.languageHint,
    truncated: content.truncated,
    readOnlyLabel: "read-only",
    truncationMessage: codeViewerTruncationMessage(content.truncated),
  };
}

type MarkdownHeaderCategory = "adr" | "audit" | "exec" | "plan" | "research";

export interface MarkdownHeaderView {
  /** The document title rendered by the viewer header. */
  title: string;
  /** The path trail leading to the document, derived from the served path. */
  trail?: Array<{ label: string }>;
  /** The design-system category token for the document type, when one is bound. */
  category?: MarkdownHeaderCategory;
  /** The raw document type label shown in the chip. */
  categoryLabel?: string;
  /** Frontmatter metadata rows shown by the viewer header. */
  meta?: Array<{ label: string; value: string }>;
}

const MARKDOWN_HEADER_DOC_TYPE_CATEGORY: Record<string, MarkdownHeaderCategory> = {
  research: "research",
  adr: "adr",
  plan: "plan",
  exec: "exec",
  audit: "audit",
};

function markdownHeaderDocType(path: string | undefined, stem: string): string | null {
  if (path) {
    const match = /(?:^|\/)\.vault\/([^/]+)\//.exec(path);
    if (match) return match[1] ?? null;
  }
  const suffix = /-(research|adr|plan|exec|audit|reference)$/.exec(stem);
  return suffix ? (suffix[1] ?? null) : null;
}

function markdownHeaderTitle(stem: string): string {
  return stem.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/-/g, " ") || stem;
}

/**
 * Derive the binding document-header view for an open markdown document from the
 * already-served content view. Pure: no fetch, no app chrome dependency, and no
 * direct renderer callback. The caller adds close/navigation intent.
 */
export function deriveMarkdownHeaderView(
  nodeId: string,
  content: ContentView,
): MarkdownHeaderView {
  const stem = nodeId.replace(/^doc:/, "");
  const docType = markdownHeaderDocType(content.path, stem);
  const category =
    docType === null ? undefined : MARKDOWN_HEADER_DOC_TYPE_CATEGORY[docType];
  const { frontmatter } = parseDocument(content.text);

  const trail = content.path
    ? content.path
        .split("/")
        .slice(0, -1)
        .filter(Boolean)
        .map((label) => ({ label }))
    : undefined;

  const meta: MarkdownHeaderView["meta"] = [];
  if (typeof frontmatter?.date === "string") {
    meta.push({ label: "created", value: frontmatter.date });
  }
  if (typeof frontmatter?.modified === "string") {
    meta.push({ label: "modified", value: frontmatter.modified });
  }

  return {
    title: markdownHeaderTitle(stem),
    trail,
    category,
    categoryLabel: docType ?? undefined,
    meta: meta.length > 0 ? meta : undefined,
  };
}

export interface MarkdownReaderView {
  /** The designed reader state the app renders. */
  state: "loading" | "errored" | "degraded" | "empty" | "missing" | "ready";
  /** Placeholder copy for non-ready states. */
  stateMessage: string | null;
  /** Placeholder tone for non-ready states. */
  stateTone: ViewerStateTone;
  /** Placeholder ink class for non-ready states. */
  stateToneClass: string;
  /** Structured frontmatter chrome, null when the document has no visible metadata. */
  frontmatter: FrontmatterHeaderView | null;
  /** Reader meta status from frontmatter, if present. */
  status: string | null;
  /** Markdown body with the leading frontmatter fence removed. */
  body: string;
  /** Editorial header/footer projection rendered by the reader app chrome. */
  editorial: MarkdownReaderEditorialView;
  /** Honest byte-cap marker shown only with ready content. */
  truncated: ContentTruncated | null;
  /** Render-ready byte-cap receipt, null when the content is not truncated. */
  truncationMessage: string | null;
}

export type FrontmatterTagCategory =
  | "adr"
  | "audit"
  | "exec"
  | "feature"
  | "plan"
  | "research";

export interface FrontmatterTagView {
  /** Display text including the leading hash. */
  label: string;
  /** Design-system category token when the tag names one. */
  category?: FrontmatterTagCategory;
}

export interface FrontmatterDateView {
  label: "created" | "modified";
  value: string;
}

export interface FrontmatterRelatedView {
  stem: string;
  nodeId: string;
}

export interface FrontmatterHeaderView {
  tags: FrontmatterTagView[];
  dates: FrontmatterDateView[];
  related: FrontmatterRelatedView[];
}

export interface MarkdownReaderEyebrowView {
  label: string;
  category: FrontmatterTagCategory;
}

export interface MarkdownReaderEditorialView {
  title: string | null;
  dek: string | null;
  body: string;
  eyebrow: MarkdownReaderEyebrowView | null;
  meta: string[];
  footerTags: FrontmatterTagView[];
  related: FrontmatterRelatedView[];
}

const DOCTYPE_EYEBROW: Partial<Record<FrontmatterTagCategory, string>> = {
  adr: "Decision",
  audit: "Audit",
  exec: "Step",
  plan: "Plan",
  research: "Research",
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const FRONTMATTER_TAG_CATEGORIES = new Set<FrontmatterTagCategory>([
  "adr",
  "audit",
  "exec",
  "feature",
  "plan",
  "research",
]);

function frontmatterTagView(tag: string): FrontmatterTagView {
  const label = `#${tag}`;
  if (FRONTMATTER_TAG_CATEGORIES.has(tag as FrontmatterTagCategory)) {
    return { label, category: tag as FrontmatterTagCategory };
  }
  return { label };
}

export function deriveFrontmatterHeaderView(
  frontmatter: Frontmatter | null,
): FrontmatterHeaderView | null {
  if (!frontmatter) return null;
  const tags = frontmatter.tags.map(frontmatterTagView);
  const dates: FrontmatterDateView[] = [];
  if (frontmatter.date !== undefined) {
    dates.push({ label: "created", value: frontmatter.date });
  }
  if (frontmatter.modified !== undefined) {
    dates.push({ label: "modified", value: frontmatter.modified });
  }
  const related = frontmatter.related.map((stem) => ({
    stem,
    nodeId: docNodeIdFromStem(stem),
  }));
  if (tags.length === 0 && dates.length === 0 && related.length === 0) {
    return null;
  }
  return { tags, dates, related };
}

function markdownReaderEyebrow(
  frontmatter: FrontmatterHeaderView | null,
): MarkdownReaderEyebrowView | null {
  if (!frontmatter) return null;
  for (const tag of frontmatter.tags) {
    const label = tag.category ? DOCTYPE_EYEBROW[tag.category] : undefined;
    if (tag.category && label) return { label, category: tag.category };
  }
  return null;
}

function markdownReaderFooterTags(
  frontmatter: FrontmatterHeaderView | null,
): FrontmatterTagView[] {
  return (
    frontmatter?.tags.filter(
      (tag) => !(tag.category && DOCTYPE_EYEBROW[tag.category]),
    ) ?? []
  );
}

function formatReaderLongDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const [, year, month, day] = match;
  return `${Number(day)} ${MONTHS[Number(month) - 1] ?? month} ${year}`;
}

function markdownReaderReadingMinutes(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function splitMarkdownReaderEditorialBody(body: string): {
  title: string | null;
  dek: string | null;
  rest: string;
} {
  const lines = body.split("\n");
  let index = 0;
  while (index < lines.length && lines[index].trim() === "") index += 1;
  let title: string | null = null;
  const heading = /^#\s+(.+?)\s*$/.exec(lines[index] ?? "");
  if (heading) {
    // Reduce the H1 to a clean editorial title: markdown stripped, the
    // `{feature} {doctype}:` template prefix and `| (status: …)` metadata removed
    // (both surface elsewhere — the eyebrow and the meta line), capitalized.
    title = deriveEditorialTitle(heading[1]);
    index += 1;
  }
  while (index < lines.length && lines[index].trim() === "") index += 1;
  let dek: string | null = null;
  const next = lines[index]?.trim() ?? "";
  const isProse = next !== "" && !/^(#{1,6}\s|[-*>|]|\d+\.\s|```)/.test(next);
  if (title && isProse) {
    const dekLines: string[] = [];
    while (index < lines.length && lines[index].trim() !== "") {
      dekLines.push(lines[index].trim());
      index += 1;
    }
    // The dek is also rendered as a raw string (italic chrome), so strip any
    // inline markdown from it for the same no-noise plain-text guarantee.
    dek = sanitizeHeadingText(dekLines.join(" "));
  }
  return { title, dek, rest: lines.slice(index).join("\n").replace(/^\n+/, "") };
}

function markdownReaderTruncationMessage(
  truncated: ContentTruncated | null,
): string | null {
  if (truncated === null) return null;
  return `Truncated to the first ${truncated.returned_bytes.toLocaleString("en-US")} of ${truncated.total_bytes.toLocaleString("en-US")} bytes — open the file directly for the full document.`;
}

function deriveMarkdownReaderEditorialView(
  body: string,
  frontmatter: FrontmatterHeaderView | null,
  status: string | null,
): MarkdownReaderEditorialView {
  const split = splitMarkdownReaderEditorialBody(body);
  const date = formatReaderLongDate(
    frontmatter?.dates.find((entry) => entry.label === "created")?.value,
  );
  const meta = [
    date,
    `${markdownReaderReadingMinutes(split.rest)} min read`,
    status,
  ].filter((part): part is string => Boolean(part));
  return {
    title: split.title,
    dek: split.dek,
    body: split.rest,
    eyebrow: markdownReaderEyebrow(frontmatter),
    meta,
    footerTags: markdownReaderFooterTags(frontmatter),
    related: frontmatter?.related ?? [],
  };
}

/**
 * Derive the markdown reader's document model from the already-served content
 * view. The reader renders this projection, while navigation click intent stays
 * in app chrome.
 */
export function deriveMarkdownReaderView(content: ContentView): MarkdownReaderView {
  const base = {
    frontmatter: null,
    status: null,
    body: "",
    editorial: deriveMarkdownReaderEditorialView("", null, null),
    truncated: null,
    truncationMessage: null,
  };
  if (content.loading) {
    const stateTone: ViewerStateTone = "faint";
    return {
      ...base,
      state: "loading",
      stateMessage: "Loading document…",
      stateTone,
      stateToneClass: viewerStateToneClass(stateTone),
    };
  }
  // A 404 in the read scope is a distinct designed state (per-tab-scope-binding): the
  // document is not in this workspace, never a blank body. Checked before `errored`
  // so a tiers-less 404 still lands here rather than the generic transport-error copy.
  if (content.notFound) {
    const stateTone: ViewerStateTone = "muted";
    return {
      ...base,
      state: "missing",
      stateMessage: "This document isn't in this workspace.",
      stateTone,
      stateToneClass: viewerStateToneClass(stateTone),
    };
  }
  if (content.errored) {
    const stateTone: ViewerStateTone = "broken";
    return {
      ...base,
      state: "errored",
      stateMessage: "The document could not be loaded.",
      stateTone,
      stateToneClass: viewerStateToneClass(stateTone),
    };
  }
  if (content.degraded) {
    const reason = content.reasons.structural;
    const stateTone: ViewerStateTone = "muted";
    return {
      ...base,
      state: "degraded",
      stateMessage: `Document unavailable${reason ? `: ${reason}` : ""}.`,
      stateTone,
      stateToneClass: viewerStateToneClass(stateTone),
    };
  }
  if (!content.available || content.text.length === 0) {
    const stateTone: ViewerStateTone = "faint";
    return {
      ...base,
      state: "empty",
      stateMessage: "This document is empty.",
      stateTone,
      stateToneClass: viewerStateToneClass(stateTone),
    };
  }
  const parsed = parseDocument(content.text);
  const frontmatter = deriveFrontmatterHeaderView(parsed.frontmatter);
  const status = parsed.frontmatter?.status ?? null;
  const stateTone: ViewerStateTone = "faint";
  // Read-mode sanitization (no-noise editorial directive): strip HTML comments and
  // reduce every heading to plain text before the reader renders the body.
  const readerBody = sanitizeReaderBody(parsed.body);
  return {
    state: "ready",
    stateMessage: null,
    stateTone,
    stateToneClass: viewerStateToneClass(stateTone),
    frontmatter,
    status,
    body: readerBody,
    editorial: deriveMarkdownReaderEditorialView(readerBody, frontmatter, status),
    truncated: content.truncated,
    truncationMessage: markdownReaderTruncationMessage(content.truncated),
  };
}
