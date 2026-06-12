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

**Second entry (same date, rolling log):** wave-boundary review of phases W01.P02 (git landscape mapping, commit `9cfabd4`), W01.P03 (core declared-graph adapter, commit `e0d039b`), and W01.P04 (structural extraction, commit `52ec915` - Wave W01 complete). Surfaces audited: `engine/crates/ingest-git/src/` (workspace, worktrees, branches, log), `engine/crates/ingest-core/src/` (runner, graph_v2, inventory), `engine/crates/ingest-struct/src/` (reader, extract, resolve, lib), fixtures and integration tests, step records and phase summaries. Reviewer independently re-ran fmt, clippy `-D warnings`, and the full test suite at HEAD: green, 52 tests passing.

Verdict on W01.P02-P04: **all three phases approved for closure; Wave W01 closes** - with two medium findings (W01P04-101, W01P02-102) that MUST be resolved early in Wave W02, before the facets and event-log steps consume the affected values. Conformance highlights: workspace identity is common-git-dir with worktree-equality proven by fixture (D2.1); remote refs carry explicit degraded-tier flags (D2.2); classification is advisory, configurable, and provably lazy via the probe counter (D2.3); everything is gix, no libgit2, no shelling out, with fixture-building via the git CLI correctly argued as outside D2.5's scope; schema pinning fails loud naming both sides (D5.1); declared edges preserve core's kind/multiplicity/weight verbatim with derived edges as a distinct relation at 0.8, never mixed; edge ids proven stable across payload changes; broken structural mentions retained as signal (D3.3); fenced code blocks opaque to extraction; the dirty-state semantics call (untracked files count as divergence) was correctly flagged in the S07 record rather than silently chosen - approved, untracked vault documents are exactly the divergence the landscape must report.

Verdict (first entry): **phase approved for closure.** Intent conformance is strong: the type vocabulary matches ADR section 3 and 4 exactly (one edge schema, mandatory tier and provenance, key-plus-facet node identity); id derivation matches contract section 2; the store matches ADR section 8 (cache-not-truth, content-hash keys, WAL single-writer/concurrent-reader, loud schema-version failure mirroring the D5.1 posture). Tests are substantive, not tautological: FNV-1a verified against standard vectors, identity-component discrimination covered, reader write-rejection asserted by connection flags. All findings below are low severity; none block closure.

## Findings

## W01P01-001 | low | edge-id-over-provenance-stable-key design call is APPROVED

The executor's flagged deviation question (step S03 record): `edge_id` hashes the provenance STABLE KEY (core edge id; structural target; commit sha plus rule; rag query) rather than the full provenance struct. Reviewer confirms this is the correct reading of contract section 2 - "content hash of (src, dst, relation, tier, provenance key)" names the key, not the struct - and the only reading compatible with "re-derivation of the same edge yields the same id": full-struct hashing would mint new ids on every re-ingestion (payload hashes, blob hashes, byte spans, rag rank/score are volatile by design) and break the GUI's animate-by-id guarantee. The `edge_id_ignores_volatile_provenance_fields` test pins the behavior. Consequence to carry forward: `Provenance::stable_key` is now identity-bearing - any change to its composition is an id-breaking change requiring contract review, not a refactor.

## W01P01-002 | low | corrupt event rows degrade silently to empty node id lists

`events_in_range` parses the stored node-ids JSON with a default-on-failure fallback, so a corrupt row yields an event with an empty `node_ids` list instead of an error. The store is cache-not-truth, so no data is lost, but the failure is invisible: the timeline's click-to-pulse join (contract section 5 names `node_ids` as load-bearing) would silently stop working for affected events. Recommend surfacing parse failure as a `StoreError` variant (or at minimum a counted warning) when the event-bucketing step W02.P07.S33 builds on this read path.

## W01P01-003 | low | repeated same-target mentions collapse to one edge id - multiplicity decision belongs to W02.P05.S20

