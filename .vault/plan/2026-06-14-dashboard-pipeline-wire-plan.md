---
tags:
  - '#plan'
  - '#dashboard-pipeline-wire'
date: '2026-06-14'
modified: '2026-06-14'
tier: L3
related:
  - '[[2026-06-14-dashboard-pipeline-wire-adr]]'
  - '[[2026-06-14-dashboard-activity-rail-research]]'
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
     Replace dashboard-pipeline-wire with a kebab-case feature tag, e.g. #foo-bar.
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

# `dashboard-pipeline-wire` plan

Engine read-and-infer buildout of four additive wire capabilities that unblock the review rail's Work and Changes surfaces.

## Wave `W01` - frontmatter status and tier extraction

Extend document ingest to read the ADR H1 status (proposed/accepted/rejected/deprecated) and the plan frontmatter tier (L1-L4) as query-time facets on the doc node, the same class as the existing lifecycle, doc_type, feature_tags, and dates facets. Foundational: later waves and the filter vocabulary read these facets. Backed by the dashboard-pipeline-wire ADR and the dashboard-activity-rail research F3.

### Phase `W01.P01` - status and tier frontmatter parsers

Add deterministic frontmatter parsers in engine-graph index.rs that read the ADR H1 status value and the plan tier, mirroring the existing frontmatter_date and frontmatter_feature_tags helpers.

- [x] `W01.P01.S01` - Add a frontmatter_adr_status parser that reads the H1 status value (proposed/accepted/rejected/deprecated), mirroring frontmatter_date; `engine/crates/engine-graph/src/index.rs`.
- [x] `W01.P01.S02` - Add a frontmatter_plan_tier parser that reads the frontmatter tier value (L1-L4) and rejects out-of-enum values; `engine/crates/engine-graph/src/index.rs`.
- [x] `W01.P01.S03` - Add a unit test that the status parser extracts each of the four ADR statuses and returns None for a status-less document; `engine/crates/engine-graph/src/index.rs`.
- [x] `W01.P01.S04` - Add a unit test that the tier parser extracts each of L1-L4 and returns None for a missing or invalid tier; `engine/crates/engine-graph/src/index.rs`.

### Phase `W01.P02` - facet model and node serialization

Carry status and tier on the doc node as query-time facets in engine-model, serialized on the node the same way doc_type/dates/feature_tags already are.

- [x] `W01.P02.S05` - Add an optional status field to the doc Node (or its facet) as a serialized query-time facet alongside doc_type and dates; `engine/crates/engine-model/src/lib.rs`.
- [x] `W01.P02.S06` - Add an optional tier field to the doc Node as a serialized query-time facet alongside doc_type and dates; `engine/crates/engine-model/src/lib.rs`.
- [x] `W01.P02.S07` - Populate the node status field from frontmatter_adr_status when upserting a doc node in index_structural; `engine/crates/engine-graph/src/index.rs`.
- [x] `W01.P02.S08` - Populate the node tier field from frontmatter_plan_tier when upserting a doc node in index_structural; `engine/crates/engine-graph/src/index.rs`.
- [x] `W01.P02.S09` - Add a serde round-trip test that an ADR node carries its status and a plan node carries its tier through serialization; `engine/crates/engine-model/src/lib.rs`.

### Phase `W01.P03` - filter vocabulary and extraction tests

Surface status and tier in the engine-query filter vocabulary and matches_node, with parser and serialization tests proving honest extraction.

- [x] `W01.P03.S10` - Add a statuses field to the Vocabulary struct enumerating the ADR statuses actually present in the graph; `engine/crates/engine-query/src/filter.rs`.
- [x] `W01.P03.S11` - Add a tiers-of-plans field to the Vocabulary struct enumerating the plan tiers actually present in the graph; `engine/crates/engine-query/src/filter.rs`.
- [x] `W01.P03.S12` - Add a status facet to the Filter struct and its matches_node check, validated against the known status set; `engine/crates/engine-query/src/filter.rs`.
- [x] `W01.P03.S13` - Add a plan-tier facet to the Filter struct and its matches_node check, validated against L1-L4; `engine/crates/engine-query/src/filter.rs`.
- [x] `W01.P03.S14` - Add a vocabulary test that status and plan-tier facets are enumerated, sorted, and deduped from the graph; `engine/crates/engine-query/src/filter.rs`.
- [x] `W01.P03.S15` - Add an end-to-end index test that an ingested ADR and plan carry honest status and tier through to the filter vocabulary; `engine/crates/engine-graph/src/index.rs`.

