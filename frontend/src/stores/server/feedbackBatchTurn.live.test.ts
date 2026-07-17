// Live-wire proof for the structured feedback-batch continuation (P04.S12).
//
// Test-integrity / wire-contract: ONLINE against the real `vaultspec serve`
// binary the global setup spawns — never a mocked wire. This is the end-to-end
// half of S12 the offline composer tests cannot reach: it drives the REAL
// create-feedback-batch command (POST /authoring/v1/feedback-batches, dual auth,
// the command S09/S10 added) and proves a turn started with the returned opaque
// feedback_batch_id is accepted (the engine verifies the batch exists and belongs
// to the session before the turn starts), while a foreign/unknown id is refused.
//
// Binary dependency: the feedback-batches routes + CommandKind::CreateFeedbackBatch
// exist only on the edge-activation branch (S09/S10). Point VAULTSPEC_TEST_ENGINE_BIN
// at that build to run this suite; against a pre-edge binary the create 404s/422s,
// by design.
//
// Mutation safety: creates authoring-STATE entities (session/batch/turn) in the
// shared engine's mutable store — never a vault write. A unique per-run suffix
// keeps actors/sessions from colliding.

import { beforeAll, describe, expect, it } from "vitest";

import { liveScope, liveTransport } from "../../testing/liveClient";
import { AuthoringClient } from "./authoring";
import { AgentClient } from "./agent";

const liveAgent = new AgentClient({ baseUrl: "", fetchImpl: liveTransport });
const liveAuthoring = new AuthoringClient({ baseUrl: "", fetchImpl: liveTransport });

const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let scope: string;

beforeAll(async () => {
  scope = await liveScope();
});

async function humanToken(label: string): Promise<string> {
  const issued = await liveAuthoring.issueActorToken({
    actor: { id: `human:${label}-${run}`, kind: "human" },
  });
  return issued.raw_token;
}

/** Open a session and return its id (the batch is session-scoped). */
async function openSession(token: string, title: string): Promise<string> {
  const created = await liveAgent.createSession(
    { scope, title },
    { actorToken: token },
  );
  if (created.kind !== "settled") throw new Error("session did not settle");
  return created.session_id;
}

function item(commentId: string, body: string) {
  return {
    comment_id: commentId,
    body,
    anchor: { heading_path: ["Scope"], content_start: 0, content_end: body.length },
  };
}

describe("structured feedback batch → turn (edge-activation engine)", () => {
  it("creates a batch and starts a turn that the engine accepts by its id", async () => {
    const token = await humanToken("fb-batch");
    const sessionId = await openSession(token, `Feedback batch live ${run}`);

    // Freeze the reviewer's comments into an immutable engine batch (dual auth).
    const receipt = await liveAgent.createFeedbackBatch(
      {
        session_id: sessionId,
        source_document: `node:doc-${run}`,
        source_revision: `blob-${run}`,
        items: [item(`c1-${run}`, "expand the scope"), item(`c2-${run}`, "cite the ADR")],
      },
      { actorToken: token },
    );
    expect(receipt.batchId).toMatch(/^feedback-batch:/);
    expect(receipt.batchId).toBe(`feedback-batch:${receipt.digest}`);

    // A turn carrying the batch id is accepted: the engine verifies the batch
    // exists AND belongs to this session before starting the turn.
    const turned = await liveAgent.startTurn(
      sessionId,
      { prompt: `address the feedback ${run}`, feedback_batch_id: receipt.batchId },
      { actorToken: token },
    );
    expect(turned.kind).toBe("settled");

    // Content-addressed idempotency: main's digest is timestamp-FREE, so freezing
    // the same comments/metadata again yields the SAME batch_id (a fresh
    // idempotency key notwithstanding) - the immutable-batch consume the loop
    // relies on. Confirms the create is a true content hash, not clock-salted.
    const again = await liveAgent.createFeedbackBatch(
      {
        session_id: sessionId,
        source_document: `node:doc-${run}`,
        source_revision: `blob-${run}`,
        items: [item(`c1-${run}`, "expand the scope"), item(`c2-${run}`, "cite the ADR")],
      },
      { actorToken: token },
    );
    expect(again.batchId).toBe(receipt.batchId);
  });

  it("refuses a turn carrying an unknown feedback batch id", async () => {
    const token = await humanToken("fb-batch-unknown");
    const sessionId = await openSession(token, `Feedback batch reject ${run}`);
    // A batch id that does not exist (or belongs to no session) is refused before
    // the turn starts — the engine faults on the wire rather than starting blind.
    await expect(
      liveAgent.startTurn(
        sessionId,
        {
          prompt: "address nothing",
          feedback_batch_id: `feedback-batch:deadbeef-${run}`,
        },
        { actorToken: token },
      ),
    ).rejects.toThrow();
  });
});
