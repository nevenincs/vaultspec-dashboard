// Authoring restart/replay/reconnect + security-negative acceptance (W14.P42
// S207/S208). Drives the REAL `/authoring/v1/*` wire — no mock — over a
// dedicated, scratch-scoped `vaultspec serve` process this file spawns and
// controls itself (`./authoring/engine.ts`), never the shared main worktree's
// `serve`. The review-station UI (P40) is a thin skeleton with no surface for
// most of these flows (restart, replay cursors, fencing, forbidden-tool), so
// every scenario here is driven API-level, exactly the way the engine's own
// live-wire acceptance test drives it
// (`engine/crates/vaultspec-api/tests/authoring_p42a_acceptance.rs`) — still a
// genuine end-to-end test of the real wire, per the project's
// tests-exercise-the-live-wire rule; it is simply exercised without a browser
// page in front of it.
//
// Scenario -> mechanism map:
//   restart              -> kill + respawn the engine against the SAME scratch
//                            worktree; the durable outbox/proposal state must
//                            survive (`.vault/data/authoring-state/` on disk).
//   replay                -> GET /authoring/v1/events?last_seq=N (SSE), read a
//                            bounded page of durable lifecycle frames.
//   reconnect/stream gap   -> a cursor ahead of the high-water mark returns a
//                            `gap` frame naming `next_recovery_seq`; the client
//                            recovers via GET /authoring/v1/recovery.
//   duplicate retry        -> the SAME idempotency key replays the recorded
//                            receipt (`data.replayed`) instead of re-executing.
//   unauthorized actor     -> an unknown actor token is a redacted 401.
//   forbidden scope        -> a target claiming a foreign workspace is a
//                            redacted denial VALUE (never a fault).
//   forbidden tool         -> a `system` actor may not invoke the semantic
//                            tool surface (authorization guard; `tool_executor`
//                            is a modeled kind but is not yet a registrable
//                            principal on the live actor-token route, so it is
//                            not wire-reachable here — see the test's note).
//   multi-client conflict  -> two agents race the same document; the loser's
//                            apply is refused, then recovers via a fresh
//                            proposal against the new base (the engine's own
//                            module note: the wire-reachable rebase outcome is
//                            the deterministic gate, not a positive
//                            Conflicted -> Draft resolve, which is unit-covered
//                            only — see `authoring/rebase.rs`).

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { AuthoringClient, field, str } from "./authoring/client";
import {
  DOC_ONE,
  DOC_TWO,
  type EngineHandle,
  type FixtureWorktree,
  createFixtureWorktree,
  removeFixtureWorktree,
  restartEngine,
  spawnEngine,
  stopEngine,
} from "./authoring/engine";

test.describe.configure({ mode: "serial" });

let fixture: FixtureWorktree;
let engine: EngineHandle;
let client: AuthoringClient;
let scope: string;

test.beforeAll(async () => {
  fixture = createFixtureWorktree();
  engine = await spawnEngine(fixture.root);
  client = new AuthoringClient(engine.baseUrl, engine.token);
  scope = await client.activeScope();
});

test.afterAll(async () => {
  await stopEngine(engine);
  removeFixtureWorktree(fixture.root);
});

/** Create -> submit -> approve a changeset on `doc`; returns the approval id,
 *  the proposal id, and the reviewed revision the approval was opened against. */
async function createSubmitApprove(
  agentToken: string,
  reviewerToken: string,
  doc: typeof DOC_ONE,
  changesetId: string,
  base: string,
): Promise<{ approvalId: string; proposalId: string; reviewed: string }> {
  const session = await client.createSession(agentToken, `idem:session:${changesetId}`);
  const created = await client.createProposal(
    agentToken,
    session,
    scope,
    doc,
    changesetId,
    `idem:create:${changesetId}`,
    base,
    `---\ntags:\n  - '#plan'\ndate: '2026-01-06'\n---\n\n# ${doc.stem}\n\nmaterialized by ${changesetId}\n`,
  );
  expect(created.status, created.raw).toBe(200);
  expect(created.data["status"]).toBe("draft");
  const revision = str(created.data, "changeset_revision");

  const submitted = await client.submitForReview(
    agentToken,
    changesetId,
    revision,
    `idem:submit:${changesetId}`,
  );
  expect(submitted.status, submitted.raw).toBe(200);
  const proposalId = str(submitted.data, "proposal_id");
  const approvalId = str(submitted.data, "approval", "approval_id");
  const reviewed = str(submitted.data, "reviewed_revision");

  const decided = await client.decideReview(
    reviewerToken,
    approvalId,
    proposalId,
    reviewed,
    "approve",
    `idem:approve:${changesetId}`,
  );
  expect(decided.status, decided.raw).toBe(200);
  expect(decided.data["status"]).toBe("decided");

  return { approvalId, proposalId, reviewed };
}

