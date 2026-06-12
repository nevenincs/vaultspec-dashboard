---
tags:
  - '#plan'
  - '#dashboard-gui'
date: '2026-06-12'
tier: L3
related:
  - '[[2026-06-12-dashboard-gui-adr]]'
  - '[[2026-06-12-dashboard-foundation-adr]]'
  - '[[2026-06-12-dashboard-foundation-reference]]'
  - '[[2026-06-12-dashboard-foundation-research]]'
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

# `dashboard-gui` plan

## Wave `W01` - scene and renderer core

Delivers the committed renderer with the G6.b spike gate closed, the renderer-agnostic scene data and delta engine, the PixiJS field, and DOM-island anchoring on the locked SceneController seam. Wave W02 depends on every phase here. Authorized by the dashboard-gui ADR sections 3.4, 5.2 and 6 and the foundation reference contract.

### Phase `W01.P01` - renderer gate closure

Closes the G6.b spike gate on integrated GPUs and locks the SceneController seam the whole frontend builds on.

- [x] `W01.P01.S01` - replace per-frame edge re-tessellation with mesh-based edge rendering in the spike harness per the G6.b spike finding; `frontend/spike`.
- [x] `W01.P01.S02` - run the integrated-GPU frame-time gate at 1k/5k and 10k/50k synthetic corpora and record results against the G6.b gate criteria; `frontend/spike`.
- [x] `W01.P01.S03` - record the renderer verdict, PixiJS v8 confirmed or sigma.js v3 fallback invoked, against ADR row G6.b and flag any deviation to the ADR; `frontend/spike`.
- [x] `W01.P01.S04` - lock the SceneController command, event, and anchor surface with the RL-1 to RL-5 fold confirmed as final; `frontend/src/scene/sceneController.ts`.

### Phase `W01.P02` - scene data and delta engine

Builds the renderer-agnostic scene model: contract-shaped graph slices, keyframe plus delta replay on one sequence clock, visibility transitions, and warm-start position persistence.

- [x] `W01.P02.S05` - implement the contract-shaped scene graph model with node kind, lifecycle, degree-by-tier and edge relation, tier, confidence, state per G3.a and the contract identity guarantees; `frontend/src/scene/graphModel.ts`.
- [x] `W01.P02.S06` - implement keyframe set-data and apply-deltas replay on the single sequence clock with splice-gap re-keyframe per G4.b; `frontend/src/scene/deltaLog.ts`.
- [x] `W01.P02.S07` - implement set-visibility membership diffs with d3-interpolator fade transitions per G3.f; `frontend/src/scene/visibility.ts`.
- [x] `W01.P02.S08` - implement the client-side position cache and warm-start persistence keyed by workspace and scope per G5.d and G3.e; `frontend/src/scene/positionCache.ts`.

### Phase `W01.P03` - Pixi field renderer

Implements the WebGL field behind the SceneController seam: LOD node sprites, tier-treated edges, camera and hit-testing, and the ForceAtlas2 worker.

- [x] `W01.P03.S09` - mount the PixiJS application behind the SceneController lifecycle of mount, resize, destroy per G6.b; `frontend/src/scene/field/pixiField.ts`.
- [x] `W01.P03.S10` - render node sprites with LOD discipline, silhouette and state colour far, full anatomy near, per G3.a and the ADR section 3.1 node anatomy; `frontend/src/scene/field/nodeSprites.ts`.
- [x] `W01.P03.S11` - render edges with the fixed tier treatments, solid, status-coloured, dotted, haze, and grayscale-safe confidence encoding per G3.c and G7.d; `frontend/src/scene/field/edgeMeshes.ts`.
- [x] `W01.P03.S12` - implement camera pan and zoom with semantic-zoom thresholds and pointer hit-testing emitting hover, select, open events per G3.b; `frontend/src/scene/field/camera.ts`.
- [x] `W01.P03.S13` - integrate the graphology ForceAtlas2 web worker with warm-start and local-perturbation re-layout per G3.e, using Vite worker imports per the foundation report rider; `frontend/src/scene/field/layoutWorker.ts`.

### Phase `W01.P04` - DOM islands and anchoring

Implements the hybrid overlay per G6.a: screen-space anchor subscriptions, the React island layer, and the placeholder glyph set pending the commissioned family.

