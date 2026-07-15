---
tags:
  - '#exec'
  - '#workspace-picker-dialog'
date: '2026-07-15'
modified: '2026-07-15'
step_id: 'S02'
related:
  - "[[2026-07-15-workspace-picker-dialog-plan]]"
---




# Add per-entry is_hidden (dotname or OS hidden attribute), the hidden request param (default false, applied pre-cap), and the q name-filter param (applied pre-cap), with unit tests for cap-after-filter and stated truncation

## Scope

- `engine/crates/vaultspec-api/src/routes/fs_browse.rs`

## Description

- Add per-entry `is_hidden`: a dot-prefixed name on every platform, or the OS hidden attribute on Windows (metadata read within the existing per-row probe ceiling)
- Add the `hidden` request param (default false): hidden entries are excluded BEFORE the row cap so the visible level is never starved by dotfolder noise
- Add the `q` request param: case-insensitive substring name filter applied BEFORE the cap, so a truncated level stays filterable engine-side (filtering law)
- Unit tests: hidden excluded by default and included under the flag, q narrows pre-cap on an over-cap directory, existing sort/cap/truncation behavior preserved

## Outcome

`GET /fs/list` serves the ADR D4 narrowing truth engine-side. Executed by the delegated engine executor; verified in-session: 821 vaultspec-api tests green, fmt and clippy clean.

## Notes

- None.
