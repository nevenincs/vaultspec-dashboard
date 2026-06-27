---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S22'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---

# Wire lineage positions into the field layout path behind a representation mode

## Scope

- `frontend/src/scene/field/fieldAssembly.ts`

## Description

## Outcome

Lineage positions wire into the field via `fieldAssembly.applyRepresentationMode` (W03.P08): the dispatcher's lineage seed is set on the layout and FA2 stopped, behind the `set-representation-mode` command.

## Notes
