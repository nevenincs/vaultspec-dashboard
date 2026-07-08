---
tags:
  - '#exec'
  - '#distribution-channels'
date: '2026-07-08'
modified: '2026-07-08'
step_id: 'S09'
related:
  - "[[2026-07-08-distribution-channels-plan]]"
---

# generate the nevenincs.vaultspec portable-zip manifests with komac and submit the winget-pkgs PR, recording the submission outcome (research-record step)

## Scope

- `.vault/exec/2026-07-08-distribution-channels`

## Description

- komac 2.16 was tried first (fully flag-driven `new`), but it stalled on the Windows secure-storage keyring and then on a hidden prompt in the non-interactive shell; the manifests were authored by hand instead (schema 1.10.0: version, installer with zip + nested portable + `vaultspec` command alias + published sha256, defaultLocale)
- `winget validate --manifest` succeeded locally; `winget install --manifest` (after enabling LocalManifestFiles) downloaded the release zip and verified the hash, then stalled at the Mark-of-the-Web COM step - a non-interactive-shell limitation, not a manifest defect
- Submitted via the API path (fork `nevenincs/winget-pkgs`, branch, three contents-API puts, PR) - no multi-gigabyte clone

## Outcome

Submitted: microsoft/winget-pkgs pull request 399484 ("New package: nevenincs.vaultspec version 0.1.0"), checklist amended to claim exactly what ran (validate passed; the local install test is honestly marked incomplete with the stall reason). Now awaiting the pipeline's AV/reputation scan - the documented first-submission friction; a Defender false-positive cycle may be needed per precedent.

## Notes

- Automation (WinGet Releaser) stays deferred until this first submission merges, per the ADR.
- The interactive `winget install --manifest` test can be completed by the owner in a normal shell if desired.
