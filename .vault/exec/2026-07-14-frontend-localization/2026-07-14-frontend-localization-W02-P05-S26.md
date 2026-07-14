---
tags:
  - '#exec'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
step_id: 'S26'
related:
  - "[[2026-07-14-frontend-localization-plan]]"
---

# Migrate graph and panel navigation shortcuts

## Scope

- `frontend/src/app/stage/graphWalkKeybindings.ts`
- `frontend/src/app/stage/graphWalkKeybindings.test.ts`
- `frontend/src/app/stage/graphWalkKeybindings.localization.test.ts`
- `frontend/src/stores/view/graphToggleKeybindings.ts`
- `frontend/src/stores/view/graphToggleKeybindings.localization.test.ts`
- `frontend/src/app/chrome/regionCycleKeybindings.ts`
- `frontend/src/app/chrome/regionCycleKeybindings.localization.test.ts`
- `frontend/src/locales/en/common.ts`
- `frontend/src/locales/en/graph.ts`
- `frontend/src/locales/en/index.ts`
- `frontend/src/localization/catalogKeys.test.ts`
- `frontend/src/localization/messagePolicy.ts`
- `frontend/src/localization/testing/resources.ts`
- `frontend/scripts/localization-allowlist.json`

## Description

- Replace graph-walk, graph-visibility, and panel-cycle shortcut presentations with typed catalog descriptors.
- Add a graph localization namespace and shared common shortcut concepts.
- Reuse canonical descriptors across each binding and its action resolver.
- Preserve stable shortcut-list wording while retaining live state-aware graph action wording.
- Remove fourteen obsolete localization exemptions without adding new ones.

## Outcome

Graph and panel navigation shortcuts now use concise catalog-owned language without exposing node or implementation terminology. Physical shortcut identities, graph traversal behavior, live graph visibility actions, and focus-region cycling remain unchanged. The scanner baseline decreased from 1,445 to 1,431 findings.

## Verification

- `just dev lint frontend`
- Seven focused Vitest files, 35 tests
- Independent Sol review approved with no findings

## Notes

The initial graph expansion wording exceeded the global six-word action limit. The architecture review shortened it to `Expand focused item into working set`, preserving meaning without weakening the shared policy.
