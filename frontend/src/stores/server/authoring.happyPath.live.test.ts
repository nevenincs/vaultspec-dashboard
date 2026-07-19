// S200 Increment-1 demo verify — the full authoring HAPPY PATH end-to-end through
// the frontend store against the real `vaultspec serve` (W03.P40).
//
// Test-integrity / wire-contract: ONLINE against the real engine the global setup
// spawns over a SCRATCH copy of the fixture vault that it makes a real vaultspec
// workspace (`vaultspec-core install --target`, liveEngine.globalSetup) — so a
// real apply drives a real `vaultspec-core` set-body WRITE against the scratch
// (discarded on teardown; the committed fixture is never mutated). The CHUNK C
// live test proves the DENY path; THIS proves the acceptance path:
//   create → submit → a distinct HUMAN reviewer APPROVES → APPLY (real core write,
//   applied receipt) → ROLL BACK (inverse changeset generated) → HISTORY reflects
//   the whole sequence — the propose→approve→apply→rollback→history S200 acceptance.
//
// The real-apply leg is GATED on core availability (read from the served `/status`
// core reachability), honest-degrading otherwise — core is NEVER faked (mirrors
// the backend real-applied-receipt e2e's core_ready gate).

import { beforeAll, describe, expect, it } from "vitest";

import { createLiveClient, liveScope, liveTransport } from "../../testing/liveClient";
import {
  AuthoringClient,
  newIdempotencyKey,
  type AuthoringCommandOutcome,
  type CreateProposalPayload,
} from "./authoring";

function liveAuthoringClient(): AuthoringClient {
  return new AuthoringClient({ baseUrl: "", fetchImpl: liveTransport });
}

