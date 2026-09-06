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
body_hash: 'sha256:a8222a8b8a90232c207e05a8b79cd3c40c3832ee594efa7cf93f3e605bdee197'
---

<!-- RETIRED: S02, S03, S95, S96, S158 -->

# `design-system-consolidation` plan

Consolidate shipped frontend values, primitives, chrome, and presentation ownership without changing behavior, scene contracts, or the accepted visual language.

## Description

Execute the accepted behavior-preserving consolidation defined by `2026-09-05-design-system-consolidation-adr`, grounded by `2026-09-05-design-system-consolidation-horizontal-polish-research` and `2026-09-05-design-system-consolidation-shipped-frontend-blueprint-reference`.

W01 establishes the classified baseline, parity-debt ledger, and enforcement guards. W02 establishes missing kit owners and directly migrates settings controls. W03 migrates behaviorally ordinary fields and textareas. W04 migrates explicitly identified option-row and icon-action families. W05 normalizes kit imports and removes the store-to-kit layer leak. W06 promotes only exact-value reusable motion and dimension roles into DTCG and updates their consumers. W07 separates platform error containment from app presentation and consolidates modal chrome. W08 closes authored-review and bounded runtime coverage. W09 performs the final ownership reconciliation and audit.

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
- [ ] `W01.P01.S170` - Classify remaining left-rail, right-rail, panel, authoring, shell, and platform native controls; `frontend/dev/design-system/consolidation-ledger.ts`.
- [ ] `W01.P01.S171` - Verify the native-control family ledger accounts for the complete 125-site executable JSX baseline without duplicates; `frontend/dev/design-system/consolidation-ledger.test.ts`.
- [ ] `W01.P01.S172` - Classify arbitrary relative values owned by kit primitives and their states; `frontend/dev/design-system/consolidation-ledger.ts`.
- [ ] `W01.P01.S173` - Classify arbitrary relative values owned by shared chrome, dialogs, sheets, and shell composition; `frontend/dev/design-system/consolidation-ledger.ts`.
- [ ] `W01.P01.S174` - Classify arbitrary relative values owned by viewer, reader, code, and authoring surfaces; `frontend/dev/design-system/consolidation-ledger.ts`.
- [ ] `W01.P01.S175` - Classify arbitrary relative values owned by palette, search, and agent surfaces; `frontend/dev/design-system/consolidation-ledger.ts`.
- [ ] `W01.P01.S176` - Classify arbitrary relative values owned by stage overlays, graph DOM chrome, filters, and timeline composition without touching scene source; `frontend/dev/design-system/consolidation-ledger.ts`.
- [ ] `W01.P01.S177` - Classify arbitrary relative values owned by left rail, right rail, settings, panels, and remaining surfaces; `frontend/dev/design-system/consolidation-ledger.ts`.
- [ ] `W01.P01.S178` - Verify the relative-value family ledger accounts for the complete 106-site baseline without duplicates; `frontend/dev/design-system/consolidation-ledger.test.ts`.
- [ ] `W01.P01.S179` - Capture immutable pre-execution hashes and preimages for all existing dirty and clean scene sources plus the SceneController contract; `frontend/dev/design-system/scene-freeze-baseline.json`.
- [ ] `W01.P01.S04` - Record temporary code-only component names, unresolved design aliases, and campaign-scoped parity debt; `frontend/dev/design-system/consolidation-ledger.ts`.
- [ ] `W01.P01.S05` - Encode the frozen scene, graph, store-policy, wire, responsive-mode, and no-Figma scope boundaries as ledger invariants; `frontend/dev/design-system/consolidation-ledger.ts`.

### Phase `W01.P02` - enforce the baseline

Add a ratcheting scanner and tests that reject unclassified sites, stale ledger entries, forbidden ownership, deep kit imports, and unauthorized migration facades.

- [ ] `W01.P02.S06` - Implement the bounded native-control, arbitrary-value, kit-import, layer-direction, facade, and ledger-consistency scanner; `frontend/dev/tooling/scan-design-system.mjs`.
- [ ] `W01.P02.S07` - Add valid and invalid scanner fixtures for classified seams, missing entries, stale entries, deep imports, store-to-kit imports, and compatibility facades; `frontend/dev/tooling/fixtures/design-system/`.
- [ ] `W01.P02.S08` - Add focused scanner tests covering all ledger and ownership failure modes; `frontend/dev/tooling/scan-design-system.test.ts`.
- [ ] `W01.P02.S09` - Register the design-system scanner as a frontend lint script while preserving unrelated package edits; `frontend/package.json`.
- [ ] `W01.P02.S10` - Include the scanner in the complete frontend lint recipe; `dev/toolchain.py`.
- [ ] `W01.P02.S11` - Guard the lint recipe and production-to-development import fence against accidental removal of the new check; `dev/guards/test_design_system_consolidation.py`.

