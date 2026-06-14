---
tags:
  - '#plan'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-06-14'
tier: L3
related:
  - '[[2026-06-14-graph-representation-adr]]'
  - '[[2026-06-14-graph-representation-research]]'
  - '[[2026-06-14-graph-node-salience-adr]]'
  - '[[2026-06-14-graph-node-semantics-adr]]'
  - '[[2026-06-14-dashboard-node-canvas-adr]]'
  - '[[2026-06-14-dashboard-canvas-controls-adr]]'
  - '[[2026-06-12-dashboard-foundation-reference]]'
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
     Replace graph-representation with a kebab-case feature tag, e.g. #foo-bar.
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

# `graph-representation` plan

Build the scene/stores/app representation layer for the node graph: DOI-bounded selection over the salience field, the v1 connectivity and lineage layout modes (semantic UMAP v1-gated) on the CPU worker, the anti-hairball backbone draw, feature overlays, the token-driven encoding map, mode/lens switching and composition, animated incremental deltas, and the two required consumer-ADR amendments.

## Wave `W01` - wire and data foundation: salience, embedding, derivation, and DOI selection into stores

Bring the upstream salience/semantics wire fields (per-lens salience scalar, optional per-node embedding vector, derivation edge labels) into the stores layer as the sole wire client, prove mock-vs-live parity for every new field, wire DOI-bounded top-salience selection over the active lens and focus, and stand up the active-representation-mode, active-overlay, and active-salience-lens view state. Backs every later Wave; depends on the salience and semantics ADRs and the foundation reference. No layout or rendering work lands here.

### Phase `W01.P01` - wire-field intake and mock parity

Bring the salience scalar, optional embedding vector, and derivation edge label into the stores wire client and adapters, and reconcile the mock engine to the live wire shape for each new field.

- [ ] `W01.P01.S01` - extend the stores wire-node type with the additive salience scalar, authority_class, per-type lifecycle, and aggregate hint fields from the salience and semantics wire amendment; `frontend/src/stores/server/engine.ts`.
- [ ] `W01.P01.S02` - extend the stores wire-edge type with the additive derivation relation label carried alongside the existing tier and never folded into the edge id; `frontend/src/stores/server/engine.ts`.
- [ ] `W01.P01.S03` - surface the optional per-node embedding vector through the graph-slice adapter, tolerating its absence so the semantic mode can consume it later; `frontend/src/stores/server/liveAdapters.ts`.
- [ ] `W01.P01.S04` - add the lens request parameter to the graph-query call defaulted to the status lens, threading it through the query key so a lens change re-queries; `frontend/src/stores/server/queries.ts`.
- [ ] `W01.P01.S05` - reconcile the mock engine to serve the salience scalar, authority_class, lifecycle, and aggregate hint node fields byte-for-byte with the live wire shape; `frontend/src/testing/mockEngine.ts`.
- [ ] `W01.P01.S06` - reconcile the mock engine to serve the derivation edge label and the optional per-node embedding vector, honoring the lens parameter so the mock mirrors the live lens-dependent node set; `frontend/src/testing/mockEngine.ts`.
- [ ] `W01.P01.S07` - feed a captured live sample carrying salience, derivation, and embedding through the same graph-slice adapter the app uses and assert the fold for every new field; `frontend/src/stores/server/liveAdapters.test.ts`.

### Phase `W01.P02` - DOI-bounded selection and representation view state

Wire top-salience DOI selection for the active lens and focus over the bounded slice, and stand up the active-representation-mode, active-overlay, and active-salience-lens view state in the view store.

- [ ] `W01.P02.S08` - add the active-salience-lens view state to the view store with the status lens as the first-load default, emitting a lens-change re-query intent; `frontend/src/stores/view/viewStore.ts`.
- [ ] `W01.P02.S09` - add the active-representation-mode view state defaulting to connectivity, distinct from the existing scene layout-mode force/circular state; `frontend/src/stores/view/viewStore.ts`.
- [ ] `W01.P02.S10` - add the active-overlay view state for feature-country and BubbleSets-hull visibility toggles, owned by the view store; `frontend/src/stores/view/viewStore.ts`.
- [ ] `W01.P02.S11` - add a stores selector that ranks the bounded slice by salience and selects the top-DOI node set for the active lens and focus, honoring the truncated block as a narrow-your-view state; `frontend/src/stores/server/graphSync.ts`.
- [ ] `W01.P02.S12` - test that the DOI selector keeps the top-salience nodes for the active lens and focus and surfaces truncation honestly rather than as a partial graph; `frontend/src/stores/server/graphSync.test.tsx`.
- [ ] `W01.P02.S13` - test the active-mode, active-overlay, and active-lens view state defaults and transitions, including the scope-switch re-key so a prior scope's selections do not leak; `frontend/src/stores/view/viewStore.test.ts`.