const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/** Create a durable authoring session over the wire (a proposal's `session_id`
 *  must name an EXISTING session; the store has no session surface yet, so the
 *  test adopts the wire contract directly). */
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
      idempotency_key: newIdempotencyKey("session-hp"),
      payload: { scope: "worktree", title: "happy-path live session" },
    }),
  });
  const body = (await res.json()) as { data?: { session_id?: string } };
  if (!res.ok || typeof body.data?.session_id !== "string") {
    throw new Error(`session create failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return body.data.session_id;
}

// A prose research doc (distinct from the reject flow's target) — prose stays
// schema-valid through submit validation + real set-body, and only THIS test
// applies to it (in its own throwaway changeset).
const TARGET_STEM = "2026-01-04-beta-research";
const TARGET_NODE_ID = `doc:${TARGET_STEM}`;
const TARGET_PATH = ".vault/research/2026-01-04-beta-research.md";

let client: AuthoringClient;
let baseRevision: string;
let scopeToken: string;
let proposedBody: string;
let coreReachable: boolean;

function replaceProposal(
  sessionId: string,
  changesetId: string,
): CreateProposalPayload {
  return {
    session_id: sessionId,
    changeset_id: changesetId,
    summary: "Add a happy-path note to the research doc",
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
  const scope = await liveScope();
  scopeToken = scope;
  const engine = createLiveClient();
  // The core-availability gate for the real-apply leg (read from the served
  // status, never guessed). The setup installs a vaultspec workspace, so this is
  // expected true — but the leg honest-degrades if it is ever not.
  const status = await engine.status();
  coreReachable = status.core?.reachable === true;
  const content = await engine.content(TARGET_NODE_ID, scope);
  baseRevision = `blob:${content.blob_hash}`;
  // A MINIMAL valid research doc (tags + required `date` frontmatter only — the
  // shape the backend real-apply e2e proved `vault set-body` accepts). The
  // CLI-managed `modified:` stamp and `related:` links are omitted so the write
  // is not refused for a hand-supplied managed field.
  proposedBody =
    "---\ntags:\n  - '#research'\n  - '#beta'\ndate: '2026-01-04'\n---\n\n" +
    "# `beta` research: scope\n\nApplied by the review-station happy-path test.\n";
});

describe("full authoring happy path (live)", () => {
  it("propose → submit → request_changes returns the proposal to draft", async () => {
    // The three-verdict activation, exercised through the REAL client. A render-level
    // test that mocks the action seam cannot catch the envelope-command mapping: the
    // request-changes verdict rides the body as `decision:"edit"` but its envelope
    // `command` is `edit_proposal` — an unmapped `edit` 400s at deserialization
    // (`unknown variant "edit"`). This drives the live decisions route and asserts
    // the changeset returns to draft (the reviewer-edit arc).
    const authorToken = (
      await client.issueActorToken({
        actor: { id: `agent:hp-rc-author-${run}`, kind: "agent" },
      })
    ).raw_token;
    const reviewerToken = (
      await client.issueActorToken({
        actor: { id: `human:hp-rc-reviewer-${run}`, kind: "human" },
      })
    ).raw_token;
    const changesetId = `changeset_hp_rc_${run}`;

    const sessionId = await createLiveSession(authorToken);
    const created = await client.createProposal(
      replaceProposal(sessionId, changesetId),
      { actorToken: authorToken },
    );
    expect(created.kind).toBe("ok");
    const queued = await client.projectProposal(changesetId);

    const submitted = await client.submitForReview(
      changesetId,
      {
        expected_revision: queued!.proposal.changeset_revision,
        summary: "ready for review",
      },
      { actorToken: authorToken },
    );
    expect(submitted.kind).toBe("ok");
    if (submitted.kind !== "ok") throw new Error("submit did not open the approval");
    const submitData = submitted.data as {
      proposal_id?: string;
      reviewed_revision?: string;
      approval?: { approval_id?: string };
    };
    const proposalId = submitData.proposal_id ?? "";
    const approvalId = submitData.approval?.approval_id ?? "";
    const reviewedRevision =
      submitData.reviewed_revision ?? queued!.proposal.changeset_revision;

    // A distinct human reviewer REQUESTS CHANGES with the required note (the
    // self-approval ban does not gate request-changes; a distinct reviewer mirrors
    // the real flow). This is the exact call the ReviewStation "Request changes"
    // action makes.
    const requested = await client.reviewDecision(
      approvalId,
      {
        proposal_id: proposalId,
        approval_id: approvalId,
        decision: "edit",
        reviewed_revision: reviewedRevision,
        comment: "Tighten the rationale and cite the source ADR.",
      },
      { actorToken: reviewerToken },
    );
    expect(requested.kind).toBe("ok");

    // The EditProposal arc returned the changeset to draft under the reviewer's
    // identity — the writer's revision cycle.
    const afterRequest = await client.projectProposal(changesetId);
    expect(afterRequest?.proposal.status).toBe("draft");
  });

  it("propose → approve → apply → rollback → history through the store", async () => {
    const authorToken = (
      await client.issueActorToken({
        actor: { id: `agent:hp-author-${run}`, kind: "agent" },
      })
    ).raw_token;
    const reviewerToken = (
      await client.issueActorToken({
        actor: { id: `human:hp-reviewer-${run}`, kind: "human" },
      })
    ).raw_token;
    const changesetId = `changeset_hp_${run}`;

    // 1. CREATE (agent author) inside a real session.
    const sessionId = await createLiveSession(authorToken);
    const created = await client.createProposal(
      replaceProposal(sessionId, changesetId),
      {
        actorToken: authorToken,
      },
    );
    expect(created.kind).toBe("ok");
    const queued = await client.projectProposal(changesetId);
    expect(queued?.proposal.changeset_id).toBe(changesetId);

    // 2. SUBMIT for review.
    const submitted = await client.submitForReview(
      changesetId,
      {
        expected_revision: queued!.proposal.changeset_revision,
        summary: "ready for review",
      },
      { actorToken: authorToken },
    );
    expect(submitted.kind).toBe("ok");
    if (submitted.kind !== "ok") throw new Error("submit did not open the approval");
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

    // 3. A distinct HUMAN reviewer APPROVES (the acceptance decision — a different
    //    principal than the agent author, clearing the self-approval ban).
    const approved = await client.reviewDecision(
      approvalId,
      {
        proposal_id: proposalId,
        approval_id: approvalId,
        decision: "approve",
        reviewed_revision: reviewedRevision,
      },
      { actorToken: reviewerToken },
    );
    expect(approved.kind).toBe("ok");
    const afterApprove = await client.projectProposal(changesetId);
    expect(afterApprove?.proposal.status).toBe("approved");

    // 4. APPLY — the real vaultspec-core write, gated on core availability.
    const applied: AuthoringCommandOutcome = await client.applyChangeset(
      { changeset_id: changesetId, approval_id: approvalId },
      { actorToken: reviewerToken },
    );

    if (!coreReachable) {
      // Honest degrade: without an operable core the apply cannot really write.
      // Assert it is a legitimate VALUE (a recorded failed receipt or a denial),
      // never a faked success. The acceptance path can't complete here — the
      // backend real-applied-receipt e2e owns the guaranteed-core proof.
      expect(["ok", "denied"]).toContain(applied.kind);
      if (applied.kind === "ok") {
        expect((applied.data as { child_outcome?: unknown }).child_outcome).not.toBe(
          "applied",
        );
      }
      return;
    }

    // Core is operable → the apply MUST really apply (a recorded applied receipt).
    expect(applied.kind).toBe("ok");
    if (applied.kind === "ok") {
      expect(applied.data.child_outcome).toBe("applied");
      expect(applied.data.receipt).toBeTruthy();
    }
    const afterApply = await client.projectProposal(changesetId);
    expect(afterApply?.proposal.status).toBe("applied");
    // The applied changeset is now rollback-available (preimage captured at apply).
    expect(afterApply?.proposal.rollback.available).toBe(true);
    const childKey = afterApply?.proposal.rollback.child_key ?? "child_1";

    // 5. ROLL BACK — generate the inverse changeset (rides the same review path).
    const rolledBack = await client.createRollback(
      {
        source_changeset_id: changesetId,
        source_children: [{ source_child_key: childKey }],
        reason: "revert the happy-path apply",
      },
      { actorToken: reviewerToken },
    );
    expect(rolledBack.kind).toBe("ok");
    if (rolledBack.kind === "ok") {
      const rollbackId = rolledBack.data.rollback_changeset_id;
      expect(typeof rollbackId).toBe("string");
      expect((rollbackId as string).length).toBeGreaterThan(0);
    }

    // 6. HISTORY — the ledger reflects the full lifecycle sequence.
    const snapshot = await client.proposalSnapshot(changesetId);
    expect(snapshot.history.length).toBeGreaterThanOrEqual(4);
    // The latest ledger revision is the applied terminal state.
    const latest = snapshot.latest as { status?: string } | null;
    expect(latest?.status).toBe("applied");
  });
});
