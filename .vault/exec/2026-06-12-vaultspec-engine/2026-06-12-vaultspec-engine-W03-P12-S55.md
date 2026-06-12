---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
step_id: 'S55'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Add a cold-index performance smoke benchmark and record the baseline

## Scope

- `engine/tests/bench/`

## Description

- Add the cold-index benchmark: 200 generated plan documents with path/step/wiki/symbol mentions over 20 code files; cold and warm passes timed, baseline printed, generous regression ceiling asserted.

## Outcome

Baseline recorded on this machine (Windows, debug profile): 200 docs / 200 nodes / 1000 edges - cold 2026ms, warm 1987ms with 200/200 cache hits.

## Notes

Warm tracks cold closely because RESOLUTION (file-content text matching) dominates and is deliberately uncached (live signal); the extraction cache only removes parsing. The 104 memoization (this phase) bounds resolution to one read per file per pass. If warm-path latency matters for the serve rebuild loop, the next lever is persisting resolution candidates keyed by (blob, tree-state) - noted as future work, not v1.
