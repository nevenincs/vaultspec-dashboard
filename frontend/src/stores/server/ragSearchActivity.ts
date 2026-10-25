// The served-search activity read — the QUERY half of the one activity surface
// (the index half is the jobs snapshot in `ragControl.ts`). rag's
// `/search-activity` ledger reports the searches the service has SERVED —
// active and recent, each with state/type/root/query/outcome/timing; rag's own
// watch interface presents exactly these two lanes beside the indexing jobs.
// The ledger is bounded on rag's side and the broker bounds the request
// besides; the reader below re-bounds rows and text so a shape drift can never
// grow the view unboundedly.
//
// Split out of `ragControl.ts` under the module-size gate; the seam is
// unchanged — `ragControl.ts` re-exports this module.

import { useMemo } from "react";

import { useQuery } from "@tanstack/react-query";

import { engineClient } from "./engine";
import {
  RAG_CONTROL_READ_GC_MS,
  RAG_SEARCH_ACTIVITY_LIMIT_CAP,
  boundedRagSearchActivityLimit,
  normalizeRagControlScope,
  normalizeRagJobNumber,
  normalizeRagJobText,
  ragControlKeys,
  ragSemanticOffline,
  type BrokeredResult,
} from "./ragControlBase";

/** One served-search record (tolerant: only `request_id` is required). */
export interface RagSearchActivityRecord {
  request_id: string;
  /** `active` | `terminal` (rag's ledger state). */
  state?: string;
  /** The searched index: `vault` | `code` | ... (rag's vocabulary). */
  type?: string;
  root?: string;
  query?: string;
  /** `success` | an error word, present once terminal. */
  outcome?: string;
  result_count?: number;
  total_seconds?: number;
  started_at?: number;
  finished_at?: number;
  error_message?: string;
}

/** rag's `/search-activity` envelope, forwarded verbatim by the broker. */
export interface RagSearchActivityEnvelope {
  active?: unknown[];
  recent?: unknown[];
  /** Ledger-side counts over the FULL retained set (never re-counted here). */
  counts?: { active?: number; recent?: number; total?: number };
  returned?: number;
}

/** Hard ceiling on rendered rows per lane regardless of the served count, and on
 *  each row's query text (defence in depth over the server clamp). */
export const RAG_SEARCH_ACTIVITY_ROWS_CAP = RAG_SEARCH_ACTIVITY_LIMIT_CAP;
export const RAG_SEARCH_QUERY_MAX_CHARS = 512;

function normalizeRagSearchQueryText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (normalized.length === 0) return undefined;
  return normalized.length > RAG_SEARCH_QUERY_MAX_CHARS
    ? normalized.slice(0, RAG_SEARCH_QUERY_MAX_CHARS)
    : normalized;
}

export function normalizeRagSearchActivityRecord(
  record: unknown,
): RagSearchActivityRecord | null {
  if (record === null || typeof record !== "object") return null;
  const candidate = record as Record<string, unknown>;
  const request_id = normalizeRagJobText(candidate.request_id);
  if (request_id === undefined) return null;
  const text = (value: unknown) => normalizeRagJobText(value);
  const num = (value: unknown) => normalizeRagJobNumber(value);
  const state = text(candidate.state);
  const type = text(candidate.type);
  const root = text(candidate.root);
  const query = normalizeRagSearchQueryText(candidate.query);
  const outcome = text(candidate.outcome);
  const error_message = normalizeRagSearchQueryText(candidate.error_message);
  const result_count = num(candidate.result_count);
  const total_seconds = num(candidate.total_seconds);
  const started_at = num(candidate.started_at);
  const finished_at = num(candidate.finished_at);
  return {
    request_id,
    ...(state !== undefined ? { state } : {}),
    ...(type !== undefined ? { type } : {}),
    ...(root !== undefined ? { root } : {}),
    ...(query !== undefined ? { query } : {}),
    ...(outcome !== undefined ? { outcome } : {}),
    ...(result_count !== undefined ? { result_count } : {}),
    ...(total_seconds !== undefined ? { total_seconds } : {}),
    ...(started_at !== undefined ? { started_at } : {}),
    ...(finished_at !== undefined ? { finished_at } : {}),
    ...(error_message !== undefined ? { error_message } : {}),
  };
}

