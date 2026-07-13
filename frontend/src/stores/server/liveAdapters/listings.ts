// Auto-split from liveAdapters.ts (module-decomposition mandate, 2026-07-12).
// Domain submodule of the liveAdapters barrel; see ./index.ts.

import { normalizeNodeId } from "../../nodeIds";
import type {
  CodeFileEntry,
  CodeFilesResponse,
  CodeFilesTruncation,
  ContentResponse,
  ContentTruncated,
  EngineNode,
  FileTreeEntry,
  FileTreeResponse,
  FileTreeTruncated,
  FsListEntry,
  FsListResponse,
  GraphSlice,
  NodeDetail,
  NodeEvidence,
  SearchIndexState,
  SearchResponse,
  CodeFilesDeltaResponse,
  RowDeltaResponse,
  TiersBlock,
  VaultTreeDeltaResponse,
  VaultTreeEntry,
  VaultTreeResponse,
} from "../engine";
import {
  codeNodeIdFromPath,
  deriveSearchNodeId,
  stemFromPath,
} from "./historyIdentity";
import { isRec } from "./internal";

/**
 * Live `/search` serves rag's FLAT annotated HTTP envelope (rag-integration-
 * hardening D1): `results` sits at the TOP level (already unwrapped from the §2
 * `{data, tiers}` wrapper by `unwrapEnvelope`), each item carrying rag's real
 * per-hit vocabulary (path/stem/source, score, `snippet`/excerpt/text, and the
 * species-specific metadata), plus the engine's `node_id` value-add. The
 * envelope also carries rag's forwarded `index_state` freshness block and the
 * engine-annotated `semantic_epoch`. Map result items tolerantly and derive the
 * graph node id from a stem/path only when the engine annotation is absent — the
 * annotation gap is a flagged divergence, not silently papered. There is ONE
 * shape: the older nested CLI-subprocess envelope is retired (no bridge).
 */
export const SEARCH_RESULTS_MAX_ITEMS = 256;
export const SEARCH_RESULT_IDENTITY_MAX_CHARS = 2048;
export const SEARCH_RESULT_EXCERPT_MAX_CHARS = 4096;

function normalizeSearchResultString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= SEARCH_RESULT_IDENTITY_MAX_CHARS
    ? normalized
    : undefined;
}

function normalizeSearchResultExcerpt(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (normalized.length === 0) return undefined;
  return normalized.length <= SEARCH_RESULT_EXCERPT_MAX_CHARS
    ? normalized
    : normalized.slice(0, SEARCH_RESULT_EXCERPT_MAX_CHARS);
}

function normalizeSearchResultScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, value));
}

/** A code result's 1-based line endpoint: a finite, non-negative integer, else
 *  undefined (rag emits `null` for vault hits). */
function normalizeSearchResultLine(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const n = Math.trunc(value);
  return n >= 0 ? n : undefined;
}

/** An `index_state` count field: a finite, non-negative integer, else undefined
 *  (a malformed or absent count never poisons the freshness block). */
function normalizeSearchCount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const n = Math.trunc(value);
  return n >= 0 ? n : undefined;
}

/**
 * The shared D4 semantic epoch the engine annotates on a `/search` success
 * (rag-integration-hardening D3). Three distinct served truths, preserved:
 * a finite non-negative number is the warm epoch; an explicit `null` is the
 * engine's HONEST absent marker (a cold/failed cache read — freshness unknown,
 * never fabricated); anything else (field absent, non-number) is `undefined` —
 * the wire carried no epoch at all (the degraded path emits none). `null` and
 * `undefined` are NOT collapsed: one is "known-unknown", the other "not served".
 */
function normalizeSearchEpoch(
  present: boolean,
  value: unknown,
): number | null | undefined {
  if (!present) return undefined;
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const n = Math.trunc(value);
  return n >= 0 ? n : undefined;
}

/** rag's `index_state` freshness block → the internal `SearchIndexState`,
 *  forwarded verbatim (engine-read-and-infer — no engine staleness semantics),
 *  every field normalized tolerantly and dropped when malformed/absent. Returns
 *  undefined when no field survives (a sparse or absent block). */