`Provenance::DocumentBody::stable_key` keys on the resolved target only, so two mentions of the same file in one document produce identical edge ids and collapse to one edge (byte spans differ but are volatile by design, per finding 001). Collapsing is defensible - it is the same logical edge - but the multiplicity information (mention count) is then carried by nothing. Core's declared payload preserves `multiplicity` explicitly; the structural tier should make an equivalent, deliberate choice. Recorded here as a named input to step W02.P05.S20 (edge ingestion): aggregate a multiplicity count on the edge, or document that structural multiplicity is intentionally not tracked.

## W01P01-004 | low | canonical-key separator characters are unescaped

Node id composition uses `:` (kind prefix), `/` (plan container), and `#` (code symbol qualifier) as structural separators without escaping. A repository path containing `#` would alias a symbol-qualified id (`code:a#b.rs` is ambiguous between path `a#b.rs` and path `a` symbol `b.rs`). Vault stems and feature tags cannot contain these characters by core's conventions, and paths containing `#` are rare, so this is low - but the constraint is currently implicit. Recommend either documenting the assumption on `CanonicalKey` (reject or escape pathological paths at construction) when `ingest-struct` starts minting code-artifact keys in W01.P04.

## W01P04-101 | medium | two hash namespaces behind one blob-hash field

`read_from_worktree` fills `DocumentBody::blob_hash` with the engine's FNV content hash of the bytes, while `read_from_ref` fills the same field with the git blob id (SHA-1). Identical content therefore carries two different identities depending on which read path produced it. This breaks exactly the comparisons Wave W02 is about to build: facet reconciliation (step W02.P05.S21) compares content hashes across corpus views to surface divergence (D4.2) - a worktree view and a ref view of byte-identical content would falsely report divergence - and the content-hash cache keying (D2.4) will fail to dedupe across the two paths. Fix before W02.P05.S21: one hash function on both paths. Computing the git-style blob object id over worktree bytes is the natural choice (it makes worktree reads directly comparable to ref reads and to what blob-true as-of will see); hashing the blob data with the engine hash on both paths also works. Either way, document the chosen namespace on the field.

## W01P02-102 | medium | commit timestamps are seconds; the model and store speak milliseconds

`CommitEvent::ts` is seconds since the Unix epoch (gix commit time), while `engine_model::Timestamp` is documented as milliseconds and the store's event log and semantic TTL comparisons take the same i64 channel. The unit mismatch is currently latent because nothing joins the two yet - which is precisely why it must be killed now: step W02.P06.S28 persists commit events into the event log, and a seconds-vs-milliseconds confusion there corrupts every downstream temporal surface (bucketing, as-of, the timeline) by a factor of a thousand. Fix at the seam: convert to milliseconds where `CommitEvent` is built (or make `Timestamp` a newtype with explicit constructors), and add one test that a persisted commit event round-trips with the model unit.

## W01P03-103 | low | core-derived edges drop weight and signals

`DeclaredEdge` preserves core's `kind`/`multiplicity`/`weight` verbatim, but the `derived_edges` path discards core's `weight` and `signals` attributes (the fixture test shows weight 2.7 in, nothing out). The ADR only mandates the distinct relation and the 0.8 confidence, so this is conformant - but the GUI sizes and ranks by relatedness strength, and core computed a strength we throw away. Either carry the derived weight alongside (a `CoreDerivedEdge` wrapper mirroring `DeclaredEdge`) or record in the W02.P05.S20 step record that derived strength is deliberately untracked in v1.

## W01P04-104 | low | per-mention file scans in symbol resolution

`resolve_symbol` re-reads every code file in the inventory for each symbol mention, so a document with N symbol mentions costs N full scans of the scope's code files. Fine at fixture scale, hostile at repository scale, and W02.P06's incremental pipeline will call this per dirtied document. Cheap fix when the pipeline lands: read each candidate file once per `resolve()` call (memoize contents or pre-build a per-call text cache); the store's derived-artifact cache then absorbs the cross-run cost. Also note `walk()` does not honor gitignore beyond a hardcoded skip list - acceptable v1, but stale resolutions against generated files will eventually confuse operators; revisit with the watcher work.

## W02P05-201 | low | broken-edge confidence 0.0 is APPROVED, with a surfacing consequence

