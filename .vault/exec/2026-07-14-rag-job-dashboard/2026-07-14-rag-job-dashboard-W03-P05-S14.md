---
tags:
  - '#exec'
  - '#rag-job-dashboard'
date: '2026-07-14'
modified: '2026-07-17'
step_id: 'S14'
related:
  - "[[2026-07-14-rag-job-dashboard-plan]]"
---

# Re-anchor the retired console composition tests onto the dashboard regions and extend the panel guards

## Scope

- `frontend/src/app/panels`

## Description

## Outcome

## Notes

## Description

- Delete `RagOpsConsole.tsx` outright (ZERO code consumers after the W02 swap; no test file existed; figma:names stays green and the dashboard carries its own binding citation) - no bridge.
- Retire the now-orphaned `rag-ops:details` section id (the console was its only consumer); rail suite asserts it normalizes to null.
- Add the ControlPanels guard: the search-service panel renders the dashboard shell + all three regions, the retired console fold is absent, and nothing mounts while closed.

## Outcome

Green. Executed by rag-hardening-coder; verified independently.

## Notes

Figma inventory docs (frontend/figma/FRAMES.md) still list the retired console node 879:4125 - a docs-only cleanup flagged for the closing pass, not enforced by any gate.
