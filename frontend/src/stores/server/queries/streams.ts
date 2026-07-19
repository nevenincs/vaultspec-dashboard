// Auto-split from queries.ts (module-decomposition mandate, 2026-07-12).
// Domain submodule of the queries barrel; see ./index.ts.

import { StreamLostError } from "../../../platform/policy/failurePolicy";
import { debounce } from "../../../platform/timing";
import { engineClient } from "../engine";
import {
  experimental_streamedQuery as streamedQuery,
  queryOptions,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  engineKeys,
  normalizeEngineStreamChannel,
  normalizeEngineStreamIdentity,
  stableKey,
} from "./internal";
import { invalidateGitRecoveryReads } from "./mutations";

// --- SSE consumption (§7) -------------------------------------------------------------

export interface StreamChunk {
  channel: string;
  data: unknown;
}

/**
 * Incremental text/event-stream parser: returns completed frames and the
 * unconsumed remainder (pure; transport-independent).
 */
/** Per-SSE-frame byte ceiling (bounded-by-default, hardening G5): real delta/event
 *  frames are small; a frame whose accumulated `data:` exceeds this is a runaway or
 *  hostile payload — stop accumulating and DROP it rather than buffer + `JSON.parse`
 *  a multi-megabyte string (a client memory-exhaustion path). Generous vs any real
 *  frame so it only fires on a runaway. */
export const MAX_SSE_FRAME_BYTES = 2 * 1024 * 1024;
/** The undelimited remainder is held between network reads. Keep it under the
 * same wire-byte ceiling as a completed frame; crossing it means the peer has
 * supplied a delimiter-free runaway frame and the stream must reconnect. */
export const MAX_SSE_INCOMPLETE_BYTES = MAX_SSE_FRAME_BYTES;
const SSE_DECODE_SLICE_BYTES = 64 * 1024;

/** UTF-8 length without allocating a second encoded copy of a potentially large
 * remainder. Network limits are byte limits, not JavaScript UTF-16 code units. */
function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const low = value.charCodeAt(index + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else bytes += 3;
  }
  return bytes;
}

export function parseSseFrames(buffer: string): {
  frames: StreamChunk[];
  rest: string;
} {
  const frames: StreamChunk[] = [];
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  for (const part of parts) {
    let channel = "message";
    let data = "";
    let dataBytes = 0;
    for (const line of part.split("\n")) {
      if (line.startsWith("event:")) channel = line.slice(6).trim();
      else if (line.startsWith("data:")) {
        const value = line.slice(5).trim();
        dataBytes += utf8ByteLength(value);
        if (dataBytes > MAX_SSE_FRAME_BYTES) break;
        data += value;
      }
    }
    // Drop an empty frame, or a runaway one over the byte ceiling (never parse it).
    if (data.length === 0 || dataBytes > MAX_SSE_FRAME_BYTES) continue;
    try {
      frames.push({ channel, data: JSON.parse(data) });
    } catch {
      frames.push({ channel, data });
    }
  }
  return { frames, rest };
}

/** True when an error is an intentional cancel (abort), not a lost stream. */
function isAbort(cause: unknown): boolean {
  return cause instanceof Error && cause.name === "AbortError";
}

/**
 * Consume a long-lived SSE Response body as an async iterable of chunks. Any
 * transport end, including a clean EOF, throws `StreamLostError` (ADR D2) so
 * the query retry policy reconnects instead of leaving a mounted consumer
 * permanently detached from a still-running producer.
 * An intentional abort (unmount / scope change) is re-thrown untouched - it is
 * not a lost stream.
 */