- [x] `W01.P04.S14` - implement trackNode screen-space anchor subscriptions driven by camera and layout updates per G6.a; `frontend/src/scene/field/anchors.ts`.
- [x] `W01.P04.S15` - implement the React island layer rendering opened nodes at tracked anchors per G6.a; `frontend/src/app/islands/IslandLayer.tsx`.
- [x] `W01.P04.S16` - create the placeholder programmatic glyph set for doc types, tiers, and states as sprite and SDF textures pending the commissioned family per G7.c; `frontend/src/scene/field/glyphs.ts`.

## Wave `W02` - the instrument

Delivers the product's core instrument on the W01 scene: graph stage interactions, the filter system, and the timeline with playhead-driven time travel. All engine reads in this wave run against contract-mock fixtures because the live engine serve mode lands in the engine plan's own wave; the mock layer mirrors the foundation reference at capability level. Wave W03 depends on this wave. Authorized by the dashboard-gui ADR sections 3 and 4.

### Phase `W02.P05` - contract mock fixtures

Builds the typed engine client and a mock engine mirroring the foundation reference so all W02 work proceeds before the live engine lands; this phase is the cross-plan dependency fence.

- [x] `W02.P05.S17` - implement the typed engine API client covering the contract query families map, vault-tree, graph query, nodes, filters, events, asof, diff, status, search, ops; `frontend/src/stores/server/engine.ts`.
- [x] `W02.P05.S18` - build the synthetic vault corpus fixtures with features, documents, plan interiors, tiered edges, and an event log mirroring contract shapes; `frontend/src/testing/fixtures`.
- [x] `W02.P05.S19` - implement the mock engine with HTTP handlers and SSE channels carrying sequence numbers and tier degradation blocks, toggled by env flag; `frontend/src/testing/mockEngine.ts`.
- [x] `W02.P05.S20` - wire TanStack Query hooks with streamedQuery SSE consumption and cache keys of scope, filter, as-of per G5.b and the stateless-scope contract guarantee; `frontend/src/stores/server/queries.ts`.

### Phase `W02.P06` - stage interactions

Implements the details-first interaction model per G3.b: constellation, ego highlight, shared selection, open-in-place interiors, working set, discover, and pins.

- [x] `W02.P06.S21` - render the initial feature constellation with engine-aggregated meta-edges per G3.a and G3.d; `frontend/src/app/stage/Stage.tsx`.
- [x] `W02.P06.S22` - implement hover ego-highlight with field recede and DOI label culling per G3.b; `frontend/src/scene/field/egoHighlight.ts`.
- [ ] `W02.P06.S23` - implement the shared selection concept syncing stage, view store, browser, timeline, and inspector per G2.b; `frontend/src/stores/view/selection.ts`.
- [ ] `W02.P06.S24` - implement open-in-place feature lifecycle and plan interior islands with canonical lifecycle-axis and tier layouts per G3.b and G3.e; `frontend/src/app/islands/NodeInterior.tsx`.
- [ ] `W02.P06.S25` - implement expand-ego working set with breadcrumb chips, collapse, and clear-to-constellation per G3.b; `frontend/src/app/stage/WorkingSet.tsx`.
- [ ] `W02.P06.S26` - implement the node-scoped discover flow with visually quarantined, session-pinned-only semantic candidates per G3.c; `frontend/src/app/stage/Discover.tsx`.
- [ ] `W02.P06.S27` - implement node pinning, layout-fixed and always-labelled, with client-side persistence per G5.d; `frontend/src/stores/view/pins.ts`.

### Phase `W02.P07` - filter system

Implements the single filter model spanning stage and timeline per G3.f: engine-enumerated vocabulary, tier dial, facet chips, and named lenses.

- [ ] `W02.P07.S28` - implement the filter model bound to the engine-enumerated filters vocabulary with per-tier confidence floats per G3.f and contract redline R3; `frontend/src/stores/view/filters.ts`.
- [ ] `W02.P07.S29` - build the tier dial control with per-tier toggles and confidence thresholds, semantic rendered inapplicable in time-travel, per G3.f and G4.b; `frontend/src/app/stage/TierDial.tsx`.
- [ ] `W02.P07.S30` - build the facet chip bar for doc type, feature, relation, structural status, text match, with the hidden-count chip per G3.f; `frontend/src/app/stage/FilterBar.tsx`.
- [ ] `W02.P07.S31` - implement named lenses saved client-side and exposed to the command palette per G3.f and G5.d; `frontend/src/stores/view/lenses.ts`.

