---
tags:
  - '#exec'
  - '#dashboard-packaging'
date: '2026-07-04'
modified: '2026-07-04'
step_id: 'S20'
related:
  - "[[2026-07-04-dashboard-packaging-plan]]"
---

# author the install section covering GitHub Releases, install scripts, cargo-binstall, checksum verification, and the SmartScreen and Gatekeeper friction stated plainly

## Scope

- `README.md`

## Description

- Add an Install section: single-binary framing (`vaultspec serve` + browser), GitHub Releases downloads, the shell and powershell installer one-liners, cargo-binstall, and per-asset sha256 verification
- State the unsigned-binary friction plainly per OS: SmartScreen "Run anyway" on Windows, Gatekeeper right-click-open or `xattr -d com.apple.quarantine` on macOS, checksum-only on Linux
- Document runtime requirements (git, vaultspec-core >= 0.1.36 with the exact `uv tool install` command the startup gate itself prints, optional attach-degraded rag) and the user-invoked-only update posture (`vaultspec-update` for installer copies, package manager otherwise)
- Add the maintainers' release process: tag a green main commit; the tag triggers the dist workflow (the P03.S12 gating model)

## Outcome

`just dev lint markdown` passes on the updated README. Installer URLs are written against `github.com/nevenincs/vaultspec-dashboard`, consistent with the README's existing sibling links and the worktree origin.

## Notes

- The `engine/Cargo.toml` `repository` field still says `wgergely/vaultspec-dashboard`; dist derives installer download URLs from it, so it must be reconciled to the real release host (all in-repo evidence points at nevenincs) before the first public release — user confirmation pending.