## Wave `W02` - layout modes, anti-hairball backbone, overlays, encoding, and dynamics in the scene worker

Build the v1 representation modes in the CPU layout worker behind a new set-representation-mode SceneController command distinct from set-layout-mode: connectivity (ForceAtlas2 default) and lineage (derivation-axis DAG), with the semantic UMAP mode behind a measured promotion gate. Land the anti-hairball layout backbone (declared+structural layout input, disparity-filter thinning + hierarchical edge bundling of temporal/semantic, DOI-gated, filterable, un-bundle-on-hover), the GMap/BubbleSets feature overlays via a set-overlays command, the token-driven encoding map (type-shape, feature-hue, salience-size, lifecycle-value, tier-hue+dash with superseded-fade, audit-tint, sacred diff), object constancy via the id-keyed reconciler and position cache, and animated incremental deltas. Depends on W01 for the salience/embedding/derivation fields and DOI-selected node sets.

### Phase `W02.P03` - the set-representation-mode and set-overlays scene commands

Extend the locked SceneController union with the set-representation-mode and set-overlays commands and the representation-mode-changed event, additive to the locked seam and distinct from set-layout-mode.

- [ ] `W02.P03.S14` - extend the locked SceneCommand union with the set-representation-mode command carrying connectivity, lineage, or semantic, additive to the locked seam and distinct from set-layout-mode; `frontend/src/scene/sceneController.ts`.
- [ ] `W02.P03.S15` - extend the locked SceneCommand union with the set-overlays command carrying feature-country and hull visibility, additive to the locked seam; `frontend/src/scene/sceneController.ts`.
- [ ] `W02.P03.S16` - extend the locked SceneEvent union with the representation-mode-changed event the scene echoes after applying a mode layout, and hold active-mode in the controller alongside layout-mode; `frontend/src/scene/sceneController.ts`.
- [ ] `W02.P03.S17` - test that set-representation-mode and set-overlays forward to the field renderer and that representation-mode-changed emits, without renaming or removing any locked union member; `frontend/src/scene/sceneController.test.ts`.

### Phase `W02.P04` - connectivity and lineage layout modes

Implement the v1 connectivity (ForceAtlas2 default) and lineage (derivation-axis DAG over derivation labels) modes in the CPU worker, each with its honest empty/degraded state.

- [ ] `W02.P04.S18` - route the connectivity mode to the existing ForceAtlas2 worker as the default representation layout, preserving warm-start positions on mode entry; `frontend/src/scene/field/layoutWorker.ts`.
- [ ] `W02.P04.S19` - implement the lineage layout that places the directed derivation DAG along a derivation/time axis from the derivation edge labels, type-shaped per the PROV convention; `frontend/src/scene/field/lineageLayout.ts`.
- [ ] `W02.P04.S20` - render an incomplete derivation chain as an honest dangling lineage stub, drawing an orphan exec record or an ADR-less plan without fabricating an edge; `frontend/src/scene/field/lineageLayout.ts`.
- [ ] `W02.P04.S21` - dispatch the active representation mode to the worker so set-representation-mode selects connectivity or lineage and re-lays-out the current node set; `frontend/src/scene/field/fieldAssembly.ts`.
- [ ] `W02.P04.S22` - test the lineage layout axis ordering over derivation labels and the dangling-stub rendering of an incomplete chain; `frontend/src/scene/field/lineageLayout.test.ts`.

### Phase `W02.P05` - semantic UMAP mode behind a measured promotion gate

Build the CPU-worker UMAP projection over per-node embedding vectors as a v1-gated mode with a measured promotion step against the layout time budget and a legibility check, plus its missing-embedding fallback.

