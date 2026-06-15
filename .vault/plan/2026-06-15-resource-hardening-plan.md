---
tags:
  - '#plan'
  - '#resource-hardening'
date: '2026-06-15'
modified: '2026-06-15'
tier: L2
related:
  - '[[2026-06-15-resource-hardening-adr]]'
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

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #plan) and one feature tag.
     Replace resource-hardening with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     tier is mandatory for new plans. Allowed: L1, L2, L3, L4.
     L1 = Steps only. L2 = Phases above Steps. L3 = Waves above
     Phases above Steps. L4 = Epic above Waves above Phases above
     Steps; PM association required. Pre-existing plans without this
     field default to L2.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'. The related field
     carries the AUTHORIZING documents (ADR, research, reference, prior
     plan) for every Step in this plan; Steps inherit this chain;
     per-row reference footers do not exist.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->


<!-- HIERARCHY AND TIERS:
     Epic > Wave > Phase > Step. Step is the canonical leaf-row
     noun. Execution Record artifact: <Step Record>.
     Tier is declared in frontmatter as tier: L1/L2/L3/L4
     (mandatory for new plans; pre-existing plans without the
     field default to L2 and the writer adds the field on first
     edit). The tier selects containers:
       L1 = Steps only.
       L2 = Phases above Steps.
       L3 = Waves above Phases above Steps.
       L4 = Epic above Waves above Phases above Steps; MUST declare
            a project-management association in the Epic intent
            block prose.
     Selection is by complexity criteria, not container counting.
     Writer never invents containers to qualify a tier. -->

<!-- IDENTIFIERS AND ROW CONTRACT:
     S##, P##, W## are flat, per-document, append-only, immutable.
     Promotion adds containers without renumbering. Gaps are not
     reused.
     Display paths are computed from current grouping:
       Step path:    L1 S##   L2 P##.S##   L3/L4 W##.P##.S##
       Phase heading:        L2 P##       L3/L4 W##.P##
       Wave heading:                      L3/L4 W##
     Row format:
       - [ ] `<display-path>` - imperative-verb action; `path/to/file`.
     Two-state checkboxes only ([ ] open, [x] closed). No per-row
     reference footers; wiki-links and markdown links are forbidden
     in plan body. Authorizing documents go in the plan's `related:`
     frontmatter once.
     ASCII spaced hyphens everywhere; em-dash (U+2014) and en-dash
     (U+2013) are forbidden. Step rows within a Phase are
     contiguous. -->

<!-- NO COMPRESSION:
     N self-similar actions = N rows. Never collapse into "for each
     X, do Y" / "across all callers, do Z" / "in every module,
     replace W". The rule applies at every tier including L1. -->

<!-- VAULTSPEC-CORE VAULT PLAN CLI:
     The `vaultspec-core vault plan` CLI is the canonical surface for
     structural manipulation of this plan document. Writers and
     executors MUST use `vaultspec-core vault plan step add/insert/move/
     remove/check/uncheck/toggle/edit`,
     `vaultspec-core vault plan phase add/move/remove/edit`,
     `vaultspec-core vault plan wave add/move/remove/edit`,
     `vaultspec-core vault plan epic intent`, and
     `vaultspec-core vault plan tier promote/demote` for every
     identifier-affecting change rather than hand-editing the row
     grammar. Hand edits are tolerated by the parser but flagged by
     `vaultspec-core vault plan check`; canonical-identifier preservation is
     guaranteed only when the CLI performs the mutation. Run
     `vaultspec-core vault plan --help` for the full subcommand
     surface. -->

# `resource-hardening` plan

### Phase `P01` - Measurement floor: leak/exhaustion harness

Stand up adverse tests that reproduce each resource failure (subprocess hang, FS-event flood, repeated cold index) and assert a bounded ceiling; these fail before any fix lands.


<!-- One-line headline summary plan. -->

