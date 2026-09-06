---
tags:
  - '#plan'
  - '#design-system-consolidation'
date: '2026-09-05'
tier: L3
related:
  - '[[2026-09-05-design-system-consolidation-adr]]'
  - '[[2026-09-05-design-system-consolidation-horizontal-polish-research]]'
  - '[[2026-09-05-design-system-consolidation-shipped-frontend-blueprint-reference]]'
modified: '2026-09-06'
body_schema: body-v2
body_hash: 'sha256:db913a5774c4df3d13eb34b792d0d604cc9085aa96cb1bc36fd6ab0cb8f3e0be'
---

<!-- RETIRED: W03, W04, W06, P05, P06, P07, P08, P09, P12, P13, P14, P16, P18, P19, S02, S03, S16, S17, S18, S19, S30, S31, S32, S33, S34, S35, S36, S37, S38, S39, S40, S41, S42, S43, S44, S45, S46, S47, S48, S49, S50, S51, S52, S53, S54, S55, S56, S57, S58, S59, S60, S61, S62, S63, S64, S65, S66, S67, S68, S69, S70, S71, S72, S92, S93, S94, S95, S96, S97, S98, S99, S100, S101, S102, S103, S104, S105, S106, S107, S108, S109, S110, S111, S112, S113, S114, S115, S116, S117, S127, S128, S129, S130, S131, S132, S133, S134, S135, S136, S137, S139, S140, S141, S142, S143, S144, S145, S146, S147, S148, S149, S150, S151, S152, S153, S154, S155, S156, S157, S158, S161, S181, S182, S183, S184, S185, S186, S187, S188, S189, S190, S191 -->

# `design-system-consolidation` plan

Consolidate shipped frontend values, primitives, chrome, and presentation ownership without changing behavior, scene contracts, or the accepted visual language.

## Description

Execute the accepted behavior-preserving consolidation defined by `2026-09-05-design-system-consolidation-adr`, grounded by `2026-09-05-design-system-consolidation-horizontal-polish-research` and `2026-09-05-design-system-consolidation-shipped-frontend-blueprint-reference`.

W01 establishes the classified baseline, parity-debt ledger, frozen scene baseline, and enforcement guards. W02 finishes the base contracts required by the critical migration, publishes the kit boundary, and removes settings-owned primitive and CSS-recipe duplication. W05 normalizes all production kit imports and removes the store-to-kit presentation leak. W07 separates platform error containment from app-owned product presentation. W08 corrects the authored-review command's false viewport claim. W09 reconciles the critical boundary and deferred debt, records bounded runtime evidence, proves scene non-interference, and performs the final audit.

The retired rows remain preserved by immutable identifier as follow-on debt. They cover ordinary field and textarea adoption outside settings, `OptionRow`, new `IconButton` variants, broad menu and icon-action migrations, motion and dimension token promotion, modal-infrastructure consolidation, exhaustive authored-specimen completion, and permanent theme-by-viewport automation. This plan makes no claim that those categories were implemented or eliminated.

Stores, wire and model contracts, selectors, filtering behavior, responsive-class selection, feature semantics, `SceneController`, scene paint, and graph semantics remain frozen. Existing public CSS token names and literal per-theme hex scene tokens remain compatible. Figma capture, inspection, parity, and acceptance evidence are excluded. Code-only component names and values remain explicitly ledgered parity debt.

The worktree's unrelated graph, scene, provisioning, engine, package, and vault changes are preserved. No Step authorizes changes under `frontend/src/scene/`; scene and graph rendering may only be observed during verification. Any overlap with an already-dirty file must merge narrowly without reverting or rewriting unrelated edits.

## Steps

## Wave `W01` - establish the classified consolidation baseline

Create the evidence and enforcement substrate required by every later Wave. All later Waves depend on its complete inventory, ownership classifications, parity-debt entries, and ratcheting guards.

### Phase `W01.P01` - record ownership and debt

