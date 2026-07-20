// Tolerant adapters for the a2a run-progress RELAY channel
// (`GET /ops/a2a/runs/{run_id}/stream`, a2a-orchestration-edge ADR D3). The
// relay re-serves the resident a2a gateway's SSE progress frames through the
// engine with an added engine `seq`; this module absorbs their wire-shape
// variation into one bounded transcript-frame shape — the liveAdapters role
// (wire-shape variation is absorbed here, never trusted raw at a consumer).
//
// Authority (ADR D3): these frames are NON-AUTHORITATIVE and droppable. The
// transcript renders them for live progress, but truth is recovered by re-reading
// `run-status` + the durable authoring events — never reconstructed from a relay
// frame. A `gap` (the engine evicted the resume point or the broadcast lagged) or
// a `relay_degraded` frame (the upstream stream is down) is the honest signal to
// fall back to bounded `run-status` polling, never to fake liveness.

import { isRec, type Rec } from "./internal";

/** Bounded live transcript retention (resource-bounds: every accumulator is
 *  bounded at creation). The relay never closes, so the consumer keeps only a
 *  capped tail; older truth is recoverable from `run-status` + durable events. */
export const RELAY_TRANSCRIPT_CAP = 256;

/** Hard retained-byte ceiling for one browser transcript. The engine has its own
 * replay budget, but the browser must independently bound the parsed object graph
 * it keeps alive. Two MiB preserves a useful live tail without allowing 256
 * individually-large frames to multiply into hundreds of MiB. */
export const RELAY_TRANSCRIPT_BYTE_CAP = 2 * 1024 * 1024;

/** The bounded relay frame kinds the transcript renders. `thought` is the a2a
 *  `thought_chunk` reasoning stream (rendered as the collapsible "Thinking…"
 *  section); `token` is the `message_chunk` final-answer stream; `tool_call` is
 *  the `tool_call_start`/`tool_call_update` pair; `status` carries
 *  `agent_status`/`team_status` (and the engine's degraded-poll snapshot);
 *  `gap`/`degraded` are the honest re-keyframe/poll-fallback signals; `terminal`
 *  ends the run; `dropped` is the upstream oversized-frame sentinel; `heartbeat`
 *  is a keep-alive; `error` is a run fault; `progress` is any other frame. */
export type RelayFrameKind =
  | "thought"
  | "token"
  | "tool_call"
  | "status"
  | "heartbeat"
  | "terminal"
  | "gap"
  | "degraded"
  | "dropped"
  | "error"
  | "progress";

/** One adapted relay frame: the engine `seq` (when present — the annotation the
 *  relay adds so a reconnect dedups), the classified kind, the raw SSE event name,
 *  and the payload passed through verbatim (wire values stay as served). */
export interface RelayTranscriptFrame {
  readonly seq?: number;
  readonly kind: RelayFrameKind;
  readonly event: string;
  readonly payload: Rec;
}

/** The raw parsed SSE frame the fetch-stream parser yields: an event name and the
 *  JSON-parsed (or string) data. Declared locally so this pure adapter module
 *  imports nothing from the queries layer (no cross-layer cycle). */
export interface RelayFrameInput {
  readonly channel: string;
  readonly data: unknown;
}

/** Classify a relay frame by its SSE event name and payload `type`/`event_type`,
 *  tolerant of an unrecognized future kind (degrades to `progress`, never throws).
 *  The engine-emitted control events (`gap`, `relay_degraded`) and the a2a
 *  vocabulary (`heartbeat`, `thread_terminal`, `progress_dropped`) are matched
 *  first; token/tool frames are matched by substring so a shape variant still
 *  lands in the right lane. */
export function classifyRelayFrame(event: string, payload: Rec): RelayFrameKind {
  const type = typeof payload.type === "string" ? payload.type : "";
  const eventType = typeof payload.event_type === "string" ? payload.event_type : "";
  const signal = `${event} ${type} ${eventType}`.toLowerCase();

  // A payload marked `degraded:true` is a fallback frame regardless of its event
  // name: the engine emits its bounded run-status-poll snapshots on the `status`
  // event with `degraded:true`, and they must stay in the `degraded` lane so the
  // consumer's poll fallback stays sticky (not flip off on the next status frame).
  if (payload.degraded === true) return "degraded";
  if (signal.includes("gap")) return "gap";
  if (signal.includes("relay_degraded") || signal.includes("degraded"))
    return "degraded";
  if (signal.includes("thread_terminal") || signal.includes("terminal"))
    return "terminal";
  if (signal.includes("progress_dropped") || signal.includes("dropped"))
    return "dropped";
  if (signal.includes("heartbeat")) return "heartbeat";
  // Reasoning (`thought_chunk`) MUST be matched before the tool/token lanes and
  // never fall to the generic `progress` bucket — it drives the "Thinking…"
  // section. It shares no substring with "tool"/"message"/"token"/"status".
  if (signal.includes("thought")) return "thought";
  if (signal.includes("tool")) return "tool_call";
  if (signal.includes("token") || signal.includes("message")) return "token";
  // `error` is a run fault the transcript surfaces honestly (a2a `ErrorOccurred`).
  if (signal.includes("error")) return "error";
  if (signal.includes("status")) return "status";
  return "progress";
}

