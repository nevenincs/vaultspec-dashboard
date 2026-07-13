---
tags:
  - '#exec'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S04'
related:
  - "[[2026-07-12-single-app-runtime-plan]]"
---

# Cut seated discovery over to the app home service.json (retiring the workspace-local write for seated serves) while exempt no-seat serves keep the workspace-local file byte-compatible, and pass --no-seat from the dev-plugin and test-harness spawn sites

## Scope

- `engine/crates/vaultspec-api/src/app.rs + frontend/vite-plugins/engine-dev.ts + frontend/src/testing/liveEngine.globalSetup.ts + frontend/e2e/authoring/engine.ts`

## Description

- Seated serves publish discovery at the app home (`SeatGuard::home`); exempt serves publish the workspace-local file byte-compatible via `workspace_discovery_dir`.
- Seated boots also `touch` the machine launcher state (id = canonical common-dir token, label = root basename), feeding cwd-less launches.
- Pass `--no-seat` at all three frontend spawn sites: the vite dev plugin (port 8767), the vitest live-engine globalSetup, and the e2e authoring engine helper, so dev/test discovery reads are unchanged.

## Outcome

Discovery cutover complete: machine discovery for the seat, workspace-local for exempt serves; dev plugin and test harness spawn unseated and keep their existing read paths.

## Notes

The dev plugin's startup log line now prints the exact spawned arg set.
