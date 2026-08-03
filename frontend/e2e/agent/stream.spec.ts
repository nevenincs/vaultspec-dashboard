// Cross-repository relay proof. The run and progress stream both travel through
// the real engine origin; the sibling A2A process is reached only by the engine.

import { expect, test } from "@playwright/test";

import { sseChunks, type StreamChunk } from "../../src/stores/server/queries/sse";
import { startAgentHarness, stopA2a, type AgentHarness } from "./harness";

const EXPECTED_SCRIPTED_CONTENT =
  "Deterministic content for `research_adr acceptance`.";

let harness: AgentHarness;

test.beforeAll("start owned engine and A2A processes", async () => {
  test.setTimeout(180_000);
  harness = await startAgentHarness();
});

test.afterAll("stop owned engine and A2A processes", async () => {
  await harness?.stop();
});

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

  const runId = `e2e-stream-${crypto.randomUUID().replaceAll("-", "")}`;
  const started = await post("run-start", {
    run_id: runId,
    team_preset: "deterministic-tool-call",
    message: "stream the real deterministic completion scenario",
    expected_scope: expectedScope as string,
    autonomous: true,
  });
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
    if (frame.channel === "thread_terminal") break;
  }

  expect(
    frames.length,
    "a completed run must relay at least one frame",
  ).toBeGreaterThan(0);
  const sequences = frames.map((frame) => {
    const seq = (frame.data as { seq?: unknown }).seq;
    expect(typeof seq, `relay frame has no engine seq: ${JSON.stringify(frame)}`).toBe(
      "number",
    );
    return seq as number;
  });
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
  expect((terminal?.data as { status?: unknown } | undefined)?.status).toBe(
    "completed",
  );

  const status = await post("run-status", { run_id: runId });
  expect((status.data?.envelope as { status?: unknown } | undefined)?.status).toBe(
    "completed",
  );
});

test("S13: stale cursor gaps and a killed midstream A2A degrades the relay", async () => {
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

  const runId = `e2e-gap-${crypto.randomUUID().replaceAll("-", "")}`;
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
      autonomous: true,
    }),
  });
  const startRaw = await startResponse.text();
  expect(startResponse.ok, startRaw).toBe(true);

  const firstResponse = await fetch(
    `${harness.engine.baseUrl}/ops/a2a/runs/${runId}/stream`,
    {
      headers: { authorization: `Bearer ${harness.engine.token}` },
      signal: AbortSignal.timeout(300_000),
    },
  );
  const originalStream = sseChunks(firstResponse);
  let relayedFrames = 0;
  while (relayedFrames <= 1025) {
    const next = await originalStream.next();
    if (next.done) throw new Error("relay ended before crossing its replay window");
    relayedFrames += 1;
    expect(next.value.channel).not.toBe("thread_terminal");
  }
  expect(relayedFrames).toBeGreaterThan(1025);

  const replayResponse = await fetch(
    `${harness.engine.baseUrl}/ops/a2a/runs/${runId}/stream?since=0`,
    {
      headers: { authorization: `Bearer ${harness.engine.token}` },
      signal: AbortSignal.timeout(10_000),
    },
  );
  let gap: StreamChunk | undefined;
  for await (const frame of sseChunks(replayResponse)) {
    gap = frame;
    break;
  }
  expect(gap?.channel).toBe("gap");
  const gapData = gap?.data as
    | { requested?: unknown; oldest_buffered?: unknown }
    | undefined;
  expect(gapData?.requested).toBe(0);
  expect(typeof gapData?.oldest_buffered).toBe("number");
  expect(gapData?.oldest_buffered as number).toBeGreaterThan(1);
  await originalStream.return(undefined);

  const interruptedRunId = `e2e-degraded-${crypto.randomUUID().replaceAll("-", "")}`;
  const interruptedStartResponse = await fetch(
    `${harness.engine.baseUrl}/ops/a2a/run-start`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${harness.engine.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        run_id: interruptedRunId,
        team_preset: "deterministic-cancel-window",
        message: "remain in flight until the real gateway is killed",
        expected_scope: expectedScope as string,
        autonomous: true,
      }),
    },
  );
  const interruptedStartRaw = await interruptedStartResponse.text();
  expect(interruptedStartResponse.ok, interruptedStartRaw).toBe(true);

  const interruptedResponse = await fetch(
    `${harness.engine.baseUrl}/ops/a2a/runs/${interruptedRunId}/stream`,
    {
      headers: { authorization: `Bearer ${harness.engine.token}` },
      signal: AbortSignal.timeout(90_000),
    },
  );
  const interruptedStream = sseChunks(interruptedResponse);

  await stopA2a(harness.a2a);

  let degraded: StreamChunk | undefined;
  for await (const frame of interruptedStream) {
    expect(frame.channel).not.toBe("thread_terminal");
    if (frame.channel === "relay_degraded") {
      degraded = frame;
      break;
    }
  }
  expect(degraded?.channel).toBe("relay_degraded");
  const reason = (degraded?.data as { reason?: unknown } | undefined)?.reason;
  expect(typeof reason).toBe("string");
  expect((reason as string).trim().length).toBeGreaterThan(0);
});
