---
tags:
  - '#exec'
  - '#dashboard-platform'
date: '2026-06-13'
modified: '2026-07-12'
body_hash: 'sha256:73de9e1d91906c14c2ade198c59c3fb154e05467eb1e9b260c8ca9406be073f6'
step_id: 'S01'
related:
  - "[[2026-06-13-dashboard-platform-plan]]"
---

# Implement the leveled, namespaced ring-buffer logger with a pluggable sink array

## Scope

- `frontend/src/platform/logger/logger.ts`

## Description

- Implemented the leveled logger (`trace`/`debug`/`info`/`warn`/`error`, mirroring
  the engine's tracing vocabulary) with a per-level rank gate.
- Added the namespaced child logger: `child(ns)` dot-joins and shares the root's
  sink registry and min-level via a shared core object.
- Implemented `RingBufferSink` (bounded FIFO, oldest-evicted, copy-on-snapshot) as
  the always-on default sink, plus `ConsoleSink` mapping each level to the matching
  console method (the one sanctioned console boundary).
- Made sink fan-out fault-isolating: a throwing sink is swallowed so it cannot
  starve siblings or break the caller.
- Added `serializeError` (structured, never the live Error), `ingest` for foreign
  records (the worker-bridge entry point), and a `createLogger` factory for isolated
  instances.
- Exported the app-wide root `logger` and the shared `ringBuffer` (dev overlay /
  correlation read surface); dev installs `[ringBuffer, ConsoleSink]`, prod
  `[ringBuffer]` at `info`.

## Outcome

`src/platform/logger/logger.ts` lands the observability spine. 14 unit tests cover
level gating, runtime re-gating, namespacing, field/error handling, ring-buffer
eviction and snapshot immutability, sink fan-out isolation, and `ingest` gating -
all green. No upward imports (ADR D1 honored).

## Notes

The `ConsoleSink` deliberately calls `console.*`; lint does not ban console, and the
sink is the single boundary the `no-raw-console-use-the-platform-logger` codification
candidate carves out. No scaffolds left.
