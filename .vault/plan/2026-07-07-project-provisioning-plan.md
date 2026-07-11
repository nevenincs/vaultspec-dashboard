---
tags:
  - '#plan'
  - '#project-provisioning'
date: '2026-07-07'
modified: '2026-07-10'
tier: L2
related:
  - '[[2026-07-07-project-provisioning-adr]]'
  - '[[2026-07-07-project-provisioning-research]]'
---


# `project-provisioning` plan

### Phase `P01` - provisioning probes and served status projection

Deliver the fresh-probe seam and the backend-served GET /provision/status projection the frontend reads to decide managed / installable / migratable / enrollable.

- [x] `P01.S01` - Extract an uncached core-version probe and expose core_version_fresh() beside the memoized core_version(); `engine/crates/ingest-core/src/runner.rs`.
- [x] `P01.S02` - Replace the OnceLock core probe with a refreshable cell and add refresh_core_probe(), adapting probe_core() callers; `engine/crates/vaultspec-api/src/handshake.rs`.
- [x] `P01.S03` - Add a bounded uv presence and version probe (uv --version) to the new provisioning module; `engine/crates/vaultspec-api/src/routes/provision.rs`.
- [x] `P01.S04` - Assemble the provisioning status projection: git-ness, uv, tool versions vs floors, .vaultspec present, provider set, vault present; `engine/crates/vaultspec-api/src/routes/provision.rs`.
- [x] `P01.S05` - Broker vaultspec-core migrations status --json into the projection as pending-migrations state; `engine/crates/vaultspec-api/src/routes/provision.rs`.
- [x] `P01.S06` - Fold the existing rag control-plane /projects enrollment read into the projection; `engine/crates/vaultspec-api/src/routes/provision.rs`.
- [x] `P01.S07` - Add GET /provision/status returning the projection over the tiers envelope, target resolved via resolve_map_workspace_root; `engine/crates/vaultspec-api/src/routes/provision.rs`.

### Phase `P02` - job registry and typed capability broker

Deliver the bounded job registry and the typed, non-wire-addressable capability broker that forwards vaultspec-core install / migrations run and uv tool install as tracked jobs.

- [x] `P02.S08` - Define the typed provisioning capability enum with no Deserialize and no FromStr so no wire string selects a verb; `engine/crates/vaultspec-api/src/routes/provision.rs`.
- [x] `P02.S09` - Add argv builders mapping each capability to fixed vaultspec-core install / migrations run and uv tool install args; `engine/crates/vaultspec-api/src/routes/provision.rs`.
- [x] `P02.S10` - Add the bounded job registry: capped size, TTL prune, single-flight per target and machine-wide for uv acquisitions; `engine/crates/vaultspec-api/src/routes/provision.rs`.
- [x] `P02.S11` - Add the job runner: spawn with output cap and generous-but-bounded wall-clock, capture output, process-group kill on breach; `engine/crates/vaultspec-api/src/routes/provision.rs`.
- [x] `P02.S12` - Add the typed confirm-token gate refusing a force or overwrite verb without an explicit confirmation before any spawn; `engine/crates/vaultspec-api/src/routes/provision.rs`.

### Phase `P03` - routes, reconciliation, and router registration

