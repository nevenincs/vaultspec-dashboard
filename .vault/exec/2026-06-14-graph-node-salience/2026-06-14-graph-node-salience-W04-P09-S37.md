---
tags:
  - '#exec'
  - '#graph-node-salience'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S37'
related:
  - "[[2026-06-14-graph-node-salience-plan]]"
---




# Add the lens parameter to the engine graphQuery adapter request body so the wire client sends the active lens

## Scope

- `frontend/src/stores/server/engine.ts`

## Description


## Outcome

Added lens and focus to the engine graphQuery adapter request body so the wire client sends the active lens. Extended EngineNode with the optional salience float and GraphSlice with lens + salience_partial, all snake_case as served.

## Notes

