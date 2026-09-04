---
tags:
  - '#exec'
  - '#test-isolation-cleanup'
date: '2026-09-04'
modified: '2026-09-04'
body_schema: 'body-v2'
body_hash: 'sha256:64fb3bd5aff066014e3d654cb6f7b9e8b3aacf01b3405d733e7032f3088973bc'
step_id: 'S05'
related:
  - "[[2026-09-04-test-isolation-cleanup-plan]]"
---

# Re-run the full gate three times to confirm the barrier holds against the flake class it closes

## Scope

- `justfile`

## Changes

- `verify:` `just lint all` -> `pass`
- `verify:` `just test all` -> `pass`
- `verify:` `just test frontend` -> `pass`

## Notes

Six full runs were taken, not three, because half of them returned no verdict.

Runs two and three are the clean verdicts: `just test all` at exit 0 covering
every Rust crate plus 500 frontend files and 4115 tests, then `just test
frontend` at exit 0 with 500 files and 4114 tests.

Runs four and five are NOT verdicts. The shared engine died partway through
each, and their failures are an `ECONNREFUSED` or `fetch failed` cascade against
a dead port, spread across surfaces this change never touched (60 files in run
five). Run six is likewise not a verdict, though for a different reason and with
a much better shape: ZERO tests failed and 4113 passed, but one worker fork
exited unexpectedly, which is what took the exit code to 1. In all three the
machine measured 90 to 100 percent CPU with sibling work running, which is the
load class `vite.config.ts` already documents as killing the shared engine
mid-run.

Run one carried the one honest test failure, triaged in `S04`.

One assertion failure inside run four is worth naming rather than folding into
the cascade: `useReducedMotion` failed again with its historical signature
(correct DOM attribute, stale hook value). It touches no engine, so the dead
engine does not explain it directly, and it is a suite that already unmounts
itself, so the barrier neither fixes nor affects it. It did not recur in the
other five runs. Recorded as still open rather than claimed fixed: the leaked
subscription this barrier removes was a real contributor to that flake, and this
run is evidence it was not the only one.
