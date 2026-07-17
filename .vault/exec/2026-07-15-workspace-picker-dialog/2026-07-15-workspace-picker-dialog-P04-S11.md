---
tags:
  - '#exec'
  - '#workspace-picker-dialog'
date: '2026-07-15'
modified: '2026-07-17'
step_id: 'S11'
related:
  - "[[2026-07-15-workspace-picker-dialog-plan]]"
---

# Live-drive the redesigned dialog against a real serve on the canonical dev port (browse, filter, places, select, register, refusal states) and capture evidence

## Scope

- `frontend/ (live verification harness)`

## Description

- Drive the redesigned dialog in self-driven headless Chromium (Playwright with SwiftShader) against the canonical dev serve (SPA 8770 proxying engine 8767)
- Verify with screenshot evidence: dialog opens from the worktree dropdown's pinned row; the places rail composes Home, drives, correctly-named projects, and recents; typing an absolute path re-roots the browser with the unfinished segment applied as the engine-side filter; row click selects; the level filter narrows and clears; the hidden toggle round-trips; breadcrumbs navigate; the confirm carries the target folder's name
- Capture network truth: `/fs/list` 200 through the dev proxy with the enriched fields live
- Two live-caught defects fixed in-session: places-rail project rows all rendered "main" (raw registry labels under the worktrees layout — fixed with the shared `workspaceRootName`), and Windows drive roots served `is_hidden` true (OS attribute noise — the engine now serves roots unhidden, with a unit test)

## Outcome

The browse, places, typed-path, filter, hidden, select, and breadcrumb flows behave per the ADR against a real engine. The refusal flow is covered by the live vitest registration-rejection test (the drive script's refusal probe predated the confirm-arming refinement and clicked a disabled button — the honest disabled state, not a defect).

## Notes

- The first serve attempt collided with a parallel session's SPA on port 8770 and its failure cleanup took down the shared engine on 8767; the engine was restored immediately (`--no-seat` on the canonical port). Headless WebGL noise (three.js context warnings under SwiftShader) is unrelated to the picker.