/** Adapt one raw SSE frame into a bounded transcript frame. A non-object payload
 *  (defensive — a2a frames are objects) is wrapped so the transcript always reads
 *  a record; the engine `seq` annotation is lifted for dedup/resume when present. */
export function adaptRelayFrame(input: RelayFrameInput): RelayTranscriptFrame {
  const payload: Rec = isRec(input.data) ? input.data : { value: input.data };
  const seq =
    typeof payload.seq === "number" &&
    Number.isSafeInteger(payload.seq) &&
    payload.seq >= 0
      ? payload.seq
      : undefined;
  return {
    seq,
    kind: classifyRelayFrame(input.channel, payload),
    event: input.channel,
    payload,
  };
}

/** Reduce a stream of adapted frames into a bounded transcript, deduping by the
 *  engine `seq` so a reconnect's `since=` replay overlapping the retained tail
 *  yields no second copy (mirrors the engine `/stream` reducer), then ring-capping
 *  at `RELAY_TRANSCRIPT_CAP`. A frame without a seq (e.g. a `gap` control frame)
 *  always appends. */
export interface RelayTranscriptState {
  readonly frames: RelayTranscriptFrame[];
  readonly retainedFrameBytes: number[];
  readonly retainedBytes: number;
  readonly latestSeq?: number;
  readonly reconciliationGeneration: number;
}

export const EMPTY_RELAY_TRANSCRIPT: RelayTranscriptState = {
  frames: [],
  retainedFrameBytes: [],
  retainedBytes: 0,
  reconciliationGeneration: 0,
};

export function relayTranscriptReducer(
  acc: RelayTranscriptState,
  frame: RelayTranscriptFrame,
): RelayTranscriptState {
  // Engine relay sequences are monotone. Rejecting every older/equal sequence is
  // both stronger and cheaper than linearly searching for an exact duplicate on
  // every replayed frame.
  if (
    frame.seq !== undefined &&
    acc.latestSeq !== undefined &&
    frame.seq <= acc.latestSeq
  ) {
    return acc;
  }

  const incomingBytes = relayFrameRetainedBytes(frame);
  const sequenceHole =
    frame.seq !== undefined &&
    acc.latestSeq !== undefined &&
    frame.seq > acc.latestSeq + 1;
  const reconciliationGeneration =
    acc.reconciliationGeneration +
    (sequenceHole || relayFrameForcesReconcile(frame) ? 1 : 0);
  // A single frame that cannot fit the whole per-run budget is presentation data
  // we cannot safely retain. The cursor still advances in the owning query hook,
  // so it is not replayed indefinitely. Preserve any lifecycle signal in the
  // reducer metadata even though the presentation object itself is rejected.
  if (incomingBytes > RELAY_TRANSCRIPT_BYTE_CAP) {
    if (reconciliationGeneration === acc.reconciliationGeneration) {
      return acc;
    }
    return {
      ...acc,
      latestSeq: frame.seq ?? acc.latestSeq,
      reconciliationGeneration,
    };
  }

  let retainedBytes = acc.retainedBytes + incomingBytes;
  let first = 0;
  while (
    first < acc.frames.length &&
    (acc.frames.length - first + 1 > RELAY_TRANSCRIPT_CAP ||
      retainedBytes > RELAY_TRANSCRIPT_BYTE_CAP)
  ) {
    retainedBytes -= acc.retainedFrameBytes[first]!;
    first += 1;
  }

  return {
    frames: [...acc.frames.slice(first), frame],
    retainedFrameBytes: [
      ...acc.retainedFrameBytes.slice(first),
      incomingBytes,
    ],
    retainedBytes,
    latestSeq:
      frame.seq === undefined
        ? acc.latestSeq
        : Math.max(acc.latestSeq ?? frame.seq, frame.seq),
    reconciliationGeneration,
  };
}

const UTF8 = new TextEncoder();

/** Retained UTF-8 size of one adapted frame's JSON representation. The incoming
 * SSE parser applies its own wire ceiling before JSON parsing; this measurement
 * governs the longer-lived browser object graph. */
export function relayFrameRetainedBytes(frame: RelayTranscriptFrame): number {
  try {
    return UTF8.encode(JSON.stringify(frame)).byteLength;
  } catch {
    // Wire JSON cannot be cyclic. Fail closed for any non-wire caller rather than
    // allowing an unmeasurable object into the retained transcript.
    return RELAY_TRANSCRIPT_BYTE_CAP + 1;
  }
}