- [ ] `W02.P05.S23` - implement the CPU-worker UMAP projection over the per-node embedding vectors into 2D positions for the semantic constellation layout; `frontend/src/scene/field/semanticLayout.ts`.
- [ ] `W02.P05.S24` - place a node lacking an embedding in a connectivity fallback position and mark the semantic mode as partial so the missing-embedding state reads honestly; `frontend/src/scene/field/semanticLayout.ts`.
- [ ] `W02.P05.S25` - measure the worker UMAP runtime at the node ceiling against the layout time budget and confirm meaning-clusters separate, recording the gate verdict that promotes or holds the semantic mode; `frontend/src/scene/field/semanticLayout.bench.test.ts`.
- [ ] `W02.P05.S26` - gate the semantic mode behind the measured verdict so it ships as a selectable mode only when the budget and legibility checks pass, otherwise held out of v1; `frontend/src/scene/field/fieldAssembly.ts`.

### Phase `W02.P06` - anti-hairball layout backbone and edge treatment

Lay out and draw on the declared+structural layout backbone, disparity-filter-thin the temporal/semantic tiers, hierarchically bundle them along the containment hierarchy, gate by DOI and tier filter, and un-bundle on hover.

- [ ] `W02.P06.S27` - build the layout backbone as the declared+structural edge subset and feed only that subset to the layout solver, distinct from salience's tier-weighted centrality backbone; `frontend/src/scene/field/layoutBackbone.ts`.
- [ ] `W02.P06.S28` - implement the disparity filter that thins the dense temporal and semantic tiers to their significant subset before they reach the draw layer; `frontend/src/scene/field/disparityFilter.ts`.
- [ ] `W02.P06.S29` - implement hierarchical edge bundling that routes the thinned temporal and semantic edges along the feature and lineage containment hierarchy as clean arcs; `frontend/src/scene/field/edgeBundling.ts`.
- [ ] `W02.P06.S30` - gate the bundled context tiers by DOI and the tier filter and un-bundle the incident edges on hover, restoring straight traceable lines for the ego set; `frontend/src/scene/field/edgeMeshes.ts`.
- [ ] `W02.P06.S31` - test that layout runs only on the declared+structural backbone and that disparity thinning plus bundling and hover un-bundling preserve a self-consistent edge set; `frontend/src/scene/field/layoutBackbone.test.ts`.

### Phase `W02.P07` - feature overlays and the channel encoding map

Render GMap feature-country overlays at overview LOD and BubbleSets hulls at document LOD via the set-overlays command, and apply the token-driven encoding map with superseded-fade, audit-tint, and sacred diff legibility.

- [ ] `W02.P07.S32` - render GMap feature-country overlays at the overview LOD, drawing each feature as a labelled territory toggled by the set-overlays command without moving nodes; `frontend/src/scene/field/featureCountries.ts`.
- [ ] `W02.P07.S33` - render BubbleSets isocontour hulls over feature members at document LOD as a set overlay that does not re-layout, toggled by set-overlays; `frontend/src/scene/field/bubbleSets.ts`.
- [ ] `W02.P07.S34` - apply the encoding map for type-to-shape and feature-to-hue and tier-to-hue-plus-dash from the literal-hex scene-read tokens, keeping identity grayscale-safe by shape; `frontend/src/scene/field/nodeSprites.ts`.
- [ ] `W02.P07.S35` - apply the lifecycle and recency value channel and the superseded-ADR faded/struck treatment and the audit-worst-severity tint, with diff add/remove green/red overriding warmth; `frontend/src/scene/field/nodeSprites.ts`.
- [ ] `W02.P07.S36` - test the overlay toggles do not move nodes and the encoding map stays grayscale-distinguishable with superseded fade, audit tint, and sacred diff intact; `frontend/src/scene/field/bubbleSets.test.ts`.

### Phase `W02.P08` - object constancy and animated incremental deltas

Preserve the mental map across mode switches and live deltas via the id-keyed sprite reconciler and position cache, seeding new layouts from prior positions and placing new nodes incrementally with animated add/remove.

