---
tags:
  - '#exec'
  - '#dashboard-packaging'
date: '2026-07-04'
modified: '2026-07-04'
related:
  - "[[2026-07-04-dashboard-packaging-plan]]"
---

# `dashboard-packaging` `P03` summary

All five steps closed. The repo now has a pinned dist 0.32.0 release pipeline: `dist-workspace.toml` at the repo root (`members = ["cargo:engine"]`) declaring five targets, shell + powershell installers, per-artifact checksums, GitHub Releases hosting, `features = ["embed-spa"]`, an injected frontend pre-build on every build job, `pr-run-mode = "plan"`, and the user-invoked-only updater with install receipts (D5). Both verification workflows now read the `rust-toolchain.toml` pin explicitly, closing a real drift (the toolchain action's `RUSTUP_TOOLCHAIN` export silently overrode the file, so CI floated on stable).

- Created: `dist-workspace.toml`, `.github/workflows/release.yml` (generated), `.github/workflows/release-build-setup.yml`
- Modified: `engine/Cargo.toml` (`[profile.dist]`), `.github/workflows/engine-ci.yml`, `.github/workflows/quality-gates.yml`

## Description

Commit `c92a9d1d31` (S11-S15). Verification (the packaged-product proof): a local `dist build` - the same invocation the workflow runs - produced the real Windows artifact set; the zip checksum verified; the extracted `vaultspec.exe` (25 MB, SPA embedded) reported 0.1.0, served a clean fixture workspace standalone (embedded index with token bootstrap, correct asset MIME, deep-link fallback, bearer-gated API JSON whose tiers carried the live component handshake), and uninstalled cleanly (processes stopped, directory removed, port dead, only the documented per-workspace engine-data left).

Carried forward as user decisions: reconcile the `engine/Cargo.toml` `repository` field (wgergely) with the actual release host (all other evidence says nevenincs) - installer URLs derive from it - and push a version tag from green main to exercise the full remote matrix. Publishing is gated by process (tag green main; PRs validate release config via plan mode), the standard dist posture, since dist exposes no seam to `needs:` separately-triggered workflows.