Establish one machine-readable ledger that distinguishes migrations, retained semantic seams, exact local geometry, and unresolved design-name debt.

- [x] `W01.P01.S01` - Define the bounded ledger schema, stable source identities, allowed dispositions, canonical-owner fields, and rationale requirements; `frontend/dev/design-system/consolidation-ledger.ts`.
- [x] `W01.P01.S164` - Classify kit-owned native controls and direct settings-wrapper migration candidates; `frontend/dev/design-system/consolidation-ledger.ts`.
- [x] `W01.P01.S165` - Classify ordinary text-field and textarea migration families across settings, dialogs, clarification, properties, review, and comments; `frontend/dev/design-system/consolidation-ledger.ts`.
- [x] `W01.P01.S166` - Classify menu, option-row, context-menu, filter, date-basis, command, and search-result control families; `frontend/dev/design-system/consolidation-ledger.ts`.
- [x] `W01.P01.S167` - Classify dialog, composer, compact-shell, settings, and viewer icon-action families; `frontend/dev/design-system/consolidation-ledger.ts`.
- [x] `W01.P01.S168` - Classify specialized search, composer-entry, code-overlay, date-input, select, and task-checkbox native seams; `frontend/dev/design-system/consolidation-ledger.ts`.
- [x] `W01.P01.S169` - Classify graph, island, timeline-handle, tree-row, and renderer-coordination native seams; `frontend/dev/design-system/consolidation-ledger.ts`.
- [x] `W01.P01.S170` - Classify remaining left-rail, right-rail, panel, authoring, shell, and platform native controls; `frontend/dev/design-system/consolidation-ledger.ts`.
- [x] `W01.P01.S171` - Verify the native-control family ledger accounts for the complete 125-site executable JSX baseline without duplicates; `frontend/dev/design-system/consolidation-ledger.test.ts`.
- [x] `W01.P01.S172` - Classify arbitrary relative values owned by kit primitives and their states; `frontend/dev/design-system/consolidation-ledger.ts`.
- [x] `W01.P01.S173` - Classify arbitrary relative values owned by shared chrome, dialogs, sheets, and shell composition; `frontend/dev/design-system/consolidation-ledger.ts`.
- [x] `W01.P01.S174` - Classify arbitrary relative values owned by viewer, reader, code, and authoring surfaces; `frontend/dev/design-system/consolidation-ledger.ts`.
- [x] `W01.P01.S175` - Classify arbitrary relative values owned by palette, search, and agent surfaces; `frontend/dev/design-system/consolidation-ledger.ts`.
- [x] `W01.P01.S176` - Classify arbitrary relative values owned by stage overlays, graph DOM chrome, filters, and timeline composition without touching scene source; `frontend/dev/design-system/consolidation-ledger.ts`.
- [x] `W01.P01.S177` - Classify arbitrary relative values owned by left rail, right rail, settings, panels, and remaining surfaces; `frontend/dev/design-system/consolidation-ledger.ts`.
- [x] `W01.P01.S178` - Verify the relative-value family ledger accounts for the complete 106-site baseline without duplicates; `frontend/dev/design-system/consolidation-ledger.test.ts`.
- [x] `W01.P01.S179` - Capture immutable pre-execution hashes and preimages for all existing dirty and clean scene sources plus the SceneController contract; `frontend/dev/design-system/scene-freeze-baseline.json`.
- [x] `W01.P01.S04` - Record temporary code-only component names, unresolved design aliases, and campaign-scoped parity debt; `frontend/dev/design-system/consolidation-ledger.ts`.
- [x] `W01.P01.S05` - Encode the frozen scene, graph, store-policy, wire, responsive-mode, and no-Figma scope boundaries as ledger invariants; `frontend/dev/design-system/consolidation-ledger.ts`.

### Phase `W01.P02` - enforce the baseline

Add a ratcheting scanner and tests that reject unclassified sites, stale ledger entries, forbidden ownership, deep kit imports, and unauthorized migration facades.