- [ ] `W02.P08.S37` - seed each new mode layout from the prior id-keyed positions in the position cache so a mode switch animates from where nodes were and no node is re-keyed; `frontend/src/scene/positionCache.ts`.
- [ ] `W02.P08.S38` - place incrementally arriving delta nodes at their neighbors' centroid rather than re-running the full layout, preserving the mental map across live updates; `frontend/src/scene/field/layoutWorker.ts`.
- [ ] `W02.P08.S39` - animate add as fade-in and remove as fade-out and re-tier as a staged transition through the id-keyed reconciler, cutting between states that share no structure; `frontend/src/scene/field/nodeSprites.ts`.
- [ ] `W02.P08.S40` - test object constancy across a mode switch and incremental delta placement, asserting ids never re-key and reduced-motion swaps animation for instant state; `frontend/src/scene/positionCache.test.ts`.

## Wave `W03` - consumer ADR amendments, mode/lens chrome, and lens-mode composition

Land the two required downstream ADR amendments as body-prose edits and their corresponding code: amend the node-canvas ADR so salience-driven size supersedes the feature member-count radius rule and salience becomes a label-priority input, and amend the canvas-controls ADR to add the representation-mode selector (reconciling force/circular as a connectivity sub-option) and the salience-lens selector control group. Build those two app-chrome selectors emitting intent into the view store, wire the salience-to-size and salience-to-label-priority code in the scene, and implement the stores composition rule that sequences a lens re-query then a mode re-layout so every lens is viewable in every mode. Depends on W01 (view state, wire fields) and W02 (the mode commands and encoding seam).

### Phase `W03.P09` - node-canvas ADR amendment and salience encoding code

Amend the node-canvas ADR so salience supersedes the member-count radius rule and becomes a label-priority input, and wire the salience-to-size and salience-to-label-priority code in the scene sprite and label layers.

- [ ] `W03.P09.S41` - amend the node-canvas ADR body prose so salience-driven size supersedes the feature member-count radius rule, folding member-count into the feature node's salience; `.vault/adr/2026-06-14-dashboard-node-canvas-adr.md`.
- [ ] `W03.P09.S42` - amend the node-canvas ADR body prose so the label-culling rule gains salience as a label-priority input alongside focus, pin, and ego-lift; `.vault/adr/2026-06-14-dashboard-node-canvas-adr.md`.
- [ ] `W03.P09.S43` - wire salience to the node sprite radius so importance is visible, superseding the member-count-only radius across every species; `frontend/src/scene/field/nodeSprites.ts`.
- [ ] `W03.P09.S44` - wire salience into the DOI label-priority culling so high-salience nodes keep labels in the ambient field; `frontend/src/scene/field/nodeSprites.ts`.
- [ ] `W03.P09.S45` - test salience-driven size and label priority, asserting the member-count radius no longer competes and the feature node reads its salience; `frontend/src/scene/field/nodeSprites.test.ts`.

### Phase `W03.P10` - canvas-controls ADR amendment and mode/lens selectors

Amend the canvas-controls ADR to add the representation-mode selector (reconciling force/circular as a connectivity sub-option) and the salience-lens selector, then build both app-chrome controls emitting intent into the view store.

- [ ] `W03.P10.S46` - amend the canvas-controls ADR body prose to add the representation-mode selector control group and reconcile force/circular as a connectivity sub-option; `.vault/adr/2026-06-14-dashboard-canvas-controls-adr.md`.
- [ ] `W03.P10.S47` - amend the canvas-controls ADR body prose to add the salience-lens selector control group emitting lens intent into the view store; `.vault/adr/2026-06-14-dashboard-canvas-controls-adr.md`.
- [ ] `W03.P10.S48` - build the representation-mode selector that emits set-representation-mode into the scene and nests the existing force/circular toggle under connectivity, using Lucide chrome marks; `frontend/src/app/stage/RepresentationModePanel.tsx`.
- [ ] `W03.P10.S49` - build the salience-lens selector that emits active-lens intent into the view store, reading its options without fetching the engine or reading the raw tiers block; `frontend/src/app/stage/LensSelector.tsx`.
- [ ] `W03.P10.S50` - reconcile the AlgorithmPanel force/circular toggle as a connectivity sub-option so it dims outside connectivity mode and never competes with the representation-mode axis; `frontend/src/app/stage/AlgorithmPanel.tsx`.
- [ ] `W03.P10.S51` - test the mode and lens selectors emit the correct intent, stay keyboard-operable, and never fetch the engine or read the raw tiers block; `frontend/src/app/stage/RepresentationModePanel.test.ts`.