test("a duplicate apply retry replays the recorded receipt instead of re-executing", async () => {
  const agent = await client.issueActorToken("agent:e2e-writer", "agent");
  const reviewer = await client.issueActorToken("human:e2e-reviewer", "human");
  const base = fixture.baseOf(DOC_ONE);
  const { approvalId } = await createSubmitApprove(
    agent,
    reviewer,
    DOC_ONE,
    "changeset_duplicate_retry",
    base,
  );

  const idem = "idem:apply:duplicate-retry";
  const first = await client.apply(
    reviewer,
    "changeset_duplicate_retry",
    approvalId,
    idem,
  );
  expect(first.status, first.raw).toBe(200);
  expect(first.data["status"]).toBe("recorded");
  const firstReceiptId = field(first.data, "receipt", "receipt_id");
  expect(firstReceiptId, first.raw).toBeTruthy();

  const second = await client.apply(
    reviewer,
    "changeset_duplicate_retry",
    approvalId,
    idem,
  );
  expect(second.status, second.raw).toBe(200);
  expect(second.data["status"], "the retry REPLAYS, it never re-executes").toBe(
    "replayed",
  );
  expect(
    field(second.data, "receipt", "receipt_id"),
    "the retry replays the SAME receipt, never a fresh one",
  ).toBe(firstReceiptId);
});

test("a backend restart preserves the durable outbox and proposal snapshot", async () => {
  const agent = await client.issueActorToken("agent:e2e-restart", "agent");
  const reviewer = await client.issueActorToken("human:e2e-restart-reviewer", "human");
  const base = fixture.baseOf(DOC_TWO);
  await createSubmitApprove(agent, reviewer, DOC_TWO, "changeset_restart", base);

  const before = await client.recovery();
  expect(before.status, before.raw).toBe(200);
  const seqBefore = field(before.data, "latest_outbox_seq");
  expect(typeof seqBefore).toBe("number");
  const proposalsBefore = field(before.data, "snapshot", "proposals", "items");
  const idsBefore = Array.isArray(proposalsBefore)
    ? proposalsBefore.map((p) => field(p as Record<string, unknown>, "changeset_id"))
    : [];
  expect(idsBefore, before.raw).toContain("changeset_restart");

  // The genuine restart: kill the process, respawn it against the SAME scratch
  // worktree (a fresh port + a freshly rotated service token).
  engine = await restartEngine(fixture.root, engine);
  client = new AuthoringClient(engine.baseUrl, engine.token);

  const after = await client.recovery();
  expect(after.status, after.raw).toBe(200);
  const seqAfter = field(after.data, "latest_outbox_seq");
  expect(
    seqAfter,
    "the durable outbox sequence never resets across a process restart",
  ).toBe(seqBefore);
  const proposalsAfter = field(after.data, "snapshot", "proposals", "items");
  const idsAfter = Array.isArray(proposalsAfter)
    ? proposalsAfter.map((p) => field(p as Record<string, unknown>, "changeset_id"))
    : [];
  expect(idsAfter, after.raw).toContain("changeset_restart");

  // Replay from 0 still serves the pre-restart durable lifecycle rows — the
  // restart+replay combination this scenario is named for.
  const frames = await client.replayEvents(0, { minFrames: 1, timeoutMs: 4000 });
  expect(frames.length, "the post-restart engine replays durable rows").toBeGreaterThan(
    0,
  );
  for (const frame of frames) {
    expect(frame.event).toBe("lifecycle");
    expect(typeof frame.data["seq"]).toBe("number");
    expect(typeof frame.data["event_kind"]).toBe("string");
  }
});