## Wave `W02` - establish kit owners and migrate settings

Land the reusable field, textarea, option-row, icon-action, and activity contracts, then replace settings-owned visual and keyboard duplication while preserving schema decoding and wire-string policy.

### Phase `W02.P03` - complete the kit contracts

Create only narrow primitives supported by repeated equivalent behavior and ledger every code-only naming exception.

- [ ] `W02.P03.S12` - Implement the ordinary TextField contract with accessible labeling, focus, disabled, size, and theme behavior; `frontend/src/app/kit/TextField.tsx`.
- [ ] `W02.P03.S13` - Verify TextField semantics, labeling, state treatment, ref forwarding, and value propagation; `frontend/src/app/kit/TextField.render.test.tsx`.
- [ ] `W02.P03.S14` - Implement the ordinary TextArea contract without absorbing editor or composer semantics; `frontend/src/app/kit/TextArea.tsx`.
- [ ] `W02.P03.S15` - Verify TextArea semantics, labeling, resize policy, focus, disabled, and value propagation; `frontend/src/app/kit/TextArea.render.test.tsx`.
- [ ] `W02.P03.S16` - Implement the behaviorally explicit OptionRow contract that forwards semantic and keyboard props while leaving roving navigation, menu cursoring, and focus containment with composing chrome; `frontend/src/app/kit/OptionRow.tsx`.
- [ ] `W02.P03.S17` - Verify OptionRow selection, activation, disabled, leading, trailing, forwarded keyboard props, and non-ownership of roving focus; `frontend/src/app/kit/OptionRow.render.test.tsx`.
- [ ] `W02.P03.S18` - Add exact shipped semantic-size and coarse-pointer variants required by classified icon actions; `frontend/src/app/kit/IconButton.tsx`.
- [ ] `W02.P03.S19` - Verify IconButton accessible-name, pressed-state, size, disabled, focus, and coarse-pointer contracts; `frontend/src/app/kit/IconButton.render.test.tsx`.
- [ ] `W02.P03.S20` - Pin ActivityIndicator appearance and accessibility behavior before exposing it through the public boundary; `frontend/src/app/kit/ActivityIndicator.render.test.tsx`.
- [ ] `W02.P03.S180` - Ledger every new code-only primitive export, design alias, and naming-contract exception before public exposure; `frontend/dev/design-system/consolidation-ledger.ts`.
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
- [ ] `W02.P04.S30` - Update authored settings states to exercise the migrated controls in normal, loading, empty, and degraded contexts where applicable; `frontend/dev/visual-review/specimens/settings.tsx`.

## Wave `W03` - migrate ordinary fields and textareas

Move only the ordinary, behaviorally equivalent field families identified by the ledger. Search shells, code overlays, composer entry, dates, graph controls, timeline handles, tree rows, and task checkboxes remain specialized seams.

### Phase `W03.P05` - migrate ordinary text fields

Adopt TextField in settings-adjacent dialogs, clarification, and property editing without changing validation or submission behavior.

- [ ] `W03.P05.S31` - Replace the ordinary project-path field with TextField while preserving picker and submission behavior; `frontend/src/app/left/AddProjectDialog.tsx`.
- [ ] `W03.P05.S32` - Verify project-dialog labeling, validation, focus, and submission after migration; `frontend/src/app/left/AddProjectDialog.localization.test.tsx`.
- [ ] `W03.P05.S33` - Replace ordinary document metadata fields with TextField while preserving related-document and creation behavior; `frontend/src/app/left/CreateDocDialog.tsx`.
- [ ] `W03.P05.S34` - Verify the regular CreateDocDialog field behavior and structure; `frontend/src/app/left/CreateDocDialog.render.test.tsx`.
- [ ] `W03.P05.S35` - Verify compact CreateDocDialog field sizing, focus visibility, and action reachability; `frontend/src/app/left/CreateDocDialog.compact.render.test.tsx`.
- [ ] `W03.P05.S36` - Verify migrated CreateDocDialog labels and validation copy through the real localization runtime; `frontend/src/app/left/CreateDocDialog.localization.test.tsx`.
- [ ] `W03.P05.S37` - Replace ordinary clarification inputs with TextField while retaining answer selection and submission semantics; `frontend/src/app/agent/ClarificationCard.tsx`.
- [ ] `W03.P05.S38` - Verify clarification field labels, keyboard interaction, validation, and emitted answers; `frontend/src/app/agent/ClarificationCard.render.test.tsx`.
- [ ] `W03.P05.S39` - Replace ordinary property-edit inputs with TextField while retaining metadata normalization and save behavior; `frontend/src/app/viewer/PropertiesPopover.tsx`.
- [ ] `W03.P05.S40` - Verify property editing, cancellation, validation, and focus behavior after migration; `frontend/src/app/viewer/PropertiesPopover.render.test.tsx`.

