---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-07-12'
body_hash: 'sha256:4f8384df9f2260fbad1f9ee60e2efb99f00e202d915d7b61315f0cc082dba0f7'
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
