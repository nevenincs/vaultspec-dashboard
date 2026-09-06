---
tags:
  - '#audit'
  - '#graph-simulation-stability'
date: '2026-09-05'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:10493d5622a2acda981a37ec415f738f4759ced9148a6b8481998e5365654618'
related:
  - "[[2026-09-05-graph-simulation-stability-plan]]"
  - "[[2026-07-03-graph-simulation-stability-adr]]"
  - "[[2026-09-05-graph-simulation-stability-performance-reference]]"
---

# `graph-simulation-stability` audit: `CPU performance implementation review`

## Scope

The CPU performance increment in the approved graph simulation plan: reciprocal-force pruning/arithmetic, mass collision caching, compatible scene updates, theme reads, fixed-step overload accounting, and the production benchmark. Physical invariants, scene lifecycle and resource bounds remain the governing constraints. The supervisor records independent review findings here.

## Findings

### benchmark-output-location | medium | Generated bundles entered the authored-source lint scope

Resolved during integration: benchmark bundles originally lived beneath `frontend/dev`, causing ESLint to inspect generated Three.js output. The runner now writes beneath the existing ignored `.tmp` area. No lint exclusion or suppression was added; maintained benchmark sources remain inside the full gate.

### delta-test-contract | medium | One new test command omitted its outer sequence field

Resolved during integration: full type checking identified a missing `seq` on the ambient-camera `apply-deltas` command. The test now supplies the real command contract without casts or weakened checking.

### idle-probe-authority | medium | The original idle probe stopped the loop itself

Resolved before headline measurement: independent host review found that canceling rAF and waiting could only prove a forced stop. The probe now schedules one real clean pinned-rest callback, counts callback/render activity and records whether another frame remains scheduled. The method still explicitly distinguishes this from natural post-drag convergence.

### kernel-report-environment | medium | Kernel-only reports omitted device metadata

Resolved before headline measurement: each kernel JSON row now contains the browser/rendering-device/DPR/viewport environment previously available only in console output. Actual elapsed live-window duration is recorded separately from its requested duration.

### independent-kernel-review | low | No required kernel revisions identified

The independent read-only kernel reviewer verified pruning and shared coincidence RNG ordering, per-axis pins, reciprocal sources, arithmetic fallback boundaries, bounded storage, collision cache invalidation through solver radius/parameter setters, and the independent pruning/contact/lifecycle test oracles. No actionable finding was identified. This source-review disposition does not substitute for full tests or measured performance; fully coincident work remains intentionally quadratic.

### dependency-upgrade-during-tests | high | The first full test run was invalidated by a concurrent dependency upgrade

Resolved at the infrastructure level by starting fresh processes, without dependency or configuration workarounds. The original Vitest 4 parent started before installed workers were replaced with Vitest 5, yielding 416 worker startup errors. The independent infrastructure inspection identified the incompatible parent/worker configuration. Fresh focused runs on Vitest 5 passed; the invalid full run is not a verification pass. Benchmark dependency fingerprints now reject mid-run changes as well.

### measurement-order-bias | medium | Sequential short microbenchmarks varied with run order

Resolved in the maintained harness: baseline and candidate kernels alternate on every sample, not only between whole fixtures. The first diagnostic host run also overlapped an accidental compiler process during remaining settle work; it is excluded from final headline evidence. Port reservation now occurs before compilation to prevent concurrent runners overwriting fixed bundle paths.

### benchmark-artifact-provenance | medium | A standalone build could overwrite measured bundle artifacts

Resolved after independent harness review: the server captures six bounded JavaScript, stylesheet and source-map buffers immediately after compilation, serves that immutable snapshot, and derives report hashes from those exact bytes. It also rejects a run if on-disk fingerprints differ before saving. A separate standalone build can no longer change which bytes later benchmark pages receive or cause the report to silently hash different output.

### benchmark-font-wait | low | Host readiness could wait forever on a stuck font promise

Resolved after independent review: both paired kernels and host measurements share a ten-second font-readiness deadline with timer cleanup. A page default timeout alone does not bound an evaluated browser promise.

### local-collision-residual | medium | Neighbor lookups dominated the remaining local-drag tick

Resolved by a profile-driven final collision revision: recompute conservative movable-cell bounds each iteration, retain the original path for unsafe or aliased coordinates, and process only own-cell fixed coincidences for distant fully pinned nodes. Descending candidate chains stop once no eligible index remains. Exhaustive contact oracles cover boundary equality, partial pins, distant and interleaved coincidence RNG, empty/scattered movers, cell crossing between iterations and extreme fallback. Six focused force/lifecycle suites passed all 82 tests on the final candidate.

### final-kernel-and-harness-review | low | Final source refinements accepted without required revisions

The independent kernel reviewer rechecked the final per-tick coefficient proof, bottom-up mobility metadata, all-active fast path, conservative collision bounds, descending-chain order and new edge-case oracles. No actionable findings remained. The independent host reviewer accepted immutable artifact provenance, bounded font readiness, paired sampling, real force wrapper restoration and cleanup. These are source-review dispositions; full gate outcomes and hardware-valid matched measurements remain separate evidence.

### concurrent-provisioning-gate | high | The final independent full lint encountered an unrelated live-worktree module-size violation

