// Agent-conversation wire slice live-wire tests.
//
// Test-integrity / wire-contract: these run ONLINE against the real `vaultspec
// serve` binary the global setup spawns (over the committed fixture vault), never
// a mocked wire. A passing test exercised the genuine `AgentClient` → wire →
// engine authoring AGENT domain end to end: the bounded session listing, session
// creation, the durable session snapshot, a prompt turn, and the run cancellation
// seam the composer's Stop action rides.
//
// Mutation safety: these create authoring-STATE entities (sessions/turns/runs) in
// the shared engine's mutable authoring store — never a vault-document write. A
// unique per-run suffix keeps each run's session titles/actors from colliding, and
// the fixture vault is left untouched.

import { beforeAll, describe, expect, it } from "vitest";

import { liveScope, liveTransport } from "../../testing/liveClient";
import { useAgentPanel } from "../view/agentPanel";
import { stopActiveAgentRun } from "../view/agentActions";
import { AuthoringClient, newIdempotencyKey, setActorToken } from "./authoring";
import { agentKeys, AgentClient } from "./agent";
import { queryClient } from "./queryClient";

/** A live agent client bound to the spawned engine (bearer via the live transport). */
function liveAgentClient(): AgentClient {
  return new AgentClient({ baseUrl: "", fetchImpl: liveTransport });
}

/** A live authoring client, used ONLY to mint the actor token (the token seam
 *  lives on the authoring plane; the agent commands present the same header). */
function liveAuthoringClient(): AuthoringClient {
  return new AuthoringClient({ baseUrl: "", fetchImpl: liveTransport });
}

/** A unique suffix so each run's actors/sessions never collide in the shared
 *  engine's mutable authoring store. */
const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let agent: AgentClient;
let authoring: AuthoringClient;
let scope: string;

/** Mint a registered-active human principal (the machine-bearer bootstrap
 *  registers the actor, so its commands do not 403 on `ensure_active`). */
async function humanToken(label: string): Promise<string> {
  const issued = await authoring.issueActorToken({
    actor: { id: `human:${label}-${run}`, kind: "human" },
  });
  return issued.raw_token;
}

beforeAll(async () => {
  agent = liveAgentClient();
  authoring = liveAuthoringClient();
  scope = await liveScope();
});

describe("agent session slice (live)", () => {
  it("serves the bounded session listing with the tiers block", async () => {
    const page = await agent.listSessions({ cap: 5 });
    expect(Array.isArray(page.items)).toBe(true);
    expect(page.cap).toBeGreaterThan(0);
    expect(typeof page.truncated).toBe("boolean");
    // Every read carries the tiers block (wire-contract); degradation is read
    // from it, never guessed.
    expect(page.tiers).toBeTruthy();
  });

  it("faults (does not fabricate an empty snapshot) for an unknown session id", async () => {
    // The engine maps an unknown session to a 422 fault, not a silent empty — the
    // client surfaces that as a rejection, never a fabricated snapshot.
    await expect(agent.getSession(`session:does-not-exist-${run}`)).rejects.toThrow();
  });

  it("creates a session, reads its snapshot, starts a turn, and cancels the run", async () => {
    const token = await humanToken("agent-slice");
    const idempotencyKey = newIdempotencyKey(`agent-session-${run}`);

    const created = await agent.createSession(
      { scope, title: `Agent slice live ${run}` },
      { actorToken: token, idempotencyKey },
    );
    expect(created.kind).toBe("settled");
    if (created.kind !== "settled") return;
    expect(created.session_id.length).toBeGreaterThan(0);
    const sessionId = created.session_id;

    // The durable snapshot reads back the session as active.
    const snapshot = await agent.getSession(sessionId);
    expect(snapshot).not.toBeNull();
    expect(snapshot?.session.session_id).toBe(sessionId);
    expect(snapshot?.session.status).toBe("active");
    expect(snapshot?.session.scope).toBe(scope);

    // The new session lists among the sessions (it exists on the wire).
    const listed = await agent.listSessions({ cap: 50 });
    expect(listed.items.some((s) => s.session_id === sessionId)).toBe(true);

    // Start a prompt turn — this opens a run for the session.
    const turned = await agent.startTurn(
      sessionId,
      { prompt: "Draft an introduction for the alpha research doc." },
      { actorToken: token, idempotencyKey: newIdempotencyKey(`agent-turn-${run}`) },
    );
    expect(turned.kind).toBe("settled");

    // Resolve the run id from the settled outcome's snapshot, or a fresh read.
    const afterTurn =
      turned.kind === "settled" && turned.snapshot
        ? turned.snapshot
        : await agent.getSession(sessionId);
    const runId = afterTurn.active_run?.run_id ?? afterTurn.runs[0]?.run_id ?? null;
    expect(runId, "a started turn opens a run").toBeTruthy();
    if (!runId) return;

    // Cancel through the exact Stop action seam over the real client and wire.
    queryClient.setQueryData(agentKeys.session(sessionId), afterTurn);
    useAgentPanel.setState({ currentSessionId: sessionId });
    setActorToken(token);
    await stopActiveAgentRun();

    // The run reads back in a terminal-or-cancelling served state, never active.
    const settled = await agent.getSession(sessionId);
    const cancelledRun = settled.runs.find((r) => r.run_id === runId);
    expect(cancelledRun).toBeTruthy();
    expect(["cancel_requested", "cancelled"]).toContain(cancelledRun?.status);
    useAgentPanel.setState({ currentSessionId: null });
    setActorToken(null);
  });

  it("serves the semantic agent-tool catalog", async () => {
    const catalog = await agent.toolCatalog();
    expect(Array.isArray(catalog.tools)).toBe(true);
    expect(catalog.tiers).toBeTruthy();
  });
});