function adaptSearchIndexState(value: unknown): SearchIndexState | undefined {
  if (!isRec(value)) return undefined;
  const state = pickDefined({
    source: normalizeSearchResultString(value.source),
    indexed_count: normalizeSearchCount(value.indexed_count),
    vault_count: normalizeSearchCount(value.vault_count),
    code_count: normalizeSearchCount(value.code_count),
    indexed_target_root: normalizeSearchResultString(value.indexed_target_root),
    requested_target_root: normalizeSearchResultString(value.requested_target_root),
    target_matches:
      typeof value.target_matches === "boolean" ? value.target_matches : undefined,
    status: normalizeSearchResultString(value.status),
  });
  return Object.keys(state).length > 0 ? state : undefined;
}

/** Drop `undefined` entries so only present fields ride the optional wire shape. */
function pickDefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(obj) as (keyof T)[]) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}

function adaptSearchResult(item: unknown): SearchResponse["results"][number] | null {
  if (!isRec(item)) return null;
  const score = normalizeSearchResultScore(item.score);
  if (score === null) return null;
  const nodeId = normalizeNodeId(item.node_id) ?? undefined;
  const sourceValue = normalizeSearchResultString(item.source);
  const pathValue = normalizeSearchResultString(item.path);
  const stemValue = normalizeSearchResultString(item.stem);
  const source = sourceValue ?? pathValue ?? stemValue;
  if (source === undefined) return null;
  // rag's short preview field is `snippet`; `excerpt`/`text` are tolerated aliases.
  const excerpt =
    normalizeSearchResultExcerpt(item.snippet) ??
    normalizeSearchResultExcerpt(item.excerpt) ??
    normalizeSearchResultExcerpt(item.text);
  const normalizedItem: Record<string, unknown> = {
    ...item,
    ...(nodeId !== undefined ? { node_id: nodeId } : { node_id: undefined }),
    ...(sourceValue !== undefined ? { source: sourceValue } : { source: undefined }),
    ...(pathValue !== undefined ? { path: pathValue } : { path: undefined }),
    ...(stemValue !== undefined ? { stem: stemValue } : { stem: undefined }),
  };
  // The rag wire carries rich, species-specific metadata the rich pills render
  // (vault: doc_type/feature/date; code: language/line range/symbol). The engine
  // forwards it verbatim (rag-client `forward_search`); carry it through tolerantly
  // and bounded so the view layer can read it without a second fetch. Only defined
  // fields are emitted, mirroring the optional wire shape.
  const rich = pickDefined({
    title: normalizeSearchResultString(item.title),
    rerank_text: normalizeSearchResultExcerpt(item.rerank_text),
    doc_type: normalizeSearchResultString(item.doc_type),
    feature: normalizeSearchResultString(item.feature),
    date: normalizeSearchResultString(item.date),
    language: normalizeSearchResultString(item.language),
    line_start: normalizeSearchResultLine(item.line_start),
    line_end: normalizeSearchResultLine(item.line_end),
    node_type: normalizeSearchResultString(item.node_type),
    function_name: normalizeSearchResultString(item.function_name),
    class_name: normalizeSearchResultString(item.class_name),
  });
  return {
    score,
    source,
    ...(excerpt !== undefined ? { excerpt } : {}),
    ...rich,
    node_id: deriveSearchNodeId(normalizedItem),
  };
}

export function adaptSearch(body: unknown): SearchResponse {
  if (!isRec(body)) return body as never;
  // The flat annotated shape (rag-integration-hardening D1): `results` at the
  // top level, adapted per hit. The old nested `{envelope:{data:{results}}}`
  // CLI-subprocess shape is retired — search rides the resident HTTP service, so
  // there is exactly one shape and no discriminating bridge.
  const rawResults = Array.isArray(body.results) ? body.results : [];
  const results: SearchResponse["results"] = [];
  for (const item of rawResults) {
    const result = adaptSearchResult(item);
    if (result === null) continue;
    results.push(result);
    if (results.length >= SEARCH_RESULTS_MAX_ITEMS) break;
  }
  // Freshness (D3): rag's `index_state` forwarded verbatim and the engine's
  // annotated `semantic_epoch` passed through as served truth. Both are optional
  // and only emitted when present, so a degraded/empty search (no freshness on
  // the wire) carries neither rather than a fabricated block.
  const indexState = adaptSearchIndexState(body.index_state);
  const epoch = normalizeSearchEpoch("semantic_epoch" in body, body.semantic_epoch);
  return {
    results,
    tiers: (body.tiers ?? {}) as TiersBlock,
    ...(indexState !== undefined ? { index_state: indexState } : {}),
    ...(epoch !== undefined ? { semantic_epoch: epoch } : {}),
  };
}

