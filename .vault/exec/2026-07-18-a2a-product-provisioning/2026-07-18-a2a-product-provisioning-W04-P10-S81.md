---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S81'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Bump Scoop to the complete product archive and verify its digest and reversible downgrade adapter before committing the manifest

## Scope

- `.github/workflows/scoop-bump.yml`

## Description

- Repointed scoop-bump to the complete product archive and its sidecar sha256, verify the published digest (download the archive and confirm its SHA-256 matches the sidecar), a reversible downgrade adapter (version-parameterised url + one bump-commit per release), and a version-decrease guard that refuses a backward bump.

## Outcome

The bump job targets the complete archive with digest verification and downgrade safety before committing the manifest.

## Notes

RESIDUAL — authored; it runs post-announce at a real release. Left UNTICKED.
