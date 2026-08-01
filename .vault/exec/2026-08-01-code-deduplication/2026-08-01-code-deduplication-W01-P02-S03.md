---
tags:
  - '#exec'
  - '#code-deduplication'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:18e0d185f1708defc33bdfea1f0e08886440e9565edacf1466d21ab60cfc8971'
step_id: 'S03'
related:
  - "[[2026-08-01-code-deduplication-plan]]"
---
# Write regression coverage for bearer transport and tiers-preserving failures then create its owner

## Scope

- `frontend/src/stores/server/httpTransport*`

## Description

- Establish the direct stores-owned bearer transport and response-to-error conversion module.
- Exercise bearer injection and caller authorization preservation through native fetch against a real loopback listener.
- Exercise JSON tiers preservation, null-tier rejection, and non-JSON status-bearing errors with native response objects.

## Outcome

The owner module exposes direct source imports only. Focused tests passed, strict TypeScript passed, Prettier passed, and independent Sol review approved the real-wire coverage.

## Notes

The first review rejected an injected capturing fetch in the bearer test. It was replaced with an ephemeral real HTTP listener before approval.
