---
tags:
  - '#exec'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-06-15'
step_id: 'S09'
related:
  - "[[2026-06-14-graph-representation-plan]]"
---




# Compute deterministic per-lens salience in the fixture corpus

## Scope

- `frontend/src/testing/fixtures/corpus.ts`

## Description


## Outcome

Corpus computes deterministic per-lens salience (`computeSalience`) from per-lens type prior + degree centrality + recency; status weights recency high, design low. Exposed as `salienceByLens`.

Corpus computes deterministic per-lens salience (`computeSalience`) from per-lens type prior + degree centrality + recency; status weights recency high, design low. Exposed as `salienceByLens`.

## Notes

