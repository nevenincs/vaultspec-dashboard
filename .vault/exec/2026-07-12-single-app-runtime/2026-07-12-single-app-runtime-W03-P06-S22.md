---
tags:
  - '#exec'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S22'
related:
  - "[[2026-07-12-single-app-runtime-plan]]"
---

# Ship the msi installer channel with an installer-created Start-Menu shortcut whose target is the bare binary (the app front door), delivered after the user directed the deferral executed

## Scope

- `dist-workspace.toml`

## Description

- Add `msi` to the dist installers (config exempts the customized template via `allow-dirty = ["msi"]`); `dist init` (pinned 0.32.0, installed locally) scaffolded the WiX guids and `wix/main.wxs`, and regenerated `release.yml` byte-identical.
- Customize the wxs: product and install-dir named `vaultspec`; a Start-Menu shortcut component (`ApplicationProgramsFolder/vaultspec`) whose target is the BARE binary `[!exe0]` - the app front door - with an optional deselectable feature, folder cleanup on uninstall, and an HKCU keypath.
- Add neutral `authors = ["vaultspec contributors"]` workspace metadata (the WiX generator requires it; personal identity stays in git history per project convention).
- Verify end to end in an isolated clean worktree: `dist build --artifacts local --target x86_64-pc-windows-msvc` with portable WiX 3.14 binaries produced the `.msi` + checksum, and the MSI's `Shortcut` table row was read back via the WindowsInstaller COM API (`ApplicationStartMenuShortcut | ApplicationProgramsFolder | vaultspec | [!exe0]`, ProductName `vaultspec`).

## Outcome

The MSI channel ships with an installer-created Start-Menu shortcut that opens the dashboard; install-to-double-click is one step. Delivered on user direction after the review-split deferral; the return trigger (packaging-ADR v2 MSI channel) is hereby consumed.

## Notes

Local verification needed three stagings CI does automatically: the SPA bundle at `engine/crates/vaultspec-api/assets/spa` (the embed path, not `frontend/dist`), WiX resolved via the `WIX` env root (a bare PATH prefix did not reach cargo-wix's probe), and a clean worktree because the shared tree carried a parallel session's momentarily-broken WIP. GitHub windows runners have WiX preinstalled, so the release pipeline needs none of this.
