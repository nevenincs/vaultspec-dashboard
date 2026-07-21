---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S66'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Acquire only build-time artifacts by exact pinned identity and stage the SPA without creating any runtime network dependency

## Scope

- `.github/release-build-setup.yml`

## Description

- Authored the release build setup that acquires only build-time artifacts by exact pinned identity and stages the SPA with no runtime network dependency.

## Outcome

The build-setup pins its inputs and stages the SPA offline.

## Notes

RESIDUAL — authored; the real proof is a release-CI run on a clean runner, not yet executed. Left UNTICKED.
