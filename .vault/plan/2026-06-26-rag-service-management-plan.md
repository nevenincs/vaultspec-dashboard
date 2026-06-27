---
tags:
  - '#plan'
  - '#rag-service-management'
date: '2026-06-26'
modified: '2026-06-26'
tier: L3
related:
  - '[[2026-06-26-rag-service-management-adr]]'
  - '[[2026-06-26-rag-service-management-research]]'
---
# `rag-service-management` plan

Align the dashboard to rag's single-machine multi-tenant service model and build a machine-level rag operations console (UI plus a paired Rust backend) covering lifecycle, data management, and diagnostics.

## Description

This plan executes the `rag-service-management` ADR. vaultspec-rag is now one resident service per machine (authority: the OS machine lock) serving every project as a tenant; the dashboard must manage whatever service is running regardless of who started it and start its own only when one is genuinely absent. The research grounded six drifts and a three-tier contract model (rag codified HTTP; Qdrant native REST capability-gated; genuine gaps coordinated with rag) against rag `0.2.25` and the dashboard's current engine/stores code. The worktree baseline was upgraded first (`vaultspec-core 0.1.34`, `vaultspec-rag 0.2.25`). W01 makes lifecycle correct; W02 serves a performant Rust rag-ops state backend; W03 designs the console in the binding Figma file; W04 builds the console UI; W05 gates the embedding contract, files coordination asks, and codifies the durable rules. The work preserves `engine-read-and-infer`, `dashboard-layer-ownership`, `degradation-is-read-from-tiers-not-guessed-from-errors`, and `figma-is-the-binding-source-of-truth`.

## Steps

## Wave `W01` - lifecycle correctness

Make the dashboard a correct co-equal manager of the one machine rag: a single machine-global running predicate (discover + heartbeat + /health), a gated start that re-discovers and attaches instead of erroring, a committed machine-global discovery invariant, and bounded validated start-arg pass-through. Backs every later wave; grounded by the rag-service-management ADR and research. Engine + stores only, no UI design needed.

### Phase `W01.P01` - machine-global running predicate

Derive Running/Crashed/Absent machine-globally from discovery + heartbeat + an ungated GET /health liveness confirm, surfaced distinctly on the wire.

- [x] `W01.P01.S01` - Add an ungated GET /health liveness confirm and a Running/Crashed/Absent discovery state with reason to rag-client discovery; `engine/crates/rag-client/src/client.rs`.
- [x] `W01.P01.S02` - Distinguish crashed from absent on the wire status and per-tier degradation block; `engine/crates/vaultspec-api/src/routes/stream.rs`.
- [x] `W01.P01.S03` - Surface running, crashed, and absent rag state through the stores adapters; `frontend/src/stores/server/liveAdapters.ts`.

### Phase `W01.P02` - gate start, re-discover and attach

Stop mapping already-running to 502; gate server start on the predicate returning genuinely-absent, and attach on an exit-1/exit-0 already-running race.

- [x] `W01.P02.S04` - Stop mapping an already-running server start to 502 in the lifecycle runner and attach on exit-1 or exit-0; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `W01.P02.S05` - Gate server-start on the predicate returning genuinely-absent and map machine-owned to attach-and-succeed; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `W01.P02.S06` - Make the stores start action conditional and carry attach semantics; `frontend/src/stores/server/opsActions.ts`.

### Phase `W01.P03` - arg pass-through and discovery invariant

Forward a bounded validated set of server start flags with a needs-install chain, and enforce machine-global discovery precedence with no STATUS_DIR override.

- [x] `W01.P03.S07` - Extend the rag verb whitelist to forward bounded validated server-start flags and chain needs-install to qdrant install; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `W01.P03.S08` - Enforce machine-global discovery precedence with no STATUS_DIR override and add a guard test; `engine/crates/rag-client/src/client.rs`.

## Wave `W02` - rust diagnostics and size-state backend

Serve a performant, bounded, memoized rag-ops state surface from the engine by aggregating rag's codified Tier-1 HTTP plus capability-gated Tier-2 Qdrant-native reads, consumed by the stores layer. Depends on W01's predicate and discovery; feeds the W04 console UI.

### Phase `W02.P04` - tier-1 http aggregation projection

Aggregate rag's codified HTTP (service-state, storage survey, jobs, projects, metrics, readiness) into one bounded memoized rag-ops state projection in the engine.

- [x] `W02.P04.S09` - Add a bounded memoized rag-ops aggregation projection over the Tier-1 rag HTTP surface; `engine/crates/rag-client/src/control.rs`.
- [x] `W02.P04.S10` - Serve the rag-ops state through a new engine route via the shared envelope and tiers block; `engine/crates/vaultspec-api/src/routes/ops.rs`.

### Phase `W02.P05` - tier-2 qdrant-native health reads

Read optimizer/segment/indexed-vs-total health from Qdrant's own documented REST API, capability-gated on the Qdrant version, using collection names from storage survey.

- [x] `W02.P05.S11` - Add capability-and-version-gated Qdrant collection-info reads using names from storage survey, degrading honestly; `engine/crates/rag-client/src/vectors.rs`.

### Phase `W02.P06` - stores consumers for rag-ops state