- [ ] `P01.S01` - Add an engine adverse test injecting a hung vaultspec-core subprocess; `assert the Tokio blocking pool does not saturate and the request bounds out; `engine/crates/vaultspec-api/tests`.
- [ ] `P01.S02` - Add an FS-event-flood test asserting at most one rebuild is queued behind an in-flight rebuild (coalescing); `engine/crates/vaultspec-api/tests`.
- [ ] `P01.S03` - Add a repeated cold-index test asserting bounded peak memory and bounded engine.sqlite3 size after churn+retention; `engine/crates/engine-graph/tests`.

### Phase `P02` - Engine resource safety

Bound the crash-shaped engine resources: gix/rayon parallelism (the crash site), subprocess wall-clock timeout, coalescing bounded rebuild channel, SQLite vacuum + retention, and task/loop hygiene.

- [ ] `P02.S04` - Bound gix/rayon parallelism during scope index so peak memory is independent of core count (B5b, the crash site); `engine/crates/ingest-git/src/worktrees.rs`.
- [ ] `P02.S05` - Wrap the spawn_blocking subprocess call sites in tokio::time::timeout (B1); `engine/crates/vaultspec-api/src/registry.rs`.
- [ ] `P02.S06` - Replace the unbounded watcher mpsc with a capacity-1 coalescing bounded channel that drops when a rebuild is pending (B2); `engine/crates/vaultspec-api/src/registry.rs`.
- [ ] `P02.S07` - Add SQLite auto_vacuum=INCREMENTAL + post-prune incremental_vacuum + WAL truncate, temporal_events retention, and wire evict_expired_semantic into the rebuild path (B5); `engine/crates/engine-store/src/lib.rs`.
- [ ] `P02.S08` - Task hygiene: HashSet watcher dedup, heartbeat loop abort handle, cached projection in commit_graph (B9); `engine/crates/vaultspec-api/src`.

### Phase `P03` - Security tighten

Close the residual security surface the prior audit flagged: cryptographic bearer token, escaped token injection, and rag search target validation.

- [ ] `P03.S09` - Replace the FNV-of-pid+time bearer token with a getrandom 128-bit token (B10); `engine/crates/vaultspec-api/src/app.rs`.
- [ ] `P03.S10` - Attribute-escape the token in SPA HTML injection and validate rag search target against {vault,code} (B10); `engine/crates/vaultspec-api/src/routes`.

### Phase `P04` - Class-A prevention + codify

Prevent dev-environment artifact sprawl from recurring (shared cargo target, worktree teardown, project-scoped HF_HOME, clean recipe) and promote the durable bounding lessons to project rules.

- [ ] `P04.S11` - Add a shared CARGO_TARGET_DIR config and a worktree teardown policy so worktree builds stop re-sprawling; `.cargo/config.toml`.
- [ ] `P04.S12` - Scope HF_HOME to the project for rag and add a just dev clean reclamation recipe; `justfile`.
- [ ] `P04.S13` - Codify bounded-by-default, subprocess-cap-and-timeout, and dev-artifacts-scoped rules; `.vaultspec/rules/rules`.

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

<!-- The plan's tier (declared in frontmatter as `tier: L1`, `L2`, `L3`, or
`L4`) determines the structure under this section:

- `L1`: a flat list of Step rows (no Phase, Wave, or Epic).
- `L2`: one or more `### Phase` blocks each containing Step rows.
- `L3`: one or more `## Wave` blocks each containing Phase blocks.
- `L4`: a `## Epic intent` block, followed by Wave blocks. -->

<!-- Replace this scaffold with the tier-appropriate structure for your plan.
Format examples for each block type are embedded below as commented
templates. -->

<!-- IMPORTANT: This document must be updated between execution runs to
     track progress. -->

<!-- PHASE BLOCK FORMAT (L2, L3, L4):
     ### Phase `P02` - rewrite the writer-agent contract

     One sentence stating what this Phase delivers.

     - [ ] `P02.S01` - imperative-verb action; `path/to/file`.
     - [ ] `P02.S02` - imperative-verb action; `path/to/file`.

     At L3/L4 the Phase heading uses the ancestor-aware path
     (### Phase `W01.P02` - ...). The intent sentence is mandatory. -->

<!-- WAVE BLOCK FORMAT (L3, L4):
     ## Wave `W01` - language-only convention rollout

     One paragraph stating what this Wave delivers, which downstream
     Wave depends on it, and which authorizing documents back it.

     ### Phase `W01.P01` - ...
     ### Phase `W01.P02` - ...

     The Wave intent paragraph is mandatory. -->

<!-- EPIC INTENT BLOCK FORMAT (L4 only):
     ## Epic intent

     One paragraph stating the strategic goal, the external project-
     management association (milestone name, project board identifier,
     roadmap entry), the timeline horizon, and the teams or agents
     involved.

     ## Wave `W01` - ...
     ## Wave `W02` - ...

     The ## Epic intent block is mandatory at L4 and absent at L1, L2,
     L3. The plan title (the level-one # heading at the top of the
     document) is the Epic title; no separate Epic heading is emitted. -->

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
