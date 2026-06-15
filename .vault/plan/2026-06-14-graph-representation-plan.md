---
tags:
  - '#plan'
  - '#graph-representation'
date: '2026-06-14'
modified: '2026-06-15'
tier: L3
related:
  - '[[2026-06-14-graph-representation-adr]]'
  - '[[2026-06-14-graph-node-salience-adr]]'
  - '[[2026-06-14-graph-node-semantics-adr]]'
  - '[[2026-06-14-dashboard-node-canvas-adr]]'
  - '[[2026-06-14-dashboard-canvas-controls-adr]]'
  - '[[2026-06-14-graph-representation-research]]'
---
# `graph-representation` plan

## Wave `W01` - wire + stores foundation

Deliver the consumed wire fields (salience float, derivation edge label, per-node embedding vector) and the lens query parameter through the stores layer and mock+corpus, so the frontend compiles and renders against realistic mock data. The engine production side is an integration seam. Downstream waves depend on these types existing. Backed by the graph-representation, graph-node-salience, and graph-node-semantics ADRs.


### Phase `W01.P01` - wire types: salience, derivation, embedding

Add the additive node fields (salience float, embedding vector) and edge field (derivation label) to the stores wire types and scene seam types, marked as integration seams.

- [x] `W01.P01.S01` - Add salience optional float and embedding to EngineNode with integration-seam note; `frontend/src/stores/server/engine.ts`.
- [x] `W01.P01.S02` - Add derivation optional label to EngineEdge with integration-seam note; `frontend/src/stores/server/engine.ts`.
- [x] `W01.P01.S03` - Add salience and embedding to SceneNodeData and derivation to SceneEdgeData; `frontend/src/scene/sceneController.ts`.
- [x] `W01.P01.S04` - Carry salience/embedding/derivation through sliceToScene and graphDeltaToScene; `frontend/src/scene/sceneMapping.ts`.

### Phase `W01.P02` - lens query param + active-lens view state

Thread the lens request parameter through the graph query path and own the active-lens (status/design salience lens) as stores/app view state, distinct from the named-filter-set lenses.

- [x] `W01.P02.S05` - Add lens enum type and thread lens onto the graphQuery request body; `frontend/src/stores/server/engine.ts`.
- [x] `W01.P02.S06` - Fold lens into the graph query cache key; `frontend/src/stores/server/queries.ts`.
- [x] `W01.P02.S07` - Add activeLens and setActiveLens to the view store distinct from named-filter lenses; `frontend/src/stores/view/viewStore.ts`.
- [x] `W01.P02.S08` - Pass active lens into useGraphSlice from Stage; `frontend/src/app/stage/Stage.tsx`.

### Phase `W01.P03` - mock + corpus fidelity

Make the mock engine and fixture corpus serve salience, derivation, and embedding shaped exactly per the upstream ADRs, proven by a consumer test through the real client path.

- [x] `W01.P03.S09` - Compute deterministic per-lens salience in the fixture corpus; `frontend/src/testing/fixtures/corpus.ts`.
- [x] `W01.P03.S10` - Add derivation labels to lifecycle-axis edges in the corpus; `frontend/src/testing/fixtures/corpus.ts`.
- [x] `W01.P03.S11` - Add per-node embedding vectors to document nodes in the corpus; `frontend/src/testing/fixtures/corpus.ts`.
- [x] `W01.P03.S12` - Serve salience for the requested lens and derivation/embedding from the mock graph route; `frontend/src/testing/mockEngine.ts`.
- [x] `W01.P03.S13` - Add a consumer test feeding a mock graph sample through adaptGraphSlice asserting new fields survive; `frontend/src/stores/server/liveAdapters.salience.test.ts`.

## Wave `W02` - scene layout modes + encoding + backbone

Build the v1 layout modes in the CPU worker (lineage derivation-DAG; v1-gated semantic UMAP), the salience/derivation/DOI encoding, and the anti-hairball backbone (disparity-filter thinning + hierarchical edge bundling). Depends on W01 types. Backed by the graph-representation ADR and research.

### Phase `W02.P04` - scene seam + salience/DOI encoding

Map salience to size and label-priority and derivation onto the scene edge, encode the channel map through tokens.