## Wave `W02` - bounded in-flight pipeline projection

Add a query-layer projection over the existing LinkageGraph returning the active pipeline artifacts in scope (active plans by lifecycle and ADRs by status) each with progress summary, status/tier facet, pipeline phase, and stable node id, bounded to active artifacts and enveloped with the tiers block, surfaced as a route. Depends on W01 (consumes the status/tier facets). Backed by the dashboard-pipeline-wire ADR and research F3/F4.

### Phase `W02.P04` - in-flight projection in engine-query

Add a bounded projection over the LinkageGraph that selects active pipeline artifacts (active plans by lifecycle, ADRs by status) with progress, status/tier, pipeline phase, and stable node id.

- [x] `W02.P04.S16` - Add a pipeline module to engine-query and register it in lib.rs alongside node, graph, and filter; `engine/crates/engine-query/src/lib.rs`.
- [x] `W02.P04.S17` - Define a PipelineArtifact struct carrying stable node id, doc_type, status, tier, progress summary, and pipeline phase; `engine/crates/engine-query/src/pipeline.rs`.
- [x] `W02.P04.S18` - Implement an in_flight projection selecting active plans by lifecycle and ADRs by status from the LinkageGraph; `engine/crates/engine-query/src/pipeline.rs`.
- [x] `W02.P04.S19` - Derive the pipeline phase (research/adr/plan/execute/review) for each artifact from its doc_type and status; `engine/crates/engine-query/src/pipeline.rs`.
- [x] `W02.P04.S20` - Bound the projection to active artifacts in scope and sort by stable id for deterministic ordering; `engine/crates/engine-query/src/pipeline.rs`.
- [x] `W02.P04.S21` - Add a projection test that a complete plan and a rejected ADR are excluded while an active plan and a proposed ADR are included; `engine/crates/engine-query/src/pipeline.rs`.

### Phase `W02.P05` - pipeline route and envelope wiring

Wire the projection to a route through the shared envelope helper with the tiers block on success and error, registered in the contract route inventory.

- [x] `W02.P05.S22` - Add a pipeline route handler that resolves scope, runs the in_flight projection, and returns it through the shared envelope helper; `engine/crates/vaultspec-api/src/routes/query.rs`.
- [x] `W02.P05.S23` - Register the GET /pipeline route in build_router; `engine/crates/vaultspec-api/src/lib.rs`.
- [x] `W02.P05.S24` - Add /pipeline to the CONTRACT_ROUTES inventory so the route and contract drift loudly; `engine/crates/vaultspec-api/src/lib.rs`.
- [x] `W02.P05.S25` - Add a route test that /pipeline returns the active artifacts with the tiers block on success; `engine/crates/vaultspec-api/src/lib.rs`.
- [x] `W02.P05.S26` - Add a route test that an unknown scope 400s with the tiers block attached, never a hand-built body; `engine/crates/vaultspec-api/src/lib.rs`.

## Wave `W03` - plan-container interior with step state

Mint plan-container structure (waves to phases to steps as first-class-but-subordinate NodeKind::PlanContainer entities) each step bearing completion and binding to its exec record, served as a bounded interior of a plan node under a node ceiling with honest truncated reporting; stable keys composed only from plan stem plus canonical wave/phase/step ids. The largest, genuinely-new capability; depends on W01 for the plan node facets it reads. Backed by the dashboard-pipeline-wire ADR, engine ADR section 4.3/D4.1, research F3.

### Phase `W03.P06` - plan-structure parser

Parse a plan document body into its canonical wave/phase/step structure with per-step completion, deterministic and bounded, in the ingest layer.

