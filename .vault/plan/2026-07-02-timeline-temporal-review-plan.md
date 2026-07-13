---
tags:
  - '#plan'
  - '#timeline-temporal-review'
date: '2026-07-02'
modified: '2026-07-12'
tier: L2
related:
  - '[[2026-07-02-timeline-temporal-review-audit]]'
---

# `timeline-temporal-review` plan

### Phase `P01` - Time-travel retirement

Retire the zombie time-travel client machinery orphaned by the Issue #14 timeline rebuild, keeping the correct engine asof/diff wire.

- [x] `P01.S01` - TTR-005: park the unreachable time-travel client machinery to spec (timeTravel driver, DeltaLog, TimeTravelChip, client asOf threading, menu/ops gating), keeping the engine /graph/asof + /graph/diff wire; `frontend/src/`.
- [x] `P01.S02` - TTR-006: retire the zombie keymap binding deriving movePlayhead intents from the retired scroll-strip store; `frontend/src/app/chrome/keyboardNavigation.ts`.

### Phase `P02` - Dead-code and criterion honesty

Remove orphaned event-selection code and serve per-criterion date bounds so the timeline track matches the active criterion.

- [x] `P02.S03` - TTR-007: delete the orphaned eventSelection.ts (zero production consumers post-teardown); `frontend/src/`.
- [x] `P02.S04` - TTR-008: serve dateBoundsByField for created/modified/stamped so the timeline track matches the active criterion; `engine/crates/engine-query/ + frontend TimelineRange`.

## Description

## Steps

## Parallelization

## Verification
