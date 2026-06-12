---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
step_id: 'S01'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---




# Define Node, NodeKind, Edge, RelationKind, Tier, Provenance and ScopeRef types per ADR section 3 as pure no-IO types

## Scope

- `engine/crates/engine-model/src/lib.rs`

## Description

- Verify the scaffold's type vocabulary against ADR section 3: Node, NodeKind, Edge, RelationKind, Tier, Provenance, ScopeRef, ResolutionState, Facet, Presence all present in `engine/crates/engine-model/src/lib.rs` as pure no-IO serde types.
- Keep tier and provenance mandatory on Edge; structural state optional per the schema.
- Move identity derivation out of the type module into the new `id` module (S02), leaving `lib.rs` purely vocabulary.

## Outcome

The shared vocabulary crate matches the ADR edge/node schema exactly; serde round-trip and kebab-case wire names covered by unit tests. No I/O, no non-serde dependencies.

## Notes

The foundation scaffold (commit 0cd11a7) had already laid most of these types down; this step's net change is conformance verification plus the lib/id split. No deviations from ADR D3.1.
