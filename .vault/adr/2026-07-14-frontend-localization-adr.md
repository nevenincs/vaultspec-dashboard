---
tags:
  - '#adr'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
related:
  - "[[2026-07-14-frontend-localization-research]]"
---

# `frontend-localization` adr: `Adopt typed locale catalogs and one UX language grammar` | (**status:** `accepted`)

## Problem Statement

The production frontend has no localization boundary. English is authored directly in
components, store projections, action descriptors, presentation helpers, accessibility
attributes, and error paths. The same operation is named differently across surfaces;
capitalization drifts; messages concatenate English fragments; and raw implementation
state can reach the screen. This decision establishes one localization runtime, one
message-ownership model, and one binding UX grammar before the campaign migrates every
user-facing string.

## Considerations

- Stable engine tokens and user-authored corpus content are data, not translations. The
  engine remains free of locale-specific display vocabulary.
- Stores remain the sole wire client. Locale-bound strings must not be cached in query
  data, Zustand state, or selectors because a locale change must update the UI without a
  refetch.
- The existing one-action-per-ID contract must survive. Menus, keybindings, palettes,
  and context actions cannot translate or rename the same operation independently.
- Accessibility names, placeholders, live-region text, canvas-adjacent copy, errors,
  statuses, and disabled reasons are user-facing and in scope.
- The accepted terminology standard remains authoritative for product concepts. This
  decision changes how its words are stored and resolved, not stable wire identity.
- The campaign must be incrementally shippable while preventing new hard-coded strings.

## Considered options

- **Bespoke typed dictionary.** Small initial dependency surface and exact control over
  keys, but it recreates plural categories, fallback, rich content, locale events,
  directionality, formatting, and translator tooling. Rejected.
- **Compile-time extraction.** Strong catalog validation and generated types, but it
  adds extractor and build-system complexity before stable message boundaries exist.
  Deferred as a possible later optimization.
- **`i18next` with `react-i18next`.** Provides React reactivity, typed resources,
  namespaces, interpolation, pluralization, locale fallback, rich messages, and a
  non-React runtime. Chosen with strict project-owned guards.

## Constraints

- The React 19 and TypeScript 6 application must initialize bundled source-locale
  resources before `createRoot`; the initial render cannot expose keys or flash a second
  language.
- Missing-key behavior must fail safely in production. A message key, raw wire token, or
  English call-site default is never an acceptable user-facing fallback.
- The action, keymap, settings, and state-mode parent systems are mature and binding.
  Their identity and data authority remain unchanged while display fields migrate.
- A persisted locale preference may be added only through the engine settings registry.
  The initial platform substrate may use the source locale without introducing a dead or
  frontend-only setting.
- Existing unrelated work in the shared worktree must be preserved; migration phases
  must use narrow ownership fences.

## Implementation

**D1 - One platform localization runtime.** `i18next` and `react-i18next` form the
runtime under `frontend/src/platform/localization/`. Bundled English resources initialize
synchronously before the application mounts. Locale changes update the document `lang`
and `dir` attributes and reactively rerender consumers.

**D2 - Semantic typed keys, never English keys.** Source references stable semantic
keys grouped by product-domain namespaces. English lives only in locale resources under
`frontend/src/locales/en/`. Resource-derived TypeScript types and strict key checks make
unknown static keys compile-time failures. Call-site `defaultValue` English and dynamic
key construction are prohibited.

**D3 - Translate at the rendering boundary.** React surfaces resolve messages during
render. Non-React action, keymap, store-view, and presentation seams carry a typed
`MessageDescriptor` containing a key and optional named values. Stores retain raw state
and non-linguistic presentation semantics; they never cache translated strings.

**D4 - Shared actions keep one localized descriptor.** Each action retains one stable ID
and one descriptor across eligible planes. Its label, description, confirmation copy,
and disabled reason use message keys or descriptors. A surface may not rename or
translate the action independently.

**D5 - Complete messages own dynamic grammar.** Static copy with dynamic values is one
catalog message using named interpolation, plural, or select rules. Components do not
concatenate translated fragments. Rich React content uses the runtime's structured rich
message facility. Document titles, paths, branch names, filenames, and user-authored
content remain untranslated data.

