---
tags:
  - '#plan'
  - '#graph-viz-quality'
date: '2026-06-16'
modified: '2026-06-16'
tier: L3
related:
  - '[[2026-06-16-graph-viz-scorecard-adr]]'
  - '[[2026-06-16-graph-node-representation-adr]]'
  - '[[2026-06-16-graph-viz-quality-research]]'
---

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the
       related: field above.
     - The related: field carries the AUTHORISING documents
       (ADR, research, reference, prior plan) for every Step in
       this plan. Steps inherit this chain; per-row reference
       footers do not exist.
     - NEVER use [[wiki-links]] or markdown links in the
       document body. -->

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #plan) and one feature tag.
     Replace graph-viz-quality with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     tier is mandatory for new plans. Allowed: L1, L2, L3, L4.
     L1 = Steps only. L2 = Phases above Steps. L3 = Waves above
     Phases above Steps. L4 = Epic above Waves above Phases above
     Steps; PM association required. Pre-existing plans without this
     field default to L2.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'. The related field
     carries the AUTHORIZING documents (ADR, research, reference, prior
     plan) for every Step in this plan; Steps inherit this chain;
     per-row reference footers do not exist.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->


<!-- HIERARCHY AND TIERS:
     Epic > Wave > Phase > Step. Step is the canonical leaf-row
     noun. Execution Record artifact: <Step Record>.
     Tier is declared in frontmatter as tier: L1/L2/L3/L4
     (mandatory for new plans; pre-existing plans without the
     field default to L2 and the writer adds the field on first
     edit). The tier selects containers:
       L1 = Steps only.
       L2 = Phases above Steps.
       L3 = Waves above Phases above Steps.
       L4 = Epic above Waves above Phases above Steps; MUST declare
            a project-management association in the Epic intent
            block prose.
     Selection is by complexity criteria, not container counting.
     Writer never invents containers to qualify a tier. -->

<!-- IDENTIFIERS AND ROW CONTRACT:
     S##, P##, W## are flat, per-document, append-only, immutable.
     Promotion adds containers without renumbering. Gaps are not
     reused.
     Display paths are computed from current grouping:
       Step path:    L1 S##   L2 P##.S##   L3/L4 W##.P##.S##
       Phase heading:        L2 P##       L3/L4 W##.P##
       Wave heading:                      L3/L4 W##
     Row format:
       - [ ] `<display-path>` - imperative-verb action; `path/to/file`.
     Two-state checkboxes only ([ ] open, [x] closed). No per-row
     reference footers; wiki-links and markdown links are forbidden
     in plan body. Authorizing documents go in the plan's `related:`
     frontmatter once.
     ASCII spaced hyphens everywhere; em-dash (U+2014) and en-dash
     (U+2013) are forbidden. Step rows within a Phase are
     contiguous. -->

<!-- NO COMPRESSION:
     N self-similar actions = N rows. Never collapse into "for each
     X, do Y" / "across all callers, do Z" / "in every module,
     replace W". The rule applies at every tier including L1. -->

<!-- VAULTSPEC-CORE VAULT PLAN CLI:
     The `vaultspec-core vault plan` CLI is the canonical surface for
     structural manipulation of this plan document. Writers and
     executors MUST use `vaultspec-core vault plan step add/insert/move/
     remove/check/uncheck/toggle/edit`,
     `vaultspec-core vault plan phase add/move/remove/edit`,
     `vaultspec-core vault plan wave add/move/remove/edit`,
     `vaultspec-core vault plan epic intent`, and
     `vaultspec-core vault plan tier promote/demote` for every
     identifier-affecting change rather than hand-editing the row
     grammar. Hand edits are tolerated by the parser but flagged by
     `vaultspec-core vault plan check`; canonical-identifier preservation is
     guaranteed only when the CLI performs the mutation. Run
     `vaultspec-core vault plan --help` for the full subcommand
     surface. -->

# `graph-viz-quality` plan

Drive the dashboard graph backend to production-ready across all six layouts and build the quality-quantifying scorecard that proves it.

## Wave `W01` - Scorecard harness and calibration (the instrument)