/** Exact retained-byte accounting for tests and diagnostics. */
export function relayTranscriptRetainedBytes(transcript: RelayTranscriptState): number {
  return transcript.retainedBytes;
}

/** Sticky count of relay discontinuity/lifecycle signals observed by the stream
 * reducer. It survives presentation-ring eviction, so a dense batch cannot hide
 * a gap before React schedules authoritative reconciliation. */
export function relayTranscriptReconciliationGeneration(
  transcript: RelayTranscriptState,
): number {
  return transcript.reconciliationGeneration;
}

/** True when a frame is an honest signal to reconcile from `run-status` rather
 * than trust the relay: upstream degradation, loss, a run fault, or a
 * presentation-only terminal signal. */
export function relayFrameForcesReconcile(frame: RelayTranscriptFrame): boolean {
  return (
    frame.kind === "degraded" ||
    frame.kind === "gap" ||
    frame.kind === "terminal" ||
    frame.kind === "error"
  );
}

/** True when the relay presents a terminal signal. This is a reconciliation
 * trigger only; authoritative lifecycle remains the run-status snapshot. */
export function relayFrameIsTerminal(frame: RelayTranscriptFrame): boolean {
  return frame.kind === "terminal";
}

/** The largest engine `seq` seen in a transcript, for computing the `since=`
 *  resume point on a reconnect. `undefined` when no frame carried a seq. */
export function latestRelaySeq(
  frames: readonly RelayTranscriptFrame[],
): number | undefined {
  let latest: number | undefined;
  for (const frame of frames) {
    if (frame.seq !== undefined && (latest === undefined || frame.seq > latest)) {
      latest = frame.seq;
    }
  }
  return latest;
}

// --- tolerant payload field accessors (a2a `graph/events.py` shapes) -------------
// Every frame payload passes through verbatim (wire values stay as served), so a
// consumer reads named fields through these tolerant accessors rather than trusting
// a raw shape. Each returns a safe fallback for a missing/mistyped field.

const asStr = (v: unknown): string => (typeof v === "string" ? v : "");

/** The emitting agent id (`agent_id`; `""` for team-scoped frames). */
export function relayAgentId(frame: RelayTranscriptFrame): string {
  return asStr(frame.payload.agent_id);
}

/** The agent lifecycle state on an `agent_status` frame (`working`/`idle`/…). */
export function relayAgentState(frame: RelayTranscriptFrame): string {
  return asStr(frame.payload.state);
}

/** A stream chunk's text content (`message_chunk`/`thought_chunk` carry `content`;
 *  a2a's own `finish_reason` marks the end of a message stream). */
export function relayContent(frame: RelayTranscriptFrame): string {
  return asStr(frame.payload.content);
}

/** The stream id grouping a run of chunks into one message/thought (`message_id`). */
export function relayMessageId(frame: RelayTranscriptFrame): string {
  return asStr(frame.payload.message_id);
}

/** The tool-call correlation id on `tool_call_start`/`tool_call_update`. */
export function relayToolCallId(frame: RelayTranscriptFrame): string {
  return asStr(frame.payload.tool_call_id);
}

/** The tool title (`tool_call_start` sets it; an update may refine it). */
export function relayToolTitle(frame: RelayTranscriptFrame): string {
  return asStr(frame.payload.title);
}

/** The tool-call status (`pending`/`running`/`completed`/`failed`); `""` when the
 *  frame carries no status (an early update). */
export function relayToolStatus(frame: RelayTranscriptFrame): string {
  return asStr(frame.payload.status);
}

/** Flatten a tool-call frame's `content` list into one bounded text blob — the
 *  args on start, the result on update. The a2a `ToolCallContent` union (verified
 *  against `api/schemas/events.py`) has THREE variants, so reading only `.text`
 *  would silently drop a file-EDIT block — exactly what a coding team emits:
 *   - `text`     → `{content_type:"text", text}`               → the text
 *   - `diff`     → `{content_type:"diff", path, new_text, …}`  → path + post-edit
 *   - `terminal` → `{content_type:"terminal", terminal_id}`    → no inline text
 *     (the output streams separately), so it contributes nothing here. */
export function relayToolContentText(frame: RelayTranscriptFrame): string {
  const content = frame.payload.content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!isRec(part)) return "";
      if (part.content_type === "diff") {
        const path = asStr(part.path);
        const next = asStr(part.new_text);
        return [path, next].filter((s) => s.length > 0).join("\n");
      }
      // `text` (and any unknown future variant) reads its `text` field; `terminal`
      // has none and falls through to the empty string.
      return asStr(part.text);
    })
    .filter((t) => t.length > 0)
    .join("\n");
}

/** An `error` frame's plain message (a2a `ErrorOccurred.message`). */
export function relayErrorMessage(frame: RelayTranscriptFrame): string {
  return asStr(frame.payload.message);
}