/** Stem-suffix doc-type derivation (matches the vault naming convention).
 *  `.index` (`.vault/index` feature-index) stems get NO special doc-type — they
 *  are strictly-ignored metanodes (index-node-exclusion ADR), never categorized as
 *  an `index` type; they fall through to the generic `document`. */
export function docTypeFromStem(stem: string): string {
  if (/-W\d+-P\d+-S\d+$|-P\d+-S\d+$|-S\d+$|-summary$/.test(stem)) return "exec";
  const match = /-(research|adr|plan|exec|audit|reference)$/.exec(stem);
  if (match) return match[1];
  return "document";
}

function normalizeVaultTreeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeVaultTreeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of value) {
    const normalized = normalizeVaultTreeString(entry);
    if (normalized === undefined || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

/** Normalize a served vault-tree date to a comparable, day-granular ISO string
 *  ("YYYY-MM-DD"). The engine serves `created`/`stamped` as ISO date strings but
 *  `modified` as EPOCH MILLIS (a number), so a string is reduced to its day part
 *  and a finite number is coerced through `Date` to the same ISO day. This makes
 *  every entry date directly comparable with the timeline's `date_range` bounds
 *  (also `YYYY-MM-DD`), keyed by the active `date_field` criterion — without this,
 *  the old string-only normalizer DROPPED the numeric `modified`, and the rail's
 *  date narrow then excluded EVERY entry whenever a range was active (Issue #38). */
function normalizeVaultTreeDate(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) return undefined;
    return trimmed.length >= 10 ? trimmed.slice(0, 10) : trimmed;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
  }
  return undefined;
}

function adaptVaultTreeDates(value: unknown): VaultTreeEntry["dates"] {
  if (!isRec(value)) return {};
  const out: VaultTreeEntry["dates"] = {};
  const created = normalizeVaultTreeDate(value.created);
  const modified = normalizeVaultTreeDate(value.modified);
  const stamped = normalizeVaultTreeDate(value.stamped);
  if (created !== undefined) out.created = created;
  if (modified !== undefined) out.modified = modified;
  if (stamped !== undefined) out.stamped = stamped;
  return out;
}

function normalizeVaultTreeProgress(
  value: unknown,
): VaultTreeEntry["progress"] | undefined {
  if (!isRec(value)) return undefined;
  if (
    typeof value.done !== "number" ||
    typeof value.total !== "number" ||
    !Number.isFinite(value.done) ||
    !Number.isFinite(value.total)
  ) {
    return undefined;
  }
  const done = Math.floor(value.done);
  const total = Math.floor(value.total);
  if (done < 0 || total <= 0 || done > total) return undefined;
  return { done, total };
}

/** Ingest-measured document weight (left-rail-tree-controls ADR D2): kept only
 *  when BOTH fields are finite non-negative numbers; anything malformed is
 *  dropped whole so the rail never renders a half-true weight. */
function normalizeVaultTreeSize(value: unknown): VaultTreeEntry["size"] | undefined {
  if (!isRec(value)) return undefined;
  if (
    typeof value.bytes !== "number" ||
    typeof value.words !== "number" ||
    !Number.isFinite(value.bytes) ||
    !Number.isFinite(value.words)
  ) {
    return undefined;
  }
  const bytes = Math.floor(value.bytes);
  const words = Math.floor(value.words);
  if (bytes < 0 || words < 0) return undefined;
  return { bytes, words };
}

