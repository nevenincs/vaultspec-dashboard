---
tags:
  - '#adr'
  - '#a2a-orchestration-edge'
date: '2026-07-14'
modified: '2026-07-17'
related:
  - "[[2026-07-14-a2a-orchestration-edge-research]]"
  - '[[2026-06-29-agentic-authoring-boundary-adr]]'
  - '[[2026-06-29-agentic-langgraph-integration-adr]]'
  - '[[2026-06-29-agentic-authoring-state-store-adr]]'
  - '[[2026-06-29-agentic-security-provenance-adr]]'
  - '[[2026-06-29-agentic-streaming-events-outbox-adr]]'
  - '[[2026-06-29-agentic-multiagent-composition-adr]]'
  - '[[2026-07-02-agentic-operation-modes-adr]]'
  - '[[2026-07-11-agentic-spec-authoring-backend-adr]]'
  - '[[2026-06-26-rag-service-management-adr]]'
  - '[[2026-06-14-dashboard-rag-manager-adr]]'
  - '[[2026-06-12-vaultspec-engine-adr]]'
---

# `a2a-orchestration-edge` adr: `the stable cross-repo surface between the dashboard engine and the revived A2A orchestrator` | (**status:** `accepted`)

## Problem Statement

The dashboard ships the complete agent-facing document-authoring plane
(`/authoring/v1/*`: propose → submit → approve → apply, actor-token identity,
self-approval ban, served agent-tool catalog, durable replayable events) and a
finished multi-lane review frontend — but nothing that RUNS the
Research → ADR → Plan → Exec → Audit pipeline as an agentic workflow. The
sibling `vaultspec-a2a` repository is a substantial, currently-dependent
LangGraph orchestration backend whose team presets already encode those
pipeline roles, but whose agents write `.vault/` documents directly through
CLI file tools — the exact behavior the engine denies as `forbidden_actor`.
This ADR freezes the dashboard-side surface A2A builds against and the
mandates the A2A revival must satisfy. The dashboard drives requirements; A2A
conforms. The grounding research found the accepted agentic ADR cluster
pre-decided the architecture (agent adapter, LangGraph-is-execution-state,
state ownership, provenance); this record codifies the cross-repo edge and
decides the eight questions the cluster left open.

## Considerations

- The engine's document plane already exists and is test-enforced; the
  research route inventory confirms sessions/turns, proposal lifecycle,
  review/apply, run resume/cancel, interrupts, the agent-tool plane
  (catalog/prepare/execute/permission-decision), actor tokens, leases, and
  durable events. No new engine work is needed there.
- The frontend stores layer is the sole wire client and talks only to the
  engine; sibling operations transit only as transparent, whitelisted,
  namespaced pass-throughs (engine ADR D7.5). The rag sibling contract
  (manager + service-management ADRs) supplies the full control-plane
  template: fixed verb whitelist, boundary-validated bounded args, sibling
  envelope verbatim inside the tiers envelope, 502-with-tier-block when down,
  attach-never-own lifecycle over a machine-global discovery predicate.
- A2A's reusable core (graph compiler with star/pipeline/pipeline-loop
  topologies, role→phase presets, persistent task queue, ACP provider stack,
  thread/context packages, checkpointed durable state) is real and current
  (langgraph 1.1.6, langchain-core 1.2.28); its React UI and Google-A2A
  protocol stub are dead weight now that this dashboard is the frontend.
- Section-scoped proposal operations stay deferred (2026-07-11 deferral ADR);
  the edge may assume whole-document operation shapes only.
- The multiagent-composition ADR is `proposed`, demoted pending "two real
  agents whose work must compose" — which A2A team mode produces.

## Considered options

- **Revive A2A as a conforming sibling service behind an engine pass-through
  (CHOSEN).** Reuses ~53k lines of maintained orchestration; all conformance
  work lands on the Python side plus one bounded Rust proxy; matches the
  boundary ADR's anticipated sibling shape.
- **Rebuild orchestration inside the dashboard engine.** Rejected: LangGraph
  is a Python runtime; the engine is read-and-infer plus the fenced authoring
  domain; re-creating the orchestrator violates the sibling shape and wastes
  a tested core.
- **Fresh thin Python orchestrator cherry-picking A2A code.** Held as
  fallback only if A2A's operational surface proves too heavy; discards
  maintained tests and presets, so not preferred while the core lifts
  cleanly.
- **Let the dashboard frontend call A2A's gateway directly.** Rejected
  outright: breaks the sole-wire-client boundary and the single-origin
  contract; A2A would need its own auth/tiers/degradation story the engine
  already owns.

## Constraints

- Parent surfaces are stable: the authoring plane is shipped, reviewed, and
  guard-tested; the rag pass-through/lifecycle pattern is shipped in two
  generations (manager, service-management). Frontier risk sits in A2A's
  dependencies (LangGraph 1.x, ACP), which the streaming-outbox ADR already
  fences via versioned event schemas and adapter normalization.