Open verification condition, not a graph implementation finding. The supervisor's full frontend lint passed before final measurement. The independent post-measurement run later stopped at the module-size scan because concurrent edits expanded `engine/crates/vaultspec-api/src/routes/provision.rs` to 1552 lines against the strict under-1500 limit. Earlier ESLint/localization/pixel/domain checks passed; later stages did not execute in that run. No unrelated code or lint limits were altered by this task. Final closure requires a fresh passing full gate after the owning work is corrected.

### final-static-gate | low | Independent full lint passed after the concurrent module-size violation was corrected

The provisioning owner reduced the over-limit module. The independent reviewer then reran the complete `just lint frontend` recipe and obtained exit zero, including ESLint, localization, pixel, domain and module-size scans, Prettier, TypeScript, token drift and Figma-name checks. The earlier `concurrent-provisioning-gate` verification condition is resolved; this task did not alter those unrelated files. The supervisor also compared 31 graph/harness source-map originals with current source after line-ending normalization and found no differences from the measured bundle. Full test disposition remains separate.

### picker-confirmation-gate | high | The complete frontend test run failed one unrelated picker confirmation test

Open verification condition. The fresh Vitest 5 `just test frontend` run exited one after 3166.09 seconds: 506 of 507 files passed; 4222 tests passed, one failed and one was skipped. All graph suites passed. The only failure was the unchanged `AddProjectDialog.localization.test.tsx` typed-path confirmation case: at line 202 the button remained disabled throughout its initial six-second wait. There were no repeated Vitest worker-startup failures in this run.

Independent read-only inspection found a plausible pre-existing timing race: Enter starts path resolution with explicit navigation intent but does not cancel the previously armed 300 ms parse timer. If resolution is slow, that timer can replace the explicit intent before successful navigation clears it. The exercised dialog/filesystem path does not mount or import the graph. This task has requested separate authorization for a picker repair and has not modified those files. An isolated reproduction follows the full run; it is diagnostic and cannot turn the failed full gate into a pass.

The isolated reproduction also exited one: the same initial confirmation assertion failed after 6179 ms on a fresh live engine (85.94 seconds total; the four other cases were excluded by the explicit name filter). This confirms the failure outside the whole-suite sequence, but does not by itself prove the proposed race mechanism. No retry-until-green, test skip, timeout increase or unrelated code patch was applied. Final commit and step closure remain withheld pending the picker resolution and required passing gate.

### picker-repair-authorization | low | Owner authorized the narrow test-gate prerequisite

On September 6 the owner explicitly approved the picker repair. Read-only inspection of the failed test DOM found the expected unregistered `Temp` child under the `Local` parent and an active `Temp` filter, but no completed Enter navigation. The engine and adapter preserve the normalized parent path for this fixture. This supports lost Enter intent from the pending debounce rather than missing filesystem data or the response-path equality guard. The authorized repair retains live-wire tests and existing assertions; passing focused and full gates remain required.

### picker-enter-debounce-repair | high | Controlled live-wire regression proves the lost-intent fix

Resolved in production by canceling the pending parse immediately before Enter applies its explicit path resolution. The existing response-path guard and programmatic-write cancellation remain unchanged. The regression now covers both ordinary response timing and a 450 ms delay before the genuine filesystem request, retaining real payloads and the original six-second assertion timeout. The delayed case failed before the production change and passed afterward; all six focused picker, browser and filesystem suites passed 43 tests in 66.76 seconds. Comments now distinguish cancellation before a slow response from cancellation after an identical-string programmatic write. No test skips, weakened assertions or wire mocks were introduced. The full frontend gate and independent final review remain pending.

### picker-independent-review | low | Narrow prerequisite accepted and both full lint gates passed

The independent reviewer found no required revisions in the Enter cancellation or the parameterized live-response regression. Cancellation remains after the submission guard; response-path gating, registration authority and cleanup are unchanged. The delayed transport delegates unchanged input and initialization to the genuine transport and is restored after each test. The supervisor's complete `just lint frontend` and the reviewer's independent complete recipe both exited zero after the final picker edit. Full-suite test disposition remains pending.

### final-full-test-gate | low | Complete frontend suite passed after the authorized prerequisite repair

The final `just test frontend` exited zero on September 6 in 1558.69 seconds: all 508 files passed, with 4237 tests passed and one existing skipped case. The retained local log is `.tmp/graph-performance/frontend-tests-final.log`. Both ordinary and deliberately delayed picker regressions passed alongside every graph suite. The earlier `picker-confirmation-gate` condition is resolved. This was one complete run against the live engine, with isolation and the test configuration unchanged; no concurrent full Vitest run was started by this task. Both final full lint recipes had already passed, and the reviewed graph and picker source stayed unchanged through this test run.

### final-review-disposition | low | Reviewed scope approved for commit

The independent reviewer verified the final full-suite log and approved the reviewed graph host, reuse, scheduling, benchmark and authorized picker prerequisite for commit. Kernel review had separately accepted the final force implementation and oracles. No required review findings remain. The documented soft-budget, cold-layout, device-coverage and measurement limits remain part of the accepted result, not unresolved claims of universal performance.

## Recommendations

Require the complete lint/test gates, independent review and matched measurements before closing the performance step. Do not claim a hard live-frame bound from a soft budget around indivisible ticks.

Fresh full-test triage: the independent infrastructure inspection confirmed the spawned engine remains alive and workers advance. Vitest 5 selects its minimal reporter in this agent environment; absent passing-file lines are not a stall. Synthetic palette scopes explain observed 400s, and happy-dom request abortion can produce socket-reset stderr during cleanup. Do not restart or rebuild based on those messages alone; the final summary owns the pass/failure disposition.
