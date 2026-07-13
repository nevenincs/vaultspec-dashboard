---
tags:
  - '#exec'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S05'
related:
  - "[[2026-06-14-dashboard-workspace-registry-plan]]"
---

# Roundtrip-test registry persistence and corrupt-store recreation

## Scope

- `engine/crates/vaultspec-session/tests/`

## Description

- Add an integration test file exercising the registry through the public handle over the real on-disk SQLite store: order, reachability, and active-workspace selection all survive a reopen cycle.
- Add an idempotency test proving auto-register on reboot does not re-seed, reorder, or duplicate the launch root.
- Add a forget test proving the last-launch-root refusal and sibling removal across the real store.
- Add a corruption test proving a garbage db file recreates an empty registry without panic and that a re-launch re-seeds the launch root.

## Outcome

Registry persistence and corrupt-store recreation are proven against the real adapter with no mocks or doubles. All session-crate tests pass (15 unit, 4 registry integration, 3 store integration), and clippy is clean with warnings denied.

## Notes

The tests record, select, and forget registry rows only; they never touch any repository on disk, consistent with the registry-is-config-not-content posture.
