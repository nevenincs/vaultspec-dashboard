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
    const view = assembleTeamRun(
      [
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
      ],
      false,
    );
    expect(view.entries).toEqual([]);
    expect(view.activeAgents).toEqual(["mock-planner"]);
    expect(view.terminal).toBe(false);
    expect(view.error).toBeNull();
  });

  it("groups a thought_chunk stream into one live Thinking entry", () => {
    const view = assembleTeamRun(
      [
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
      ],
      false,
    );
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
    const view = assembleTeamRun(
      [
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
      ],
      false,
    );
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

  it("labels a first-seen tool_call_update (dropped start) content as result, not args", () => {
    // The `tool_call_start` was evicted/dropped; the first frame we see is a
    // completed update. Its content is a RESULT — labeling it `args` would lie.
    const view = assembleTeamRun(
      [
        wire("tool_call_update", {
          seq: 5,
          type: "tool_call_update",
          agent_id: "coder",
          tool_call_id: "tc9",
          status: "completed",
          content: [{ content_type: "text", text: "42 rows" }],
        }),
      ],
      false,
    );
    expect(view.entries).toHaveLength(1);
    const entry = view.entries[0]!;
    expect(entry.kind).toBe("tool");
    if (entry.kind === "tool") {
      expect(entry.args).toBeNull();
      expect(entry.result).toBe("42 rows");
      expect(entry.status).toBe("completed");
    }
  });

  it("groups a message_chunk stream into one final-text entry", () => {
    const view = assembleTeamRun(
      [
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
      ],
      false,
    );
    expect(view.entries).toHaveLength(1);
    const entry = view.entries[0]!;
    expect(entry.kind).toBe("message");
    if (entry.kind === "message") expect(entry.text).toBe("Looks good.");
  });

  it("keeps entries in first-appearance order across kinds", () => {
    const view = assembleTeamRun(
      [
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
      ],
      false,
    );
    expect(view.entries.map((e) => e.kind)).toEqual(["thinking", "tool", "message"]);
  });

  it("ignores relay terminal authority until run-status confirms terminal", () => {
    const view = assembleTeamRun(
      [
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
        wire("thread_terminal", {
          seq: 4,
          type: "thread_terminal",
          status: "completed",
        }),
      ],
      false,
    );
    expect(view.terminal).toBe(false);
    expect(view.activeAgents).toEqual(["planner"]);
    expect(view.entries.some((entry) => entry.live)).toBe(true);

    const confirmed = assembleTeamRun(
      [
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
        wire("thread_terminal", {
          seq: 4,
          type: "thread_terminal",
          status: "completed",
        }),
      ],
      true,
    );
    expect(confirmed.terminal).toBe(true);
    expect(confirmed.activeAgents).toEqual([]);
    for (const entry of confirmed.entries) expect(entry.live).toBe(false);
  });

  it("surfaces a run error frame honestly", () => {
    const view = assembleTeamRun(
      [
        wire("error", {
          seq: 1,
          type: "error",
          code: "INGEST_ERROR",
          message: "Graph event stream failed unexpectedly",
        }),
      ],
      false,
    );
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
    expect(assembleTeamRun(frames, false).entries.length).toBe(TEAM_RUN_ENTRY_CAP);
  });
});

// GOLDEN FIXTURE — verbatim frame payloads CAPTURED LIVE from a real
// `mock-autonomous` run over the a2a gateway's `/v1/runs/{id}/stream` (2026-07-18),
// so the reducer is proven against actual wire bytes, not hand-authored shapes.
// The `agents[]` roster carries `role`/`display_name`/`description` the reducer
// must ignore, reading only `agent_id`/`state` — this fixture locks that.
const REAL_AGENT_STATUS_WORKING = {
  api_version: "v1",
  thread_id: "d262e49f084f4dedbae85596b1927e26",
  agent_id: "mock-coder-success",
  timestamp: 1784403.13,
  state: "working",
  node_name: "mock-coder-success",
  detail: null,
  type: "agent_status",
  event_type: "agent_status",
  seq: 13,
} as const;
const REAL_TEAM_STATUS = {
  api_version: "v1",
  thread_id: "d262e49f084f4dedbae85596b1927e26",
  agent_id: "",
  agents: [
    { agent_id: "mock-planner", node_name: "mock-planner", state: "idle", role: "" },
    {
      agent_id: "mock-coder-success",
      node_name: "mock-coder-success",
      state: "working",
      role: "coder",
      display_name: "Mock Coder Success",
      description: "Mock coder agent that simulates a successful task completion.",
    },
  ],
  active_thread_ids: [],
  type: "team_status",
  event_type: "team_status",
  seq: 14,
} as const;
const REAL_THREAD_TERMINAL = {
  api_version: "v1",
  event_type: "thread_terminal",
  thread_id: "d262e49f084f4dedbae85596b1927e26",
  status: "completed",
  type: "thread_terminal",
  seq: 18,
} as const;

describe("assembleTeamRun (live-captured golden frames)", () => {
  it("derives the working agent from a real agent_status/team_status pair", () => {
    const view = assembleTeamRun(
      [
        adaptRelayFrame({ channel: "agent_status", data: REAL_AGENT_STATUS_WORKING }),
        adaptRelayFrame({ channel: "team_status", data: REAL_TEAM_STATUS }),
      ],
      false,
    );
    expect(view.terminal).toBe(false);
    expect(view.activeAgents).toContain("mock-coder-success");
    // The roster's `role`/`display_name` fields are ignored — only agent_id/state.
    expect(view.entries).toEqual([]);
  });

  it("treats a real thread_terminal frame as presentation-only", () => {
    const view = assembleTeamRun(
      [
        adaptRelayFrame({ channel: "agent_status", data: REAL_AGENT_STATUS_WORKING }),
        adaptRelayFrame({ channel: "thread_terminal", data: REAL_THREAD_TERMINAL }),
      ],
      false,
    );
    expect(view.terminal).toBe(false);
    expect(view.activeAgents).toEqual(["mock-coder-success"]);

    const confirmed = assembleTeamRun(
      [
        adaptRelayFrame({ channel: "agent_status", data: REAL_AGENT_STATUS_WORKING }),
        adaptRelayFrame({ channel: "thread_terminal", data: REAL_THREAD_TERMINAL }),
      ],
      true,
    );
    expect(confirmed.terminal).toBe(true);
    expect(confirmed.activeAgents).toEqual([]);
  });
});
