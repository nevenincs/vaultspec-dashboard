---
tags:
  - '#exec'
  - '#dashboard-packaging'
date: '2026-07-04'
modified: '2026-07-04'
step_id: 'S15'
related:
  - "[[2026-07-04-dashboard-packaging-plan]]"
---

# dry-run the release pipeline from a branch tag and verify a produced artifact installs and serves the embedded SPA standalone in a clean directory

## Scope

- `.github/workflows/release.yml`

## Description

- Run the pipeline's build phase LOCALLY with the pinned dist 0.32.0 (`dist build` from the repo root — the same invocation the generated workflow runs per target), producing the real Windows artifact set under `target/distrib/`: `vaultspec-cli-x86_64-pc-windows-msvc.zip` (25 MB, embedded SPA), its sha256, both installers, the updater binary, and the source tarball
- Verify the artifact checksum against its sha256 file
- Install: extract the zip into a clean directory; `vaultspec --version` reports 0.1.0
- Run: serve a clean fixture workspace (git-initialised vault fixture, no `frontend/dist` reachable, `VAULTSPEC_SPA_DIR` unset) — the startup provisioning gate passes, `/health` 200, `/` serves the embedded SPA with the token bootstrap, a hashed JS asset serves as `text/javascript`, a deep link falls back to the shell, an API path answers bearer-gated JSON whose tiers carry the LIVE component handshake (`vaultspec-core 0.1.36, meets_floor: true`)
- Uninstall: stop the service, delete the install directory, confirm removal and a dead port; the only state left is the documented per-workspace `.vault/data/engine-data/`

## Outcome

The packaged artifact demonstrably installs, runs standalone, and uninstalls cleanly on Windows. The step is closed on this local verification; the remote half (pushing a tag so GitHub Actions runs the full matrix and publishes) deliberately remains, because pushing is user-gated and the release identity question is open.

## Notes

- CARRIED FORWARD (user decisions before the first remote release): (1) reconcile `engine/Cargo.toml` `repository` (wgergely) with the actual origin (nevenincs) — installer download URLs derive from it; (2) push a version tag from green main to exercise the full matrix on GitHub Actions.
- The macOS/Linux targets are exercised only by the remote matrix; local verification covers x86_64 Windows.
