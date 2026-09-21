// Cross-repository relay proof. The run and progress stream both travel through
// the real engine origin; the sibling A2A process is reached only by the engine.

import { expect, test } from "@playwright/test";

import { sseChunks, type StreamChunk } from "../../src/stores/server/queries/sse";
import {
  currentDeterministicSelection,
  startAgentHarness,
  type AgentHarness,
} from "./harness";

const RELAY_FRAME_TAIL_CAP = 32;
const EXPECTED_SCRIPTED_CONTENT =
  "Deterministic content for `research_adr acceptance`.";
const RELAY_PROGRESS_DEADLINE_MS = 60_000;
const RECENT_REPLAY_FRAME_COUNT = 8;

let harness: AgentHarness;
let failureEvidence: Record<string, unknown> | undefined;

function retainFrame(tail: StreamChunk[], frame: StreamChunk): void {
  tail.push(frame);
  if (tail.length > RELAY_FRAME_TAIL_CAP) tail.shift();
}

function relaySequence(frame: StreamChunk): number {
  const sequence = (frame.data as { seq?: unknown }).seq;
  expect(Number.isSafeInteger(sequence)).toBe(true);
  return sequence as number;
}

function expectNextSequence(previous: number | undefined, current: number): void {
  if (previous !== undefined) expect(current).toBe(previous + 1);
}

function relayGap(frame: StreamChunk): { lagged: number; reason: string } {
  expect(frame.channel).toBe("gap");
  const data = frame.data as { lagged?: unknown; reason?: unknown };
  expect(Number.isSafeInteger(data.lagged)).toBe(true);
  expect(data.lagged as number).toBeGreaterThan(0);
  expect(data.reason).toBe("broadcast lag");
  return { lagged: data.lagged as number, reason: data.reason as string };
}

test.beforeAll("start owned engine and A2A processes", async () => {
  test.setTimeout(180_000);
  harness = await startAgentHarness();
});

test.afterAll("stop owned engine and A2A processes", async () => {
  await harness?.stop();
});

test.afterEach(
  "retain failure evidence before owned cleanup",
  async ({ browserName: _browserName }, testInfo) => {
    if (
      (testInfo.status === "failed" || testInfo.status === "timedOut") &&
      failureEvidence !== undefined
    ) {
      const artifact = harness.a2a.retainDiagnostics(failureEvidence);
      await testInfo.attach("agent-runtime-evidence", {
        path: artifact,
        contentType: "application/json",
      });
    }
    failureEvidence = undefined;
  },
);

