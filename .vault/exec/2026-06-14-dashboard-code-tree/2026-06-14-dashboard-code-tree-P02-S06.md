---
tags:
  - '#exec'
  - '#dashboard-code-tree'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S06'
related:
  - "[[2026-06-14-dashboard-code-tree-plan]]"
---

# Derive code:<path> through the shared node_id rule with no private convention

## Scope

- `engine/crates/engine-model/src/`

## Description

- Verify the `code:<path>` interlink is derived through the SHARED `node_id` rule, not a private convention: the route's `child_to_wire` calls `engine_model::node_id(CanonicalKey::CodeArtifact { path, symbol: None })`, the exact derivation the search annotator and the graph already use.
- Confirm `CanonicalKey::CodeArtifact` and `node_id` already exist on the canonical site at HEAD.

## Outcome

- Verified: the integration test asserts `code:src` for a directory and `code:src/main.rs` for a file, both produced by the shared rule; the `engine-model` unit test pins the same derivation for the path-only and symbol-qualified forms.
- COMMITTED: nothing in `engine-model` — the shared rule predates this campaign and required NO change.

## Notes

- IMPORTANT scope correction: the dispatch brief listed `engine-model/{id.rs,lib.rs}` as carrying the "code:<path> derivation". On inspection the `CanonicalKey::CodeArtifact` derivation already exists at HEAD (the `#symbol` audit note is committed). The uncommitted diff in `engine-model/{id.rs,lib.rs}` is ENTIRELY peer work (dashboard-pipeline-wire: the `Contains` relation member and the `status`/`tier` node facets), not code-tree work. So this step required no engine-model edit, and the entangled engine-model files are DEFERRED (not committed) but carry zero code-tree change to defer.
- This is the no-private-convention guarantee the ADR and `provenance-stable-keys-are-identity-bearing` demand: one derivation, shared across search, graph, and the file-tree listing.
