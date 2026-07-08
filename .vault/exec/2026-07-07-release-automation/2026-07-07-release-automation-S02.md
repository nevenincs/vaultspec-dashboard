---
tags:
  - '#exec'
  - '#release-automation'
date: '2026-07-07'
modified: '2026-07-07'
step_id: 'S02'
related:
  - "[[2026-07-07-release-automation-plan]]"
---

# seed the manifest at the current workspace version for the engine path

## Scope

- `.release-please-manifest.json`

## Description

- Seed `.release-please-manifest.json` with `{"engine": "0.1.0"}`, the current `engine/Cargo.toml` workspace version

## Outcome

Manifest validates against the published manifest schema.

## Notes

- None.
