// Cross-repository relay proof. The run and progress stream both travel through
// the real engine origin; the sibling A2A process is reached only by the engine.

import { expect, test } from "@playwright/test";

import { sseChunks, type StreamChunk } from "../../src/stores/server/queries/sse";
import { startAgentHarness, type AgentHarness } from "./harness";

const EXPECTED_SCRIPTED_CONTENT =
  "Deterministic content for `research_adr acceptance`.";

let harness: AgentHarness;

test.beforeAll("start owned engine and A2A processes", async () => {
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