- [x] `W02.P04.S14` - Add salience-driven nodeRadius helper superseding member-count for non-feature species; `frontend/src/scene/field/nodeSprites.ts`.
- [x] `W02.P04.S15` - Add salience as a label-priority input to the DOI label-culling pass; `frontend/src/scene/field/nodeSprites.ts`.
- [x] `W02.P04.S16` - Encode derivation onto edge treatment via tokens; `frontend/src/scene/field/edgeMeshes.ts`.
- [x] `W02.P04.S17` - Add a salience-encoding unit test; `frontend/src/scene/field/salienceEncoding.test.ts`.

### Phase `W02.P05` - lineage derivation-DAG layout

Build the CPU-worker lineage layout that lays the directed derivation DAG along a derivation/time axis from the derivation edge labels, with honest dangling-stub handling.

- [x] `W02.P05.S18` - Add a pure lineage DAG ordering module (derivation-axis longest-path layering); `frontend/src/scene/field/lineageLayout.ts`.
- [x] `W02.P05.S19` - Render dangling lineage stubs honestly for incomplete derivation chains; `frontend/src/scene/field/lineageLayout.ts`.
- [x] `W02.P05.S20` - Unit-test lineage layering, axis ordering, and dangling-stub honesty; `frontend/src/scene/field/lineageLayout.test.ts`.
- [x] `W02.P05.S21` - Add a representationLayout dispatcher selecting connectivity vs lineage vs semantic; `frontend/src/scene/field/representationLayout.ts`.
- [x] `W02.P05.S22` - Wire lineage positions into the field layout path behind a representation mode; `frontend/src/scene/field/fieldAssembly.ts`.

### Phase `W02.P06` - semantic UMAP mode (v1-gated)

Build the CPU-worker UMAP projection over per-node embeddings as a gated v1 mode, with the measured promotion gate as a step and a connectivity fallback for nodes lacking an embedding.

- [x] `W02.P06.S23` - Add a CPU UMAP-lite projection over embeddings with connectivity fallback for embeddingless nodes; `frontend/src/scene/field/semanticLayout.ts`.
- [x] `W02.P06.S24` - Add the measured promotion gate (projection time budget + cluster separation check); `frontend/src/scene/field/semanticGate.ts`.
- [x] `W02.P06.S25` - Unit-test the UMAP projection, fallback positions, and the gate verdict; `frontend/src/scene/field/semanticLayout.test.ts`.
- [x] `W02.P06.S26` - Record the v1 semantic-mode gate verdict in the layout dispatcher; `frontend/src/scene/field/representationLayout.ts`.

### Phase `W02.P07` - anti-hairball backbone

Draw layout on the declared+structural layout backbone, disparity-filter-thin temporal/semantic to their significant subset, bundle hierarchically, DOI-gate, and un-bundle on hover.

- [x] `W02.P07.S27` - Add a pure disparity-filter thinning of temporal/semantic edges to their significant subset; `frontend/src/scene/field/disparityFilter.ts`.
- [x] `W02.P07.S28` - Compute the declared+structural layout backbone and feed only it to the layout; `frontend/src/scene/field/backbone.ts`.
- [x] `W02.P07.S29` - Add hierarchical edge bundling geometry along the feature containment; `frontend/src/scene/field/edgeBundling.ts`.
- [x] `W02.P07.S30` - Un-bundle bundled edges on hover via the ego highlight; `frontend/src/scene/field/edgeBundling.ts`.
- [x] `W02.P07.S31` - Unit-test disparity filter, backbone selection, and bundling/un-bundling; `frontend/src/scene/field/backbone.test.ts`.

## Wave `W03` - switching, composition, overlays

Add the set-representation-mode and set-overlays SceneController commands, the stores/app-owned active-mode/active-lens view state with composition sequencing (lens re-query then mode re-layout), and the feature overlays (GMap countries, BubbleSets hulls). Depends on W02 layout modes. Backed by the graph-representation ADR switching/composition sections.

### Phase `W03.P08` - representation-mode + overlays commands

Add the set-representation-mode and set-overlays SceneController commands additively to the locked union, distinct from set-layout-mode, with id-keyed object constancy across a switch.

