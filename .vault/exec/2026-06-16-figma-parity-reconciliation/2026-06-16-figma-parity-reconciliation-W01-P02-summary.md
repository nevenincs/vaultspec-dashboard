---
tags:
  - '#exec'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-22'
related:
  - "[[2026-06-16-figma-parity-reconciliation-plan]]"
---

# `figma-parity-reconciliation` `W01.P02` summary

Phase W01.P02 froze and documented the preserved stores plus SceneController contract as the rewrite API surface, enriched the node-evidence projection to the GUI shape, added the bounded read-only historical text-diff engine route with tiers carriage, and mock-mirrored both new wire shapes with byte-for-byte conformance tests. All eight Steps (S11 to S18) are closed. The two preserved layers (the Rust engine and `frontend/src/stores/`) stay consumed unchanged except through the reviewed enrichment; the engine work stays read-and-infer with no vault writes and no ref mutation.

- Created: the figma-parity-reconciliation contract reference documenting the frozen stores hooks and the SceneController command and event channel (S11, S12)
- Modified: `engine/crates/engine-query/src` (the Evidence to NodeEvidence projection) and the git log module (a per-sha `subjects_for` lookup), plus evidence and serde tests (S13)
- Modified: `engine/crates/vaultspec-api/src/routes/ops.rs` (the `histdiff` two-rev whitelist verb, the `validate_rev` guard, and the tiers-carriage verification test) (S14, S15)
- Modified: `frontend/src/testing/` mock engine and the wire client `opsGit` seam (S16, S17)
- Modified: the `liveAdapters` conformance suite feeding captured live samples through the shared client adapter path (S18)

## Description

S11 and S12 are documentation-only: they froze the preserved stores-layer surface (the wire client and envelope primitives, the single tiers reader, the read hooks by domain, the interpreted-view siblings, the view stores as the intent surface, and the hard no-fetch/no-raw-tiers/no-per-view-shape boundary) and the locked SceneController command/event channel (the data shapes, the frozen inbound command union and outbound event union member-by-member, and the anchor and lifecycle surface) as the rewrite-consumable API. No stores signature, data shape, or controller union was modified.

S13 enriched the engine Evidence projection to the GUI NodeEvidence shape: documents become `{ path, doc_type }` resolved from the node's doc_type and a `.vault/<doc_type>/<stem>.md` path; the code-location field is corrected to serialize `target` as `path` with optional `symbol` and `line`, retaining the navigable resolved-target value-adds; and commits gain a `subject` filled at the route seam from a new read-only per-sha `subjects_for` git lookup, all through the shared envelope helper so the tiers block rides the response. S14 added the bounded `histdiff` route as a two-rev `git diff <from> <to> -- <path>` whitelist extension with a `validate_rev` guard (rejecting empty tokens, leading-dash flag injection, range expressions, and whitespace) reusing the existing capped-and-timed git runner; S15 verified the route carries the tiers block on both success and error envelopes through the shared helper with a dedicated test.

S16 and S17 mirrored both new shapes in the mock engine byte-for-byte (the enriched evidence with its additive value-adds and a symbol-bearing code location, and the `histdiff` verb with its verbatim two-rev diff and identical rev-and-path validation 400s), extending the wire-client `opsGit` seam for the new verb. S18 added conformance tests feeding captured live samples of both shapes through the same `EngineClient` adapter path the app uses, paired with mock-driven tests, proving the mock mirrors live: 54 `liveAdapters` tests and 24 mockEngine tests pass.

## Verification

Every file this phase authored or modified passes eslint, prettier, and tsc; the engine crates build with `cargo fmt --check` and `cargo clippy -D warnings` clean on the touched crates, and the engine evidence, ops, and ingest-git tests pass. Steps shipped as commits: `94ac531` (S11), `480cee6` (S12), `b0612d6` (S13), `b510d42` (S14), `d382a91` (S15), `ffa334b` (S16), `477b9e2` (S17), `13211c9` (S18). Wave W01 was reviewed PASS with no CRITICAL or HIGH findings.

## Carried forward

Two carry-forward notes. First, a LOW-1 review note: the mock evidence value-add fields would benefit from a `confidence` field added before the W02 Inspector rewrite consumes the enriched evidence, so the Inspector renders against the complete shape. Second, the mock engine path: the plan rows name `frontend/src/stores/server/mockEngine.ts`, but the mock has been relocated to `frontend/src/testing/`; the actual file under the testing module was used, and downstream rows referencing the old path should follow the relocation.
