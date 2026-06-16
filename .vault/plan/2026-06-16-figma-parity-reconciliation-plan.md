---
tags:
  - '#plan'
  - '#figma-parity-reconciliation'
date: '2026-06-16'
modified: '2026-06-16'
tier: L3
related:
  - '[[2026-06-16-figma-parity-reconciliation-adr]]'
  - '[[2026-06-16-figma-parity-reconciliation-research]]'
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
     Replace figma-parity-reconciliation with a kebab-case feature tag, e.g. #foo-bar.
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

# `figma-parity-reconciliation` plan

Rewrite the dashboard chrome and headline canvas to the binding Figma designs over a
preserved, foundation-first backend, then reconcile the superseded decisions.

## Wave `W01` - Foundation - stable base and linkage

Establish the stable foundation the view rewrite builds against: close the non-color DTCG token pipeline and adopt the Figma foundation across type, radius, and elevation; freeze and enrich the preserved stores plus SceneController contract as the rewrite API and add the bounded read-only historical text-diff engine route; and finalize the Code Connect linkage from code components to the Figma Kit primitives. Authorized by the figma-parity-reconciliation ADR and research. No downstream Wave may begin until this base is stable; W02 and W03 both consume it.

### Phase `W01.P01` - Token pipeline and Figma foundation

Close the non-color DTCG token pipeline (generator plus Figma mirror) for type, spacing, radius, and elevation, adopt the Figma type scale, radius scale, three-level elevation, and Inter plus JetBrains Mono fonts, and migrate the divergent usages across the codebase.

- [x] `W01.P01.S01` - Author the DTCG type-scale source with the Figma role names display, title, body, body-strong, label, meta, caption, and mono; `frontend/tokens/type.tokens.json`.
- [x] `W01.P01.S02` - Author the DTCG radius source with the Figma scale xs4, sm5, md7, lg10, and pill18; `frontend/tokens/radius.tokens.json`.
- [x] `W01.P01.S03` - Author the DTCG elevation source with the Figma three-level scale raised, overlay, and popover; `frontend/tokens/elevation.tokens.json`.
- [x] `W01.P01.S04` - Author the DTCG spacing source mirroring the existing 4-base scale to bring spacing under the generated pipeline; `frontend/tokens/spacing.tokens.json`.
- [x] `W01.P01.S05` - Extend the Style Dictionary resolver and build to emit the four non-color families into the generated stylesheet regions; `frontend/tokens/resolver.json`.
- [x] `W01.P01.S06` - Extend the Figma token mirror to carry the type, spacing, radius, and elevation families alongside color; `frontend/tokens/figma/tokens.json`.
- [x] `W01.P01.S07` - Adopt Inter and JetBrains Mono as the bound font families, replacing the system stack; `frontend/src/styles.css`.
- [x] `W01.P01.S08` - Migrate the ~30 elevation usages from the six-level scale to the three Figma levels, smallest blast radius first; `frontend/src/`.
- [x] `W01.P01.S09` - Migrate the ~167 radius usages to the Figma scale, re-keying and converting rounded-full to pill18; `frontend/src/`.
- [x] `W01.P01.S10` - Migrate the ~309 text usages to the Figma role-named type scale, guarding the text-title versus text-heading collision; `frontend/src/`.

### Phase `W01.P02` - Backend base and stable contract

Freeze and document the preserved stores plus SceneController contract as the rewrite API, enrich the node-evidence projection to the GUI shape, add the bounded read-only historical text-diff engine route, and mock-mirror the new wire shapes with conformance tests.

- [x] `W01.P02.S11` - Freeze and document the preserved stores hooks as the rewrite-consumable contract API surface; `frontend/src/stores/`.
- [x] `W01.P02.S12` - Freeze and document the SceneController command and event contract as the canvas rewrite API surface; `frontend/src/scene/sceneController.ts`.
- [x] `W01.P02.S13` - Enrich the node-evidence projection to the GUI shape (document path plus doc_type, corrected code-location field, commit subject) through the shared envelope; `engine/crates/engine-query/src`.
- [x] `W01.P02.S14` - Add the bounded read-only historical text-diff route as a two-rev git diff whitelist extension, read-and-infer with no vault writes; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `W01.P02.S15` - Carry the tiers degradation block on the historical text-diff route success and error envelopes through the shared helper; `engine/crates/vaultspec-api/src/routes/ops.rs`.
- [x] `W01.P02.S16` - Mirror the enriched node-evidence shape in the mock engine to match the live wire byte-for-byte; `frontend/src/stores/server/mockEngine.ts`.
- [x] `W01.P02.S17` - Mirror the historical text-diff route shape in the mock engine to match the live wire byte-for-byte; `frontend/src/stores/server/mockEngine.ts`.
- [x] `W01.P02.S18` - Add conformance tests feeding a captured live sample of both new shapes through the shared client adapter path; `frontend/src/stores/server/liveAdapters.test.ts`.

