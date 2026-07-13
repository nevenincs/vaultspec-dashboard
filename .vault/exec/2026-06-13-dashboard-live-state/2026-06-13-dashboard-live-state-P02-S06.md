---
tags:
  - '#exec'
  - '#dashboard-live-state'
date: '2026-06-13'
modified: '2026-07-12'
step_id: 'S06'
related:
  - "[[2026-06-13-dashboard-live-state-plan]]"
---

# Bind setDegradationHandler in app bootstrap so a stream-lost classification flips streamConnected false

## Scope

- `frontend/src/main.tsx`

## Description

- Bound `failurePolicy.setDegradationHandler` in app bootstrap (ADR D5): a
  `stream-lost`-signalled `degraded` classification flips the live-connection slice's
  `streamConnected` to false, so the degradation matrix renders the reconnecting/stale
  surface. This is the platform-policy adoption the platform audit assigned to the Data
  team - the policy classifies (mechanism), the live signal is the vocabulary binding.
- Exposed `useLiveStatusStore` on `globalThis` in dev (alongside the existing ring
  buffer) so the adverse e2e can drive the live signal; never exposed in production.

## Outcome

The classify -> surface loop closes without the stores importing the policy's
vocabulary: a real `StreamLostError` (thrown by `sseChunks`, classified by the policy)
now reaches the degradation surface. The full suite stays green.

## Notes

The dev-only global exposure is gated on `import.meta.env.DEV`; the production bundle
carries neither global. No scaffolds in shipped paths.
