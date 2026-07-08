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
- Review correction: the step row's "binstall metadata" is NOT delivered in v1 - `vaultspec-cli` is not on crates.io, so `cargo binstall vaultspec-cli` cannot resolve, no binstall installer or metadata exists, and the README's binstall line was removed in revision. Enabling binstall (crates.io publish or explicit metadata + the binstall installer) is a deliberate follow-up, not a v1 artifact.
- Review revision: `engine/Cargo.toml` `repository` was corrected to `github.com/nevenincs/vaultspec-dashboard` - releases publish to the repo the workflow runs in (nevenincs, matching origin and the README), and dist derives installer download URLs from this field, so the wgergely value would have 404'd both installer one-liners at the first tag. User veto welcome if wgergely is the intended public home.
