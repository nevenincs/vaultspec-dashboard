// @vitest-environment happy-dom
//
// Transcript reconciliation + entry-part tests. Online against the real
// `vaultspec serve` the global setup spawns — never a mocked wire. The pure
// `assembleTranscript` reconciler is driven directly for fixed order, ascending
// turn sort, and the bounded window; the rendered component is driven against
// REAL sessions/turns/runs for the live streaming indicator, collapse-on-settle,
// thinking hidden-when-unserved, tool-call status mapping from SERVED tokens,
// and the inline permission prompt whose Allow/Deny post a REAL
// permission-decision (agent requester, human decider — P22-R1). Core vitest
// matchers only.
//
// Renders with the MODULE query client (`stores/server/queryClient`): the
// permission decision invalidates that client, exactly as the app does.

import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createTestLocalizationRuntime } from "../../localization/testing";
import { liveScope, liveTransport } from "../../testing/liveClient";
import { AuthoringClient } from "../../stores/server/authoring";
import {
  AgentClient,
  adaptSessionSnapshot,
  type SessionSnapshot,
} from "../../stores/server/agent";
import { queryClient } from "../../stores/server/queryClient";
import { useAgentComposer } from "../../stores/view/agentComposer";
import {
  AGENT_THINKING_CAP,
  AGENT_THINKING_TEXT_CAP,
  AGENT_TOOL_CALL_CAP,
  clearAgentTranscriptAnnex,
  recordAgentThinking,
  recordAgentToolCall,
  useAgentTranscript,
  type AgentToolCallRecord,
} from "../../stores/view/agentTranscript";
import {
  AGENT_TRANSCRIPT_TURN_CAP,
  assembleTranscript,
  Transcript,
} from "./Transcript";
import { boundedJson, toolCallStatus } from "./ToolCallEntry";

const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

const liveAgent = new AgentClient({ baseUrl: "", fetchImpl: liveTransport });
const liveAuthoring = new AuthoringClient({ baseUrl: "", fetchImpl: liveTransport });

let scope: string;

beforeAll(async () => {
  scope = await liveScope();
});

function resetStores(): void {
  clearAgentTranscriptAnnex();
  useAgentComposer.setState({
    mentions: [],
    commentBatch: null,
    pendingInterrupt: null,
  });
}

beforeEach(resetStores);
afterEach(() => {
  cleanup();
  resetStores();
  queryClient.clear();
});

function renderTranscript(snapshot: SessionSnapshot) {
  const runtime = createTestLocalizationRuntime();
  return render(
    <I18nextProvider i18n={runtime}>
      <QueryClientProvider client={queryClient}>
        <Transcript snapshot={snapshot} />
      </QueryClientProvider>
    </I18nextProvider>,
  );
}

/** Mint a registered actor token of the given kind on the live wire. */
async function mintToken(id: string, kind: "human" | "agent"): Promise<string> {
  const issued = await liveAuthoring.issueActorToken({ actor: { id, kind } });
  return issued.raw_token;
}

/** Create a real session (optionally with a first turn) and return its id plus
 *  the opened run id when a turn was started. */
async function seedSession(
  token: string,
  title: string,
  prompt?: string,
): Promise<{ sessionId: string; runId: string | null }> {
  const created = await liveAgent.createSession(
    { scope, title },
    { actorToken: token },
  );
  if (created.kind !== "settled") throw new Error("session did not settle");
  if (!prompt) return { sessionId: created.session_id, runId: null };
  const turned = await liveAgent.startTurn(
    created.session_id,
    { prompt },
    { actorToken: token },
  );
  if (turned.kind !== "settled") throw new Error("turn did not settle");
  return { sessionId: created.session_id, runId: turned.run_id };
}

/** A synthetic snapshot through the REAL tolerant adapter (never a hand-typed
 *  shape drifting from the wire contract). */
function syntheticSnapshot(input: {
  turns: { id: string; index: number; prompt: string }[];
  runs: { id: string; turnId: string; status: string; active?: boolean }[];
  turnCap?: number;
}): SessionSnapshot {
  return adaptSessionSnapshot({
    session: { session_id: "session:synthetic", status: "active" },
    turns: input.turns.map((t) => ({
      turn_id: t.id,
      turn_index: t.index,
      prompt_text: t.prompt,
    })),
    runs: input.runs.map((r) => ({
      run_id: r.id,
      turn_id: r.turnId,
      status: r.status,
      active: r.active ?? false,
    })),
    active_run: null,
    caps: { turn_cap: input.turnCap ?? 20, run_cap: 20 },
  });
}

