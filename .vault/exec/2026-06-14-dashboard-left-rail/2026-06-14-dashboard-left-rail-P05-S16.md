---
tags:
  - '#exec'
  - '#dashboard-left-rail'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S16'
related:
  - "[[2026-06-14-dashboard-left-rail-plan]]"
---




# Prove the read-only law has no fetch or mutation escape hatch in the rail

## Scope

- `frontend/src/app/left/`

## Description

- Add read-only-law assertions in `LeftRail.render.test`: scan every rail button for forbidden git/disk/vault mutation vocabulary (none present) and assert a filter change issues no wire request (transport spy).

## Outcome

The read-only law has no fetch or mutation escape hatch in the rail; committed and green.

## Notes

The no-wire assertion spies the real transport across a filter change; the mutation scan covers every button accessible name.