### Phase `W03.P06` - migrate ordinary textareas

Adopt TextArea in review and comment authoring without absorbing code-editor or composer contracts.

- [ ] `W03.P06.S41` - Replace the ordinary review-authoring textarea with TextArea while preserving proposal workflow behavior; `frontend/src/app/authoring/ReviewStation.tsx`.
- [ ] `W03.P06.S42` - Verify review-authoring input, keyboard, disabled, localization, and submission behavior; `frontend/src/app/authoring/ReviewStation.render.test.tsx`.
- [ ] `W03.P06.S43` - Replace ordinary comment-authoring textareas with TextArea while preserving draft, reply, edit, and submit behavior; `frontend/src/app/viewer/CommentThreadPanel.tsx`.
- [ ] `W03.P06.S44` - Verify comment draft, reply, edit, keyboard, focus, and localized-state behavior; `frontend/src/app/viewer/CommentThreadPanel.localization.render.test.tsx`.

### Phase `W03.P07` - refresh authored field coverage

Update the affected authored specimens without creating production-only harness affordances or claiming live-wire reachability.

- [ ] `W03.P07.S45` - Exercise clarification field states with authored inputs; `frontend/dev/visual-review/specimens/agent.tsx`.
- [ ] `W03.P07.S46` - Exercise review-authoring field states with authored inputs; `frontend/dev/visual-review/specimens/authoring.tsx`.
- [ ] `W03.P07.S47` - Exercise properties and comment-authoring states with authored inputs; `frontend/dev/visual-review/specimens/viewer.tsx`.
- [ ] `W03.P07.S48` - Exercise project and document dialog field states with authored inputs; `frontend/dev/visual-review/specimens/left.tsx`.

## Wave `W04` - migrate option rows and icon actions

Replace the explicitly identified menu-row and unlabeled icon-action families with canonical owners while retaining each surface's selection, dispatch, dismissal, and feature semantics.

### Phase `W04.P08` - migrate menu and option rows

Use OptionRow only for behaviorally matching options; retain specialized palette, date, filter, and context-menu composition around it.

- [ ] `W04.P08.S49` - Replace model choices with OptionRow while preserving model selection and provider configuration behavior; `frontend/src/app/agent/ComposerModelPicker.tsx`.
- [ ] `W04.P08.S50` - Verify model option selection, disabled states, keyboard behavior, and configuration disclosure; `frontend/src/app/agent/ComposerModelPicker.render.test.tsx`.
- [ ] `W04.P08.S51` - Replace ordinary context-menu commands with OptionRow while preserving resolver dispatch, destructive state, and submenu behavior; `frontend/src/app/menu/ContextMenuHost.tsx`.
- [ ] `W04.P08.S52` - Verify context-menu activation, navigation, dismissal, and submenu interactions; `frontend/src/app/menu/ContextMenuHost.interactive.test.tsx`.
- [ ] `W04.P08.S53` - Verify context-menu row appearance and accessible roles after migration; `frontend/src/app/menu/ContextMenuHost.render.test.tsx`.
- [ ] `W04.P08.S54` - Replace date-basis options with OptionRow while preserving canonical date-range intent; `frontend/src/app/timeline/DateBasisSelect.tsx`.
- [ ] `W04.P08.S55` - Add focused date-basis option-row render and keyboard coverage; `frontend/src/app/timeline/DateBasisSelect.render.test.tsx`.
- [ ] `W04.P08.S56` - Replace ordinary filter options with OptionRow or FacetRow according to their retained checkbox and radio semantics; `frontend/src/app/stage/FilterMenu.tsx`.
- [ ] `W04.P08.S57` - Verify filter option roles, checked state, counts, date seams, keyboard behavior, and emitted intent; `frontend/src/app/stage/FilterMenu.render.test.tsx`.
- [ ] `W04.P08.S58` - Replace ordinary command choices with OptionRow while preserving command scoring and dispatch; `frontend/src/app/palette/CommandPalette.tsx`.
- [ ] `W04.P08.S59` - Verify command selection, keyboard navigation, disabled commands, and dismissal after migration; `frontend/src/app/palette/CommandPalette.render.test.tsx`.
- [ ] `W04.P08.S60` - Replace behaviorally ordinary search-result options while retaining the specialized search input and split-pane composition; `frontend/src/app/palette/SearchPaletteSurface.tsx`.
- [ ] `W04.P08.S61` - Update authored palette states for canonical option-row appearance; `frontend/dev/visual-review/specimens/palette.tsx`.

