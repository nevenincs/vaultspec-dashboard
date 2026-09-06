---
tags:
  - '#audit'
  - '#test-isolation-cleanup'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:1acacb85b0fd1d18233166615198b35aee9cbd276e7b047d1940c0fadcc2349a'
related:
  - "[[2026-09-04-test-isolation-cleanup-plan]]"
---

# `test-isolation-cleanup` audit: `S08 unexpected engine exit diagnostics review`

## Scope

Reviewed exact plan step `W02.P01.S08`: bounded diagnostics for unexpected exits
of the live-test engine child and focused tests for that reporting contract. The
review checked attribution fields, tail bounds, expected-cleanup suppression,
listener lifecycle, and the prohibition on retries, timeout changes, or adjacent
system-program work.

## Findings

### bounded-exit-attribution | low | Unexpected child exits now retain actionable evidence

One observer is attached to each harness-owned child. On an exit the observer
captures its code, signal, elapsed milliseconds, and the newest 16,384 characters
of the bounded serve log. Null process facts and an empty log remain explicit,
and a negative elapsed input is clamped rather than reported as impossible time.
Intentional cleanup marks the exit expected before graceful shutdown or the
bounded force-kill fallback, so ordinary teardown stays silent.

The focused four-case suite covers required fields, null and negative values,
tail truncation with head exclusion, expected-shutdown silence, and actual
one-shot listener/report wiring. No retry, deadline, startup, shutdown, or test
timeout changed. Formatting, typecheck, and the full frontend lint recipe passed.
Independent Sol review returned PASS with no findings and confirmed no S11 scope.

## Recommendations

No S08 correction is required. Use these diagnostics as evidence in the planned
serialized suite runs; do not convert them into retry behavior.

Status: PASS.
