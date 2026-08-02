// Cross-repository attach proof. The browser-facing requests below target only
// the real engine. The harness owns the separate A2A process; this spec never
// opens a browser-facing request to that sibling.

import { expect, test } from "@playwright/test";

import { startAgentHarness, type AgentHarness } from "./harness";

let harness: AgentHarness;

test.beforeAll("start owned engine and A2A processes", async () => {
  harness = await startAgentHarness();
});

test.afterAll("stop owned engine and A2A processes", async () => {
  await harness?.stop();
});

test("S10: engine-origin attach serves presets, an available tier, and a run identity", async () => {
  const get = async (path: string) => {
    const url = `${harness.engine.baseUrl}${path}`;
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${harness.engine.token}` },
    });
    const raw = await response.text();
    expect(
      response.ok,
      `${path} must succeed through the engine (${response.status}): ${raw}`,
    ).toBe(true);
    return JSON.parse(raw) as { data?: unknown };
  };
  const post = async (verb: string, body: object) => {
    const url = `${harness.engine.baseUrl}/ops/a2a/${verb}`;
    const response = await fetch(url, {
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
      `${verb} must succeed through the engine (${response.status}): ${raw}\nowned a2a diagnostics:\n${harness.a2a.diagnostics()}`,
    ).toBe(true);
    return JSON.parse(raw) as {
      data?: { envelope?: unknown };
      tiers?: { agent?: { available?: unknown; reason?: unknown } };
    };
  };

  const session = await get("/session");
  const expectedScope = (session.data as { active_scope?: unknown } | undefined)
    ?.active_scope;
  expect(typeof expectedScope).toBe("string");

  const presetsResponse = await post("presets-list", {});
  expect(presetsResponse.tiers?.agent).toMatchObject({ available: true });
  const presetsEnvelope = presetsResponse.data?.envelope as
    | { presets?: unknown[] }
    | undefined;
  const presets = presetsEnvelope?.presets ?? [];
  expect(presets.length).toBeGreaterThan(0);

  const deterministic = presets.find(
    (preset): preset is { id: string; loadable: boolean } =>
      typeof preset === "object" &&
      preset !== null &&
      "id" in preset &&
      "loadable" in preset &&
      preset.id === "deterministic-tool-call" &&
      preset.loadable === true,
  );
  expect(
    deterministic,
    "the real deterministic preset must be selectable",
  ).toBeDefined();

  const runResponse = await post("run-start", {
    run_id: `e2e-attach-${crypto.randomUUID().replaceAll("-", "")}`,
    team_preset: deterministic!.id,
    message: "exercise the real deterministic tool-call lane",
    expected_scope: expectedScope as string,
    autonomous: true,
  });
  const runEnvelope = runResponse.data?.envelope as { run_id?: unknown } | undefined;
  expect(runEnvelope?.run_id).toMatch(/^e2e-attach-[a-f0-9]+$/);
});
