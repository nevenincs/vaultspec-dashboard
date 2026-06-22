---
tags:
  - '#plan'
  - '#rag-control-plane'
date: '2026-06-16'
modified: '2026-06-22'
tier: L2
related:
  - '[[2026-06-16-rag-control-plane-adr]]'
  - '[[2026-06-16-rag-control-plane-research]]'
---








# `rag-control-plane` plan

### Phase `P01` - rag-client bounded HTTP control module

Extend the rag-client crate with a bounded HTTP control client that reaches rag's management API verb-by-verb, each carrying a per-verb wall-clock budget plus a body cap and returning a typed RagError, mirroring the vectors.rs discipline; engine adds no rag semantics.


Broker rag's full job-based control surface to the frontend through one tiers-honest `/ops/rag/*` namespace, with a semantic freshness epoch so downstream semantic builds invalidate correctly.

- [x] `P01.S01` - Add a bounded rag service-port control transport with a per-verb wall-clock budget and a body cap reaching rag's bearer-gated HTTP routes, mirroring the LoopbackTransport read bound and typed RagError; `engine/crates/rag-client/src/control.rs`.
- [x] `P01.S02` - Implement the reindex trigger control verb returning rag's job_id queued envelope verbatim, never blocking on the build; `engine/crates/rag-client/src/control.rs`.
- [x] `P01.S03` - Implement the jobs read control verb forwarding rag's per-job phase progress result and resource snapshot for a bounded poll; `engine/crates/rag-client/src/control.rs`.
- [x] `P01.S04` - Implement the watcher get and start and stop and reconfigure control verbs taking validated debounce and cooldown and root args; `engine/crates/rag-client/src/control.rs`.
- [x] `P01.S05` - Implement the projects list and projects evict control verbs forwarding rag's slot and eviction envelope; `engine/crates/rag-client/src/control.rs`.
- [x] `P01.S06` - Implement the service-state and logs and metrics and quality read control verbs forwarding rag's observability envelopes verbatim; `engine/crates/rag-client/src/control.rs`.
- [x] `P01.S07` - Unit-test the control transport bounds proving a hung verb times out on its wall-clock budget and an oversized body is a typed error, mirroring the existing rag-client transport tests; `engine/crates/rag-client/src/control.rs`.
- [x] `P01.S08` - Export the control module from the rag-client crate root alongside vectors and search; `engine/crates/rag-client/src/lib.rs`.

### Phase `P02` - engine /ops/rag/* brokering

Expand the engine ops proxy so the new rag-client control module brokers rag's runtime verbs over HTTP under one /ops/rag/* namespace with validated and bounded args and verbatim tiers-wrapped envelope forwarding, while process-lifecycle verbs stay on the existing bounded CLI runner.

- [x] `P02.S09` - Add an HTTP-brokered rag verb registry to the ops route distinct from the CLI whitelist, naming each runtime verb its method and the rag-client control call it dispatches; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `P02.S10` - Broker the GET read verbs service-state jobs watcher projects index-status through the rag-client control module attaching the tiers block via the shared envelope helper; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `P02.S11` - Broker the POST control verbs reindex watcher-start watcher-stop watcher-reconfigure project-evict with validated and bounded args forwarding rag's envelope verbatim; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `P02.S12` - Validate the reconfigure and evict and reindex argument values against rag's vocabulary before forwarding, rejecting unknown or dash-prefixed values as a tiers-carrying 400 mirroring the search target guard; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `P02.S13` - Keep the process-lifecycle verbs server-start server-stop server-doctor server-install on the existing bounded CLI runner since a dead service cannot be reached over HTTP; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `P02.S14` - Register the brokered rag control routes in the API router so the GET reads and POST controls reach the new handlers; `engine/crates/vaultspec-api/src/routes/mod.rs`.
- [x] `P02.S15` - Test arg validation rejects bad values and bound enforcement and tiers attachment on success and error and verbatim passthrough leaving rag's envelope unreshaped; `engine/crates/vaultspec-api/src/routes/ops.rs`.

### Phase `P03` - semantic freshness token

Surface a stable semantic-index epoch through the engine and key the embeddings cache on it so downstream semantic builds invalidate when rag's index changes, the semantic analog of the structural generation counter.

- [x] `P03.S16` - Derive a stable semantic-index epoch in the rag-client control module from the cheapest stable rag field choosing between service-state and the newest terminal jobs entry; `engine/crates/rag-client/src/control.rs`.
- [x] `P03.S17` - Surface the semantic epoch through the engine on the embeddings response alongside the structural generation so the client can key on it; `engine/crates/vaultspec-api/src/routes/query.rs`.
- [x] `P03.S18` - Key the embeddings projection cache on the semantic epoch as well as the graph generation so a reindex invalidates the served vectors; `engine/crates/vaultspec-api/src/routes/query.rs`.
- [x] `P03.S19` - Test that a reindex advances the semantic epoch and the embeddings cache invalidates and re-reads while a stale epoch serves the cached slice; `engine/crates/vaultspec-api/src/routes/query.rs`.

