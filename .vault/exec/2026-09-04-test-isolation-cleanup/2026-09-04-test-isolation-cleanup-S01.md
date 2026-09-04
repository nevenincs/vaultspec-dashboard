---
tags:
  - '#exec'
  - '#test-isolation-cleanup'
date: '2026-09-04'
modified: '2026-09-04'
body_schema: 'body-v2'
body_hash: 'sha256:7381916bcad651329aa2888f17e55f299d6fb9cbd766523e9ae41da35a6bdac3'
step_id: 'S01'
related:
  - "[[2026-09-04-test-isolation-cleanup-plan]]"
---

# Add the global unmount barrier setup file and register it after the live-engine setup file

## Scope

- `frontend/vite.config.ts`

## Changes

- `A` `frontend/src/testing/rtlCleanup.ts`
- `M` `frontend/vite.config.ts`