Expose the rag-ops state to the app layer through bounded stores query hooks and types, degrading honestly from the tiers block.

- [x] `W02.P06.S12` - Add bounded stores query hooks and types for the rag-ops state surface; `frontend/src/stores/server/ragControl.ts`.

## Wave `W03` - operations console design

Design the machine-level rag operations console in the binding Figma file, composed from the centralized kit, distinct from per-scope index/watcher/search. Surfaced for owner frame review before W04 builds against it. Depends on the W02 backend shape.

### Phase `W03.P07` - design the operations console

Design the machine-level rag operations console frames in the binding Figma file and surface them for owner review.

- [x] `W03.P07.S13` - Design the machine-level rag operations console frames in the binding Figma file and surface them for owner review; `frontend/figma/component-map.json`.

## Wave `W04` - operations console build

Build the rag operations console UI on the W02 backend and W03 design: machine-scoped lifecycle (stop-is-global copy), per-tenant data management, and diagnostics, with every verb authored on the unified action plane. Depends on W02 and W03.

### Phase `W04.P08` - machine lifecycle control

Author machine-level lifecycle verbs as ActionDescriptors and render the host-level control with copy stating stop is machine-wide.

- [x] `W04.P08.S14` - Author machine-level lifecycle ActionDescriptors and render the host-level control with stop-is-machine-wide copy; `frontend/src/app/right/RagOpsConsole.tsx`.

### Phase `W04.P09` - data management and diagnostics

Render the per-tenant data-management and diagnostics sections on the rag-ops backend and mount the console into the app chrome.

- [x] `W04.P09.S15` - Render the per-tenant data-management section as ActionDescriptors driving reindex, clean rebuild, evict, and watcher; `frontend/src/app/right/RagOpsConsole.tsx`.
- [x] `W04.P09.S16` - Render the diagnostics section for size, jobs, storage survey, orphans, and quality, and mount the console into the chrome; `frontend/src/app/right/RagOpsConsole.tsx`.

## Wave `W05` - embedding gating, coordination, codify

Capability-gate the embeddings direct-Qdrant scroll, file the rag coordination asks, and codify the durable rules plus the mutually-referenced discovery/running invariant. Closes the campaign; depends on W01-W04.

### Phase `W05.P10` - embedding-contract gating

Gate the embeddings direct-Qdrant scroll behind a /health capability and version check, degrading the embedding tier honestly on mismatch.

- [x] `W05.P10.S17` - Gate the embeddings direct-Qdrant scroll behind a health capability and Qdrant-version check, degrading the embedding tier honestly; `engine/crates/vaultspec-api/src/routes/query.rs`.

### Phase `W05.P11` - coordination and codify

File the rag coordination asks, codify the durable rules, write the mutually-referenced invariant, and run the final review.

- [x] `W05.P11.S18` - File the rag coordination asks for HTTP prune and optimize routes, a contract_version on health, and the server-start idempotency envelope; `engine/crates/rag-client/src/control.rs`.
- [x] `W05.P11.S19` - Codify the machine-singleton, codified-contract, and no-STATUS_DIR-override rules and write the mutually-referenced invariant; `.vaultspec/rules/rules/rag-is-a-machine-singleton-the-dashboard-attaches-never-owns.md`.
- [x] `W05.P11.S20` - Run the full code review of the campaign and resolve required revisions; `.vault/audit/2026-06-26-rag-service-management-audit.md`.

## Parallelization

Waves are sequenced: W01 -> W02 -> {W03 design, then W04 build} -> W05. W01.P01 (the predicate) lands before W01.P02 (the runner gating consumes it); W01.P03 may proceed alongside P02. In W02, P04 (Tier-1 projection) precedes P05 (Tier-2 reads) and P06 (stores consumers), which may then run together. W03 is a design pass surfaced for owner approval and gates W04. Within W04, P08 precedes P09. W05.P10 is independent of the console and may land any time after W01; W05.P11 (coordination + codify + review) runs last.

## Verification

- A dashboard launched while rag is already running attaches and manages it with zero start attempts and zero error envelopes; a dashboard with rag genuinely absent starts exactly one service.
- Two dashboard scopes (or a dashboard plus CLI) racing a start never produce two services and never surface a 502 for the loser; the loser attaches.
- The running predicate distinguishes Running, Crashed, and Absent from discovery + heartbeat + `GET /health`, never from a bare transport error or `server status` exit code.
- The rag-ops state surface serves size/state from rag's codified HTTP plus capability-gated Qdrant-native reads, bounded and memoized, degrading honestly via the tiers block; no dependency on rag's internal collection/payload shape.
- The operations console renders as a machine-level surface with copy stating stop is machine-wide; lifecycle and data verbs are ActionDescriptors on the unified action plane.
- The embeddings direct-Qdrant scroll is capability/version gated and degrades honestly on mismatch.
- A written, mutually-referenced invariant covers the discovery/STATUS_DIR contract and the shared definition of "running"; the three codification candidates are evaluated.
- The full lint gate (`just dev lint all`) is exit 0, `cargo test --workspace` and the frontend live suite pass, and the final review verdict is PASS.
- The plan is complete when every Step is closed (`- [x]`).
