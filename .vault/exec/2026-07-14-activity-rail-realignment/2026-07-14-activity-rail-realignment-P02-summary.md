---
tags:
  - '#exec'
  - '#activity-rail-realignment'
date: '2026-07-14'
modified: '2026-07-14'
related:
  - '[[2026-07-14-activity-rail-realignment-plan]]'
---
# `activity-rail-realignment` `P02` summary

## Description

Stores and action plane, executed by the named Opus coder rail-stores-coder (S04-S06): the non-persisted modal single-open panel store; the served framework-status chip projection composed from interpreted selectors only (status rollup, core vault health, rag status, review-station queue); four palette-enrolled panel toggle descriptors with extended coverage guards. Palette-only by convention (the Settings analogue carries no chord).

- Created: `frontend/src/stores/view/controlPanels.ts` (+test), `frontend/src/stores/server/queries/frameworkStatus.ts` (+test), `frontend/src/stores/view/commandProviders/controlPanelsCommandProvider.ts`
- Modified: `frontend/src/stores/view/chromeActions.ts`, `frontend/src/app/menus/registerAllCommands.ts`, `frontend/src/stores/server/queries/index.ts`, action-coverage + palette guards

## Verification

33 tests green across the four suites; tsc/eslint/prettier clean; verified independently by the orchestrator. Committed as 621e209022.
