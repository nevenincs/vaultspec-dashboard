import { describe, expect, it } from "vitest";

import {
  EMPTY_RELAY_TRANSCRIPT,
  RELAY_TRANSCRIPT_BYTE_CAP,
  RELAY_TRANSCRIPT_CAP,
  adaptRelayFrame,
  classifyRelayFrame,
  latestRelaySeq,
  relayAgentId,
  relayAgentState,
  relayContent,
  relayErrorMessage,
  relayFrameForcesReconcile,
  relayFrameRetainedBytes,
  relayFrameIsTerminal,
  relayMessageId,
  relayToolCallId,
  relayToolContentText,
  relayToolStatus,
  relayToolTitle,
  relayTranscriptReducer,
  relayTranscriptReconciliationGeneration,
  relayTranscriptRetainedBytes,
  type RelayTranscriptFrame,
  type RelayTranscriptState,
} from "./a2aRelay";

describe("classifyRelayFrame", () => {
  it("maps the a2a + engine event vocabulary to bounded kinds", () => {
    expect(classifyRelayFrame("heartbeat", {})).toBe("heartbeat");
    expect(classifyRelayFrame("thread_terminal", { status: "completed" })).toBe(
      "terminal",
    );
    expect(classifyRelayFrame("gap", { lagged: 3 })).toBe("gap");
    expect(classifyRelayFrame("relay_degraded", { degraded: true })).toBe("degraded");
    expect(classifyRelayFrame("progress_dropped", { type: "progress_dropped" })).toBe(
      "dropped",
    );
    expect(classifyRelayFrame("agent_message", { type: "token" })).toBe("token");
    expect(classifyRelayFrame("tool_call", { type: "tool_permission" })).toBe(
      "tool_call",
    );
    expect(classifyRelayFrame("status", { degraded: true })).toBe("degraded");
    expect(classifyRelayFrame("status", { status_snapshot: {} })).toBe("status");
    // An unrecognized future kind degrades to progress, never throws.
    expect(classifyRelayFrame("some_new_node", {})).toBe("progress");
  });

  it("routes the a2a graph-event vocabulary to its rendering lanes", () => {
    // Reasoning MUST NOT fall to the generic `progress` bucket — it drives the
    // "Thinking…" section and shares no substring with the tool/token lanes.
    expect(classifyRelayFrame("thought_chunk", { type: "thought_chunk" })).toBe(
      "thought",
    );
    expect(classifyRelayFrame("message_chunk", { type: "message_chunk" })).toBe(
      "token",
    );
    expect(classifyRelayFrame("tool_call_start", { type: "tool_call_start" })).toBe(
      "tool_call",
    );
    expect(classifyRelayFrame("tool_call_update", { type: "tool_call_update" })).toBe(
      "tool_call",
    );
    expect(classifyRelayFrame("agent_status", { type: "agent_status" })).toBe("status");
    expect(classifyRelayFrame("team_status", { type: "team_status" })).toBe("status");
    expect(classifyRelayFrame("error", { type: "error", code: "INGEST_ERROR" })).toBe(
      "error",
    );
  });
});