function toolRecord(overrides: Partial<AgentToolCallRecord>): AgentToolCallRecord {
  return {
    toolCallId: "call:x",
    runId: "run:x",
    tool: "cancel",
    disposition: "dispatched",
    interruptId: null,
    permission: null,
    input: null,
    result: null,
    detail: null,
    recordedAtMs: 0,
    ...overrides,
  };
}

describe("assembleTranscript (pure reconciler)", () => {
  it("orders turns ascending and joins each to its served run status", () => {
    const snapshot = syntheticSnapshot({
      // Served newest-first, exactly as the engine emits.
      turns: [
        { id: "turn:2", index: 2, prompt: "second" },
        { id: "turn:1", index: 1, prompt: "first" },
      ],
      runs: [
        { id: "run:2", turnId: "turn:2", status: "active", active: true },
        { id: "run:1", turnId: "turn:1", status: "completed" },
      ],
    });
    const view = assembleTranscript(snapshot, [], []);
    expect(view.turns.map((t) => t.prompt)).toEqual(["first", "second"]);
    expect(view.turns[0]).toMatchObject({ runStatus: "completed", live: false });
    expect(view.turns[1]).toMatchObject({ runStatus: "active", live: true });
    expect(view.windowFull).toBe(false);
  });

  it("keeps only the newest bounded window and flags the full window", () => {
    // More turns arrive than the served cap; the render window bounds to the cap
    // (here the fallback constant, since caps.turn_cap defaults to it) newest-first.
    const total = AGENT_TRANSCRIPT_TURN_CAP + 5;
    const snapshot = syntheticSnapshot({
      turns: Array.from({ length: total }, (_, i) => ({
        id: `turn:${i + 1}`,
        index: i + 1,
        prompt: `prompt ${i + 1}`,
      })),
      runs: [],
      turnCap: AGENT_TRANSCRIPT_TURN_CAP,
    });
    const view = assembleTranscript(snapshot, [], []);
    expect(view.turns).toHaveLength(AGENT_TRANSCRIPT_TURN_CAP);
    expect(view.turns[0]!.turnIndex).toBe(6);
    expect(view.turns.at(-1)!.turnIndex).toBe(total);
    expect(view.windowFull).toBe(true);
  });

  it("derives the render window from the served snapshot cap, not a hardcoded 20", () => {
    // A smaller engine cap bounds the render window to it (the window and the
    // `windowFull` flag share one source), so the two can't drift.
    const snapshot = syntheticSnapshot({
      turns: Array.from({ length: 6 }, (_, i) => ({
        id: `turn:${i + 1}`,
        index: i + 1,
        prompt: `prompt ${i + 1}`,
      })),
      runs: [],
      turnCap: 3,
    });
    const view = assembleTranscript(snapshot, [], []);
    expect(view.turns.map((t) => t.turnIndex)).toEqual([4, 5, 6]);
    expect(view.windowFull).toBe(true);
  });

  it("grafts annex tool calls and thinking onto their run's turn only", () => {
    const snapshot = syntheticSnapshot({
      turns: [
        { id: "turn:1", index: 1, prompt: "first" },
        { id: "turn:2", index: 2, prompt: "second" },
      ],
      runs: [
        { id: "run:1", turnId: "turn:1", status: "completed" },
        { id: "run:2", turnId: "turn:2", status: "active", active: true },
      ],
    });
    const calls = [
      toolRecord({ toolCallId: "call:b", runId: "run:2", recordedAtMs: 2 }),
      toolRecord({ toolCallId: "call:a", runId: "run:2", recordedAtMs: 1 }),
    ];
    const thinking = [{ runId: "run:2", text: "reasoning", durationMs: 1200 }];
    const view = assembleTranscript(snapshot, calls, thinking);
    expect(view.turns[0]!.toolCalls).toHaveLength(0);
    expect(view.turns[0]!.thinking).toBeNull();
    // Grafted in recorded order, oldest first.
    expect(view.turns[1]!.toolCalls.map((c) => c.toolCallId)).toEqual([
      "call:a",
      "call:b",
    ]);
    expect(view.turns[1]!.thinking?.durationMs).toBe(1200);
  });
});