- [x] `W03.P06.S27` - Add a plan_structure module to ingest-struct and register it in lib.rs alongside extract, resolve, and reader; `engine/crates/ingest-struct/src/lib.rs`.
- [x] `W03.P06.S28` - Define PlanWave, PlanPhase, and PlanStep structs carrying canonical ids, headings, and per-step completion; `engine/crates/ingest-struct/src/plan_structure.rs`.
- [x] `W03.P06.S29` - Parse a plan body into its wave/phase/step tree from the canonical W##/P##/S## heading and row grammar; `engine/crates/ingest-struct/src/plan_structure.rs`.
- [x] `W03.P06.S30` - Read per-step completion from the two-state checkbox (- [x] closed, - [ ] open) on each step row; `engine/crates/ingest-struct/src/plan_structure.rs`.
- [x] `W03.P06.S31` - Cap the parsed structure node count and report honest truncation when a plan exceeds the ceiling; `engine/crates/ingest-struct/src/plan_structure.rs`.
- [x] `W03.P06.S32` - Add a parser test over an L3 fixture asserting the wave/phase/step tree and each step completion; `engine/crates/ingest-struct/src/plan_structure.rs`.
- [x] `W03.P06.S33` - Add a parser test that an L1 (steps-only) and an L2 (phases) plan parse without inventing absent containers; `engine/crates/ingest-struct/src/plan_structure.rs`.

### Phase `W03.P07` - plan-container node and edge minting

Mint NodeKind::PlanContainer entities and their subordinate edges at ingest time, stable keys composed only from plan stem plus canonical container ids, binding steps to exec records where present.

- [x] `W03.P07.S34` - Mint a PlanContainer node per wave/phase/step keyed by CanonicalKey::PlanContainer (plan stem plus canonical container id) during plan-document ingest; `engine/crates/engine-graph/src/index.rs`.
- [x] `W03.P07.S35` - Carry per-step completion on the step PlanContainer node as a serialized facet; `engine/crates/engine-graph/src/index.rs`.
- [x] `W03.P07.S36` - Mint subordinate contains edges from plan to wave to phase to step with stable keys composed only from the endpoint container ids; `engine/crates/engine-graph/src/index.rs`.
- [x] `W03.P07.S37` - Bind each step PlanContainer node to its exec record document node where one exists, via an identity-only edge key; `engine/crates/engine-graph/src/index.rs`.
- [x] `W03.P07.S38` - Add a re-index test that re-ingesting a plan re-keys no existing step node or edge (identity survives re-index); `engine/crates/engine-graph/src/index.rs`.
- [x] `W03.P07.S39` - Add a test that toggling a step checkbox updates the completion facet without changing the step node id; `engine/crates/engine-graph/src/index.rs`.

### Phase `W03.P08` - bounded plan-interior projection and route

Serve the plan-container interior as a bounded interior of a plan node under a node ceiling with honest truncated reporting, enveloped with the tiers block.

- [x] `W03.P08.S40` - Define a PlanInterior struct carrying the ordered wave/phase/step entities and an optional truncated block; `engine/crates/engine-query/src/node.rs`.
- [x] `W03.P08.S41` - Implement a plan_interior projection that descends a plan node into its PlanContainer entities under a node ceiling; `engine/crates/engine-query/src/node.rs`.
- [x] `W03.P08.S42` - Report honest truncation (total_nodes, returned_nodes, reason) when the interior exceeds the ceiling, keeping the returned subtree self-consistent; `engine/crates/engine-query/src/node.rs`.
- [x] `W03.P08.S43` - Add a plan-interior route handler that serves the interior of a plan node through the shared envelope helper; `engine/crates/vaultspec-api/src/routes/query.rs`.
- [x] `W03.P08.S44` - Register the GET /nodes/{id}/plan-interior route in build_router and add it to CONTRACT_ROUTES; `engine/crates/vaultspec-api/src/lib.rs`.
- [x] `W03.P08.S45` - Add a projection test that a small plan interior returns whole with no truncated block; `engine/crates/engine-query/src/node.rs`.
- [x] `W03.P08.S46` - Add a projection test that an oversized plan interior truncates at the ceiling and reports the original total honestly; `engine/crates/engine-query/src/node.rs`.
- [x] `W03.P08.S47` - Add a route test that /nodes/{id}/plan-interior carries the tiers block and 404s an unknown node; `engine/crates/vaultspec-api/src/lib.rs`.

## Wave `W04` - read-only ops-git pass-through whitelist

