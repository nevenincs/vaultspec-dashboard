// The rag log tail — the LOG half of the search-service console. rag's
// `/logs/json` serves an array of RAW, pre-formatted log strings; this module
// parses each into a bounded, tone-tagged row: a level word and a leading
// timestamp are pulled out WHEN present (Python-logging format), otherwise the
// row is the verbatim text with no tone. Every accumulator is bounded — line
// count AND per-line length — so a pathological tail cannot grow the view
// unboundedly (bounded-by-default). The window is honest: the pane renders what
// the served envelope carried, never a client-accumulated backlog.
//
// Split out of `ragControl.ts` under the module-size gate; the seam is
// unchanged — `ragControl.ts` re-exports this module.

import { useMemo } from "react";

import { useQuery } from "@tanstack/react-query";

import { engineClient, type RagLogsEnvelope } from "./engine";
import {
  RAG_CONTROL_READ_GC_MS,
  RAG_LOGS_LINES_MAX,
  boundedRagLogLines,
  normalizeRagControlScope,
  normalizeRagJobNumber,
  normalizeRagJobText,
  ragControlKeys,
  ragSemanticOffline,
  type BrokeredResult,
} from "./ragControlBase";

/** Hard ceiling on rendered rows regardless of the served count (defence in depth
 *  over the server clamp) and on each row's rendered text length. */
export const RAG_LOG_ROWS_CAP = RAG_LOGS_LINES_MAX;
export const RAG_LOG_LINE_MAX_CHARS = 4096;

/** The parsed level tone for a log row. `warn` folds into `warning`; an
 *  unrecognized or absent level leaves the row untoned (`undefined`). */
export type RagLogLevel = "debug" | "info" | "warning" | "error" | "critical";

/** One parsed log row: the verbatim text plus the level tone and leading
 *  timestamp when the raw line carried them. */
export interface RagLogLine {
  /** The raw log-line text, verbatim (the monospace row body), length-bounded. */
  text: string;
  /** The parsed level word driving the row tone, when recognized. */
  level?: RagLogLevel;
  /** The leading `YYYY-MM-DD HH:MM:SS,mmm` timestamp when present, verbatim. */
  timestamp?: string;
}

/** The interpreted log-tail view (data-derived; the hook layers query state). */
export interface RagLogsView {
  lines: RagLogLine[];
  /** rag's reported returned-line count (the served window size). */
  total: number;
  /** The job id the served window was filtered to (echoed by rag), or null. */
  jobFilter: string | null;
  /** The semantic tier reported unavailable — rag is down; the tail is empty. */
  semanticOffline: boolean;
}

/** The log-tail view a CONSUMER receives: the interpreted window plus the query
 *  state its loading treatment renders from. `interpretRagLogs` stays pure over
 *  the served window; only the hook can know a read is still in flight. */
export interface RagLogsHookView extends RagLogsView {
  /** The window read is in flight with nothing held yet. */
  pending: boolean;
}

const RAG_LOG_TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[.,]\d+)/;
const RAG_LOG_LEVEL_RE = /\b(DEBUG|INFO|WARNING|WARN|ERROR|CRITICAL|FATAL)\b/;

function mapRagLogLevel(token: string | undefined): RagLogLevel | undefined {
  switch (token) {
    case "DEBUG":
      return "debug";
    case "INFO":
      return "info";
    case "WARNING":
    case "WARN":
      return "warning";
    case "ERROR":
      return "error";
    case "CRITICAL":
    case "FATAL":
      return "critical";
    default:
      return undefined;
  }
}

/** Parse one raw rag log string into a tone-tagged row. A recognizable Python-
 *  logging prefix yields a timestamp + level; an unstructured line keeps only its
 *  (length-bounded) text. Returns null for a non-string or blank line. */
export function parseRagLogLine(raw: unknown): RagLogLine | null {
  if (typeof raw !== "string") return null;
  const text =
    raw.length > RAG_LOG_LINE_MAX_CHARS ? raw.slice(0, RAG_LOG_LINE_MAX_CHARS) : raw;
  if (text.trim().length === 0) return null;
  const timestamp = RAG_LOG_TIMESTAMP_RE.exec(text)?.[1];
  const level = mapRagLogLevel(RAG_LOG_LEVEL_RE.exec(text)?.[1]);
  return {
    text,
    ...(level !== undefined ? { level } : {}),
    ...(timestamp !== undefined ? { timestamp } : {}),
  };
}