- [x] `W01.P02.S06` - Implement the bounded native-control, arbitrary-value, kit-import, layer-direction, facade, and ledger-consistency scanner; `frontend/dev/tooling/scan-design-system.mjs`.
- [x] `W01.P02.S07` - Add valid and invalid scanner fixtures for classified seams, missing entries, stale entries, deep imports, store-to-kit imports, and compatibility facades; `frontend/dev/tooling/fixtures/design-system/`.
- [x] `W01.P02.S08` - Add focused scanner tests covering all ledger and ownership failure modes; `frontend/dev/tooling/scan-design-system.test.ts`.
- [x] `W01.P02.S09` - Register the design-system scanner as a frontend lint script while preserving unrelated package edits; `frontend/package.json`.
- [x] `W01.P02.S10` - Include the scanner in the complete frontend lint recipe; `dev/toolchain.py`.
- [x] `W01.P02.S11` - Guard the lint recipe and production-to-development import fence against accidental removal of the new check; `dev/guards/test_design_system_consolidation.py`.

## Wave `W02` - establish critical kit owners and migrate settings

Finish the base contracts required by the critical migration, publish them through the kit boundary, and replace settings-owned visual and keyboard duplication while preserving schema decoding and wire-value policy.

### Phase `W02.P03` - complete the critical kit contracts

Pin only the shipped and already-created primitives required for settings and error presentation, ledger their names, and expose them through the public barrel.

- [x] `W02.P03.S12` - Implement the ordinary TextField contract with accessible labeling, focus, disabled, size, and theme behavior; `frontend/src/app/kit/TextField.tsx`.
- [x] `W02.P03.S13` - Verify TextField semantics, labeling, state treatment, ref forwarding, and value propagation; `frontend/src/app/kit/TextField.render.test.tsx`.
- [x] `W02.P03.S14` - Implement the ordinary TextArea contract without absorbing editor or composer semantics; `frontend/src/app/kit/TextArea.tsx`.
- [x] `W02.P03.S15` - Verify TextArea semantics, labeling, resize policy, focus, disabled, and value propagation; `frontend/src/app/kit/TextArea.render.test.tsx`.
- [x] `W02.P03.S20` - Pin ActivityIndicator appearance and accessibility behavior before exposing it through the public boundary; `frontend/src/app/kit/ActivityIndicator.render.test.tsx`.
- [x] `W02.P03.S180` - Ledger every new code-only primitive export, design alias, and naming-contract exception before public exposure; `frontend/dev/design-system/consolidation-ledger.ts`.
- [ ] `W02.P03.S21` - Export all canonical primitives and types, including ActivityIndicator, through the production kit boundary; `frontend/src/app/kit/index.ts`.

### Phase `W02.P04` - replace settings control duplication

Compose the kit directly from settings React controls and remove visual recipes from stores in the same Phase.

- [ ] `W02.P04.S22` - Replace the native settings switch wrapper with the canonical Switch while preserving boolean wire conversion; `frontend/src/app/settings/controls/SwitchControl.tsx`.
- [ ] `W02.P04.S23` - Replace the native settings range wrapper with the canonical Slider while preserving bounds, stepping, readout, and integer serialization; `frontend/src/app/settings/controls/NumberControl.tsx`.
- [ ] `W02.P04.S24` - Replace the hand-built enum radiogroup with SegmentedToggle and Segment while preserving selection-follows-focus behavior; `frontend/src/app/settings/controls/EnumControl.tsx`.
- [ ] `W02.P04.S25` - Replace the settings text input recipe with TextField while preserving maximum length and wire values; `frontend/src/app/settings/controls/TextControl.tsx`.
- [ ] `W02.P04.S26` - Remove settings class strings and visual tone output while retaining schema decoding, value policy, and serialization; `frontend/src/stores/view/settingsControls.ts`.
- [ ] `W02.P04.S27` - Adapt schema-driven control composition to the canonical primitive props without adding per-setting styling; `frontend/src/app/settings/controls/registry.tsx`.
- [ ] `W02.P04.S28` - Update settings control render and interaction coverage for direct kit composition; `frontend/src/app/settings/controls/controls.render.test.tsx`.
- [ ] `W02.P04.S29` - Update store tests to prove settings derivation exposes policy and data without CSS recipes; `frontend/src/stores/view/settingsControls.test.ts`.

