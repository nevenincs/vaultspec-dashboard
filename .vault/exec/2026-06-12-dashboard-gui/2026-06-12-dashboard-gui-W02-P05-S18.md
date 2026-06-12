---
tags:
  - '#exec'
  - '#dashboard-gui'
date: '2026-06-12'
step_id: 'S18'
related:
  - "[[2026-06-12-dashboard-gui-plan]]"
---




# build the synthetic vault corpus fixtures with features, documents, plan interiors, tiered edges, and an event log mirroring contract shapes

## Scope

- `frontend/src/testing/fixtures`

## Description

- Add `frontend/src/testing/fixtures/corpus.ts`: `buildFixtureCorpus`, a
  deterministic (seeded PRNG) synthetic vault corpus typed entirely in the
  S17 wire shapes.
- Twelve features, each with the five-document lifecycle (research, adr,
  plan, exec, audit) linked by declared lifecycle-axis edges (resolves /
  implements / fulfills / reviews) plus feature-membership edges; vault
  tree entries mirror every document.
- All four tiers in the document-level edge set: structural edges to code
  artifacts with varied resolved/stale/broken states, temporal
  commit-correlation edges with confidence, semantic candidates with
  sub-1 confidence and rag provenance.
- Engine-aggregated feature meta-edges derived from the underlying
  document edges exactly as the contract's §4 constellation rule states
  (count plus breakdown-by-tier; the GUI never flattens client-side).
- Plan interiors keyed by plan id, with step check-state exactly matching
  the plan's progress ring fraction.
- A ts-ascending event log (doc-created, commit, step-checked) whose
  entries carry the load-bearing `node_ids` join field.
- Add `frontend/src/testing/fixtures/corpus.test.ts` covering determinism,
  lifecycle completeness, tier coverage with structural-state and
  semantic-confidence invariants, meta-edge count consistency, event
  ordering, interior/progress agreement, and vault-tree mirroring.

## Outcome

The mock engine (S19) has a contract-shaped world to serve, rich enough to
exercise every W02 surface: constellation meta-edges, descent, interiors,
the tier dial, the timeline lanes, and time travel. Gates green: typecheck,
eslint, vitest (96 passed), prettier.

## Notes

Event timestamps span January-April 2026 across features, giving the
timeline real density variation; sequence numbers for the delta clock are
assigned by the mock engine (S19), which owns the temporal serving logic.