Build the standing layout-quality scorecard harness client-side per the scorecard ADR: deterministic seeded ground-truth generators (SBM, LFR-style, synthetic layered trees and DAGs, make_blobs mixtures) on a mulberry32 PRNG, one per-family metric module and one *Gate.ts per layout mirroring semanticGate.ts, scorecard-vector output with per-metric thresholds and METRIC_VERSION, a one-shot multi-seed calibration script emitting committed thresholds, and a perturb-known-good self-test asserting monotonic score decay. Every metric is bounded at its call site and deterministic. This Wave is the instrument every downstream Wave measures against; it lands first and W03, W04, and W06 depend on it.

### Phase `W01.P01` - Ground-truth generators and PRNG

Build the deterministic seeded ground-truth fixture generators every metric scores against.

- [x] `W01.P01.S01` - Add a seeded mulberry32 PRNG and shared deterministic helpers (Gaussian, shuffle, stable tie-break) used by every generator and metric; `frontend/src/scene/field/scorecard/prng.ts`.
- [x] `W01.P01.S02` - Implement the Stochastic Block Model generator emitting a graph plus its ground-truth community partition keyed by intra/inter edge probability; `frontend/src/scene/field/scorecard/generators/sbm.ts`.
- [x] `W01.P01.S03` - Implement an LFR-style benchmark generator with power-law degree, community sizes, and a mixing parameter mu, returning the planted partition; `frontend/src/scene/field/scorecard/generators/lfr.ts`.
- [x] `W01.P01.S04` - Implement synthetic layered-tree and layered-DAG generators recording each node's true layer for hierarchy, radial, and lineage scoring; `frontend/src/scene/field/scorecard/generators/layered.ts`.
- [x] `W01.P01.S05` - Implement the make_blobs-style high-dimensional mixture generator with known labels, generalizing buildGateSlice for semantic scoring; `frontend/src/scene/field/scorecard/generators/blobs.ts`.
- [x] `W01.P01.S06` - Add a generator unit test asserting byte-reproducible output across re-runs for every generator at a fixed seed; `frontend/src/scene/field/scorecard/generators/generators.test.ts`.

### Phase `W01.P02` - Per-family metric modules

Implement the per-layout-family metric sets, each normalized to [0,1] with 1 = best.

- [x] `W01.P02.S07` - Add shared metric primitives: scale-normalized stress with closed-form optimal alpha, sampled node-pair estimation, and a fixed-k coranking corner helper; `frontend/src/scene/field/scorecard/metrics/shared.ts`.
- [x] `W01.P02.S08` - Implement the force/Free metric module: scale-normalized stress, neighborhood preservation, node-resolution overlap, edge-length CV, and crossings/crossing-angle via greadability; `frontend/src/scene/field/scorecard/metrics/forceMetrics.ts`.
- [x] `W01.P02.S09` - Implement the Sugiyama metric module for lineage and hierarchy: per-adjacent-layer crossings, dummy/bend count, edge monotonicity, total edge length, and layer-assignment correctness; `frontend/src/scene/field/scorecard/metrics/sugiyamaMetrics.ts`.
- [x] `W01.P02.S10` - Implement the radial/tree metric module: subtree disjointness, wedge and ring uniformity, depth-to-radius Spearman, node overlap, and near-zero crossings; `frontend/src/scene/field/scorecard/metrics/radialMetrics.ts`.
- [x] `W01.P02.S11` - Implement the clusters/Louvain metric module: Meidiana geometric-partition ARI and AMI versus the partition, within-cluster compactness, between-cluster silhouette, and modularity Q; `frontend/src/scene/field/scorecard/metrics/clusterMetrics.ts`.
- [x] `W01.P02.S12` - Implement the semantic metric module: trustworthiness, continuity, Q_NX with LCMC-chosen K, neighborhood-hit NH(k), silhouette by tag, and nearest-centroid accuracy; `frontend/src/scene/field/scorecard/metrics/semanticMetrics.ts`.
- [x] `W01.P02.S13` - Add greadability.js as a frontend dependency and a thin typed wrapper exposing crossings and crossing-angle in [0,1]; `frontend/src/scene/field/scorecard/metrics/greadability.ts`.

### Phase `W01.P03` - Gate family, scorecard output, and METRIC_VERSION

Wrap each layout in a *Gate.ts emitting a scorecard vector with per-metric thresholds and a versioned metric contract.