## Wave `W05` - normalize kit imports and restore layer direction

Make the kit barrel the sole production import boundary and move visual tone mapping out of stores without changing filter meaning or behavior.

### Phase `W05.P10` - remove deep kit imports

Convert each known production deep import independently so the public barrel becomes the sole production kit boundary.

- [ ] `W05.P10.S73` - Import StateBlock through the kit barrel; `frontend/src/app/agent/AgentBeginView.tsx`.
- [ ] `W05.P10.S74` - Import ActivityIndicator through the kit barrel; `frontend/src/app/chrome/DataActivityIndicator.tsx`.
- [ ] `W05.P10.S75` - Import category contracts through the kit barrel; `frontend/src/app/viewer/AutocompleteCombobox.tsx`.
- [ ] `W05.P10.S76` - Import IconButton through the kit barrel; `frontend/src/app/chrome/RowMenuDisclosure.tsx`.
- [ ] `W05.P10.S77` - Import the calendar glyph through the kit barrel; `frontend/src/app/timeline/DateBasisSelect.tsx`.
- [ ] `W05.P10.S78` - Import compact top-bar glyphs through the kit barrel; `frontend/src/app/shell/MobileTopBar.tsx`.
- [ ] `W05.P10.S79` - Import rail glyphs through the kit barrel; `frontend/src/app/shell/IconRail.tsx`.
- [ ] `W05.P10.S80` - Import compact-shell glyphs through the kit barrel; `frontend/src/app/shell/CompactAppShell.tsx`.
- [ ] `W05.P10.S81` - Import bottom-tab glyphs through the kit barrel; `frontend/src/app/shell/BottomTabBar.tsx`.
- [ ] `W05.P10.S82` - Import FoldSection through the kit barrel; `frontend/src/app/settings/AdvancedSection.tsx`.
- [ ] `W05.P10.S83` - Import dock-workspace glyphs through the kit barrel; `frontend/src/app/stage/DockWorkspace.tsx`.
- [ ] `W05.P10.S84` - Import FacetRow and its visual type through the kit barrel; `frontend/src/app/stage/FilterMenu.tsx`.

### Phase `W05.P11` - remove the store-to-kit presentation leak

Keep stores limited to semantic state and perform visual tone mapping at the app boundary.

- [ ] `W05.P11.S85` - Remove FacetDotTone and all app-kit dependencies from filter presentation output; `frontend/src/stores/view/filterPresentation.ts`.
- [ ] `W05.P11.S86` - Preserve semantic filter option state without exporting kit presentation contracts; `frontend/src/stores/view/filterSidebar.ts`.
- [ ] `W05.P11.S87` - Map semantic filter state to FacetDotTone at app composition; `frontend/src/app/stage/FilterMenu.tsx`.
- [ ] `W05.P11.S88` - Add store-level tests proving filter presentation remains semantic and kit-independent; `frontend/src/stores/view/filterPresentation.test.ts`.
- [ ] `W05.P11.S89` - Update filter-sidebar derivation tests without changing selection or filtering policy; `frontend/src/stores/view/filterSidebar.test.ts`.
- [ ] `W05.P11.S90` - Verify app-level tone mapping and unchanged filter interaction behavior; `frontend/src/app/stage/FilterMenu.render.test.tsx`.
- [ ] `W05.P11.S91` - Extend ownership guards to reject all future production deep imports and lower-layer app-kit dependencies; `frontend/src/app/designSystemOwnership.guard.test.ts`.

## Wave `W07` - separate platform containment from app error presentation