test("a stream gap recovers through the recovery snapshot's next_seq", async () => {
  const recovery = await client.recovery();
  expect(recovery.status, recovery.raw).toBe(200);
  const latest = field(recovery.data, "latest_outbox_seq");
  expect(typeof latest).toBe("number");
  const aheadCursor = (latest as number) + 1000;

  // A cursor far ahead of the high-water mark (a client that lost the stream
  // and now presents a stale/racing cursor) is a named GAP, not silence or a
  // fault.
  const gapFrames = await client.replayEvents(aheadCursor, {
    minFrames: 1,
    timeoutMs: 3000,
  });
  expect(
    gapFrames.length,
    "a cursor-ahead reconnect is served as a gap frame",
  ).toBeGreaterThan(0);
  const gap = gapFrames[0]!;
  expect(gap.event).toBe("gap");
  expect(gap.data["reason"]).toBe("cursor_ahead_of_high_water");
  const nextRecoverySeq = field(gap.data, "next_recovery_seq");
  expect(typeof nextRecoverySeq).toBe("number");

  // The client recovers by falling back to the snapshot, resuming replay from
  // the server-named `next_seq` — never guessing a cursor.
  const recovered = await client.recovery(nextRecoverySeq as number);
  expect(recovered.status, recovered.raw).toBe(200);
  expect(field(recovered.data, "requested_last_seq")).toBe(nextRecoverySeq);
  expect(typeof field(recovered.data, "next_seq")).toBe("number");
});

test("an unauthorized actor is refused with a redacted 401", async () => {
  const bogus = "deadbeefdeadbeefdeadbeefdeadbeef";
  const session = await client.createSession(
    await client.issueActorToken("agent:e2e-authz", "agent"),
    "idem:session:authz",
  );
  const base = fixture.baseOf(DOC_ONE);
  const created = await client.createProposal(
    bogus,
    session,
    scope,
    DOC_ONE,
    "changeset_authz",
    "idem:create:authz",
    base,
    "irrelevant body — the actor is refused before this is read",
  );
  expect(created.status, created.raw).toBe(401);
  expect(created.error_kind).toBe("authoring_actor_token_unknown");
  expect(created.raw, "the refusal must not echo the presented token").not.toContain(
    bogus,
  );
  expect(created.raw, "the refusal must not echo a document path").not.toContain(
    DOC_ONE.path,
  );
});

test("a cross-workspace target is refused as a redacted denial value", async () => {
  const agent = await client.issueActorToken("agent:e2e-scope", "agent");
  const session = await client.createSession(agent, "idem:session:scope");
  const base = fixture.baseOf(DOC_ONE);
  const foreignScope = "/some/other/worktree";

  const created = await client.createProposal(
    agent,
    session,
    foreignScope,
    DOC_ONE,
    "changeset_scope",
    "idem:create:scope",
    base,
    "irrelevant body — the scope guard denies before this is read",
  );
  // A scope refusal is a denial VALUE, not a fault — the 200 envelope carries it.
  expect(created.status, created.raw).toBe(200);
  expect(created.data["status"]).toBe("denied");
  const reason = str(created.data, "reason");
  expect(reason).toContain("scope");
  expect(reason, "the redacted denial must not echo the foreign scope").not.toContain(
    foreignScope,
  );
});