- [x] `W01.P03.S14` - Define the scorecard vector type, the per-metric threshold/margin/pass-fail record, the seed echo, and the METRIC_VERSION contract constant; `frontend/src/scene/field/scorecard/scorecard.ts`.
- [x] `W01.P03.S15` - Add the forceGate wrapping the real force layout module, generating a fixed-seed fixture, scoring, and emitting the scorecard vector with bounded accumulators; `frontend/src/scene/field/forceGate.ts`.
- [x] `W01.P03.S16` - Add the lineageGate and hierarchyGate wrapping the real Sugiyama layout modules and scoring against the planted-layer fixtures; `frontend/src/scene/field/lineageGate.ts`.
- [x] `W01.P03.S17` - Add the radialGate wrapping the real radial layout module and scoring tidy-tree invariants against the layered-tree fixture; `frontend/src/scene/field/radialGate.ts`.
- [x] `W01.P03.S18` - Add the clusterGate wrapping the real community layout and scoring detectCommunities output against the SBM and LFR planted partitions; `frontend/src/scene/field/clusterGate.ts`.
- [x] `W01.P03.S19` - Refactor semanticGate to emit the formalized scorecard vector composite while keeping the injectable clock and bounded ceiling; `frontend/src/scene/field/semanticGate.ts`.
- [x] `W01.P03.S20` - Assert each gate gates on individual per-metric thresholds and never on a reported aggregate, with a regression test pinning METRIC_VERSION; `frontend/src/scene/field/scorecard/scorecard.test.ts`.

### Phase `W01.P04` - Calibration script and perturbation self-test

Discover committed thresholds via a one-shot multi-seed calibration sweep and validate every metric with a perturb-known-good monotonic-decay self-test.

- [x] `W01.P04.S21` - Write the one-shot multi-seed calibration script sweeping difficulty (SBM p/q, LFR mu, blob cluster_std) and emitting current-good-minus-margin thresholds; `frontend/src/scene/field/scorecard/calibrate.ts`.
- [x] `W01.P04.S22` - Commit the calibrated threshold constants and METRIC_VERSION as the gate baseline, never auto-recalibrated by the gate; `frontend/src/scene/field/scorecard/thresholds.ts`.
- [x] `W01.P04.S23` - Add the perturb-known-good self-test jittering a correct layout and asserting every metric degrades monotonically before it is trusted to gate; `frontend/src/scene/field/scorecard/perturbation.test.ts`.
- [x] `W01.P04.S24` - Add a calibration-script smoke test confirming the sweep is deterministic and the committed thresholds reproduce; `frontend/src/scene/field/scorecard/calibrate.test.ts`.

## Wave `W02` - Node-representation wire completeness

Close the representation seams the node-representation ADR decides so the layouts and the scorecard consume honest data: join embeddings to nodes by node_id in the client adapter (D1) with a contract-reference amendment and a mock that mirrors it, call ontology derivation_label in the /graph/lineage arc and widen the PlanContainer and exec-container predicate with honest nulls elsewhere (D3), add the client-side radial-root max-degree fallback when salience is absent (D4), affirm the community partition stays client-side and is scored from detectCommunities output (D5), and surface a linkage-coverage figure to the scorecard (D6). Largely parallel with W01; W03 depends on both.

### Phase `W02.P05` - Embedding node_id join contract (D1)

Make the embedding-to-node join keyed by node_id in the adapter, amend the contract reference, and mirror it in the mock.

- [x] `W02.P05.S25` - Change the embedding-to-node join in the client adapter to key by node_id rather than positional order, treating a missing vector as an honest absence; `frontend/src/stores/server/liveAdapters.ts`.
- [x] `W02.P05.S26` - Amend the contract reference to state embeddings are a node_id-keyed subset of the node set, removing the DOI-order coupling note; `.vault/reference/2026-06-12-dashboard-foundation-reference.md`.
- [x] `W02.P05.S27` - Update the mock engine to serve /graph/embeddings as a node_id-keyed subset byte-for-byte matching the live wire shape; `frontend/src/stores/server/mockEngine.ts`.
- [x] `W02.P05.S28` - Add a consumer test feeding a captured live embeddings sample through adaptGraphSlice and asserting the node_id join, including a node with no vector; `frontend/src/stores/server/liveAdapters.test.ts`.

