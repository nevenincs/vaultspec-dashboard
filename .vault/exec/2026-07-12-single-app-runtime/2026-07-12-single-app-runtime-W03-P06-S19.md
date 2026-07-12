---
tags:
  - '#exec'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S19'
related:
  - "[[2026-07-12-single-app-runtime-plan]]"
---

# Add the update verb ordering stop, receipt-gated axoupdater, relaunch, refusing when the receipt marks a package-manager install and never auto-updating

## Scope

- `engine/crates/vaultspec-cli/src/cmd/lifecycle.rs`

## Description

- Add `vaultspec update` (`cmd/lifecycle.rs`): refuse (with the manager's own remediation) when the dist axoupdater sidecar is absent (package-manager install), else stop the seat, run the sidecar as a bounded + output-capped subprocess (10 min / 1 MiB), and relaunch detached only if a seat had been running.

## Outcome

Receipt-gated self-update orders stop → update → relaunch; never auto-updates.

## Notes

dist already ships `install-updater = true`, so the sidecar/receipt contract needed no pipeline change.
