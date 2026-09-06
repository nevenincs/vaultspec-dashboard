---
tags:
  - '#research'
  - '#design-system-consolidation'
date: '2026-09-05'
modified: '2026-09-06'
body_schema: 'body-v2'
body_hash: 'sha256:eff79ce767620ccb7b3f958004ece20de81c9a91c78287b05526de5fe8cd7514'
related:
  - "[[2026-06-14-dashboard-design-language-adr]]"
  - "[[2026-06-14-dashboard-design-adoption-adr]]"
  - "[[2026-06-19-relative-units-migration-adr]]"
  - "[[2026-06-25-state-mode-uniformity-adr]]"
  - "[[2026-07-31-visual-review-authored-states-adr]]"
  - "[[2026-08-01-code-deduplication-adr]]"
---

# `design-system-consolidation` research: `horizontal polish`

The question is whether Vaultspec Dashboard needs a new visual language or a horizontal consolidation of the system it already ships. The evidence favors one behavior-preserving DOM campaign: keep the accepted themes, token contracts, responsive behavior, stores, wire model, and scene behavior intact; establish explicit owners for reusable values and controls; migrate surfaces to those owners; delete replaced implementations; and prove the result across representative themes, states, and viewport classes. Figma capture, parity, and reconciliation are outside this campaign. The ADR must decide the ownership map, promotion rules, migration gates, and the precise meaning of that no-Figma fence.

## Findings

### The foundation is settled; the remaining defect is horizontal adoption drift

Accepted decisions already establish a root semantic-token carrier, OKLCH themes, compact density, relative sizing, centralized visible primitives, uniform state modes, and a stable DOM-to-scene token seam. Scene-consumed colors are a load-bearing exception and remain literal per-theme hex. The adoption audit found no blocking foundation defect. Current `tokens:check`, `lint:px`, `lint:domains`, and `lint:modules` checks also pass. These checks prove generator consistency and boundary compliance, but they do not prove that valid relative values use canonical roles or that React surfaces compose canonical primitives. `.vault/adr/2026-06-14-dashboard-design-language-adr.md:70`, `.vault/adr/2026-06-14-dashboard-design-language-adr.md:146`, `.vault/adr/2026-06-14-dashboard-design-language-adr.md:175`, `.vault/audit/2026-06-14-dashboard-design-adoption-audit.md:83`, `frontend/dev/tooling/token-drift-check.ts:51`, `frontend/dev/tooling/scan-px.mjs:72`.

The campaign should inherit this foundation rather than authorize palette, hierarchy, graph, information-architecture, or product-behavior redesign.

### Reusable control ownership is split between the kit, chrome, stores, and surfaces

Project law requires visible primitives to come from one centralized system, and the kit barrel states the same public contract. In practice, settings controls recreate `Switch`, `Slider`, and segmented-control styling and keyboard behavior; their visual class strings are also emitted from the stores layer. `ActivityIndicator` exists in the kit but is absent from its barrel. `MobileTopBar`, dialogs, sheets, menus, fields, and close/remove actions contain further locally owned treatments. `ErrorBoundary` uses framework palette colors and bespoke buttons rather than semantic tokens. `.codex/rules/design-system.md:9`, `frontend/src/app/kit/index.ts:1`, `frontend/src/app/settings/controls/SwitchControl.tsx:15`, `frontend/src/app/settings/controls/NumberControl.tsx:25`, `frontend/src/app/settings/controls/EnumControl.tsx:30`, `frontend/src/stores/view/settingsControls.ts:45`, `frontend/src/app/chrome/DataActivityIndicator.tsx:8`, `frontend/src/app/shell/MobileTopBar.tsx:50`, `frontend/src/platform/errors/ErrorBoundary.tsx:99`.

A bounded raw-text scan found 128 `button`, `input`, `select`, or `textarea` matches across 156 production app TSX files. Three matches are documentation prose rather than executable JSX: the `<input>` reference in `frontend/src/app/kit/FacetRow.tsx`, the `<button>` reference in `frontend/src/app/kit/Tab.tsx`, and the `<input type="date">` reference in `frontend/src/app/stage/FilterMenu.tsx`. A syntax-aware TypeScript AST scan therefore establishes the canonical executable baseline at 125 JSX sites: 12 inside `app/kit` and 113 outside it. These are classification candidates, not assumed defects: a native element is valid inside a canonical composite when existing primitives cannot express its semantics. The campaign must classify each candidate as existing-primitive use, missing primitive, intentional composite seam, or local duplication before changing it.