function adaptVaultTreeEntry(value: unknown): VaultTreeEntry | null {
  if (!isRec(value)) return null;
  const path = normalizeVaultTreeString(value.path);
  const stem =
    normalizeVaultTreeString(value.stem) ?? (path ? stemFromPath(path) : undefined);
  if (stem === undefined) return null;
  const docType = normalizeVaultTreeString(value.doc_type) ?? docTypeFromStem(stem);
  const entryPath =
    path ?? `.vault/${docType === "document" ? "doc" : docType}/${stem}.md`;
  const status = normalizeVaultTreeString(value.status);
  const tier = normalizeVaultTreeString(value.tier);
  const title = normalizeVaultTreeString(value.title);
  const progress = normalizeVaultTreeProgress(value.progress);
  const size = normalizeVaultTreeSize(value.size);
  return {
    path: entryPath,
    doc_type: docType,
    feature_tags: normalizeVaultTreeStringList(value.feature_tags),
    dates: adaptVaultTreeDates(value.dates),
    ...(title !== undefined ? { title } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(tier !== undefined ? { tier } : {}),
    ...(progress !== undefined ? { progress } : {}),
    ...(size !== undefined ? { size } : {}),
  };
}

/** A tolerant non-negative integer read for the engine graph generation: a
 *  non-finite / non-number / negative field reads as undefined (unknown baseline),
 *  so a shape drift degrades to a full re-drain rather than a bogus delta baseline. */
function normalizeGeneration(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : undefined;
}

/** Live stem/node_id tree entries → the internal path-bearing entries. Absorbs the
 *  optional `generation` (vault-tree-delta ADR D1) so the drained listing carries
 *  its delta baseline. */
export function adaptVaultTree(body: unknown): VaultTreeResponse {
  if (!isRec(body) || !Array.isArray(body.entries)) {
    return body as VaultTreeResponse;
  }
  const entries = body.entries
    .map(adaptVaultTreeEntry)
    .filter((entry): entry is VaultTreeEntry => entry !== null);
  const generation = normalizeGeneration(body.generation);
  return {
    entries,
    tiers: (body.tiers ?? {}) as TiersBlock,
    ...(generation !== undefined ? { generation } : {}),
  };
}

/** Live `/…/delta` → the internal delta shape (vault-tree-delta ADR D3), KEY-GENERIC
 *  over the row entry type via `adaptEntry` (vault: stem rows; code: path rows).
 *  TOLERANT and FAIL-SAFE: an unusable body, an absent generation, or a
 *  `full_required` flag all resolve to a full-drain instruction rather than a
 *  partial patch, so a shape drift can never corrupt the held listing. `changed`
 *  rows are adapted like full listing rows; `removed` is a plain key list. */
export function adaptRowDelta<Entry>(
  body: unknown,
  adaptEntry: (value: unknown) => Entry | null,
): RowDeltaResponse<Entry> {
  if (!isRec(body)) {
    return { generation: 0, full_required: true, tiers: {} };
  }
  const tiers = (body.tiers ?? {}) as TiersBlock;
  const generation = normalizeGeneration(body.generation);
  // No usable generation, or an explicit instruction: fall back to a full drain.
  if (generation === undefined || body.full_required === true) {
    return { generation: generation ?? 0, full_required: true, tiers };
  }
  const changed = Array.isArray(body.changed)
    ? body.changed.map(adaptEntry).filter((entry): entry is Entry => entry !== null)
    : [];
  const removed = Array.isArray(body.removed)
    ? body.removed.filter((key): key is string => typeof key === "string")
    : [];
  const since = normalizeGeneration(body.since);
  return {
    generation,
    changed,
    removed,
    tiers,
    ...(since !== undefined ? { since } : {}),
  };
}

/** Live `/vault-tree/delta` → the stem-keyed delta (D3). */
export function adaptVaultTreeDelta(body: unknown): VaultTreeDeltaResponse {
  return adaptRowDelta(body, adaptVaultTreeEntry);
}

/** Live `/code-files/delta` → the path-keyed delta (D3, /code-files follow-on). */
export function adaptCodeFilesDelta(body: unknown): CodeFilesDeltaResponse {
  return adaptRowDelta(body, adaptCodeFileEntry);
}

// --- /code-files: the complete code-file listing (search-providers ADR) ----------
//
// Tolerant adapter for the drained `/code-files` walk. Every field defaults to a
// safe empty so a sparse or older shape NEVER throws: a row missing its `path` is
// dropped (a code hit with no path is unnavigable), a missing `node_id` is
// reconstructed from the path (the files-only `code:{path}` identity), and the
// walk-cap `truncated` block is passed through only when it is a well-formed
// honesty record (null otherwise — absence reads as completeness, never a guess).

function adaptCodeFileEntry(value: unknown): CodeFileEntry | null {
  if (!isRec(value)) return null;
  const path = normalizeVaultTreeString(value.path);
  if (path === undefined) return null;
  const nodeId = normalizeVaultTreeString(value.node_id) ?? `code:${path}`;
  const title = normalizeVaultTreeString(value.title);
  const lang = normalizeVaultTreeString(value.lang);
  return {
    path,
    node_id: nodeId,
    ...(title !== undefined ? { title } : {}),
    ...(lang !== undefined ? { lang } : {}),
  };
}

function adaptCodeFilesTruncation(value: unknown): CodeFilesTruncation | null {
  if (!isRec(value)) return null;
  const returned = value.returned_files;
  const reason = normalizeVaultTreeString(value.reason);
  if (
    typeof returned !== "number" ||
    !Number.isFinite(returned) ||
    reason === undefined
  ) {
    return null;
  }
  return { returned_files: Math.max(0, Math.floor(returned)), reason };
}

/** Live code-file rows → the internal complete listing. Fail-closed to an empty
 *  listing (never a throw) when the shape is unrecognized, preserving any tiers
 *  block so degradation truth still rides through. */
export function adaptCodeFiles(body: unknown): CodeFilesResponse {
  if (!isRec(body) || !Array.isArray(body.entries)) {
    return {
      entries: [],
      tiers: (isRec(body) ? (body.tiers ?? {}) : {}) as TiersBlock,
      truncated: null,
    };
  }
  const entries = body.entries
    .map(adaptCodeFileEntry)
    .filter((entry): entry is CodeFileEntry => entry !== null);
  // The serving code `generation` (vault-tree-delta ADR /code-files follow-on) is
  // absorbed like the vault tree's, passed through verbatim. The truncated-corpus
  // baseline DROP happens downstream: the client walk omits its resolved
  // generation on a truncated/straddled listing, and the reconcile spec re-checks
  // `truncated == null` — so a capped listing never becomes a delta baseline.
  const generation = normalizeGeneration(body.generation);
  return {
    entries,
    tiers: (body.tiers ?? {}) as TiersBlock,
    truncated: adaptCodeFilesTruncation(body.truncated),
    ...(generation !== undefined ? { generation } : {}),
  };
}

// --- §3 code (worktree) file tree (dashboard-code-tree ADR) ----------------------
//
// Tolerant adapter for `GET /file-tree`. The live `{data, tiers, next_cursor?}`
// envelope is already unwrapped by `unwrapEnvelope` before this runs (with the
// top-level `next_cursor` preserved onto the flat body); a body already in the
// internal shape (the mock) passes through unchanged — the one-code-path
// property. Every missing field defaults to a safe empty so a sparse or older
// shape NEVER throws and the chrome never reads the raw tiers block (the
// degradation truth rides on `tiers`, defaulted to an empty block when absent).

function normalizeFileTreeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeFileTreeCount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.floor(value);
}