Add a namespaced read-only /ops/git pass-through forwarding read-only git invocations verbatim (porcelain status with per-file XY, numstat per-file +adds/-dels, unified diff for a path) inside the shared envelope, exactly as /ops/core and /ops/rag forward sibling verbs; no diff algorithm in the engine, no mutating git verb in the whitelist. Independent of W01-W03 in code but sequenced after them. Backed by the dashboard-pipeline-wire ADR and the dashboard-git-diff-browser ADR (its consumer).

### Phase `W04.P09` - read-only git whitelist and argument validation

Define the read-only /ops/git whitelist (porcelain status, numstat, unified diff for a path) with validated path arguments and no mutating verb, reusing the bounded sibling runner.

- [x] `W04.P09.S48` - Define a GIT_WHITELIST of read-only verbs (porcelain status, numstat, unified diff for a path) mirroring CORE_WHITELIST and RAG_WHITELIST; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `W04.P09.S49` - Locate the git invocation (PATH binary) mirroring rag_invocation, with no working-tree mutation flags ever appended; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `W04.P09.S50` - Validate the diff verb's path argument so only a bounded, in-tree path is forwarded, never an arbitrary git argument channel; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `W04.P09.S51` - Add a unit test that every whitelisted git verb is read-only and no mutating verb (add/commit/checkout/reset/stash) is reachable; `engine/crates/vaultspec-api/src/routes/ops.rs`.

### Phase `W04.P10` - ops-git route wiring and pass-through tests

Wire the /ops/git route through the shared envelope helper and the bounded sibling runner, with tests proving verbatim forwarding, whitelist denial of write verbs, and tiers on success and error.

- [x] `W04.P10.S52` - Add an ops_git route handler that forwards a whitelisted git verb through the bounded sibling runner and the shared envelope helper; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `W04.P10.S53` - Register the POST /ops/git/{verb} route in build_router and add it to CONTRACT_ROUTES; `engine/crates/vaultspec-api/src/lib.rs`.
- [x] `W04.P10.S54` - Add a route test that a non-whitelisted git verb 403s with the tiers block, never reaching the subprocess; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `W04.P10.S55` - Add a route test that a whitelisted status verb forwards the git output verbatim inside the envelope with the tiers block; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `W04.P10.S56` - Add a route test that a sibling fault degrades to a tiers-carrying error envelope, never a hand-built body; `engine/crates/vaultspec-api/src/routes/ops.rs`.

## Wave `W05` - mock fidelity, consumer tests, and green gate

Mirror each new wire shape byte-for-byte in the frontend mockEngine and exercise it through the same client path the app uses, then run the full green gate. Depends on all prior waves (each shape must exist on the live wire before the mock mirrors it). Backed by the dashboard-pipeline-wire ADR and the mock-mirrors-live-wire-shape rule.

### Phase `W05.P11` - mock engine shape mirroring

Mirror each new wire shape (status/tier facets, in-flight projection, plan interior, /ops/git) byte-for-byte in the frontend mockEngine and liveAdapters.

- [x] `W05.P11.S57` - Mirror the status and tier doc-node facets in the mock vault-tree and graph-query shapes byte-for-byte with the live wire; `frontend/src/stores/server/engine.ts`.
- [x] `W05.P11.S58` - Serve the in-flight pipeline projection shape from the mock /pipeline endpoint matching the live envelope; `frontend/src/stores/server/engine.ts`.
- [x] `W05.P11.S59` - Serve the bounded plan-interior shape (waves/phases/steps with completion and truncated) from the mock plan-interior endpoint; `frontend/src/stores/server/engine.ts`.
- [x] `W05.P11.S60` - Serve the read-only /ops/git pass-through shapes (status, numstat, diff) from the mock, replacing the engine-blocked placeholder note; `frontend/src/stores/server/engine.ts`.
- [x] `W05.P11.S61` - Add tolerant adapters for the pipeline, plan-interior, and git shapes in liveAdapters mirroring adaptGraphSlice; `frontend/src/stores/server/liveAdapters.ts`.

### Phase `W05.P12` - consumer fidelity tests

Feed captured live samples through the same client path the app uses, asserting the mock and live shapes match for every new capability.

