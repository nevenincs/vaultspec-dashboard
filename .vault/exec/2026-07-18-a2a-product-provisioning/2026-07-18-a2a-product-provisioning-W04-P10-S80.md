---
tags:
  - '#exec'
  - '#a2a-product-provisioning'
date: '2026-07-21'
modified: '2026-07-21'
step_id: 'S80'
related:
  - "[[2026-07-18-a2a-product-provisioning-plan]]"
---

# Install the complete Windows ZIP, record Scoop provenance, and expose only the dashboard command without dropping companion files

## Scope

- `bucket/vaultspec.json`

## Description

- Repointed the Scoop bucket manifest to the complete Windows product ZIP, shimming only `bin/vaultspec.exe` so the updater and capsule stay as companion files in the install directory (not dropped as commands); the all-zero placeholder hash is reconciled by scoop-bump at release.

## Outcome

The Scoop manifest targets the complete archive with the correct single-binary shim.

## Notes

RESIDUAL — authored ahead of the artifact: the placeholder hash + live publication are release-verified (never merge to the live bucket before the complete archive publishes, or Scoop 404s). Left UNTICKED. The all-zero hash is a deliberate fail-closed placeholder, never a plausible-but-wrong digest.