### Phase `W03.P11` - lens-mode composition sequencing in stores

Implement the stores rule that sequences a lens re-query (possibly a new node set) then a mode re-layout with id-keyed object constancy, so the two orthogonal switches never contend and every lens is viewable in every mode.

- [ ] `W03.P11.S52` - implement the stores composition rule that on a lens switch issues a re-query then re-lays-out the possibly-new node set in the active mode with id-keyed constancy; `frontend/src/stores/server/graphSync.ts`.
- [ ] `W03.P11.S53` - implement the stores rule that on a mode switch re-lays-out the current node set with no re-query, so the two orthogonal switches never contend; `frontend/src/stores/server/graphSync.ts`.
- [ ] `W03.P11.S54` - wire the Stage to forward active-mode and active-overlay view state to the scene via the new commands and feed re-queried slices on a lens change; `frontend/src/app/stage/Stage.tsx`.
- [ ] `W03.P11.S55` - test that every lens is viewable in every mode and that a lens re-query then mode re-layout preserves object constancy without a mode switch triggering a re-query; `frontend/src/stores/server/graphSync.test.tsx`.

## Wave `W04` - verification, full green gate, and deferred backlog record

Close the feature with cross-layer tests (scene worker layout modes, stores selection/composition, app selectors) feeding captured live samples through the same client path the app uses, run the full lint gate to exit 0 as the closing green verification, and record the ledger-deferred work (AI LinkQ query layer, LLM cluster auto-labeling, KelpFusion, NodeTrix, DRGraph, sfdp) as an explicit backlog note so a future agent inherits the v1/deferred split without re-deriving it. Depends on W01 through W03 being landed and reviewed.

### Phase `W04.P12` - cross-layer tests and the full green gate

Add scene/stores/app tests that feed captured live samples through the same client path the app uses, then run the full lint gate to exit 0 as the closing green verification.

- [ ] `W04.P12.S56` - add a scene integration test exercising connectivity, lineage, and the gated semantic mode end-to-end through the set-representation-mode command with object constancy; `frontend/src/scene/field/fieldAssembly.test.ts`.
- [ ] `W04.P12.S57` - add a stores integration test that drives the lens-mode composition and DOI selection through the same client path the app uses against the parity-reconciled mock; `frontend/src/stores/server/graphSync.test.tsx`.
- [ ] `W04.P12.S58` - run the full frontend lint gate (eslint, prettier, tsc) to exit 0 as the closing green verification, fixing any format or type drift at its source; `frontend/package.json`.

### Phase `W04.P13` - deferred backlog record

Record the ledger-deferred work as an explicit backlog note so the v1/deferred split is inherited rather than re-derived; no v1 build steps for AI, NodeTrix, DRGraph, or sfdp.

- [ ] `W04.P13.S59` - record the deferred-backlog note enumerating the ledger adopt-deferred and declined items (AI LinkQ query, LLM cluster auto-labeling, KelpFusion, NodeTrix, DRGraph, sfdp, GNN layout) with their triggers so v1 never builds them; `frontend/src/scene/field/DEFERRED.md`.

## Description

This plan carries the `graph-representation` ADR into the dashboard's scene, stores, and app-chrome layers. It is the representation-layer build: layout runs on the CPU worker, the GPU only renders, and the engine holds no coordinates. The salience and semantics ADRs are upstream contracts that supply the inputs this layer reads - the per-lens `salience` scalar (size and label priority, the DOI a-priori term), the `derivation` edge labels (lineage mode), the per-node embedding vector (semantic mode), and the authority-class and aggregate-hint node fields; the work here consumes those additive wire fields through the stores layer as the sole wire client and proves mock-vs-live parity for each.

