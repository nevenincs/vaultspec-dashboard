import { describe, expect, it } from "vitest";

import type { RelayTranscriptFrame } from "../../stores/server/liveAdapters/a2aRelay";
import { adaptRelayFrame } from "../../stores/server/liveAdapters/a2aRelay";
import { assembleTeamRun, TEAM_RUN_ENTRY_CAP } from "./teamRun";

// Build a frame the way the wire delivers it: through `adaptRelayFrame`, so the
// classification the reducer switches on is the REAL adapter's output — never a
// hand-set kind. `data` mirrors the a2a `graph/events.py` wire shapes.
function wire(event: string, data: Record<string, unknown>): RelayTranscriptFrame {
  return adaptRelayFrame({ channel: event, data });
}

describe("assembleTeamRun", () => {
  it("derives active agents from agent_status/team_status with no entries (the mock team)", () => {
    const view = assembleTeamRun([
      wire("agent_status", {
        seq: 1,
        type: "agent_status",
        agent_id: "mock-planner",
        state: "working",
      }),
      wire("agent_status", {
        seq: 2,
        type: "agent_status",
        agent_id: "mock-coder",
        state: "idle",
      }),
    ]);
    expect(view.entries).toEqual([]);
    expect(view.activeAgents).toEqual(["mock-planner"]);
    expect(view.terminal).toBe(false);
    expect(view.error).toBeNull();
  });

  it("groups a thought_chunk stream into one live Thinking entry", () => {
    const view = assembleTeamRun([
      wire("thought_chunk", {
        seq: 1,
        type: "thought_chunk",
        agent_id: "planner",
        message_id: "m1",
        content: "Let me ",
      }),
      wire("thought_chunk", {
        seq: 2,
        type: "thought_chunk",
        agent_id: "planner",
        message_id: "m1",
        content: "think.",
      }),
    ]);
    expect(view.entries).toHaveLength(1);
    const entry = view.entries[0]!;
    expect(entry.kind).toBe("thinking");
    if (entry.kind === "thinking") {
      expect(entry.text).toBe("Let me think.");
      expect(entry.agentId).toBe("planner");
      expect(entry.live).toBe(true); // most-recent stream, run not terminal
    }
  });

  it("merges tool_call_start + tool_call_update by tool_call_id", () => {
    const view = assembleTeamRun([
      wire("tool_call_start", {
        seq: 1,
        type: "tool_call_start",
        agent_id: "coder",
        tool_call_id: "tc1",
        title: "read_file",
        status: "pending",
        content: [{ content_type: "text", text: '{"path":"a.ts"}' }],
      }),
      wire("tool_call_update", {
        seq: 2,
        type: "tool_call_update",
        tool_call_id: "tc1",
        status: "completed",
        content: [{ content_type: "text", text: "ok" }],
      }),
    ]);
    expect(view.entries).toHaveLength(1);
    const entry = view.entries[0]!;
    expect(entry.kind).toBe("tool");
    if (entry.kind === "tool") {
      expect(entry.title).toBe("read_file");
      expect(entry.status).toBe("completed");
      expect(entry.args).toBe('{"path":"a.ts"}');
      expect(entry.result).toBe("ok");
      expect(entry.live).toBe(false); // completed → settled
    }
  });

  it("groups a message_chunk stream into one final-text entry", () => {
    const view = assembleTeamRun([
      wire("message_chunk", {
        seq: 1,
        type: "message_chunk",
        agent_id: "reviewer",
        message_id: "a1",
        content: "Looks ",
      }),
      wire("message_chunk", {
        seq: 2,
        type: "message_chunk",
        agent_id: "reviewer",
        message_id: "a1",
        content: "good.",
      }),
    ]);
    expect(view.entries).toHaveLength(1);
    const entry = view.entries[0]!;
    expect(entry.kind).toBe("message");
    if (entry.kind === "message") expect(entry.text).toBe("Looks good.");
  });

  it("keeps entries in first-appearance order across kinds", () => {
    const view = assembleTeamRun([
      wire("thought_chunk", {
        seq: 1,
        type: "thought_chunk",
        agent_id: "p",
        message_id: "t1",
        content: "hmm",
      }),
      wire("tool_call_start", {
        seq: 2,
        type: "tool_call_start",
        agent_id: "p",
        tool_call_id: "tc1",
        title: "grep",
        status: "running",
      }),
      wire("message_chunk", {
        seq: 3,
        type: "message_chunk",
        agent_id: "p",
        message_id: "a1",
        content: "done",
      }),
    ]);
    expect(view.entries.map((e) => e.kind)).toEqual(["thinking", "tool", "message"]);
  });

  it("collapses live chrome and clears active agents on a terminal frame", () => {
    const view = assembleTeamRun([
      wire("agent_status", {
        seq: 1,
        type: "agent_status",
        agent_id: "planner",
        state: "working",
      }),
      wire("thought_chunk", {
        seq: 2,
        type: "thought_chunk",
        agent_id: "planner",
        message_id: "m1",
        content: "reasoning",
      }),
      wire("tool_call_start", {
        seq: 3,
        type: "tool_call_start",
        agent_id: "planner",
        tool_call_id: "tc1",
        title: "grep",
        status: "running",
      }),
      wire("thread_terminal", { seq: 4, type: "thread_terminal", status: "completed" }),
    ]);
    expect(view.terminal).toBe(true);
    expect(view.activeAgents).toEqual([]);
    for (const entry of view.entries) expect(entry.live).toBe(false);
  });

  it("surfaces a run error frame honestly", () => {
    const view = assembleTeamRun([
      wire("error", {
        seq: 1,
        type: "error",
        code: "INGEST_ERROR",
        message: "Graph event stream failed unexpectedly",
      }),
    ]);
    expect(view.error).toBe("Graph event stream failed unexpectedly");
  });

  it("bounds the rendered entry count", () => {
    const frames: RelayTranscriptFrame[] = [];
    for (let i = 0; i < TEAM_RUN_ENTRY_CAP + 20; i++) {
      frames.push(
        wire("tool_call_start", {
          seq: i,
          type: "tool_call_start",
          agent_id: "p",
          tool_call_id: `tc${i}`,
          title: "grep",
          status: "completed",
        }),
      );
    }
    expect(assembleTeamRun(frames).entries.length).toBe(TEAM_RUN_ENTRY_CAP);
  });
});
