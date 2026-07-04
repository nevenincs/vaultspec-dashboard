---
tags:
  - '#exec'
  - '#dashboard-packaging'
date: '2026-07-04'
modified: '2026-07-04'
step_id: 'S11'
related:
  - "[[2026-07-04-dashboard-packaging-plan]]"
---

# run dist init and commit the pinned dist configuration (win, macos, linux targets, shell and powershell installers, binstall metadata, checksums, GitHub Releases hosting, install receipts, user-invoked updates only)

## Scope

- `dist-workspace.toml`

## Description

- Run `dist init` (dist 0.32.0, downloaded from the official GitHub release) and place `dist-workspace.toml` at the REPO ROOT with `members = ["cargo:engine"]` — CI invokes dist from the checkout root, so the config must resolve the cargo workspace from there
- Pin `cargo-dist-version = "0.32.0"`; targets x86_64/aarch64 macOS, x86_64/aarch64 Linux, x86_64 Windows; shell + powershell installers; GitHub Releases hosting; per-artifact sha256 checksums
- Set `install-updater = true` (D5: installers write receipts; the standalone `vaultspec-update` is user-invoked only), `features = ["embed-spa"]` (D2), `github-build-setup` for the frontend pre-build, and `pr-run-mode = "plan"`
- `dist init` also added the standard `[profile.dist]` (thin-LTO release profile) to `engine/Cargo.toml`

## Outcome

`dist plan` resolves the full artifact set from the repo root: per-target archives carrying the `vaultspec` binary, checksums, both installers, per-target updater binaries, and the source tarball. `just dev lint toml` passes with the new file included.

## Notes

- Artifacts are named `vaultspec-cli-<triple>` after the package while the binary inside is `vaultspec`; acceptable for v1, renameable later only by renaming the package.
- binstall metadata: cargo-binstall natively understands dist-produced artifact layouts, so no explicit `[package.metadata.binstall]` block was added; verify on first release and add the block only if detection fails.
- `engine/Cargo.toml` carries `repository = github.com/wgergely/vaultspec-dashboard` while the worktree origin is `github.com/nevenincs/vaultspec-dashboard`; installer download URLs derive from that field, so the identity MUST be reconciled before the first public release (carried to the phase summary as a user decision).
