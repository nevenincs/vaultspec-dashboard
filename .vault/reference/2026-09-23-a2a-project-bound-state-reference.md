---
tags:
  - '#reference'
  - '#a2a-project-bound-state'
date: '2026-09-23'
modified: '2026-09-23'
body_schema: 'body-v2'
body_hash: 'sha256:9c9007d41b7a96121fe745f06580d4515cda56688f88bd7cad7092542215d5f6'
related: []
---

# `a2a-project-bound-state` reference: `a2a discovery and env var sites in the dashboard engine`

## Summary

Every dashboard-side site that names an a2a-owned environment variable or
resolves a2a's resident discovery record, as implemented for
`2026-09-23-a2a-project-bound-state-adr`.

- `vaultspec_product::a2a_contract::A2A_DEFAULT_HOME_DIR`
  (`engine/crates/vaultspec-product/src/a2a_contract.rs:64`) is the
  project-relative default a2a home (`.vault/data/agents`), replacing the
  retired per-user `A2A_HOME_DIR` (`.vaultspec-a2a`) constant of the same
  name-shape. `A2A_HOME_ENV` (`VAULTSPEC_A2A_HOME`) is declared beside it,
  unchanged.
- `a2a_service_json_candidates`
  (`engine/crates/vaultspec-api/src/routes/ops/a2a/discovery.rs:89`) is the
  public, env-reading candidate builder; it delegates to the pure
  `a2a_service_json_candidates_for` (`:100`), which takes the
  `VAULTSPEC_A2A_HOME` override as an explicit argument so tests never
  mutate the process environment. `a2a_endpoint` (`:236`) and
  `resident_sibling_is_attachable` (`:291`) are the two consumers that
  resolve a resident gateway from those candidates.
- `vaultspec_product::lifecycle::A2A_APP_HOME_ENV` and
  `A2A_SETTLEMENT_URL_ENV`
  (`engine/crates/vaultspec-product/src/lifecycle.rs:40,46`) are the two a2a
  environment variables the dashboard sets when it spawns an OWNED gateway
  (`gateway_spawn_env`, same file, lines 62-68 at the time of writing);
  renamed from `VAULTSPEC_DESKTOP_APP_HOME` /
  `VAULTSPEC_DESKTOP_SETTLEMENT_URL`.
- `engine_workspace_root` / `set_engine_workspace_root`
  (`engine/crates/vaultspec-api/src/routes/a2a_lifecycle.rs:85,92`) are the
  process-wide accessors the agent-tier's memoized, per-response snapshot
  reads when it has no per-request state to thread a workspace root
  through; set once at boot from `AppState::build_state_full`
  (`engine/crates/vaultspec-api/src/app.rs:1425`), which owns
  `AppState::workspace_root`, the engine's one served workspace per process.
- `frontend/e2e/agent/harness.ts` (`spawnA2a`, starting line 220) is the
  only site that spawns a SOURCE a2a checkout directly (the cross-repository
  e2e lane); its environment block (lines 235-261 at the time of writing)
  sets or deletes every a2a-owned variable the gateway/worker process reads,
  all renamed to the `VAULTSPEC_A2A_<NAME>` family. `VAULTSPEC_A2A_HOME`
  (line 238) and `VAULTSPEC_TEST_A2A_ROOT` (a dashboard/test-owned variable
  naming where the harness finds the a2a source checkout, not a2a's own) are
  unaffected.

## Pre-existing markdown lint finding on the governing edge ADR

`2026-07-14-a2a-orchestration-edge-adr` fails `mdformat --check` on
unmodified `main` (confirmed independently of this change). Running
`mdformat` (not `--check`) on that file reformats it destructively: at
least one top-level `**D2 — ...**` heading gets merged into the immediately
preceding amendment blockquote, because the source has no blank line
between that blockquote's last line and the `**D2` heading. `pymarkdown`
separately flags five pre-existing `MD028` (blank line inside blockquote)
findings in the same file, at the blank lines separating consecutive
`> **Amendment (...):**` blocks; `pymarkdown fix` does not auto-fix `MD028`.
This finding blocks any future hand-edit of that ADR's body until its
markdown structure is repaired (inserting explicit blank-line separators
throughout, then reformatting once, under its own reviewed change) — hence
`2026-09-23-a2a-project-bound-state-adr` records the dashboard-side decision
as a new record instead of an amendment.
