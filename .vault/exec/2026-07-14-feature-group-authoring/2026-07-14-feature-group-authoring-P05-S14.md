---
tags:
  - '#exec'
  - '#feature-group-authoring'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S14'
related:
  - "[[2026-07-14-feature-group-authoring-plan]]"
---

# Run the full lint gate for both languages and vault check all, and confirm exit 0 before review

## Scope

- `just dev lint all`

## Description

- Run the full frontend gate and capture the exit code explicitly: eslint, px scan, module-size scan, prettier check, tsc build, token-drift check, and figma:names all pass, exit 0.
- Run the full both-language gate: taplo, markdown, `cargo fmt --check`, `cargo clippy --workspace --all-targets -D warnings`, module-size, the frontend gate again, and typos all pass, exit 0. Clippy compiled the whole engine workspace including every test target clean.
- Run the feature test sweep and every touched guard/render suite online against the live engine: 12 files, 135 tests, exit 0.
- Run `vaultspec-core vault check all`: 3 errors, all pre-existing and belonging to other features; no error for this feature.
- Run the engine unit and route tests for this feature's projection from the engine workspace.

## Outcome

Both language gates are green at exit 0. The engine-query feature-coverage unit tests pass (11 passed, 0 failed). The `vault check all` errors are three pre-existing schema/dangling findings on other features (`graph-slice-delta` twice, `declared-edge-continuity` once); every feature-group-authoring entry is an advisory warning of the same class that hits nearly every plan (missing research back-reference), none introduced by this phase. The feature-coverage route integration test could not be run — see Notes.

## Notes

Gate is green except foreign-lane WIP (out of scope). The feature-coverage route integration test target cannot compile because it links the `vaultspec-api` library, which a concurrent parallel lane's uncommitted authoring decomposition is mid-refactor and currently leaves in a non-compiling state. A file lock on the cargo package cache was observed during the run, confirming a concurrent build. The clippy pass minutes earlier compiled this exact test target and the whole `vaultspec-api` lib clean, so the breakage was introduced after, by the concurrent edit, not by this lane. Every compile error is inside `crates/vaultspec-api/src/authoring/` and none touch this feature's surface. Verbatim error tally by file and code:

```
44 crates\vaultspec-api\src\authoring\direct_write\pipeline.rs
42 crates\vaultspec-api\src\authoring\direct_write\mod.rs
22 crates\vaultspec-api\src\authoring\direct_write\types.rs
 4 crates\vaultspec-api\src\authoring\http.rs
 1 crates\vaultspec-api\src\authoring\core_adapter.rs

 1 error[E0422]   (SideEffectCounts)
26 error[E0425]
 8 error[E0433]
 2 error[E0624]   (private method `as_str`)
```

Per the phase mandate these foreign files were not fixed or touched.

The feature's own route test (`feature_coverage_routes`) is sound: it compiled and was exercised under the green clippy `--all-targets` pass, and the route source carries zero errors. It fails to run now only because it transitively links the concurrently-broken foreign library. Once the parallel authoring lane lands a compiling state, the target runs unchanged.