Keep catching, logging, reset, and retry coordination in platform while moving localized product fallback presentation into app composition.

### Phase `W07.P15` - inject app-owned error presentation

Remove the styled platform fallback and route every production boundary through the app-owned wrapper.

- [ ] `W07.P15.S118` - Reduce ErrorBoundary to generic containment, diagnostics, reset, and injected rendering without importing localization or kit presentation; `frontend/src/platform/errors/ErrorBoundary.tsx`.
- [ ] `W07.P15.S119` - Verify containment, logging, reset, callback, and injected-render behavior independently of app presentation; `frontend/src/platform/errors/ErrorBoundary.test.tsx`.
- [ ] `W07.P15.S120` - Implement the localized app boundary wrapper with kit-composed app and region fallbacks; `frontend/src/app/chrome/AppErrorBoundary.tsx`.
- [ ] `W07.P15.S121` - Verify app and region fallback copy, alert semantics, retry, reload, theme classes, and hidden diagnostics; `frontend/src/app/chrome/AppErrorBoundary.render.test.tsx`.
- [ ] `W07.P15.S122` - Replace the root production boundary with AppErrorBoundary; `frontend/src/main.tsx`.
- [ ] `W07.P15.S123` - Replace shell-region boundaries with AppErrorBoundary without changing region composition; `frontend/src/app/AppShell.tsx`.
- [ ] `W07.P15.S124` - Replace the timeline boundary with AppErrorBoundary without modifying scene or timeline behavior; `frontend/src/app/stage/GraphPanel.tsx`.
- [ ] `W07.P15.S125` - Verify root and shell-region fallback composition and sibling-region survival; `frontend/src/app/AppShell.render.test.tsx`.
- [ ] `W07.P15.S126` - Verify the timeline wrapper preserves panel and retry behavior without exercising scene implementation; `frontend/src/app/stage/GraphPanel.render.test.tsx`.

## Wave `W08` - correct the authored-review claim

Make the review command describe authored appearance truthfully and assign viewport evidence to the bounded runtime receipt.

### Phase `W08.P17` - correct authored-review documentation

Correct the false viewport claim without expanding the authored desk into a runtime or viewport harness.

- [ ] `W08.P17.S138` - Correct the review command description so viewport coverage is assigned to runtime evidence rather than the authored desk; `Justfile`.

## Wave `W09` - reconcile the critical boundary and close the campaign

Reconcile completed ownership work and deferred debt, prove bounded runtime behavior and scene non-interference, and issue the final evidence-backed audit.

### Phase `W09.P20` - finalize the critical boundary and evidence

Reconcile completed ownership and deferred debt, record the bounded runtime pass, prove scene non-interference, and close with an independent audit.

- [ ] `W09.P20.S159` - Reconcile every native-control, arbitrary-value, canonical-owner, retained-seam, and naming-debt entry against the final source; `frontend/dev/design-system/consolidation-ledger.ts`.
- [ ] `W09.P20.S160` - Tighten the ratchet to reject removed implementations, stale aliases, migration comments, forwarding wrappers, and surface-specific theme forks; `frontend/dev/tooling/scan-design-system.mjs`.
- [ ] `W09.P20.S162` - Create a durable runtime-results receipt recording commands, themes, exact widths, responsive classes, and bounded evidence-pass outcomes; `.vault/reference/`.
- [ ] `W09.P20.S192` - Compare final scene sources and the SceneController contract byte-for-byte with the pre-execution campaign baseline; `frontend/dev/design-system/scene-freeze-baseline.json`.
- [ ] `W09.P20.S163` - Produce the final evidence-backed ownership, behavior, accessibility, theme, viewport, debt, and boundary audit citing runtime and authored-review evidence separately; `.vault/audit/`.

## Parallelization