The inventory is concentrated enough for bounded migration waves: 21 sites in agent surfaces, 18 in the left rail, 14 in stage surfaces, 14 in viewer surfaces, 11 in the right rail, and 10 in palettes. The dominant files are `Composer` (8), `WorktreePicker` (7), `FilterMenu` (6), `SearchPaletteSurface` (6), and `StatusTab` (5). This argues against a global mechanical replacement: these modules mix true base controls with semantic composites such as tree rows, graph controls, palette options, editable code overlays, and timeline handles.

The first safe clusters are narrower: settings wrappers already matching kit controls; ordinary text fields shared by settings, dialogs, clarification, and properties; ordinary textareas shared by review/comment authoring; menu/option rows shared by model, date-basis, filter, context-menu, and palette surfaces; and unlabeled icon-action chrome shared by dialog, composer, mobile topbar, and viewer surfaces. Search inputs, code-overlay textareas, graph/island controls, timeline handles, tree rows, and task checkboxes need separate semantic review rather than automatic conversion.

Import ownership has a second concrete layer leak: `frontend/src/stores/view/filterPresentation.ts:1` imports the visual `FacetDotTone` type upward from `app/kit`. That store already owns presentation mapping, so the ADR should either move the neutral tone vocabulary below both consumers or move the dot mapping to app composition; simply normalizing this import through the kit barrel would preserve the wrong dependency direction.

The platform error fallback exposes the one real layer-boundary choice. `ErrorBoundary` is a generic containment mechanism used by the app root, shell regions, and the graph timeline, but its default renderer currently owns localized product presentation and bespoke controls inside `platform`. Importing `app/kit` upward would invert the dependency. The boundary-safe option favored by the evidence is to keep containment and diagnostics in `platform`, require or wrap an injected fallback renderer at the app composition layer, and implement the product fallback from kit primitives. `frontend/src/platform/errors/ErrorBoundary.tsx:29`, `frontend/src/main.tsx:117`, `frontend/src/app/AppShell.tsx:255`, `frontend/src/app/stage/GraphPanel.tsx:67`. A second platform-specific visual kit would preserve the split authority and is therefore disfavored.

### Passing the literal-pixel gate does not consolidate dimensions or typography

A bounded scan found 106 arbitrary relative-value utilities across 47 production app/platform files. Repeated values include `2.75rem`, `0.625rem`, and `0.6875rem`. Some are legitimate exact geometry; others repeat foundation roles or reveal a missing component token. Examples exist in both surfaces and the kit. `frontend/src/app/stage/CanvasStateOverlay.tsx:169`, `frontend/src/app/viewer/MarkdownReader.tsx:480`, `frontend/src/app/kit/FacetRow.tsx:69`.

DTCG currently owns color, type, spacing, radius, and elevation, while motion remains hand-authored. A blanket nearest-token replacement would violate the accepted value-preserving rule. The ADR must define when a repeated value becomes a foundation token, a component token, or a documented local exception, and whether motion, shell dimensions, touch targets, or overlay infrastructure enter the centralized surface. `frontend/tokens/README.md:45`, `.vault/adr/2026-06-19-relative-units-migration-adr.md:35`.

### Existing decisions support a waved canonical-home migration

The state-mode and filter decisions establish the relevant rollout pattern: create or identify one owner, migrate violators surface family by surface family, and verify each wave. The deduplication decision adds two important constraints: import the canonical owner directly and delete the replaced implementation in the same migration, without a compatibility facade becoming a second authority. `.vault/adr/2026-06-25-state-mode-uniformity-adr.md:44`, `.vault/adr/2026-06-19-filter-consolidation-adr.md:126`, `.vault/adr/2026-08-01-code-deduplication-adr.md:21`, `.vault/adr/2026-08-01-code-deduplication-adr.md:46`.

The evidence supports the following candidate ownership map for the ADR to settle: DTCG owns reusable foundation values; the kit owns reusable visual and interactive primitives; shared chrome owns application-shell composites and interaction infrastructure that are not general primitives; surfaces own feature composition, not parallel base-element styling; stores own state and value policy, not CSS recipes.

### Verification exists but needs a bounded claim

The visual-review desk renders real production components in authored states, but its accepted contract says a cell proves appearance, not live-wire reachability. Its surface inventory is heuristic, and missing or orphaned specimens are reported in the UI rather than failed by a dedicated gate. The Justfile describes a viewport axis that the review state model explicitly excludes. `.vault/adr/2026-07-31-visual-review-authored-states-adr.md:43`, `frontend/dev/visual-review/surfaces.ts:35`, `frontend/dev/visual-review/registry.tsx:73`, `frontend/dev/visual-review/state.ts:3`, `Justfile:135`.

Completion therefore needs combined evidence: token, pixel, domain, module, type, lint, and test gates; authored visual-review states and themes; a representative runtime pass at wide, intermediate, and compact widths; live-wire behavior tests; keyboard and focus checks; and a final ownership scan showing replaced styles and components were removed.

