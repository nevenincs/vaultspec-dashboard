---
tags:
  - '#reference'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
related:
  - "[[2026-07-14-frontend-localization-research]]"
  - "[[2026-07-14-frontend-localization-adr]]"
---

# `frontend-localization` reference: `Localization integration and migration inventory`

This blueprint maps the production integration points and migration dependencies for
the frontend localization campaign. It is grounded in the current React, action,
keymap, settings, error, formatting, and render-test implementations. Package registry
inspection on 2026-07-14 reported `i18next` 26.3.6 and `react-i18next` 17.0.9 as the
current releases; the implementation plan must lock exact compatible versions through
the existing npm lockfile.

## Summary

The integration has four dependency layers. The platform runtime and message types must
land first. Shared action, keybinding, and command contracts depend on those types and
must migrate before their many render consumers. Store presentation models then move
from resolved English to message descriptors. Leaf React surfaces migrate last by
domain. Catalog and source guards close behind each layer and reach zero exemptions at
campaign completion.

## Runtime and boot sequence

`frontend/src/main.tsx:1-77` is the only production root. It initializes the theme before
paint, installs global traps, configures failure policy, and then mounts `StrictMode`,
`ErrorBoundary`, `QueryClientProvider`, and `RouterProvider`. Localization initialization
belongs after the synchronous theme controller and before `createRoot`. The React
provider belongs inside `StrictMode` and outside the application `ErrorBoundary` so the
default fallback can resolve safe catalog messages.

The recommended boot order is:

1. Initialize bundled locale resources and resolve the initial locale.
2. Apply `lang` and `dir` to `document.documentElement`.
3. Initialize theme and global diagnostic traps.
4. Mount the localization provider around the application boundary and data providers.
5. Reconcile an eventual engine-owned locale setting after the settings query resolves.

The substrate should be rooted at `frontend/src/platform/localization/` with separate
modules for initialization, typed message descriptors, render helpers, formatters, and
document-language application. English resources should live at
`frontend/src/locales/en/` and export TypeScript objects with literal types rather than
untyped JSON imports, unless the build configuration is explicitly updated for typed
JSON modules.

## Shared message contract

The descriptor must represent product meaning without importing React or stores. A
minimal shape has a typed semantic key plus bounded named primitive values. React nodes
do not cross the platform descriptor seam; rich content is composed at the leaf with the
catalog's structured-message facility.

| Existing field or seam | Current type | Target ownership |
| --- | --- | --- |
| `ActionDescriptorBase.label` | resolved `string` | required `MessageDescriptor` |
| `ActionDescriptorBase.disabledReason` | optional `string` | optional `MessageDescriptor` |
| `KeybindingDef.label` and `group` | resolved `string` | typed keys or descriptors |
| `CommandDescriptor` | inherits action strings | inherits the localized action descriptor |
| store view `label`, `title`, `message`, `description` | resolved `string` | message descriptor unless it is user data |
| React attributes and JSX text | inline English | render-time key resolution |
| wire tokens and IDs | untranslated identifiers | unchanged and never rendered as fallback |

`frontend/src/platform/actions/action.ts:51-191` currently normalizes label and metadata
as arbitrary strings and drops malformed values. The migration should replace the label
and metadata text normalizers with descriptor normalizers while leaving IDs, sections,
icons, dispatch/run exclusivity, time-travel gating, and accelerator strings unchanged.
Descriptor values need their own bounds for key length, value count, value name length,
and serialized primitive length.

`frontend/src/stores/view/commandRegistry.ts:73-205` deliberately makes a palette
command an `ActionDescriptorBase`. This inheritance is the primary convergence point:
once the action base carries descriptors, command providers, palette rows, context
menus, mobile chrome, and keyboard surfaces can resolve one message without creating a
parallel command-label type.

`frontend/src/platform/keymap/registry.ts:54-157` duplicates human-facing `label` and
`group` strings for the shortcut legend and settings recorder. The action label should
derive by shared action ID where the actions rule already requires it. Group headings
remain localization keys owned by the keymap taxonomy. Chord strings, action IDs, and
binding contexts are technical identity and remain untranslated.

