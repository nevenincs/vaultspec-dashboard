---
tags:
  - '#adr'
  - '#rag-control-plane'
date: '2026-06-16'
modified: '2026-06-22'
related:
  - "[[2026-06-16-rag-control-plane-research]]"
  - "[[2026-06-16-graph-semantic-embeddings-adr]]"
  - "[[2026-06-16-graph-viz-quality-research]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
---



# `rag-control-plane` adr: `engine-brokered rag service control plane` | (**status:** `proposed`)

## Problem Statement

A vault is plain files on disk; the semantic linkage that makes it navigable is *compiled* by
the vaultspec-rag service (chunk → embed → Qdrant) and kept current by rag's own watcher. The
dashboard intends to drive that whole service — trigger and watch index builds, configure the
watcher, inspect jobs/state/logs/health, manage projects, and run searches — from the frontend,
and to build second-order semantic features on top of the embeddings. Today the engine exposes
only a coarse, fire-and-forget CLI slice (`server-start/stop/status`, `reindex`,
`watcher-status`); rag's real control surface is a rich, **job-based HTTP API** the frontend
cannot reach. The `rag-control-plane` research established the gap. This ADR decides how the
engine brokers rag's full control surface to the frontend without absorbing rag's semantics —
so the frontend builds against a robust, observable, controllable semantic-build backend.

## Considerations

- rag is the **source of truth for its own runtime state** (jobs, watcher, projects, GPU/model
  readiness). That state lives on the running HTTP service, not in the CLI.
- Indexing is **asynchronous and job-based**: a reindex returns a `job_id`; progress is polled
  from `/jobs`. A control plane that "builds and compiles semantic linkage" must surface that
  job lifecycle, not block on a synchronous call.
- True **process lifecycle** (start/stop/doctor/install) cannot be HTTP — you cannot call a
  service that is not running — so it stays CLI/process.
- The engine is **read-and-infer**: it must broker rag verbatim, adding auth + bounds + the
  `tiers` block, and grow zero rag domain logic. The control plane is rag's; the engine is the
  honest broker (contract §6/§8).
- Downstream semantic builds (the `graph-viz-quality` constellation first, then clustering /
  similarity / semantic-search affordances) need a **freshness signal** to invalidate against
  rag's continuously-updating store, mirroring the engine's structural `generation` counter.

## Constraints

- **Parent features / stability.** Depends on the shipped engine ops proxy (`routes/ops.rs`
  bounded CLI runner), `rag-client` (HTTP transport, discovery, availability), the `tiers`
  envelope helper, and the contract reference §6/§8 — all stable on `main`. The rag service's
  HTTP routes are stable in the sibling checkout but are an EXTERNAL contract: a rag API change
  is a cross-repo coordination event, so the engine must forward verbatim and version-tolerate,
  never hard-code rag's response internals.
- **engine-read-and-infer:** no rag semantics in the engine; validate + bound + forward.
- **subprocess-calls-carry-cap-and-timeout** for the CLI lifecycle path; **bounded HTTP**
  (per-verb wall-clock + body cap, mirroring `vectors.rs`) for the rag-client control path.
- **every-wire-response-carries-the-tiers-block** + **degradation-is-read-from-tiers.**
- **published-wheel-purity:** HTTP/CLI only, never a Python import.
- **dashboard-layer-ownership:** `stores/` is the sole client of the control plane.
- A long reindex runs for minutes; no engine request may hold open across it — the contract is
  **trigger returns a `job_id`; progress is a separate bounded read** (job-id + poll), never a
  blocking call.

## Implementation

Six decisions:

**D1 — Transport split: HTTP for runtime, CLI for process lifecycle.** Management, reads,
reindex-trigger, job polling, and search go over rag's HTTP service through an **extended
`rag-client`** (rag owns its runtime truth, and the HTTP path is job-based and bounded). Only
true process lifecycle — `server start/stop/doctor/install`, `qdrant install` — stays the
existing **bounded CLI subprocess** (you cannot HTTP a dead service). `rag-client` gains a
bounded control module (per-verb wall-clock + body cap, typed `RagError`, availability-aware)
covering: `reindex` (→ job_id), `jobs`, `watcher` get/start/stop/reconfigure, `projects`
list/evict, `service-state`, `logs`, `metrics`, `quality`.

**D2 — One brokered `/ops/rag/*` namespace, transparent + tiers-wrapped.** The engine exposes
the control surface under `/ops/rag/*` (GET for reads, POST for controls), forwarding rag's
envelope verbatim with the `tiers` block attached and args validated/bounded — no rag domain
logic. The CLI-whitelist verbs and the HTTP-brokered verbs share the one namespace and the one
`tiers`-honest broker; the frontend sees a uniform control plane regardless of the underlying
transport.

