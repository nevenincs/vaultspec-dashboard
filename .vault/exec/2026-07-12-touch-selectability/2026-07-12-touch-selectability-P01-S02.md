---
tags:
  - '#exec'
  - '#touch-selectability'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S02'
related:
  - "[[2026-07-12-touch-selectability-plan]]"
---




# Route the background empty-space handler through the same selection-guard clause so future text-bearing background surfaces inherit it

## Scope

- `frontend/src/app/menus/backgroundContextMenu.ts`

## Description

- Import the selection guard into `backgroundContextMenuHandler` and yield before `preventDefault()` when a live selection reaches the background target

## Outcome

Background handler now inherits the D1 guard; all three existing node-env handler tests pass unchanged alongside the render suite.

## Notes