The build delivers the ADR's settled principles. W01 lands the wire-field intake, mock parity, DOI-bounded top-salience selection, and the active-mode/active-overlay/active-lens view state. W02 builds the v1 layout modes in the worker - connectivity (ForceAtlas2 default) and lineage (derivation-axis DAG), with the semantic UMAP mode behind a measured promotion gate - plus the anti-hairball backbone (declared+structural layout input, disparity-filter thinning and hierarchical edge bundling of the temporal/semantic tiers, DOI-gated, filterable, un-bundle-on-hover), the GMap/BubbleSets overlays via a dedicated `set-overlays` command, the token-driven encoding map, object constancy, and animated incremental deltas. The new `set-representation-mode` command is additive to the locked `SceneController` union and stays distinct from the render-tuning `set-layout-mode` (force/circular). W03 lands the two required consumer-ADR amendments as body-prose edits (node-canvas: salience-driven size supersedes the member-count radius rule, salience becomes a label-priority input; canvas-controls: add the representation-mode selector reconciling force/circular as a connectivity sub-option, and add the salience-lens selector), their corresponding scene/app code, and the stores composition rule that sequences a lens re-query then a mode re-layout so every lens is viewable in every mode. W04 verifies cross-layer, runs the full green gate, and records the ledger-deferred work.

Two backbones are distinct and both are built: the LAYOUT backbone here is the high-precision declared+structural subset fed to the solver, while salience's CENTRALITY backbone is the four-tier tier-weighted graph the engine computes importance on. The AI layer (LinkQ query, LLM cluster auto-labeling), NodeTrix, DRGraph, and sfdp are ledger-deferred and are NOT v1 build steps; the only v1 gate that can fail is the semantic UMAP mode, which is held out of v1 if its measured worker runtime at the node ceiling exceeds the layout time budget. Authorizing documents are in the `related:` frontmatter; every Step inherits that chain.

## Steps

<!-- The plan's tier (declared in frontmatter as `tier: L1`, `L2`, `L3`, or
`L4`) determines the structure under this section:

- `L1`: a flat list of Step rows (no Phase, Wave, or Epic).
- `L2`: one or more `### Phase` blocks each containing Step rows.
- `L3`: one or more `## Wave` blocks each containing Phase blocks.
- `L4`: a `## Epic intent` block, followed by Wave blocks. -->

<!-- Replace this scaffold with the tier-appropriate structure for your plan.
Format examples for each block type are embedded below as commented
templates. -->

<!-- IMPORTANT: This document must be updated between execution runs to
     track progress. -->

