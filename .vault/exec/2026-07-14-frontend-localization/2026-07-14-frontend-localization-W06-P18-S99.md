---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-17'
modified: '2026-07-17'
step_id: 'S99'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Delete superseded English label maps after their catalog replacements land

## Scope

- `frontend/src/app/chrome/regionCycleKeybindings.ts`
- `frontend/src/app/stage/graphWalkKeybindings.ts`
- `frontend/src/stores/server/queries/status.ts`
- `frontend/src/stores/view/commandPalette.ts`

## Description

Verify-and-record satisfied-as-found: the four grep candidates named as potential
superseded English label maps are already typed `MessageDescriptor` maps, not raw
English string maps:

- `REGION_CYCLE_NEXT_LABEL`/`REGION_CYCLE_PREV_LABEL`
  (`regionCycleKeybindings.ts`) — `{ key: "common:actions.moveTo{Next,Previous}Panel" }`.
- `GRAPH_WALK_NEXT_LABEL`/`GRAPH_WALK_PREVIOUS_LABEL` (`graphWalkKeybindings.ts`)
  — `{ key: "graph:actions.moveTo{Next,Previous}ConnectedItem" }`.
- `SYSTEM_ROW_LABELS` (`stores/server/queries/status.ts`) — a
  `Record<string, MessageDescriptor>` keyed to `common:systemStatus.labels.*`.
- `COMMAND_PALETTE_SHORTCUT_LABEL` (`stores/view/commandPalette.ts`) —
  `{ key: "common:actions.openCommandPalette" }`.

No raw-string label map remains anywhere in `src/` for this step to delete.

## Outcome

The step's premise (a superseded English label map awaiting deletion) does not
hold at this point in the campaign — the catalog migration already replaced every
candidate with a typed descriptor. Nothing to delete; the invariant this step
protects already holds.

## Notes

This record was authored during a fill pass reconciling the P18 sweep results
reported by the team lead — no code changes by me.

Independently reverified, not relayed: grepped `src/` for each of the four named
symbols directly and read each definition site, confirming every one resolves to
a `MessageDescriptor`/`{ key: ... }` shape, not a `Record<string, string>`.
