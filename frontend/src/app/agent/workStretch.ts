// The WORK STRETCH: one collapsed disclosure per turn's agent work
// (agent-panel-shell-integration D4b; research C2/C3). Pure — the render tests
// drive it directly.
//
// The rule both reference products converge on: tool calls and reasoning are not
// separate turns and not nested cards. They collapse to a SINGLE elapsed-labelled
// row per stretch of work ("Worked for 1m 5s"), which expands to a flat
// chronological timeline of icon+label rows, one level deep. Reasoning has no lane
// of its own (C3) — it interleaves with the tool steps in that one timeline.
//
// Ordering is by recorded time, which is honest about what it is: `recordedAtMs`
// is when the client recorded a SERVED envelope, not a server clock. It is the only
// ordering signal either producer carries, and it is the same one the transcript
// reconciler already sorts tool calls by.
//
// Layer law: no wire, no React, no stores — plain functions over already-read state.

import type {
  AgentThinkingSegment,
  AgentToolCallRecord,
} from "../../stores/view/agentTranscript";

/** One row of the expanded timeline. `thinking` is reasoning narration; `tool` is a
 *  dispatched tool step carrying its own served status and (while open) its inline
 *  permission prompt. */
export type WorkStretchEntry =
  | { kind: "thinking"; id: string; segment: AgentThinkingSegment }
  | { kind: "tool"; id: string; record: AgentToolCallRecord };

export interface WorkStretch {
  entries: WorkStretchEntry[];
  /** Wall time the stretch spans, or null when it cannot be measured honestly —
   *  a single entry has no span, and a thinking-only stretch carries a duration
   *  only when its producer recorded one. */
  elapsedMs: number | null;
  /** How many TOOL steps the stretch contains (the count the collapsed row names
   *  when there is no measurable elapsed time). */
  toolCount: number;
}

/** The empty stretch — nothing worked, so the disclosure does not render at all. */
export const EMPTY_WORK_STRETCH: WorkStretch = Object.freeze({
  entries: [],
  elapsedMs: null,
  toolCount: 0,
});

/**
 * Fold a turn's reasoning and tool calls into its one work stretch.
 *
 * Reasoning sorts to the FRONT of the tool calls it precedes by timestamp, which is
 * ordinarily the head of the stretch — an agent narrates before it acts. It is not
 * special-cased there: if a producer ever records reasoning mid-stretch, it
 * interleaves where it belongs, which is exactly what C3 describes.
 */
export function deriveWorkStretch(
  thinking: AgentThinkingSegment | null,
  toolCalls: readonly AgentToolCallRecord[],
): WorkStretch {
  const hasThinking = thinking !== null && thinking.text.length > 0;
  if (!hasThinking && toolCalls.length === 0) return EMPTY_WORK_STRETCH;

  const ordered = [...toolCalls].sort((a, b) => a.recordedAtMs - b.recordedAtMs);
  const entries: WorkStretchEntry[] = [];
  if (hasThinking) {
    entries.push({
      kind: "thinking",
      id: `thinking:${thinking.runId}`,
      segment: thinking,
    });
  }
  for (const record of ordered) {
    entries.push({ kind: "tool", id: `tool:${record.toolCallId}`, record });
  }

  // The span is measured across the tool steps, the only entries carrying a
  // recorded time. With one step there is no span to measure, so a thinking
  // segment's own recorded duration is the honest fallback — and with neither,
  // the elapsed label is simply absent rather than zero.
  const first = ordered[0];
  const last = ordered.at(-1);
  const span =
    first !== undefined && last !== undefined && last.recordedAtMs > first.recordedAtMs
      ? last.recordedAtMs - first.recordedAtMs
      : null;
  const elapsedMs = span ?? (hasThinking ? thinking.durationMs : null);

  return { entries, elapsedMs, toolCount: ordered.length };
}

/** Whether a stretch has anything to disclose. A stretch with no entries renders
 *  nothing at all — never an empty "Worked for" row, which would claim work that
 *  did not happen. */
export function workStretchIsEmpty(stretch: WorkStretch): boolean {
  return stretch.entries.length === 0;
}

/** Whether any tool step in the stretch is holding an OPEN permission request. The
 *  disclosure auto-expands on this: a prompt the user must answer may never be
 *  hidden behind a collapsed row (the inline prompt is the non-modal law's whole
 *  point — it has to be reachable where it parks). */
export function workStretchAwaitsPermission(stretch: WorkStretch): boolean {
  return stretch.entries.some(
    (entry) =>
      entry.kind === "tool" &&
      entry.record.permission === null &&
      entry.record.disposition === "awaiting_permission",
  );
}
