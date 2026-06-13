---
tags:
  - '#research'
  - '#engine-hardening'
date: '2026-06-13'
modified: '2026-06-13'
related: []
---

# `engine-hardening` research: `engine hardening gaps: conformance-in-CI, git completeness, degradation adversarial`

Research sweep over the engine and frontend state-of-hardening against four
named gaps identified by the team-lead: consumer-typed conformance in CI,
git completeness (ahead/behind), re-derivability (ADR D8.2), and degradation
honesty across real failure modes.

## Findings

### F1 — Conformance in CI: Rust suite exists, TypeScript side absent

`engine/tests/tests/conformance.rs` boots a live `vaultspec serve` binary
against a two-commit fixture and asserts every S49 divergence is now closed at
the Rust level. `engine-ci.yml` runs `cargo test --workspace`, so the Rust
conformance suite is gated. The `quality-gates.yml` frontend job runs vitest
against the `mockEngine` only — there is no CI step that imports `EngineClient`
and drives it against a live engine port. The `seq` vs `last_seq` type mismatch
(Task #9 / commit `c812371`) is exactly the class of bug the Rust suite cannot
catch but a TS-typed live check would: the Rust test asserted the field was
absent, but the TS client declared `seq: number` and used it silently.

### F2 — Git completeness: ahead/behind entirely absent

`engine/crates/ingest-git/src/worktrees.rs` — `WorktreeInfo` carries `dirty`,
`head_ref`, `path`, `is_main`. `branches.rs` — `BranchInfo` carries `name`,
`class`. Neither carries `ahead`/`behind`. No computation against an upstream
tracking ref exists anywhere in `ingest-git`. The dashboard's NowStrip and
worktree picker have no divergence signal. `gix` discover resolves `commondir`
so linked worktrees with `.git`-file pointers work; bare repos are structurally
handled but have no test fixture.

### F3 — Re-derivability (D8.2): already implemented and CI-gated

`engine/crates/engine-graph/tests/rederive_test.rs` covers
`full_index_from_deleted_cache_converges_to_the_identical_graph` (wipes
`.vault/data/engine-data/engine.sqlite3`, re-indexes cold, asserts byte-equal
canonical snapshots) and double-reingest idempotency. Runs in `cargo test
--workspace`. D8.2 is honored; no new code needed.

### F4 — Degradation honesty: frontend fixed, engine has no adversarial coverage

Frontend: `adaptStatus` absent-tier-reads-as-up bug was exposed by
`degradation-honesty-02` and fixed in commit `e04ca04`. All 26 adversarial
tests in `frontend/src/stores/__adversarial__/` are now green. Engine side: no
test simulates rag unreachable, core unreachable, or git failure and asserts the
`tiers` block reflects each. `engine/crates/engine-query/src/envelope.rs`
`tiers_block()` + `query_tiers()` implement the logic; it is untested under
adversarial conditions. The `every-wire-response-carries-the-tiers-block` rule
makes this a contract guarantee, not an aspiration.
