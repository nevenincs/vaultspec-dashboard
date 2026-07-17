---
tags:
  - '#exec'
  - '#workspace-picker-dialog'
date: '2026-07-15'
modified: '2026-07-17'
step_id: 'S04'
related:
  - "[[2026-07-15-workspace-picker-dialog-plan]]"
---

# Carry a typed machine reason (not_a_directory, not_a_git_workspace, already_registered, unreadable) in the add_workspace refusal envelope beside the human message, with route tests

## Scope

- `engine/crates/vaultspec-api/src/routes (session add_workspace seam)`

## Description

- Ride the existing typed-error convention (`error_kind`, the dashboard-settings precedent) rather than a new `reason` field - corrected mid-flight when grounding surfaced the convention
- Emit `not_a_directory`, `not_a_git_workspace`, and `unreadable` from the `add_workspace` refusal sites in the registry route, each beside the human message, through the shared `api_error_kind` envelope helper (tiers preserved on every error)
- Route tests assert each kind serializes in the refusal envelope

## Outcome

`add_workspace` refusals are machine-classifiable. The client's `classifyAddWorkspaceError` (stores layer) maps `errorKind` to the friendly copy; the old message-regex mapper is deleted with no bridge (ADR D6).

## Notes

- `already_registered` exists in the vocabulary and its serialization test, but no site emits it: re-adding a registered path is an idempotent no-op by the registry ADR, and the picker's `is_registered` marker prevents the attempt. This is an honest deviation from a literal reading of D6, recorded here.