### Phase `W02.P06` - Derivation labeling completeness (D3)

Call derivation_label in the lineage arc and widen the container predicate with honest nulls elsewhere.

- [x] `W02.P06.S29` - Call ontology derivation_label in the /graph/lineage lineage_arc, replacing the hardcoded derivation None and removing the stale comment; `engine/crates/engine-query/src/lineage.rs`.
- [x] `W02.P06.S30` - Widen the edge_view container-path predicate to fire when the src node kind is PlanContainer and the dst is an exec-record, reading node.kind not only doc_type; `engine/crates/engine-query/src/graph.rs`.
- [x] `W02.P06.S31` - Confirm the widened detection stays out of every edge stable key with a test asserting the derivation label never enters edge_id; `engine/crates/engine-query/src/ontology.rs`.
- [x] `W02.P06.S32` - Add an engine test asserting the PlanContainer-to-exec spine is labeled generated-by and unrelated combos stay honest null; `engine/crates/engine-query/tests/derivation_labeling.rs`.

### Phase `W02.P07` - Radial-root fallback, community client-side affirmation, linkage coverage (D4/D5/D6)

Add the radial-root max-degree fallback, affirm and score the client-side community partition, and surface linkage coverage to the scorecard.

- [x] `W02.P07.S33` - Add the radial-root max-degree fallback selecting the maximum-degree node when salience is absent, with an explicit selected node still overriding; `frontend/src/scene/field/radialLayout.ts`.
- [x] `W02.P07.S34` - Affirm the Louvain partition stays client-side by scoring detectCommunities output directly in the cluster gate, with a test over the planted partition; `frontend/src/scene/field/communityLayout.test.ts`.
- [x] `W02.P07.S35` - Compute a linkage-coverage figure (embedding presence percent, derivation-label percent) per slice and surface it to the scorecard; `frontend/src/scene/field/scorecard/linkageCoverage.ts`.
- [x] `W02.P07.S36` - Add a test asserting the radial root falls back to max-degree on a feature-granularity slice and linkage coverage reports the expected figures; `frontend/src/scene/field/radialLayout.test.ts`.

## Wave `W03` - Meaning activation on a measured gate

Promote the real-data semantic composite (formalized in the scorecard) to the SHIPPING Meaning verdict per node-representation D2 and semantic-embeddings D6: wire runSemanticGateOnRealData as the verdict, retain the synthetic fixture only as the determinism and time guard, read held state from the tiers block, ensure the served workspace is rag-indexed and live-verify the constellation renders against real embeddings, and calibrate thresholds to the measured 808-vector baseline. Depends on W01 (the composite metrics) and W02 (the node_id join contract).

### Phase `W03.P08` - Promote the real-data composite to the shipping verdict

Wire runSemanticGateOnRealData as the Meaning verdict, retain the synthetic fixture as a determinism and time guard, and read held state from tiers.

- [x] `W03.P08.S37` - Wire runSemanticGateOnRealData as the shipping Meaning verdict using the formalized scorecard composite, retaining the synthetic fixture only as the determinism and time guard; `frontend/src/scene/field/semanticGate.ts`.
- [x] `W03.P08.S38` - Gate Meaning availability on the embedding-presence floor plus the tiers search-tier truth, reading held state from the tiers block not an empty array; `frontend/src/stores/server/queries.ts`.
- [x] `W03.P08.S39` - Render the designed Held state when embeddings are absent so the mode degrades honestly rather than as an error; `frontend/src/scene/field/representationLayout.ts`.
- [x] `W03.P08.S40` - Add a consumer test that the real-data verdict ships on present embeddings and holds from tiers when absent; `frontend/src/scene/field/semanticGate.test.ts`.

### Phase `W03.P09` - Index the served workspace and live-verify

Ensure the served workspace is rag-indexed, calibrate to the 808-vector baseline, and live-verify the constellation renders against real embeddings.

- [x] `W03.P09.S41` - Index the served dev workspace with rag so /graph/embeddings returns real vectors, documenting the operational indexing step; `frontend/src/stores/server/devEngine.ts`.
- [x] `W03.P09.S42` - Calibrate the semantic composite thresholds to the measured 808-vector baseline and commit them under METRIC_VERSION; `frontend/src/scene/field/scorecard/thresholds.ts`.
- [x] `W03.P09.S43` - Live-verify against the running engine plus rag plus Qdrant that the constellation renders meaning-clusters on real embeddings, recording the verification in the phase summary; `.vault/exec/2026-06-16-graph-viz-quality/2026-06-16-graph-viz-quality-W03-P09-summary.md`.

