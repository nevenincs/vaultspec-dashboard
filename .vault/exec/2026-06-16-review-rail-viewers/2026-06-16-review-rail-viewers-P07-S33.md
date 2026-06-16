---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S33'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---




# Run the full frontend lint gate and the engine fmt-plus-clippy gate to exit 0 including prettier format:check and tsc

## Scope

- `frontend/package.json`

## Description

- Run the full frontend lint gate (`just dev lint frontend`): eslint, prettier format:check, tsc, token-drift, and the figma-registry check all exit 0; the four new viewer components were synced into the figma component map.
- Run the engine gate: `cargo fmt --check` and `cargo clippy --all-targets` both exit 0 for the new content route.

## Outcome

Both gates are green. The full frontend test suite (1302 passed) and the vaultspec-api test suite (all passed, including the 5 content-route tests) are green.

## Notes

The full frontend gate includes a figma-registry check; the four new viewer components were registered via the sync verb.
