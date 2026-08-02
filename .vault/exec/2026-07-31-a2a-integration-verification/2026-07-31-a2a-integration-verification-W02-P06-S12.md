---
tags:
  - '#exec'
  - '#a2a-integration-verification'
date: '2026-08-02'
modified: '2026-08-02'
body_schema: 'body-v1'
body_hash: 'sha256:e10a8a5035d1ba21268a368c9c03f8ead9de23ed3446dc3649edb7c1b8fc70c0'
step_id: 'S12'
related:
  - "[[2026-07-31-a2a-integration-verification-plan]]"
---
# Assert relay streaming content equality where the relayed frames of one completed mock run equal the scripted text under a monotonic engine sequence, red if the relay opens and serves zero frames while the run completes

## Scope

- `frontend/e2e/agent/stream.spec.ts`
- `frontend/src/stores/server/queries/sse.ts`
- `frontend/src/stores/server/queries/streams.ts`

## Description

- Extract the bounded production SSE parser into a pure stores module and preserve the existing `streams` exports.
- Start a real deterministic tool-call run through the engine broker and open its engine relay.
- Consume relay frames with the production parser until the terminal frame.
- Assert nonzero frames, dense engine sequence numbers, exact deterministic streamed text, relayed completion, and authoritative completed run status.

## Outcome

S12 passed against the real pinned engine and A2A worktrees. The relay produced deterministic scripted content with a dense monotonic engine sequence and a completed terminal frame, while the subsequent run-status read also reported completed. Sol medium review approved the parser extraction and proof. Prettier, targeted ESLint, TypeScript, the existing 13-test parser suite, diff checks, and the focused real Playwright lane passed.

## Notes

The prior plan wording names a mock run, but this review proof uses the credential-free in-process deterministic provider as required by the active deterministic-only policy. The test fails on an open relay with zero frames and uses no tape, mock, fake, or parser reimplementation.
