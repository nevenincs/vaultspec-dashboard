---
tags:
  - '#audit'
  - '#test-isolation-cleanup'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:5785779b291c8637fa29e6febaa0f0094b705bffaafd6ecfe0cb98615e15c63f'
related:
  - "[[2026-09-04-test-isolation-cleanup-plan]]"
---

# `test-isolation-cleanup` audit: `S11 system program identity review`

## Scope

Reviewed exact plan step `W02.P01.S11`: the live system-program adapter assertion
against the accepted running, crashed, and absent machine-state wire contract.
The review checked that the test preserves optional crashed identity without
weakening numeric validation, leaves production adapter behavior unchanged, and
does not absorb the later affected-suite gate.

## Findings

### crashed-null-port | medium | Initial branch rejected a valid null last-known port

The first review found that a crashed service with malformed discovery can
serialize `port: null`. The initial correction treated only `undefined` as an
absent port, so that valid response would enter the numeric branch and fail even
though the tolerant adapter correctly normalizes null to undefined.

Resolved in the same step: the crashed branch now treats null or undefined as
absent and requires the adapted port to be undefined. Every non-null value must
still be numeric and exactly preserved, while raw and adapted crashed PIDs remain
undefined. The running branch requires and preserves numeric port and PID; the
absent branch requires neither identity field.

The exact focused case and the full six-case live file passed on fresh engines.
Formatting, typecheck, and the full frontend lint recipe passed. The same Sol
reviewer confirmed the correction and returned terminal PASS with no remaining
findings. No production source or S09 file changed.

## Recommendations

No further S11 correction is required. Keep machine-state assertions keyed to
the served state rather than collapsing every unavailable state into absence.

Status: PASS.