### Phase `W02.P08` - timeline

Implements the bottom-docked movie-idiom timeline per G4: lanes and density buckets, playhead with LIVE docking, time-travel scrubbing driving the scene, and range selection.

- [ ] `W02.P08.S32` - build the timeline lanes with engine-bucketed density rendering resolving to event marks at fine zoom per G4.a; `frontend/src/app/timeline/Timeline.tsx`.
- [ ] `W02.P08.S33` - implement the playhead with LIVE docking and unmistakable time-travel mode entry and exit per G4.b; `frontend/src/app/timeline/Playhead.tsx`.
- [ ] `W02.P08.S34` - drive scene set-time from the playhead via asof keyframes and client diff-log replay with re-keyframe on large jumps per G4.b; `frontend/src/app/timeline/timeTravel.ts`.
- [ ] `W02.P08.S35` - implement range selection as the product's single date-range filter with play-the-range growth animation per G4.c; `frontend/src/app/timeline/RangeSelect.tsx`.
- [ ] `W02.P08.S36` - implement event-mark click selection with node-ids cross-highlight pulse on the stage per G2.b and the contract event shape; `frontend/src/app/timeline/eventSelection.ts`.

## Wave `W03` - chrome and integration

Delivers the supporting cast and the truthfulness layer: left and right rails, command palette, search, degradation states, visual-language application, and the swap from contract mocks to the live engine origin. The final integration steps carry a hard cross-plan dependency on the engine plan's serve wave having landed. Authorized by the dashboard-gui ADR sections 2, 7 and 8.

### Phase `W03.P09` - left rail

Implements orientation and scope per G2: worktree picker, vault-scoped read-only browser, and bidirectional selection.

- [ ] `W03.P09.S37` - build the worktree picker over the map endpoint with corpus-bearing worktrees primary and bare refs dimmed per G2.a; `frontend/src/app/left/WorktreePicker.tsx`.
- [ ] `W03.P09.S38` - build the vault-scoped read-only file browser over the vault-tree endpoint with doc-type glyphs and freshness per G2.c; `frontend/src/app/left/VaultBrowser.tsx`.
- [ ] `W03.P09.S39` - wire bidirectional selection between browser and stage per G2.b; `frontend/src/app/left/browserSelection.ts`.

### Phase `W03.P10` - right rail

Implements the activity rail per G2: now strip, the whitelisted ops surface with confirmations, and the inspector.

- [ ] `W03.P10.S40` - build the now strip showing git, core in-flight, and rag rollup from the status snapshot plus SSE backends and git channels; `frontend/src/app/right/NowStrip.tsx`.
- [ ] `W03.P10.S41` - build the ops surface with confirmation flows over the whitelisted ops proxy verbs, disabled in time-travel mode per G4.b; `frontend/src/app/right/OpsPanel.tsx`.
- [ ] `W03.P10.S42` - build the inspector with metadata, content preview, evidence, correlated commits, and the per-tier edge list with unfold-on-selection per G2.b and G3.c; `frontend/src/app/right/Inspector.tsx`.

### Phase `W03.P11` - command palette and search

Implements the universal verb surface and pillar-3 search with the rag-down fallback.

- [ ] `W03.P11.S43` - build the command palette fronting navigation, lenses, and ops verbs on the committed primitives per G2.a and G5.c; `frontend/src/app/palette/CommandPalette.tsx`.
- [ ] `W03.P11.S44` - build the search tab over the search pass-through with typed filter chips and node-id click-through to the stage; `frontend/src/app/right/SearchTab.tsx`.
- [ ] `W03.P11.S45` - implement the rag-down text-match fallback with the explicit semantic-search-offline state per G8.a; `frontend/src/app/right/searchFallback.ts`.

### Phase `W03.P12` - degradation, visual language, live integration

Implements the degradation matrix as a tested feature, applies the design-token visual language and accessibility floor, and swaps mocks for the live engine origin; the swap steps require the engine plan's serve wave to have landed.