## Wave `W04` - All-six algorithm verification and robustness hardening

Run the scorecard over all six layouts against the real corpus and the ground-truth fixtures, then harden every algorithm against degenerate inputs: NaN guards, empty and singleton slices, disconnected components, all-same-position degenerate inputs, large-graph at the node ceiling, force settle-then-freeze re-confirmation, lineage no-spine grid fallback, and the semantic fallback ring. Add fuzz and property tests so no algorithm glitches or crashes, and fix every defect the scorecard and the fuzzers surface. Depends on W01; consumes W02 and W03 outputs where present.

### Phase `W04.P10` - Score all six layouts over real corpus and ground truth

Run the scorecard over all six layouts against the live corpus and the seeded fixtures and capture the baseline scorecard vectors.

- [x] `W04.P10.S44` - Run the force and semantic gates over the live corpus slice and the seeded fixtures and capture baseline scorecard vectors; `frontend/src/scene/field/scorecard/runAll.ts`.
- [x] `W04.P10.S45` - Run the lineage and hierarchy Sugiyama gates over the planted-layer DAG fixtures and the live derivation slice and capture baselines; `frontend/src/scene/field/scorecard/runAll.ts`.
- [x] `W04.P10.S46` - Run the radial and cluster gates over the layered-tree and SBM/LFR fixtures and the live slice and capture baselines; `frontend/src/scene/field/scorecard/runAll.ts`.
- [x] `W04.P10.S47` - Add an all-six scorecard test asserting every layout's per-metric thresholds pass over the deterministic fixtures; `frontend/src/scene/field/scorecard/runAll.test.ts`.

### Phase `W04.P11` - Robustness hardening across degenerate inputs

Harden every layout against NaN, empty, singleton, disconnected, degenerate, and ceiling-sized inputs with the designed fallbacks.

- [x] `W04.P11.S48` - Harden the force layout: re-confirm NaN guards, settle-then-freeze, and stable output on empty, singleton, and disconnected slices; `frontend/src/scene/field/forceLayout.ts`.
- [x] `W04.P11.S49` - Harden the lineage and hierarchy layouts: no-spine grid fallback, degenerate all-same-position inputs, and cycle removal on back-edges; `frontend/src/scene/field/lineageLayout.ts`.
- [x] `W04.P11.S50` - Harden the radial layout: empty-root and singleton handling and a deterministic root when degree ties on a degenerate slice; `frontend/src/scene/field/radialLayout.ts`.
- [x] `W04.P11.S51` - Harden the community layout: singleton-community and all-isolated-nodes handling without NaN positions; `frontend/src/scene/field/communityLayout.ts`.
- [x] `W04.P11.S52` - Harden the semantic layout: fallback ring on absent embeddings, singleton-vector handling, and ceiling-sized-slice bounding; `frontend/src/scene/field/semanticLayout.ts`.
- [x] `W04.P11.S53` - Harden the representation dispatcher: large-graph at the node ceiling and honest downgradeReason on each fallback path; `frontend/src/scene/field/representationLayout.ts`.

### Phase `W04.P12` - Fuzz and property tests; fix surfaced defects

Add fuzz and property tests asserting no glitch or crash and fix every defect the scorecard and fuzzers surface.

- [x] `W04.P12.S54` - Add property tests over randomized seeded graphs asserting every layout emits finite, bounded positions with no NaN or crash; `frontend/src/scene/field/scorecard/property.test.ts`.
- [x] `W04.P12.S55` - Add a degenerate-input fuzz suite feeding empty, singleton, disconnected, and all-same-position slices to all six layouts; `frontend/src/scene/field/scorecard/fuzz.test.ts`.
- [x] `W04.P12.S56` - Fix every defect the scorecard, property, and fuzz suites surface across the six layout modules and re-run to green; `frontend/src/scene/field/representationLayout.ts`.

## Wave `W05` - Backend deferrals and feature followups

