---
tags:
  - '#audit'
  - '#vaultspec-engine'
date: '2026-06-12'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
  - "[[2026-06-12-vaultspec-engine-adr]]"
---



# `vaultspec-engine` audit: `W01.P01 model and store review`

## Scope

Phase boundary review of plan phase W01.P01 (model and store foundations), steps S01-S05, commits `d3a059e` and `f5a5b81`. Surfaces audited: `engine/crates/engine-model/src/lib.rs`, `engine/crates/engine-model/src/id.rs`, `engine/crates/engine-store/src/lib.rs`, the five step records and the phase summary. Reviewed for safety, intent (ADR and contract conformance), and quality per the code-review discipline. Reviewer independently re-ran the gates: `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings`, and `cargo test --workspace` are green at `f5a5b81`.

Verdict: **phase approved for closure.** Intent conformance is strong: the type vocabulary matches ADR section 3 and 4 exactly (one edge schema, mandatory tier and provenance, key-plus-facet node identity); id derivation matches contract section 2; the store matches ADR section 8 (cache-not-truth, content-hash keys, WAL single-writer/concurrent-reader, loud schema-version failure mirroring the D5.1 posture). Tests are substantive, not tautological: FNV-1a verified against standard vectors, identity-component discrimination covered, reader write-rejection asserted by connection flags. All findings below are low severity; none block closure.

## Findings

## W01P01-001 | low | edge-id-over-provenance-stable-key design call is APPROVED

The executor's flagged deviation question (step S03 record): `edge_id` hashes the provenance STABLE KEY (core edge id; structural target; commit sha plus rule; rag query) rather than the full provenance struct. Reviewer confirms this is the correct reading of contract section 2 - "content hash of (src, dst, relation, tier, provenance key)" names the key, not the struct - and the only reading compatible with "re-derivation of the same edge yields the same id": full-struct hashing would mint new ids on every re-ingestion (payload hashes, blob hashes, byte spans, rag rank/score are volatile by design) and break the GUI's animate-by-id guarantee. The `edge_id_ignores_volatile_provenance_fields` test pins the behavior. Consequence to carry forward: `Provenance::stable_key` is now identity-bearing - any change to its composition is an id-breaking change requiring contract review, not a refactor.

## W01P01-002 | low | corrupt event rows degrade silently to empty node id lists

`events_in_range` parses the stored node-ids JSON with a default-on-failure fallback, so a corrupt row yields an event with an empty `node_ids` list instead of an error. The store is cache-not-truth, so no data is lost, but the failure is invisible: the timeline's click-to-pulse join (contract section 5 names `node_ids` as load-bearing) would silently stop working for affected events. Recommend surfacing parse failure as a `StoreError` variant (or at minimum a counted warning) when the event-bucketing step W02.P07.S33 builds on this read path.

## W01P01-003 | low | repeated same-target mentions collapse to one edge id - multiplicity decision belongs to W02.P05.S20

`Provenance::DocumentBody::stable_key` keys on the resolved target only, so two mentions of the same file in one document produce identical edge ids and collapse to one edge (byte spans differ but are volatile by design, per finding 001). Collapsing is defensible - it is the same logical edge - but the multiplicity information (mention count) is then carried by nothing. Core's declared payload preserves `multiplicity` explicitly; the structural tier should make an equivalent, deliberate choice. Recorded here as a named input to step W02.P05.S20 (edge ingestion): aggregate a multiplicity count on the edge, or document that structural multiplicity is intentionally not tracked.

## W01P01-004 | low | canonical-key separator characters are unescaped

Node id composition uses `:` (kind prefix), `/` (plan container), and `#` (code symbol qualifier) as structural separators without escaping. A repository path containing `#` would alias a symbol-qualified id (`code:a#b.rs` is ambiguous between path `a#b.rs` and path `a` symbol `b.rs`). Vault stems and feature tags cannot contain these characters by core's conventions, and paths containing `#` are rare, so this is low - but the constraint is currently implicit. Recommend either documenting the assumption on `CanonicalKey` (reject or escape pathological paths at construction) when `ingest-struct` starts minting code-artifact keys in W01.P04.

## Recommendations

- Close W01.P01; no blocking findings.
- Fold W01P01-002 (loud parse failure) into the W02.P07 read path work; do not let the silent fallback survive into the bucketing implementation.
- Carry W01P01-003 verbatim into the W02.P05.S20 step record as a design input; the executor must make the multiplicity choice explicitly, not inherit it.
- Address W01P01-004 with a doc comment or constructor guard when W01.P04 begins minting code-artifact keys.
- The flagged-deviation discipline worked exactly as the plan's Description intends (deviation surfaced with the decision id, reviewed, resolved without an ADR change); keep it.

## Codification candidates



No codification candidates from this phase. W01P01-001's "stable_key is identity-bearing" constraint is a candidate-in-waiting, but this is its first encounter; per the codify discipline a lesson qualifies only after holding across at least one full execution cycle. Revisit at the W03 contract-surface reviews.
