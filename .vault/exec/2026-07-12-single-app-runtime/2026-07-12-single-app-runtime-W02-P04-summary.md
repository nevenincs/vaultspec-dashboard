---
tags:
  - '#exec'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-12'
related:
  - "[[2026-07-12-single-app-runtime-plan]]"
---

# `single-app-runtime` `W02.P04` summary

All three Steps (S13-S15) complete, committed as `97b69126aa` (engine) and `51f3ec9710` (frontend).

- Modified: `engine/crates/vaultspec-api/src/lib.rs` (later split into `boot.rs`), `frontend/src/app/AppShell.tsx`
- Created: `frontend/src/app/onboarding/FirstRunOnboarding.tsx`, `frontend/src/app/onboarding/FirstRunOnboarding.render.test.tsx`, `engine/crates/vaultspec-cli/tests/seat_matrix.rs`

## Description

Workspace-less boot and onboarding. A seated serve with no resolvable workspace boots the engine-owned bootstrap corpus (empty `.vault/` + a one-time scratch `gix::init` under the app home) and serves the SPA with an EMPTY workspace registry as the first-run signal; the bootstrap is never registered anywhere. The shell branches to a first-run welcome surface that fires the existing shared add-project action (`useAddWorkspace` registers, warms, and selects like a launch root), so registering the first project clears the signal without a reload. The boot matrix is proven over the real binary: seat conflict fails loud, dead-pid takeover republishes, exemptions write no machine discovery and keep the historical fail-loud contract, graceful shutdown retracts discovery. The frontend step was executed by a delegated coder and verified + committed by the orchestrator after the coder's channel went silent.
