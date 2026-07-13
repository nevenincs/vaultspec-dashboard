// Auto-split from queries.ts (module-decomposition mandate, 2026-07-12).
// Domain submodule of the queries barrel; see ./index.ts.

import type { ContentTruncated, EngineEdge, EngineNode } from "../engine";
import { docNodeIdFromStem } from "../liveAdapters";
import { parseDocument } from "../parseDocument";
import { useContentView } from "./document";
import { useGraphSlice } from "./graph";

// --- read-side editor derivations (document-editor backend) ----------------------
//
// The editor's read-side projections — all derived from EXISTING wire reads (the
// graph node payload, the content text, the parsed frontmatter), NO new content-
// endpoint field. Each is a pure projection over a query the stores layer already
// owns (views-are-projections-of-one-model): the editor chrome consumes the derived
// view, never re-deriving from the raw graph slice or re-fetching.

/**
 * Derive a node's `doc_type` from the graph slice (the `EngineNode.doc_type`
 * facet). Pure: scans the served nodes for the id and returns its type, or null
 * when the node is absent / carries no type. No new wire field — the doc type
 * already rides every document node.
 */
export function deriveDocType(
  nodeId: string | null,
  nodes: EngineNode[] | undefined,
): string | null {
  if (nodeId === null || !nodes) return null;
  const node = nodes.find((n) => n.id === nodeId);
  return node?.doc_type ?? null;
}

/**
 * Stores hook: the open node's `doc_type`, read from the active scope's graph
 * slice. A projection over the SAME `/graph/query` the canvas consumes (no new
 * read); the editor uses it to pick the right frontmatter template / validation.
 */
export function useDocType(nodeId: string | null, scope: string | null): string | null {
  const slice = useGraphSlice(scope, undefined, undefined, "document");
  return deriveDocType(nodeId, slice.data?.nodes);
}

/** Words-per-minute the read-time estimate assumes (a common prose reading pace). */
export const READ_TIME_WPM = 200;

/** A read-time estimate derived from the document text: the minute count and
 *  whether it is a floor (the served body was truncated, so the true read time is
 *  AT LEAST this — honest "≥ N min"). */
export interface ReadTimeEstimate {
  /** Whole minutes (ceil of words ÷ WPM); at least 1 for any non-empty body. */
  minutes: number;
  /** True when the served body was truncated — the estimate is a floor. */
  atLeast: boolean;
  /** The counted word total of the served (possibly truncated) text. */
  words: number;
}

/**
 * Derive a read-time estimate from the content text (word count ÷ ~200 wpm). When
 * the served body was truncated (`truncated` non-null), the estimate is an honest
 * FLOOR (`atLeast: true`) — the true read time is at least this, never a fabricated
 * exact value over a partial body. Pure over the already-fetched content text; no
 * new wire field.
 */
export function deriveReadTime(
  text: string,
  truncated: ContentTruncated | null,
): ReadTimeEstimate {
  const words = text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;
  const minutes = words === 0 ? 0 : Math.max(1, Math.ceil(words / READ_TIME_WPM));
  return { minutes, atLeast: truncated !== null, words };
}

/**
 * Stores hook: the open document's read-time estimate, derived from its content
 * view's text (a projection over the SAME `/nodes/{id}/content` read the markdown
 * reader consumes). Honest floor when the body was truncated.
 */
export function useReadTime(nodeId: unknown, scope: unknown): ReadTimeEstimate {
  const content = useContentView(nodeId, scope);
  return deriveReadTime(content.text, content.truncated);
}

/** One resolved related-link: the related document's `doc:<stem>` id and the
 *  structural state of the open node's outbound edge to it (`resolved` when the
 *  link lands on a live node, `stale`/`broken` when the edge says so, or `absent`
 *  when the frontmatter names a related stem the graph carries no edge for). */
export interface LinkResolution {
  /** The related document stem named in the frontmatter. */
  stem: string;
  /** The synthesized `doc:<stem>` target node id. */
  nodeId: string;
  /** The structural state of the open node's outbound edge to the target, or
   *  `absent` when no such edge exists in the served slice. */
  state: "resolved" | "stale" | "broken" | "absent";
}

/**
 * Derive the resolution state of each frontmatter `related:` link: join the parsed
 * related stems (→ `doc:<stem>`) against the open node's OUTBOUND structural edges
 * in the graph slice, reading each edge's `state` (`resolved`/`stale`/`broken`). A
 * related stem the slice carries no matching outbound edge for is `absent` (the
 * frontmatter names it but the graph has no structural link yet) — surfaced
 * honestly, never silently dropped. Pure over the parsed frontmatter + the served
 * edges; no new wire field.
 */
export function deriveLinkResolution(
  nodeId: string | null,
  text: string,
  edges: EngineEdge[] | undefined,
): LinkResolution[] {
  if (nodeId === null) return [];
  const related = parseDocument(text).frontmatter?.related ?? [];
  // Index the open node's outbound STRUCTURAL edges by destination so each related
  // stem reads its edge state in one pass.
  const outbound = new Map<string, EngineEdge["state"]>();
  for (const edge of edges ?? []) {
    if (edge.src === nodeId && edge.tier === "structural") {
      outbound.set(edge.dst, edge.state);
    }
  }
  return related.map((stem) => {
    const targetId = docNodeIdFromStem(stem);
    const state = outbound.get(targetId);
    return {
      stem,
      nodeId: targetId,
      state: state ?? "absent",
    };
  });
}

/**
 * Stores hook: the resolution state of the open document's frontmatter `related:`
 * links — each related stem joined to the open node's outbound structural edge
 * state in the graph slice. A projection over the content text (frontmatter) + the
 * SAME `/graph/query` the canvas consumes; the editor renders resolved / stale /
 * broken / absent affordances from it without re-fetching.
 */
export function useLinkResolution(
  nodeId: string | null,
  scope: string | null,
): LinkResolution[] {
  const content = useContentView(nodeId, scope);
  const slice = useGraphSlice(
    nodeId === null ? null : scope,
    undefined,
    undefined,
    "document",
  );
  return deriveLinkResolution(nodeId, content.text, slice.data?.edges);
}
