---
tags:
  - '#plan'
  - '#performance-sweep'
date: '2026-06-16'
modified: '2026-07-12'
tier: L2
related:
  - '[[2026-06-16-performance-sweep-adr]]'
  - '[[2026-06-15-performance-sweep-research]]'
---
# `performance-sweep` plan

### Phase `P01` - Engine speed + footprint

Memoize per-request graph projections and shrink the on-disk cache so concurrent document queries and cache footprint stop scaling per-request.

- [x] `P01.S01` - Memoize the enriched document-slice projection per graph generation (A1); `engine/crates/vaultspec-api/src/app.rs`.
- [x] `P01.S02` - Gzip-compress the large declared-graph cache payloads at rest (A3); `engine/crates/engine-store/src/lib.rs`.

### Phase `P02` - Frontend bundle + render + leaks

Cut cold-load TTI, stop always-on GPU draw, bound fan-out, and drop dead deps so the GUI is light and idle-cheap.

- [x] `P02.S03` - Vendor manualChunks + lazy scene unit so chrome paints before Pixi loads (F#2); `frontend/vite.config.ts`.
- [x] `P02.S04` - Reversible scene unmount releasing GPU resources on Stage teardown (F#1); `frontend/src/app/stage/Stage.tsx`.
- [x] `P02.S05` - Idle-throttle the Pixi ticker so a static field schedules no per-frame draw (F#4); `frontend/src/scene/field/pixiField.ts`.
- [x] `P02.S06` - Skip the full layer rebuild on an unchanged set-data (F#5); `frontend/src/scene/field/fieldAssembly.ts`.
- [x] `P02.S07` - Cap the ego-network fan-out to bound concurrent neighbors (F#6); `frontend/src/stores/server/queries.ts`.
- [x] `P02.S08` - Remove the dead sigma/@pixi/react dependencies (F#3); `frontend/package.json`.

## Description

Binding catalogue of the accepted `performance-sweep` ADR's speed/footprint and
frontend avenues, grounded in the `performance-sweep` research's measured
baselines (`scale_bench`, `dist/` bundle, frame profile). Each step is a landed,
measured optimization commit; this plan is the formal closure of the campaign
whose work landed ahead of the pipeline artifacts. Ownership split with
`resource-hardening`: the crash-shaped engine items (gix bound, subprocess
timeout, bounded channel, sqlite vacuum/retention, task hygiene) belong to that
campaign and are NOT re-planned here.

Two research avenues are deliberately DEFERRED, not dropped: A4 (per-fold
`LinkageGraph` deep-clone) is correctness-load-bearing for D8.2 convergence and
only worth attacking under a commit storm; A5 (`meta_edges` returning an owned
clone) is LOW - the heavy aggregation is already memoized via the `LinkageGraph`
`OnceLock`, so sharing the `Arc` is a marginal, signature-rippling change. Both
are recorded in the ADR consequences.

## Steps

## Parallelization

P01 (engine) and P02 (frontend) are independent layers and landed in parallel.
Within each phase the steps are independent optimizations touching different
files (A1 app.rs vs A3 engine-store; the F# steps span vite/scene/stores). Each
self-verifies via its own gate (`scale_bench` / `dist/` size / the test suite).
All work stayed off the `resource-hardening` files via the ownership split.

## Verification

Complete when every Step is closed (`- [x]`) and all of:

- Each avenue landed as a measured commit (A1 `3f21826`, A3 `9d9e3a7`,
  F#2 `52b5558`, F#1 `6b5bd66`, F#4 `c32fd2a`, F#5 `e8402d6`, F#6 `2e1c8c4`,
  F#3 `<this campaign>`).
- Engine `cargo fmt --check`, `clippy --all-targets -D warnings`, and
  `test --workspace` green.
- Frontend `just dev lint frontend` + `npm run test` green.
- `vaultspec-core vault check all` green and `vault plan check` canonical.
- A `vaultspec-code-review` audit signs off the landed optimization work with no
  unresolved HIGH findings.
- The two deferred avenues (A4, A5) are recorded in the ADR, not silently
  dropped.
