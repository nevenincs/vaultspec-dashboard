// Section-anchored comments + plan-step tick LIVE-WIRE tests (authoring-surface
// W02.P03.S11).
//
// Test-integrity / wire-contract: these run ONLINE against the real `vaultspec
// serve` binary the global setup spawns (over the committed fixture vault), never a
// mocked wire. A passing test exercised the genuine `AuthoringClient` → wire →
// engine authoring domain end to end, including the backend-served anchor
// resolution (anchored vs orphaned), the comment CRUD lifecycle, the ledgered
// plan-step tick that flips the served plan-interior state, and the comment
// lifecycle events riding the authoring SSE feed.
//
// Mutation safety: `fileParallelism` is off (one file at a time against the shared
// engine), so the plan-tick block ticks the fixture plan's S02 and RESTORES it
// within the same test — no sibling file observes the transient state. The comment
// blocks create authoring-STATE entities (never a vault-document write) and delete
// what they create.

import { createHash } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { createLiveClient, liveScope, liveTransport } from "../../testing/liveClient";
import {
  AuthoringClient,
  adaptAuthoringStreamFrame,
  newIdempotencyKey,
  type SectionSelector,
} from "./authoring";
import { sseChunks } from "./queries";

/** A live client bound to the spawned engine (bearer via the live transport). */
function liveAuthoringClient(): AuthoringClient {
  return new AuthoringClient({ baseUrl: "", fetchImpl: liveTransport });
}

/** A unique suffix so each run's actors/comments never collide in the shared
 *  engine's mutable authoring store. */
const run = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

// Real fixture documents (a research doc with one heading section; the L1 plan with
// a checkable S02 step). The research doc is only ever READ; the plan's S02 is
// ticked and restored within one test.
const RESEARCH_NODE_ID = "doc:2026-01-01-alpha-research";
const PLAN_NODE_ID = "doc:2026-01-03-alpha-plan";
const PLAN_STEM = "2026-01-03-alpha-plan";

/** A 40-char lowercase-hex hash that is validly shaped but cannot match any live
 *  section — forces a backend-served content-hash-mismatch orphan without touching
 *  the corpus. */
const NON_MATCHING_HASH = "0".repeat(40);

let client: AuthoringClient;
let scope: string;

/**
 * The git blob OID of `content` — the SAME digest `ingest_struct::reader::blob_oid`
 * computes and the section selector's `expected_content_hash` fences against.
 * Reproduced from the git blob spec (`sha1("blob " + len + "\0" + bytes)`), not
 * copied from a run, so an ANCHORED selector can be authored deterministically here
 * exactly as the reader affordance (S15) will build it from a live section.
 */
function gitBlobOid(content: string): string {
  const bytes = Buffer.from(content, "utf8");
  const header = Buffer.from(`blob ${bytes.length}\0`, "utf8");
  return createHash("sha1")
    .update(Buffer.concat([header, bytes]))
    .digest("hex");
}

/**
 * The heading text + section bytes of the FIRST level-1 ATX heading in `body` — its
 * heading line through EOF, the single-H1 case, matching the engine's
 * `parse_heading_sections` section bounds (the last heading's section runs to the
 * document end). The fixture research doc is all ASCII, so a char slice is a byte
 * slice.
 */
function firstH1Section(body: string): { headingText: string; section: string } {
  const lines = body.split("\n");
  let offset = 0;
  for (const line of lines) {
    const match = /^#\s+(.+?)\s*$/.exec(line);
    if (match) return { headingText: match[1], section: body.slice(offset) };
    offset += line.length + 1; // + the "\n" the split removed
  }
  throw new Error("fixture research doc has no level-1 heading");
}