### The no-Figma fence must be explicit without silently changing long-term authority

The owner excluded Figma capture, parity, and reconciliation and designated shipped code, runtime, tokens, components, and repository decisions as this campaign's working surface. Existing project law still treats Figma as long-term design authority. The narrow interpretation is therefore favored: this campaign makes no parity claim and uses current shipped behavior as its bounded implementation baseline; it does not silently supersede the existing authority rule. `.codex/rules/design-system.md:8`.

### Alternatives

- **Token-only cleanup:** low risk, but leaves duplicate React ownership and interaction-state drift. Insufficient.
- **Independent surface polish:** can improve screens quickly, but repeatedly pays the same primitive-consolidation cost. Rejected.
- **Behavior-preserving horizontal consolidation:** establishes canonical owners, migrates in bounded waves, deletes replacements, and verifies the whole path. Favored.
- **Redesign or Figma-parity campaign:** reopens settled visual decisions and exceeds the requested scope. Rejected for this campaign.

### What the ADR must decide

- The ownership map for foundation tokens, component tokens, kit primitives, shared chrome composites, and surface composition.
- The objective rule for promoting a repeated value or pattern versus preserving a justified local exception.
- The treatment of motion, shell dimensions, touch targets, overlay infrastructure, stale aliases, and migration comments.
- Direct canonical consumption and same-wave deletion, with no compatibility facade.
- A behavioral freeze covering stores, wire/model contracts, scene behavior, and feature semantics.
- Literal-hex compatibility for scene-read tokens.
- The no-Figma campaign fence and its relationship to long-term authority.
- Waved verification across themes, viewport classes, authored states, runtime behavior, keyboard/focus behavior, and final duplication scans.
- Isolation from unrelated in-flight scene and graph work.

## Sources

- `.codex/rules/design-system.md:8`
- `.codex/rules/design-system.md:9`
- `.vault/adr/2026-06-14-dashboard-design-language-adr.md:70`
- `.vault/adr/2026-06-14-dashboard-design-language-adr.md:146`
- `.vault/adr/2026-06-14-dashboard-design-language-adr.md:175`
- `.vault/audit/2026-06-14-dashboard-design-adoption-audit.md:83`
- `.vault/adr/2026-06-19-relative-units-migration-adr.md:35`
- `.vault/adr/2026-06-19-filter-consolidation-adr.md:126`
- `.vault/adr/2026-06-25-state-mode-uniformity-adr.md:44`
- `.vault/adr/2026-07-31-visual-review-authored-states-adr.md:43`
- `.vault/adr/2026-08-01-code-deduplication-adr.md:21`
- `.vault/adr/2026-08-01-code-deduplication-adr.md:46`
- `frontend/tokens/README.md:45`
- `frontend/dev/tooling/token-drift-check.ts:51`
- `frontend/dev/tooling/scan-px.mjs:72`
- `frontend/src/app/kit/index.ts:1`
- `frontend/src/app/settings/controls/SwitchControl.tsx:15`
- `frontend/src/app/settings/controls/NumberControl.tsx:25`
- `frontend/src/app/settings/controls/EnumControl.tsx:30`
- `frontend/src/stores/view/settingsControls.ts:45`
- `frontend/src/app/chrome/DataActivityIndicator.tsx:8`
- `frontend/src/app/shell/MobileTopBar.tsx:50`
- `frontend/src/platform/errors/ErrorBoundary.tsx:99`
- `frontend/src/platform/errors/ErrorBoundary.tsx:29`
- `frontend/src/main.tsx:117`
- `frontend/src/app/AppShell.tsx:255`
- `frontend/src/app/stage/GraphPanel.tsx:67`
- `frontend/src/stores/view/filterPresentation.ts:1`
- `frontend/src/app/stage/CanvasStateOverlay.tsx:169`
- `frontend/src/app/viewer/MarkdownReader.tsx:480`
- `frontend/src/app/kit/FacetRow.tsx:69`
- `frontend/dev/visual-review/surfaces.ts:35`
- `frontend/dev/visual-review/registry.tsx:73`
- `frontend/dev/visual-review/state.ts:3`
- `Justfile:135`

Inventory commands: `rg -n '<(button|input|select|textarea)\b' frontend/src/app frontend/src/platform -g '*.tsx' -g '!*.test.*'`; `rg -n '\[[^\]]*(rem|em|vw|vh|%)\]' frontend/src/app frontend/src/platform -g '*.tsx' -g '!*.test.*'`.

Semantic discovery was attempted first, but the local `vaultspec-rag` service remained warming while its Qdrant store was locked. Grounding therefore used `vaultspec-core status`, `vaultspec-core vault list`, targeted whole-record reads, and exact source scans. No external design artifact was consulted.
