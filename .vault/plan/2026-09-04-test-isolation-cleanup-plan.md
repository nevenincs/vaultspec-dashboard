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
body_hash: 'sha256:ea7b1902002bf92acf15ad7b4c1325fe21570981d82e5f3e63d6cdee61157533'
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
- [ ] `S03` - Run the full frontend suite with the barrier active and enumerate every newly failing suite; `frontend`.
- [ ] `S04` - Triage each newly failing suite as a surfaced pre-existing defect: fix on merits or record with evidence; `frontend/src`.
- [ ] `S05` - Re-run the full gate three times to confirm the barrier holds against the flake class it closes; `justfile`.