- [x] `W03.P08.S32` - Add set-representation-mode command and representation-mode-changed event to the seam; `frontend/src/scene/sceneController.ts`.
- [x] `W03.P08.S33` - Add set-overlays command to the SceneCommand union; `frontend/src/scene/sceneController.ts`.
- [x] `W03.P08.S34` - Handle set-representation-mode in field assembly re-laying out with id-keyed object constancy; `frontend/src/scene/field/fieldAssembly.ts`.
- [x] `W03.P08.S35` - Unit-test the new commands, object constancy across a mode switch, and the echoed event; `frontend/src/scene/sceneController.representation.test.ts`.

### Phase `W03.P09` - view state + composition sequencing

Own active representation-mode and active-lens in the stores/app view store and sequence lens re-query then mode re-layout so every lens is viewable in every mode.

- [x] `W03.P09.S36` - Add activeRepresentationMode and setRepresentationMode to the view store; `frontend/src/stores/view/viewStore.ts`.
- [x] `W03.P09.S37` - Add a pure composition sequencer (lens re-query then mode re-layout) module; `frontend/src/stores/view/composition.ts`.
- [x] `W03.P09.S38` - Unit-test composition sequencing keeps every lens viewable in every mode; `frontend/src/stores/view/composition.test.ts`.
- [x] `W03.P09.S39` - Wire representation-mode and overlays from the view store into Stage scene commands; `frontend/src/app/stage/Stage.tsx`.

### Phase `W03.P10` - feature overlays

Render GMap feature-country labels at overview and BubbleSets hulls at document LOD as set overlays that do not move nodes, toggled by set-overlays.

- [x] `W03.P10.S40` - Add GMap feature-country label geometry at overview LOD; `frontend/src/scene/field/overlays.ts`.
- [x] `W03.P10.S41` - Add BubbleSets hull geometry at document LOD; `frontend/src/scene/field/bubbleSets.ts`.
- [x] `W03.P10.S42` - Render overlays as a layer toggled by set-overlays without re-layout; `frontend/src/scene/field/fieldAssembly.ts`.
- [x] `W03.P10.S43` - Unit-test country labels, hull computation, and overlay toggling; `frontend/src/scene/field/overlays.test.ts`.

## Wave `W04` - consumer-ADR amendments + integration

Amend the two accepted consumer ADRs (node-canvas salience-size/label-priority; canvas-controls representation-mode + lens selectors) by body-prose edit and land their code, then integrate and run the full green gate. Depends on W01-W03. Backed by the graph-representation ADR required-downstream-amendments section.

### Phase `W04.P11` - node-canvas amendment + code

Amend the node-canvas ADR (salience-size supersedes member-count radius; salience as label-priority) by body-prose edit and land the matching scene code.

- [x] `W04.P11.S44` - Amend node-canvas ADR body: salience-size supersedes member-count radius rule; `.vault/adr/2026-06-14-dashboard-node-canvas-adr.md`.
- [x] `W04.P11.S45` - Amend node-canvas ADR body: salience as label-priority input; `.vault/adr/2026-06-14-dashboard-node-canvas-adr.md`.
- [x] `W04.P11.S46` - Land the salience-size and label-priority code and verify member-count folds into feature salience; `frontend/src/scene/field/nodeSprites.ts`.

### Phase `W04.P12` - canvas-controls amendment + controls

Amend the canvas-controls ADR (representation-mode selector reconciled with force/circular; lens selector) by body-prose edit and land the app-chrome control groups.

- [x] `W04.P12.S47` - Amend canvas-controls ADR body: add representation-mode selector reconciled with force/circular; `.vault/adr/2026-06-14-dashboard-canvas-controls-adr.md`.
- [x] `W04.P12.S48` - Amend canvas-controls ADR body: add lens selector control group; `.vault/adr/2026-06-14-dashboard-canvas-controls-adr.md`.
- [x] `W04.P12.S49` - Build the RepresentationModePanel control emitting mode intent into the view store; `frontend/src/app/stage/RepresentationModePanel.tsx`.
- [x] `W04.P12.S50` - Build the LensSelector control emitting lens intent into the view store; `frontend/src/app/stage/LensSelector.tsx`.

### Phase `W04.P13` - integration + animated deltas + green gate

Wire the modes/overlays/selectors into Stage with animated incremental deltas, run the full lint gate and vitest to green, and commit.