/** Default one child wire row, tolerating an absent or partial object: a missing
 *  path is malformed and dropped; an unknown/absent `kind` defaults to `file`
 *  (never wrongly shown expandable); `has_children` is true only for directories;
 *  and a missing `node_id` is derived from the canonical `code:{path}` rule. */
function adaptFileTreeEntry(value: unknown): FileTreeEntry | null {
  if (!isRec(value)) return null;
  const path = normalizeFileTreeString(value.path);
  if (path === undefined) return null;
  const kind = value.kind === "dir" ? "dir" : "file";
  const nodeId = normalizeNodeId(value.node_id) ?? codeNodeIdFromPath(path);
  return {
    path,
    kind,
    has_children: kind === "dir" && value.has_children === true,
    node_id: nodeId,
  };
}

/** Default the truncated honesty block: forwarded only when the engine capped the
 *  level (a real object with the three fields); null/absent stays null. */
function adaptFileTreeTruncated(value: unknown): FileTreeTruncated | null {
  const totalChildren = isRec(value)
    ? normalizeFileTreeCount(value.total_children)
    : undefined;
  const returnedChildren = isRec(value)
    ? normalizeFileTreeCount(value.returned_children)
    : undefined;
  const reason = isRec(value) ? normalizeFileTreeString(value.reason) : undefined;
  if (
    totalChildren !== undefined &&
    returnedChildren !== undefined &&
    reason !== undefined
  ) {
    return {
      total_children: totalChildren,
      returned_children: returnedChildren,
      reason,
    };
  }
  return null;
}

/** Live `/file-tree` → the internal file-tree response. TOLERANT: an absent
 *  `entries` array defaults to empty (the code mode renders its empty/degraded
 *  state from the tiers block), and `truncated`/`next_cursor` default to
 *  null/undefined. */