## Action and menu propagation

Action strings flow through these production consumers:

- `frontend/src/platform/actions/registry.ts` normalizes resolver output.
- `frontend/src/stores/view/commandRegistry.ts` normalizes command-provider output.
- `frontend/src/stores/view/keymapDispatcher.ts` resolves and fires the live action.
- `frontend/src/app/menu/ContextMenuHost.tsx` renders labels and disabled reasons.
- `frontend/src/app/palette/CommandPalette.tsx` renders command rows and family groups.
- `frontend/src/app/menu/KeyboardShortcuts.tsx` renders shortcut labels and groups.
- `frontend/src/app/shell/MobileTopBar.tsx` uses action labels as keys and accessible
  names; it must switch React keys to stable action IDs before labels become locale
  reactive.

High-density producers include `frontend/src/app/menus/sharedActions.ts`,
`frontend/src/stores/view/commandPaletteCommands.ts`,
`frontend/src/stores/view/chromeActions.ts`,
`frontend/src/stores/view/graphControlsChrome.ts`, all production modules below
`frontend/src/app/**/menus/`, and the per-surface keybinding definition modules.
Dynamic labels such as `Timeline: Last ${preset.label}` and
`Filter by ${criterion.label}` must become complete messages with named values; the
current concatenation cannot survive translation.

A focused action-plane audit resolved 57 production files with approximately 165 to 190
authored strings. `commandPaletteCommands.ts` owns about 50 presentation sites,
`commandPalette.ts` about 30 messages or templates, `leftRailKeybindings.ts` about 22,
`sharedActions.ts` about 14, and `graphNodeMenu.ts` about 15. Upstream vocabularies in
`browserMode.ts`, `railSort.ts`, `shellLayout.ts`, `timelineDateCriterion.ts`, and
`opsActions.ts` must migrate with their consumers; leaving them as English strings only
moves the problem one module away.

`ActionDescriptor.confirm` is currently a boolean, and the palette manufactures a
generic confirmation from the action label. The descriptor needs typed confirmation
title, body, confirm action, and safe cancel action messages so destructive consequences
are explicit. `frontend/src/platform/keymap/chord.ts` also needs a display layer for
visible key names while keeping canonical chord strings untranslated identity.
Malformed chord input must never render raw as a fallback.

The migration must preserve action normalization tests and add a cross-plane test proving
that one action ID produces the same resolved label in its menu, command, and shortcut
surfaces. Existing tests that compare literal English should resolve expected copy from
the production English catalog unless the test is specifically a catalog copy contract.

## Store and presentation boundaries

The store layer contains many English view models even though it must not cache a
resolved locale. Important files are:

- `frontend/src/stores/view/graphControlsChrome.ts`, approximately 46 presentation
  strings, including titles and em-dash descriptions.
- `frontend/src/stores/view/commandPaletteCommands.ts`, approximately 28 command strings.
- `frontend/src/stores/view/leftRailKeybindings.ts`, approximately 23 shortcut strings.
- `frontend/src/stores/view/opsPanel.ts`, approximately 16 strings containing search and
  service implementation vocabulary.
- `frontend/src/stores/view/inspector.ts`, approximately 21 labels and messages.
- `frontend/src/stores/view/contextMenu.ts`, approximately 10 menu presentation strings.
- `frontend/src/stores/view/settingsControlRow.ts`, approximately 9 setting-row strings.
- `frontend/src/stores/server/queries/pipeline.ts`, `document.ts`, `gitchanges.ts`,
  `history-github.ts`, `dashboard.ts`, `listings.ts`, and `workspaces.ts`, which construct
  status, truncation, error, and empty-state sentences near the wire boundary.

Where a store must select among messages, it returns an exhaustive token-to-key mapping
or a message descriptor. Unknown tokens return a safe known descriptor, never
capitalized raw input. User data remains a string and is passed as a named interpolation
value only at render time.

## Error and diagnostic boundary

