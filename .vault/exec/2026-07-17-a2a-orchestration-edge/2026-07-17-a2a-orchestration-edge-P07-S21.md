---
tags:
  - '#exec'
  - '#a2a-orchestration-edge'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S21'
related:
  - "[[2026-07-17-a2a-orchestration-edge-plan]]"
---

# Make frontend relay resume cursor-aware and byte-bounded, latch authoritative reconciliation, and derive terminal controls only from confirmed run status

## Scope

- `frontend/src/stores/server/agent/`
- `frontend/src/stores/server/liveAdapters/`
- `frontend/src/app/agent/`

## Description

- Generate one path-safe UUID run id per deliberate submission and reuse the exact payload for one bounded lost-ack retry.
- Resume the relay from the last admitted sequence and preserve transcript state through append refetches.
- Bound transcript retention to 256 frames and 2 MiB of UTF-8 payload.
- Fence reconciliation by generation until a successful authoritative post-signal status read.
- Store reconciliation generation in first-class query data, independent of the 256-frame presentation ring and structural sharing.
- Mount one run-progress coordinator for the composer and transcript; this is one owner, not a one-request promise.
- Keep browser polling active while the relay is degraded and stop it only on authoritative terminal status.
- Derive Cancel, Dismiss, and terminal transcript posture only from same-run `TeamRunStatus`, including `archived`.

## Outcome

Reload and reconnect recover the viewing transcript without granting relay frames lifecycle authority or admitting stale status from another run. A real streamed-query test delivers a gap plus 300 frames in one pull and still triggers one coordinator-owned reconciliation after the gap frame is evicted. TypeScript passed and the final focused frontend suite passed 50 tests.

## Notes

The adversarial pass found and fixed status-request coalescing across a gap, heartbeats prematurely clearing degraded polling, cross-run `keepPreviousData` terminal authority, duplicate hook ownership, WeakMap metadata loss under TanStack structural sharing, an unresolved reconciliation waiter after timer cleanup, and invalid non-integer relay sequences. All were fixed before handoff.
