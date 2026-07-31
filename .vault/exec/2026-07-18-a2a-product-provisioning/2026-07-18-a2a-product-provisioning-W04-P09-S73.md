---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-30'
body_hash: 'sha256:29f734721c1d665e9d2916e5f42d081bd2394bba38683ce8f2cfa5b01ccf6a4c'
step_id: 'S73'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Retain Cargo Dist for target planning, checksums, and release hosting while disabling its binary-only shell, PowerShell, MSI, and updater outputs

## Scope

- `dist-workspace.toml`

## Description

- Confirmed the already-authored disabling clauses against the live tool rather than by reading alone: the empty installer list, the disabled updater, the four-target roster, and GitHub hosting were all in place from the earlier pass.
- Pinned the checksum algorithm explicitly, so the sidecar digest both product installers fetch and compare before placing anything is part of the release contract rather than an implicit tool default.
- Corrected the retired capsule language to the bundled runtime the pipeline now builds, and noted that the pre-build hook also restores the pinned source checkout and locked freeze environment.
- Removed the plan and Step identifiers the earlier pass had embedded in the configuration comments.

## Outcome

The release tool plans four targets, emits per-artifact checksums, and hosts releases, while emitting no binary-only installer and no updater of its own. The planning command exits 0 with a sidecar digest beside every artifact.

## Notes

The checksum key is genuinely validated rather than decorative: an invalid algorithm value is rejected at configuration-parse time with an enumerated list of accepted values, which was proven directly before the key was accepted.

Planning without the dirty-allowance flag still fails on pre-existing drift between the checked-in release workflow and the tool's generated form. That file belongs to another lane and was left untouched.

Confirming this Step surfaced a defect belonging to the Cargo metadata Step: the dashboard binary itself had dropped out of the release plan entirely. It is recorded and fixed there.
