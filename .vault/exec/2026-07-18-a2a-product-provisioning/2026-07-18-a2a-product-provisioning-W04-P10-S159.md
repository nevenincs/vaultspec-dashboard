---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S159'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Publish WinGet metadata only when its phase-zero matrix and complete MSI downgrade proof pass, otherwise mark WinGet unsupported and require an ADR revisit

## Scope

- `.github/workflows/release.yml`

## Description

- Authored the fail-closed WinGet publication gate: a manual-dispatch `winget-publish` workflow behind the reusable `channel-publish-gate(winget)`, so no submission runs unless WinGet is matrix-`supported` and the phase-zero proof workflow exists.

## Outcome

WinGet publication is gated fail-closed on the matrix status and the phase-zero proof.

## Notes

RESIDUAL — authored-PENDING-MSI (S76 deferred) and the cross-repo winget-pkgs submission; the phase-zero clean-machine MSI downgrade proof (S149) runs at release. Left UNTICKED.
