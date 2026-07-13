---
tags:
  - '#exec'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S21'
related:
  - "[[2026-07-12-single-app-runtime-plan]]"
---

# Run the full gate (just dev lint all plus engine and frontend suites) and a release dry-run building the embed-spa binary, verifying double-click launch, attach, stop, and update flows end to end on Windows

## Scope

- `justfile + .github/workflows/`

## Description

- Run the full engine gate: `cargo fmt --check` clean, `cargo clippy --workspace --all-targets -- -D warnings` clean (after dropping two unused imports left by the module split), 727 api lib tests + every integration binary + the 3-test seat matrix green.
- Run the full frontend gate: eslint, px-scan, prettier, tsc, tokens, figma-names all green; full vitest 2919/2920.
- Split `lib.rs` -> `boot.rs` and `app.rs` -> `discovery.rs` to satisfy the module-size hard gate (both back under baseline).
- Release dry-run: build `frontend/dist`, build the binary with `--features vaultspec-api/embed-spa`, and verify on Windows from a non-workspace cwd with an isolated app home: embedded SPA served workspace-less, CSP live on the wire, update refused without a receipt, seat status block correct, second seated serve refused naming the seat, graceful stop retracting discovery.

## Outcome

The gate is green across both languages for this feature's entire surface; the double-click launch, attach, stop, and update-refusal flows are verified end to end against the embed-spa binary.

## Notes

Two residual reds in the shared tree belong to a PARALLEL session's uncommitted WIP, outside this feature: the `git-changes-summary` scoped-cache guard test (their new query family, mid-flight) and the module-size baseline breach on `stores/server/authoring.ts` (+4 lines, their lane). Neither file is touched by this feature's commits.