### Phase `P04` - frontend stores control plane

Add one stores-layer rag-control module as the sole wire client carrying queries, typed mutations, and a backoff jobs-progress poll hook all gated on the semantic tier truth, with the mock mirroring the live wire shape.

- [x] `P04.S20` - Add the rag-control client methods on the engine client for the brokered GET reads and POST controls as the sole wire client of the ops rag namespace; `frontend/src/stores/server/ragControl.ts`.
- [x] `P04.S21` - Add the service-state and jobs and watcher-state and projects and index-status queries gated on the semantic tier truth read from the tiers block not a transport error; `frontend/src/stores/server/ragControl.ts`.
- [x] `P04.S22` - Add the typed mutations reindex and watcher start and stop and reconfigure with validated args and project evict dispatched through the platform seam; `frontend/src/stores/server/ragControl.ts`.
- [x] `P04.S23` - Add a jobs-progress poll hook with backoff that polls a triggered job id to terminal and stops on the semantic tier going unavailable; `frontend/src/stores/server/ragControl.ts`.
- [x] `P04.S24` - Mirror the brokered control wire shape in the mock engine so reindex returns a job id and jobs and watcher and projects serve the live envelope shape; `frontend/src/stores/server/engine.ts`.
- [x] `P04.S25` - Test the consumer methods and the jobs poll hook drive the control plane and the semantic-tier gating degrades from the tiers block; `frontend/src/stores/server/ragControl.test.ts`.
- [x] `P04.S26` - Test mock-vs-live fidelity by feeding a captured live brokered sample through the same client code path the app uses and asserting the shape matches; `frontend/src/stores/server/ragControl.test.ts`.

### Phase `P05` - frontend control UI

Build an expanded ops and index control surface in the app layer that renders the control plane from centralized design-system primitives and consumes only stores hooks, never fetching rag directly.

- [x] `P05.S27` - Build the reindex trigger control with live job progress rendering the poll hook state composed from centralized design-system primitives consuming only the stores hooks; `frontend/src/app/right/OpsPanel.tsx`.
- [x] `P05.S28` - Build the watcher configuration control for debounce and cooldown and enable wired to the validated reconfigure mutation; `frontend/src/app/right/OpsPanel.tsx`.
- [x] `P05.S29` - Build the service and GPU and index health readout from the service-state and index-status queries with honest semantic-tier degradation; `frontend/src/app/right/OpsPanel.tsx`.
- [x] `P05.S30` - Build the projects list and evict control rendering rag's slot state and dispatching the evict mutation; `frontend/src/app/right/OpsPanel.tsx`.
- [x] `P05.S31` - Render-test the control surface shows reindex progress and watcher config and health and projects and degrades to the held state when the semantic tier is unavailable; `frontend/src/app/right/OpsPanel.test.tsx`.

### Phase `P06` - live verification and DoD

Drive a real reindex through the brokered control plane against the running rag service and Qdrant, confirm the freshness epoch advances and embeddings re-fetch, and close the definition of done with the full engine and frontend gate green.

- [x] `P06.S32` - Build and run the stack with the engine and the rag service on port 8766 and Qdrant on port 8765 reachable for the live drive; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `P06.S33` - Drive a real reindex through the brokered reindex verb and poll the brokered jobs verb to a terminal job state; `frontend/src/stores/server/ragControl.ts`.
- [x] `P06.S34` - Reconfigure the watcher and read service-state and projects and logs through the brokered control plane confirming verbatim envelopes and the tiers block; `frontend/src/app/right/OpsPanel.tsx`.
- [x] `P06.S35` - Confirm the semantic freshness epoch advances after the reindex and the embeddings cache invalidates and the client re-fetches the vectors; `engine/crates/vaultspec-api/src/routes/query.rs`.
- [x] `P06.S36` - Run the full engine and frontend lint and test gate to exit zero before declaring green per the full-gate discipline; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `P06.S37` - Record the definition-of-done checklist that the frontend can trigger and observe the full rag lifecycle with honest tiers degradation; `frontend/src/app/right/OpsPanel.tsx`.

## Description

This plan brokers the vaultspec-rag service's rich, job-based HTTP control surface to
the dashboard frontend without absorbing rag's semantics, per the `rag-control-plane` ADR
(decisions D1 through D6) and grounded in the `rag-control-plane` research gap map. Today
the engine exposes only a coarse five-verb CLI whitelist (`server-start`, `server-stop`,
`server-status`, `reindex`, `watcher-status`) in `ops.rs`, while rag's real management API
is HTTP and job-based: a reindex returns a `job_id` and progress is polled from `/jobs`.
The work follows the ADR's transport split: runtime, reads, the reindex trigger, job
polling, and search go over rag's HTTP service through an extended `rag-client`; only true
process lifecycle (start, stop, doctor, install) stays the existing bounded CLI subprocess
runner, because a dead service cannot be reached over HTTP.

