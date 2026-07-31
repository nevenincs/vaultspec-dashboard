---
tags:
  - '#exec'
  - '#distribution-channels'
date: '2026-07-08'
modified: '2026-07-08'
body_hash: 'sha256:1029dc9db41a366d05eb3a9f244aa999fe228e6cbe793f8f212791eaed881dae'
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