- The engine never mutates `.vault/` or git (read-and-infer); A2A never
  reaches the vault by any path other than the authoring API. `vaultspec-core`
  stays hidden behind the engine's internal materialization adapter.
- Every engine→A2A call carries an output cap and wall-clock timeout;
  degradation is read from tiers, never inferred from transport errors.
- Actor identity resolves only from the server-held principal seam; tokens
  are minted by the engine and never by A2A.

## Implementation

**D1 — Control plane: one namespaced pass-through, `/ops/a2a/{verb}`.** The
engine forwards a fixed whitelist to the A2A gateway and nothing else:
`run-start` (preset id + prompt/message + target feature tag), `run-status`,
`run-cancel`, `presets-list`, `service-state` (health/doctor rollup). Args are
validated at the engine boundary (bounded enums, capped strings); responses
return the A2A envelope verbatim inside the shared tiers envelope;
sibling-down is a 502-with-tier-block. No mutating vault semantics ride this
namespace — it is orchestration control only.

> **Amendment (2026-07-17, shipped-surface ruling, review-adjudicated):** three
> interpretations recorded at implementation, each PASS-reviewed:
> (1) **Sibling-down semantics.** This decision's raw "502-with-tier-block"
> wording is read through its own reuse-the-rag-patterns rationale: the shipped
> rag ops template returns **200 with a degraded tier** for a KNOWN-DOWN
> sibling and reserves 502/504 for subprocess/proxy crash or timeout. The
> `/ops/a2a/*` namespace ships with those template semantics; degradation is
> read from tiers, never inferred from transport (wire-contract rule).
> (2) **D3 transport shape.** The relayed progress channel ships as a
> DEDICATED per-run SSE endpoint `GET /ops/a2a/runs/{run_id}/stream` rather
> than a channel on the multiplexed scope `/stream` the `backends` precedent
> literally names: run streams are per-run and upstream-sourced, and
> multiplexing them onto the scope stream would broadcast every concurrent
> run's frames to every scope subscriber. The endpoint reuses the shared
> seq/since/gap replay mechanics, so the "identical channel semantics"
> requirement holds; only the mount point differs.
> (3) **Degradation tier.** a2a outages degrade a dedicated `agent` tier
> (never `semantic` — an a2a outage must not misreport search), served
> only-when-degraded today exactly like the shipped `structural` precedent.
> Seeding `agent` as an always-present canonical tier in the engine-query
> envelope is a FUTURE reviewed wire-contract event, deliberately not bundled
> into this shipping. Shipped surface: `routes/ops/a2a.rs` +
> `routes/ops/a2a_stream.rs` at `fd7069cb01` (bounds: 64-relay registry cap,
> 90s idle read, 512KiB frame cap, 6h stream lifetime; token values verified
> absent from all logging). The full shipped edge surface additionally
> comprises the feedback-batch create/read routes plus the `feedback_batch_id`
> turn field (`d5bfbac932`, structurally-forgery-proof: the request type
> carries no token fields a client could supply) and the adopted
> run-completion slice `POST /authoring/v1/runs/{run_id}/complete`
> (`19d845c499`, extended `1653b4b85d`) — matching the cross-session
> reconciliation audit's P05 amendment spec
> ([[2026-07-17-a2a-orchestration-edge-audit]]).

**D2 — Actors and tokens are provisioned by the engine at run start.** The
brokered `run-start` verb is the provisioning moment: the engine registers (or
re-resolves) one agent actor per pipeline role in the run (researcher,
analyst, planner, executor, reviewer — plus the supervisor as a distinct
actor), issues per-actor tokens via the actor-token surface, and passes them
to A2A inside the forwarded start payload. A2A holds tokens only for the life
of the run and never mints, renames, or shares them across roles. Provenance
is thereby rooted before the first agent turn, and the self-approval ban
(keyed on changeset origin) binds per-role.

**D3 — Progress streaming splits by authority.** Durable document-lifecycle
truth (proposal created/submitted, approval opened/decided, apply results,
conflicts) is already emitted on the authoring events surface with sequence
replay — the frontend consumes it exactly as it does today, with no A2A
awareness. Orchestration progress (node transitions, agent turns, token
streams) stays A2A-side and reaches the frontend as a relayed engine SSE
channel (the `backends` channel precedent) carrying bounded, versioned,
non-authoritative frames; a client recovering truth re-reads `run-status` and
the durable events, never the relay. If the relay proves noisy, degrading to
bounded polling of `run-status` is contract-conformant.

**D4 — Reads stay split: filesystem for corpus context, authoring API for
in-flight state.** A2A's read-only, token-budgeted `.vault/` mount layer is
retained for corpus context (compatible with engine read-and-infer; reads are
not writes). Anything about in-flight work — proposal snapshots, changeset
status, conflicts, review state — is read from the authoring API, never
reconstructed from the filesystem, which cannot see unapplied proposals.

