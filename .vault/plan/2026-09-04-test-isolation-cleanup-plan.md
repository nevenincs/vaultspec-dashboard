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
body_hash: 'sha256:52113428a8da83154f159e6ec8f600566e248826c4f93339eb916615cf05c50e'
---

# `test-isolation-cleanup` plan

Install and prove a global unmount barrier with runner-owned window teardown, then establish a stable all-green frontend checkpoint.

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

The first reopened portion removed the fixed one-second pre-abort drain, awaited
native abort completion, made the deliberately serial worker configuration
truthful, added mutation-proven guard coverage and bounded engine-exit diagnostics,
and corrected one stale live-wire assertion. The first timing-enabled final run
then disproved per-test window abort before reaching a suite verdict, as grounded
in `2026-09-04-test-isolation-cleanup-research`.

The second reopened portion removes that destructive per-test lifecycle owner and
its obsolete helper and guard. RTL cleanup remains the global between-test barrier;
Vitest alone owns awaited happy-dom abort at file teardown. A replacement guard
proves the window is not aborted between cases, a bounded reproduction set must be
diagnostically clean, and any surviving post-unmount work is repaired only at the
component, query, transport, or test that owns it. No Step authorizes diagnostic
suppression, retry, timeout inflation, mocking, or assertion weakening.

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
- [x] `S09` - Run frontend/src/app/left/AddProjectDialog.localization.test.tsx, frontend/src/app/left/CreateDocDialog.render.test.tsx, frontend/src/stores/server/comments.live.test.ts, frontend/src/stores/server/systemPrograms.live.test.ts, frontend/src/stores/server/queries/docmeta.test.ts, both barrier guards, and full frontend lint; `frontend`.
- [ ] `S12` - Remove the destructive per-test happy-dom abort path and its obsolete helper and guard while preserving RTL unmount and Vitest-owned file teardown; `frontend/src/testing/happyDOMAbort.ts, frontend/src/testing/happyDOMAbort.guard.test.ts, frontend/src/testing/liveSetup.ts, frontend/src/testing/rtlCleanup.ts, frontend/vite.config.ts`.
- [ ] `S13` - Add a cross-test lifecycle guard proving the harness never calls happy-dom abort between cases and demonstrate it red with the removed hook restored; `frontend/src/testing/perTestWindowLifecycle.guard.test.ts`.
- [ ] `S14` - Run the exact eight-file S10 prefix that exposed abort-driven resets and enumerate any remaining post-unmount async leakage with unsuppressed diagnostics; `frontend/dev/tooling/scan-design-system.test.ts, frontend/dev/tooling/scan-localization.test.ts, frontend/src/app/agent/Composer.render.test.tsx, frontend/src/app/palette/DocumentSearchSurface.localization.test.tsx, frontend/src/app/stage/GraphControls.render.test.tsx, frontend/src/app/agent/AgentPanel.render.test.tsx, frontend/dev/tooling/token-drift-check.test.ts, frontend/src/stores/server/authoring.happyPath.live.test.ts`.
- [ ] `S15` - Repair any surviving post-unmount async leak at its component, query, transport, or test owner and confirm the bounded prefix plus full frontend lint; `frontend/src`.
- [ ] `S10` - Run one timing-enabled serialized full frontend suite and one ordinary serialized confirmation suite, recording timing and failure classification; `frontend`.

## Parallelization

None. All Steps are sequential and single-threaded. The completed `S01` through
`S05` established the unmount barrier; completed `S06` through `S09` and `S11`
record the awaited-abort hypothesis and its focused evidence. The failed first
`S10` attempt authorizes no retry. `S12` removes the disproved ownership path,
`S13` mutation-tests the replacement boundary, `S14` reruns the exact early-file
set that exposed the mechanism, and `S15` traces any remaining post-unmount work
to its narrow owner and confirms the bounded gate. Only after corrective
implementation is `S10` re-entered as the final timing-enabled and ordinary
full-suite gate; this is not a blind rerun of unchanged state.

The suite runs online against one spawned engine with mutable fixture state, so
files remain serial and no sibling worker or separate full/live-engine run may
overlap `S14`, `S15`, or `S10`. Performance comes from removing dead teardown
time and destructive cancellation, never from unsafe file concurrency.

## Verification

Green requires the old `waitUntilComplete`, fixed timer, and every
application-owned per-test happy-dom abort call to be absent. The obsolete abort
helper and its guard are removed. The replacement lifecycle guard passes and is
demonstrated red when the removed per-test hook is restored; the existing RTL
cross-test cleanup guard remains green; and `fileParallelism: false` plus
`maxWorkers: 1` remain truthful.

Before the full run, the exact eight-file prefix reached by the failed timing run
must pass with zero synchronous AbortError stacks, zero `socket hang up` or
`ECONNRESET` diagnostics, no unhandled-error section, no worker exit, and no
unexpected engine exit. Any work that survives unmount and affects another case
is fixed and verified at its actual owner. Diagnostic filtering, exception
swallowing, retries, timeout
increases, mocks, and assertion weakening are forbidden.

All five files that failed in the interrupted design-system phase run must pass
focused execution. `just lint frontend` must exit zero. Then one timing-enabled
`just test frontend` and one ordinary confirmation run execute serially, both
exit zero, and neither exceeds 45 minutes on the same workstation. Neither run
may emit a synchronous `AbortError` stack, a `socket hang up` or `ECONNRESET`
diagnostic, an unhandled-error section, a worker exit, or an unexpected engine
exit.

A deterministic pure-test failure is investigated on its own contract. It is not
waived as engine fallout without a demonstrated dependency path. The final run's
file-end happy-dom abort remains Vitest-owned and awaited; the harness adds no
second environment-destruction path.