### Phase `W01.P03` - Code Connect linkage

Finalize the code-component to Figma-Kit-primitive cross-mapping through the Code Connect CLI so all mappable components parse clean and the linkage is publish-ready for the human's gated publish step.

- [x] `W01.P03.S19` - Finalize the component registry repointed to the live Figma file mapping code components to the Kit primitives at frame 135:2; `frontend/figma/component-map.json`.
- [x] `W01.P03.S20` - Author or update the Code Connect config naming the live file and the connect directory; `frontend/figma.config.json`.
- [x] `W01.P03.S21` - Author parse-clean figma mappings for every mappable code component against its Kit primitive; `frontend/figma/connect/`.
- [x] `W01.P03.S22` - Validate the full Code Connect map parses with zero errors via figma connect parse, leaving publish as the human's gated step; `frontend/figma/connect/`.

## Wave `W02` - View rewrite - chrome

Rewrite the frontend/src/app chrome surface-group by surface-group from the binding Figma frames: the app shell and left rail (vault, code, tree browsers), the right activity rail and stage chrome, and the timeline, overlays, settings, and command palette. Each surface is rebuilt as a dumb projection over the preserved stores hooks, using only foundation tokens and the sanctioned mark families, with degradation read from the tiers block. Depends on W01 (foundation tokens, frozen contract, Code Connect linkage must be stable first); W03 is independent of this Wave's chrome work but shares the same foundation. Authorized by the figma-parity-reconciliation ADR and research.

### Phase `W02.P04` - App shell and left rail

Rebuild the app shell frame and the left rail (vault, code, and tree browsers) from their binding frames as dumb projections over the preserved browser-mode and selection stores, tokens-only.

- [x] `W02.P04.S23` - Rebuild the app shell layout frame from its binding frame as a dumb projection over the preserved view stores; `frontend/src/app/AppShell.tsx`.
- [x] `W02.P04.S24` - Rebuild the left rail container and rail filter from the binding LeftRail Kit primitive over the preserved browser-mode store; `frontend/src/app/left/LeftRail.tsx`.
- [x] `W02.P04.S25` - Rebuild the vault browser from its binding frame over the preserved vault-tree query and selection store; `frontend/src/app/left/VaultBrowser.tsx`.
- [x] `W02.P04.S26` - Rebuild the code tree browser from the binding CodeTree Kit primitive over the preserved code-selection store; `frontend/src/app/left/CodeTree.tsx`.
- [x] `W02.P04.S27` - Rebuild the tree browser from the binding TreeBrowser Kit primitive over the preserved tree query with plan-progress pips; `frontend/src/app/left/TreeBrowser.tsx`.

### Phase `W02.P05` - Right rail and stage chrome

Rebuild the right activity rail (tabs, inspector, work, search, changes) and the stage chrome (filters, controls, minimap, overlays) from their binding frames over the preserved stores, with degradation read from the tiers block.

- [x] `W02.P05.S28` - Rebuild the right rail tab bar to the binding Inspect Work Search Changes IA with the liveness pillars promoted to a persistent header; `frontend/src/app/right/RailTabs.tsx`.
- [x] `W02.P05.S29` - Rebuild the inspector tab from its binding frame over the preserved selection and enriched node-evidence query; `frontend/src/app/right/Inspector.tsx`.
- [x] `W02.P05.S30` - Rebuild the work tab from the binding WorkTab Kit primitive over the preserved pipeline-status query; `frontend/src/app/right/WorkTab.tsx`.
- [x] `W02.P05.S31` - Rebuild the search tab from the binding SearchField Kit primitive over the preserved discover query, reading semantic-offline from tiers; `frontend/src/app/right/SearchTab.tsx`.
- [x] `W02.P05.S32` - Rebuild the changes overview and diff view from their binding frames over the preserved diff query, including the historical text-diff route; `frontend/src/app/right/DiffView.tsx`.
- [x] `W02.P05.S33` - Rebuild the stage filter bar and sidebar from the binding FacetChipGroup primitive over the preserved filter store; `frontend/src/app/stage/FilterBar.tsx`.
- [x] `W02.P05.S34` - Rebuild the stage minimap widget from its binding frame over the preserved scene viewport state; `frontend/src/app/stage/MinimapWidget.tsx`.

