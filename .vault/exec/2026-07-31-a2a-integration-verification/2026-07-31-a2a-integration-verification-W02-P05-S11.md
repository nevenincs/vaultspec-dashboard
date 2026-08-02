---
tags:
  - '#exec'
  - '#a2a-integration-verification'
date: '2026-08-02'
modified: '2026-08-02'
body_schema: 'body-v1'
body_hash: 'sha256:578f4926668a80c00be99b45ed4b2735a259202c8af11864c1ae79f68cae9647'
step_id: 'S11'
related:
  - "[[2026-07-31-a2a-integration-verification-plan]]"
---
# Assert the degraded flip by stopping a2a mid-suite and re-reading the same verbs for degraded-with-reason tiers, red if a tier read cannot flip

## Scope

- `frontend/e2e/agent/attach.spec.ts`

## Description

- Stop only the harness-owned A2A process tree after the S10 up-path assertion.
- Re-read `presets-list` through the real engine origin using the same bearer transport shape.
- Require the degraded HTTP 200 contract, a null sibling envelope, an unavailable agent tier, and a nonempty served reason.

## Outcome

S11 passed in the real two-process lane. The same engine pass-through that previously served an available agent tier flipped to `agent.available=false` after A2A stopped, with a trimmed nonempty reason and no transport shortcut. Sol medium review approved the final exact-200 assertion. Prettier, targeted ESLint, TypeScript, diff checks, and the two-test Playwright lane passed. Teardown left zero owned scratch roots.

## Notes

The test intentionally makes a missing tier flip fail red: successful transport alone is insufficient. It stops only the process tree launched by this harness; the final teardown safely handles that already-stopped child while still stopping the engine and removing the owned roots.