describe("completed run status renders Done from the wire", () => {
  it("reconciles a completed run to a settled, non-live Done turn", () => {
    // The wire shape a `run.completed` lifecycle refetch lands: the run settled to
    // the served `completed` token (through the REAL tolerant adapter, never a
    // hand-typed status). The reconciler must read it as terminal, not live.
    const snapshot = syntheticSnapshot({
      turns: [{ id: "turn:1", index: 1, prompt: "draft the intro" }],
      runs: [{ id: "run:1", turnId: "turn:1", status: "completed" }],
    });
    const view = assembleTranscript(snapshot, [], []);
    expect(view.turns[0]).toMatchObject({ runStatus: "completed", live: false });
  });

  it("renders the Done turn status word and collapses the streaming chrome", () => {
    const snapshot = syntheticSnapshot({
      turns: [{ id: "turn:1", index: 1, prompt: "draft the intro" }],
      runs: [{ id: "run:1", turnId: "turn:1", status: "completed" }],
    });
    renderTranscript(snapshot);

    // Collapse-on-settle: no residual streaming indicator; the terminal status
    // line carries the served `completed` token rendered as the Done word.
    expect(document.querySelector("[data-transcript-streaming]")).toBeNull();
    const status = document.querySelector("[data-transcript-status]");
    expect(status).not.toBeNull();
    expect(status!.getAttribute("data-transcript-status")).toBe("completed");
    expect(screen.getByText("Done")).toBeTruthy();
  });
});

describe("tool-call status mapping (served tokens only)", () => {
  it("maps each served disposition/decision pair to one bounded status", () => {
    expect(toolCallStatus(toolRecord({ disposition: "dispatched" }))).toEqual({
      status: "done",
      awaiting: false,
    });
    expect(toolCallStatus(toolRecord({ disposition: "already_handled" }))).toEqual({
      status: "done",
      awaiting: false,
    });
    expect(toolCallStatus(toolRecord({ disposition: "refused" }))).toEqual({
      status: "notAllowed",
      awaiting: false,
    });
    expect(toolCallStatus(toolRecord({ disposition: "awaiting_permission" }))).toEqual({
      status: "needsPermission",
      awaiting: true,
    });
    // The served decision outcome settles the awaiting arm.
    expect(
      toolCallStatus(
        toolRecord({ disposition: "awaiting_permission", permission: "granted" }),
      ),
    ).toEqual({ status: "allowed", awaiting: false });
    expect(
      toolCallStatus(
        toolRecord({ disposition: "awaiting_permission", permission: "denied" }),
      ),
    ).toEqual({ status: "denied", awaiting: false });
  });

  it("bounds the expand-body payload rendering", () => {
    expect(boundedJson(null)).toBeNull();
    expect(boundedJson({ a: 1 })).toContain('"a": 1');
    const flooded = boundedJson({ text: "x".repeat(10_000) });
    expect(flooded!.length).toBeLessThanOrEqual(2_001);
    expect(flooded!.endsWith("…")).toBe(true);
  });

  it("evicts the oldest tool-call records past the bounded cap", () => {
    for (let i = 0; i < AGENT_TOOL_CALL_CAP + 6; i += 1) {
      recordAgentToolCall(toolRecord({ toolCallId: `call:${i}`, recordedAtMs: i }));
    }
    const calls = useAgentTranscript.getState().toolCalls;
    expect(calls).toHaveLength(AGENT_TOOL_CALL_CAP);
    expect(calls[0]!.toolCallId).toBe("call:6");
  });

  it("evicts the oldest thinking segments past the bounded cap", () => {
    // One segment per run (upsert by runId); past the cap the oldest is evicted
    // oldest-first, mirroring the tool-call bound (resource-bounds discipline).
    for (let i = 0; i < AGENT_THINKING_CAP + 6; i += 1) {
      recordAgentThinking({
        runId: `run:${i}`,
        text: `reasoning ${i}`,
        durationMs: null,
      });
    }
    const thinking = useAgentTranscript.getState().thinking;
    expect(thinking).toHaveLength(AGENT_THINKING_CAP);
    expect(thinking[0]!.runId).toBe("run:6");
  });

  it("truncates one thinking segment's text at the bounded cap on write", () => {
    recordAgentThinking({
      runId: "run:long",
      text: "x".repeat(AGENT_THINKING_TEXT_CAP + 500),
      durationMs: null,
    });
    const segment = useAgentTranscript
      .getState()
      .thinking.find((t) => t.runId === "run:long");
    expect(segment!.text).toHaveLength(AGENT_THINKING_TEXT_CAP);
  });
});

