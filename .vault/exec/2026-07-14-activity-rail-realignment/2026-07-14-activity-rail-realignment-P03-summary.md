---
tags:
  - '#exec'
  - '#activity-rail-realignment'
date: '2026-07-14'
modified: '2026-07-14'
related:
  - '[[2026-07-14-activity-rail-realignment-plan]]'
---
# `activity-rail-realignment` `P03` summary

## Description

Chrome, executed by the named Opus coder rail-chrome-coder (S07-S11): the pinned footer `FrameworkStatusCluster` (one FocusZone stop, descriptor-dispatching chips), the `ControlPanels` host (four mount-gated Dialogs re-mounting the console and review-station bodies unchanged), the two new health panel bodies over served rollups, and the rail eviction (StatusTab status-only; `rag-ops`/`authoring-review` ids retired, `rag-ops:details` kept for the re-mounted console fold). The desktop rail scroll moved onto the panel div to make the pin possible (deliberate, flagged shellLayout edit).

- Created: `frontend/src/app/right/FrameworkStatusCluster.tsx` (+render test), `frontend/src/app/panels/ControlPanels.tsx`, `BackendHealthPanel.tsx`, `VaultHealthPanel.tsx` (+derive tests)
- Modified: `frontend/src/app/AppShell.tsx`, `frontend/src/app/right/StatusTab.tsx`, `frontend/src/stores/view/statusTabChrome.ts`, `frontend/src/stores/view/shellLayout.ts`

## Verification

36 tests green (cluster render, panel derive, rail suite, panel store); tsc/eslint/prettier clean; verified independently. Committed as a78e241414. Honest gaps recorded in S09/S05 records: no served per-tier reasons beyond semantic; approvals count suppressed under truncation.