function normalizeRagSearchActivityLane(lane: unknown): RagSearchActivityRecord[] {
  if (!Array.isArray(lane)) return [];
  const rows: RagSearchActivityRecord[] = [];
  for (const entry of lane) {
    const normalized = normalizeRagSearchActivityRecord(entry);
    if (normalized !== null) rows.push(normalized);
    if (rows.length >= RAG_SEARCH_ACTIVITY_ROWS_CAP) break;
  }
  return rows;
}

/** The interpreted served-search view. Counts come from rag's ledger-side
 *  `counts` block over the FULL retained set — never re-counted over the
 *  returned slice (displayed state is backend-served). */
export interface RagSearchActivityView {
  active: RagSearchActivityRecord[];
  recent: RagSearchActivityRecord[];
  activeCount: number;
  totalCount: number;
  semanticOffline: boolean;
}

export function interpretRagSearchActivity(
  data: BrokeredResult<RagSearchActivityEnvelope> | undefined,
): RagSearchActivityView {
  const semanticOffline = ragSemanticOffline(data);
  const envelope = semanticOffline ? null : data?.envelope;
  const active = normalizeRagSearchActivityLane(envelope?.active);
  const recent = normalizeRagSearchActivityLane(envelope?.recent);
  return {
    active,
    recent,
    activeCount: normalizeRagJobNumber(envelope?.counts?.active) ?? active.length,
    totalCount:
      normalizeRagJobNumber(envelope?.counts?.total) ?? active.length + recent.length,
    semanticOffline,
  };
}

/** The served-search poll cadence while the activity panel is open — the same
 *  bounded steady interval as the log tail (a ledger never reaches a terminal
 *  phase, so there is no backoff-to-done). */
export const RAG_SEARCH_ACTIVITY_POLL_MS = 5000;

export interface UseRagSearchActivityOptions {
  /** The requested row window; clamped to `[1, CAP]`, defaulting to 25. */
  limit?: unknown;
  /** The panel-open gate: poll only while the activity panel consumes it. */
  enabled?: boolean;
}

/**
 * The bounded served-search activity hook: a mount-gated read of the brokered
 * `/ops/rag/search-activity` ledger, polled on a steady bounded cadence ONLY
 * while `enabled` and rag is up (tiers-gated stop, mirroring the log tail).
 * No client accumulation — each render reflects the last served window.
 */
export function useRagSearchActivity(
  scope: unknown,
  options: UseRagSearchActivityOptions = {},
): RagSearchActivityView & { pending: boolean } {
  const normalizedScope = normalizeRagControlScope(scope);
  const limit = boundedRagSearchActivityLimit(options.limit);
  const active = normalizedScope !== null && options.enabled !== false;
  const query = useQuery({
    queryKey: ragControlKeys.searchActivity(normalizedScope ?? "", limit),
    queryFn: ({ signal }) =>
      engineClient.opsRagGet<RagSearchActivityEnvelope>(
        "search-activity",
        { limit },
        signal,
      ),
    enabled: active,
    gcTime: RAG_CONTROL_READ_GC_MS,
    refetchInterval: (q) => {
      const data = q.state.data as
        | BrokeredResult<RagSearchActivityEnvelope>
        | undefined;
      if (ragSemanticOffline(data)) return false;
      return RAG_SEARCH_ACTIVITY_POLL_MS;
    },
    refetchIntervalInBackground: false,
  });
  const data = active
    ? (query.data as BrokeredResult<RagSearchActivityEnvelope> | undefined)
    : undefined;
  const view = useMemo(() => interpretRagSearchActivity(data), [data]);
  const pending = active && query.isPending;
  return useMemo(() => ({ ...view, pending }), [view, pending]);
}