- [ ] `W03.P12.S46` - implement the degradation matrix states with a debug switch making every state reachable, and tests per G8.a; `frontend/src/app/degradation`.
- [ ] `W03.P12.S47` - implement the design token layer, paper-warm light and dark themes, fixed tier hues and treatments, type scale, motion durations, in Tailwind CSS-first config per G7.a and G7.d; `frontend/src/styles.css`.
- [ ] `W03.P12.S48` - implement reduced-motion support and full keyboard operability, arrow-walk the graph and bracket-step the playhead, per G7.d; `frontend/src/app/a11y`.
- [ ] `W03.P12.S49` - swap the mock engine for the live serve origin behind the env flag and verify contract shapes against the real API, requires the engine plan serve wave landed; `frontend/src/stores/server/engine.ts`.
- [ ] `W03.P12.S50` - add the end-to-end smoke launching against live engine serve verifying constellation render, scrub, and search round-trip, requires the engine plan serve wave landed; `frontend/e2e/smoke.spec.ts`.

## Description

Implements the dashboard GUI from the accepted dashboard-gui ADR: the
four-region window whose center stage renders the second-brain vault graph on
a GPU field, with the movie-idiom timeline driving time travel, one filter
model spanning both, and the supporting rails, palette, and search. The plan
operates on the frontend scaffold landed by the dashboard-foundation work
(committed SceneController seam, three-store state split, mock-ready engine
client) and builds in three waves: the scene and renderer core (W01), the
instrument itself (W02), and chrome plus live-engine integration (W03).

Every Step row cites the decision rows (G2.a through G8.a) of the kickoff
decisions register so deviations are flagged against the ADR rather than
silently absorbed. The engine-GUI contract (the foundation reference) is
binding at capability level: W02 runs entirely against contract-mock fixtures
built in phase W02.P05, and only the final two Steps of W03.P12 require the
live engine serve mode from the sibling engine plan. Two human-flagged items
ride this plan: the W01.P01 renderer spike gate (ADR row G6.b, integrated-GPU
run still open) and the commissioned glyph family (G7.c), for which W01.P04
ships a programmatic placeholder set.

## Parallelization

Waves are sequenced: W01 lands before W02, W02 before W03. Within W01, phases
W01.P01 and W01.P02 may run in parallel (the gate closure touches the spike
harness and the SceneController lock; the data engine is renderer-agnostic);
W01.P03 requires both; W01.P04 requires W01.P03. Within W02, phase W02.P05 is
the gate: it must land first, then W02.P06, W02.P07, and W02.P08 may proceed
in parallel, with the single ordering caveat that W02.P08 Step S34 (scene
set-time) consumes the delta log from W01.P02 and the playhead from S33.
Within W03, phases W03.P09, W03.P10, and W03.P11 are mutually independent and
parallelizable; W03.P12 closes the plan and its final two Steps (S49, S50)
block on the engine plan's serve wave - the only cross-plan hard dependency.

## Verification

- `vaultspec-core vault plan check` passes on this document and every Step is
  closed (`- [x]`).
- The W01.P01 gate record exists: frame-time numbers at 1k/5k and 10k/50k on
  the dedicated-GPU hardware baseline (the integrated-GPU literal run was
  waived by human decision 2026-06-12, recorded in the decisions ADR G6.b
  flag; iGPU is best-effort, non-gating), with the renderer verdict recorded
  against ADR row G6.b and any deviation flagged to the ADR, never silently
  absorbed.
- Frontend quality gates stay green at every phase boundary: vitest suite,
  eslint, typecheck, and prettier check over `frontend/`.
- The scene seam holds: no React import appears under `frontend/src/scene/`,
  and no per-frame state crosses into React (reviewed at W01 close).
- The mock engine round-trips the contract: every query family the client
  calls is served by the mock with tier degradation blocks and sequence
  numbers, and the same client code passes unchanged against the live engine
  in S49 (the contract-shape verification).
- Time travel is truthful: scrubbing renders declared, structural, and
  temporal tiers only, progress rings render state as of T, and the LIVE
  splice produces no gap or duplicate (single delta clock, verified by test).
- The degradation matrix states are each reachable via the debug switch and
  covered by tests (G8.a).
- Accessibility floor verified: tier encoding legible in grayscale, WCAG AA
  contrast on both themes, full keyboard operability of stage and timeline,
  reduced-motion honored (G7.d).
- End-to-end smoke (S50) passes against a live `vaultspec serve` origin.
