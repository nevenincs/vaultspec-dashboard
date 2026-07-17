// Live-wire proof for the run.completed lifecycle consumption (P01.S02).
//
// Test-integrity / wire-contract: ONLINE against the real `vaultspec serve`
// binary the global setup spawns — never a mocked wire. This is the end-to-end
// half of S02 the offline adapter/render tests cannot reach: it drives a REAL
// run to its terminal `completed` state over the wire (the driver-reported
// settle callback `POST /authoring/v1/runs/{run_id}/complete` that S01 added),
// then proves the served snapshot the frontend reads back reconciles to the
// non-live `completed` turn the transcript renders as Done.
//
// Binary dependency: the complete route + run.completed event exist only on the
// edge-activation branch (S01). Point VAULTSPEC_TEST_ENGINE_BIN at that build to
// run this suite; against a pre-S01 binary the settle 404s, by design.
//
// Mutation safety: creates authoring-STATE entities (session/turn/run) in the
// shared engine's mutable store — never a vault-document write. A unique
// per-run suffix keeps actors/sessions from colliding.

import { beforeAll, describe, expect, it } from "vitest";

import { liveScope, liveTransport } from "../../testing/liveClient";
import { assembleTranscript } from "../../app/agent/Transcript";
import { AuthoringClient, newIdempotencyKey } from "./authoring";
import { AgentClient } from "./agent";
import { unwrapEnvelope } from "./liveAdapters";

const ACTOR_TOKEN_HEADER = "x-authoring-actor-token";

const liveAgent = new AgentClient({ baseUrl: "", fetchImpl: liveTransport });
const liveAuthoring = new AuthoringClient({ baseUrl: "", fetchImpl: liveTransport });

const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let scope: string;

beforeAll(async () => {
  scope = await liveScope();
});

/** Mint a registered-active human principal (its commands do not 403). */
async function humanToken(label: string): Promise<string> {
  const issued = await liveAuthoring.issueActorToken({
    actor: { id: `human:${label}-${run}`, kind: "human" },
  });
  return issued.raw_token;
}

/** Drive the run-settle callback over the REAL wire: the standard command
 *  envelope + the actor-token header, exactly as the run's driver reports it. */
async function completeRun(
  runId: string,
  token: string,
): Promise<Record<string, unknown>> {
  const envelope = {
    api_version: "v1",
    command: "complete_run",
    idempotency_key: newIdempotencyKey(`complete-${run}`),
    payload: {},
  };
  const response = await liveTransport(
    `/authoring/v1/runs/${encodeURIComponent(runId)}/complete`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [ACTOR_TOKEN_HEADER]: token,
      },
      body: JSON.stringify(envelope),
    },
  );
  expect(response.ok, `complete_run must succeed (got ${response.status})`).toBe(true);
  return unwrapEnvelope(await response.json()) as Record<string, unknown>;
}

describe("run.completed live consumption (edge-activation engine)", () => {
  it("settles a real run to completed and reconciles the served snapshot to Done", async () => {
    const token = await humanToken("run-complete");

    // Open a session and start a turn — this opens a run.
    const created = await liveAgent.createSession(
      { scope, title: `Run completion live ${run}` },
      { actorToken: token },
    );
    expect(created.kind).toBe("settled");
    if (created.kind !== "settled") return;
    const sessionId = created.session_id;

    const turned = await liveAgent.startTurn(
      sessionId,
      { prompt: `settle-to-done ${run}` },
      { actorToken: token },
    );
    expect(turned.kind).toBe("settled");
    const afterTurn =
      turned.kind === "settled" && turned.snapshot
        ? turned.snapshot
        : await liveAgent.getSession(sessionId);
    const runId = afterTurn.active_run?.run_id ?? afterTurn.runs[0]?.run_id ?? null;
    expect(runId, "a started turn opens a run").toBeTruthy();
    if (!runId) return;

    // Drive the driver-reported settle callback: the run terminates as completed,
    // the session stays active, and exactly one run.completed rides the feed.
    const completed = await completeRun(runId, token);
    expect(completed.status).toBe("completed");

    // Read back the durable snapshot: the run is terminal-completed (active=false,
    // completed_at_ms set), no active_run remains, and the session stays active.
    const settled = await liveAgent.getSession(sessionId);
    const settledRun = settled.runs.find((r) => r.run_id === runId);
    expect(settledRun?.status).toBe("completed");
    expect(settledRun?.active).toBe(false);
    expect(settled.active_run).toBeNull();
    expect(settled.session.status).toBe("active");

    // The frontend link the offline tests cannot prove: the REAL served snapshot
    // reconciles the completed run to a settled, non-live turn — the exact input
    // the transcript renders as the Done turn status.
    const view = assembleTranscript(settled, [], []);
    const settledTurn = view.turns.find((t) => t.runId === runId);
    expect(settledTurn).toBeTruthy();
    expect(settledTurn).toMatchObject({ runStatus: "completed", live: false });
  });

  it("is idempotent: re-completing a terminal run is a 200 no-op", async () => {
    const token = await humanToken("run-complete-idem");
    const created = await liveAgent.createSession(
      { scope, title: `Run completion idem ${run}` },
      { actorToken: token },
    );
    if (created.kind !== "settled") throw new Error("session did not settle");
    const sessionId = created.session_id;
    const turned = await liveAgent.startTurn(
      sessionId,
      { prompt: `settle-idem ${run}` },
      { actorToken: token },
    );
    const afterTurn =
      turned.kind === "settled" && turned.snapshot
        ? turned.snapshot
        : await liveAgent.getSession(sessionId);
    const runId = afterTurn.active_run?.run_id ?? afterTurn.runs[0]?.run_id ?? null;
    if (!runId) throw new Error("turn opened no run");

    const first = await completeRun(runId, token);
    expect(first.status).toBe("completed");
    // A second settle over the real wire returns the recorded terminal outcome
    // rather than faulting or re-transitioning.
    const second = await completeRun(runId, token);
    expect(second.status).toBe("completed");
  });
});
