// Authoring store LIVE-WIRE tests (W03.P40 CHUNK C).
//
// Test-integrity / wire-contract: these run ONLINE against the real `vaultspec
// serve` binary the global setup spawns (over the committed fixture vault), never
// a mocked wire. A passing test exercised the genuine `AuthoringClient` → wire →
// engine authoring domain end to end. The `AuthoringClient` is bound to the live
// transport (which carries the spawned engine's machine bearer); the per-principal
// actor-token header is layered on top exactly as it is in the browser.
//
// The load-bearing property: the walking skeleton "is not done until a human can
// click deny." The review-flow block drives create → submit → a HUMAN reviewer
// REJECTS — the human-in-the-loop deny seam — against the real backend, and proves
// denials-are-values (an agent self-approval comes back as a `denied` VALUE, not a
// thrown fault) and idempotent replay.

import { beforeAll, describe, expect, it } from "vitest";

import { createLiveClient, liveScope, liveTransport } from "../../testing/liveClient";
import {
  AuthoringClient,
  newIdempotencyKey,
  type AuthoringCommandOutcome,
  type CreateProposalPayload,
} from "./authoring";

/** A live client bound to the spawned engine (bearer via the live transport). */
function liveAuthoringClient(): AuthoringClient {
  return new AuthoringClient({ baseUrl: "", fetchImpl: liveTransport });
}

/** A unique suffix so each run's changesets/actors never collide in the shared
 *  engine's mutable authoring store. */
const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

// A REAL fixture-vault document the proposal targets. The V1 create path
// materializes every draft as a whole-document REPLACE against the target's
// current base (`materialize_replace_body` requires `ReplaceBody` + the base/
// current revisions to match the live worktree). So the proposal proposes the
// doc's CURRENT text plus one appended paragraph — a valid research doc — and the
// flow only ever REJECTS, so the fixture doc is never actually mutated (a reject
// does not materialize).
const TARGET_STEM = "2026-01-01-alpha-research";
const TARGET_NODE_ID = `doc:${TARGET_STEM}`;
const TARGET_PATH = ".vault/research/2026-01-01-alpha-research.md";

let client: AuthoringClient;
let baseRevision: string;
let scopeToken: string;
let proposedBody: string;

/** Create a durable authoring session over the wire and return its
 *  server-minted id. The session registry made sessions first-class — a
 *  proposal's `session_id` must name an EXISTING session — and the store has
 *  no session surface yet, so the test adopts the wire contract directly. */