describe("Transcript rendering (live wire)", () => {
  it("renders fixed order, an honest live indicator, and collapses on settle", async () => {
    const token = await mintToken(`human:transcript-${run}`, "human");
    const { sessionId, runId } = await seedSession(
      token,
      `Transcript live ${run}`,
      `walk the corpus ${run}`,
    );
    expect(runId).toBeTruthy();
    const snapshot = await liveAgent.getSession(sessionId);
    renderTranscript(snapshot);

    // The prompt renders; the run is live so the streaming indicator shows the
    // SERVED state — and no thinking block exists (nothing served one).
    expect(screen.getByText(`walk the corpus ${run}`)).toBeTruthy();
    const streaming = document.querySelector("[data-transcript-streaming]");
    expect(streaming).not.toBeNull();
    expect(streaming!.getAttribute("data-transcript-streaming")).toBe("active");
    expect(document.querySelector("[data-transcript-thinking]")).toBeNull();

    // Fixed order within the turn: prompt precedes tools precedes the status
    // line precedes the S16 proposal slot.
    recordAgentToolCall(toolRecord({ toolCallId: `call:order-${run}`, runId: runId! }));
    recordAgentThinking({ runId: runId!, text: "weighing options", durationMs: 1200 });
    await waitFor(() =>
      expect(document.querySelector("[data-transcript-tools]")).not.toBeNull(),
    );
    const turn = document.querySelector("[data-transcript-turn]")!;
    const parts = [
      turn.querySelector("[data-transcript-prompt]"),
      turn.querySelector("[data-transcript-thinking]"),
      turn.querySelector("[data-transcript-tools]"),
      turn.querySelector("[data-transcript-streaming]"),
      turn.querySelector("[data-agent-proposal-slot]"),
    ];
    for (const part of parts) expect(part).not.toBeNull();
    for (let i = 1; i < parts.length; i += 1) {
      expect(
        parts[i - 1]!.compareDocumentPosition(parts[i]!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    // The thinking block is dimmed, collapsed, and cost-labeled from the
    // recorded duration; expanding reveals the segment.
    expect(screen.getByText("Thinking (1.2s)")).toBeTruthy();
    expect(screen.queryByText("weighing options")).toBeNull();

    // Settle the run over the real wire; the re-read snapshot collapses the
    // streaming chrome to the terminal served status only.
    await liveAgent.cancelRun(
      runId!,
      { reason: "transcript settle test" },
      { actorToken: token },
    );
    const settled = await liveAgent.getSession(sessionId);
    cleanup();
    renderTranscript(settled);
    expect(document.querySelector("[data-transcript-streaming]")).toBeNull();
    const status = document.querySelector("[data-transcript-status]");
    expect(status).not.toBeNull();
    expect(status!.getAttribute("data-transcript-status")).toBe("cancelled");
    expect(screen.getByText("Stopped")).toBeTruthy();
  });

  it("runs the inline permission prompt end-to-end: a real suspended tool call, Allow posts the decision, the served grant settles the row", async () => {
    // The requester is an AGENT principal; the deciding human is the ambient
    // actor the mutation mints — P22-R1 (never the requester) holds for real.
    const agentToken = await mintToken(`agent:transcript-${run}`, "agent");
    const { sessionId, runId } = await seedSession(
      agentToken,
      `Transcript permission ${run}`,
      `queue a mutating tool ${run}`,
    );
    expect(runId).toBeTruthy();

    // Execute a REAL mutating tool call without a grant: the engine suspends it
    // as a 200 `awaiting_permission` value carrying the interrupt id.
    const toolCallId = `call_ui_${run.replace(/-/g, "_")}`;
    const executed = (await liveAgent.executeToolCall(
      runId!,
      {
        tool_call_id: toolCallId,
        name: "cancel",
        input: { target: "run", run_id: runId, reason: "permission prompt test" },
      },
      { actorToken: agentToken },
    )) as Record<string, unknown>;
    expect(executed.disposition).toBe("awaiting_permission");
    expect(typeof executed.interrupt_id).toBe("string");

    // Record the SERVED envelope into the annex (the recorder seam also stages
    // the composer's steer interrupt from the awaiting arm).
    recordAgentToolCall({
      toolCallId,
      runId: runId!,
      tool: "cancel",
      disposition: "awaiting_permission",
      interruptId: executed.interrupt_id as string,
      permission: null,
      input: { target: "run" },
      result: null,
      detail: null,
      recordedAtMs: Date.now(),
    });
    expect(useAgentComposer.getState().pendingInterrupt).toMatchObject({
      interruptId: executed.interrupt_id,
      runId,
    });

    const snapshot = await liveAgent.getSession(sessionId);
    renderTranscript(snapshot);

    // The awaiting row shows the served needs-permission status and the inline
    // prompt (an in-transcript entry, never a dialog).
    const row = document.querySelector(`[data-transcript-tool-call="${toolCallId}"]`);
    expect(row).not.toBeNull();
    expect(
      row!.querySelector("[data-tool-status]")!.getAttribute("data-tool-status"),
    ).toBe("needsPermission");
    const prompt = document.querySelector("[data-transcript-permission]");
    expect(prompt).not.toBeNull();
    expect(screen.getByText("Allow cancel to run?")).toBeTruthy();

    // Allow posts the REAL decision; the served outcome is `granted`, the row
    // settles to Allowed, and the prompt leaves the transcript.
    fireEvent.click(prompt!.querySelector("[data-permission-allow]")!);
    await waitFor(
      () => {
        const settledRow = document.querySelector(
          `[data-transcript-tool-call="${toolCallId}"]`,
        );
        expect(
          settledRow!
            .querySelector("[data-tool-status]")!
            .getAttribute("data-tool-status"),
        ).toBe("allowed");
      },
      { timeout: 15_000 },
    );
    expect(document.querySelector("[data-transcript-permission]")).toBeNull();
    expect(useAgentTranscript.getState().toolCalls[0]!.permission).toBe("granted");
  });

  it("records a served denial when the human denies the queued permission", async () => {
    const agentToken = await mintToken(`agent:transcript-deny-${run}`, "agent");
    const { sessionId, runId } = await seedSession(
      agentToken,
      `Transcript deny ${run}`,
      `queue another tool ${run}`,
    );
    const toolCallId = `call_deny_${run.replace(/-/g, "_")}`;
    const executed = (await liveAgent.executeToolCall(
      runId!,
      {
        tool_call_id: toolCallId,
        name: "cancel",
        input: { target: "run", run_id: runId, reason: "deny path test" },
      },
      { actorToken: agentToken },
    )) as Record<string, unknown>;
    expect(executed.disposition).toBe("awaiting_permission");
    recordAgentToolCall({
      toolCallId,
      runId: runId!,
      tool: "cancel",
      disposition: "awaiting_permission",
      interruptId: (executed.interrupt_id as string | null) ?? null,
      permission: null,
      input: null,
      result: null,
      detail: null,
      recordedAtMs: Date.now(),
    });

    const snapshot = await liveAgent.getSession(sessionId);
    renderTranscript(snapshot);
    const prompt = await waitFor(() => {
      const el = document.querySelector("[data-transcript-permission]");
      expect(el).not.toBeNull();
      return el!;
    });
    fireEvent.click(prompt.querySelector("[data-permission-deny]")!);
    await waitFor(
      () => {
        const row = document.querySelector(
          `[data-transcript-tool-call="${toolCallId}"]`,
        );
        expect(
          row!.querySelector("[data-tool-status]")!.getAttribute("data-tool-status"),
        ).toBe("denied");
      },
      { timeout: 15_000 },
    );
    expect(document.querySelector("[data-transcript-permission]")).toBeNull();
  });
});