**D5 — State-ownership fence.** A2A owns orchestration state only: threads,
runs, checkpoints, task-queue entries, its own database. The engine owns all
document state: changesets, proposals, approvals, preimages, receipts, audit.
A2A stores Vaultspec ids (proposal, changeset, approval) as references;
Vaultspec stores LangGraph ids (thread, run, checkpoint) as provenance.
Neither system duplicates the other's record; A2A must not grow a second
document ledger, and the engine must not persist runnable graph state.

**D6 — Documents come into existence only through the ledgered create path.**
A2A worker tools expose no filesystem write into any `.vault/`. New pipeline
documents (research, ADR, plan, exec, audit) are proposed as whole-document
creations through the authoring API, which scaffolds/validates via the
engine's internal core adapter — frontmatter, filenames, and templates are
never agent-authored. Whole-document operation shapes only, honoring the
standing section-operations deferral.

**D7 — A2A repo mandates (the dev-team brief derives from this decision).**
(a) Delete the React/Vite UI and every frontend ambition — the dashboard is
the product surface; A2A is headless, driven by its CLI and the engine
pass-through. (b) Replace agent file-write tools with authoring-API clients
per D2/D6. (c) Adopt the machine-global discovery contract (service file +
heartbeat + ungated health with live pid) so the engine's attach-never-own
lifecycle predicate applies verbatim. (d) The Google-A2A protocol stub is
removed; "a2a" survives as a project name only, with ACP + REST/SSE as the
declared transports. (e) The reusable core to preserve: graph compiler,
presets, task queue, providers, thread/context packages; the gateway/worker
split may be simplified but is not required to be. (f) Keep the engine
completely absent from A2A's dependency graph — the edge is HTTP only.

**D8 — Composition re-arm is a follow-on gate, not a prerequisite.** The
first two-agent A2A run whose proposals must compose is the named return
trigger of the proposed multiagent-composition ADR; when it fires, that
record returns to review for acceptance on real evidence. Nothing in this
edge builds against the composition projection while it remains proposed;
until then concurrent proposals ride the accepted concurrency/leases/conflict
semantics unchanged.

## Rationale

The grounding research shows both halves already exist: the engine's authoring
plane is the agent adapter the boundary ADR called for, and A2A is the
LangGraph runtime the cluster assumed would connect to it. The cheapest
correct system is therefore a contract, not a build: freeze the edge at HTTP,
reuse the rag sibling patterns for everything operational, and spend the new
effort where the research located the only real conformance gap — A2A's write
seam. Engine-side token provisioning at run start (D2) was chosen over
A2A-side registration because it keeps identity authority, audit rooting, and
the self-approval ban entirely inside the engine's principal seam. The
streaming split (D3) repeats the streaming-outbox ADR's durable-vs-ephemeral
division across the repo boundary rather than inventing a new channel class.

## Consequences

- The Research → ADR → Plan pipeline becomes runnable by agent teams with
  every document landing as a reviewable, ledgered proposal in the existing
  review lanes — no new review UI, no new document semantics.
- New engine surface is small and bounded: one pass-through namespace, one
  relayed SSE channel, run-start actor provisioning. Each is an established
  pattern with in-repo precedent.
- A2A's revival cost is concentrated and explicit: write-seam swap, discovery
  contract, UI deletion. Its team presets, topologies, and queue survive
  unchanged.
- Cross-repo debugging requires correlating Vaultspec ids with LangGraph ids;
  D5's mutual reference rule is what keeps that tractable and must be tested
  on both sides.
- Two repos now hold halves of one contract; the edge (verb whitelist, start
  payload, discovery predicate) must be documented once and mutually
  referenced, and any change to it is a reviewed contract event — never a
  refactor.
- Risk: the run-start payload carrying actor tokens makes that one verb
  security-sensitive; it must never be logged verbatim and its transport
  stays loopback HTTP under the engine's bearer, matching how the engine
  already handles actor tokens.

## Codification candidates

- **Rule slug:** `a2a-edge-is-http-only-and-engine-fronted`.
  **Rule:** The dashboard frontend reaches A2A only through the engine's
  whitelisted `/ops/a2a/*` pass-through, and A2A reaches the vault only
  through the engine's authoring API; neither repo imports the other, and
  every document mutation an A2A agent produces is a ledgered proposal under
  an engine-issued per-role actor token.
- **Rule slug:** `orchestration-state-and-document-state-never-merge`.
  **Rule:** A2A persists orchestration state (threads, runs, checkpoints,
  queue) and stores Vaultspec ids as references; the engine persists document
  state (changesets, approvals, preimages, audit) and stores LangGraph ids as
  provenance; neither system duplicates the other's record.