/** Parse and bound the served log lines into rendered rows (blank/non-string
 *  lines dropped, count capped at `RAG_LOG_ROWS_CAP`). */
export function normalizeRagLogLines(
  envelope: RagLogsEnvelope | null | undefined,
): RagLogLine[] {
  const raw = envelope?.lines;
  if (!Array.isArray(raw)) return [];
  const rows: RagLogLine[] = [];
  for (const entry of raw) {
    const parsed = parseRagLogLine(entry);
    if (parsed !== null) rows.push(parsed);
    if (rows.length >= RAG_LOG_ROWS_CAP) break;
  }
  return rows;
}

/** Interpret a brokered logs read into the data-derived tail view. A down rag
 *  (semantic tier unavailable, read from tiers — never a transport error) yields
 *  an empty, offline-flagged tail. */
export function interpretRagLogs(
  data: BrokeredResult<RagLogsEnvelope> | undefined,
): RagLogsView {
  const semanticOffline = ragSemanticOffline(data);
  const lines = semanticOffline ? [] : normalizeRagLogLines(data?.envelope);
  const total = normalizeRagJobNumber(data?.envelope?.total) ?? lines.length;
  const jobFilter = normalizeRagJobText(data?.envelope?.filters?.job_id) ?? null;
  return { lines, total, jobFilter, semanticOffline };
}

/** The log-tail poll cadence while the dashboard is open (rag-job-dashboard ADR
 *  D4): a bounded steady interval — logs never reach a terminal phase, so unlike
 *  the jobs progress poll there is no backoff-to-done, just a mount-gated tail. */
export const RAG_LOGS_POLL_MS = 5000;

export interface UseRagLogsOptions {
  /** The requested window; clamped to `[MIN, MAX]`, defaulting to 200. */
  lines?: unknown;
  /** Filter the tail to one job id (joined from the jobs table selection). */
  jobId?: unknown;
  /** The panel-open gate: poll only while the dashboard consumes the tail. */
  enabled?: boolean;
}

/**
 * The bounded rag log-tail hook: a mount-gated read of
 * the brokered `/ops/rag/logs` window, parsed into tone-tagged rows. Polls on a
 * bounded steady cadence ONLY while `enabled` (the open panel) and rag is up —
 * a down rag (read from the tiers block, never a transport error) stops the poll
 * and holds an empty, offline-flagged tail. No client-side accumulation: each
 * render reflects the last served window, capped at `RAG_LOG_ROWS_CAP`.
 */
export function useRagLogs(
  scope: unknown,
  options: UseRagLogsOptions = {},
): RagLogsHookView {
  const normalizedScope = normalizeRagControlScope(scope);
  const lines = boundedRagLogLines(options.lines);
  const jobId = normalizeRagJobText(options.jobId) ?? null;
  const active = normalizedScope !== null && options.enabled !== false;
  const query = useQuery({
    queryKey: ragControlKeys.logs(normalizedScope ?? "", lines, jobId ?? undefined),
    queryFn: ({ signal }) =>
      engineClient.opsRagLogs({ lines, job_id: jobId ?? undefined }, signal),
    enabled: active,
    gcTime: RAG_CONTROL_READ_GC_MS,
    refetchInterval: (q) => {
      const data = q.state.data as BrokeredResult<RagLogsEnvelope> | undefined;
      // Stop polling a down rag (tiers-gated) — the pane holds the offline state.
      if (ragSemanticOffline(data)) return false;
      return RAG_LOGS_POLL_MS;
    },
    refetchIntervalInBackground: false,
  });
  const data = active
    ? (query.data as BrokeredResult<RagLogsEnvelope> | undefined)
    : undefined;
  const view = useMemo(() => interpretRagLogs(data), [data]);
  const pending = active && query.isPending;
  return useMemo(() => ({ ...view, pending }), [view, pending]);
}
