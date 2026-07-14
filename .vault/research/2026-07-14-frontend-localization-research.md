---
tags:
  - '#research'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
related: []
---

# `frontend-localization` research: `Frontend localization and UX language standard`

The frontend currently authors English directly in components, store projections,
action descriptors, accessibility attributes, and error fallbacks. This research maps
that surface, evaluates localization runtimes, and defines the language rules required
to make user-facing copy consistent, actionable, and independent of the source locale.

## Findings

### F1 - The frontend has no localization boundary

`frontend/package.json` has no localization dependency. `frontend/src/main.tsx` mounts
React without initializing a locale runtime, `frontend/index.html` fixes the document
language to English, and the source tree contains no catalog, locale provider, message
descriptor, or translation hook. User-facing strings are therefore indistinguishable
from internal strings at the type and module boundaries.

Copy enters the interface through JSX, accessibility attributes, shared
`ActionDescriptor` fields, command and keybinding registries, store-produced view
models, presentation maps, status and error fallbacks, and schema-provided UI labels.
Representative sources are `frontend/src/platform/actions/action.ts`,
`frontend/src/stores/view/commandPaletteCommands.ts`,
`frontend/src/stores/view/graphControlsChrome.ts`,
`frontend/src/app/authoring/ReviewStation.tsx`,
`frontend/src/app/right/RagOpsConsole.tsx`, and
`frontend/src/platform/errors/ErrorBoundary.tsx`.

### F2 - The migration is a frontend-wide campaign

A mechanical inventory found 1,166 presentation-string candidates across 169 non-test
TypeScript files. After excluding stable identifiers, internal schema labels, and
diagnostics, approximately 650 to 800 are user-facing. At least 35 definite UI strings
contain an em dash, and at least 69 tests assert literal English copy. The migration
must establish shared contracts and enforcement before leaf surfaces.

The highest-risk first batch is errors, degraded states, and developer leakage. Shared
commands, actions, keymaps, and menus form the next dependency layer because one
operation must retain one descriptor and one wording across every eligible surface.
Derived presentation strings and primary React surfaces follow in bounded domain
batches. Technical graph-lab labels remain internal unless exposed by a production
`uiLabel` or description.

### F3 - Locale-bound strings must not be cached in stores

The architecture rules keep wire access in `frontend/src/stores/` and make app chrome a
rendering leaf. Stable wire tokens and user data must remain untranslated. Translating
inside stores or query caches would leave stale copy after a locale change and couple
presentation to the wire layer. Non-React seams therefore need typed message
descriptors containing a semantic key and named values; React consumers resolve those
descriptors at render time.

Shared action identity remains keyed by its existing action ID, while its label,
description, and disabled reason become message descriptors rather than duplicated
strings. A selectable language preference, if shipped, must use the engine-owned
settings registry rather than frontend-only persistence.

### F4 - A mature runtime is preferable to a bespoke dictionary

Three approaches were evaluated:

- A bespoke typed dictionary minimizes dependencies but would recreate interpolation,
  plural rules, fallback, rich content, locale events, and formatting.
- Compile-time extraction provides strong catalog tooling but adds build-system and
  generated-file complexity before stable message boundaries exist.
- `i18next` with `react-i18next` supports typed resources, strict key checks,
  interpolation, pluralization, namespaces, locale fallback, React reactivity, and
  non-React translation from one runtime.

The official `i18next` v26.0.2 and `react-i18next` TypeScript examples document
resource-derived key types and strict key checking. This is the recommended foundation.
It should initialize before `createRoot`, ship a complete English catalog as the source
locale, update the document `lang` and `dir` attributes, and expose no user-facing
missing-key fallback. English `defaultValue` text at call sites is prohibited because
it preserves hot-typed source copy.

### F5 - Formatting is part of localization

The frontend contains fixed `en-US` formatting, manual English month arrays, hand-built
relative dates, string concatenation, and singular or plural branches. Examples include
`frontend/src/stores/server/queries/document.ts`,
`frontend/src/app/timeline/timelineRangeMath.ts`,
`frontend/src/app/left/vaultRowPresentation.ts`, and
`frontend/src/app/viewer/CommentThreadPanel.tsx`. Numbers, dates, durations, lists,
percentages, byte sizes, and counts must use locale-aware formatters and complete
catalog messages. Punctuation and word order stay inside the message; components may
not concatenate translated fragments.

### F6 - UX language needs one binding grammar

Every user-facing label, menu item, command, heading, status, tooltip, and accessible
name uses sentence case, except for proper nouns and acronyms. Actions begin with a
clear imperative verb such as Open, Close, Add, Remove, Copy, Show, Hide, or Retry. The
same operation uses the same verb and wording everywhere. An ellipsis is used only when
an action opens a flow that requires more input.

Compact statuses are short sentence-case phrases without terminal punctuation. Error
copy states what could not be completed and gives a useful next action. Destructive
confirmations name the irreversible effect and use an explicit destructive action such
as "Discard changes", never "OK", "Yes", or "Confirm". Em dashes are prohibited;
separate ideas with sentences, commas, colons, or parentheses.

Internal vocabulary and diagnostic state never appear in general UI copy. This includes
backend, frontend, engine, RAG, tier, wire, schema, token, adapter, seam, WebGL, GPU,
CLI, raw enum values, identifiers, exception text, command lines, internal paths,
development controls, and implementation difficulty. The screen names the user-visible
concept and effect instead. Diagnostic detail belongs in structured logging only.

### F7 - Enforcement must cover more than JSX text

A catalog invariant test should validate key completeness, interpolation parameter
parity, successful formatting, prohibited punctuation, and prohibited development
vocabulary. A static source guard should reject untranslated JSX text, accessibility
attributes, placeholders, titles, shared descriptor fields, and static fragments in
template expressions outside approved catalog and diagnostic modules. It must
distinguish stable identifiers and user data from rendered static copy.

Real-behavior tests should import the production catalog and translator directly,
render production components with production data seams, and exercise a live
`vaultspec serve` origin. They must prove that no message key, unresolved placeholder,
raw exception, stack trace, internal status token, or development control reaches
visible or accessible UI. Mocks, fakes, stubs, patches, `skip`, and `xfail` are not
acceptable shortcuts.

### F8 - The decision has architectural blast radius

The change adds platform dependencies and bootstrapping, alters action and store
presentation contracts, replaces error handling and formatting behavior, and may add a
persisted language setting. It requires an ADR before planning and must remain
compatible with the accepted terminology-standardization, dashboard-settings,
keyboard-action-system, state-mode-uniformity, and worktree-switcher-identity decisions.
