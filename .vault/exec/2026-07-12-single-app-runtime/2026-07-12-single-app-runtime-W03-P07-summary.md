---
tags:
  - '#exec'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-12'
related:
  - "[[2026-07-12-single-app-runtime-plan]]"
---

# `single-app-runtime` `W03.P07` summary

All three Steps (S23-S25) complete, committed as `ec0267d94c` (engine) and `ea16d5ace6` (frontend).

- Modified: `engine/crates/vaultspec-api/src/boot.rs`, `engine/crates/vaultspec-api/src/app.rs`, `engine/crates/vaultspec-api/src/discovery.rs`, `engine/crates/vaultspec-cli/src/cmd/lifecycle.rs`, `frontend/src/app/left/AddProjectDialog.tsx`, shared stores adapter files
- Created: `engine/crates/vaultspec-api/src/routes/fs_browse.rs`, `frontend/src/app/left/FolderBrowser.tsx`, `frontend/src/stores/server/queries/fsBrowse.ts` (each with tests)

## Description

Deferral closure (user directive: every recorded deferral driven to completion). The starting-state discovery record publishes the moment the port binds - bearer minted pre-index, heartbeat fresh through the whole cold index, flipped to ready before serving - so status reports an indexing seat as starting and stop can terminate one via the pid fallback; live-verified starting-to-ready on a real cold index. ADR option O6 closed end to end: the bounded bearer-gated /fs/list route (roots + one subdirectory level, stated 256-row cap, managed/git markers) plus the FolderBrowser drill-down picker composed into the add-project flow, retiring typed-path-only entry for first-run onboarding and the project switcher alike.
