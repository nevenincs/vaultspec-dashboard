---
tags:
  - '#exec'
  - '#dashboard-packaging'
date: '2026-07-04'
modified: '2026-07-04'
step_id: 'S18'
related:
  - "[[2026-07-04-dashboard-packaging-plan]]"
---

# repair the stale prod namespace reference in the ci recipe

## Scope

- `justfile`

## Description

- Replace `just prod vault check all` in `_ci-run` (no `prod` namespace exists anywhere in the justfile) with `uv run vaultspec-core vault check all`, matching the invocation convention already used by `_dev-fix-vault`.
- Confirm `just -n _ci-run` prints the corrected three-line pipeline and `just --summary` still parses the whole justfile.
- Confirm `vaultspec-core vault check all` is a real subcommand.

## Outcome

`_ci-run` now reads: `just dev lint all`, `uv run vaultspec-core vault check all`, `just dev test all`. `just -n _ci-run` echoes the corrected commands; `just --summary` parses cleanly. Re-read the justfile immediately before editing (per hand-off note about a concurrent executor adding a build recipe) and confirmed no conflicting change had landed; touched only the `_ci-run` recipe body.

## Notes

No incidents.
