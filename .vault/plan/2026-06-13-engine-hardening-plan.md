---
tags:
  - '#plan'
  - '#engine-hardening'
date: '2026-06-13'
modified: '2026-06-15'
tier: L2
related:
  - '[[2026-06-13-engine-hardening-adr]]'
  - '[[2026-06-13-engine-hardening-research]]'
---
# `engine-hardening` plan

### Phase `P01` - TypeScript conformance CI job

Wire the TypeScript conformance fixture and CI job so contract drift between the live engine wire and `EngineClient` types fails CI — the Rust suite cannot catch TypeScript type mismatches.

- [x] `P01.S01` - Write `engineConformance.test.ts`: a vitest fixture that skips when `ENGINE_BASE_URL` is unset and drives every contract capability (graph slice, asof/diff ms-timestamp, tiers on success and error, search shape) against the live engine port when set; `frontend/src/testing/engineConformance.test.ts`.
- [x] `P01.S02` - Add `engine-conformance` job to `quality-gates.yml`: cargo build engine binary, start `vaultspec serve` against a temp fixture, set `ENGINE_BASE_URL`, run `vitest run` scoped to `engineConformance.test.ts`, tear down; `use `rust-cache` scoped to `engine/`; `.github/workflows/quality-gates.yml`.

### Phase `P02` - Git ahead/behind

Add ahead/behind divergence counts to the git wire surface so the dashboard knows worktree sync status without a separate `git status` call.

- [x] `P02.S03` - Add `ahead: Option<u32>` and `behind: Option<u32>` to `WorktreeInfo`; `compute via gix rev-walk against the upstream tracking ref; return `None` on detached HEAD, no upstream configured, or bare remote — never fail the enclosing request; `engine/crates/ingest-git/src/worktrees.rs`.
- [x] `P02.S04` - Propagate `ahead`/`behind` into the `/map` and `/status` wire responses; `add optional `ahead?: number` and `behind?: number` to `WorktreeInfo` and `EngineStatus.git` in the TypeScript client types; `engine/crates/vaultspec-api/src/routes/workspace.rs`, `frontend/src/stores/server/engine.ts`.
- [x] `P02.S05` - Add a unit test in `ingest-git` using a two-commit fixture with a bare remote: verify `ahead=1`, `behind=0` after one local commit not yet pushed; `engine/crates/ingest-git/src/worktrees.rs`.

### Phase `P03` - Engine degradation adversarial tests

Add adversarial engine tests that simulate each failure mode and assert the tiers block reflects the outage — closing the gap between the rule and its enforcement.

- [x] `P03.S06` - Write `degradation_adversarial.rs` using the `fixture()` + `ServeGuard` pattern from `conformance.rs`: three tests — (a) rag unreachable: point rag URL at a bound-but-unserved port, assert `tiers.semantic.available == false`; `(b) core unreachable: provide a nonexistent core path, assert `tiers.declared.available == false`; (c) healthy baseline: assert all four canonical tiers present and `available == true` in a clean serve; `engine/tests/tests/degradation_adversarial.rs`.
- [x] `P03.S07` - Run `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, `npx tsc --noEmit`, `npx eslint src/`, `npx vitest run` all green; `submit for fe-reviewer gate; `engine/`, `frontend/`.

## Description

This plan executes the `engine-hardening` ADR's three actionable decisions.
D3 (re-derivability) is acknowledged closed — `rederive_test.rs` already covers
D8.2 and runs in `cargo test --workspace`.

P01 closes the contract-drift blind spot: the Rust conformance suite in
`conformance.rs` correctly asserted the wire shape at the Rust level, but the
TypeScript `seq` / `last_seq` mismatch (Task #9) proved the TS client types can
drift silently. The TS conformance fixture drives the same `EngineClient` code
path the app uses against a live binary, making any wire-vs-type mismatch a CI
failure.

P02 adds a missing feature: `ahead`/`behind` divergence counts are entirely
absent from the engine's git surface. `gix` already resolves linked worktrees
and common-dir correctly; the rev-walk against an upstream tracking ref is the
only missing piece. Graceful degradation (None on no upstream) is required
because not every worktree has a tracking remote configured.

P03 closes the gap between the `every-wire-response-carries-the-tiers-block`
rule and its adversarial verification: each of the three main failure modes (rag
down, core down, healthy baseline) is now a named test that will fail if the
engine's `tiers_block()` logic regresses.

## Parallelization

P01 and P02 are independent — the CI fixture (P01) does not depend on the
ahead/behind engine change (P02) and vice versa. Both can execute in parallel.
P03 depends on nothing in P01 or P02 and can run concurrently. P03.S07 (the
lint + test + review gate) is the single converging step and must run after all
prior steps are closed.

## Verification

- `cargo test --workspace` passes (includes Rust conformance, rederive, and the
  new degradation adversarial tests).
- `vitest run src/testing/engineConformance.test.ts` passes when `ENGINE_BASE_URL`
  is set against a live `vaultspec serve`.
- The new `engine-conformance` CI job in `quality-gates.yml` is green.
- `/map` and `/status` wire responses carry `ahead`/`behind` for branches with
  an upstream; both are `null`/absent for detached HEAD or no upstream.
- All 26 frontend adversarial tests remain green (they are not modified here,
  but must not regress).
- fe-reviewer signs off after P03.S07.