**D6 - Formatting follows the active locale.** Numbers, dates, relative times, lists,
durations, percentages, byte sizes, and counts use centralized locale-aware formatters.
Fixed `en-US` formatting, manual English month arrays, and hand-authored singular or
plural branches are removed from production presentation code.

**D7 - One binding UX language grammar.** All interface copy uses sentence case except
proper names and established acronyms. Actions begin with a clear imperative verb, and
the same operation uses the same verb everywhere. Compact statuses are short phrases;
errors identify the failed user action and provide a useful next action; destructive
confirmations name the irreversible consequence and use an explicit destructive verb.
An ellipsis appears only for ongoing activity or an action that requires more input.
Em dashes are prohibited.

**D8 - No implementation or diagnostic leakage.** Raw exceptions, stack traces, route
names, tier identifiers, schema keys, action IDs, wire tokens, service lifecycle state,
command lines, internal paths, development controls, and implementation difficulty never
render as general UI copy. Known typed conditions map to localized messages. Unknown
conditions use a safe localized fallback; diagnostic detail goes only to structured
logging.

**D9 - Migration is dependency-ordered and enforcement closes behind it.** The campaign
lands the runtime, descriptors, formatters, and catalog tests first; migrates shared
actions and store presentation seams next; then migrates production domains in bounded
batches; removes unsafe fallbacks and manual formatting; and finally enables a full
source guard. Temporary allowlists must name exact locations, shrink monotonically, and
cannot exempt new strings.

**D10 - Validation proves language independence.** Catalog tests validate key and
interpolation parity, plural formatting, prohibited punctuation, and prohibited internal
vocabulary. Static analysis covers JSX text, accessibility attributes, placeholders,
titles, shared descriptor fields, and static template fragments. Production component
tests use the real provider and catalogs. A live-origin browser test proves that keys,
placeholders, raw errors, tokens, and development controls do not reach visible or
accessible output. No mocks, fakes, stubs, patches, `skip`, or `xfail` are used.

**D11 - Locale preference follows settings authority.** When user selection is exposed,
the preference is declared in the engine-owned settings registry and consumed by the
localization platform. A synchronous local cache may prevent first-paint language flash,
but it is not an independent authority.

## Rationale

The research found hundreds of user-facing strings distributed across architectural
layers and showed that a leaf-only replacement would leave the sources of drift intact.
A mature runtime solves language mechanics, while typed descriptors preserve the
project's store and action boundaries. Rendering-time resolution is the only design that
supports reactive locale changes without contaminating wire state. The explicit UX
grammar makes localization a quality boundary rather than a mechanical relocation of
inconsistent English.

## Consequences

- Every static user-facing string gains an auditable catalog owner and stable semantic
  key. The same command can no longer silently diverge across menus and palettes.
- Additional locales can be added without restructuring React components, stores, or
  actions. Locale-aware grammar and formatting are available from the first migration.
- The migration touches a broad surface and will temporarily carry a shrinking inventory
  of known literals. Enforcement is only complete when that inventory reaches zero.
- Message descriptors add types to shared presentation contracts; careless translation
  inside stores would still create stale copy and is a review-critical regression.
- Strict missing-key behavior requires deliberate safe fallbacks so a catalog defect
  never exposes a key or suppresses an essential recovery action.
- Copy changes will require visual and accessibility review because translated strings
  vary in length and rich messages can change DOM structure.

## Codification candidates

- **Rule slug:** `user-facing-copy-comes-from-typed-locale-catalogs`.
  **Rule:** Every static user-facing string, including accessibility and dynamic wrapper
  copy, resolves from a typed semantic localization key; source code does not author
  English fallbacks, concatenate translated fragments, or manufacture labels from raw
  tokens.
- **Rule slug:** `ux-language-has-one-grammar`.
  **Rule:** User-facing copy uses sentence case, stable imperative action verbs, short
  actionable messages, explicit destructive wording, no em dashes, and no internal or
  diagnostic vocabulary.
