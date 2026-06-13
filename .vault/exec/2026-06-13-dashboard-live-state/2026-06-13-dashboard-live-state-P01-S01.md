---
tags:
  - '#exec'
  - '#dashboard-live-state'
date: '2026-06-13'
modified: '2026-06-13'
step_id: 'S01'
related:
  - "[[2026-06-13-dashboard-live-state-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #exec) and one feature tag.
     Replace dashboard-live-state with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.
     step_id is the originating Step's canonical identifier, e.g. S01.
     The S01 and 2026-06-13-dashboard-live-state-plan placeholders are machine-filled by
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
     The Add the scope-keyed live-connection slice holding streamConnected, lastSeq, and brokenLinkCount and ## Scope

- `frontend/src/stores/server/liveStatus.ts` placeholders below are machine-filled
     by `vaultspec-core vault add exec` from the originating Step row;
     do not fill them by hand. -->

# Add the scope-keyed live-connection slice holding streamConnected, lastSeq, and brokenLinkCount

## Scope

- `frontend/src/stores/server/liveStatus.ts`

## Description

- Added `useLiveStatusStore` (Zustand): the stores-owned runtime live-connection state
  the system did not model before - `streamConnected` (`null` = no stream expected, only
  explicit `false` is lost), `lastSeq` (the `since=` resume point), and `brokenLinkCount`.
- `setLastSeq` advances monotonically (a stale frame never moves it backward);
  `setBrokenLinkCount` is identity-stable (no-op on an unchanged value to avoid render
  churn); `reset` clears the whole plane for a wholesale scope swap.
- Exported `isStreamLost(state)` so the degradation derivation reads the lost truth
  without re-implementing the null-vs-false rule.

## Outcome

`stores/server/liveStatus.ts` is ADR D1: liveness is now first-class state both the
degradation derivation and the stream resume read. 8 unit tests cover initial state,
connection tracking, monotonic seq, idempotent broken-count, reset, and the
`isStreamLost` null/true/false rule.

## Notes

`null` vs `false` is the load-bearing distinction: before the first stream connects the
GUI must not show a "lost" surface. No scaffolds left.