/** Look up a step by canonical id across the tier-conditional interior tree. */
function findStep(
  interior: { waves: unknown[]; phases: unknown[]; steps: unknown[] },
  id: string,
): { id: string; done: boolean } | undefined {
  const scan = (steps: unknown[]) =>
    (steps as { id: string; done: boolean }[]).find((step) => step.id === id);
  const flat = scan(interior.steps);
  if (flat) return flat;
  for (const phase of interior.phases as { steps: unknown[] }[]) {
    const hit = scan(phase.steps);
    if (hit) return hit;
  }
  for (const wave of interior.waves as { phases: { steps: unknown[] }[] }[]) {
    for (const phase of wave.phases) {
      const hit = scan(phase.steps);
      if (hit) return hit;
    }
  }
  return undefined;
}

/**
 * Poll the SERVED plan-interior until step `stepId` reaches `expected` done state.
 * A ledgered tick writes the plan file synchronously (the direct-write's post-
 * verify re-reads the file), but the plan-interior PROJECTION updates only after
 * the watcher re-ingests and bumps the graph generation — so the served `done`
 * flips a beat later. Polling the real wire is the honest way to observe that
 * re-ingest, and (at restore time) to guarantee the fixture is settled back before
 * the next test file reads it.
 */
async function waitForStepDone(
  engine: ReturnType<typeof createLiveClient>,
  stepId: string,
  expected: boolean,
  timeoutMs = 12_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last: boolean | undefined;
  while (Date.now() < deadline) {
    const interior = (await engine.planInterior(PLAN_NODE_ID, scope)).interior;
    last = findStep(interior, stepId)?.done;
    if (last === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(
    `plan step ${stepId} did not reach done=${expected} within ${timeoutMs}ms (last=${last})`,
  );
}

/** Mint a registered-active human principal (the machine-bearer bootstrap
 *  registers the actor, so its commands do not 403 on `ensure_active`). */
async function humanToken(label: string): Promise<string> {
  const issued = await client.issueActorToken({
    actor: { id: `human:${label}-${run}`, kind: "human" },
  });
  return issued.raw_token;
}

beforeAll(async () => {
  client = liveAuthoringClient();
  scope = await liveScope();
});

describe("section-anchored comments (live)", () => {
  it("creates a comment that lists as ANCHORED against a live heading section", async () => {
    const engine = createLiveClient();
    const content = await engine.content(RESEARCH_NODE_ID, scope);
    const { headingText, section } = firstH1Section(content.text);
    const selector: SectionSelector = {
      heading_path: [headingText],
      expected_content_hash: gitBlobOid(section),
    };
    const token = await humanToken("comment-anchor");

    const created = await client.createComment(
      RESEARCH_NODE_ID,
      { selector, body: "anchored note from the live suite" },
      { actorToken: token, idempotencyKey: newIdempotencyKey(`anchor-${run}`) },
    );
    expect(created.comment_id.length).toBeGreaterThan(0);
    expect(created.resolved).toBe(false);
    expect(created.author.kind).toBe("human");

    const list = await client.listComments(RESEARCH_NODE_ID);
    expect(list.documentNodeId).toBe(RESEARCH_NODE_ID);
    expect(list.tiers).toBeTruthy();
    const mine = list.comments.find(
      (entry) => entry.comment.comment_id === created.comment_id,
    );
    expect(mine).toBeDefined();
    // The anchor resolved EXACTLY against the live section — backend-served, never
    // frontend-derived.
    expect(mine!.orphaned).toBe(false);
    expect(mine!.anchor.state).toBe("anchored");

    // Clean up the authoring-state entity we created.
    const deleted = await client.deleteComment(created.comment_id, {
      actorToken: token,
    });
    expect(deleted).toBe(true);
  });

  it("serves a comment as ORPHANED (content-hash mismatch) when the section drifted", async () => {
    const engine = createLiveClient();
    const content = await engine.content(RESEARCH_NODE_ID, scope);
    const { headingText } = firstH1Section(content.text);
    // A real heading path but a hash that cannot match the live section — the same
    // signal a genuine post-edit section drift produces, with no corpus mutation.
    const selector: SectionSelector = {
      heading_path: [headingText],
      expected_content_hash: NON_MATCHING_HASH,
    };
    const token = await humanToken("comment-mismatch");

    const created = await client.createComment(
      RESEARCH_NODE_ID,
      { selector, body: "note on a drifted section" },
      { actorToken: token, idempotencyKey: newIdempotencyKey(`mismatch-${run}`) },
    );

    const list = await client.listComments(RESEARCH_NODE_ID);
    const mine = list.comments.find(
      (entry) => entry.comment.comment_id === created.comment_id,
    );
    expect(mine).toBeDefined();
    expect(mine!.orphaned).toBe(true);
    expect(mine!.anchor.state).toBe("orphaned");
    if (mine!.anchor.state === "orphaned") {
      expect(mine!.anchor.evidence.reason).toBe("content_hash_mismatch");
    }

    await client.deleteComment(created.comment_id, { actorToken: token });
  });

  it("serves a comment as ORPHANED (missing anchor) when the heading does not exist", async () => {
    const selector: SectionSelector = {
      heading_path: [`A Heading The Fixture Never Had ${run}`],
      expected_content_hash: NON_MATCHING_HASH,
    };
    const token = await humanToken("comment-missing");

    const created = await client.createComment(
      RESEARCH_NODE_ID,
      { selector, body: "note on a removed section" },
      { actorToken: token, idempotencyKey: newIdempotencyKey(`missing-${run}`) },
    );

    const list = await client.listComments(RESEARCH_NODE_ID);
    const mine = list.comments.find(
      (entry) => entry.comment.comment_id === created.comment_id,
    );
    expect(mine).toBeDefined();
    expect(mine!.orphaned).toBe(true);
    if (mine!.anchor.state === "orphaned") {
      expect(mine!.anchor.evidence.reason).toBe("missing_anchor");
    }

    await client.deleteComment(created.comment_id, { actorToken: token });
  });

  it("round-trips edit, resolve, reopen, and delete over the real wire", async () => {
    const selector: SectionSelector = {
      heading_path: [`CRUD anchor ${run}`],
      expected_content_hash: NON_MATCHING_HASH,
    };
    const token = await humanToken("comment-crud");

    const created = await client.createComment(
      RESEARCH_NODE_ID,
      { selector, body: "first" },
      { actorToken: token, idempotencyKey: newIdempotencyKey(`crud-${run}`) },
    );
    const id = created.comment_id;

    const edited = await client.updateComment(
      id,
      { op: "edit_body", body: "second" },
      { actorToken: token },
    );
    expect(edited.body).toBe("second");
    expect(edited.updated_at_ms).toBeGreaterThanOrEqual(created.updated_at_ms);

    const resolved = await client.updateComment(
      id,
      { op: "set_resolved", resolved: true },
      { actorToken: token },
    );
    expect(resolved.resolved).toBe(true);
    expect(typeof resolved.resolved_at_ms).toBe("number");

    const reopened = await client.updateComment(
      id,
      { op: "set_resolved", resolved: false },
      { actorToken: token },
    );
    expect(reopened.resolved).toBe(false);

    // The listing reflects each backend-served mutation.
    const list = await client.listComments(RESEARCH_NODE_ID);
    const mine = list.comments.find((entry) => entry.comment.comment_id === id);
    expect(mine?.comment.body).toBe("second");
    expect(mine?.comment.resolved).toBe(false);

    const deleted = await client.deleteComment(id, { actorToken: token });
    expect(deleted).toBe(true);
    // A replayed delete is an idempotent no-op (nothing left to remove).
    const deletedAgain = await client.deleteComment(id, { actorToken: token });
    expect(deletedAgain).toBe(false);

    const after = await client.listComments(RESEARCH_NODE_ID);
    expect(after.comments.some((entry) => entry.comment.comment_id === id)).toBe(false);
  });

  it("emits a comment lifecycle event on the authoring SSE feed (the comment delta path)", async () => {
    const selector: SectionSelector = {
      heading_path: [`SSE anchor ${run}`],
      expected_content_hash: NON_MATCHING_HASH,
    };
    const token = await humanToken("comment-sse");

    const created = await client.createComment(
      RESEARCH_NODE_ID,
      { selector, body: `sse note ${run}` },
      { actorToken: token, idempotencyKey: newIdempotencyKey(`sse-${run}`) },
    );

    // The finite durable replay carries the comment.created event on the SAME
    // authoring outbox/SSE feed the review queue rides — so a subscribed thread's
    // blanket authoring invalidation refreshes its listing.
    const response = await client.openEventStream(0);
    let sawCommentEvent = false;
    let frames = 0;
    for await (const chunk of sseChunks(response)) {
      const frame = adaptAuthoringStreamFrame(chunk);
      if (frame.kind === "lifecycle" && frame.event.aggregate_kind === "comment") {
        sawCommentEvent = true;
        break;
      }
      // Safety valve: the fixture store is fresh so events are few; never spin
      // unbounded on a pathological feed.
      if (++frames > 500) break;
    }
    expect(sawCommentEvent).toBe(true);

    await client.deleteComment(created.comment_id, { actorToken: token });
  });
});

describe("ledgered plan-step tick (live)", () => {
  it("ticks a plan step, flips the served plan-interior state, is idempotent, and restores", async () => {
    const engine = createLiveClient();
    const token = await humanToken("plan-tick");

    // S02 starts open in the fixture plan.
    const before = await engine.planInterior(PLAN_NODE_ID, scope);
    expect(findStep(before.interior, "S02")?.done).toBe(false);

    try {
      // TICK: close S02 through the ledgered direct-write, fenced on the plan's
      // current blob hash (the engine-side stale-base substitute). `content()` is
      // a direct file read, so the fence base is fresh immediately after a write.
      const base0 = (await engine.content(PLAN_NODE_ID, scope)).blob_hash;
      const ticked = await client.directWrite(
        {
          operation: "set_plan_step_state",
          ref: PLAN_STEM,
          planStep: { stepId: "S02", state: "checked" },
          expected_blob_hash: base0,
        },
        { actorToken: token },
      );
      expect(ticked.kind).toBe("applied");

      // The served plan-interior `done` flips once the watcher re-ingests.
      await waitForStepDone(engine, "S02", true);

      // IDEMPOTENT re-tick: re-requesting the state S02 already holds is a success
      // (core reports "unchanged"), never an error.
      const base1 = (await engine.content(PLAN_NODE_ID, scope)).blob_hash;
      const retick = await client.directWrite(
        {
          operation: "set_plan_step_state",
          ref: PLAN_STEM,
          planStep: { stepId: "S02", state: "checked" },
          expected_blob_hash: base1,
        },
        { actorToken: token },
      );
      expect(retick.kind).toBe("applied");
      const stillDone = await engine.planInterior(PLAN_NODE_ID, scope);
      expect(findStep(stillDone.interior, "S02")?.done).toBe(true);
    } finally {
      // RESTORE: re-open S02 so the shared fixture ends as it began, and WAIT for
      // the re-ingest to settle so no sibling test file observes the transient
      // closed state. Runs even if an assertion above throws.
      const base2 = (await engine.content(PLAN_NODE_ID, scope)).blob_hash;
      const restored = await client.directWrite(
        {
          operation: "set_plan_step_state",
          ref: PLAN_STEM,
          planStep: { stepId: "S02", state: "unchecked" },
          expected_blob_hash: base2,
        },
        { actorToken: token },
      );
      expect(restored.kind).toBe("applied");
      await waitForStepDone(engine, "S02", false);
    }
  });

  it("resolves a stale-base plan tick as a `conflict` VALUE, never a thrown fault", async () => {
    const token = await humanToken("plan-tick-conflict");
    const outcome = await client.directWrite(
      {
        operation: "set_plan_step_state",
        ref: PLAN_STEM,
        planStep: { stepId: "S02", state: "checked" },
        // A deliberately stale base: the engine-side fence refuses before invoking
        // the plan CLI, surfacing a typed conflict VALUE.
        expected_blob_hash: NON_MATCHING_HASH,
      },
      { actorToken: token },
    );
    expect(outcome.kind).toBe("conflict");
  });
});
