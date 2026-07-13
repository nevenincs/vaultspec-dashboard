---
tags:
  - '#exec'
  - '#agentic-spec-authoring-backend'
date: '2026-07-06'
modified: '2026-07-12'
step_id: 'S233'
related:
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# Add frontend stream tests for cursor advance, gap recovery, snapshot-plus-next-seq recovery, and reconnect resubscribe

## Scope

- `frontend/src/stores/server/authoring.test.ts`

## Description

- Add lifecycle stream adapter tests for `lifecycle`, `gap`, and `error` frames.
- Add cursor tests proving sequence advance is monotonic and duplicate/old
  lifecycle frames do not move the durable cursor backward.
- Add invalidation-only lifecycle coverage proving event payloads do not mutate
  cached proposal projection state.
- Add recovery snapshot coverage proving `snapshot.proposals` is installed into
  the proposal-list query cache and the cursor resumes from `next_seq - 1`.
- Add query-options coverage proving the proposal list no longer carries a
  polling `refetchInterval`.
- Reset the real authoring cursor store and shared query cache around each test.

## Outcome

The authoring frontend stream behavior now has focused unit coverage in the
authoring store test suite. The tests exercise real exported store functions and
the shared query cache; they do not replace the transport, monkeypatch the
client, or mirror proposal business logic.

The test suite now covers the S233 contract areas available at store-unit level:
cursor advance, old-frame rejection, frame adaptation, snapshot-plus-next-seq
recovery cache application, and removal of review-queue polling.

## Notes

- Verification:
  - `npx prettier --write src/stores/server/authoring.ts src/stores/server/authoring.test.ts`
  - `npm run typecheck`
  - `npm test -- src/stores/server/authoring.test.ts`
- Focused test result: `29` tests passed in `frontend/src/stores/server/authoring.test.ts`.