### Phase `W02.P06` - Timeline, overlays, settings, and command palette

Rebuild the timeline, the degradation and discover overlays, the settings dialog, and the command palette from their binding frames over the preserved stores, tokens-only and schema-driven.

- [x] `W02.P06.S35` - Rebuild the timeline from the binding Timeline Kit primitive over the preserved events query and time-travel store; `frontend/src/app/timeline/Timeline.tsx`.
- [x] `W02.P06.S36` - Rebuild the degradation overlays from their binding frames reading availability from the tiers block; `frontend/src/app/degradation/`.
- [x] `W02.P06.S37` - Rebuild the discover overlay from its binding frame over the preserved rag-backed discover query; `frontend/src/app/stage/Discover.tsx`.
- [x] `W02.P06.S38` - Rebuild the settings dialog from its binding frame, schema-driven from the served settings registry; `frontend/src/app/settings/SettingsDialog.tsx`.
- [x] `W02.P06.S39` - Rebuild the schema-driven settings controls from the binding Switch, Slider, and SegmentedToggle Kit primitives; `frontend/src/app/settings/controls/`.
- [x] `W02.P06.S40` - Rebuild the command palette from its binding frame over the preserved command registry; `frontend/src/app/palette/CommandPalette.tsx`.

## Wave `W03` - Headline - custom node-connection canvas

Rewrite frontend/src/scene as a faithful translation of the binding graph frames: the scene foundation and connection-field render with category-colored circles sized by the engine-served salience, the three node states and interactions driven through the preserved SceneController channel, and the consolidated plain-language controls plus connection-drawing fidelity. This is the dominant bespoke rendering effort and is isolated to its own Wave. Depends on W01 (foundation tokens and the frozen SceneController contract). Respects graph-compute-is-cpu-gpu-is-render-and-search and graph-queries-are-bounded-by-default. Authorized by the figma-parity-reconciliation ADR and research.

### Phase `W03.P07` - Scene foundation rewrite

Rewrite the scene foundation: the connection-field render, category circles, and engine-served salience sizing, driven through the preserved SceneController contract and reading scene tokens as literal hex.

- [x] `W03.P07.S41` - Rewrite the Pixi field renderer to the binding connection-field treatment driven through the preserved SceneController; `frontend/src/scene/field/pixiField.ts`.
- [x] `W03.P07.S42` - Rewrite the node sprites as category-colored circles faithful to the binding Node-items frame; `frontend/src/scene/field/nodeSprites.ts`.
- [x] `W03.P07.S43` - Rewire the category color reads to literal-hex scene tokens resolvable by getComputedStyle; `frontend/src/scene/field/categoryColor.ts`.
- [x] `W03.P07.S44` - Rewrite the circle salience sizing to the engine-served degree-of-interest salience; `frontend/src/scene/field/salienceEncoding.test.ts`.
- [x] `W03.P07.S45` - Rewrite the flat-grey edge mesh render faithful to the binding Hero frame connection treatment; `frontend/src/scene/field/edgeMeshes.ts`.
- [x] `W03.P07.S46` - Rebuild the scene token reads to the regenerated literal-hex foundation tokens; `frontend/src/scene/field/tokenReads.ts`.

### Phase `W03.P08` - Node states and interactions

Rebuild the three node states (default, selected, filtered-out), the hover-card from the binding graph HoverCard frame, and selection and hover routed through the SceneController event channel.

- [x] `W03.P08.S47` - Rebuild the default node state render faithful to the binding Node-items frame; `frontend/src/scene/field/nodeSprites.ts`.
- [x] `W03.P08.S48` - Rebuild the selected node state with the single-accent selection ring per the binding frame; `frontend/src/scene/field/egoHighlight.ts`.
- [x] `W03.P08.S49` - Rebuild the filtered-out node state treatment per the binding frame; `frontend/src/scene/field/visibility.ts`.
- [ ] `W03.P08.S50` - Rebuild the hover-card from the binding graph HoverCard frame 84:2 over the enriched node-evidence query; `frontend/src/app/right/menus/`.
- [ ] `W03.P08.S51` - Route node selection and hover intent back through the preserved SceneController event channel; `frontend/src/scene/sceneController.ts`.

