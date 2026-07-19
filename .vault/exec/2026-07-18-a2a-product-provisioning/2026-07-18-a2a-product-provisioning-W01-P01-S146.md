---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S146'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Declare the explicit five-target by channel support matrix with payload type, installer authority, updater authority, downgrade path, rollback path, and unsupported reason

## Scope

- `packaging/a2a-support-matrix.json`

## Description

- Authored `packaging/a2a-support-matrix.json`: the explicit five-target by channel
  matrix (self-install, msi, scoop, winget, cargo-binstall, cargo-install), each
  entry carrying `support_status`, `payload_type`, `installer_authority`,
  `updater_authority`, `downgrade_path`, `rollback_path`, and `unsupported_reason`.
- Grounded every value in the ADR D2 channel model: self-install → complete product
  tree, external-updater-owned activation/rollback; MSI → product-owned WiX;
  scoop → complete Windows ZIP, winget → complete MSI, both manager-owned via a
  two-phase adapter; bare cargo channels unsupported (binary-only, no release-set
  guarantees).
- Marked the two package-manager channels (scoop/winget, Windows only)
  `feasibility_gated` — their support is contingent on the phase-zero clean-machine
  proof (S147/S149) that S148 gates on; non-applicable channels are `unsupported`
  with a platform reason.

## Outcome

The dashboard now declares its authoritative composite-product channel support, so a
channel is presented as supported only where the release set, receipt, verification,
update, and removal guarantees hold. Verified programmatically: 5 targets × 6
channels, every entry carries all seven fields, every `unsupported` carries a reason
and every `supported`/`feasibility_gated` carries non-null installer/updater
authority and downgrade+rollback paths. 6 supported (self-install on all five
targets + MSI on Windows), 2 feasibility-gated (scoop/winget on Windows), the rest
unsupported-with-reason. S148 will gate the two gated channels on the S147/S149 CI
feasibility results.

## Notes

Authored as a self-contained data artifact (like the S03 component lock and S04
release-set schema) while the phase's Rust executor pipeline was unavailable. The
phase-zero CI feasibility workflows (S145/S147/S149) require clean-machine
package-manager runs that only execute on CI runners, not in-session.