<!-- PHASE BLOCK FORMAT (L2, L3, L4):
     ### Phase `P02` - rewrite the writer-agent contract

     One sentence stating what this Phase delivers.

     - [ ] `P02.S01` - imperative-verb action; `path/to/file`.
     - [ ] `P02.S02` - imperative-verb action; `path/to/file`.

     At L3/L4 the Phase heading uses the ancestor-aware path
     (### Phase `W01.P02` - ...). The intent sentence is mandatory. -->

<!-- WAVE BLOCK FORMAT (L3, L4):
     ## Wave `W01` - language-only convention rollout

     One paragraph stating what this Wave delivers, which downstream
     Wave depends on it, and which authorizing documents back it.

     ### Phase `W01.P01` - ...
     ### Phase `W01.P02` - ...

     The Wave intent paragraph is mandatory. -->

<!-- EPIC INTENT BLOCK FORMAT (L4 only):
     ## Epic intent

     One paragraph stating the strategic goal, the external project-
     management association (milestone name, project board identifier,
     roadmap entry), the timeline horizon, and the teams or agents
     involved.

     ## Wave `W01` - ...
     ## Wave `W02` - ...

     The ## Epic intent block is mandatory at L4 and absent at L1, L2,
     L3. The plan title (the level-one # heading at the top of the
     document) is the Epic title; no separate Epic heading is emitted. -->

## Parallelization

The four Waves are hard-sequenced: W01 establishes the wire fields, DOI selection, and view state that every later Wave consumes; W02 needs those fields and node sets to build the modes and encoding; W03 needs the W02 mode commands and encoding seam before it can amend the consumer ADRs and wire the selectors and composition; W04 verifies the landed result. No Wave begins before the prior one lands and passes review (review-revision precedence holds across the boundary).

Within W01, `W01.P01` (wire intake + mock parity) precedes `W01.P02` (selection + view state), because the DOI selector reads the salience field the intake adds. The two `engine.ts` steps (S01, S02) touch one file and are sequenced to avoid a write race; the mock-parity steps (S05, S06) follow the type extensions they mirror.

Within W02, the seam phase `W02.P03` (the new commands and event) must land first; thereafter `W02.P04` (connectivity + lineage), `W02.P05` (gated semantic), `W02.P06` (backbone + edge treatment), and `W02.P07` (overlays + encoding) share no hard interdependency and may be parallelized across executors, while `W02.P08` (object constancy + deltas) is sequenced last because it depends on the modes and encoding being in place. The semantic-mode gate (S25) is a measured step whose verdict (S26) decides whether the semantic mode ships in v1 - it does not block the rest of W02.

Within W03, `W03.P09` (node-canvas amendment + salience encoding) and `W03.P10` (canvas-controls amendment + selectors) are independent and may run in parallel; `W03.P11` (composition sequencing) is sequenced after both because it wires the selectors' intent into the stores re-query/re-layout flow. The two ADR-amendment steps in each phase are body-prose edits to the respective accepted ADRs and carry no code dependency, but their corresponding code steps follow them in the same phase. Within W04, the two test steps (S56, S57) precede the full-gate run (S58); the deferred-backlog note (S59) is independent.

## Verification

<!-- State the mission success criteria for this plan. Each criterion
should be a verifiable check (test passes, surface conforms,
reviewer signs off) rather than a free-form assertion.

The plan is complete when every Step in the plan is closed
(`- [x]`). At `L4`, the Epic-completion check additionally requires
the declared project-management association to report the Epic
complete.

For tier-specific verification cadence, see the authorizing
documents linked in the `related:` frontmatter. -->

The plan is complete when every Step is closed (`- [x]`) and the following criteria hold:

- Mock-vs-live parity is proven: a captured live sample carrying `salience`, `derivation`, and the embedding vector folds through the same graph-slice adapter the app uses, and the mock serves each new field byte-for-byte with the live wire shape (S07; mock-mirrors-live-wire-shape).
- DOI selection is honest: the bounded slice keeps the top-salience nodes for the active lens and focus, and a `truncated` result renders as a narrow-your-view state, never a partial graph presented as complete (S12; graph-queries-are-bounded-by-default).
- The new `set-representation-mode` and `set-overlays` commands and the `representation-mode-changed` event are additive to the locked `SceneController` union with no member renamed or removed, and `set-representation-mode` stays distinct from `set-layout-mode` (S14-S17).
- Connectivity and lineage modes render correctly, lineage draws an incomplete derivation chain as an honest dangling stub, and the semantic UMAP mode is gated on its measured verdict - shipped only when the worker runtime at the node ceiling is within the layout time budget and clusters separate legibly, otherwise held out of v1 (S18-S26).
- Layout runs only on the declared+structural backbone with temporal/semantic disparity-thinned, bundled, DOI-gated, and un-bundled on hover, keeping the edge set self-consistent (S27-S31; the layout backbone is distinct from salience's centrality backbone).
- The encoding map reads grayscale-safe by shape, superseded ADRs read faded, audit severity tints its node, and diff add/remove green/red overrides warmth in every theme; scene-read tokens resolve as literal hex (S32-S36; themes-are-oklch-generated-from-a-token-tier, warmth-lives-in-tokens, icons-come-from-the-two-sanctioned-families).
- Object constancy holds across a mode switch and live deltas: ids never re-key, new layouts seed from prior positions, deltas place incrementally, and reduced-motion swaps animation for instant state (S37-S40).
- Both consumer ADRs are amended: the node-canvas ADR records salience-driven size superseding the member-count radius rule and salience as a label-priority input, and the canvas-controls ADR records the representation-mode selector (force/circular as a connectivity sub-option) and the salience-lens selector; the corresponding scene/app code matches the amended prose (S41-S51).
- Composition is correct: every lens is viewable in every mode; a lens switch re-queries then re-lays-out with constancy, and a mode switch re-lays-out with no re-query (S52-S55).
- Layer ownership holds throughout: the scene and app chrome never `fetch` the engine, never read the raw `tiers` block, and the stores layer remains the sole wire client (dashboard-layer-ownership, views-are-projections-of-one-model).
- The full frontend lint gate (`just dev lint frontend`: eslint + prettier + tsc) exits 0 as the closing green verification (S58; declaring-green-runs-the-full-gate).
- The deferred-backlog note records every ledger adopt-deferred and declined item with its trigger, and no v1 Step builds the AI layer, NodeTrix, DRGraph, or sfdp (S59).
