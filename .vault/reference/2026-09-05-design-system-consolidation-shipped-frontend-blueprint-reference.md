---
tags:
  - '#reference'
  - '#design-system-consolidation'
date: '2026-09-05'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:1244c1bd9fdb118a5e665015d91a18d29914ebb4c479f58446f9ba0efea49abf'
related:
  - "[[2026-09-05-design-system-consolidation-horizontal-polish-research]]"
  - "[[2026-06-14-dashboard-design-language-adr]]"
  - "[[2026-06-16-figma-frontend-rewrite-adr]]"
  - "[[2026-08-01-code-deduplication-canonical-homes-reference]]"
---

# `design-system-consolidation` reference: `shipped frontend blueprint`

This is the implementation map for the shipped frontend. Repository decisions, source, generated tokens, runtime behavior, and existing test surfaces are its authority. Figma access and parity artifacts are out of scope.

## Summary

### Canonical homes

- DTCG JSON is the value source: color primitives and semantics begin in `frontend/tokens/primitives.tokens.json:4` and `frontend/tokens/semantic.tokens.json:4`; type, radius, elevation, and spacing begin at line 4 of their corresponding token files. Theme composition is declared in `frontend/tokens/resolver.json:11`.
- `frontend/style-dictionary.config.ts:36` registers token sources, `generateRegions` emits color/theme declarations at line 134, `generateFoundation` emits non-color foundation tokens at line 199, and `writeStyles` updates generated CSS regions at line 245.
- `frontend/src/styles.css` is the runtime carrier: static tokens at line 75, generated foundation at line 188, theme remaps at line 352, reader typography at line 606, contrast proof at line 1000, Dockview binding at line 1106, hairlines at line 1198, and syntax-theme binding at line 1232.
- Reusable React atoms live in `frontend/src/app/kit/`, with the intended public entry in `frontend/src/app/kit/index.ts:1`. Representative owners are `Button.tsx:41`, `IconButton.tsx:29`, `SearchField.tsx:52`, `Switch.tsx:21`, `Slider.tsx:32`, `SegmentedToggle.tsx:60`, and `ListRow.tsx:22`.
- Theme behavior belongs to `frontend/src/platform/theme/themeController.ts`: vocabulary at line 19, system/manual resolution at line 36, root application at line 71, and controller construction at line 96. React consumes it through `frontend/src/platform/theme/useTheme.ts:24`.
- Composite keyboard behavior belongs to `frontend/src/app/chrome/useFocusZone.ts`: target resolution at line 47, key resolution at line 83, and hook implementation at line 163. Coarse-pointer detection is centralized in `frontend/src/app/chrome/RowMenuDisclosure.tsx:40`.
- Responsive shell selection belongs to `frontend/src/stores/view/viewportClass.ts`: the `40rem` breakpoint at line 29 and hook at line 66. `frontend/src/app/AppShell.tsx:196` selects the compact shell.
- Runtime-state presentation uses shared `Skeleton` and `StateBlock` exports in `frontend/src/app/kit/index.ts:69`. The visual-review desk discovers data-bearing surfaces through `frontend/dev/visual-review/surfaces.ts:35`, joins specimens in `registry.tsx:67`, and exposes normal/loading/empty/degraded in `state.ts:10`.
- Live browser evidence exists in Playwright: engine-served shell, graph, and search in `frontend/e2e/smoke.spec.ts:12`; compact `390x844` coverage in `frontend/e2e/localization-responsive.spec.ts:10`; theme screenshots in `frontend/e2e/editor.spec.ts:138`.

### Confirmed strengths

- `npm run tokens:check`, `npm run lint:px`, `npm run lint:domains`, and `npm run lint:modules` pass at the 2026-09-06 baseline.
- Light, dark, and high-contrast use one root remap mechanism.
- Focus rings resolve through `--color-focus`; reduced motion covers OS and explicit preferences in `frontend/src/styles.css:560`.
- The shell has one explicit responsive signal, and compact loading does not mount the graph.
- The review desk is hermetic and renders real production components from authored inputs.

### Concrete duplication and drift

