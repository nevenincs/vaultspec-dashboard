---
tags:
  - '#exec'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S02'
related:
  - "[[2026-07-12-single-app-runtime-plan]]"
---

# Introduce the machine app home module resolving the per-user app directory, owning the seat discovery path and a bounded launcher-state file recording known workspace roots (id, label, path, last-opened) plus the last-active root, with rows capped and pruned by reachability

## Scope

- `engine/crates/vaultspec-session/src/app_home.rs`

## Description

- Create `engine/crates/vaultspec-session/src/app_home.rs`: `app_home_dir` (`VAULTSPEC_APP_HOME` override, else `USERPROFILE`/`HOME` + `.vaultspec`, the rag-client resolution), `seat_discovery_path`, `launcher_state_path`.
- Add `LauncherState`: bounded workspace rows (`MAX_WORKSPACE_ROWS` = 32, stalest-evicted), `last_active`, tolerant `load`, atomic `save` (temp + rename, unix 0600), `touch` upsert, `prune_unreachable`.
- Re-export from the crate root; three unit tests (roundtrip + corruption tolerance, cap eviction + upsert, reachability prune).

## Outcome

The machine app home module exists with a bounded, best-effort launcher state; 3/3 tests green.

## Notes

Per ADR O5 the per-workspace user state is deliberately NOT hoisted; this file set is additive.