Land the remaining backend implementations the missing-backend inventory and the deferred ADRs name: wire the git-diff browser to the shipped /ops/git route (flip GIT_DIFF_CAPABILITY_SERVED and CHANGED_FILES_LIST_SERVED, wire the selectors, parse porcelain, numstat, and unified diff per the git-diff ADR), mint code: artifact nodes in engine-graph Pass 2 per the code-artifact-nodes ADR, and clean the QueryCore, Timestamp, and structural-mention doc-debt plus any residual inventory items. Mostly independent of W01 through W04; sequenced before W06.

### Phase `W05.P13` - Wire the git-diff browser to /ops/git

Flip the served constants, wire the selectors to ops git, and parse porcelain, numstat, and unified diff per the git-diff ADR.

- [x] `W05.P13.S57` - Flip GIT_DIFF_CAPABILITY_SERVED and CHANGED_FILES_LIST_SERVED to true and wire useGitFileDiff and the changed-files selectors to client.opsGit status, numstat, and diff; `frontend/src/stores/server/queries.ts`.
- [x] `W05.P13.S58` - Parse porcelain-v1 status, numstat tallies, and unified diff hunks into the typed diff shape the ChangesOverview and DiffView consume; `frontend/src/stores/server/gitDiffParse.ts`.
- [x] `W05.P13.S59` - Render the status-grouped changed-files list with status letters and the bounded hunk-by-hunk diff body with green/red gutter glyphs per the git-diff ADR; `frontend/src/app/right/DiffView.tsx`.
- [x] `W05.P13.S60` - Mirror the /ops/git status, numstat, and diff shapes in the mock and add a consumer test feeding a captured live sample through adaptGitOp; `frontend/src/stores/server/liveAdapters.test.ts`.

### Phase `W05.P14` - Mint code: artifact nodes in engine-graph Pass 2

Mint code: nodes for resolved and stale Path and Symbol mentions per the code-artifact-nodes ADR and invert the bridge dead-end repro.

- [x] `W05.P14.S61` - Mint code: nodes via idempotent upsert_node for resolved and stale Path and Symbol mentions in the engine-graph Pass 2 serial edge-ingest, beside the addressing edge; `engine/crates/engine-graph/src/index.rs`.
- [x] `W05.P14.S62` - Confirm code nodes carry doc_type code, a per-scope Exists facet, no lifecycle or tier, and are excluded from the feature constellation under MAX_GRAPH_NODES; `engine/crates/engine-query/src/graph.rs`.
- [x] `W05.P14.S63` - Invert the bridge_dead_end_repro so a resolved Path/Symbol bridge resolves a real code: id and add a broken-target repro asserting the still-null bridge; `engine/crates/engine-query/tests/bridge_dead_end_repro.rs`.
- [x] `W05.P14.S64` - Measure cold-index cost via scale_bench confirming the added upserts leave the linear cold-index profile intact at corpus scale; `engine/crates/engine-graph/benches/scale_bench.rs`.

### Phase `W05.P15` - Doc-debt cleanup and residual inventory

Clean the QueryCore, Timestamp, and structural-mention doc-debt and close any residual missing-backend-inventory items.

- [x] `W05.P15.S65` - Delete or repurpose the dead QueryCore foundation scaffold and its placeholder status and validate_scope; `engine/crates/engine-query/src/lib.rs`.
- [x] `W05.P15.S66` - Refresh the stale Timestamp placeholder comment now that the temporal tier is served, or introduce a richer time type only if needed; `engine/crates/engine-model/src/lib.rs`.
- [x] `W05.P15.S67` - Update the structural-mention extraction doc-comment to match the shipped Mention enum and refresh the residual stale deferred comments; `engine/crates/ingest-struct/src/lib.rs`.

## Wave `W06` - Production verification and Definition of Done

Close the campaign with the full quality gate and the visible goal-met artifact: run the complete gate (engine cargo fmt, clippy, and tests; frontend just dev lint frontend and the full vitest suite), verify the live stack (engine serve plus rag plus Qdrant), have the scorecard emit a committed QUALITY REPORT scoring each layout against its threshold as the quantified and visible goal-met evidence, and assert a Definition-of-Done checklist that all six layouts deliver their backend capabilities with no glitch or crash. Runs last; depends on every prior Wave.

### Phase `W06.P16` - Full gate and live-stack verification