- [x] `W04.P13.S51` - Mount the RepresentationModePanel and LensSelector into Stage; `frontend/src/app/stage/Stage.tsx`.
- [x] `W04.P13.S52` - Drive animated incremental deltas across a mode switch in Stage; `frontend/src/app/stage/Stage.tsx`.
- [x] `W04.P13.S53` - Add render tests for the mode and lens selector controls; `frontend/src/app/stage/RepresentationModePanel.test.tsx`.
- [x] `W04.P13.S54` - Run just dev lint all to exit 0 and fix any findings; `frontend/src`.
- [x] `W04.P13.S55` - Run frontend vitest to green and commit by pathspec; `frontend/src`.

## Description

Carry the `graph-representation` ADR into the dashboard: a DOI-bounded,
multi-mode, backbone-disciplined representation over the one `LinkageGraph`. This
plan builds the v1 ledger only (connectivity default plus lineage plus the
v1-gated semantic UMAP mode; the backbone draw; feature overlays; the channel
encoding map; the `set-representation-mode` and `set-overlays` seam commands with
stores/app-owned mode and lens state and the lens-times-mode composition
sequencing; animated incremental deltas), and amends the two accepted consumer
ADRs (node-canvas salience-size and label-priority; canvas-controls
representation-mode and lens selectors). The deferred ledger items (AI/LinkQ, LLM
labeling, KelpFusion, NodeTrix, DRGraph, sfdp, GNN layout) are out of scope. The
work is mostly frontend (scene, stores, app); the `salience`, `derivation`, and
`embedding` engine producers are built in a parallel feature and are an
integration seam here, so this plan adds those fields to the stores wire types and
the mock corpus shaped exactly per the upstream ADRs and notes the engine side as
a seam. Authorized by the `graph-representation`, `graph-node-salience`, and
`graph-node-semantics` ADRs, consuming and amending the `dashboard-node-canvas`
and `dashboard-canvas-controls` ADRs.

## Steps







## Parallelization

Waves are sequenced: W01 (wire and stores types) must land before W02 (scene
layout modes consume the new fields), which must land before W03 (switching and
composition drive the modes), which must land before W04 (consumer-ADR amendments
and integration depend on all of it). Within a wave, phases sharing no file may run
together: in W02, the lineage (P05), semantic (P06), and backbone (P07) phases are
independent CPU-worker modules and parallelize after the encoding seam (P04); in
W04, the node-canvas (P11) and canvas-controls (P12) amendments are independent
documents and surfaces. P03's mock fidelity must follow P01's type additions. The
final green-gate step (P13) is strictly last.

## Verification

The plan is complete when every Step is closed and:

- The full lint gate passes (`just dev lint all` exit 0: eslint, prettier, tsc),
  and frontend vitest is green with no tautological or skipped tests added.
- The stores wire types and the mock corpus carry `salience` (per-lens float),
  `derivation` (edge label), and `embedding` (per-node vector) shaped exactly per
  the upstream ADRs, proven by a consumer test through the real client path
  (`adaptGraphSlice`), with the engine production side marked as an integration
  seam.
- The scene serves connectivity (default), lineage, and the semantic UMAP mode
  (shipped or held per the measured gate, recorded), each a CPU-worker layout; the
  GPU only renders; the engine holds no coordinates.
- `set-representation-mode` and `set-overlays` are additive `SceneController`
  commands distinct from `set-layout-mode`, with id-keyed object constancy across a
  switch; the stores/app view store owns active mode and active lens and sequences
  lens re-query then mode re-layout so every lens is viewable in every mode.
- The anti-hairball backbone (declared+structural layout backbone, disparity-filter
  thinning, hierarchical bundling, un-bundle-on-hover) and the feature overlays
  (GMap countries, BubbleSets hulls) are present.
- The node-canvas and canvas-controls ADRs are amended by body-prose edit
  (salience-size supersedes member-count radius; salience label-priority;
  representation-mode selector reconciled with force/circular; lens selector) and
  their code lands.
- Layer boundaries hold: scene receives data only via commands and emits events;
  stores is the sole wire client; chrome never fetches; tokens via the shared
  `:root` layer (scene-read tokens literal hex); icons from the two sanctioned
  families; every graph read stays bounded.

