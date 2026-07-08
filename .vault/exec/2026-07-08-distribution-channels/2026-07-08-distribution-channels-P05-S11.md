---
tags:
  - '#exec'
  - '#distribution-channels'
date: '2026-07-08'
modified: '2026-07-08'
step_id: 'S11'
related:
  - "[[2026-07-08-distribution-channels-plan]]"
---

# verify a real scoop install and uninstall from the in-repo bucket on this machine

## Scope

- `bucket/vaultspec.json`

## Description

- Add THIS worktree as a scoop bucket (`scoop bucket add vaultspec-test <path>` - scoop clones the repo and finds `bucket/`), install, run, uninstall, remove the bucket

## Outcome

Real end-to-end pass on this machine: scoop downloaded the PUBLISHED v0.1.0 zip from GitHub Releases, the hash check passed against the seeded manifest, the `vaultspec` shim reported 0.1.0, and uninstall removed the shim cleanly.

## Notes

- The local-path bucket clones the checked-out branch, which is exactly what made pre-merge verification possible; end users add the repo URL (default branch) once this merges.