Run the complete engine and frontend gate and verify the live stack of engine serve, rag, and Qdrant.

- [x] `W06.P16.S68` - Run the engine gate to exit 0: cargo fmt check, cargo clippy, and cargo test across the engine workspace; `engine/Cargo.toml`.
- [x] `W06.P16.S69` - Run the frontend gate to exit 0: just dev lint frontend (eslint, prettier, tsc) and the full vitest suite including the scorecard gates; `frontend/package.json`.
- [x] `W06.P16.S70` - Verify the live stack end to end: engine serve plus rag plus Qdrant answering /graph/query, /graph/embeddings, /graph/lineage, and /ops/git; `.vault/exec/2026-06-16-graph-viz-quality/2026-06-16-graph-viz-quality-W06-P16-summary.md`.

### Phase `W06.P17` - Quality report and Definition of Done

Emit the committed quality report and assert the Definition-of-Done checklist that all six layouts pass with no glitch or crash.

- [x] `W06.P17.S71` - Have the scorecard emit the committed quality report scoring each of the six layouts against its per-metric thresholds as the quantified visible goal-met artifact; `frontend/src/scene/field/scorecard/qualityReport.ts`.
- [x] `W06.P17.S72` - Commit the generated quality report fixture and assert it regenerates deterministically under the current METRIC_VERSION; `frontend/src/scene/field/scorecard/qualityReport.test.ts`.
- [x] `W06.P17.S73` - Assert the Definition-of-Done checklist that all six layouts deliver their backend capabilities with no glitch, issue, or crash, both quantifiably via the scorecard and visibly via live verification; `.vault/exec/2026-06-16-graph-viz-quality/2026-06-16-graph-viz-quality-W06-P17-summary.md`.

## Description

This plan drives the dashboard graph backend to production-ready across all six layouts (Free/force, Lineage/DAG, Hierarchy/Sugiyama, Radial, Clusters/Louvain, Meaning/semantic) and builds the quality-quantifying test framework the prior graph-viz-framework campaign never produced. It is grounded strictly in the `graph-viz-scorecard` ADR (the scorecard harness architecture: per-family metric sets, deterministic seeded ground-truth generators, client-side placement, the calibration-vs-gate split, and METRIC_VERSION as a contract event), the `graph-node-representation` ADR (D1 embedding node_id-join contract, D2 real-data composite as the semantic shipping verdict, D3 lineage-arc derivation label and predicate widening with honest nulls, D4 radial-root max-degree fallback, D5 community partition stays client-side, D6 linkage coverage), the `graph-viz-quality` research, and the `missing-backend-inventory` research plus the `code-artifact-nodes`, `graph-semantic-embeddings`, `graph-lineage-dag`, and `dashboard-git-diff-browser` ADRs that scope the deferred-backend wave.

The instrument lands first. W01 builds the scorecard harness as a client-side Vitest gate family in the scene layer, where the layout coordinates live, honoring `graph-compute-is-cpu-gpu-is-render-and-search` and `engine-read-and-infer`: the engine grows no layout-scoring semantics and serves no coordinates. Every O(N^2) metric (scale-normalized stress, the co-ranking corner) is bounded at its call site per `bounded-by-default-for-every-accumulator` (node ceiling, fixed-seed pair sampling, fixed-k), and every gating metric is deterministic (injectable clock, mulberry32 PRNG, stable tie-breaking) so it can fence CI. W02 closes the node-representation seams (additive, read-and-infer engine projections plus a client adapter join and a mock that mirrors the live wire per `mock-mirrors-live-wire-shape`). W03 activates Meaning on the measured real-data composite, reading held state from the `tiers` block per `degradation-is-read-from-tiers-not-guessed-from-errors`. W04 verifies all six against the scorecard and the ground truth and hardens every algorithm against degenerate inputs with fuzz and property tests. W05 lands the backend deferrals the inventory names. W06 runs the full gate per `declaring-green-runs-the-full-gate`, verifies the live stack, and emits the committed quality report that is the quantified and visible goal-met artifact.

The goal is met when it is quantifiably (the committed scorecard per layout passing its per-metric thresholds) and visibly (live verification against engine plus rag plus Qdrant) confirmed that all six layouts deliver their backend capabilities with no glitch, issue, or crash.

## Parallelization

