---
tags:
  - '#exec'
  - '#dashboard-packaging'
date: '2026-07-04'
modified: '2026-07-04'
related:
  - "[[2026-07-04-dashboard-packaging-plan]]"
---

# `dashboard-packaging` `P02` summary

All five steps closed. `vaultspec serve` now probes its provisioning surface at startup (detect-and-instruct, D3): a bounded, memoized `git --version` run and the resolved `vaultspec-core` version; a missing requirement aborts before heavy work with the exact remediation (`uv tool install vaultspec-core`), while a present-but-below-floor core passes startup and degrades through the handshake. Every served tiers block (all three builders, success and error) carries the D6 component handshake - core floor 0.1.36 with the probed version and served verdict, rag floor 0.2.28 with an honestly null version. The frontend folds the served `meets_floor: false` verdict into the ONE tiers reader, so authoring blocks on a stale core and semantic panels grey on absent rag across all consuming surfaces automatically.

- Created: `engine/crates/vaultspec-api/src/handshake.rs`, `frontend/src/stores/server/engine.tierComponent.test.ts`
- Modified: `engine/crates/vaultspec-api/src/lib.rs`, `engine/crates/vaultspec-api/src/routes/mod.rs`, `frontend/src/stores/server/engine.ts`

## Description

Commits: engine `4d598b655e` (S06-S09), frontend `c8d91a6674` (S10), plus `b935372762` fixing a pre-existing, unrelated stale wire-field assertion (`target` vs `type`) surfaced by the full-suite run. Verification: engine lib tests green (handshake unit + wire tests new), full frontend suite green after the stale-assertion fix, `just dev lint frontend` exit 0, and the live handshake observed on the wire from the packaged artifact during P03 verification. Executed inline by the orchestrator (the executor pool was rate-limited); the S06-S08 steps landed as one cohesive module commit, recorded per step.

Review: initial verdict REVISION REQUIRED (one HIGH - the core version probe was unbounded on the new startup-gate path; one MEDIUM - the reader fold over-degraded the declared plane vs the D6 letter). Revisions landed in `a4ea7beb50`: the probe rebounded with the capability-probe pattern (cap + deadline + kill), the reader revised to expose an advisory `components` map with authoring blocking left to the engine's served eligibility, and the as-of//health coverage exclusion recorded. Re-check verdict: PASS.