- [x] `W05.P12.S62` - Feed a captured live /pipeline sample through the same client path the app uses and assert the mock and live shapes match; `frontend/src/stores/server/liveAdapters.test.ts`.
- [x] `W05.P12.S63` - Feed a captured live plan-interior sample through the client path and assert the waves/phases/steps and truncated fold; `frontend/src/stores/server/liveAdapters.test.ts`.
- [x] `W05.P12.S64` - Feed a captured live /ops/git status and diff sample through the client path and assert the per-file and hunk shapes match; `frontend/src/stores/server/liveAdapters.test.ts`.
- [x] `W05.P12.S65` - Assert the mock vault-tree and graph-query nodes carry status and tier identically to the captured live sample; `frontend/src/stores/server/liveAdapters.test.ts`.

### Phase `W05.P13` - full green gate verification

Run the full lint gate, Rust tests, and vitest to exit 0 across the engine and frontend.

- [ ] `W05.P13.S66` - Run cargo test across the engine workspace and confirm every new and existing test passes; `engine/Cargo.toml`.
- [x] `W05.P13.S67` - Run cargo fmt --check and cargo clippy across the engine workspace and confirm exit 0; `engine/Cargo.toml`.
- [x] `W05.P13.S68` - Run the full frontend lint gate (eslint, prettier, tsc) and confirm exit 0; `frontend/package.json`.
- [x] `W05.P13.S69` - Run vitest across the frontend and confirm every mock-fidelity and consumer test passes; `frontend/package.json`.
- [x] `W05.P13.S70` - Confirm the published wheel still depends on neither vaultspec-rag nor torch; `pyproject.toml`.

## Description

This plan executes the engine buildout pinned by the `dashboard-pipeline-wire` ADR: four additive, independently-shippable wire capabilities that feed the right-rail Work pillar (in-flight ADRs and plans) and Changes pillar (per-file git diffs), all strictly inside the engine's read-and-infer fence. The work writes no `.vault/` documents, mutates no git refs or trees, and grows no sibling control or search semantics; every addition observes and infers over sources the engine already reads.

Capability one (Wave `W01`) extends document ingest in `engine-graph` `src/index.rs` to read the ADR H1 `status` value (proposed / accepted / rejected / deprecated) and the plan frontmatter `tier` (L1 - L4), carrying them as query-time facets on the doc node alongside the existing `lifecycle`, `doc_type`, `feature_tags`, and `dates`. This makes "in-flight ADR" honest (real status, not checkbox-guessed, since an ADR has no steps) and surfaces tier in the filter vocabulary.

Capability two (Wave `W02`) adds a bounded in-flight pipeline projection in `engine-query`: a projection over the existing `LinkageGraph` that returns the active pipeline artifacts in the requested scope (active plans by lifecycle and ADRs by status) each with progress summary, status/tier facet, pipeline phase, and stable node id, bounded to active artifacts and enveloped with the tiers block, surfaced as a route over the shared envelope helper.

Capability three (Wave `W03`) is the largest and the genuine new frontier: minting plan-container interior structure (waves to phases to steps as first-class-but-subordinate `NodeKind::PlanContainer` entities, the kind the engine ADR `2026-06-12-vaultspec-engine-adr` section 4.3 / D4.1 anticipated). Each step bears its completion (`- [x]` / `- [ ]`) and binds to its exec record where one exists; the interior is served as a bounded interior of a plan node (like node detail and neighbors) under a node ceiling with honest `truncated` reporting. Entity stable keys are composed only from the plan stem and canonical wave/phase/step identifiers (the `CanonicalKey::PlanContainer` form already present in `engine-model` `src/id.rs`), never from resolution or rule outcomes, so re-indexing never re-keys an existing step.

Capability four (Wave `W04`) adds a read-only `/ops/git` pass-through whitelist in `engine-api` `src/routes/ops.rs`, forwarding read-only git invocations verbatim (porcelain status with per-file XY, numstat per-file +adds/-dels, unified diff for a path) inside the shared envelope exactly as `/ops/core` and `/ops/rag` already forward sibling verbs. The engine implements no diff algorithm and exposes no mutating git verb; any write verb is out of whitelist by construction.