test("a system actor may not invoke the semantic tool surface (forbidden tool)", async () => {
  // The live actor-token issuance route only registers human/agent/system in
  // this subset (`tool_executor` is a modeled `ActorKind`, per the security
  // guard's own unit coverage, but is not yet a registrable principal — the
  // registration route refuses it with `authoring_actor_forbidden`). `system`
  // is registrable AND is one of the two kinds `tool_requester_kind_guard`
  // refuses, so it is the wire-reachable forbidden-tool case.
  const systemActor = await client.issueActorToken("system:e2e-scheduler", "system");
  const result = await client.executeAgentTool(
    systemActor,
    "run:e2e:forbidden-tool",
    "call:e2e:forbidden-tool",
    "read_context",
    { target: "document_list", cap: 1 },
    "idem:tool-execute:forbidden",
  );
  expect(result.status, result.raw).toBe(200);
  expect(result.data["status"]).toBe("denied");
  expect(result.data["allowed"]).toBe(false);
  const reason = str(result.data, "reason");
  expect(reason).toContain("may not invoke the semantic tool surface");
});

test("two racing clients: the loser's apply is refused and recovers via a fresh proposal", async () => {
  const agentA = await client.issueActorToken("agent:e2e-writer-a", "agent");
  const agentB = await client.issueActorToken("agent:e2e-writer-b", "agent");
  const reviewer = await client.issueActorToken("human:e2e-race-reviewer", "human");
  const staleBase = fixture.baseOf(DOC_TWO);

  // Both clients propose against the SAME base — the two-concurrent-writers setup.
  const { approvalId: approvalB } = await createSubmitApprove(
    agentB,
    reviewer,
    DOC_TWO,
    "changeset_race_loser",
    staleBase,
  );
  await createSubmitApprove(
    agentA,
    reviewer,
    DOC_TWO,
    "changeset_race_winner",
    staleBase,
  );

  // An out-of-band write staleing B's recorded base — the race's outcome (a
  // second writer, or A's materialization, landed first).
  writeFileSync(
    join(fixture.root, ...DOC_TWO.path.split("/")),
    "---\ntags:\n  - '#plan'\ndate: '2026-01-06'\n---\n\n# raced\n\nwinner landed first\n",
  );

  const conflictReport = await client.conflicts("changeset_race_loser");
  expect(conflictReport.status, conflictReport.raw).toBe(200);
  expect(conflictReport.data["has_conflict"]).toBe(true);
  const findings = field(conflictReport.data, "findings");
  expect(Array.isArray(findings) && findings.length > 0, conflictReport.raw).toBe(true);

  const refused = await client.apply(
    reviewer,
    "changeset_race_loser",
    approvalB,
    "idem:apply:race-loser",
  );
  expect(refused.status, refused.raw).toBe(200);
  expect(refused.data["status"]).toBe("denied");
  expect(
    field(refused.data, "receipt"),
    "a conflict-refused apply never reaches the core",
  ).toBeUndefined();

  // The explicit rebase route is live-wired and deterministically gated (the
  // engine's own module note: a positive Conflicted -> Draft resolve is not
  // wire-reachable post-conflict-preflight, so this asserts the reachable gate,
  // not the positive transition). The refused apply above already advanced the
  // changeset's revision (the conflict-preflight denial is itself a recorded
  // transition), so the rebase fence must key off the CURRENT revision, not
  // the one captured back at submit time.
  const currentRevision = await client.currentRevision("changeset_race_loser");
  const rebaseAttempt = await client.rebase(
    agentB,
    "changeset_race_loser",
    currentRevision,
    "idem:rebase:race-loser",
  );
  expect(rebaseAttempt.status, rebaseAttempt.raw).toBe(200);

  // The honest recovery path: B abandons the stale proposal and re-proposes
  // against the NEW base, then successfully proceeds through the same lifecycle.
  const freshBase = fixture.baseOf(DOC_TWO);
  expect(freshBase, "the out-of-band edit changed the on-disk base").not.toBe(
    staleBase,
  );
  const { approvalId: recoveredApproval } = await createSubmitApprove(
    agentB,
    reviewer,
    DOC_TWO,
    "changeset_race_loser_recovered",
    freshBase,
  );
  const recoveredApply = await client.apply(
    reviewer,
    "changeset_race_loser_recovered",
    recoveredApproval,
    "idem:apply:race-loser-recovered",
  );
  expect(recoveredApply.status, recoveredApply.raw).toBe(200);
  expect(
    field(recoveredApply.data, "receipt"),
    "the recovered proposal, against the current base, proceeds past the gate",
  ).toBeTruthy();
});