**D3 — Job lifecycle is trigger-then-poll in v1; engine-mediated SSE deferred.** A reindex
POST returns rag's `{job_id, status:"queued"}` immediately. The frontend polls
`/ops/rag/jobs?job_id=…` (with backoff) for phase/progress/result/resources until terminal.
v1 is poll (it matches rag's snapshot model and holds no connection open). A v2 engine SSE
channel that polls rag and streams job progress (reusing the existing stream infra so an index
build animates live) is deferred behind a measured need — recorded, not built.

**D4 — A semantic freshness token for downstream builds.** The engine surfaces a stable
**semantic-index epoch** (sourced from rag's `/service-state` or newest terminal `/jobs`
entry — exact field chosen in the plan) as a small token the `/graph/embeddings` cache and any
downstream semantic build key on, analogous to the structural `generation`. A second-order
build (constellation, clustering) reads the token to know when to re-fetch/re-derive, and reads
the `tiers`/job phase to degrade honestly while the index is building. This is the contract that
makes "a semantic build on top of the semantic database" non-racy against rag's live updates.

**D5 — Lifecycle is frontend-driven, not engine-supervised.** The engine does NOT auto-start or
supervise rag (that would absorb sibling lifecycle ownership and cross the read-and-infer
fence). The frontend drives start/stop/doctor explicitly; when rag is down, the semantic tier
reads unavailable and the control plane renders the designed "start rag" / held state. (Auto-
start-on-demand is recorded as a future option, gated on an explicit ownership decision.)

**D6 — Frontend control plane in the stores layer.** One `stores/server` rag-control module is
the sole wire client: queries (service-state, jobs, watcher state, projects, index status) +
mutations (typed reindex, watcher start/stop/reconfigure with validated args, project evict) +
a jobs-progress hook + the existing search controls, all gated on the `semantic` tier truth.
The chrome renders it (an expanded ops/index surface); scene/chrome never fetch rag directly.

## Rationale

The transport split (D1) follows from where truth lives: rag's runtime state is on the HTTP
service and indexing is job-based, so reads/controls belong on HTTP via rag-client; process
lifecycle is irreducibly CLI. Brokering under one `/ops/rag/*` namespace with verbatim
forwarding (D2) is exactly the contract's transparent-pass-through model and keeps the engine
read-and-infer — the research confirmed the engine must add no rag semantics. Trigger-then-poll
(D3) honors the "no blocking request across a minutes-long build" constraint and matches rag's
own `/reindex`→`/jobs` shape; SSE is a latency nicety, not a correctness need, so it is
deferred. The freshness token (D4) is the load-bearing new contract: without a rag-side analog
of the structural `generation`, every downstream semantic build races the continuously-updating
store — the research named this the missing piece for second-order builds. Frontend-driven
lifecycle (D5) preserves the engine-read-and-infer fence (the engine brokers verbs; it does not
own rag's process). The stores-layer control plane (D6) is mandated by dashboard-layer-ownership.

## Consequences

- **Gains.** The frontend can drive and *observe* the full semantic-build lifecycle — trigger a
  reindex and watch its job, configure the watcher, read service/GPU/index health, manage
  projects, and search — against a uniform, tiers-honest control plane. Downstream semantic
  builds get a freshness contract and can invalidate correctly. The engine stays a thin honest
  broker; rag stays the owner of its semantics.
- **Honest difficulties.** rag's HTTP API is an external cross-repo contract — version drift is
  a real coordination cost; the engine must forward verbatim and tolerate shape changes rather
  than parse rag internals. The freshness token depends on rag exposing something stable and
  cheap; if it does not, a small rag-side addition (a coordination ask) may be needed. Bounded
  HTTP for a control path that includes a fast `/jobs` poll and a slow `/quality` probe needs
  per-verb budgets, not one global timeout.
- **Pathways opened.** Once jobs/state/freshness are brokered, the engine SSE job-progress
  stream, auto-start-on-demand, and richer second-order semantic features (live clustering,
  similarity edges) become incremental additions on a stable seam.
- **Pitfalls to avoid.** Absorbing rag semantics into the engine (parsing/transforming rag
  envelopes beyond annotation); holding an HTTP request open across a reindex; guessing rag
  availability from a transport error instead of `tiers`; the engine silently auto-starting rag
  and thereby owning its lifecycle.

## Codification candidates

- **Rule slug:** `rag-control-is-brokered-not-absorbed`.
  **Rule:** The engine brokers vaultspec-rag's control surface verbatim under `/ops/rag/*`
  (HTTP for runtime/job/search verbs via rag-client, CLI only for process lifecycle), adding
  auth + per-verb bounds + the `tiers` block and zero rag domain logic; a reindex returns a
  `job_id` and progress is a separate bounded poll, never a blocking request.

(Holds one full execution cycle before promotion. Complements `engine-read-and-infer`,
`subprocess-calls-carry-cap-and-timeout`, `every-wire-response-carries-the-tiers-block`.)