export function adaptFileTree(body: unknown): FileTreeResponse {
  if (!isRec(body)) {
    return { entries: [], path: "", truncated: null, tiers: {} };
  }
  return {
    entries: Array.isArray(body.entries)
      ? body.entries
          .map(adaptFileTreeEntry)
          .filter((entry): entry is FileTreeEntry => entry !== null)
      : [],
    path: normalizeFileTreeString(body.path) ?? "",
    truncated: adaptFileTreeTruncated(body.truncated),
    next_cursor: normalizeFileTreeString(body.next_cursor),
    tiers: (body.tiers ?? {}) as TiersBlock,
  };
}

// --- filesystem browse picker (single-app-runtime ADR O6) -----------------------
//
// Tolerant adapter for `GET /fs/list`. The live `{data, tiers}` envelope is
// already unwrapped by `unwrapEnvelope` before this runs; a body already in the
// internal shape (the mock) passes through unchanged. Every missing field
// defaults to a safe empty so a sparse or malformed shape NEVER throws — the
// picker degrades to an empty, non-truncated level rather than crashing the
// add-project dialog.

function adaptFsListEntry(value: unknown): FsListEntry | null {
  if (!isRec(value)) return null;
  const name = normalizeFileTreeString(value.name);
  const path = normalizeFileTreeString(value.path);
  if (name === undefined || path === undefined) return null;
  return {
    name,
    path,
    is_managed: value.is_managed === true,
    is_git: value.is_git === true,
  };
}

/** Live `/fs/list` → the internal listing. TOLERANT: an absent `entries` array
 *  defaults to empty, `path`/`parent` default to null (the filesystem-roots
 *  shape), and `truncated` defaults to false. */
export function adaptFsList(body: unknown): FsListResponse {
  if (!isRec(body)) {
    return { path: null, parent: null, entries: [], truncated: false, tiers: {} };
  }
  return {
    path: normalizeFileTreeString(body.path) ?? null,
    parent: normalizeFileTreeString(body.parent) ?? null,
    entries: Array.isArray(body.entries)
      ? body.entries
          .map(adaptFsListEntry)
          .filter((entry): entry is FsListEntry => entry !== null)
      : [],
    truncated: body.truncated === true,
    tiers: (body.tiers ?? {}) as TiersBlock,
  };
}

// --- §4 read-only content fetch (review-rail-viewers ADR) ------------------------
//
// Tolerant adapter for `GET /nodes/{id}/content`. The live `{data, tiers}`
// envelope is already unwrapped by `unwrapEnvelope` before this runs; a body
// already in the internal shape (the mock) passes through unchanged — the
// one-code-path property. Every missing field defaults to a safe empty so a
// sparse or older shape NEVER throws and the viewer reads degraded state from the
// `tiers` block (defaulted to an empty block when absent), never from a thrown
// adapter. The `blob_hash` is the content-addressing key the bounded cache uses.

/** Default the content truncation block: forwarded only when the engine capped
 *  the body (a real object with the three fields); null/absent stays null. */
function adaptContentTruncated(value: unknown): ContentTruncated | null {
  if (
    isRec(value) &&
    typeof value.total_bytes === "number" &&
    typeof value.returned_bytes === "number" &&
    typeof value.reason === "string"
  ) {
    return {
      total_bytes: value.total_bytes,
      returned_bytes: value.returned_bytes,
      reason: value.reason,
    };
  }
  return null;
}

/** Live `/nodes/{id}/content` → the internal content response. TOLERANT: an
 *  absent body yields an empty text with an empty tiers block (the viewer renders
 *  its degraded/empty state from the tiers truth), and `language_hint`/`truncated`
 *  default to null. */
export function adaptContent(body: unknown): ContentResponse {
  if (!isRec(body)) {
    return {
      path: "",
      blob_hash: "",
      byte_len: 0,
      language_hint: null,
      text: "",
      truncated: null,
      tiers: {},
    };
  }
  const text = typeof body.text === "string" ? body.text : "";
  return {
    path: typeof body.path === "string" ? body.path : "",
    blob_hash: typeof body.blob_hash === "string" ? body.blob_hash : "",
    byte_len: typeof body.byte_len === "number" ? body.byte_len : text.length,
    language_hint: typeof body.language_hint === "string" ? body.language_hint : null,
    text,
    truncated: adaptContentTruncated(body.truncated),
    tiers: (body.tiers ?? {}) as TiersBlock,
  };
}