### Phase `W04.P09` - migrate icon actions

Replace classified close, remove, clear, and navigation glyph buttons with IconButton while preserving accessible names and action semantics.

- [ ] `W04.P09.S62` - Replace dialog close chrome with IconButton without changing dismissibility; `frontend/src/app/chrome/Dialog.tsx`.
- [ ] `W04.P09.S63` - Verify dialog close labeling, disabled dismissal, focus containment, and backdrop behavior; `frontend/src/app/chrome/Dialog.render.test.tsx`.
- [ ] `W04.P09.S64` - Replace classified composer icon actions with IconButton while retaining composer-specific textarea and submission behavior; `frontend/src/app/agent/Composer.tsx`.
- [ ] `W04.P09.S65` - Verify composer icon-action names, disabled states, focus behavior, and dispatched intent; `frontend/src/app/agent/Composer.render.test.tsx`.
- [ ] `W04.P09.S66` - Replace classified compact-shell icon actions with IconButton while preserving navigation and panel state; `frontend/src/app/shell/MobileTopBar.tsx`.
- [ ] `W04.P09.S67` - Verify compact top-bar action labeling, target sizing, and navigation behavior; `frontend/src/app/shell/MobileTopBar.render.test.tsx`.
- [ ] `W04.P09.S68` - Replace the related-document remove action with IconButton while preserving selection state; `frontend/src/app/viewer/RelatedDocPicker.tsx`.
- [ ] `W04.P09.S69` - Verify related-document removal, labeling, disabled behavior, and focus order; `frontend/src/app/viewer/RelatedDocPicker.render.test.tsx`.
- [ ] `W04.P09.S70` - Replace classified settings-dialog icon actions with IconButton while preserving dialog state and save behavior; `frontend/src/app/settings/SettingsDialog.tsx`.
- [ ] `W04.P09.S71` - Verify settings-dialog dismissal, action reachability, and focus order; `frontend/src/app/settings/SettingsDialog.render.test.tsx`.
- [ ] `W04.P09.S72` - Refresh authored compact-shell states for canonical icon actions and coarse-pointer sizing; `frontend/dev/visual-review/specimens/shell.tsx`.

## Wave `W05` - normalize imports and restore layer direction

Move every production kit consumer to the barrel and correct the filter-tone leak by keeping semantic filter state below the app boundary and mapping it to visual tones in app composition.

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

Keep stores limited to semantic status and health meaning, and perform visual tone mapping at the app boundary.

- [ ] `W05.P11.S85` - Remove FacetDotTone and all app-kit dependencies from filter presentation output; `frontend/src/stores/view/filterPresentation.ts`.
- [ ] `W05.P11.S86` - Preserve semantic filter option state without exporting kit presentation contracts; `frontend/src/stores/view/filterSidebar.ts`.
- [ ] `W05.P11.S87` - Map semantic filter state to FacetDotTone at app composition; `frontend/src/app/stage/FilterMenu.tsx`.
- [ ] `W05.P11.S88` - Add store-level tests proving filter presentation remains semantic and kit-independent; `frontend/src/stores/view/filterPresentation.test.ts`.
- [ ] `W05.P11.S89` - Update filter-sidebar derivation tests without changing selection or filtering policy; `frontend/src/stores/view/filterSidebar.test.ts`.
- [ ] `W05.P11.S90` - Verify app-level tone mapping and unchanged filter interaction behavior; `frontend/src/app/stage/FilterMenu.render.test.tsx`.
- [ ] `W05.P11.S91` - Extend ownership guards to reject all future production deep imports and lower-layer app-kit dependencies; `frontend/src/app/designSystemOwnership.guard.test.ts`.

## Wave `W06` - centralize exact reusable motion and dimensions

Promote only ledger-proven semantic roles with exact shipped equality. Preserve local geometry when ownership or values do not match, retain scene-read literals, and generate the runtime carrier without changing cascade order.

### Phase `W06.P12` - capture exact-value evidence

Pin the pre-migration computed values in every supported theme before changing token ownership.

- [ ] `W06.P12.S92` - Record the light, dark, and high-contrast computed baseline for every promoted value and public token; `frontend/dev/design-system/computed-value-baseline.json`.
- [ ] `W06.P12.S93` - Add browser-level computed-value comparison helpers and exact-equality assertions; `frontend/e2e/design-system-token-values.spec.ts`.
- [ ] `W06.P12.S94` - Test ledger promotion eligibility, theme completeness, and rejection of nearest-token substitutions; `frontend/dev/design-system/consolidation-ledger.test.ts`.

### Phase `W06.P13` - extend DTCG generation

Add exact reusable motion and component dimensions to the generator-owned surface and remove their former hand-authored ownership.

