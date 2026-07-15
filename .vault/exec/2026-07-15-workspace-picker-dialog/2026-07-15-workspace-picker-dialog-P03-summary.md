---
tags:
  - '#exec'
  - '#workspace-picker-dialog'
date: '2026-07-15'
modified: '2026-07-15'
related:
  - "[[2026-07-15-workspace-picker-dialog-plan]]"
---




# `workspace-picker-dialog` `P03` summary

Phase complete: 4/5 Steps closed in-phase (S06-S09); the gate Step S10 closed at
P04 once the review revisions landed.
- Modified: `frontend/src/stores/server/engine/graphTypes.ts`, `client.ts`,
  `liveAdapters/listings.ts`, `queries/internal.ts`, `queries/fsBrowse.ts`,
  `queries/workspaces.ts`, `stores/addProjectIssue.ts`
- Modified: `frontend/src/app/chrome/Dialog.tsx`,
  `frontend/src/app/left/FolderBrowser.tsx`, `AddProjectDialog.tsx`
- Created: `frontend/src/app/left/PickerPlacesRail.tsx`,
  `FolderBrowser.interaction.test.tsx`,
  `frontend/src/localization/testing/pickerResources.ts`
- Modified: the localization plane for the new keys (`locales/en/projects.ts`,
  `messagePolicy.ts`, `catalogKeys.test.ts`, testing resources, three
  content-addressed scanner allowlist entries)

## Description

Rebuilt the dialog on the enriched projection per ADR D1-D5: select-then-confirm
browser as the full dialog body roving through the shared FocusZone, clickable
breadcrumbs with focus preserved across every navigation path, the places rail
(Home, drives, registered projects via the shared `workspaceRootName`, recents),
the engine-side level filter and hidden toggle, and the unified path field whose
typing re-roots the browser with the unfinished segment as the engine-side
filter (with an error-driven ancestor retreat and an Enter exact-match
completion). Refusals render friendly localized copy classified from the typed
`error_kind`; the message-regex mapper is gone. The picker body is mount-gated.
Two user-directed refinements landed during execution: a static "Pick folder"
confirm (ADR D1 amended) and a Phosphor CaretRight row chevron.

This phase was co-developed in real time with the parallel localization
campaign (they migrated, hardened, and extended the same files as they landed);
all reconciliation is recorded in the Step records.

Verification: tsc, eslint, prettier, and the localization scanner clean; the
picker-scoped live-wire suite green (215 tests across the picker and
localization-contract files at phase close).
