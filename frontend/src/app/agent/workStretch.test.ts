// Work-stretch folding rules (research C2/C3; agent-panel-shell-integration D4b).
// Pure. The transcript grammar's whole claim is that a turn's work is ONE thing the
// reader opens, so the rules worth pinning are the ones that would quietly break
// that: a second disclosure, a fabricated duration, or a permission prompt hidden
// behind a collapsed row.

import { describe, expect, it } from "vitest";

import type {
  AgentThinkingSegment,
  AgentToolCallRecord,
} from "../../stores/view/agentTranscript";
import {
  deriveWorkStretch,
  workStretchAwaitsPermission,
  workStretchIsEmpty,
} from "./workStretch";

function tool(
  overrides: Partial<AgentToolCallRecord> & {
    toolCallId: string;
    recordedAtMs: number;
  },
): AgentToolCallRecord {
  return {
    runId: "run-1",
    tool: "search",
    disposition: "dispatched",
    interruptId: null,
    permission: null,
    input: null,
    result: null,
    detail: null,
    ...overrides,
  };
}

function thinking(overrides: Partial<AgentThinkingSegment> = {}): AgentThinkingSegment {
  return { runId: "run-1", text: "weighing options", durationMs: null, ...overrides };
}

describe("deriveWorkStretch", () => {
  it("is empty when the turn did no work, so no disclosure renders at all", () => {
    // An empty "Worked for" row would claim work that did not happen.
    expect(workStretchIsEmpty(deriveWorkStretch(null, []))).toBe(true);
    expect(workStretchIsEmpty(deriveWorkStretch(thinking({ text: "" }), []))).toBe(
      true,
    );
  });

  it("interleaves reasoning with tool steps in ONE flat timeline", () => {
    // C3: reasoning has no lane of its own. It is an entry in the same list.
    const stretch = deriveWorkStretch(thinking(), [
      tool({ toolCallId: "b", recordedAtMs: 2_000 }),
      tool({ toolCallId: "a", recordedAtMs: 1_000 }),
    ]);
    expect(stretch.entries.map((entry) => entry.kind)).toEqual([
      "thinking",
      "tool",
      "tool",
    ]);
    // Tool steps sort by recorded time, not by the order they arrived in.
    expect(
      stretch.entries
        .filter((entry) => entry.kind === "tool")
        .map((entry) => (entry.kind === "tool" ? entry.record.toolCallId : null)),
    ).toEqual(["a", "b"]);
    expect(stretch.toolCount).toBe(2);
  });

  it("measures elapsed across the stretch's tool steps", () => {
    const stretch = deriveWorkStretch(null, [
      tool({ toolCallId: "a", recordedAtMs: 1_000 }),
      tool({ toolCallId: "b", recordedAtMs: 66_000 }),
    ]);
    expect(stretch.elapsedMs).toBe(65_000);
  });

  it("reports no elapsed time rather than a fabricated zero", () => {
    // One step spans nothing. Rendering "0s" would assert a measurement that was
    // never taken, so the label falls back to the served COUNT instead.
    const single = deriveWorkStretch(null, [
      tool({ toolCallId: "a", recordedAtMs: 5 }),
    ]);
    expect(single.elapsedMs).toBeNull();
    expect(single.toolCount).toBe(1);

    // Same for identical timestamps — no span was observed.
    const instant = deriveWorkStretch(null, [
      tool({ toolCallId: "a", recordedAtMs: 5 }),
      tool({ toolCallId: "b", recordedAtMs: 5 }),
    ]);
    expect(instant.elapsedMs).toBeNull();
  });

  it("falls back to the producer's own recorded thinking duration", () => {
    // With no measurable tool span, a duration the producer actually recorded is
    // still real elapsed time and may be shown.
    expect(deriveWorkStretch(thinking({ durationMs: 1_200 }), []).elapsedMs).toBe(
      1_200,
    );
    expect(deriveWorkStretch(thinking({ durationMs: null }), []).elapsedMs).toBeNull();
  });
});

describe("workStretchAwaitsPermission", () => {
  it("is true only for an OPEN request", () => {
    // The disclosure auto-expands on this: a decision the run is blocked on may
    // never sit behind a collapsed row.
    const open = deriveWorkStretch(null, [
      tool({
        toolCallId: "a",
        recordedAtMs: 1,
        disposition: "awaiting_permission",
        interruptId: "int-1",
      }),
    ]);
    expect(workStretchAwaitsPermission(open)).toBe(true);
  });

  it("is false once the request is decided, and for ordinary steps", () => {
    const decided = deriveWorkStretch(null, [
      tool({
        toolCallId: "a",
        recordedAtMs: 1,
        disposition: "awaiting_permission",
        permission: "granted",
      }),
    ]);
    expect(workStretchAwaitsPermission(decided)).toBe(false);

    const ordinary = deriveWorkStretch(null, [
      tool({ toolCallId: "a", recordedAtMs: 1 }),
    ]);
    expect(workStretchAwaitsPermission(ordinary)).toBe(false);
    expect(workStretchAwaitsPermission(deriveWorkStretch(null, []))).toBe(false);
  });
});