### Phase `W03.P09` - Controls and connection-drawing fidelity

Rebuild the consolidated plain-language controls (Navigate, Layout, Zoom, Tune) from the binding graph Controls frame and the connection-drawing fidelity faithful to the binding graph Hero and Node-items frames.

- [x] `W03.P09.S52` - Rebuild the graph controls shell from the binding graph Controls frame 88:2 with the Navigate, Layout, Zoom, and Tune groups; `frontend/src/app/stage/GraphControls.tsx`.
- [x] `W03.P09.S53` - Rebuild the Layout control to the binding Network, Tree, Grouped, and Timeline modes over the preserved layout-mode catalog; `frontend/src/app/stage/LensSelector.tsx`.
- [ ] `W03.P09.S54` - Rebuild the Tune knobs (Spacing, Connection-reach, Clustering) mapped onto the preserved d3-force driver; `frontend/src/scene/field/forceLayout.ts`.
- [ ] `W03.P09.S55` - Rebuild the Zoom and Navigate canvas controls per the binding Controls frame over the preserved camera state; `frontend/src/app/stage/CanvasControls.render.test.tsx`.
- [ ] `W03.P09.S56` - Tune the connection-drawing fidelity to the binding Hero frame, keeping document granularity bounded by the node ceiling; `frontend/src/scene/field/backbone.ts`.

## Wave `W04` - Reconcile and review

Close the governance and verification loop: supersede or amend the affected ADRs and rules (activity-rail tab IA, node-visual-richness canvas marks, tier-edge encoding, and the themes-are-oklch source-of-truth direction) through the codify path and vault adr supersede, then run the full lint gate, perform the human-gated Code Connect publish, and verify end-to-end parity against the binding frames. Depends on W02 and W03 being complete so the rewrite is reviewable against the designs. Authorized by the figma-parity-reconciliation ADR and research.

### Phase `W04.P10` - Supersede and amend affected ADRs and rules

Supersede or amend the activity-rail tab IA ADR, the node-visual-richness canvas-mark rule, the tier-edge color encoding, and the themes-are-oklch source-of-truth direction through the codify path and vault adr supersede, and codify the two new binding rules.

- [ ] `W04.P10.S57` - Supersede the dashboard-activity-rail ADR to the binding Inspect Work Search Changes tab IA via vault adr supersede; `.vault/adr/`.
- [ ] `W04.P10.S58` - Amend the node-visual-richness canvas-mark rule to the binding category-circle treatment, retaining the underlying data; `.vaultspec/rules/rules/`.
- [ ] `W04.P10.S59` - Amend the tier-edge color-encoding rule to the binding flat-grey edge treatment on the canvas; `.vaultspec/rules/rules/`.
- [ ] `W04.P10.S60` - Flip the themes-are-oklch-generated-from-a-token-tier rule source-of-truth direction to Figma-binding; `.vaultspec/rules/rules/themes-are-oklch-generated-from-a-token-tier.md`.
- [ ] `W04.P10.S61` - Update the token sync doc to record Figma as the binding source authoring the non-color families; `frontend/tokens/FIGMA-SYNC.md`.
- [ ] `W04.P10.S62` - Codify the figma-is-the-binding-source-of-truth rule from the ADR candidate; `.vaultspec/rules/rules/figma-is-the-binding-source-of-truth.md`.
- [ ] `W04.P10.S63` - Codify the view-rewrite-preserves-the-state-and-scene-contract rule from the ADR candidate; `.vaultspec/rules/rules/view-rewrite-preserves-the-state-and-scene-contract.md`.

### Phase `W04.P11` - Full-gate review and parity verification

Run the full lint gate, perform the human-gated Code Connect publish, and verify end-to-end design parity of the rewritten chrome and canvas against the binding Figma frames.

- [ ] `W04.P11.S64` - Run the full frontend lint gate to exit 0 including prettier format check and tsc; `frontend/`.
- [ ] `W04.P11.S65` - Run the full engine lint gate to exit 0 including cargo fmt check and clippy for the new diff route and evidence projection; `engine/`.
- [ ] `W04.P11.S66` - Perform the human-gated Code Connect publish against the validated Kit-primitive map; `frontend/figma/connect/`.
- [ ] `W04.P11.S67` - Verify end-to-end chrome parity of the rewritten app surfaces against the binding Figma frames; `frontend/src/app/`.
- [ ] `W04.P11.S68` - Verify end-to-end canvas parity of the rewritten scene against the binding graph Hero, Node-items, HoverCard, and Controls frames; `frontend/src/scene/`.