Wire the /provision/* route family, register it in the router and CONTRACT_ROUTES guard, and reconcile handshake probes and the target scope cell after a successful provision.

- [x] `P03.S13` - Add POST /provision/run starting a capability job and returning its job id; `engine/crates/vaultspec-api/src/routes/provision.rs`.
- [x] `P03.S14` - Add GET /provision/jobs/{id} polling a job's status and captured outcome; `engine/crates/vaultspec-api/src/routes/provision.rs`.
- [x] `P03.S15` - Register the /provision/* family in build_router and add every path to CONTRACT_ROUTES; `engine/crates/vaultspec-api/src/lib.rs`.
- [x] `P03.S16` - Add post-provision reconciliation: refresh the handshake core probe and rebuild the target scope cell so a newly-provisioned root becomes servable; `engine/crates/vaultspec-api/src/routes/provision.rs`.
- [x] `P03.S17` - Declare the provision module in the routes mod tree; `engine/crates/vaultspec-api/src/routes/mod.rs`.

### Phase `P04` - frontend contract surface

Deliver the stores wire client, provisioning ActionDescriptors, and the honest not-a-vaultspec-managed-project empty-state panel that renders outcomes from the served vaultspec.sync.v1 vocabulary.

- [x] `P04.S18` - Add the /provision/* stores wire client reading status and dispatching run and job-poll through the sole wire seam; `frontend/src/stores/server/provisionControl.ts`.
- [x] `P04.S19` - Register provisioning verbs as ActionDescriptors on the unified action plane; `frontend/src/platform/actions/action.ts`.
- [x] `P04.S20` - Render the not-a-vaultspec-managed-project empty-state panel with the provision affordance and vaultspec.sync.v1 outcome rendering; `frontend/src/app`.

### Phase `P05` - verification: tests programmatic and by-hand

Prove the pipeline with unit tests, live-wire tests over the fixture vault, and a by-hand end-to-end provision of a genuinely empty project, then the full lint gate.

- [x] `P05.S21` - Add unit tests: capability disjointness, argv builders, confirm-gate refusal, job-registry bounds and single-flight; `engine/crates/vaultspec-api/src/routes/provision.rs`.
- [x] `P05.S22` - Add live-wire tests: /provision/status shapes on managed and empty targets, run then poll, and the contract-route guard; `engine/crates/vaultspec-api/src/lib.rs`.
- [x] `P05.S23` - Verify by hand: provision the framework into a genuinely empty git repo end-to-end and confirm the scope becomes servable; `engine/crates/vaultspec-api/src/routes/provision.rs`.
- [x] `P05.S24` - Run the full lint gate for the touched languages and confirm exit zero; `engine`.

## Description

Closes the empty-project dead-end decided in the project-provisioning ADR: selecting or
registering an active project can land the operator in a genuinely empty,
non-vaultspec-managed repository the dashboard detects honestly (`has_vault`,
`validate_scope` 400, the startup remediation prose) but cannot act on. This plan builds a
dedicated fenced provisioning plane in `vaultspec-api` that serves the managed / installable
/ migratable / enrollable state as backend truth and brokers the owning installer to fix it
- `vaultspec-core install` (+ `--upgrade` / `--force`), `vaultspec-core migrations run`, and
the new machine-level `uv tool install` acquisition class - as tracked, bounded jobs.

The work follows the accepted ADR (D1-D7): a `/provision/*` route family sibling to
`/ops/*`, not whitelist growth; a served projection, never client-derived; every mutation
forwarding to the owning sibling with the engine writing nothing; job-shaped execution with
an output cap AND a generous-but-bounded wall-clock (uv+torch is multi-minute); operator-
invoked only with a typed confirm gate on force, targets resolved ONLY through the workspace
registry via `resolve_map_workspace_root`; and a post-provision reconciliation seam that
refreshes the memoized `OnceLock` handshake probe and rebuilds the target scope cell so a
newly-provisioned root becomes servable in-session. It reuses the `core_adapter` mutating-
verb discipline, the `run_sibling_bounded` runner shape, the `LifecycleRun` capture pattern,
the `envelope` / `query_tiers` helpers, and the `rag_invocation` / `CoreRunner::detect`
resolution rather than re-declaring any of them. It AMENDS IN PART the dashboard-packaging
detect-and-instruct row (instruction becomes actionable) while the startup warn-and-serve-
degraded posture STANDS.

## Parallelization

Phases are sequenced by dependency. P01 (probes + served status) is the foundation every
later phase reads and must land first. P02 (job registry + typed broker) depends on the
capability-argv and probe seams from P01. P03 (routes + reconciliation + router
registration) depends on P02's runner and P01's projection. P04 (frontend contract) depends
on the P01/P03 wire shapes being stable and can proceed in parallel with P05 once the routes
exist. P05 (verification) unit-tests land incrementally alongside each phase; the live-wire
and by-hand steps run after P03, and the full lint gate is the terminal gate. Within P01 and
P02, steps are contiguous refinements of one module and are authored in order.

## Verification

- `GET /provision/status` returns the full served projection (git / uv / core+rag versions
  vs floors / `.vaultspec` present / provider set / vault present / pending migrations / rag
  enrollment) over a truthful `tiers` envelope, for both a managed target and a genuinely
  empty one, with the target resolved through the registry.
- A `POST /provision/run` install/upgrade/acquire job runs single-flight, bounded by output
  cap AND wall-clock, is pollable via `GET /provision/jobs/{id}`, and a force verb without a
  confirm token is refused before any spawn.
- After a successful install the handshake core probe reflects the new version and the
  formerly-empty target scope becomes servable without a process restart (reconciliation).
- Every `/provision/*` path appears in `CONTRACT_ROUTES` (the source-introspected router
  guard passes) and is bearer-gated.
- Unit tests prove capability disjointness (no wire string selects a verb), argv builders,
  confirm-gate refusal, and job-registry bounds + single-flight; live-wire tests exercise the
  real `vaultspec serve` origin over the fixture vault; a by-hand end-to-end provision of an
  empty git repo is observed to make its scope servable.
- `just dev lint all` exits 0 (eslint + prettier + tsc + `cargo fmt --check` + clippy).