1. **Settings controls duplicate kit primitives.** `frontend/src/app/settings/controls/SwitchControl.tsx:15`, `NumberControl.tsx:25`, and `EnumControl.tsx:30` recreate controls owned by the kit. Visual classes also leak from `frontend/src/stores/view/settingsControls.ts:45`. Keep schema decoding and wire-string conversion in stores; compose kit primitives in React.
2. **Generic form primitives are missing.** Text fields, textareas, date inputs, and selects are repeatedly styled in settings, authoring, agent, palette, and viewer surfaces. First-wave candidates are ordinary text fields in settings, dialogs, clarification, and properties plus ordinary textareas in review/comment authoring. Search inputs, code-overlay textareas, date inputs, graph controls, timeline handles, and task checkboxes are distinct semantic families. Extract likely `TextField`, `TextArea`, and menu/option-row owners; do not create a universal polymorphic control.
3. **Icon and menu-row chrome is repeatedly inlined.** Examples include close/remove controls in `frontend/src/app/chrome/Dialog.tsx:117`, `frontend/src/app/agent/Composer.tsx:255`, and `frontend/src/app/viewer/RelatedDocPicker.tsx:88`; option styling repeats in `ComposerModelPicker.tsx:94`, `DateBasisSelect.tsx:192`, and `FilterMenu.tsx:200`.
4. **The kit entry contract has import drift.** Twelve production imports reach kit submodules directly. Examples include `AgentBeginView.tsx:32`, `RowMenuDisclosure.tsx:14`, `FilterMenu.tsx:24`, and `AdvancedSection.tsx:20`. `ActivityIndicator` is a known missing barrel export. One deep import is not merely barrel drift: `frontend/src/stores/view/filterPresentation.ts:1` imports the visual `FacetDotTone` type upward from app kit. Move the neutral vocabulary below both consumers or move visual mapping into app composition; do not legitimize the layer leak through a barrel import.
5. **Spacing and type are partly tokenized.** Production app files contain more than one hundred arbitrary relative-value utilities. Classify each as missing token, intentional geometry, or local defect; tokenize repeated roles only.
6. **`styles.css` mixes ownership domains.** Generated DTCG regions coexist with reader roles, theme shadows, motion, contrast evidence, Dockview overrides, syntax binding, and hairline patches. Split only if import order, generator markers, Tailwind scanning, and the single root token surface remain stable.
7. **Visual-review documentation overstates viewport coverage.** `Justfile:135` describes a viewport axis while `frontend/dev/visual-review/state.ts:3` excludes it.
8. **Visual-review completeness is visible but not gating.** Missing and orphaned specimens are displayed in `frontend/dev/visual-review/main.tsx:433`, but no dedicated test fails on them.
9. **Screenshot evidence is ephemeral.** `frontend/e2e/editor.spec.ts:20` writes under ignored `test-results/editor-evidence/`; these are run artifacts, not durable goldens.
10. **Platform fallback styling needs a boundary-safe owner.** `frontend/src/platform/errors/ErrorBoundary.tsx:29` already exposes a fallback-render contract, while the app root and region boundaries are composed at `frontend/src/main.tsx:117`, `frontend/src/app/AppShell.tsx:255`, and `frontend/src/app/stage/GraphPanel.tsx:67`. Keep containment, reset, and logging in platform; move localized product presentation into an app-owned wrapper or required injected renderer composed from kit primitives. Do not import app kit into platform and do not create a second platform visual kit.

### Native-control inventory by migration family

The syntax-aware executable baseline comprises 125 JSX sites: 100 buttons, 19 inputs, one select, and five textareas. Twelve sites are inside the kit and 113 are outside it. Area totals are agent 21, left rail 18, stage 14, viewer 14, right rail 11, palette 10, settings 6, shell 5, islands 3, panels 3, timeline 3, platform errors 2, authoring 1, chrome 1, menu 1, and kit 12. The dated raw-text scan returned 128 matches because documentation prose in `FacetRow.tsx`, `Tab.tsx`, and `FilterMenu.tsx` contributed one false match each. Counts include deliberate native controls and should be used as a classification ledger, not a zero-target metric.

- **Direct kit migrations:** settings switch, slider, and enum wrappers; ordinary action and icon buttons already expressible by `Button` or `IconButton`.
- **Narrow new primitives:** ordinary `TextField`, ordinary `TextArea`, and a behaviorally explicit menu/option row if the existing `ListRow` contract cannot cover it.
- **Shared compositions:** search/palette input shells, dialog/sheet dismissal chrome, and app error fallbacks should compose kit primitives while retaining their specialized semantics.
- **Preserved native seams:** editable-code overlays, readonly task checkboxes, graph/island interaction targets, timeline handles, tree-row controls, and other controls whose native element is integral to a larger canonical composite.
- **Decision required after inspection:** date inputs/selects and highly specialized chips/toggles; migrate only when their behavior and state contract match an owner exactly.

### Recommended migration order

1. Replace settings-control visual and keyboard duplication with kit composition while retaining value policy in stores.
2. Inventory native controls by role and extract only repeated, behaviorally equivalent primitives.
3. Normalize kit import policy and close missing barrel exports.
4. Classify arbitrary relative values; add tokens for repeated roles and retain justified exact geometry.
5. Resolve platform error fallback without crossing architecture boundaries.
6. Split `styles.css` only where an ownership seam provides clear value and cascade behavior is provably unchanged.
7. Gate missing/orphaned review specimens and reconcile the viewport claim.
8. Run one bounded visual pass across wide, intermediate, and compact layouts in all three themes, followed by one confirmation pass.

### Implementation constraints

- Preserve store, wire/model, SceneController, graph, filtering, and feature behavior.
- Preserve scene-read literal-hex token values and the public CSS token names.
- Prefer an existing owner; create a narrow owner only for repeated equivalent semantics.
- Migrate consumers directly and delete replaced implementations in the same wave.
- Do not add compatibility facades or surface-specific theme forks.
- Treat unrelated in-flight graph and scene changes as out of scope.
- Make no Figma parity claim.
