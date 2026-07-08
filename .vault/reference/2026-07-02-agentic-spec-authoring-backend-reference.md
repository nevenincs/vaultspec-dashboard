---
tags:
  - '#reference'
  - '#agentic-spec-authoring-backend'
date: '2026-07-02'
modified: '2026-07-02'
related:
  - "[[2026-07-02-agentic-spec-authoring-backend-audit]]"
  - "[[2026-07-02-agentic-operation-modes-adr]]"
  - "[[2026-06-29-agentic-apply-materialization-adr]]"
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# `agentic-spec-authoring-backend` reference: `walking-skeleton rollout order and schedule`

## Summary

This is the CAMPAIGN ROLLOUT DESIGN the reworked ADR corpus implies (architecture
review findings ASA-002/003/004; apply-materialization amended to single-child V1;
operation-modes ACCEPTED 2026-07-02; multiagent-composition demoted to proposed;
chunk-management superseded). It re-sequences the existing L4 plan's remaining work
(W03–W09, ~170 steps) into SIX INCREMENTS, each ending in a demonstrable vertical
capability and a review gate, so the product loop — an agent proposes, the user
accepts or denies, or the mode applies autonomously — exists at the END OF
INCREMENT 1 instead of wave 8 of 9. The plan-writer applies this mechanically with
`vaultspec-core vault plan` verbs (this restructuring is the explicit plan
amendment the plan's own Description clause requires for boundary changes); every
existing phase is mapped below to an increment, a slimmed subset, or an explicit
deferral with its return trigger. Nothing already shipped (W01 contract, W02 store)
changes.

Ordering principles (why this order is optimal): (1) VERTICAL BEFORE HORIZONTAL —
the first increment is the thinnest end-to-end path through every layer, so each
later increment lands on evidence, not speculation. (2) DEPENDENCY-TRUE — the core
adapter (old W08.P35) moves EARLY because apply is the skeleton's terminal
dependency, not a late-wave concern; streams move LATE because polling is a
correct-first UX that hardens later. (3) HEADLINE EARLY — operation modes
(autonomous delivery, the user's stated requirement) is Increment 2, agent-agnostic
and independent of LangGraph, so the product's defining capability does not wait on
the agent runtime. (4) EVERY INCREMENT SHIPS A DEMO — each closes with a named,
live-verifiable demonstration plus the standard per-phase review gate.

## Increment 1 — walking skeleton (propose → review → apply → rollback, manual mode)

GOAL: one human or scripted client can create a single-child body-edit proposal on
a real vault document, see its diff, have a human approve or reject it in the
dashboard, watch an approved change materialize through the core adapter, and roll
it back from its preimage. Polling only; manual mode only; single reviewer; no
sessions, leases, LangGraph, streams, sections, or chunks.

Ordered steps (existing plan phases mapped; "subset" = slim to what the skeleton
needs, the rest stays in its later increment):

1. `W03.P10` document reference resolver — AS PLANNED (already in flight).
2. `W03.P11` revision snapshots and preimages — AS PLANNED.
3. `W03.P13` SUBSET: whole-document operation payloads + materialized preview +
   review diff. Section-scoped/atomic-hunk operations DEFER to Increment 5
   (skeleton evidence decides whether agents need sub-document edits at all).
4. `W03.P14` validation digest + stale-input detection — AS PLANNED (full
   conformance before approval-ready; revalidation at apply).
5. `W04.P15` + `W04.P16` + `W04.P17` ledger aggregate, transition engine,
   proposal command handlers — AS PLANNED, with the transition engine enforcing
   the single-child apply restriction (amended apply-materialization ADR) and the
   two staged-apply statuses reserved-unreachable.
6. `W05.P19` SUBSET: minimal actor records (human + agent identity, stable
   provenance keys) — every ledger record is actor-attributed from day one.
   Delegated scopes and service identities DEFER to Increment 5.
7. `W08.P35` core adapter capability registry — MOVED EARLY (body edit,
   frontmatter edit, create verbs; caps/timeouts/pinning as decided). This is the
   skeleton's terminal dependency and the only place old-wave ordering was
   actively wrong.
8. `W05.P23` SUBSET: approval request + approve/reject decisions bound to the
   reviewed tuple, with stale invalidation. Request-changes/edit/respond loops
   and claims DEFER to Increment 5; the V1 queue is `queued` /
   `decision_submitted` / `closed` (`claimed` arrives with claims).
9. `W08.P36` apply job + receipts — single-child only, approval-freshness +
   base-revision re-check, idempotent, receipt recorded.
10. `W08.P38` SUBSET: rollback = whole-document preimage restore + honest
    `rollback_available=false` reasons for everything else (amended rollback ADR).
11. `W04.P18` SUBSET: the projections the skeleton UI needs — proposal list,
    action eligibility, conflict reason, validation status, rollback
    availability. Counts/activity rollups DEFER to Increment 3.
12. `W09.P39` SUBSET as the EXIT GATE: one real vertical-slice test — two actors,
    stale base cannot apply, reject mutates nothing, apply idempotent under
    retry, rollback appends — over real routes + real store + real core adapter.
13. `W09.P40` SUBSET (parallel with 8–11 once DTOs are consumed): a THIN review
    surface in the dashboard — proposal list, diff view (reusing the existing
    reader/diff machinery), approve/reject buttons, polling refresh. The user is
    part of the loop; the skeleton is not done until a human can click deny.

DEMO (gate): live end-to-end run on a real worktree — propose, deny (nothing
changes), propose again, approve, applied document visible in the graph/reader via
the existing watcher path, roll back, preimage restored, full history in the
ledger.

PARALLELIZATION inside Increment 1: track A = steps 1–4 (documents/validation);
track B = step 7 (core adapter) after step 2; track C = steps 5–6 (ledger/actors)
after step 3; steps 8–11 serialize on A+B+C; steps 12–13 close. Three executors
can work concurrently without table overlap.

## Increment 2 — operation modes (the accepted headline capability)

GOAL: the accepted agentic-operation-modes ADR, end to end: `manual` / `assisted`
/ `autonomous` as policy data; system-actor auto-approval traversing the canonical
lifecycle; the after-the-fact review lane; the kill switch.

1. `W05.P21` approval policy matrix — AS PLANNED, plus the mode bundles and the
   per-scope mode selection with narrowing-only session override.
2. System-actor auto-approval path (new step, operation-modes ADR): auto-approve
   eligible non-destructive changesets citing policy id + version; destructive-op
   human floor enforced in policy, not code branches.
3. After-the-fact lane in the review-station projection (amended review-station
   ADR) + its thin frontend lane with one-command rollback.
4. Kill-switch semantics: mode downgrade re-queues not-yet-applying auto-approved
   changesets via the existing policy-change stale trigger.
5. UNIFIED WRITE PATH, first half: the editor save creates a `kind=direct`
   self-approved changeset behind a feature flag, dual-running against the legacy
   `/ops/core` broker; latency + conflict-UX parity measured. (Broker retirement
   is Increment 6, gated on this evidence.)

DEMO: set scope to `autonomous`, have a script propose a body edit, watch it apply
with no human gate, find it in the after-the-fact lane, roll it back; flip the
kill switch mid-flight and watch a pending auto-approval re-queue for manual
review.

## Increment 3 — streams and recovery (activate the shipped outbox)

GOAL: replace polling with the durable lifecycle stream; recovery survives
restart/reconnect. (The W02.P09 outbox primitive already exists; this wires it.)

1. `W07.P33` durable lifecycle event schemas + projector feed — AS PLANNED.
2. `W07.P34` SUBSET: authoring SSE stream, `last_seq` replay, gap events,
   snapshot+next-seq recovery. Token/generation channels DEFER to Increment 4.
3. `W04.P18` remainder: counts, per-document activity projections.
4. Frontend swaps polling → stream cursor (store-owned, mirroring the graph
   stream's hardened reducer patterns).

DEMO: kill and restart the engine mid-review; the review surface recovers state
and resumes the stream with no lost lifecycle events.

## Increment 4 — agent runtime (LangGraph drives the loop)

GOAL: a LangGraph agent runs the whole Increment-1/2 loop through semantic tools.

1. `W06.P25` sessions, prompt turns, recovery snapshots — AS PLANNED.
2. `W07.P30` LangGraph runtime mapping — AS PLANNED.
3. `W07.P31` semantic tool aliases — AS PLANNED.
4. `W05.P22` + `W07.P32` tool-permission requests + interrupt resume by stable id
   — AS PLANNED (the two-tier request model).
5. `W07.P34` remainder: bounded generation/token channels + transcript
   compaction.
6. `W09.P41` LangGraph fixture — MOVED UP as this increment's exit gate.

DEMO: a real LangGraph fixture drafts a proposal, pauses on a tool-permission
interrupt, resumes by interrupt id, requests approval, and (in autonomous mode)
sees its work applied and listed after-the-fact.

## Increment 5 — concurrency, review depth, and security hardening

GOAL: multi-writer safety and the full review/security surface, now against real
usage evidence.

1. `W06.P26` advisory leases + fencing tokens — AS PLANNED.
2. `W06.P27` conflict detection beyond base-hash (overlap, anchor drift, policy
   conflicts) — AS PLANNED.
3. `W06.P28` explicit rebase + supersession commands — AS PLANNED.
4. `W03.P13` remainder: section-scoped operations + selectors + selected
   preimages — IF skeleton evidence shows agents need sub-document edits;
   otherwise this defers out of the campaign with its trigger recorded.
5. `W05.P19` remainder + `W05.P20` delegated scopes, authorization engine, scope
   guards, redaction — AS PLANNED.
6. `W05.P23` remainder + `W05.P24`: request-changes/edit/respond loops, claims
   (`claimed` state activates), audit/provenance queries — AS PLANNED, against
   the amended four-state-queue review-station ADR.
7. `W08.P38` remainder ONLY on evidence: per-operation rollback inverses, enabled
   per kind as need appears.

DEMO: two concurrent writers (one human, one agent) on one document — lease
coordination visible, stale proposal conflicts deterministically, explicit rebase
produces a fresh reviewable candidate, unauthorized actor is refused with a
redacted error.

## Increment 6 — acceptance, retirement, and release

1. `W09.P42` restart/replay/reconnect/security-negative e2e — AS PLANNED.
2. Legacy write-broker retirement (operation-modes ADR transition gate): flip the
   editor save to direct-changesets by default once Increment-2 parity evidence
   holds; retire the dual path as a planned step.
3. `W09.P43` final gate audit + release readiness — AS PLANNED.

## Deferred out of this campaign (explicit triggers, not silent drops)

- `W03.P12` chunk index + bounded chunk API — trigger: a retrieval consumer
  exists (superseding chunk contract lives in the change-format ADR).
- `W06.P29` agent work units + composition projection — trigger: two real agents
  whose work must compose (multiagent-composition ADR returns to accepted then).
- `W08.P37` staged multi-document apply + compensation — trigger: `vaultspec-core`
  ships a batch transaction (gap filed upstream); apply then widens atomically.
- Extended review-queue states (`in_review`, `waiting_on_agent`,
  clarification pair, `reviewer_editing`, `stale`, `escalated`) — trigger:
  multi-reviewer or long-loop clarification workflows in practice.

## Plan-mutation instructions (for the plan-writer)

Apply with `vaultspec-core vault plan` verbs only; this reference is the approved
amendment record. Shape: retitle/renumber the remaining waves to the six
increments above (W03→Increment 1 spine, new increment waves for 2–6); MOVE the
named phases (notably old `W08.P35` into Increment 1); SPLIT the "SUBSET" phases
by adding the deferred remainder as explicit steps in their later increment;
REMOVE the four deferred phases from this plan (they return via a new plan when
their triggers fire — cleaner than permanently-unchecked steps, and the triggers
are recorded here and in the amended ADRs); keep every phase's ground → implement
→ test → review → verify step pattern; add the Increment-2 operation-modes steps
(policy bundles, system-actor approval, after-the-fact lane, kill switch, dual-run
write path) as a new phase grounded on the accepted operation-modes ADR. Every
increment closes with its named DEMO as the verification step. Dependency notes
for the Parallelization section are in each increment above.