`frontend/src/platform/errors/ErrorBoundary.tsx:15-121` logs unexpected errors correctly
but renders `error.message` in development for both application and region fallbacks.
That violates the no-leak requirement and creates different user-visible behavior by
build mode. `DefaultFallback` should ignore the raw error for rendering, resolve the
appropriate safe catalog messages, and retain the error only for `componentDidCatch`
logging. Tests should render the exported production fallback directly with a real
`Error` and prove the message, stack, region ID, and diagnostic metadata are absent.

Other priority leak sites are `frontend/src/app/stage/CanvasStateOverlay.tsx`,
`frontend/src/app/stage/ProvisionPanel.tsx`,
`frontend/src/app/right/RagOpsConsole.tsx`,
`frontend/src/app/authoring/ReviewStation.tsx`,
`frontend/src/stores/view/nowStrip.ts`, and menu disabled reasons that currently expose
node, ID, tier, backend, RAG, or raw served reasons.

## Locale-sensitive formatting

Formatting replacements are required at these known sites:

- Fixed `en-US` number formatting in `frontend/src/stores/server/queries/document.ts`
  and `frontend/src/app/stage/CanvasStateOverlay.tsx`.
- Fixed `en-US` date formatting in `frontend/src/stores/view/timeline.ts`.
- Manual month arrays in `frontend/src/stores/server/queries/document.ts`,
  `frontend/src/app/timeline/timelineRangeMath.ts`, and
  `frontend/src/app/left/vaultRowPresentation.ts`.
- Hand-built relative time and plurals in
  `frontend/src/app/viewer/CommentThreadPanel.tsx`,
  `frontend/src/stores/server/searchPill.ts`, and
  `frontend/src/stores/view/hoverCardContent.ts`.
- Concatenated count copy in `frontend/src/app/kit/ActivityIndicator.tsx`,
  `frontend/src/app/left/TreeBrowser.tsx`, and
  `frontend/src/app/right/RagOpsConsole.tsx`.

Formatters should accept the active locale explicitly or come from the bound runtime;
they must not read an unrelated global at store-module evaluation time. Pure formatter
tests should use the production functions and real locale resources.

## Surface migration inventory

The mechanical audit found 1,166 candidates across 169 non-test TypeScript files, with
an estimated 650 to 800 genuine user-facing strings. The leaf migration should use these
bounded domains after shared contracts land:

1. Error boundaries, degraded states, status projections, and raw diagnostic leaks.
2. Global chrome, shared actions, menus, commands, keybindings, and accessibility labels.
3. Left rail and project/document browsing.
4. Stage, graph controls, canvas states, and provisioning.
5. Right rail, search, status, change history, and operational surfaces.
6. Authoring, editor, review, diff, comments, and confirmations.
7. Viewer, timeline, settings, onboarding, palette, and remaining shared kit copy.
8. Visual harnesses and production-like auxiliary entry points that ship user-facing
   static text.

Test files migrate with their production owner. A batch is not complete while its
rendered accessible attributes or dynamic wrappers still contain source-language text.

## Enforcement and completion evidence

`frontend/src/localization/catalog.test.ts` should import the real catalogs and validate
key sets, interpolation parameters, formatting, em-dash prohibition, sentence-case
categories, and banned internal vocabulary. The production translator tests should cover
interpolation, plural selection, formatting, locale changes, missing variables, and
missing keys without replacing resources or mutating module state.

A source scanner or ESLint rule must cover JSX text, `aria-label`, `title`, `placeholder`,
`alt`, descriptor `label` and `message` fields, static template fragments, fixed-locale
formatting, and display-label construction from unknown tokens. It must use narrow
semantic exclusions for user data, IDs, logs, test descriptions, and non-rendered
diagnostics. A broad path allowlist would hide incomplete migration and is not acceptable.

Completion requires the scanner to report zero production user-facing literals, catalog
invariants to pass, full frontend tests to pass, `just dev lint frontend` to exit zero,
and a live-origin browser check to verify visible and accessible copy across typical,
loading, degraded, empty, error, confirmation, menu, and command surfaces.
