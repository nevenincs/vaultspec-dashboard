---
tags:
  - '#plan'
  - '#test-isolation-cleanup'
date: '2026-09-04'
tier: L1
related:
  - '[[2026-09-04-test-isolation-cleanup-adr]]'
  - '[[2026-09-04-test-isolation-cleanup-research]]'
modified: '2026-09-06'
body_schema: body-v2
body_hash: 'sha256:125d4306814c70ea8fa48ac9e4eb67c82d7ad6b53759bc454b32d7fdcfcd3c11'
---

# `test-isolation-cleanup` plan

Install and prove an awaited global unmount and async-task barrier, then establish a stable all-green frontend checkpoint.

## Description

Executes `2026-09-04-test-isolation-cleanup-adr`, which chooses a setup file
registering a global `afterEach(cleanup)` over `test.globals: true` and over a
96-file per-suite sweep. Grounding for the mechanism, the measured exposure, and
the reverse-order hook semantics the placement depends on is
`2026-09-04-test-isolation-cleanup-research`.

The work is small in diff and large in risk surface: four lines of harness change
apply to all 499 test files at once. The plan is therefore weighted toward
validation rather than construction. The barrier itself is one step; proving it
fires in both directions is one step; and the remaining steps exist because a
suite that passes today only by reading a previous test's still-mounted
component will now fail, and each such failure has to be triaged on its merits.

The ADR's integrity constraint binds every step below: a newly failing suite is
fixed as the defect it is, or recorded with evidence. It is never made green by
weakening an assertion, adding a retry, introducing a stub or mock, or exempting
the file from the barrier without a stated reason.

The reopened portion corrects the adjacent happy-dom settlement barrier. It
removes the fixed one-second pre-abort drain, awaits native abort completion,
makes the deliberately serial worker configuration truthful, adds mutation-proven
guard coverage and bounded engine-exit diagnostics, corrects one stale live-wire
assertion, and finishes with two clean serialized full-suite runs. The interrupted
design-system phase run is execution evidence for why this work reopened; its
incident counts are not a new architectural premise.

## Steps

- [x] `S01` - Add the global unmount barrier setup file and register it after the live-engine setup file; `frontend/vite.config.ts`.
- [x] `S02` - Add a guard suite that mounts in one case and asserts absence in the next, and validate it fails with the barrier removed; `frontend/src/testing/rtlCleanup.guard.test.tsx`.
- [x] `S03` - Run the full frontend suite with the barrier active and enumerate every newly failing suite; `frontend`.
- [x] `S04` - Triage each newly failing suite as a surfaced pre-existing defect: fix on merits or record with evidence; `frontend/src`.
- [x] `S05` - Re-run the full gate three times to confirm the barrier holds against the flake class it closes; `justfile`.
- [x] `S06` - Await native happy-dom abort directly, remove the fixed drain, and make serial worker configuration truthful; `frontend/src/testing/happyDOMAbort.ts, frontend/src/testing/liveSetup.ts, frontend/src/testing/rtlCleanup.ts, and frontend/vite.config.ts`.
- [x] `S07` - Add an awaited-abort and no-timer guard, and prove it fails both when awaiting is removed and when a fixed drain returns; `frontend/src/testing/happyDOMAbort.guard.test.ts`.
- [x] `S08` - Add bounded unexpected-engine-exit diagnostics without retries or behavior changes; `frontend/src/testing/liveEngine.globalSetup.ts`.
- [x] `S11` - Correct the live system-program adapter test for running, crashed, and absent identity states; `frontend/src/stores/server/systemPrograms.live.test.ts`.
- [ ] `S09` - Run frontend/src/app/left/AddProjectDialog.localization.test.tsx, frontend/src/app/left/CreateDocDialog.render.test.tsx, frontend/src/stores/server/comments.live.test.ts, frontend/src/stores/server/systemPrograms.live.test.ts, frontend/src/stores/server/queries/docmeta.test.ts, both barrier guards, and full frontend lint; `frontend`.
- [ ] `S10` - Run one timing-enabled serialized full frontend suite and one ordinary serialized confirmation suite, recording timing and failure classification; `frontend`.

## Parallelization

None. All Steps are sequential and single-threaded. The completed `S01` through
`S05` established the unmount barrier. `S06` corrects async settlement before
`S07` mutation-tests it; `S08` improves failure attribution; `S11` fixes the
independently demonstrated stale wire assertion; `S09` exercises the affected
set and lint; and `S10` is the final timed and ordinary full-suite gate. Immutable
identifier order intentionally places `S11` before `S09` in execution order.

The suite runs online against one spawned engine with mutable fixture state, so
files remain serial and no sibling worker or separate full/live-engine run may
overlap `S11`, `S09`, or `S10`. Performance comes from removing dead teardown
time, never from unsafe file concurrency.

## Verification

Green requires the old `waitUntilComplete` and one-second per-test drain to be
absent; a `Promise<void>` abort contract awaited at every per-test call; the new
guard green and demonstrated red both with the await removed and with a timer
restored; the existing RTL cross-test cleanup guard green; and truthful
`fileParallelism: false` plus `maxWorkers: 1` configuration.

All five files that failed in the interrupted design-system phase run must pass
focused execution. `just lint frontend` must exit zero. Then one timing-enabled
`just test frontend` and one ordinary confirmation run execute serially, both
exit zero, and neither exceeds 45 minutes on the same workstation. Neither run
may report an unhandled `AbortError`, `ECONNRESET`, worker exit, or unexpected
engine exit.

A deterministic pure-test failure is investigated on its own contract. It is not
waived as engine fallout without a demonstrated dependency path. No retry,
assertion weakening, mocked wire, timeout increase, or suite exemption may be
introduced to obtain green.