describe("relay payload accessors", () => {
  const frame = (payload: Record<string, unknown>): RelayTranscriptFrame => ({
    kind: "progress",
    event: "x",
    payload,
  });

  it("reads the a2a event fields tolerantly with safe fallbacks", () => {
    expect(relayAgentId(frame({ agent_id: "mock-planner" }))).toBe("mock-planner");
    expect(relayAgentId(frame({}))).toBe("");
    expect(relayAgentState(frame({ state: "working" }))).toBe("working");
    expect(relayContent(frame({ content: "hi" }))).toBe("hi");
    expect(relayMessageId(frame({ message_id: "m1" }))).toBe("m1");
    expect(relayToolCallId(frame({ tool_call_id: "tc1" }))).toBe("tc1");
    expect(relayToolTitle(frame({ title: "read_file" }))).toBe("read_file");
    expect(relayToolStatus(frame({ status: "running" }))).toBe("running");
    expect(relayErrorMessage(frame({ message: "boom" }))).toBe("boom");
    // A mistyped field never throws — it degrades to the empty fallback.
    expect(relayContent(frame({ content: 42 }))).toBe("");
  });

  it("flattens all three a2a ToolCallContent variants (text/diff/terminal)", () => {
    // Verified against the a2a wire schema (api/schemas/events.py): a `diff` block
    // carries `path`/`new_text` (NOT `text`) — a coding team's edit output — so a
    // text-only reader would silently drop it.
    const text = relayToolContentText(
      frame({
        content: [
          { content_type: "text", text: '{"path":"a.ts"}' },
          { content_type: "diff", path: "a.ts", old_text: "x", new_text: "y" },
          { content_type: "terminal", terminal_id: "t1" },
        ],
      }),
    );
    // text block, then the diff's path + post-edit text; the terminal ref (no inline
    // text) contributes nothing.
    expect(text).toBe('{"path":"a.ts"}\na.ts\ny');
    expect(relayToolContentText(frame({ content: "not-a-list" }))).toBe("");
  });
});

describe("adaptRelayFrame", () => {
  it("lifts the engine seq annotation and passes the payload through", () => {
    const frame = adaptRelayFrame({
      channel: "progress",
      data: { seq: 7, phase: "research", type: "progress" },
    });
    expect(frame.seq).toBe(7);
    expect(frame.kind).toBe("progress");
    expect(frame.event).toBe("progress");
    expect(frame.payload.phase).toBe("research");
  });

  it("wraps a non-object payload defensively", () => {
    const frame = adaptRelayFrame({ channel: "gap", data: "raw-string" });
    expect(frame.payload.value).toBe("raw-string");
    expect(frame.seq).toBeUndefined();
    expect(frame.kind).toBe("gap");
  });

  it("rejects non-finite, fractional, negative, and unsafe resume sequences", () => {
    for (const seq of [Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5, 2 ** 53]) {
      expect(
        adaptRelayFrame({ channel: "message_chunk", data: { seq } }).seq,
      ).toBeUndefined();
    }
  });
});

