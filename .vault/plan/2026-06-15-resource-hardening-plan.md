---
tags:
  - '#plan'
  - '#resource-hardening'
date: '2026-06-15'
modified: '2026-06-15'
tier: L2
related:
  - '[[2026-06-15-resource-hardening-adr]]'
  - '[[2026-06-15-resource-hardening-research]]'
---

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the
       related: field above.
     - The related: field carries the AUTHORISING documents
       (ADR, research, reference, prior plan) for every Step in
       this plan. Steps inherit this chain; per-row reference
       footers do not exist.
     - NEVER use [[wiki-links]] or markdown links in the
       document body. -->

# `resource-hardening` plan

### Phase `P01` - Measurement floor: leak/exhaustion harness

Stand up adverse tests that reproduce each resource failure (subprocess hang, FS-event flood, repeated cold index) and assert a bounded ceiling; these fail before any fix lands.

- [x] `P01.S01` - Add an engine adverse test injecting a hung vaultspec-core subprocess; `assert the Tokio blocking pool does not saturate and the request bounds out; `engine/crates/vaultspec-api/tests`.
- [x] `P01.S02` - Add an FS-event-flood test asserting at most one rebuild is queued behind an in-flight rebuild (coalescing); `engine/crates/vaultspec-api/tests`.
- [x] `P01.S03` - Add a repeated cold-index test asserting bounded peak memory and bounded engine.sqlite3 size after churn+retention; `engine/crates/engine-graph/tests`.

### Phase `P02` - Engine resource safety

Bound the crash-shaped engine resources: gix/rayon parallelism (the crash site), subprocess wall-clock timeout, coalescing bounded rebuild channel, SQLite vacuum + retention, and task/loop hygiene.

- [x] `P02.S04` - Bound gix/rayon parallelism during scope index so peak memory is independent of core count (B5b, the crash site); `engine/crates/ingest-git/src/worktrees.rs`.
- [x] `P02.S05` - Wrap the spawn_blocking subprocess call sites in tokio::time::timeout (B1); `engine/crates/vaultspec-api/src/registry.rs`.
- [x] `P02.S06` - Replace the unbounded watcher mpsc with a capacity-1 coalescing bounded channel that drops when a rebuild is pending (B2); `engine/crates/vaultspec-api/src/registry.rs`.
- [x] `P02.S07` - Add SQLite auto_vacuum=INCREMENTAL + post-prune incremental_vacuum + WAL truncate, temporal_events retention, and wire evict_expired_semantic into the rebuild path (B5); `engine/crates/engine-store/src/lib.rs`.
- [x] `P02.S08` - Task hygiene: HashSet watcher dedup, heartbeat loop abort handle, cached projection in commit_graph (B9); `engine/crates/vaultspec-api/src`.

### Phase `P03` - Security tighten

Close the residual security surface the prior audit flagged: cryptographic bearer token, escaped token injection, and rag search target validation.

- [x] `P03.S09` - Replace the FNV-of-pid+time bearer token with a getrandom 128-bit token (B10); `engine/crates/vaultspec-api/src/app.rs`.
- [x] `P03.S10` - Attribute-escape the token in SPA HTML injection and validate rag search target against {vault,code} (B10); `engine/crates/vaultspec-api/src/routes`.

### Phase `P04` - Class-A prevention + codify

Prevent dev-environment artifact sprawl from recurring (shared cargo target, worktree teardown, project-scoped HF_HOME, clean recipe) and promote the durable bounding lessons to project rules.

- [x] `P04.S11` - Add a shared CARGO_TARGET_DIR config and a worktree teardown policy so worktree builds stop re-sprawling; `.cargo/config.toml`.
- [x] `P04.S12` - Scope HF_HOME to the project for rag and add a just dev clean reclamation recipe; `justfile`.
- [x] `P04.S13` - Codify bounded-by-default, subprocess-cap-and-timeout, and dev-artifacts-scoped rules; `.vaultspec/rules/rules`.

## Description

Binding implementation of the accepted `resource-hardening` ADR: the engine
resource-safety and security wave of the `performance-sweep` campaign, grounded
in the `resource-hardening` research (the verified crash-log root cause and the
B1-B10 findings with `file:line` evidence). This plan owns ONLY the crash-shaped
engine items and the security surface the concurrent `performance-sweep` effort
left unclaimed, plus the Class-A structural prevention and codify; it does not
touch the frontend, the stores, or the scene layer (those are the concurrent
effort's territory, and the scene leak work is sequenced with the
`dashboard-node-graph-stability` d3-force rewrite). The cadence is
reproduce-then-fix: P01 stands up the leak/exhaustion harness so each fix lands
behind a test that fails first; P02 bounds the engine resources that crash it;
P03 closes the residual security surface; P04 prevents the dev-artifact sprawl
from recurring and promotes the durable lessons to rules. Class-A disk triage
(39 GB reclaimed) was already performed during research and is not re-done here.

## Steps







## Parallelization

P01 (the harness) leads: each fix in P02/P03 pairs with the adverse test that
reproduces it, so the harness must exist first. Within P02 the steps are largely
independent (gix bound, subprocess timeout, channel cap, SQLite retention, task
hygiene touch different concerns) and may proceed concurrently, except S05
(subprocess timeout) and S06 (bounded channel) both touch `registry.rs` and
should be sequenced to avoid edit conflicts, and S07 (SQLite) must coordinate
with the concurrent `performance-sweep` A3 snapshot-compression which also edits
`engine-store`. P03 (security) is independent of P02 and may run in parallel.
P04 (prevention + codify) runs last, after the disciplines it records have held
in execution. All work is in `engine/` plus repo-root config; because the main
worktree is shared with a live session, every commit is by pathspec, never
`git add -A`.

## Verification

The plan is complete when every Step is closed (`- [x]`) and all of:

- Each P02/P03 fix has a corresponding P01 adverse test that failed before the
  fix and passes after (reproduce-then-fix proven, not asserted).
- Engine `cargo test --workspace`, `cargo clippy --all-targets -D warnings`, and
  `cargo fmt --check` are green.
- The hung-subprocess test shows the blocking pool bounded; the FS-flood test
  shows at most one queued rebuild; the repeated-index test shows bounded peak
  memory and that `engine.sqlite3` does not grow without bound and reclaims pages
  after retention.
- A security check confirms the bearer token is `getrandom`-sourced, the SPA
  token injection is escaped, and the rag search target is vocabulary-validated.
- The three codified rules exist under `.vaultspec/rules/rules/` and
  `vaultspec-core spec rules list` enumerates them.
- `vaultspec-core vault check all` is green and `vaultspec-core vault plan check`
  reports the plan canonical.
- A `vaultspec-code-review` audit signs off the engine wave with no unresolved
  HIGH findings.