- [ ] `W06.P13.S181` - Define and prove eligibility plus exact three-theme equality for shipped reusable motion-duration roles; `frontend/tokens/motion.tokens.json`.
- [ ] `W06.P13.S182` - Define and prove eligibility plus exact three-theme equality for shipped reusable motion-easing roles; `frontend/tokens/motion.tokens.json`.
- [ ] `W06.P13.S183` - Define and prove eligibility plus exact three-theme equality for shipped reusable control-target roles; `frontend/tokens/components.tokens.json`.
- [ ] `W06.P13.S184` - Define and prove eligibility plus exact three-theme equality for shipped reusable shell-dimension roles; `frontend/tokens/components.tokens.json`.
- [ ] `W06.P13.S185` - Define and prove eligibility plus exact three-theme equality for shipped reusable overlay-dimension roles; `frontend/tokens/components.tokens.json`.
- [ ] `W06.P13.S186` - Ledger every introduced token name, token structure, design alias, and parity-debt entry at introduction time; `frontend/dev/design-system/consolidation-ledger.ts`.
- [ ] `W06.P13.S97` - Register the new always-on token sets without changing the theme modifier or public color surface; `frontend/tokens/resolver.json`.
- [ ] `W06.P13.S98` - Generate motion and component declarations while preserving markers, import order, and literal scene colors; `frontend/style-dictionary.config.ts`.
- [ ] `W06.P13.S99` - Regenerate the ordered runtime declarations and remove replaced hand-authored values without splitting the stylesheet gratuitously; `frontend/src/styles.css`.
- [ ] `W06.P13.S100` - Extend token drift checking to motion and component regions; `frontend/dev/tooling/token-drift-check.ts`.
- [ ] `W06.P13.S101` - Verify deterministic generation, marker integrity, theme equality, and drift detection for the new regions; `frontend/dev/tooling/token-drift-check.test.ts`.
- [ ] `W06.P13.S102` - Document runtime ownership, exact-value promotion rules, component-token scope, and the no-Figma campaign fence; `frontend/tokens/README.md`.

### Phase `W06.P14` - consume promoted roles

Replace only the ledger-approved repeated roles, leaving every retained exact geometry entry classified and justified.

- [ ] `W06.P14.S103` - Consume the promoted activity-track and pulse roles; `frontend/src/app/kit/ActivityIndicator.tsx`.
- [ ] `W06.P14.S104` - Consume promoted field height, spacing, and type roles while preserving SearchField semantics; `frontend/src/app/kit/SearchField.tsx`.
- [ ] `W06.P14.S105` - Consume promoted dialog width, height, placement, and motion roles; `frontend/src/app/chrome/Dialog.tsx`.
- [ ] `W06.P14.S106` - Consume promoted sheet height, safe-area, target, and motion roles; `frontend/src/app/chrome/BottomSheet.tsx`.
- [ ] `W06.P14.S107` - Consume promoted state-overlay spacing and dimension roles while preserving graph-overlay composition; `frontend/src/app/stage/CanvasStateOverlay.tsx`.
- [ ] `W06.P14.S108` - Consume promoted coarse-pointer target roles without changing CreateDoc behavior; `frontend/src/app/left/CreateDocDialog.tsx`.
- [ ] `W06.P14.S109` - Consume the promoted coarse-pointer target role without changing framework status behavior; `frontend/src/app/right/FrameworkStatusCluster.tsx`.
- [ ] `W06.P14.S110` - Consume promoted compact-shell target and dimension roles; `frontend/src/app/shell/MobileTopBar.tsx`.
- [ ] `W06.P14.S111` - Consume promoted sheet-row target and shell roles; `frontend/src/app/shell/WorkspaceSwitcherSheet.tsx`.
- [ ] `W06.P14.S112` - Consume promoted palette width, placement, and motion roles; `frontend/src/app/palette/CommandPalette.tsx`.
- [ ] `W06.P14.S113` - Consume promoted search-overlay dimensions while preserving DocumentSearch semantics; `frontend/src/app/palette/DocumentSearchSurface.tsx`.
- [ ] `W06.P14.S114` - Consume promoted picker overlay dimensions and motion roles; `frontend/src/app/left/WorktreePicker.tsx`.
- [ ] `W06.P14.S115` - Consume promoted split-pane and result-region dimensions while preserving search composition; `frontend/src/app/palette/SearchPaletteSurface.tsx`.
- [ ] `W06.P14.S116` - Consume promoted project-dialog dimensions while preserving responsive stacking; `frontend/src/app/left/AddProjectDialog.tsx`.
- [ ] `W06.P14.S117` - Record post-generation values and prove exact equality against the baseline in every theme; `frontend/dev/design-system/computed-value-baseline.json`.