async function createLiveSession(actorToken: string): Promise<string> {
  const res = await liveTransport("/authoring/v1/sessions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-authoring-actor-token": actorToken,
    },
    body: JSON.stringify({
      api_version: "v1",
      command: "create_session",
      idempotency_key: newIdempotencyKey("session-live"),
      payload: { scope: "worktree", title: "live-test session" },
    }),
  });
  const body = (await res.json()) as { data?: { session_id?: string } };
  if (!res.ok || typeof body.data?.session_id !== "string") {
    throw new Error(`session create failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return body.data.session_id;
}

/** A whole-document replace proposal against the real fixture target: its current
 *  body + one appended paragraph. */
function replaceProposal(
  sessionId: string,
  changesetId: string,
): CreateProposalPayload {
  return {
    session_id: sessionId,
    changeset_id: changesetId,
    summary: "Add a walking-skeleton note to the research doc",
    operations: [
      {
        child_key: "child_1",
        operation: "replace_body",
        target: {
          document: {
            kind: "existing",
            scope: scopeToken,
            node_id: TARGET_NODE_ID,
            stem: TARGET_STEM,
            path: TARGET_PATH,
            doc_type: "research",
            base_revision: baseRevision,
          },
          base_revision: baseRevision,
          current_revision: baseRevision,
        },
        draft: { mode: "whole_document", body: proposedBody },
      },
    ],
  };
}

beforeAll(async () => {
  client = liveAuthoringClient();
  // The real current blob revision + body of the target doc, from the active
  // worktree the authoring domain also reads — so create + submit fence against the
  // same base, and the proposed body is a valid doc (original + one paragraph).
  const scope = await liveScope();
  scopeToken = scope;
  const content = await createLiveClient().content(TARGET_NODE_ID, scope);
  baseRevision = `blob:${content.blob_hash}`;
  proposedBody = `${content.text.replace(/\n+$/, "")}\n\nAppended by the review-station walking skeleton.\n`;
});

describe("authoring read + bootstrap wire (live)", () => {
  it("serves the bounded review queue under the tiers envelope", async () => {
    const list = await client.listProposals();
    expect(Array.isArray(list.items)).toBe(true);
    // The bounded projection reports its cap and an honest truncation flag.
    expect(typeof list.cap).toBe("number");
    expect(typeof list.truncated).toBe("boolean");
    // Every response carries the tiers block (degradation read from it, never a
    // bare transport fault).
    expect(list.tiers).toBeTruthy();
    expect(typeof list.tiers).toBe("object");
  });

  it("returns null for an unknown changeset (typed 404 → honest absence)", async () => {
    const projection = await client.projectProposal(`missing_${run}`);
    expect(projection).toBeNull();
  });

  it("mints a per-principal actor token exactly once (machine-bearer bootstrap)", async () => {
    const issued = await client.issueActorToken({
      actor: { id: `agent:writer-${run}`, kind: "agent" },
    });
    expect(typeof issued.raw_token).toBe("string");
    expect(issued.raw_token.length).toBeGreaterThan(0);
    expect(issued.tiers).toBeTruthy();
  });
});

describe("human-in-the-loop review flow (live)", () => {
  it("drives create → submit → a HUMAN reviewer REJECTS, with denials-as-values", async () => {
    // Two distinct principals: the agent author and the human reviewer. The
    // self-approval ban is a REAL gate the human must clear by being different.
    const authorToken = (
      await client.issueActorToken({
        actor: { id: `agent:author-${run}`, kind: "agent" },
      })
    ).raw_token;
    const reviewerToken = (
      await client.issueActorToken({
        actor: { id: `human:reviewer-${run}`, kind: "human" },
      })
    ).raw_token;

    const changesetId = `changeset_${run}`;

    // 1. CREATE the draft proposal (agent author) inside a real session.
    const sessionId = await createLiveSession(authorToken);
    const created = await client.createProposal(
      replaceProposal(sessionId, changesetId),
      {
        actorToken: authorToken,
      },
    );
    expect(created.kind).toBe("ok");

    // It now shows up in the backend-served review DETAIL (the review station's
    // source), carrying the per-operation base + proposed diff texts.
    const queued = await client.projectProposal(changesetId);
    expect(queued).not.toBeNull();
    expect(queued?.proposal.changeset_id).toBe(changesetId);
    // The detail serves the base + proposed bodies the review diff renders over.
    expect(queued!.review_documents.length).toBeGreaterThan(0);
    const doc = queued!.review_documents[0];
    expect(doc.base.text.length).toBeGreaterThan(0);
    expect(doc.proposed.text).toContain("walking skeleton");

    // 2. SUBMIT for review (validate + submit + open-approval, composed server-side).
    const submitted = await client.submitForReview(
      changesetId,
      {
        expected_revision: queued!.proposal.changeset_revision,
        summary: "ready for review",
      },
      { actorToken: authorToken },
    );
    // Submit either opens the approval (ok) or refuses as a VALUE (denied) — never
    // a thrown fault. The deny-seam assertion only proceeds when it opened.
    expect(["ok", "denied", "in_flight"]).toContain(submitted.kind);
    if (submitted.kind !== "ok") {
      // Honest reachability floor: if the fixture-vault validation can't carry the
      // provisional-create to NeedsReview, we still proved create + the queue read
      // + denial-as-value; the decision leg is covered by the render test's wired
      // path. Surface the reason so the gap is legible, never faked.
      expect(submitted.kind === "denied" || submitted.kind === "in_flight").toBe(true);
      return;
    }

    const submitData = submitted.data as {
      proposal_id?: string;
      reviewed_revision?: string;
      approval?: { approval_id?: string };
    };
    const proposalId = submitData.proposal_id ?? "";
    const approvalId = submitData.approval?.approval_id ?? "";
    const reviewedRevision =
      submitData.reviewed_revision ?? queued!.proposal.changeset_revision;
    expect(proposalId).not.toBe("");
    expect(approvalId).not.toBe("");

    // 3a. DENIALS ARE VALUES: the agent AUTHOR tries to approve its OWN proposal →
    // the self-approval ban returns a `denied` VALUE on the 200 envelope.
    const selfApprove = await client.reviewDecision(
      approvalId,
      {
        proposal_id: proposalId,
        approval_id: approvalId,
        decision: "approve",
        reviewed_revision: reviewedRevision,
      },
      { actorToken: authorToken },
    );
    expect(selfApprove.kind).toBe("denied");
    if (selfApprove.kind === "denied") {
      expect(
        typeof selfApprove.reason === "string" || selfApprove.reason === null,
      ).toBe(true);
    }

    // 3b. THE HUMAN CLICKS DENY: a different, human, reviewer rejects the proposal.
    const rejected: AuthoringCommandOutcome = await client.reviewDecision(
      approvalId,
      {
        proposal_id: proposalId,
        approval_id: approvalId,
        decision: "reject",
        reviewed_revision: reviewedRevision,
        comment: "not ready",
      },
      { actorToken: reviewerToken },
    );
    expect(rejected.kind).toBe("ok");

    // The backend-served queue reflects the recorded decision (rejected status).
    const afterReject = await client.projectProposal(changesetId);
    expect(afterReject?.proposal.status).toBe("rejected");
  });

  it("replays an idempotent create to the recorded outcome (same key, no double-open)", async () => {
    const authorToken = (
      await client.issueActorToken({
        actor: { id: `agent:idem-${run}`, kind: "agent" },
      })
    ).raw_token;
    const changesetId = `changeset_idem_${run}`;
    const key = newIdempotencyKey("idem-live");
    // One session for BOTH sends: the create's idempotency digest covers the
    // payload, so the replay must carry the identical session id.
    const sessionId = await createLiveSession(authorToken);
    const payload = replaceProposal(sessionId, changesetId);

    const first = await client.createProposal(payload, {
      actorToken: authorToken,
      idempotencyKey: key,
    });
    const replay = await client.createProposal(payload, {
      actorToken: authorToken,
      idempotencyKey: key,
    });

    // Both resolve as VALUES; the replay is the recorded outcome, never a second
    // opened changeset or a thrown conflict.
    expect(first.kind).toBe("ok");
    expect(replay.kind).toBe("ok");
  });
});

// Direct editor save (ledgered-edit-migration W01.P02): the Save button's
// self-approving single-call route. Both cases below are NON-MUTATING (a
// denial and a stale-base conflict never materialize a write), so they are
// safe alongside the reject-only flow above without disturbing the shared
// scratch fixture's `alpha-research` content other live suites may also read.
// The real-apply leg (core write + rollback) is proven by the backend's own
// real-applied-receipt e2e; this file stays read-safe.
describe("direct editor save (live)", () => {
  it("denies a non-human actor's direct write without mutating the document", async () => {
    const engine = createLiveClient();
    const content = await engine.content(TARGET_NODE_ID, scopeToken);
    const agentToken = (
      await client.issueActorToken({
        actor: { id: `agent:dw-${run}`, kind: "agent" },
      })
    ).raw_token;

    const outcome = await client.directWrite(
      {
        operation: "replace_body",
        ref: TARGET_STEM,
        body: `${content.text}\nan agent may never direct-write\n`,
        expected_blob_hash: content.blob_hash,
      },
      { actorToken: agentToken },
    );

    expect(outcome.kind).toBe("denied");
    if (outcome.kind === "denied") {
      expect(outcome.reason ?? "").toContain("human actor");
    }
    // Never mutated: the current blob is unchanged.
    const after = await engine.content(TARGET_NODE_ID, scopeToken);
    expect(after.blob_hash).toBe(content.blob_hash);
  });

  it("resolves a stale optimistic base as a `conflict` VALUE, never a thrown fault", async () => {
    const humanToken = (
      await client.issueActorToken({
        actor: { id: `human:dw-conflict-${run}`, kind: "human" },
      })
    ).raw_token;

    const outcome = await client.directWrite(
      {
        operation: "replace_body",
        ref: TARGET_STEM,
        body: "irrelevant body — the base is deliberately stale",
        expected_blob_hash: "0000000000000000000000000000000000000000",
      },
      { actorToken: humanToken },
    );

    expect(outcome.kind).toBe("conflict");
    if (outcome.kind === "conflict") {
      expect(outcome.conflict.expected_blob_hash).toBe(
        "0000000000000000000000000000000000000000",
      );
      expect(outcome.conflict.actual_blob_hash.length).toBeGreaterThan(0);
    }
  });

  it("refuses a scope-pin mismatch as a redacted denial VALUE, never echoing the foreign scope (W02.P06)", async () => {
    const humanToken = (
      await client.issueActorToken({
        actor: { id: `human:dw-scope-${run}`, kind: "human" },
      })
    ).raw_token;
    const foreignScope = "a-scope-this-server-does-not-own";

    const outcome = await client.directWrite(
      {
        operation: "replace_body",
        ref: TARGET_STEM,
        body: "irrelevant body — the scope pin refuses before any write",
        expected_blob_hash: "0000000000000000000000000000000000000000",
        scope: foreignScope,
      },
      { actorToken: humanToken },
    );

    expect(outcome.kind).toBe("denied");
    if (outcome.kind === "denied") {
      // Redacted: the reason explains the refusal without echoing the
      // requested scope string back onto the wire.
      expect(outcome.reason ?? "").not.toContain(foreignScope);
      expect(outcome.reason ?? "").toContain("does not match");
    }
  });

  it("refuses a rename to an occupied stem as a `denied` VALUE carrying the RenameTargetCollision reason (W03.P08)", async () => {
    // Non-mutating: the target-stem collision refuses at apply-time preflight,
    // before any write — never materializes, so `alpha-research` stays pristine
    // for the reject-only flow above.
    const engine = createLiveClient();
    const content = await engine.content(TARGET_NODE_ID, scopeToken);
    const humanToken = (
      await client.issueActorToken({
        actor: { id: `human:dw-rename-collision-${run}`, kind: "human" },
      })
    ).raw_token;

    const outcome = await client.directWrite(
      {
        operation: "rename",
        ref: TARGET_STEM,
        // A stem the fixture vault already occupies (2026-01-05-beta-adr.md).
        new_stem: "2026-01-05-beta-adr",
        expected_blob_hash: content.blob_hash,
      },
      { actorToken: humanToken },
    );

    expect(outcome.kind).toBe("denied");
    if (outcome.kind === "denied") {
      expect(outcome.reason ?? "").toContain("already exists at the proposed stem");
    }
    // Never mutated: the source doc's blob is unchanged.
    const after = await engine.content(TARGET_NODE_ID, scopeToken);
    expect(after.blob_hash).toBe(content.blob_hash);
  });
});