Waves are sequenced by their dependency edges, not strictly serially. W01 is the instrument and is the hard prerequisite for W03, W04, and W06; it lands first. W02 (node-representation engine and adapter completeness) shares no code with W01 and runs largely in parallel with it - the two converge only at W03. Within W01 the four Phases are mostly serial: P01 (generators and PRNG) feeds P02 (metric modules), which feeds P03 (the gate family and scorecard output), which feeds P04 (calibration and the perturbation self-test); P02's per-family metric modules are themselves independent of one another and can be built concurrently. Within W02 the three Phases (P05 embedding join, P06 derivation labeling, P07 radial/community/coverage) share no hard interdependency and parallelize freely; P06 is engine-side Rust while P05 and P07 are frontend, so they can run on separate workers.

W03 depends on both W01 (the composite metrics and thresholds) and W02 (the node_id join contract) and so begins only after both land; its P08 (verdict promotion) precedes P09 (workspace indexing and live verification). W04 depends on W01 and consumes W02 and W03 outputs where present; its P10 (score all six) precedes P11 (robustness hardening) which precedes P12 (fuzz, property, and defect fixes). W05 (backend deferrals) is almost entirely independent of W01 through W04 - its three Phases (git-diff wiring, code-artifact minting, doc-debt) touch disjoint subsystems and parallelize - and is sequenced before W06 only so its capabilities are present for the final gate. W06 runs last and depends on every prior Wave: P16 (full gate and live stack) precedes P17 (quality report and Definition of Done).

## Verification

The plan is complete when every Step is closed (`- [x]`) and the following criteria hold.

- W01: each `*Gate.ts` emits a scorecard vector and gates on individual per-metric thresholds, never on a reported aggregate; the perturb-known-good self-test confirms every metric degrades monotonically under jitter; the calibration script is deterministic and its committed thresholds reproduce; every O(N^2) metric is bounded at its call site and every gating metric is deterministic under the injectable clock and mulberry32 PRNG. METRIC_VERSION is pinned by a regression test.
- W02: the embedding-to-node join is keyed by node_id with the contract reference amended and the mock mirroring the live wire shape (a consumer test feeds a captured live sample through the real adapter path); the `/graph/lineage` arc carries the derivation label and the PlanContainer-to-exec spine is labeled generated-by with honest nulls elsewhere and the label never entering any edge stable key; the radial-root max-degree fallback fires on a feature-granularity slice; the community partition is scored client-side from detectCommunities output; linkage coverage is surfaced to the scorecard. Engine and frontend gates pass.
- W03: runSemanticGateOnRealData is the shipping Meaning verdict over the formalized composite calibrated to the 808-vector baseline; the synthetic fixture remains only as the determinism and time guard; Meaning availability is read from the `tiers` block (held rendered as the designed state, never an error); the served workspace is rag-indexed and the constellation is live-verified to render meaning-clusters on real embeddings.
- W04: the scorecard passes its per-metric thresholds for all six layouts over the deterministic fixtures and the live corpus; every layout survives NaN, empty, singleton, disconnected, all-same-position, and ceiling-sized inputs with its designed fallback (force settle-then-freeze, lineage no-spine grid fallback, semantic fallback ring); the property and fuzz suites assert no glitch or crash; every surfaced defect is fixed and the suite re-runs green.
- W05: the git-diff browser renders status-grouped changes and a bounded diff body off the shipped `/ops/git` route with the served constants flipped and the mock mirroring the wire; `code:` artifact nodes are minted for resolved and stale Path and Symbol mentions with the bridge dead-end repro inverted and the broken-target repro asserting the still-null bridge, and the cold-index profile measured intact; the QueryCore, Timestamp, and structural-mention doc-debt is resolved.
- W06: the full gate is green (engine cargo fmt check, clippy, and tests; frontend `just dev lint frontend` and the full vitest suite per `declaring-green-runs-the-full-gate`); the live stack of engine serve plus rag plus Qdrant answers `/graph/query`, `/graph/embeddings`, `/graph/lineage`, and `/ops/git`; the scorecard emits the committed quality report scoring each of the six layouts against its threshold as the quantified visible goal-met artifact; the Definition-of-Done checklist asserts all six layouts deliver their backend capabilities with no glitch, issue, or crash.
