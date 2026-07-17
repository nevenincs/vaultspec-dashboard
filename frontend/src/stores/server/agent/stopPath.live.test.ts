// Stop-path live-wire proof (agent-wire-gaps P01.S38/S12 named scenario).
//
// Runs ONLINE against the real spawned engine: Stop (run-scoped cancel) leaves
// the session Active, no fresh-session bootstrap is needed, and the SAME
// session accepts the next turn — the conversation continues. This is the wire
// truth the composer's submit-destination machine relies on since the D2
// cancel-semantics cutover deleted the cancel-collapses-session behavior.

import { describe, expect, it } from "vitest";

import { liveScope } from "../../../testing/liveClient";
import { ensureActorToken } from "../authoring";
import { agentClient } from "./index";

function settled<T extends { kind: string }>(
  outcome: T,
): Extract<T, { kind: "settled" }> {
  expect(outcome.kind).toBe("settled");
  return outcome as Extract<T, { kind: "settled" }>;
}

describe("Stop path (live)", () => {
  it("run cancel leaves the session Active and the conversation continues on the same session", async () => {
    const actorToken = await ensureActorToken();
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const created = settled(
      await agentClient.createSession(
        { scope: await liveScope(), title: "Stop-path live session" },
        { actorToken, idempotencyKey: `live:stop:${stamp}:create` },
      ),
    );
    const sessionId = created.session_id;
    expect(sessionId.length).toBeGreaterThan(0);

    const started = settled(
      await agentClient.startTurn(
        sessionId,
        { prompt: "First prompt whose run gets stopped." },
        { actorToken, idempotencyKey: `live:stop:${stamp}:turn1` },
      ),
    );
    expect(started.status).toBe("started");
    const runId = started.run_id;
    expect(runId).toBeTruthy();

    const cancelled = settled(
      await agentClient.cancelRun(
        runId as string,
        { reason: "live Stop-path scenario" },
        { actorToken, idempotencyKey: `live:stop:${stamp}:cancel` },
      ),
    );
    expect(cancelled.session_id).toBe(sessionId);

    // Wire truth after Stop: the run is terminal, the session stays Active with
    // no active run — nothing for a client to bootstrap around.
    const afterStop = await agentClient.getSession(sessionId);
    expect(afterStop.session.status).toBe("active");
    expect(afterStop.active_run).toBeNull();
    expect(afterStop.runs.some((run) => run.run_id === runId)).toBe(true);
    expect(afterStop.runs.find((run) => run.run_id === runId)?.status).toBe(
      "cancelled",
    );

    // The conversation continues: the SAME session accepts the next turn as a
    // direct start (not queued — no active run remains, and never a fresh
    // session).
    const continued = settled(
      await agentClient.startTurn(
        sessionId,
        { prompt: "Second prompt after Stop continues the conversation." },
        { actorToken, idempotencyKey: `live:stop:${stamp}:turn2` },
      ),
    );
    expect(continued.session_id).toBe(sessionId);
    expect(continued.status).toBe("started");
    expect(continued.run_id).not.toBe(runId);

    // Leave the store tidy for later live tests: complete the follow-on run.
    await agentClient.completeRun(
      continued.run_id as string,
      {},
      { actorToken, idempotencyKey: `live:stop:${stamp}:complete` },
    );
  });
});
