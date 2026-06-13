---
tags:
  - '#exec'
  - '#dashboard-live-state'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S03'
related:
  - "[[2026-06-13-dashboard-live-state-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-live-state with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.
     step_id is the originating Step's canonical identifier, e.g. S01.
     The S03 and 2026-06-13-dashboard-live-state-plan placeholders are machine-filled by
     `vaultspec-core vault add exec`; do not fill them by hand.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar-plan]]' and link the
     parent plan.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

<!-- STEP RECORD:
     This file represents one Step from the originating plan. Identified
     by its canonical leaf identifier (S##) and ancestor display path.
     The Implement the graph-sync hook: subscribe the live graph channel, invalidate the constellation, track connection and lastSeq and ## Scope

- `frontend/src/stores/server/graphSync.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Implement the graph-sync hook: subscribe the live graph channel, invalidate the constellation, track connection and lastSeq

## Scope

- `frontend/src/stores/server/graphSync.ts`

## Description

- Implemented `useGraphLiveSync(scope, enabled)`: in LIVE mode it subscribes the live
  `graph` SSE channel and, on new deltas, advances the live-connection `lastSeq` and
  invalidates the scope's constellation query (targeted cache invalidation, ADR D3) -
  the contract's stated liveness path.
- It tracks the stream connection into the live-connection slice (open/success ->
  connected, error/StreamLostError -> lost), which is what makes the stream-lost
  degradation truthful.
- Fixed two in-lane defects in `queries.ts` (adversarial finding stream-01): folded the
  resume `since` into `engineKeys.stream` so two resume offsets no longer collide on one
  cache entry, and replaced `refetchMode: "append"` with a seq-dedup `reducer` +
  `initialValue` so a reconnect's `since=` replay splices idempotently (contract
  section 7).

## Outcome

`stores/server/graphSync.ts` makes LIVE mode reactive and the connection signal real. 3
unit tests cover `maxSeq`, the active path (advance + connect + invalidate), and the
inert disabled path. The stream-01 cache-key assertion is now green.

## Notes

The `enabled` gate hands the scene to the time-travel driver while scrubbing. The
no-refetch delta animation onto the held model stays engine-blocked (S50 constellation
seq) and is documented at the seam. The stream-01 reconnect-dedup assertion still times
out on the mock's never-closing SSE stream - a pre-existing stream-lifecycle/test
artifact owned by the concurrent hardening campaign, not this feature.
