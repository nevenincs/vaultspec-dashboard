---
tags:
  - '#exec'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-12'
step_id: 'S09'
related:
  - "[[2026-07-12-single-app-runtime-plan]]"
---

# Implement the launcher flow: resolve the target workspace (cwd inside a workspace wins, else last-active from launcher state, else none), probe the seat running-predicate (discovery freshness plus health plus live pid), spawn vaultspec serve detached (CREATE_NO_WINDOW or DETACHED_PROCESS on Windows, session-detached on unix) with a bounded discovery wait, then open the browser and exit

## Scope

- `engine/crates/vaultspec-cli/src/cmd/launch.rs`

## Description

- Implement `open_app` in `engine/crates/vaultspec-cli/src/cmd/launch.rs`: workspace resolution (cwd's containing vault-bearing worktree via the same git discovery serve boots with; else launcher-state last-active; else none), the seat running-predicate (discovery + fresh heartbeat + live health), detached spawn (`DETACHED_PROCESS|CREATE_NO_WINDOW`, null stdio) with a bounded 30 s discovery wait, then browser open and exit.
- No workspace anywhere spawns from the app home so serve boots the D4 onboarding surface.

## Outcome

The attach-or-spawn launcher flow is complete and consumed by both bare invocation and the open verb.

## Notes

Attach-path latency is one discovery read + one health probe; the double-clicked console closes in under a second on attach.
