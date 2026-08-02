---
tags:
  - '#exec'
  - '#a2a-integration-verification'
date: '2026-08-02'
modified: '2026-08-02'
body_schema: 'body-v1'
body_hash: 'sha256:8d19cbbad97e25a931e888cae1e492b5906dddfbeb1b74a8558c07c65b6bc8b2'
step_id: 'S09'
related:
  - "[[2026-07-31-a2a-integration-verification-plan]]"
---

# Wire the environment-gated agent lane into a distinct Playwright configuration

## Scope

- `frontend/dev/playwright.agent.config.ts`

## Description

Provide a separate serial Playwright lane for agent E2E and a direct substrate
gate. Missing A2A source must be a visible skip; deleting that gate must turn
the same condition into a failure rather than a pass.

## Outcome

Dashboard revision `d616ec189b` adds `e2e:agent`, its dedicated configuration,
and the agent source gate. With no `VAULTSPEC_TEST_A2A_ROOT`, Playwright
reported `1 skipped`. With the isolated A2A checkout configured it reported
`1 passed`. A deliberate temporary removal of the skip produced the expected
red `VAULTSPEC_TEST_A2A_ROOT must be non-empty` assertion before restoration.

## Notes

The one explicit skip is the lane's required missing-substrate status, not a
passing shortcut. It is paired with the direct assertion that makes removal
of the skip red. Frontend dependencies were installed lock-pinned in this
isolated worktree solely to execute the proof.
