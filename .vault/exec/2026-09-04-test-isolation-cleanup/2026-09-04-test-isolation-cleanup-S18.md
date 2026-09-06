---
tags:
  - '#exec'
  - '#test-isolation-cleanup'
date: '2026-09-06'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:9a0aae7bc9d23d450f02c6cc06d3118b5597f7b69ddc59831d5e6228757892fb'
step_id: 'S18'
related:
  - "[[2026-09-04-test-isolation-cleanup-plan]]"
---

# Implement and mutation-prove a bounded Node HTTP/HTTPS transport for live-engine tests, route the shared live client through it, and preserve direct raw-fetch conformance

## Scope

- `frontend/src/testing/nodeHttpTransport.ts`
- `frontend/src/testing/nodeHttpTransport.test.ts`
- `frontend/src/testing/liveClient.ts`

## Changes

- `A` `frontend/src/testing/nodeHttpTransport.ts`
- `A` `frontend/src/testing/nodeHttpTransport.test.ts`
- `M` `frontend/src/testing/liveClient.ts`
- `verify:` `npm --prefix frontend test -- src/testing/nodeHttpTransport.test.ts -t "aborts a held null-body"` -> `pass`
- `verify:` `npm --prefix frontend test -- src/testing/nodeHttpTransport.test.ts` -> `pass`
- `verify:` `npm --prefix frontend test -- src/testing/engineConformance.test.ts` -> `pass`
- `verify:` `npm --prefix frontend run typecheck` -> `pass`
- `verify:` `just lint frontend` -> `pass`
- `verify:` `independent Sol review` -> `pass`