## Description

Reconcile the dashboard to the binding Figma design file by rewriting the view layer
against a stable, preserved backend, per the accepted ADR and the parity research. Figma
is the single binding source of truth across every token family and surface. The work is
foundation-first: W01 closes the non-color token pipeline and adopts the Figma
foundation, freezes and enriches the preserved stores plus `SceneController` contract as
the rewrite API, adds a bounded read-only historical text-diff engine route, and
finalizes the Code Connect linkage. W02 rewrites `frontend/src/app/` chrome
surface-group by surface-group as dumb projections over the preserved hooks. W03 rewrites
`frontend/src/scene/` as the headline custom node-connection canvas. W04 reconciles the
superseded ADRs and rules and runs the full-gate review with end-to-end parity
verification.

Two layers are explicitly preserved untouched and consumed unchanged: the entire Rust
engine and `frontend/src/stores/` (the TanStack cache, the SSE delta clock, the per-scope
view stores, the wire client, and the `SceneController` contract). The rewrite adds no
fetch and mints no model, honoring the one-way layer-ownership boundaries. Category colors
already landed this cycle and are not redone. All engine work stays read-and-infer with no
vault writes and no ref mutation.

## Parallelization

Waves carry hard ordering. W01 (foundation) must land complete before any rewrite Wave
begins, because both W02 and W03 consume the regenerated foundation tokens, the frozen
stores plus `SceneController` contract, and the enriched wire shapes. W04 (reconcile and
review) must run last, after both rewrite Waves are complete and reviewable against the
binding frames.

W02 and W03 are mutually independent once W01 is stable: chrome (`frontend/src/app/`) and
the canvas (`frontend/src/scene/`) touch disjoint surfaces over the same fixed API, so
they may run in parallel by separate agents.

Within W01, P01 (tokens), P02 (backend contract), and P03 (Code Connect) are largely
independent and may run in parallel, with one ordering note: the scene-token migration in
W03.P07 depends on P01's regenerated literal-hex foundation, and the W01.P02 mock-mirror
and conformance Steps (S16 to S18) depend on the engine-shape Steps (S13 to S15) landing
first.

Within W02, the three surface-group Phases (P04, P05, P06) are independent dumb
projections and may run in parallel. Within W03, the Phases are sequenced: P07 (scene
foundation) before P08 (node states and interactions) before P09 (controls and
connection fidelity). Within W04, P10 (supersession and codify) runs before P11, and the
human-gated Code Connect publish Step (S66) is the operator's one-command action.

## Verification

The plan is complete when every Step is closed (`- [x]`) and the following criteria hold:

- The non-color token pipeline generates type, spacing, radius, and elevation into the
  marked stylesheet regions and mirrors them to Figma; no foundation family remains
  hand-authored outside the generator.
- The type, radius, and elevation migrations leave zero usages on the retired scales, and
  the `text-title` versus `text-heading` collision is resolved with no mis-bound usage.
- The enriched node-evidence projection and the bounded historical text-diff route each
  carry the tiers block on success and error envelopes through the shared helper, and the
  mock engine serves both shapes byte-for-byte with passing conformance tests.
- The preserved `frontend/src/stores/` shapes and the `SceneController` command surface
  are unchanged except through reviewed contract events; the rewrite adds no fetch and
  mints no model.
- Every rewritten chrome surface and the rewritten canvas consume only foundation tokens
  and the sanctioned mark families, read degradation from the tiers block, and render as
  dumb projections over the preserved hooks.
- The Code Connect map parses with zero errors against the Kit primitives, and the
  human-gated publish completes.
- The affected ADRs and rules are superseded or amended (activity-rail tab IA,
  node-visual-richness canvas marks, tier-edge encoding, and the themes-are-oklch
  direction), and the two new binding rules are codified.
- `just dev lint all` exits 0 (eslint, prettier, tsc, cargo fmt, clippy), and end-to-end
  parity of the chrome and canvas against the binding Figma frames is verified.
- `vaultspec-core vault check all` is clean and `vaultspec-core vault plan check` passes
  for this plan.