The executor's flagged call (the ADR's structural band names no number for broken): broken edges ingest at confidence 0.0 - floor, unmistakably flagged, still retained. Approved: confidence answers "how strongly does this link hold right now", and a broken link holds not at all; the *signal* lives in the resolution state, which is exactly why D3.3 retains the edge. Consequence to carry into the surfaces: any min-confidence filter above zero will hide broken edges by arithmetic, so the structural-state filter facet (contract section 4) is the canonical channel for surfacing them, and the GUI's "show broken" lens must select on state without also applying a confidence floor. Recorded for the W03.P11 filter implementation and communicated to the GUI side.

## W02P05-202 | medium | multiplicity aggregation is not idempotent across re-ingestion - gate for W02.P06

`insert_validated_edge` increments multiplicity on every same-id ingestion. On a fresh build that is exactly the W01P01-003 decision (N mentions of one target = multiplicity N). But the increment has no idempotence key: when W02.P06.S26 re-ingests a dirtied document (or a watcher fires twice), the same N mentions arrive again and multiplicity inflates to 2N, monotonically per re-index. This also threatens D8.2 directly - an incrementally-maintained graph would not converge to the cold-rebuild graph, and the S29 re-derivability test would rightly fail. Fix before W02.P06.S26 lands: make re-ingestion replace rather than accumulate at a defined granularity (drop edges per (scope, source document) before re-extracting, or aggregate multiplicity at extraction time and pass the count once via the ingestion attributes instead of N repeated ingest calls). Either preserves the multiplicity decision while making re-index idempotent.

## W02P05-203 | low | meta-edge aggregation is a full-graph scan per call

`meta_edges` walks every edge and cross-products endpoint feature tags on each invocation. Fine at vault scale today and correct-by-construction; once the serve mode makes this the constellation hot path (W03.P11), consider memoizing per index generation rather than per request. No action in W02.

## W02P06-301 | medium | unresolved-target identity is minted from resolution output, churning ids across state transitions

In the structural edge builder, the destination node id for step and symbol mentions embeds the resolution *result*: an unresolved step mention mints `plan:unresolved/{step}` and an unresolved symbol mints `code:unresolved#{symbol}`, while the same mention once resolved mints the real plan-stem or path key. Two consequences: (a) a mention transitioning broken to resolved (the file appears, the plan lands) changes its destination node id and therefore its edge id - but the design treats resolution state as a mutable property of a *retained* edge (D3.3), and the contract promises ids stable across time for the GUI's animate-by-id; a state transition should re-state the edge, not delete-and-mint; (b) all unresolved step mentions across different intended plans share the `unresolved` placeholder namespace. Decide before W02.P08 exposes ids on the query surface, and record the choice in the step record: either derive destination identity from the mention text alone (resolution only updates state and a `target` attribute - matches how path and wiki-link mentions already behave), or introduce an explicit unresolved-target node kind keyed by mention text and accept id churn at the moment a link first becomes real, documented as such. The first option is more consistent with the retained-edge model; the second is more honest about "this node did not exist yet". Reviewer leans first option.

## W02P06-302 | low | the idempotence property now lives in the pipeline shape - protect it at the serve seam

W02P05-202 is closed structurally: every index run builds a fresh graph, so same-id re-observation inflation cannot occur across runs, and S29 proves convergence including warm-cache runs. The property is currently a consequence of pipeline shape, not an enforced invariant: the watcher hands dirty batches to a consumer that re-runs the indexer fresh. When the serve mode wires partial re-ingestion (W03.P11), it must preserve rebuild-at-scope granularity (or scope-scoped edge replacement) rather than ingesting deltas into a live graph - otherwise 202 returns. Recorded as a named constraint for the serve-mode step.

## W02P06-303 | medium | re-ingestion replaces but never prunes - removed mentions leave stale edges in a live graph

