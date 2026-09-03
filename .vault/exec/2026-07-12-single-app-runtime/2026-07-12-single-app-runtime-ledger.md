---
tags:
  - '#exec'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-09-03'
body_schema: 'body-v2'
body_hash: 'sha256:d885d60db9511fa1cbddcd3a4d68ae4b7d31d4d9473340af743a93ceda60dd79'
related:
  - "[[2026-07-12-single-app-runtime-plan]]"
---

# `single-app-runtime` ledger

## Changes

- `S01` `T` `engine/crates/vaultspec-api/src/app.rs`
- `S02` `T` `engine/crates/vaultspec-session/src/app_home.rs`
- `S03` `T` `engine/crates/vaultspec-api/src/lib.rs`
- `S04` `T` `engine/crates/vaultspec-api/src/app.rs + frontend/vite-plugins/engine-dev.ts + frontend/src/testing/liveEngine.globalSetup.ts + frontend/e2e/authoring/engine.ts`
- `S05` `T` `engine/crates/vaultspec-api/src/lib.rs`
- `S06` `T` `engine/crates/vaultspec-api/src/routes/lifecycle.rs`
- `S07` `T` `engine/crates/vaultspec-cli/src/cmd/lifecycle.rs`
- `S08` `T` `engine/crates/vaultspec-cli/src/cmd/launch.rs`
- `S09` `T` `engine/crates/vaultspec-cli/src/cmd/launch.rs`
- `S10` `T` `engine/crates/vaultspec-cli/src/main.rs`
- `S11` `T` `engine/crates/vaultspec-cli/src/cmd/launch.rs`
- `S12` `T` `engine/crates/vaultspec-cli/src/cmd/launch.rs`
- `S13` `T` `engine/crates/vaultspec-api/src/lib.rs`
- `S14` `T` `frontend/src/app/onboarding/`
- `S15` `T` `engine/crates/vaultspec-api/tests/`
- `S16` `T` `engine/crates/vaultspec-api/src/provisioning/`
- `S17` `T` `engine/crates/vaultspec-cli/src/cmd/provision.rs`
- `S18` `T` `engine/crates/vaultspec-api/src/lib.rs`
- `S19` `T` `engine/crates/vaultspec-cli/src/cmd/lifecycle.rs`
- `S20` `T` `dist-workspace.toml + docs/`
- `S21` `T` `justfile + .github/workflows/`
- `S22` `T` `dist-workspace.toml`
- `S23` `T` `consumers (status seat block`
- `S23` `T` `stop`
- `S23` `T` `the launcher) read the state honestly (a starting seat reports starting`
- `S23` `T` `stop can still terminate it via the pid fallback)`
- `S23` `T` `engine/crates/vaultspec-api/src/boot.rs + engine/crates/vaultspec-api/src/discovery.rs + engine/crates/vaultspec-cli/src/cmd/lifecycle.rs`
- `S24` `T` `engine/crates/vaultspec-api/src/routes/fs_browse.rs`
- `S25` `T` `frontend/src/app/left/AddProjectDialog.tsx`