## Wave `W07` - separate error containment and consolidate chrome

Keep catching, logging, reset, and retry coordination in platform. Move all localized product fallback presentation into app composition, then share modal focus and dismissal infrastructure between dialogs and sheets.

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

### Phase `W07.P16` - consolidate modal interaction infrastructure

Share focus entry, focus containment, restoration, Escape handling, scrim dismissal, and panel semantics while retaining distinct dialog and bottom-sheet layouts.

- [ ] `W07.P16.S127` - Implement the shared modal-surface interaction frame without introducing a competing base-control vocabulary; `frontend/src/app/chrome/ModalSurface.tsx`.
- [ ] `W07.P16.S128` - Verify focus entry, containment, restoration, Escape, scrim, and nondismissible behavior; `frontend/src/app/chrome/ModalSurface.render.test.tsx`.
- [ ] `W07.P16.S129` - Compose Dialog from ModalSurface while retaining its header, footer, width variants, and IconButton close action; `frontend/src/app/chrome/Dialog.tsx`.
- [ ] `W07.P16.S130` - Compose BottomSheet from ModalSurface while retaining bottom placement, grabber, safe-area, and hidden-title semantics; `frontend/src/app/chrome/BottomSheet.tsx`.
- [ ] `W07.P16.S131` - Verify the consolidated frame still traps forward and reverse tab traversal correctly; `frontend/src/app/chrome/focusTrap.test.ts`.
- [ ] `W07.P16.S132` - Verify focus restoration across nested and removed modal launchers; `frontend/src/app/chrome/useFocusRestore.test.ts`.
- [ ] `W07.P16.S133` - Verify ConfirmDialog behavior through the consolidated Dialog owner; `frontend/src/app/chrome/ConfirmDialog.render.test.tsx`.
- [ ] `W07.P16.S134` - Verify action-confirmation behavior through the consolidated Dialog owner; `frontend/src/app/chrome/ActionConfirmationDialog.test.tsx`.
- [ ] `W07.P16.S135` - Refresh authored shell and overlay compositions affected by shared modal infrastructure; `frontend/dev/visual-review/specimens/shell.tsx`.

## Wave `W08` - close authored and runtime review coverage

Turn missing and orphaned specimens into a gate, correct the viewport claim, and add bounded live runtime coverage for three themes at regular-wide, regular-intermediate, and compact widths.

### Phase `W08.P17` - gate authored review completeness

Ensure the review desk honestly proves authored appearance for applicable states and never claims viewport or live-wire evidence.

- [ ] `W08.P17.S136` - Fail tests for missing specimens, orphaned specimens, invalid exclusions, and duplicate surface identities; `frontend/dev/visual-review/registry.test.ts`.
- [ ] `W08.P17.S137` - Verify deterministic surface discovery, principal-export resolution, and excluded-area behavior; `frontend/dev/visual-review/surfaces.test.ts`.
- [ ] `W08.P17.S138` - Correct the review command description so viewport coverage is assigned to runtime evidence rather than the authored desk; `Justfile`.
- [ ] `W08.P17.S139` - Complete settings specimens for all applicable authored states; `frontend/dev/visual-review/specimens/settings.tsx`.
- [ ] `W08.P17.S140` - Complete agent specimens for all applicable authored states; `frontend/dev/visual-review/specimens/agent.tsx`.
- [ ] `W08.P17.S141` - Complete authoring specimens for all applicable authored states; `frontend/dev/visual-review/specimens/authoring.tsx`.
- [ ] `W08.P17.S142` - Complete viewer specimens for all applicable authored states; `frontend/dev/visual-review/specimens/viewer.tsx`.
- [ ] `W08.P17.S143` - Complete stage specimens without adding scene harness controls; `frontend/dev/visual-review/specimens/stage.tsx`.
- [ ] `W08.P17.S144` - Complete palette specimens for all applicable authored states; `frontend/dev/visual-review/specimens/palette.tsx`.
- [ ] `W08.P17.S145` - Complete shell specimens for compact and regular compositions without inventing a desk viewport axis; `frontend/dev/visual-review/specimens/shell.tsx`.

### Phase `W08.P18` - cover the theme and viewport matrix

Add one independent runtime case per supported theme and representative viewport, preserving the two supported responsive classes.

