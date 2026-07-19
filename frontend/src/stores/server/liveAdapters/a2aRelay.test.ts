import { describe, expect, it } from "vitest";

import {
  RELAY_TRANSCRIPT_CAP,
  adaptRelayFrame,
  classifyRelayFrame,
  framesIncludeTerminal,
  latestRelaySeq,
  relayAgentId,
  relayAgentState,
  relayContent,
  relayErrorMessage,
  relayFrameForcesReconcile,
  relayFrameIsTerminal,
  relayMessageId,
  relayToolCallId,
  relayToolContentText,
  relayToolStatus,
  relayToolTitle,
  relayTranscriptReducer,
  type RelayTranscriptFrame,
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
});

describe("relayTranscriptReducer", () => {
  it("dedups by seq and ring-caps the transcript", () => {
    let acc: RelayTranscriptFrame[] = [];
    // A reconnect replay of seq 0..2, then a duplicate of seq 1.
    for (const seq of [0, 1, 2, 1]) {
      acc = relayTranscriptReducer(acc, {
        seq,
        kind: "token",
        event: "token",
        payload: { seq },
      });
    }
    expect(acc.map((f) => f.seq)).toEqual([0, 1, 2]);

    // Overflow the cap: only the last RELAY_TRANSCRIPT_CAP frames are retained.
    acc = [];
    for (let seq = 0; seq < RELAY_TRANSCRIPT_CAP + 20; seq++) {
      acc = relayTranscriptReducer(acc, {
        seq,
        kind: "token",
        event: "token",
        payload: { seq },
      });
    }
    expect(acc.length).toBe(RELAY_TRANSCRIPT_CAP);
    expect(acc[0].seq).toBe(20);
  });

  it("always appends a seq-less control frame (gap)", () => {
    const acc = relayTranscriptReducer([], {
      kind: "gap",
      event: "gap",
      payload: { lagged: 2 },
    });
    expect(acc.length).toBe(1);
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
    expect(relayFrameForcesReconcile(gap)).toBe(true);
    expect(relayFrameForcesReconcile(degraded)).toBe(true);
    expect(relayFrameForcesReconcile(token)).toBe(false);
    expect(relayFrameIsTerminal(terminal)).toBe(true);
    expect(relayFrameIsTerminal(token)).toBe(false);
  });

  it("framesIncludeTerminal is STICKY — a post-terminal heartbeat stays terminal", () => {
    const terminal: RelayTranscriptFrame = {
      seq: 5,
      kind: "terminal",
      event: "thread_terminal",
      payload: {},
    };
    const heartbeat: RelayTranscriptFrame = {
      seq: 6,
      kind: "heartbeat",
      event: "heartbeat",
      payload: {},
    };
    // The relay never closes: a heartbeat can arrive AFTER terminal. A last-frame
    // check would flip the run back to live; the sticky read must not.
    expect(framesIncludeTerminal([terminal, heartbeat])).toBe(true);
    expect(relayFrameIsTerminal(heartbeat)).toBe(false); // the last frame alone
    expect(framesIncludeTerminal([heartbeat])).toBe(false);
    expect(framesIncludeTerminal([])).toBe(false);
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