Follow-up to the W02P05-202 closure at `f63f92e` (verified: extraction-granularity multiplicity aggregation, REPLACE-never-increment ingestion, and a double re-ingestion convergence test - the gate is closed for same-id re-observation). The residual: nothing prunes. When an *edited* document is re-ingested through the re-entrant partial path, edges whose mentions were REMOVED from the body persist in the live graph, while a cold rebuild would not contain them - the same D8.2 divergence as 202, through disappearance instead of inflation. Invisible today (the one-shot CLI builds fresh graphs); bites exactly when the watcher wires the re-entrant path onto a long-lived graph. Gate for that wiring (W03.P11 or wherever the watcher consumes the partial path): before re-ingesting a document, drop the graph's edges whose provenance names that source document (per-document replacement, the granularity the provenance blob already identifies), and extend the convergence test with an edit-that-removes-a-mention case - the current test only re-ingests identical content.

## Recommendations

- Close W01.P01; no blocking findings.
- Fold W01P01-002 (loud parse failure) into the W02.P07 read path work; do not let the silent fallback survive into the bucketing implementation.
- Carry W01P01-003 verbatim into the W02.P05.S20 step record as a design input; the executor must make the multiplicity choice explicitly, not inherit it.
- Address W01P01-004 with a doc comment or constructor guard when W01.P04 begins minting code-artifact keys.
- The flagged-deviation discipline worked exactly as the plan's Description intends (deviation surfaced with the decision id, reviewed, resolved without an ADR change); keep it.

Wave W01 boundary (second entry):

- Close W01.P02, W01.P03, and W01.P04; Wave W01 is complete. W02 may begin.
- HARD GATE into W02: resolve W01P04-101 (one blob-hash namespace) before W02.P05.S21 builds facet reconciliation on the field, and W01P02-102 (milliseconds at the CommitEvent seam) before W02.P06.S28 persists commit events. Both are one-seam fixes today and corpus-wide corrections later.
- W01P03-103: make the derived-weight choice explicit in the W02.P05.S20 record (carry it or document it untracked), alongside the W01P01-003 multiplicity decision already routed there.
- W01P04-104: fold per-call content memoization into the W02.P06 pipeline work; no action inside W01.

W02.P05 boundary (third entry):

- Close W02.P05; carries W01P01-003 and W01P03-103 are confirmed resolved in the S20 record (multiplicity tracked as aggregated observation count; derived weight carried on the edge attributes). Edge-boundary enforcement including the outright rejection of semantic edges as graph fact (D3.5) is exemplary.
- W02P05-201: broken confidence 0.0 approved; the state facet is the broken-surfacing channel - no confidence floor on the broken lens (GUI side notified).
- HARD GATE into W02.P06.S26: resolve W02P05-202 (idempotent re-ingestion) before incremental re-index lands; the S29 re-derivability test must assert convergence of incremental-vs-cold builds, not only cold-vs-cold.
- W02P05-203: no action until W03.P11; revisit at the serve-mode review.

W02.P06 boundary (fourth entry):

- Close W02.P06. Carries W01P01-002 (loud corrupt-row error, typed and tested) and the W02P05-202 gate (fresh-graph-per-run, S29 proves cold/warm/deleted convergence with id stability) are CLOSED. The S29 test is exactly the D8.2 verification clause the plan demanded.
- W02P06-301 (medium): decide unresolved-target identity before W02.P08 exposes ids; reviewer leans mention-derived identity with resolution as mutable state. Record the choice in the consuming step record.
- W02P06-302: rebuild-at-scope granularity is a named constraint for the W03.P11 serve wiring.
- W01P04-104: agreed - fold into the W03.P12 hardening pass (per-call memoization plus gitignore honoring), now formally routed there.
- Post-crossing addendum: W02P05-202 verified CLOSED at `f63f92e` (replace semantics, extraction-granularity aggregation, incremental-vs-cold convergence test). W02P06-302 is superseded by that invariant for same-id re-observation; its remaining substance is narrowed into W02P06-303 (prune-on-re-ingest), the gate for the watcher wiring.

## Codification candidates



No codification candidates from this phase. W01P01-001's "stable_key is identity-bearing" constraint is a candidate-in-waiting, but this is its first encounter; per the codify discipline a lesson qualifies only after holding across at least one full execution cycle. Revisit at the W03 contract-surface reviews.