- [ ] `W08.P18.S146` - Add the light-theme regular-wide runtime pass; `frontend/e2e/design-system-consolidation.spec.ts`.
- [ ] `W08.P18.S147` - Add the dark-theme regular-wide runtime pass; `frontend/e2e/design-system-consolidation.spec.ts`.
- [ ] `W08.P18.S148` - Add the high-contrast regular-wide runtime pass; `frontend/e2e/design-system-consolidation.spec.ts`.
- [ ] `W08.P18.S149` - Add the light-theme regular-intermediate runtime pass; `frontend/e2e/design-system-consolidation.spec.ts`.
- [ ] `W08.P18.S150` - Add the dark-theme regular-intermediate runtime pass; `frontend/e2e/design-system-consolidation.spec.ts`.
- [ ] `W08.P18.S151` - Add the high-contrast regular-intermediate runtime pass; `frontend/e2e/design-system-consolidation.spec.ts`.
- [ ] `W08.P18.S152` - Add the light-theme compact runtime pass; `frontend/e2e/design-system-consolidation.spec.ts`.
- [ ] `W08.P18.S153` - Add the dark-theme compact runtime pass; `frontend/e2e/design-system-consolidation.spec.ts`.
- [ ] `W08.P18.S154` - Add the high-contrast compact runtime pass; `frontend/e2e/design-system-consolidation.spec.ts`.

### Phase `W08.P19` - prove live interaction behavior

Extend the same live application coverage beyond screenshots so appearance and reachability remain distinct claims.

- [ ] `W08.P19.S155` - Verify keyboard traversal, immediate keyboard actions, focus visibility, and focus restoration across the matrix; `frontend/e2e/design-system-consolidation.spec.ts`.
- [ ] `W08.P19.S156` - Verify fine-pointer and emulated coarse-pointer targets and row-menu affordances; `frontend/e2e/design-system-consolidation.spec.ts`.
- [ ] `W08.P19.S157` - Verify dialog, sheet, palette, and menu placement and dismissal at every representative width; `frontend/e2e/design-system-consolidation.spec.ts`.
- [ ] `W08.P19.S187` - Verify live-wire settings behavior without authored-state substitution; `frontend/e2e/design-system-consolidation.spec.ts`.
- [ ] `W08.P19.S188` - Verify live-wire filtering behavior without authored-state substitution; `frontend/e2e/design-system-consolidation.spec.ts`.
- [ ] `W08.P19.S189` - Verify live-wire search behavior without authored-state substitution; `frontend/e2e/design-system-consolidation.spec.ts`.
- [ ] `W08.P19.S190` - Verify live-wire review behavior without authored-state substitution; `frontend/e2e/design-system-consolidation.spec.ts`.
- [ ] `W08.P19.S191` - Verify live-wire retry behavior without authored-state substitution; `frontend/e2e/design-system-consolidation.spec.ts`.

## Wave `W09` - reconcile ownership and close the campaign

Re-run every inventory and gate, resolve all stale migration artifacts, preserve intentional seams, and produce an evidence-backed audit that distinguishes authored appearance from runtime reachability.

### Phase `W09.P20` - finalize classifications and evidence

Close every ledger entry against the shipped source and make all retained exceptions explicit.

- [ ] `W09.P20.S159` - Reconcile every native-control, arbitrary-value, canonical-owner, retained-seam, and naming-debt entry against the final source; `frontend/dev/design-system/consolidation-ledger.ts`.
- [ ] `W09.P20.S160` - Tighten the ratchet to reject removed implementations, stale aliases, migration comments, forwarding wrappers, and surface-specific theme forks; `frontend/dev/tooling/scan-design-system.mjs`.
- [ ] `W09.P20.S161` - Preserve final light, dark, and high-contrast exact-value evidence for every promoted token; `frontend/dev/design-system/computed-value-baseline.json`.
- [ ] `W09.P20.S162` - Create a durable runtime-results receipt recording commands, themes, exact widths, responsive classes, evidence-pass outcomes, and confirmation-pass outcomes; `.vault/reference/`.
- [ ] `W09.P20.S163` - Produce the final evidence-backed ownership, behavior, accessibility, theme, viewport, debt, and boundary audit citing runtime and authored-review evidence separately; `.vault/audit/`.
- [ ] `W09.P20.S192` - Compare final scene sources and the SceneController contract byte-for-byte with the pre-execution campaign baseline; `frontend/dev/design-system/scene-freeze-baseline.json`.

## Parallelization

