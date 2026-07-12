// Section-anchored document comment vocabulary + adapters (authoring-surface ADR
// D2). Extracted from `authoring.ts` (module-size: the authoring wire client is a
// grandfathered monolith that may only shrink). This module is SELF-CONTAINED —
// it type-imports the shared actor/tiers shapes but pulls no runtime binding from
// `authoring.ts`, so the dependency is one-way (`authoring.ts` imports these
// adapters; nothing here imports it back) and there is no import cycle. Its own
// tiny wire guards mirror the ones `liveAdapters` already keeps locally.
//
// A comment is a durable authoring-state entity anchored to a heading SECTION of a
// vault document through the SAME section selector a `SectionEdit` uses (heading
// path + advisory range hint + expected content hash). The backend resolves each
// anchor EXACT-OR-CONFLICT on read: an exact match serves the comment as anchored;
// a missing/ambiguous heading or a content-hash mismatch serves it as ORPHANED
// with typed evidence — still listed, never silently re-anchored. The served
// `orphaned` boolean is authoritative (backend-served, never frontend-derived);
// the store consumes the served shapes unchanged and maps only presentation.

import type { TiersBlock } from "./engine";
import type { ActorKind, ActorRef } from "./authoring";

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null;
const asStr = (v: unknown): string | undefined =>
  typeof v === "string" ? v : undefined;
const asBool = (v: unknown): boolean => v === true;
const asNum = (v: unknown, fallback = 0): number =>
  typeof v === "number" && Number.isFinite(v) ? v : fallback;
const asTiers = (v: unknown): TiersBlock => (isRec(v) ? (v as TiersBlock) : {});

/** Local actor-ref adapter (kept self-contained to avoid a runtime import back
 *  into `authoring.ts`), identical in shape to the client's own. */
function adaptCommentAuthor(raw: unknown): ActorRef {
  if (!isRec(raw)) return { id: "", kind: "system" };
  return {
    id: asStr(raw.id) ?? "",
    kind: (asStr(raw.kind) as ActorKind) ?? "system",
    delegated_by: asStr(raw.delegated_by),
  };
}

/** The section anchor a comment binds to (engine `SectionSelector`): the heading
 *  path plus the expected content hash the resolver fences against. `range_hint`
 *  is advisory-only (never a resolution input); the frontend omits it when
 *  authoring a fresh selector. */
export interface SectionSelector {
  heading_path: string[];
  range_hint?: { start: number; end: number } | null;
  expected_content_hash: string;
}

/** Typed evidence for why a comment orphaned (engine `CommentOrphanEvidence`),
 *  tagged by `reason` so a consumer branches without positional guessing. */
export type CommentOrphanEvidence =
  | { reason: "missing_anchor"; heading_path: string[] }
  | { reason: "ambiguous_anchor"; heading_path: string[]; candidate_count: number }
  | {
      reason: "content_hash_mismatch";
      heading_path: string[];
      expected: string;
      observed: string;
    }
  | { reason: "malformed_anchor" };

/** How a comment's anchor resolved against the CURRENT document body (engine
 *  `CommentAnchorState`), tagged by `state`. `anchored` carries the resolved
 *  byte range; `orphaned` carries the typed drift evidence. */
export type CommentAnchorState =
  | {
      state: "anchored";
      heading_path: string[];
      content_start: number;
      content_end: number;
    }
  | { state: "orphaned"; evidence: CommentOrphanEvidence };

/** The durable comment record (engine `CommentRecord`). `author` carries the full
 *  actor ref so attribution upgrades in place when per-human identity lands (V1 is
 *  single-principal by ADR). Wire fields stay snake_case as served. */
export interface CommentRecord {
  schema_version: string;
  comment_id: string;
  document: { node_id: string };
  selector: SectionSelector;
  body: string;
  author: ActorRef;
  resolved: boolean;
  created_at_ms: number;
  updated_at_ms: number;
  resolved_at_ms?: number | null;
}

/** One served comment (engine `ServedComment`): the stored record, its anchor
 *  resolution against the current body, and the flat backend-served `orphaned`
 *  flag the reader filters on. */
export interface ServedComment {
  comment: CommentRecord;
  anchor: CommentAnchorState;
  orphaned: boolean;
}

/** The bounded per-document comment listing (`GET .../comments`). */
export interface CommentListResult {
  documentNodeId: string;
  comments: ServedComment[];
  tiers: TiersBlock;
}

/** `POST .../comments` payload: the section anchor + the comment body. The author
 *  is the middleware-resolved principal (never a body claim); the comment id is
 *  minted server-side from the node id + idempotency key. */
export interface CreateCommentPayload {
  selector: SectionSelector;
  body: string;
}

/** `PATCH /authoring/v1/comments/{id}` payload (engine `CommentUpdateRequest`):
 *  exactly one tagged op per request — edit the body, toggle resolved, or
 *  explicitly re-anchor to the current section. Re-anchor is never a silent side
 *  effect of a read. */
