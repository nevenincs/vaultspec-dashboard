---
tags:
  - '#exec'
  - '#a2a-orchestration-edge'
date: '2026-07-19'
modified: '2026-07-19'
step_id: 'S17'
related:
  - "[[2026-07-17-a2a-orchestration-edge-plan]]"
---

# Secure the sibling gateway with loopback-default binding and constant-time service-token authentication on every /v1 route, with real HTTP negative and positive coverage

## Scope

- `src/vaultspec_a2a/api/`
- `src/vaultspec_a2a/control/config.py`

## Description

- Default the sibling gateway listener to loopback.
- Authenticate every current and future `/v1` route through one router dependency using constant-time token comparison.
- Fail closed when the service token is absent outside the explicit in-process test bypass.
- Keep the public health probe unauthenticated and constrain CLI discovery credentials to configured or matching-loopback records.
- Exercise correct, missing, and incorrect credentials across all seven route classes with real HTTP traffic.

## Outcome

The sibling gateway now binds to `127.0.0.1` by default and protects its complete `/v1` control surface with a single fail-closed service-token boundary. Focused authentication, gateway, API, application, and CLI suites passed 24, 18, 243, 18, and 2 tests respectively; Ruff, ty, and diff validation were clean.

## Notes

Concurrent desktop work captured the narrow CLI credential-consumption hunk in its existing commit. The remaining gateway changes are uncommitted and preserved separately; no unrelated desktop changes were modified.