// --- §4 node detail: flatten the {detail:{bundle}} wire ----------------------------
//
// The live `/nodes/{id}` route serves `{data:{detail:{bundle:{node, edges_by_tier,
// neighbors, degree_by_tier}}, summary?}, tiers}` (the orchestration-era context
// bundle, unchanged since the first serve-mode front door). The internal
// `NodeDetail` shape the stores layer consumes is FLAT — `{node, summary?, tiers}` —
// so this adapter bridges the nested wire into it (the tolerant one-code-path
// discipline of `adaptContent`): a mock/already-flat body whose `node` is at the
// top level passes through unchanged. Without this bridge `useNodeDetailView` reads
// `data.node` off the nested body, finds `undefined`, and degrades EVERY node to
// `unavailable` — the latent mock-mirrors-live divergence the injected-literal tests
// never exercised. `summary` is the lazy first-prose-line the route fills for doc
// nodes (absent for synthesized feature nodes); the hover card renders it when
// present and omits it otherwise.

/** Live `/nodes/{id}` → the internal flat `NodeDetail`. TOLERANT: an absent/odd
 *  shape yields an empty tiers block and an undefined node, so the consuming view
 *  reads degraded state from the tiers truth rather than a thrown adapter. */
export function adaptNodeDetail(body: unknown): NodeDetail {
  const rec = isRec(body) ? body : {};
  const detail = isRec(rec.detail) ? rec.detail : undefined;
  const bundle = detail && isRec(detail.bundle) ? detail.bundle : undefined;
  // Flat (mock / test fixture) node wins; else the nested context-bundle node.
  const node = (isRec(rec.node) ? rec.node : undefined) ?? bundle?.node;
  const summary =
    typeof rec.summary === "string"
      ? rec.summary
      : detail && typeof detail.summary === "string"
        ? detail.summary
        : undefined;
  const result: NodeDetail = {
    // A 200 always carries a node; an absent one keeps `data.node` falsy so the
    // view degrades honestly rather than rendering an empty-id card.
    node: node as EngineNode,
    tiers: (rec.tiers ?? {}) as TiersBlock,
  };
  if (summary !== undefined) result.summary = summary;
  if (isRec(rec.interior)) result.interior = rec.interior as unknown as GraphSlice;
  return result;
}

// --- §4 node evidence: floor the three evidence arrays -----------------------------
//
// The live `/nodes/{id}/evidence` route serves the evidence fields directly under
// `data` (flattened to the top level by `unwrapEnvelope`, with the `tiers` block a
// sibling). It was the ONE `/nodes` endpoint consumed RAW — every sibling
// (`adaptNodeDetail`/`adaptContent`/...) has a tolerant adapter and this did not. The
// engine serde OMITS an empty evidence array, so a node with no code locations (or no
// commits/documents) arrives MISSING that key; the pure evidence fold
// (`deriveEvidenceGroups`/`hasEvidence`) then read `.length` of `undefined` and crashed
// the whole graph (stage) panel on every hover/select. This adapter is the boundary
// fix (mock-mirrors-live, one-code-path): floor all three arrays so EVERY evidence
// consumer is protected, not just the hover card.

/** Live `/nodes/{id}/evidence` → the internal `NodeEvidence`. TOLERANT (the
 *  one-code-path discipline of `adaptNodeDetail`/`adaptContent`): each of the three
 *  evidence arrays is floored to `[]` when the wire omits it (the engine serde skips
 *  empty arrays), and an absent/odd body yields three empty arrays plus an empty tiers
 *  block — so the consumer reads degraded state from the `tiers` truth rather than a
 *  thrown adapter, and the evidence fold never reads `.length` of undefined. */
export function adaptNodeEvidence(body: unknown): NodeEvidence {
  const rec = isRec(body) ? body : {};
  return {
    documents: Array.isArray(rec.documents)
      ? (rec.documents as NodeEvidence["documents"])
      : [],
    code_locations: Array.isArray(rec.code_locations)
      ? (rec.code_locations as NodeEvidence["code_locations"])
      : [],
    commits: Array.isArray(rec.commits) ? (rec.commits as NodeEvidence["commits"]) : [],
    tiers: (rec.tiers ?? {}) as TiersBlock,
  };
}