test("S12: engine relay streams exact deterministic content with monotonic sequence", async () => {
  const get = async (path: string) => {
    const response = await fetch(`${harness.engine.baseUrl}${path}`, {
      headers: { authorization: `Bearer ${harness.engine.token}` },
    });
    const raw = await response.text();
    expect(response.ok, `${path} failed (${response.status}): ${raw}`).toBe(true);
    return JSON.parse(raw) as { data?: unknown };
  };
  const post = async (verb: string, body: object) => {
    const response = await fetch(`${harness.engine.baseUrl}/ops/a2a/${verb}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${harness.engine.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const raw = await response.text();
    expect(
      response.ok,
      `${verb} failed through the engine (${response.status}): ${raw}\nowned a2a diagnostics:\n${harness.a2a.diagnostics()}`,
    ).toBe(true);
    return JSON.parse(raw) as { data?: { envelope?: unknown } };
  };

  const session = await get("/session");
  const expectedScope = (session.data as { active_scope?: unknown } | undefined)
    ?.active_scope;
  expect(typeof expectedScope).toBe("string");
  const selection = await currentDeterministicSelection(
    harness.engine,
    expectedScope as string,
  );

  const runId = `e2e-stream-${crypto.randomUUID().replaceAll("-", "")}`;
  const frameTail: StreamChunk[] = [];
  const statuses: unknown[] = [];
  const evidence: Record<string, unknown> = {
    scenario: "deterministic-tool-call",
    run_id: runId,
    frames: frameTail,
    statuses,
  };
  failureEvidence = evidence;
  const started = await post("run-start", {
    run_id: runId,
    team_preset: "deterministic-tool-call",
    message: "stream the real deterministic completion scenario",
    expected_scope: expectedScope as string,
    selection,
    autonomous: true,
  });
  evidence.run_start = started.data?.envelope;
  expect((started.data?.envelope as { run_id?: unknown } | undefined)?.run_id).toBe(
    runId,
  );

  const streamResponse = await fetch(
    `${harness.engine.baseUrl}/ops/a2a/runs/${runId}/stream`,
    {
      headers: { authorization: `Bearer ${harness.engine.token}` },
      signal: AbortSignal.timeout(60_000),
    },
  );
  expect(streamResponse.status).toBe(200);
  expect(streamResponse.headers.get("content-type")).toContain("text/event-stream");

  const frames: StreamChunk[] = [];
  for await (const frame of sseChunks(streamResponse)) {
    frames.push(frame);
    retainFrame(frameTail, frame);
    if (frame.channel === "thread_terminal") break;
  }

  expect(
    frames.length,
    "a completed run must relay at least one frame",
  ).toBeGreaterThan(0);
  const sequences = frames.map(relaySequence);
  for (let index = 1; index < sequences.length; index += 1) {
    expect(sequences[index]).toBe(sequences[index - 1]! + 1);
  }

  const relayedContent = frames
    .filter((frame) => frame.channel === "message_chunk")
    .map((frame) => (frame.data as { content?: unknown }).content)
    .filter((content): content is string => typeof content === "string")
    .join("");
  expect(relayedContent).toBe(EXPECTED_SCRIPTED_CONTENT);

  const terminal = frames.find((frame) => frame.channel === "thread_terminal");
  const relayTerminalStatus = (terminal?.data as { status?: unknown } | undefined)
    ?.status;
  statuses.push(relayTerminalStatus);
  evidence.relay_terminal_status = relayTerminalStatus;
  expect(relayTerminalStatus).toBe("completed");

  const status = await post("run-status", { run_id: runId });
  const authoritativeStatus = (
    status.data?.envelope as { status?: unknown } | undefined
  )?.status;
  statuses.push(authoritativeStatus);
  evidence.authoritative_status = authoritativeStatus;
  expect(authoritativeStatus).toBe("completed");
});

test("S13: stale cursors and live relay gaps reconcile terminal truth", async () => {
  test.slow();
  const sessionResponse = await fetch(`${harness.engine.baseUrl}/session`, {
    headers: { authorization: `Bearer ${harness.engine.token}` },
  });
  const sessionRaw = await sessionResponse.text();
  expect(sessionResponse.ok, sessionRaw).toBe(true);
  const expectedScope = (
    JSON.parse(sessionRaw) as { data?: { active_scope?: unknown } }
  ).data?.active_scope;
  expect(typeof expectedScope).toBe("string");
  const burstSelection = await currentDeterministicSelection(
    harness.engine,
    expectedScope as string,
  );

  const runId = `e2e-gap-${crypto.randomUUID().replaceAll("-", "")}`;
  const frameTail: StreamChunk[] = [];
  const statuses: unknown[] = [];
  const evidence: Record<string, unknown> = {
    scenario: "deterministic-relay-burst",
    run_id: runId,
    frames: frameTail,
    statuses,
  };
  failureEvidence = evidence;
  const startResponse = await fetch(`${harness.engine.baseUrl}/ops/a2a/run-start`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${harness.engine.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      run_id: runId,
      team_preset: "deterministic-relay-burst",
      message: "overflow the real bounded relay replay window",
      expected_scope: expectedScope as string,
      selection: burstSelection,
      autonomous: true,
    }),
  });
  const startRaw = await startResponse.text();
  expect(startResponse.ok, startRaw).toBe(true);
  evidence.run_start = JSON.parse(startRaw) as unknown;

  const progressDeadline = Date.now() + RELAY_PROGRESS_DEADLINE_MS;
  const remainingProgress = () => {
    const remaining = progressDeadline - Date.now();
    if (remaining <= 0) {
      throw new Error("relay did not expose a stale replay gap before its deadline");
    }
    return remaining;
  };
  const firstResponse = await fetch(
    `${harness.engine.baseUrl}/ops/a2a/runs/${runId}/stream`,
    {
      headers: { authorization: `Bearer ${harness.engine.token}` },
      signal: AbortSignal.timeout(remainingProgress()),
    },
  );
  expect(firstResponse.ok).toBe(true);
  const liveSignal = AbortSignal.timeout(remainingProgress());
  const originalStream = sseChunks(firstResponse, liveSignal);
  try {
    let previousSequence: number | undefined;
    let newestLiveSequence: number | undefined;
    let newestPostGapSequence: number | undefined;
    let observedLiveFrames = 0;
    let nextProbeAt = 16;
    let cancellationIssued = false;
    let liveObserverSawGap = false;
    const liveBroadcastGaps: Array<{ lagged: number; reason: string }> = [];
    evidence.live_broadcast_gaps = liveBroadcastGaps;

    const observeLive = (frame: StreamChunk): boolean => {
      retainFrame(frameTail, frame);
      if (frame.channel === "gap") {
        liveBroadcastGaps.push(relayGap(frame));
        liveObserverSawGap = true;
        previousSequence = undefined;
        return true;
      }
      expect(frame.channel).not.toBe("relay_degraded");
      if (frame.channel === "thread_terminal") {
        expect(cancellationIssued).toBe(true);
        evidence.relay_terminal_status = (frame.data as { status?: unknown }).status;
      }
      const sequence = relaySequence(frame);
      expectNextSequence(previousSequence, sequence);
      previousSequence = sequence;
      newestLiveSequence = sequence;
      if (liveObserverSawGap) newestPostGapSequence = sequence;
      observedLiveFrames += 1;
      return observedLiveFrames >= nextProbeAt;
    };

    const staleReplayGap = async (): Promise<number | undefined> => {
      const response = await fetch(
        `${harness.engine.baseUrl}/ops/a2a/runs/${runId}/stream?since=0`,
        {
          headers: { authorization: `Bearer ${harness.engine.token}` },
          signal: AbortSignal.timeout(remainingProgress()),
        },
      );
      expect(response.ok).toBe(true);
      const stream = sseChunks(response, AbortSignal.timeout(remainingProgress()));
      try {
        const next = await stream.next();
        if (next.done) return undefined;
        retainFrame(frameTail, next.value);
        if (next.value.channel !== "gap") return undefined;
        const data = next.value.data as {
          lagged?: unknown;
          oldest_buffered?: unknown;
          reason?: unknown;
          requested?: unknown;
        };
        if (data.reason === "broadcast lag") {
          liveBroadcastGaps.push(relayGap(next.value));
          return undefined;
        }
        expect(data.requested).toBe(0);
        expect(Number.isSafeInteger(data.oldest_buffered)).toBe(true);
        expect(data.oldest_buffered as number).toBeGreaterThan(1);
        return data.oldest_buffered as number;
      } finally {
        await stream.return(undefined);
      }
    };

    let oldestBuffered: number | undefined;
    while (oldestBuffered === undefined) {
      const next = await originalStream.next();
      if (next.done) throw new Error("relay ended before its replay ring became stale");
      if (!observeLive(next.value)) continue;
      oldestBuffered = await staleReplayGap();
      nextProbeAt = Math.max(nextProbeAt * 2, observedLiveFrames + 1);
    }
    evidence.stale_gap = { requested: 0, oldest_buffered: oldestBuffered };

    const post = async (verb: string, body: object) => {
      const response = await fetch(`${harness.engine.baseUrl}/ops/a2a/${verb}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${harness.engine.token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
      const raw = await response.text();
      expect(response.ok, `${verb} failed (${response.status}): ${raw}`).toBe(true);
      return JSON.parse(raw) as { data?: { envelope?: unknown } };
    };

    const liveStatus = await post("run-status", { run_id: runId });
    const live = (liveStatus.data?.envelope as { status?: unknown } | undefined)
      ?.status;
    statuses.push(live);
    evidence.live_status = live;
    expect(live).toBe("running");

    while (
      newestPostGapSequence === undefined ||
      newestPostGapSequence < RECENT_REPLAY_FRAME_COUNT
    ) {
      const next = await originalStream.next();
      if (next.done) {
        throw new Error("relay ended before yielding a recent post-gap replay cursor");
      }
      observeLive(next.value);
    }
    expect(newestLiveSequence).toBeGreaterThanOrEqual(
      oldestBuffered + RECENT_REPLAY_FRAME_COUNT,
    );
    const recentCursor = Math.max(0, newestPostGapSequence - RECENT_REPLAY_FRAME_COUNT);
    evidence.replay_cursor = recentCursor;
    evidence.replay_head = newestPostGapSequence;

    // `since` is exclusive. Eight frames behind the observed post-gap head gives
    // the snapshot eight already-persisted frames; it does not depend on future output.
    const resumedResponse = await fetch(
      `${harness.engine.baseUrl}/ops/a2a/runs/${runId}/stream?since=${recentCursor}`,
      {
        headers: { authorization: `Bearer ${harness.engine.token}` },
        signal: AbortSignal.timeout(remainingProgress()),
      },
    );
    expect(resumedResponse.ok).toBe(true);
    const resumedStream = sseChunks(
      resumedResponse,
      AbortSignal.timeout(remainingProgress()),
    );
    try {
      let replayedFrames = 0;
      let replaySequence = recentCursor;
      while (replayedFrames < RECENT_REPLAY_FRAME_COUNT) {
        const next = await resumedStream.next();
        if (next.done) throw new Error("recent relay replay ended before eight frames");
        const frame = next.value;
        retainFrame(frameTail, frame);
        expect(frame.channel).not.toBe("gap");
        expect(frame.channel).not.toBe("thread_terminal");
        const sequence = relaySequence(frame);
        expect(sequence).toBe(replaySequence + 1);
        replaySequence = sequence;
        replayedFrames += 1;
      }
      expect(replaySequence).toBe(recentCursor + RECENT_REPLAY_FRAME_COUNT);
      expect(replaySequence).toBe(newestPostGapSequence);
    } finally {
      await resumedStream.return(undefined);
    }

    const cancelled = await post("run-cancel", { run_id: runId });
    evidence.run_cancel = cancelled.data?.envelope;
    expect(
      (cancelled.data?.envelope as { accepted?: unknown } | undefined)?.accepted,
    ).toBe(true);
    cancellationIssued = true;

    const terminalDeadline = Date.now() + 60_000;
    let terminalStatus: unknown;
    while (Date.now() < terminalDeadline) {
      const status = await post("run-status", { run_id: runId });
      terminalStatus = (status.data?.envelope as { status?: unknown } | undefined)
        ?.status;
      statuses.push(terminalStatus);
      if (terminalStatus === "cancelled") break;
      const next = await originalStream.next();
      if (next.done) break;
      observeLive(next.value);
    }
    evidence.terminal_status = terminalStatus;
    expect(terminalStatus).toBe("cancelled");
  } finally {
    await originalStream.return(undefined);
  }
});