export async function* sseChunks(
  response: Response,
): AsyncGenerator<StreamChunk, void, unknown> {
  if (!response.ok || !response.body) {
    throw new StreamLostError(`graph stream responded ${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (cause) {
        if (isAbort(cause)) throw cause;
        throw new StreamLostError("graph stream dropped");
      }
      if (chunk.done) throw new StreamLostError("graph stream ended");
      // Decode bounded slices so a single hostile transport chunk cannot create a
      // giant concatenation before completed frames are removed.
      for (let offset = 0; offset < chunk.value.byteLength; ) {
        const end = Math.min(chunk.value.byteLength, offset + SSE_DECODE_SLICE_BYTES);
        buffer += decoder.decode(chunk.value.subarray(offset, end), { stream: true });
        offset = end;
        const { frames, rest } = parseSseFrames(buffer);
        buffer = rest;
        if (utf8ByteLength(buffer) > MAX_SSE_INCOMPLETE_BYTES) {
          throw new StreamLostError("graph stream frame exceeds byte ceiling");
        }
        for (const frame of frames) {
          yield frame;
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

/**
 * Cap the live accumulator (dashboard-optimization P-HIGH-6): the stream never
 * closes and `staleTime` is Infinity, so an unbounded `[...acc, chunk]` grows
 * for the whole session. Consumers read only the latest seq (`graphSync`) and
 * the most-recent per-channel frames (`NowStrip`), so retaining the tail is
 * sufficient and keeps memory + the per-append dedup scan bounded.
 */
export const STREAM_RETENTION = 256;

/** Dedup graph frames by seq WITHIN the retained window (a reconnect's since=
 *  replay overlapping the tail yields no second copy; a replay older than the
 *  256-frame window is not deduped here but is upserted idempotently by id at
 *  apply time), then ring-cap. Frames without a seq just append. Exported for
 *  the bounded-growth test. */
export function streamReducer(acc: StreamChunk[], chunk: StreamChunk): StreamChunk[] {
  const seq = (chunk.data as { seq?: unknown }).seq;
  if (
    typeof seq === "number" &&
    acc.some((held) => (held.data as { seq?: unknown }).seq === seq)
  ) {
    return acc;
  }
  const next = [...acc, chunk];
  return next.length > STREAM_RETENTION
    ? next.slice(next.length - STREAM_RETENTION)
    : next;
}

/**
 * Streamed query over the engine's multiplexed SSE stream. Chunks accumulate
 * via a seq-dedup reducer (not blind append), so a reconnect's `since=` replay
 * splices idempotently; `since` resumes the graph channel from a known seq and
 * is folded into the cache key so two resume offsets never collide (section 7).
 */
export function engineStreamOptions(
  channels: readonly unknown[],
  since?: unknown,
  scope?: unknown,
) {
  const identity = normalizeEngineStreamIdentity(channels, since, scope);
  return queryOptions({
    // The resume point is identity-bearing: two `since` offsets carry
    // different delta windows and must not collide on one cache entry
    // (adversarial finding stream-01), mirroring how `graph` folds as-of.
    // Scope joins the key for the same reason (per-scope clock, W02.P04.S14).
    queryKey: engineKeys.stream(identity.channels, identity.since, identity.scope),
    queryFn: streamedQuery({
      streamFn: async (context) =>
        sseChunks(
          await engineClient.openStream(
            [...identity.channels],
            identity.since,
            context.signal,
            identity.scope,
          ),
        ),
      reducer: streamReducer,
      initialValue: [] as StreamChunk[],
    }),
    staleTime: Infinity,
    // Bounded by default (bounded-by-default-for-every-accumulator): the stream
    // entry retains a 256-chunk array, so a staleTime:Infinity stream MUST
    // declare a gcTime to reclaim that array promptly once the stream is no
    // longer observed (tab closed / unmounted), not after the default window.
    gcTime: 30_000,
    retry: true,
    // Capped exponential backoff (P-MED-3, LOW-2): recover a transient blip
    // fast (250ms first retry), then back off exponentially to a 30s ceiling so
    // a flapping /stream cannot tight-loop reconnects or storm the error log.
    retryDelay: (attempt) =>
      attempt === 0 ? 250 : Math.min(30_000, 1_000 * 2 ** attempt),
  });
}

export function useEngineStream(
  channels: readonly unknown[],
  since?: unknown,
  scope?: unknown,
) {
  return useQuery(engineStreamOptions(channels, since, scope));
}

/**
 * The canonical backend-signal channel set (F-M1 / event-unity): `backends`
 * (rag/core lifecycle) + `git` (working-tree status) share ONE multiplexed SSE
 * subscription, so the dashboard opens a single backend-signal EventSource
 * instead of one per consumer. The `graph` channel stays SEPARATE — it is the
 * per-scope, `since=keyframeSeq`-anchored live delta clock (`useGraphLiveSync`)
 * and must never be folded in here.
 */
export const BACKEND_SIGNAL_CHANNELS = ["backends", "git"] as const;

/**
 * Subscribe the shared backend-signal stream. Mounted once at the app shell so
 * backend / git / rag-health stay live regardless of which rail tab is open;
 * NowStrip and the search controller call this same hook and TanStack Query
 * coalesces them onto the one EventSource (each filters the deduped accumulator
 * for its own channel). No `since`/`scope` — these channels are not anchored.
 */
/** Grace before a hidden tab pauses the backend-signal stream
 *  (universal-data-loading ADR D4): long enough that tab-switching never
 *  churns the EventSource, short enough that a parked tab stops holding a
 *  connection open. */
export const BACKEND_SIGNAL_HIDDEN_PAUSE_MS = 60_000;

/**
 * True once the document has stayed hidden past the grace window; flips back
 * false the moment it is visible again. SSR/test-safe: no `document` means
 * never paused.
 */
export function useDocumentHiddenPause(
  graceMs: number = BACKEND_SIGNAL_HIDDEN_PAUSE_MS,
): boolean {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (typeof document === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const apply = () => {
      if (document.hidden) {
        timer ??= setTimeout(() => setPaused(true), graceMs);
      } else {
        if (timer !== null) clearTimeout(timer);
        timer = null;
        setPaused(false);
      }
    };
    apply();
    document.addEventListener("visibilitychange", apply);
    return () => {
      if (timer !== null) clearTimeout(timer);
      document.removeEventListener("visibilitychange", apply);
    };
  }, [graceMs]);
  return paused;
}

/**
 * Hidden-tab pause (universal-data-loading ADR D4): when the tab stays hidden
 * past the grace, the subscription disables AND the in-flight stream is
 * cancelled (closing the EventSource — `enabled: false` alone would leave it
 * open, and cancelling alone would let `retry` reconnect). On return the
 * stream key is invalidated so the re-enabled observer reopens the
 * EventSource and re-snapshots — the pause gap is a designed resume, never a
 * lost-stream degradation (these channels are unanchored; every reconnect
 * re-serves current state). The `graph` delta channel is untouched: it is
 * mount-gated in Stage and seq-anchored.
 */
const BACKEND_SIGNAL_STREAM_KEY = engineKeys.stream(
  BACKEND_SIGNAL_CHANNELS,
  undefined,
  undefined,
);

export function useBackendSignalStream() {
  const paused = useDocumentHiddenPause();
  const queryClient = useQueryClient();
  const wasPausedRef = useRef(false);
  useEffect(() => {
    if (paused) {
      wasPausedRef.current = true;
      void queryClient.cancelQueries({ queryKey: BACKEND_SIGNAL_STREAM_KEY });
      return;
    }
    if (!wasPausedRef.current) return;
    wasPausedRef.current = false;
    // Resume: staleTime Infinity would otherwise keep the held (now gapped)
    // accumulator fresh forever; invalidating refetches the ACTIVE re-enabled
    // observer, reopening the stream for a fresh snapshot.
    void queryClient.invalidateQueries({ queryKey: BACKEND_SIGNAL_STREAM_KEY });
  }, [paused, queryClient]);
  return useQuery({
    ...engineStreamOptions(BACKEND_SIGNAL_CHANNELS),
    enabled: !paused,
  });
}

export type BackendSignalChannel = (typeof BACKEND_SIGNAL_CHANNELS)[number];

export function normalizeBackendSignalChannel(
  channel: unknown,
): BackendSignalChannel | null {
  const normalized = normalizeEngineStreamChannel(channel);
  return normalized === "backends" || normalized === "git" ? normalized : null;
}

/**
 * Stable signature of the latest retained backend/git signal values. This is
 * value-based, not length-based, because the stream accumulator is ring-capped:
 * once the retained array reaches STREAM_RETENTION its length stops changing even
 * though backend/git values keep changing.
 */
export function latestBackendSignalSignature(
  chunks: readonly StreamChunk[] | undefined,
): string | undefined {
  if (!chunks) return undefined;
  let backends: string | undefined;
  let git: string | undefined;
  for (
    let i = chunks.length - 1;
    i >= 0 && (backends === undefined || git === undefined);
    i--
  ) {
    const chunk = chunks[i];
    const channel = normalizeBackendSignalChannel(chunk.channel);
    if (channel === "backends" && backends === undefined) {
      backends = stableKey(chunk.data);
    } else if (channel === "git" && git === undefined) {
      git = stableKey(chunk.data);
    }
  }
  if (backends === undefined && git === undefined) return undefined;
  return `backends:${backends ?? ""}|git:${git ?? ""}`;
}

/**
 * Stores-owned status recovery invalidation. Backend/git SSE frames are deltas;
 * `/status` is the recovery snapshot. Consumers call this hook instead of
 * manipulating the status query cache directly from app chrome.
 */
export function useStatusRecoveryRefresh(): void {
  const queryClient = useQueryClient();
  const stream = useBackendSignalStream();
  const previous = useRef<string | undefined>(undefined);
  const invalidateStatus = useMemo(
    () =>
      debounce(() => {
        invalidateGitRecoveryReads(queryClient);
      }, 150),
    [queryClient],
  );

  useEffect(() => () => invalidateStatus.cancel(), [invalidateStatus]);
  useEffect(() => {
    const signature = latestBackendSignalSignature(stream.data);
    if (signature === undefined) return;
    const prior = previous.current;
    previous.current = signature;
    if (prior !== signature) invalidateStatus();
  }, [stream.data, invalidateStatus]);
}