`P01` adds a bounded HTTP control module to `rag-client` reaching rag's service port,
mirroring the per-verb wall-clock budget plus body cap plus typed `RagError` discipline of
`vectors.rs`. `P02` brokers those verbs through the engine under one `/ops/rag/*` namespace,
validating and bounding args and forwarding rag's envelope verbatim with the `tiers` block
attached, adding zero rag domain logic (`engine-read-and-infer`). `P03` surfaces the
semantic freshness epoch (ADR D4), the rag-side analog of the structural `generation`
counter, and keys the embeddings cache on it so downstream semantic builds invalidate when
rag re-indexes. `P04` adds the stores-layer rag-control module as the sole wire client
(`dashboard-layer-ownership`), gated on the `semantic` tier truth read from the `tiers`
block rather than a transport error, with the mock mirroring the live wire shape. `P05`
renders the control surface in the app chrome from centralized design-system primitives,
consuming only stores hooks. `P06` drives the whole loop against the live rag service and
Qdrant and closes the definition of done with the full engine and frontend gate green.

## Steps







## Parallelization

The three engine phases form a serial chain: `P01` defines the bounded control transport
and verbs, `P02` brokers them through the engine and so depends on `P01`, and `P03` derives
the freshness epoch from a control verb `P01` provides and wires it into the embeddings
route `P02` does not touch, so `P03` depends on `P01` and is best landed after `P02` so the
brokered wire shape is settled. Within `P01` the per-verb steps `P01.S02` through `P01.S06`
share the transport scaffold of `P01.S01` and can be authored in parallel once that lands;
`P01.S07` and `P01.S08` follow. Within `P02` the GET-read, POST-control, and validation
steps share the verb registry of `P02.S09` and can proceed in parallel after it.

The frontend phases depend on the engine wire but not on its internals: `P04` depends on
`P02` for the brokered `/ops/rag/*` wire shape, and once that shape is fixed `P04` and `P05`
can be built and tested against the mock in parallel with the remaining engine work, because
the mock mirrors the live wire shape (`mock-mirrors-live-wire-shape`). `P05` depends on `P04`
for the stores hooks it consumes. `P06` is strictly last: it requires every prior phase
landed and drives the assembled stack against the live rag service and Qdrant.

## Verification

`P01` is verified by the rag-client unit tests proving each control verb's transport carries
both a per-verb wall-clock budget and a body cap: a hung verb returns a typed `TimedOut`
error and an oversized body returns a typed error, exactly as the existing `vectors.rs` and
`client.rs` bound tests assert, never an unbounded read. The module compiles as a crate-root
export with no rag domain logic introduced.

`P02` is verified by engine route tests that prove arg validation rejects unknown and
dash-prefixed values with a tiers-carrying 400 before any reach, that every brokered response
(success and error) carries the `tiers` block through the shared envelope helper
(`every-wire-response-carries-the-tiers-block`), and that rag's envelope passes through
verbatim and unreshaped (`engine-read-and-infer`). The process-lifecycle verbs remain on the
bounded CLI runner, confirmed by their continued routing through the existing whitelist.

`P03` is verified by an engine test that a reindex advances the semantic epoch and the
embeddings cache invalidates and re-reads, while an unchanged epoch serves the cached slice
without re-scrolling Qdrant, the semantic analog of the structural generation invariant.

`P04` is verified by consumer tests driving the queries, mutations, and the backoff jobs-poll
hook to terminal, by a gating test proving the control plane reads degraded state from the
`tiers` block and not from a transport error (`degradation-is-read-from-tiers`), and by a
mock-vs-live fidelity test that feeds a captured live brokered sample through the same client
code path the app uses (`mock-mirrors-live-wire-shape`). `P05` is verified by render tests
that the control surface shows reindex progress, watcher config, health, and projects, and
degrades to the designed held state when the semantic tier is unavailable, composed entirely
from centralized design-system primitives with no direct rag fetch (`dashboard-layer-ownership`,
`design-system-is-centralized`).

`P06` is the live definition of done: a real reindex driven through `/ops/rag/reindex` polls
`/ops/rag/jobs` to a terminal job, the watcher is reconfigured, service-state and projects and
logs read back through the brokered plane, the freshness epoch advances and the embeddings
re-fetch, and the full engine and frontend lint and test gate (`just dev lint frontend` and the
engine suite) exits zero before green is declared (`declaring-green-runs-the-full-gate`). The
plan is complete when every Step is closed (`- [x]`) and the DoD checklist confirms the frontend
can trigger and observe the full rag lifecycle with honest tiers degradation, never depending on
a rag or torch Python import (`published-wheel-purity`).
