---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S77'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Build the product-owned MSI and installer scripts, publish only complete artifacts, and fail on any stale binary-only installer or updater

## Scope

- `.github/workflows/release.yml`

## Description

- Authored the product-release publish path: build the product-owned installers, publish only complete artifacts, and fail on any stale binary-only installer or updater.

## Outcome

The publish path is wired in the Dist-safe product-release workflow.

## Notes

RESIDUAL — the MSI build is deferred (WiX absent on this box, S76), and the real proof is a release-CI run. Left UNTICKED.