export type CommentUpdate =
  | { op: "edit_body"; body: string }
  | { op: "set_resolved"; resolved: boolean }
  | { op: "reanchor"; selector: SectionSelector };

function adaptSectionSelector(raw: unknown): SectionSelector {
  const r: Rec = isRec(raw) ? raw : {};
  const heading = Array.isArray(r.heading_path)
    ? r.heading_path.filter((seg): seg is string => typeof seg === "string")
    : [];
  const hint = isRec(r.range_hint) ? r.range_hint : null;
  return {
    heading_path: heading,
    range_hint: hint ? { start: asNum(hint.start), end: asNum(hint.end) } : undefined,
    expected_content_hash: asStr(r.expected_content_hash) ?? "",
  };
}

function adaptOrphanEvidence(raw: unknown): CommentOrphanEvidence {
  const r: Rec = isRec(raw) ? raw : {};
  const headingPath = Array.isArray(r.heading_path)
    ? r.heading_path.filter((seg): seg is string => typeof seg === "string")
    : [];
  switch (asStr(r.reason)) {
    case "missing_anchor":
      return { reason: "missing_anchor", heading_path: headingPath };
    case "ambiguous_anchor":
      return {
        reason: "ambiguous_anchor",
        heading_path: headingPath,
        candidate_count: asNum(r.candidate_count),
      };
    case "content_hash_mismatch":
      return {
        reason: "content_hash_mismatch",
        heading_path: headingPath,
        expected: asStr(r.expected) ?? "",
        observed: asStr(r.observed) ?? "",
      };
    default:
      // An unrecognized/absent reason degrades to the honest "malformed anchor"
      // rather than throwing on a wire shape this client has not been taught.
      return { reason: "malformed_anchor" };
  }
}

function adaptCommentAnchorState(raw: unknown): CommentAnchorState {
  const r: Rec = isRec(raw) ? raw : {};
  if (asStr(r.state) === "anchored") {
    return {
      state: "anchored",
      heading_path: Array.isArray(r.heading_path)
        ? r.heading_path.filter((seg): seg is string => typeof seg === "string")
        : [],
      content_start: asNum(r.content_start),
      content_end: asNum(r.content_end),
    };
  }
  return { state: "orphaned", evidence: adaptOrphanEvidence(r.evidence) };
}

/** Adapt one served comment record, flooring optionals so a sparse wire shape
 *  never crashes a thread row. Consumes the served shape unchanged. */
export function adaptCommentRecord(raw: unknown): CommentRecord {
  const r: Rec = isRec(raw) ? raw : {};
  const document: Rec = isRec(r.document) ? r.document : {};
  return {
    schema_version: asStr(r.schema_version) ?? "",
    comment_id: asStr(r.comment_id) ?? "",
    document: { node_id: asStr(document.node_id) ?? "" },
    selector: adaptSectionSelector(r.selector),
    body: asStr(r.body) ?? "",
    author: adaptCommentAuthor(r.author),
    resolved: asBool(r.resolved),
    created_at_ms: asNum(r.created_at_ms),
    updated_at_ms: asNum(r.updated_at_ms),
    resolved_at_ms: typeof r.resolved_at_ms === "number" ? r.resolved_at_ms : undefined,
  };
}

/** Adapt one served comment (record + backend-served anchor resolution + the flat
 *  `orphaned` flag). The `orphaned` flag is authoritative; when a wire omits it,
 *  it is derived from the tagged anchor state (never re-resolved client-side). */
export function adaptServedComment(raw: unknown): ServedComment {
  const r: Rec = isRec(raw) ? raw : {};
  const anchor = adaptCommentAnchorState(r.anchor);
  const orphaned =
    typeof r.orphaned === "boolean" ? r.orphaned : anchor.state === "orphaned";
  return { comment: adaptCommentRecord(r.comment), anchor, orphaned };
}

/** Adapt the bounded per-document comment listing. */
export function adaptCommentList(raw: unknown): CommentListResult {
  const r: Rec = isRec(raw) ? raw : {};
  return {
    documentNodeId: asStr(r.document_node_id) ?? "",
    comments: Array.isArray(r.comments) ? r.comments.map(adaptServedComment) : [],
    tiers: asTiers(r.tiers),
  };
}

/** Marshal a `CommentUpdate` onto the wire tagged `CommentUpdateRequest` shape
 *  (`op` discriminator + only that op's fields). */
export function commentUpdateWirePayload(update: CommentUpdate): Rec {
  switch (update.op) {
    case "edit_body":
      return { op: "edit_body", body: update.body };
    case "set_resolved":
      return { op: "set_resolved", resolved: update.resolved };
    case "reanchor":
      return { op: "reanchor", selector: update.selector };
    default: {
      const exhaustive: never = update;
      return exhaustive;
    }
  }
}