- Waves land sequentially. W01 is the completed hard prerequisite. W02 finishes the kit and settings foundation before W05 enforces its public import and layer boundaries. W07 consumes the public kit boundary. W08 corrects documentation after the production boundary is stable. W09 is final.
- Within W02, `ActivityIndicator` verification precedes naming-ledger reconciliation and the public barrel. Settings migration begins after the required exports exist; production controls and their focused tests are reviewed in their plan order.
- Within W05, independent deep-import rows may be implemented separately. Filter presentation, filter sidebar, app tone mapping, and ownership guards remain one ordered layer-correction chain.
- Within W07, generic platform containment and its tests precede the app-owned wrapper; production boundary migrations and their behavior tests follow that wrapper.
- W09 is serialized: reconcile the ledger, tighten the ratchet, record bounded runtime evidence, prove byte-for-byte scene non-interference, and finish with the final audit.
- Narrow touched-scope tests may be parallelized only when they do not share a live engine or mutable fixture. No full Vitest run may overlap another full Vitest run or a live-engine test run.
- Existing dirty changes are never reverted. Work that overlaps `frontend/package.json`, app tests, or other dirty files must preserve the pre-existing diff. No implementation work occurs under `frontend/src/scene/`; runtime inspection of scene output is read-only.

## Verification

- Before any Phase is routed to review, run its touched type, unit, render, accessibility, interaction, guard, token, or browser tests, full `just lint frontend`, and then one serialized full `just test frontend`. Required review revisions land and pass re-review before forward work.
- Before any implementation commit or green report, full `just lint frontend` must exit zero. Wave completion also requires all touched tests and the Phase-review test cadence above.
- Never run two full Vitest suites concurrently. Do not overlap `just test frontend` with another full or live-engine Vitest invocation.
- W01 passes the new ledger scanner, scanner fixtures, guard tests, existing token checks, relative-unit checks, domain checks, module checks, and full frontend lint and test gates. Its immutable scene and `SceneController` preimages include the worktree state as execution began, not merely `HEAD`.
- W02 proves the `TextField`, `TextArea`, and shipped `ActivityIndicator` contracts; complete naming-debt entries; public-barrel exposure; direct settings composition; accessible labeling, focus, disabled state, and keyboard behavior; unchanged settings wire strings; and removal of settings-owned visual recipes.
- W05 proves zero production kit-submodule imports and zero store or platform imports from app kit. Store selectors, filter values, wire conversion, and user-visible filtering behavior remain unchanged.
- W07 proves platform `ErrorBoundary` contains, logs, resets, and injects presentation without localization or kit dependencies. Every production boundary uses `AppErrorBoundary` or an explicit app-owned renderer. App and region fallbacks preserve alert semantics, localized copy, retry or reload behavior, sibling-region survival, and existing scene/timeline behavior.
- W08 proves the authored-review command no longer claims viewport or live-wire evidence.
- W09 records one bounded runtime pass in light, dark, and high-contrast at representative regular-wide, regular-intermediate, and compact widths. It covers changed settings controls, keyboard operation, visible focus, app and region error fallbacks, retry and reload actions, and responsive reachability. The durable receipt records commands, exact widths, themes, responsive classes, and outcomes; permanent matrix automation and a confirmation pass are not required.
- Runtime checks may observe graph and scene output, but verification must compare final scene sources and the `SceneController` contract byte-for-byte with the immutable pre-execution campaign baseline, including any dirty changes that existed before execution. A diff against `HEAD` is insufficient.
- Final acceptance runs full `just lint frontend` and then one serialized full `just test frontend`, both at exit zero. It also passes existing token drift, relative-unit, domain, module-boundary, native-control, arbitrary-value, deep-import, layer-direction, and migration-facade guards.
- The final audit confirms direct canonical imports, same-change deletion for executed migrations, no compatibility facades or surface theme forks, truthful completed and deferred ledger dispositions, byte-for-byte scene non-interference, and bounded runtime evidence. It must report no CRITICAL or HIGH finding inside the accepted boundary and must not claim broad consumer adoption, token promotion, modal consolidation, exhaustive visual coverage, or Figma parity.
