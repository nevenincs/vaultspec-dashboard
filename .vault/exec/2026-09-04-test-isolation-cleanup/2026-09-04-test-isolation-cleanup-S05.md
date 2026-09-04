---
tags:
  - '#exec'
  - '#test-isolation-cleanup'
date: '2026-09-04'
modified: '2026-09-04'
body_schema: 'body-v2'
body_hash: 'sha256:72ce95b4e1bb57e411361a026f057c0c87d3bfa2825ed3deefc64f2fdb2d2b2b'
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

Five full runs were taken, not three. Runs two and three are clean verdicts
(`just test all` covering Rust plus 500 frontend files, then `just test
frontend`). Runs four and five are NOT verdicts: the shared engine died partway
through each, and every failure in them is an `ECONNREFUSED` or `fetch failed`
cascade against a dead port across surfaces the change never touched. The
machine was measured at 100% CPU with a sibling Rust build running at the time,
which is the load class `vite.config.ts` already documents as killing the shared
engine mid-run.

One assertion failure inside run four is worth naming rather than folding into
that cascade: `useReducedMotion` failed again with its historical signature
(correct DOM attribute, stale hook value). It touches no engine, so the dead
engine does not explain it directly, and it is a suite that already unmounts
itself, so the barrier changes nothing for it. It did not recur in any other
run. Recorded as still-open rather than claimed fixed.