Capability five (Wave `W05`) mirrors each new shape byte-for-byte in the frontend `mockEngine` and exercises it through the same client path the app uses, then runs the full green gate. Grounding is the `dashboard-pipeline-wire` ADR, the `dashboard-activity-rail` research (findings F3 and F4), the engine ADR section 4.3 / D4.1 plan-container reservation, and the `dashboard-git-diff-browser` ADR (the consumer the `/ops/git` capability unblocks). The work obeys `engine-read-and-infer`, `every-wire-response-carries-the-tiers-block`, `graph-queries-are-bounded-by-default`, `provenance-stable-keys-are-identity-bearing`, `mock-mirrors-live-wire-shape`, `graph-compute-is-cpu-gpu-is-render-and-search`, and `published-wheel-purity`.

## Parallelization

Waves are sequenced and carry the plan's hard ordering. `W01` (frontmatter status and tier extraction) lands first because both `W02` and `W03` read the status and tier facets it adds: the in-flight projection selects ADRs by status and tags artifacts with tier, and the plan-container minting upserts onto doc nodes that now carry tier. `W02` depends on `W01` only. `W03` depends on `W01` for the plan node facets it reads but is otherwise independent of `W02`, so `W02` and `W03` could overlap once `W01` lands if two executors are available; the default is to sequence `W03` after `W02` since `W03` is the largest and benefits from a settled facet model. `W04` (the read-only `/ops/git` pass-through) shares no code with `W01` through `W03` and could be built in parallel with any of them; it is sequenced after `W03` only to keep one capability in flight at a time and to give `W05` a single integration point. `W05` (mock fidelity, consumer tests, green gate) depends on every prior wave: per `mock-mirrors-live-wire-shape`, each shape must exist on the live wire before the mock mirrors it, so `W05` is strictly last.

Within a wave, phases carry hard ordering where one builds on another. In `W01`, `P02` (facet model and node serialization) depends on `P01` (the parsers it calls), and `P03` (filter vocabulary and tests) depends on `P02` (the node fields it enumerates). In `W02`, `P05` (route) depends on `P04` (the projection it serves). In `W03`, `P07` (node and edge minting) depends on `P06` (the parser it consumes), and `P08` (interior projection and route) depends on `P07` (the entities it descends). In `W04`, `P10` (route wiring and tests) depends on `P09` (the whitelist and validation it forwards). In `W05`, `P11` (mock shapes) precedes `P12` (consumer tests over those shapes), and `P13` (green gate) is last. Test-authoring steps within a phase may run alongside the implementation step they cover.

## Verification

The plan is complete when every Step is closed (`- [x]`) and all of the following verifiable checks hold.

- Read-and-infer is intact: no code path under `engine/` writes `.vault/`, mutates a git ref/tree/config, or grows sibling control or search semantics; the `/ops/git` whitelist contains only read-only verbs and no mutating verb (add, commit, checkout, reset, stash) is reachable, proven by the `W04.P09` whitelist test.
- Every new response carries the tiers block through the shared envelope helper on both success and error, with no hand-built response body, proven by the `W02.P05`, `W03.P08`, and `W04.P10` route tests (including the unknown-scope 400, the unknown-node 404, the non-whitelisted-verb 403, and the sibling-fault degrade paths).
- Frontmatter status and tier extraction is honest: an ingested ADR carries its real H1 status and a plan carries its tier through to the node and the filter vocabulary, proven by the `W01.P01`, `W01.P02`, and `W01.P03` tests.
- The in-flight pipeline projection is bounded to active artifacts in scope and excludes complete plans and rejected ADRs, proven by the `W02.P04` projection test.
- The plan-container interior is bounded under a node ceiling with honest `truncated` reporting and a self-consistent returned subtree, proven by the `W03.P08` whole-and-truncated projection tests.
- Step identity is stable: re-indexing a plan re-keys no existing step node or edge, and toggling a checkbox updates completion without changing the step node id, proven by the `W03.P07` re-index and toggle tests; stable keys are composed only from plan stem plus canonical container ids.
- The mock mirrors the live wire shape for every new capability and is exercised through the same client path, proven by the `W05.P12` consumer fidelity tests feeding captured live samples through the adapters.
- The full green gate exits 0: `just dev lint all` (eslint, prettier, tsc, cargo fmt --check, cargo clippy), `cargo test` across the engine workspace, and vitest across the frontend all pass, and the published wheel depends on neither vaultspec-rag nor torch (`W05.P13`).
