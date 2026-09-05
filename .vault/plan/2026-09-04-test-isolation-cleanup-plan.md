---
tags:
  - '#plan'
  - '#test-isolation-cleanup'
date: '2026-09-04'
tier: L1
related:
  - '[[2026-09-04-test-isolation-cleanup-adr]]'
  - '[[2026-09-04-test-isolation-cleanup-research]]'
modified: '2026-09-04'
body_schema: body-v2
body_hash: 'sha256:4d050c2665f0ce0d9d26419c4cd3cbdca22b4dc1366327c787b54edac23e3efe'
---

# `test-isolation-cleanup` plan

Install the global unmount barrier, prove it fires, and triage whatever it unmasks.

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

## Steps

- [x] `S01` - Add the global unmount barrier setup file and register it after the live-engine setup file; `frontend/vite.config.ts`.
- [x] `S02` - Add a guard suite that mounts in one case and asserts absence in the next, and validate it fails with the barrier removed; `frontend/src/testing/rtlCleanup.guard.test.tsx`.
- [x] `S03` - Run the full frontend suite with the barrier active and enumerate every newly failing suite; `frontend`.
- [x] `S04` - Triage each newly failing suite as a surfaced pre-existing defect: fix on merits or record with evidence; `frontend/src`.
- [x] `S05` - Re-run the full gate three times to confirm the barrier holds against the flake class it closes; `justfile`.

## Parallelization

None. The five Steps are strictly sequential and single-threaded, and that is a
constraint rather than an oversight: `S02` cannot validate a barrier `S01` has
not installed, `S03` measures what `S01` and `S02` produced, `S04` triages what
`S03` found, and `S05` repeats `S03` for confidence. The Steps also share one
indivisible resource. The suite runs online against a single spawned engine
whose authoring apply lock makes two concurrent full runs flake against each
other, so no two Steps that invoke it may overlap, and no sibling worker may run
the gate while this plan is executing.

## Verification

Green means `just lint all` at exit 0 and `just test all` at exit 0 with every
frontend file passing, plus the barrier guard passing in both directions: green
with the barrier registered, red with it unregistered. A one-directional pass
proves the mechanism exists, not that it fires, and does not count.

A red is only a verdict when the engine survived the run. A run whose failures
are `ECONNREFUSED` or `fetch failed` against the engine port, spread across
surfaces this change never touched, is an infrastructure red to be re-run rather
than triaged as a defect. A run is therefore reported with its failure
classification, not only its exit code.