describe("relayTranscriptReducer", () => {
  it("admits only monotone seqs and ring-caps the transcript", () => {
    let acc: RelayTranscriptState = EMPTY_RELAY_TRANSCRIPT;
    // A reconnect replay of seq 0..2, then a duplicate of seq 1.
    for (const seq of [0, 1, 2, 1]) {
      acc = relayTranscriptReducer(acc, {
        seq,
        kind: "token",
        event: "token",
        payload: { seq },
      });
    }
    expect(acc.frames.map((f) => f.seq)).toEqual([0, 1, 2]);

    // An unseen but older sequence is also rejected: engine seq is monotone, so
    // admitting it would regress the resume cursor and presentation order.
    acc = relayTranscriptReducer(acc, {
      seq: 0.5,
      kind: "token",
      event: "token",
      payload: { seq: 0.5 },
    });
    expect(acc.frames.map((f) => f.seq)).toEqual([0, 1, 2]);

    // Overflow the cap: only the last RELAY_TRANSCRIPT_CAP frames are retained.
    acc = EMPTY_RELAY_TRANSCRIPT;
    for (let seq = 0; seq < RELAY_TRANSCRIPT_CAP + 20; seq++) {
      acc = relayTranscriptReducer(acc, {
        seq,
        kind: "token",
        event: "token",
        payload: { seq },
      });
    }
    expect(acc.frames.length).toBe(RELAY_TRANSCRIPT_CAP);
    expect(acc.frames[0]!.seq).toBe(20);
  });

  it("always appends a seq-less control frame (gap)", () => {
    const acc = relayTranscriptReducer(EMPTY_RELAY_TRANSCRIPT, {
      kind: "gap",
      event: "gap",
      payload: { lagged: 2 },
    });
    expect(acc.frames.length).toBe(1);
  });

  it("evicts by UTF-8 bytes and rejects a single over-budget frame", () => {
    let acc: RelayTranscriptState = EMPTY_RELAY_TRANSCRIPT;
    let seq = 0;
    const payload = "é".repeat(80_000);
    while (seq < 40) {
      acc = relayTranscriptReducer(acc, {
        seq,
        kind: "token",
        event: "message_chunk",
        payload: { seq, content: payload },
      });
      seq += 1;
    }
    expect(relayTranscriptRetainedBytes(acc)).toBeLessThanOrEqual(
      RELAY_TRANSCRIPT_BYTE_CAP,
    );
    expect(acc.frames.length).toBeLessThan(40);
    expect(acc.frames.at(-1)?.seq).toBe(39);

    const before = acc;
    const oversized: RelayTranscriptFrame = {
      seq: 40,
      kind: "token",
      event: "message_chunk",
      payload: { seq: 40, content: "x".repeat(RELAY_TRANSCRIPT_BYTE_CAP) },
    };
    expect(relayFrameRetainedBytes(oversized)).toBeGreaterThan(
      RELAY_TRANSCRIPT_BYTE_CAP,
    );
    expect(relayTranscriptReducer(acc, oversized)).toBe(before);
  });

  it("keeps a gap generation after a dense batch evicts the signal", () => {
    let acc: RelayTranscriptState = EMPTY_RELAY_TRANSCRIPT;
    acc = relayTranscriptReducer(acc, {
      seq: 0,
      kind: "gap",
      event: "gap",
      payload: { reason: "budget pressure" },
    });
    for (let seq = 1; seq <= RELAY_TRANSCRIPT_CAP + 32; seq += 1) {
      acc = relayTranscriptReducer(acc, {
        seq,
        kind: "token",
        event: "message_chunk",
        payload: { seq, content: "x" },
      });
    }

    expect(acc.frames.some((frame) => frame.kind === "gap")).toBe(false);
    expect(relayTranscriptReconciliationGeneration(acc)).toBe(1);
  });
});

describe("degradation + terminal signals", () => {
  it("forces reconcile on a gap or a degradation, terminal only on terminal", () => {
    const gap: RelayTranscriptFrame = { kind: "gap", event: "gap", payload: {} };
    const degraded: RelayTranscriptFrame = {
      kind: "degraded",
      event: "relay_degraded",
      payload: {},
    };
    const token: RelayTranscriptFrame = {
      kind: "token",
      event: "token",
      payload: {},
    };
    const terminal: RelayTranscriptFrame = {
      kind: "terminal",
      event: "thread_terminal",
      payload: {},
    };
    const error: RelayTranscriptFrame = {
      kind: "error",
      event: "error",
      payload: {},
    };
    expect(relayFrameForcesReconcile(gap)).toBe(true);
    expect(relayFrameForcesReconcile(degraded)).toBe(true);
    expect(relayFrameForcesReconcile(token)).toBe(false);
    expect(relayFrameForcesReconcile(terminal)).toBe(true);
    expect(relayFrameForcesReconcile(error)).toBe(true);
    expect(relayFrameIsTerminal(terminal)).toBe(true);
    expect(relayFrameIsTerminal(token)).toBe(false);
  });
});

describe("latestRelaySeq", () => {
  it("returns the largest seq or undefined when none carry one", () => {
    expect(
      latestRelaySeq([
        { seq: 3, kind: "token", event: "t", payload: {} },
        { seq: 9, kind: "token", event: "t", payload: {} },
        { kind: "gap", event: "gap", payload: {} },
      ]),
    ).toBe(9);
    expect(
      latestRelaySeq([{ kind: "gap", event: "gap", payload: {} }]),
    ).toBeUndefined();
  });
});
