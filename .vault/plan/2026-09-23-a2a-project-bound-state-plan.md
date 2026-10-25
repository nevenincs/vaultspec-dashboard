---
tags:
  - '#plan'
  - '#a2a-project-bound-state'
date: '2026-09-23'
tier: L1
related:
  - '[[2026-07-14-a2a-orchestration-edge-adr]]'
  - '[[2026-09-23-a2a-project-bound-state-adr]]'
modified: '2026-09-23'
body_schema: body-v2
body_hash: 'sha256:76f8c8470197162f6202454ffe1310ddef7fd613c18798ba776fa6fc1245251e'
---

<!-- RETIRED: S02 -->

# `a2a-project-bound-state` plan

Rename every a2a-owned environment variable and relocate a2a's resident
discovery default off the user profile, mirroring the accepted a2a-side
contract change.

## Description

Approved 2026-09-23. Authorization basis: the orchestrating session's task
assignment, which relayed the user's standing instruction to mirror the
sibling repository's accepted `2026-09-23-project-bound-state-adr` (a2a repo)
on the dashboard side. No new costly decision is made here beyond adopting the
already-decided upstream contract: `2026-09-23-a2a-project-bound-state-adr`
(this vault, linked above) records that adoption. It cites the governing edge
ADR `2026-07-14-a2a-orchestration-edge-adr` rather than amending it directly:
that record carries a pre-existing, unrelated markdown-formatting fragility
(documented in the linked reference) that blocks a safe hand-authored
amendment until it receives its own structural repair.

Scope: rename every a2a-owned environment variable the dashboard reads,
writes, or spawns a2a's own process with, from `VAULTSPEC_<NAME>` to
`VAULTSPEC_A2A_<NAME>` with no legacy fallback; and relocate the engine's
resident-a2a discovery default from the retired per-user `~/.vaultspec-a2a`
home to the project-bound `<workspace_root>/.vault/data/agents/service.json`,
rooted at the engine's own served workspace. `VAULTSPEC_A2A_HOME` keeps its
name unchanged; a relative override now resolves against the workspace root
instead of the user's home. Variables the dashboard/engine owns for itself are
out of scope and unaffected.

## Steps

- [x] `S01` - Rename a2a-owned env var constants, relocate the default resident home from the per-user profile to the project-relative default, and rewire the engine's resident-a2a discovery candidates onto the served workspace root with tests proving the new candidate order (the constant rename and its sole consumer must land together to keep the workspace compiling); `engine/crates/vaultspec-product/src/a2a_contract.rs, engine/crates/vaultspec-product/src/lifecycle.rs, engine/crates/vaultspec-product/src/bin/product_certify/release_cases.rs, engine/crates/vaultspec-api/src/routes/ops/a2a/discovery.rs, engine/crates/vaultspec-api/src/routes/ops/a2a.rs, engine/crates/vaultspec-api/src/routes/ops/a2a_stream.rs, engine/crates/vaultspec-api/src/routes/a2a_lifecycle.rs, engine/crates/vaultspec-api/src/routes/a2a_lifecycle/agent_tier.rs, engine/crates/vaultspec-api/src/app.rs, engine/crates/vaultspec-api/src/routes/ops/a2a_tests/lifecycle.rs`.
- [x] `S03` - Rename every a2a-owned environment variable the frontend e2e harness sets or deletes when spawning a source a2a checkout, and fix its header comments; `frontend/e2e/agent/harness.ts`.

## Parallelization

`S01` and `S03` touch disjoint files and could run in parallel, but they were
executed sequentially by one worker in one pass since the whole change is a
single small mechanical rename plus one discovery-resolution rewire, reviewed
together. `S01` alone must land as one commit: the a2a-owned constant rename
and its sole consumer (the discovery candidate resolution) would leave the
Rust workspace non-compiling if split across separate commits.

## Verification

`cargo test -p vaultspec-api` and `cargo test -p vaultspec-product` pass,
including the new `routes::ops::a2a::tests::lifecycle` discovery-candidate
tests (`no_override_yields_only_the_workspace_relative_default`,
`relative_home_override_joins_onto_the_workspace_root_and_is_tried_first`,
`absolute_home_override_is_used_exactly_as_given`,
`public_candidates_are_workspace_rooted_and_never_the_retired_user_profile_path`).
A repository-wide grep for every retired `VAULTSPEC_<NAME>` spelling and for
`.vaultspec-a2a` (excluding `node_modules`, `target`, and `.vault`) returns no
hits. The plan is complete when every Step above is closed.
