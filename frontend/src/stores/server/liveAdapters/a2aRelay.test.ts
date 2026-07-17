import { describe, expect, it } from "vitest";

import {
  RELAY_TRANSCRIPT_CAP,
  adaptRelayFrame,
  classifyRelayFrame,
  latestRelaySeq,
  relayFrameForcesReconcile,
  relayFrameIsTerminal,
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
