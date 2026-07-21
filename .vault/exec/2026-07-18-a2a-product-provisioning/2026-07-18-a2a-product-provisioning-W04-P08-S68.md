---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S68'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Compose and retain the Intel macOS dashboard, updater, and A2A capsule as one verified release-set artifact

## Scope

- `.github/workflows/release.yml`

## Description

- Authored the Dist-safe product-release compose-and-retain job for the Intel macOS target: build the dashboard + updater, fetch and verify the pinned A2A capsule against the component lock, compose and self-verify the complete tree through the S06 authority, and archive it as one verified release-set artifact plus its sha256. Covered by the five-target matrix in the product-release workflow.

## Outcome

The Intel macOS compose is wired in the product-release workflow.

## Notes

RESIDUAL — authored; the real proof is a release-CI run on a clean runner, which additionally needs the cross-repo A2A capsule source (`A2A_CAPSULE_BASE_URL`). Left UNTICKED.
