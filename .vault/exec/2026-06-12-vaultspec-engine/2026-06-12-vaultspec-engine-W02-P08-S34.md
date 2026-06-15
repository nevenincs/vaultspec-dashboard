---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
modified: '2026-06-15'
step_id: 'S34'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Implement filter-object validation and normalization plus scoped filter-vocabulary enumeration

## Scope

- `engine/crates/engine-query/src/filter.rs`

## Description

- Implement the engine-owned `Filter` wire object with deny-unknown-fields (a client inventing a facet fails loud), typed validation (tier names, structural states, 0..=1 confidence floats per contract R3), and normalization (sorted, deduped) for a stable echo.
- Implement edge and node predicates over every facet: tier toggles, per-tier confidence floors, relations, structural state, kinds, feature tags, text match.
- Implement `vocabulary`: the legal filter values actually present in a graph, server-enumerated (D7.2).

## Outcome

Clients render the vocabulary, never define it; malformed filters are typed errors, never silent ignores.

## Notes

Audit ruling W02P05-201 is honored in the predicate itself: when the structural-state facet explicitly requests broken, the per-tier confidence floor does not hide those edges (broken = 0.0 would otherwise vanish under any floor) - tested.
