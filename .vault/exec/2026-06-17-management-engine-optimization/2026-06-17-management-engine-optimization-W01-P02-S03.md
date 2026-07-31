---
tags:
  - '#exec'
  - '#management-engine-optimization'
date: '2026-06-17'
modified: '2026-07-12'
body_hash: 'sha256:a3308641e0e3a2a5c8441a6e1c164425100dc6bb9d7d90aceb9cbf89e08d5836'
step_id: 'S03'
related:
  - "[[2026-06-17-management-engine-optimization-plan]]"
---

# Require live engine conformance instead of skipped success

## Scope

- `frontend/src/testing/engineConformance.test.ts`

## Description

- Replace the skipped live conformance suite with an always-declared suite.
- Fail setup explicitly when `ENGINE_BASE_URL` is missing.
- Remove test-double marker terms from the conformance file comments.

## Outcome

The frontend live engine conformance suite can no longer produce a green skipped result
when the backend endpoint is absent. In this environment the suite ran against a live
engine and passed all nine tests.

## Notes

Verification: `node node_modules/vitest/vitest.mjs run src/testing/engineConformance.test.ts`.
