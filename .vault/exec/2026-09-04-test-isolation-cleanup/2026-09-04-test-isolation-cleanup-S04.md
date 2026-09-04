---
tags:
  - '#exec'
  - '#test-isolation-cleanup'
date: '2026-09-04'
modified: '2026-09-04'
body_schema: 'body-v2'
body_hash: 'sha256:f7070513b9d102c111aa698c2d8505cbe870491cb944069188d23a04020d84a3'
step_id: 'S04'
related:
  - "[[2026-09-04-test-isolation-cleanup-plan]]"
---

# Triage each newly failing suite as a surfaced pre-existing defect: fix on merits or record with evidence

## Scope

- `frontend/src`

## Changes

- `verify:` `npx vitest run src/stores/server/comments.live.test.ts` -> `pass`

## Notes

No suite was found to depend on the leak, so no source change was needed. The
single failure carried in from `S03` passes in isolation and did not recur in
any of the three subsequent full runs. Its failure path is a chain of
`vaultspec-core` subprocess writes plus a file-watcher re-ingest wait against a
15000ms test timeout, with no component mounted anywhere in it, so it is
recorded as the known live-engine latency flake class rather than an isolation
defect the barrier surfaced. Nothing was weakened, retried, stubbed, or exempted
from the barrier.