- Waves land sequentially. W01 is a hard prerequisite for every migration. W02 precedes W03 and W04. W05 follows consumer migration so it removes final deep imports and layer leaks rather than creating temporary churn. W06 relies on the classified ledger and landed consumers. W07 relies on the kit and token owners. W08 follows all production migrations. W09 is final.
- Within W01, ledger population may proceed alongside scanner fixture preparation after the schema is stable.
- Within W02, TextField, TextArea, OptionRow, IconButton, and ActivityIndicator tests may proceed independently. Settings migration begins only after each required primitive lands.
- Within W03, ordinary-field and ordinary-textarea phases may run in parallel because they touch separate production and test files. Specimen updates follow both.
- Within W04, option-row and icon-action work may run in parallel except where both touch Composer, Dialog, palette, or shared specimen files; those overlaps are serialized.
- Within W05, independent deep-import rows may run in parallel. Filter presentation, sidebar, and menu layer correction is one ordered chain.
- Within W06, motion-token and component-token authoring may run in parallel after the computed baseline is captured. Generator, stylesheet, drift checks, consumer migration, and post-value proof are ordered.
- Within W07, platform containment and ModalSurface work may begin in parallel after their APIs are fixed. Production boundary migration follows AppErrorBoundary. Dialog and BottomSheet migration follows ModalSurface.
- Within W08, authored specimen files may be updated in parallel. Runtime matrix cases may be authored independently but execute serially where they share a live engine.
- Narrow touched-scope tests may be parallelized only when they do not share a live engine or mutable fixture. No full Vitest run may overlap another full Vitest run or a live-engine test run.
- Existing dirty changes are never reverted. Work that overlaps `frontend/package.json`, app tests, or other dirty files must preserve the pre-existing diff. No implementation work occurs under `frontend/src/scene/`; runtime inspection of scene output is read-only.

## Verification

- Before any Phase is routed to review, run its touched type, unit, render, accessibility, interaction, guard, token, or browser tests, full `just lint frontend`, and then one serialized full `just test frontend`. Required review revisions land and pass re-review before forward work.
- Before any implementation commit or green report, full `just lint frontend` must exit zero. Wave completion also requires all touched tests and the Phase-review test cadence above.
- Never run two full Vitest suites concurrently. Do not overlap `just test frontend` with another full or live-engine Vitest invocation.
- W01 passes the new ledger scanner, scanner fixtures, guard tests, existing token checks, relative-unit checks, domain checks, module checks, and full frontend lint and test gates. Its immutable scene and `SceneController` preimages include the worktree state as execution began, not merely `HEAD`.
- W02 proves direct kit composition, accessible labeling, focus, disabled states, semantic size variants, keyboard behavior, unchanged settings wire strings, and removal of settings-owned visual recipes.
- W03 proves that ordinary field and textarea consumers use canonical owners while search inputs, composer entry, code overlays, date inputs, graph controls, timeline handles, tree controls, and task checkboxes remain explicitly classified semantic seams.
- W04 proves direct OptionRow and IconButton consumption and same-Wave deletion of replaced classes, aliases, wrappers, and migration comments. OptionRow forwards semantic and keyboard props but does not own roving navigation, menu cursoring, or focus containment; `useFocusZone` and composing chrome retain that ownership.
- W05 proves zero production kit-submodule imports and zero store or platform imports from app kit. Store selectors, filter values, wire conversion, and user-visible filtering behavior remain unchanged.
- W06 passes token generation and drift checks and proves before-and-after computed-value equality for every promoted value in light, dark, and high-contrast. Public token names and every scene-read literal hex remain unchanged. No nearest-token snapping is accepted.
- W07 proves platform ErrorBoundary contains, logs, resets, and injects presentation without localization or kit dependencies. Every production boundary uses AppErrorBoundary or an explicit app-owned renderer. Dialog and BottomSheet retain focus containment, restoration, placement, dismissal, and reduced-motion behavior.
- W08's authored desk has zero missing and zero orphaned specimens. Applicable normal, loading, empty, and degraded states render in light, dark, and high-contrast. The desk makes no viewport or live-wire claim.
- W08's live runtime evidence passes at regular-wide, regular-intermediate, and compact widths in all three themes. It covers keyboard navigation, focus visibility, fine and coarse pointers, overlay placement and dismissal, reduced motion, and representative live-wire behavior. The matrix runs once for evidence and once as a confirmation pass.
- Runtime checks may observe graph and scene output, but verification must compare final scene sources and the `SceneController` contract byte-for-byte with the immutable pre-execution campaign baseline, including any dirty changes that existed before execution. A diff against `HEAD` is insufficient.
- Final acceptance runs full `just lint frontend` and then one serialized full `just test frontend`, both at exit zero. It also passes token drift, relative-unit, domain, module-boundary, review-completeness, native-control, arbitrary-value, deep-import, layer-direction, and migration-facade guards.
- The final audit confirms direct canonical imports, same-Wave deletion, no compatibility facades, no surface theme forks, a closed classification inventory, exact-value evidence, byte-for-byte scene non-interference, bounded runtime evidence, and a remaining naming/parity-debt ledger. A durable runtime-results reference records commands, exact widths, themes, responsive classes, evidence-pass outcomes, and confirmation-pass outcomes; the audit cites it separately from authored-review evidence and makes no Figma parity claim.
