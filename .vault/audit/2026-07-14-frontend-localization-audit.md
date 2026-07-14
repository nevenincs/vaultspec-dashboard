---
tags:
  - '#audit'
  - '#frontend-localization'
date: '2026-07-14'
modified: '2026-07-14'
related: []
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #audit) and one feature tag.
     Replace frontend-localization with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `frontend-localization` audit: `Implementation safety and UX language compliance`

## Scope

Rolling formal review of the approved localization campaign. Each completed execution
step is checked against the accepted architecture, its plan contract, repository rules,
and the user-facing language standard before dependent work advances.

## Findings

<!-- A rolling log of findings: append one subsection per finding, grouped or ordered by
     severity, using the heading form

       ### {topic} | {level} | {summary}

     followed by a paragraph carrying the detail. {topic} is a concise kebab-case slug,
     {level} is the severity (critical, high, medium, low), and {summary} is a one-line
     statement. Append continuously as findings surface; do not rewrite settled entries. -->

### recovery-verb-drift | medium | One recovery operation uses both reload and refresh

`W01.P01.S02` assigns `common.actions.reloadPage` the label "Reload page" and the
unexpected-application fallback tells the user to reload, but
`errors.fallback.contentUnavailable` tells the user to refresh the page. These phrases
describe the same page-recovery operation with different verbs. This conflicts with the
accepted requirement that one operation use one canonical verb across every message and
action, and it establishes drift in the source catalog before consumers are migrated.

### confirmation-action-contract | medium | Confirm labels are not constrained to action messages

`W01.P01.S03` types and validates `confirmLabel` as an unrestricted
`MessageDescriptor`. The public `createConfirmationDescriptor` factory therefore
accepts any catalog leaf, including error titles and explanatory body copy, as a valid
confirmation action. It can also accept non-destructive actions such as Close or Retry
for a destructive confirmation. This leaves the shared contract unable to enforce the
accepted requirement that confirmations use an explicit action label and that
destructive confirmations name their effect with a destructive verb. The cancel side
is correctly restricted at runtime to the catalog-owned Cancel action, and malformed,
inherited, accessor-backed, oversized, non-finite, and extra-field inputs otherwise
fail closed.

### nested-missing-key-leak | high | Missing nested translations can render catalog keys

`W01.P01.S117` validates only the final translated string for the requested outer key.
With a real i18next instance, a present catalog message containing a missing nested
translation such as `$t(errors:missing.detail)` resolves to user-visible text containing
`missing.detail`. The post-translation checks no longer see the nesting marker and do
not recognize the nested key because they compare only with the requested outer key.
This violates the production fallback requirement that message keys and diagnostic
translation state never reach the interface.

### interpolation-data-rejection | medium | User data resembling translation syntax is discarded

`W01.P01.S117` searches the fully interpolated result for `{{`, `}}`, and `$t(`. Those
substrings can legitimately occur in filenames, document titles, search terms, and
other user-authored interpolation values. A real i18next assertion with a user value of
`$t(user-authored)` caused a valid complete message to be replaced by the generic safe
fallback. The resolver therefore cannot distinguish unresolved catalog syntax from
preserved user data and violates the decision that user-authored content remains
untranslated data.

### runtime-resource-isolation | medium | Fresh localization runtimes share mutable resources

`W01.P01.S04` creates distinct i18next objects but passes the same mutable `resources`
object to every initialization. A targeted real-runtime assertion added a review-only
resource through one fresh instance and immediately resolved it through a second fresh
instance. The factory therefore does not provide isolated resource stores, and a test,
preview locale, or future runtime catalog mutation can contaminate the application
singleton or another consumer. This conflicts with the step's fresh-instance contract
and makes behavior depend on which runtime was created or mutated first.

### frozen-runtime-namespaces | medium | Runtime resource removal mutates a frozen namespace list

The `W01.P01.S04` remediation deep-clones resources successfully, but each instance
still receives the exported frozen `localizationNamespaces` array as its `ns` option.
A targeted call to the real i18next `removeResourceBundle` API threw `Cannot assign to
read only property '0'` because i18next updates that namespace list when a bundle is
removed. The initialization options therefore violate the installed runtime's mutability
contract and prevent the removal-isolation case required by the original review.

### formatter-runtime-totality | medium | Hostile formatter inputs can escape as exceptions

`W01.P01.S05` promises `null` for invalid formatter input, but `safeOptions` calls
reflection operations outside a protective boundary. A real production-module test
passed a Proxy-backed options object whose prototype trap throws; `formatNumber`
propagated that exception instead of returning `null`. The same unguarded option path is
shared by the date, relative-time, list, percentage, duration, and byte formatters. A
Proxy-backed array can likewise throw from the list-length or item-validation path.
Invalid values can therefore cross the formatter boundary as frontend failures rather
than safe absent presentation.

### relative-time-unit-contract | medium | Valid plural relative-time units are rejected

`formatRelativeTime` publicly accepts `Intl.RelativeTimeFormatUnit`, whose installed
TypeScript definition and real `Intl.RelativeTimeFormat` implementation accept both
singular and plural unit names. Its runtime allowlist includes only singular names. A
targeted assertion confirmed that the platform formatter returns `null` for `"days"`
while the native formatter returns `"in 2 days"`. The implementation must either
support every unit admitted by its signature or narrow the signature to the singular
unit type so callers cannot supply a compile-time-valid value that fails normalization.

### formatter-option-retention | medium | Formatter cache keys retain unbounded option strings

The formatter limits option-property count and cache-entry count, but it does not bound
string option values or reject unknown option names. Native `Intl` constructors ignore
unknown properties, so a caller can provide an arbitrarily large primitive string under
an unknown name, successfully format a value, and retain that string in a cache key.
Forty-eight entries in each of four caches can therefore retain an unbounded amount of
memory, and semantically identical configurations can churn the caches under distinct
ignored keys. This does not satisfy the step's bounded-options and bounded-retention
contract.

### formatter-locale-retention | medium | Formatter cache keys retain unbounded locale strings

The `W01.P01.S05` remediation bounds option strings and cache entry counts, but the
canonical locale remains unbounded and is copied verbatim into every cache key. A real
runtime check accepted a valid private-use BCP 47 locale containing 90,004 characters,
and the formatter implementation would retain that entire value in its cache key.
Forty-eight entries therefore do not establish a byte bound for any formatter cache.
The public boundary must reject oversized locale identifiers before canonicalization
and cache insertion.

### provider-subscription-churn | medium | Message hooks resubscribe on every render

`W01.P01.S116` passes a newly created options object to `useTranslation` whenever a
descriptor consumer renders. The installed React adapter memoizes its effective options
by the options-object identity, and its external-store subscription depends on that
memoized value. An otherwise unrelated consumer render therefore removes and re-adds
the `languageChanged` listener. This does not leave duplicate listeners behind, but it
introduces avoidable listener churn across every migrated message consumer and conflicts
with the provider step's stable application-lifetime adapter boundary. Hoist the fixed
non-Suspense options into a frozen module-level constant so subscription identity stays
stable while descriptor or parent updates rerender the consumer.

### document-listener-cleanup | medium | Failed listener removal loses cleanup ownership

`W01.P01.S118` deletes the runtime and root binding record before calling the runtime's
listener-removal boundary. If that boundary throws, the original real listener remains
registered but its ownership record is gone. A later bind creates a second listener;
releasing it removes only the new listener and leaves the original listener active for
the application lifetime. The public boundary contains the exception, but cleanup is
not recoverable and exact one-listener ownership is lost after a hostile accessor or
adapter failure.

## Recommendations

<!-- Actionable recommendations -->

### W01.P01.S01 review | pass | No findings

Commit `63db233f29` stays within the approved dependency-installation scope. The exact
`i18next` and `react-i18next` releases resolve without peer conflicts against the
project's React and TypeScript versions, npm reports no production vulnerabilities,
and a dry-run lockfile installation is stable. The execution record and completed plan
checkbox accurately trace the implementation and verification evidence.

### W01.P01.S02 review | changes required | Align the page-recovery verb

Use the canonical "Reload" verb in `errors.fallback.contentUnavailable`, consistent
with `common.actions.reloadPage` and `errors.unexpectedApplication.message`. Re-run the
catalog lint, formatting, and type checks before accepting the step. The namespace
aggregate, semantic key ownership, sentence case, diagnostic safety, implementation
scope, and execution-record traceability otherwise conform to the accepted decision.

### W01.P01.S02 remediation review | pass | Finding resolved

Commit `430066d69b` changes `errors.fallback.contentUnavailable` from "Refresh the
page" to "Reload the page", matching both `common.actions.reloadPage` and the
unexpected-application recovery message. The original canonical-verb finding is
resolved with no open findings for this step. The remediation stays within scope, its
execution record captures the review outcome, and the changed catalog passes targeted
diff, lint, and formatting checks.

### W01.P01.S03 review | changes required | Constrain the confirmation action contract

Define a catalog-derived or explicit allowlist type for confirmation action labels and
enforce the same constraint in `normalizeConfirmationDescriptor`. Destructive
confirmation descriptors must not normalize successfully with title, body, status,
error, Cancel, Close, Retry, or other non-destructive messages in the confirm-label
position. Keep the current safe Cancel allowlist and strict own-data normalization.
Add real contract tests in the planned descriptor-test step to cover both accepted and
rejected labels. Commit `bf941bb72d` otherwise stays within `W01.P01.S03` scope: its
message keys derive from the real English catalogs, runtime key membership fails
closed, primitive interpolation data is bounded without rewriting accepted values,
prototype, inherited, accessor, symbol, array, and extra-field inputs are rejected,
and the module imports neither React nor stores. Targeted ESLint and Prettier checks and
the full TypeScript 6 project check pass. The plan checkbox and execution record trace
the implementation accurately.

### W01.P01.S03 remediation review | pass | Finding resolved

Commits `e85fddb421` and `c922c6baa8` resolve the confirmation-action finding. The
English catalog now owns the semantic `destructiveActions` category, and both the
compile-time `DestructiveActionMessageKey` derivation and runtime allowlist are
generated from leaves in that category. `ConfirmationDescriptorInput` and the
normalizer reject ordinary actions, Cancel, error text, and other catalog messages in
the primary-action position. Destructive labels continue to accept bounded named
string and numeric values without rewriting them, while Cancel retains its separate
value-free allowlist. Targeted runtime assertions against the bundled production
module passed for accepted and rejected labels, as did targeted ESLint and Prettier
checks and the TypeScript 6 project check. The original medium finding is resolved and
S03 has no open findings.

### W01.P01.S117 review | changes required | Prevent nested-key leakage without rejecting user data

Commit `0b3f59a528` stays within the planned React-free and store-free fallback scope,
uses i18next `replace`, top-level numeric `count`, and string `context` options
correctly, rejects malformed descriptors and translator failures, and terminates at the
direct source-catalog fallback without recursion. The full TypeScript 6 project check
and diff hygiene pass. However, real i18next assertions prove one high-severity missing
nested-key leak and one medium-severity user-data preservation failure. Validate
interpolation and nesting against catalog-origin syntax before or independently of
substituted user values, and prove missing nested resources cannot become rendered key
fragments. Preserve arbitrary bounded user strings verbatim. Update the execution
record's safety outcome and re-run real-runtime assertions for ordinary interpolation,
plural `count`, `context`, missing nested resources, malformed translators and
descriptors, source-catalog fallback, and translation-like user data before marking the
step accepted.

### W01.P01.S117 remediation review | pass | Findings resolved

Commit `775cffb3b5` resolves both S117 findings with no open findings. The resolver now
reads the selected raw template with interpolation and nesting disabled, rejects nested,
unbalanced, malformed, excessive, or unprovided catalog tokens before normal
translation, and validates the final value without scanning substituted user data.
Targeted assertions using real i18next instances proved safe fallback for unresolved
nested keys, missing interpolation values, malformed tokens, and key echoes; verbatim
preservation of user values containing `$t(...)` and `{{...}}`; valid plural and named
interpolation; and direct source-catalog recovery when the localized fallback template
is malformed. The production module remains React-free and store-free, terminates
without fallback recursion, and passes the full TypeScript 6 project check. The updated
execution record accurately describes the defect, remediation, and temporary real-runtime
verification.

### W01.P01.S04 review | changes required | Isolate each runtime's resource store

Commit `3d28c9ebab` initializes bundled resources in the same tick with `initAsync: false`,
installs the React adapter with Suspense disabled, derives namespaces and the
public supported-locale union from the typed source catalog, and keeps boot, browser,
store, and provider authority outside the runtime module. The `CustomTypeOptions`
augmentation supplies the documented resource, default namespace, null-return, and
strict-key settings under TypeScript 6. Targeted real-runtime assertions also proved
safe output for absent keys, call-site `defaultValue`, and object-valued keys; none
exposed a key, English default, or object value. The plan checkbox and execution record
accurately trace the implemented scope. However, fresh factory instances share the
same resource object. Build a fresh resource graph for every factory call and prove
that adding, replacing, or removing a resource on one real instance cannot affect a
second instance or the application singleton. Re-run the same-tick, missing-key,
missing-interpolation, object-return, empty-result, React-option, and TypeScript checks
before accepting S04.

### W01.P01.S04 remediation review | changes required | Pass mutable option-owned namespaces

Commit `198ee673de` resolves the original cross-instance resource contamination for
additions and replacements. Real-runtime assertions proved that two factory results and
the application singleton own distinct top-level and nested resource objects, and that
adding a new nested key or replacing an existing action in one instance does not affect
either peer. `structuredClone` is available in the project's ES2023 and DOM type
libraries, supported by its Node 20-or-newer toolchain baseline, and suitable for the
bundled data-only catalog graph. One compatibility defect remains: the shared frozen
namespace array causes the installed i18next runtime to throw when removing a resource
bundle. Pass a fresh mutable namespace array in each initialization options object, then
prove add, replace, and remove operations remain confined to their owning real runtime.

### W01.P01.S04 option remediation review | pass | Findings resolved

Commit `e754e003c6` resolves the remaining namespace-option incompatibility with no open
S04 findings. Each initialization now receives fresh mutable namespace and supported
locale arrays while the exported canonical lists remain frozen. A targeted assertion
using three real runtimes proved their namespace and supported-locale option arrays are
distinct, additions and replacements remain confined to the owning resource graph, and
`removeResourceBundle` completes without throwing or changing either a second factory
instance or the application singleton. No other array-valued initialization option is
shared: resources are deep-cloned, and the remaining common options are scalars,
functions, or non-array configuration objects consumed safely by the installed runtime.
The remediation and execution record remain within S04 scope.

### W01.P01.S05 review | changes required | Close formatter input and option contracts

Commit `d970c7d93c` stays within the formatter step's source scope, accepts the locale
explicitly for every operation, keeps each `Intl` formatter cache at 48 entries, bounds
lists to 100 non-empty strings of at most 4,096 characters, rejects ordinary invalid
numbers, dates, locales, and option values, and composes durations without the optional
`Intl.DurationFormat` API. Real production-module assertions confirmed distinct
number, date, relative-time, list, and percentage output for English and German;
documented ratio behavior; deterministic duration and byte output; and continued real
formatting after more distinct configurations than a cache can retain. The plan
checkbox and execution record trace the intended implementation accurately.

Before accepting the step, make option and list normalization exception-safe, bound
retained option strings and reject unknown option fields, and align the relative-time
runtime allowlist with its public type. Re-run the real cross-locale, invalid-input,
hostile-input, option-bound, list-bound, and cache-churn assertions. The review-only
test file was removed after execution; no fake, mock, stub, patch, monkeypatch, skip, or
xfail was used.

### W01.P01.S05 remediation review | changes required | Bound retained locale identifiers

Commit `f254b1f9b2` resolves all three original S05 findings. Reflection and formatting
are exception-safe for Proxy-backed options, lists, and dates; the exported
`RelativeTimeUnit` now exactly matches the singular runtime allowlist; and explicit
family-specific allowlists reject unknown fields, accessors, symbols, oversized option
strings, and invalid values while admitting the installed TypeScript and Intl option
surface. Real production-module assertions also passed for English and German output,
percentage, duration, byte formatting, and more than 48 distinct formatter
configurations. No test double, runtime patch, skip, or expected failure was used, and
the temporary review test was removed.

One medium resource-bound defect remains. Canonical private-use locale identifiers can
be arbitrarily long, and the full identifier is retained in each cache key. Add a
documented locale-length bound before `Intl.getCanonicalLocales`, then repeat the
hostile-input, cross-locale, option, and cache-churn assertions before accepting S05.

### W01.P01.S05 locale-bound remediation review | pass | Findings resolved

Commit `4e0ace99b3` resolves the remaining S05 resource-bound finding with no open
findings. Locale identifiers longer than 256 characters are rejected before
canonicalization, and the canonical result is independently checked against the same
limit before cache insertion. A real production-module assertion accepted an exactly
256-character valid private-use locale, rejected valid 265-character and greater than
90,000-character locales, and returned `null` through every public formatter for an
oversized or hostile locale. Ordinary Unicode extensions and private-use subtags
continued to match native Intl output, while the short alias `sh` correctly expanded to
the longer canonical `sr-Latn` form.

The same assertions rechecked the singular relative-time contract, unknown and
oversized option rejection, Proxy-backed option safety, English and German output,
percentage, duration, byte formatting, and behavior after more than 48 cache entries.
All four real-module tests passed, along with targeted ESLint and Prettier checks. The
temporary review test was removed, and no fake, mock, stub, runtime patch, skip, or
expected failure was used. S05 is accepted.

### W01.P01.S116 review | changes required | Stabilize the hook subscription options

Commit `70c8ee8d8b` is otherwise a narrow adapter over the synchronously initialized
application singleton. The provider accepts only children and does not acquire locale,
document, persistence, router, query, theme, or store authority. The message hook calls
only `resolveMessage`, requests every shipped namespace, and explicitly disables
Suspense. No call-site English, raw translation output, keys, diagnostics, internal
state, or development vocabulary can escape through the reviewed path.

Two real production-module render assertions passed. A valid descriptor rendered in
the initial synchronous pass, changed safely after a real `changeLanguage` call, and
returned to the source-locale message on the next language change. A malformed internal
key rendered only the catalog-owned safe fallback. Targeted ESLint and Prettier checks
also passed, and the review-only test was removed. No fake, mock, stub, runtime patch,
monkeypatch, skip, or expected failure was used. Before accepting S116, replace the
inline `useTranslation` options object with a stable frozen constant and repeat the real
render, language-reactivity, listener-lifecycle, lint, formatting, and type checks.

### W01.P01.S116 remediation review | pass | Finding resolved

Commit `639e2cd45c` resolves the subscription-churn finding with no open S116
findings. The hook now passes module-stable namespace and frozen option references. In
the installed React adapter, effective options are memoized from the i18n and options
references, the subscription callback is memoized from the i18n and effective options,
and namespace state is memoized from the namespace elements. Unrelated descriptor or
parent renders therefore preserve the external-store subscription identity instead of
removing and re-adding the `languageChanged` listener.

A real production-module render assertion passed through an unrelated descriptor
rerender, a real language change, and a return to the source locale while retaining
safe resolver output. Targeted ESLint and Prettier checks also passed, and the
review-only test was removed. No fake, mock, stub, runtime patch, monkeypatch, skip, or
expected failure was used. The remediation adds no provider property or authority,
exposes no translator, and preserves singleton ownership, namespace coverage,
non-Suspense rendering, and safe descriptor resolution. S116 is accepted.

### W01.P01.S118 review | changes required | Preserve ownership until removal succeeds

Commit `603e222070` correctly prefers canonical `resolvedLanguage`, then canonical
`language`, then the source locale; rejects internal runtime modes and oversized or
invalid locale identifiers; clamps direction to `ltr` or `rtl`; and mutates only changed
`lang` and `dir` properties. Real i18next and happy-dom assertions passed for
left-to-right and right-to-left changes, source fallback, language fallback,
canonicalization, idempotent mutation, reference-counted release, repeated cleanup,
hostile property access, and direction clamping. The default document lookup also
contains an absent global document for server rendering, and the module emits no
visible text, log, diagnostic value, persistence, or unrelated authority. The complete
frontend lint, formatting, type, token, and Figma-name gate passed.

Before accepting S118, keep a failed-removal binding owned and retryable, or otherwise
prove that a failed removal cannot be followed by duplicate registration or an orphaned
listener. Repeat the real runtime and document assertions for normal cleanup and for a
Proxy boundary that delegates subscription to the real i18next instance but fails one
removal access. No fake, mock, stub, runtime patch, monkeypatch, skip, or expected
failure was used in this review.

### W01.P01.S244 review | pass | No findings

Commit `6c813b5be8` adds only two compact alternate catalogs and a test-owned runtime
factory under the localization testing boundary. The production locale registry remains
source-locale-only, no production module or entry point imports the fixture, and a
production build contains neither of the reviewed alternate-locale markers. The
catalogs cover both writing directions, shared namespaces, actionable fallback copy,
and named interpolation without em dashes, raw diagnostics, internal terminology, development
state, or unsafe call-site defaults.

Two targeted assertions using real i18next and react-i18next instances passed for
synchronous initialization, left-to-right and right-to-left direction, localized
lookup, named interpolation through the production safe resolver, source-locale
fallback, live language change, and isolation between separately created runtimes. The
review-only test was removed. No fake, mock, stub, runtime patch, monkeypatch, skip, or
expected failure was used. The full frontend lint gate and production build passed;
placeholder, frontmatter, and body-link checks are clean, and the plan reports only the
documented intentional identifier-order warning. S244 is accepted with no open
findings.

### W01.P01.S118 remediation review | pass | Finding resolved

Commit `c0d969b53a` resolves the listener-cleanup finding with no open S118 findings.
The final reference now retains its zero-reference binding record unless exact listener
removal succeeds. Two bounded attempts handle a transient accessor failure without
unbounded work, and the same disposer remains retryable after both attempts fail. A
later bind reuses the retained listener instead of registering a duplicate, increments
the existing reference count, and lets its disposer complete removal when it becomes
the final owner. Per-disposer state prevents repeated calls from decrementing the count
again, and registry identity and zero-reference checks guard deletion.

Three real i18next and happy-dom assertions passed for same-disposer recovery after two
failed removal accesses, later-disposer recovery without duplicate registration, and
ordinary two-owner language reactivity through a right-to-left change and final
release. Listener counts returned to zero, repeated disposal stayed idempotent, and no
fake, mock, stub, runtime patch, monkeypatch, skip, or expected failure was used. The
complete frontend lint, formatting, type, token, and Figma-name gate also passed. S118
is accepted.

### W01.P01.S06 review | pass | No findings

Commit `0ea14fb34c` mounts the application localization boundary without changing
existing authority or provider ownership. The synchronously initialized singleton is
available during module evaluation, document language binding runs before theme setup
and `createRoot`, and the provider is inside `StrictMode` but outside the application
`ErrorBoundary`. The existing `ErrorBoundary`, `QueryClientProvider`, and
`RouterProvider` nesting remains unchanged.

The hot-replacement disposer owns only the document-language subscription established
by this entry module and is absent from the production bundle. Existing theme,
diagnostic-trap, policy, query, router, and development-global behavior was not moved or
broadened. Import tracing found no cycle back into the root. The change adds no visible
copy, localization key, raw diagnostic value, log, or development status. Targeted
ESLint and Prettier checks and the full TypeScript and production Vite build passed; the
production output contains neither HMR markers nor the reviewed development globals.
The execution record and plan checkbox accurately trace S06, which is accepted with no
open findings.

### W01.P01.S07 reactivity test | high | Remove post-initialization runtime monkeypatching

Commit `e3f8f98933` passes all 13 targeted real-behavior assertions, but the provider
reactivity case directly replaces both `localization.options.supportedLngs` and the
private `languageUtils.supportedLngs` service field after initialization. That is a
monkeypatched production singleton and internal runtime configuration, which violates
the repository test rule even though `afterEach` restores the captured references and
the file runs sequentially. Prove the language transition through a normally
initialized real runtime carrying the bounded alternate resources, while continuing to
exercise the production hook or provider boundary without changing private services or
production configuration. Retain deterministic cleanup and prove the application
singleton remains on its shipped source-locale configuration.

### W01.P01.S07 regression coverage | medium | Preserve the substrate's safety bounds

The suites cover every formatter family and ordinary invalid inputs, but they do not
lock several boundaries that were required to accept the underlying steps: maximum
locale length, unknown and oversized formatter options, hostile Proxy-backed values,
resource removal and replacement isolation, nested translation rejection, and
verbatim preservation of user values containing translation-like syntax. The visible
copy helper also checks only a narrow subset of the prohibited implementation
vocabulary. Add focused assertions against the production modules for these accepted
contracts without mirroring their business logic. Keep locale-dependent expectations
portable by comparing semantic differences or native `Intl` results where exact ICU
punctuation is not part of the product contract.

Targeted Vitest execution passed all three files and 13 tests, and full ESLint,
Prettier, and TypeScript checks passed. The tests import production modules and real
resources directly and use no fake, mock, stub, skip, or expected failure. S07 requires
remediation for the runtime mutation and missing regression boundaries before
acceptance.

### W01.P01.S07 remediation review | pass | Findings resolved

Commit `391dde2d2c` resolves both S07 findings with no open findings. The React
reactivity assertion now creates a normally initialized real S244 runtime, mounts it
through the real `I18nextProvider`, and exercises the production
`useLocalizedMessage` hook across source, left-to-right, and right-to-left language
changes. It does not mutate the application singleton's language, resources, options,
or private services; the production `LocalizationProvider` retains a separate
synchronous first-render assertion. Testing Library cleanup removes the React
subscription after each case, document attributes are reset, document-language
bindings are explicitly released, and sequential execution makes the shared DOM
lifecycle deterministic.

The expanded real-module assertions now cover add, replacement, and removal isolation;
oversized and unknown formatter inputs; hostile Proxy-backed options, dates, and
lists; catalog nesting rejection; verbatim translation-like user values; invalid
descriptor metadata; raw message-key patterns; unresolved interpolation; prohibited
implementation vocabulary; and all formatter families. These assertions call the
production contracts directly and neither mirror their algorithms nor introduce a
fake, mock, stub, runtime patch, monkeypatch, skip, or expected failure.

All three targeted files and 16 tests passed. The ordinary live-engine setup first
failed because the external `vaultspec-core` environment lacks `annotated_doc`; the
same engine-independent suites then passed through the setup's documented
externally-provided-engine path. Full ESLint and TypeScript checks also passed. The
updated execution record accurately reports the hardened coverage. S07 is accepted.

### W01.P03.S13 exact-key-parity | medium | Shipped locales can retain undeclared message leaves

Commit `3f601880c0` checks that every source-derived `MESSAGE_KEYS` entry resolves to a
non-empty string in every shipped locale, but it never compares each locale's complete
leaf-key set with the source locale. A locale with every required source key plus an
obsolete, misspelled, or internal-only leaf passes all four tests. The namespace-only
aggregate comparison does not close this gap. Validate exact leaf-key parity so stale
or undeclared catalog content cannot accumulate outside the typed message contract.

### W01.P03.S13 generated-key-assertions | medium | Key uniqueness and parent checks are tautological

The uniqueness and leaf-versus-parent assertions operate on `MESSAGE_KEYS`, which the
production module creates by recursively visiting one JavaScript object. That traversal
cannot emit a duplicate path, and one object property cannot simultaneously be both a
string leaf and a parent object. The namespace membership assertion is likewise
guaranteed because both `MESSAGE_KEYS` and `localizationNamespaces` are derived from
the same `en` aggregate. These checks restate construction mechanics instead of proving
independent behavior and conflict with the repository's non-tautological test rule.
Replace them with assertions capable of failing for a real catalog-contract defect,
while keeping structural validity checks independent and avoiding mirrored production
logic.

### W01.P03.S13 review | changes required | Prove the complete catalog key contract independently

The test imports production catalogs, key guards, and a freshly initialized production
runtime directly. Its direct-resource checks are meaningful: every currently required
message resolves as a non-empty string, and the initialized source bundles equal the
exported source catalog. No fake, mock, stub, patch, monkeypatch, skip, expected failure,
catalog change, user-facing copy, or development metadata was introduced. The execution
record and plan delta remain narrowly scoped.

All four targeted Vitest cases passed, as did targeted ESLint and Prettier checks and
the full TypeScript 6 project check. Before accepting S13, add an independent exact
leaf-key parity assertion for every shipped locale and remove or replace the assertions
that are guaranteed by the current source-object traversal. Re-run the same real-runtime
and static checks after remediation.

### W01.P03.S119 interpolation parity | medium | Make compatibility coverage non-vacuous

Commit `30a6a98e2f` iterates every production key and shipped locale, but the shipped
registry currently contains only `en` and the English catalog contains no interpolation
tokens. The parity assertion therefore compares an empty set with itself for every key.
The alternate-locale case proves one complete and one missing-value resolution, but it
does not compare token contracts between the left-to-right and right-to-left resources.
Add a bounded real-resource compatibility case with at least one named token on both
sides, and assert that the case actually discovers a token, so later changes cannot
silently return this contract to a vacuous pass.

### W01.P03.S119 descriptor bounds | medium | Count distinct parameter names, not token occurrences

`catalogTemplate` compares the total number of interpolation occurrences with
`MESSAGE_VALUE_COUNT_MAX`, while the descriptor contract bounds distinct value fields.
A valid template that repeats one named value more than sixteen times would be rejected
even though it needs only one bounded descriptor value. Apply the descriptor limit to
the distinct parameter-name set. Keep a separate finite template-size or occurrence
bound if runtime cost must be constrained.

### W01.P03.S119 expected-resolution oracle | medium | Do not mirror translation option assembly

The test-owned `translationOptions` helper reproduces the production fallback
boundary's `count`, `context`, `replace`, and `returnObjects` option assembly, then uses
that duplicate as the expected oracle for `resolveMessage`. This can drift in lockstep
with assumptions in the test rather than proving the production contract independently,
and it conflicts with the repository rule that tests do not implement business logic.
Assert observable resolver behavior from the real catalogs and descriptors directly,
using explicit bounded examples for interpolation, count, and context where needed.

### W01.P03.S119 review | changes required | Strengthen the interpolation invariant

The suite imports production catalogs, descriptors, runtime, and safe resolver directly;
walks every production message key; rejects unresolved delimiters and nested-message
syntax; and exercises complete and missing interpolation through a real alternate-locale
runtime. No fake, mock, stub, patch, monkeypatch, skip, expected failure, production
catalog change, visible copy, or development-state UI was introduced. The execution
record and plan delta are narrow and accurately identify the current empty production
interpolation set.

All three targeted Vitest cases passed, as did targeted ESLint and Prettier checks and
the full TypeScript 6 project check. Before accepting S119, make compatibility
non-vacuous with bounded real resources, align the token bound with the production
descriptor's distinct-name contract, and replace the duplicated translation-option
oracle with direct observable assertions.

### W01.P03.S13 remediation review | pass | Findings resolved

Commit `eec6e256b8` resolves both S13 findings with no open findings. An explicit literal
contract now independently names every shipped locale, namespace, and required message
leaf. `MESSAGE_KEYS` must equal that contract, and a separate traversal of every raw
shipped catalog must produce the same complete set. Adding an undeclared leaf, omitting
a required leaf, or misspelling a key therefore creates a concrete set difference. The
literal keys also satisfy the production `MessageKey` type and runtime guard.

The previous uniqueness, leaf-versus-parent, and source-derived namespace-membership
assertions are removed. The remaining direct-resource checks meaningfully prove that
each explicit required key resolves to a non-empty string through a fresh production
runtime and that the initialized source bundles match the exported source catalog. The
generic test traversal only observes catalog structure; the expected key set remains an
independent oracle and does not reproduce message resolution or production key
validation logic.

All four targeted Vitest cases passed, along with targeted ESLint and Prettier checks
and the full TypeScript 6 project check. No fake, mock, stub, patch, monkeypatch, skip,
expected failure, production catalog change, user-facing copy, or development metadata
was introduced. The updated execution record accurately reports exact parity behavior.
S13 is accepted.

### W01.P03.S119 shipped-locale parity | medium | Keep the production parity guard future-active

Commit `6d5386dd25` removes the vacuous claim and makes current interpolation coverage
meaningful with real left-to-right and right-to-left resources, but it also removes all
production cross-locale token comparison. The production loop now validates syntax and
bounds independently for each template. If a second shipped locale later uses a
different distinct token set from the source template, every S119 assertion still
passes. Compare each non-source shipped locale's distinct token set with its source
template without requiring a second shipped locale to exist. The real S244 comparison
can continue to provide the present non-vacuous behavior proof.

### W01.P03.S119 remediation review | changes required | One parity guard remains

The remediation resolves the original bounds and oracle findings. Parameter limits now
apply to distinct names, and the duplicated `translationOptions` helper is removed.
Production messages without parameters resolve directly to their catalog source copy.
The real S244 left-to-right and right-to-left templates both independently discover the
`section` token, compare equal, resolve through production descriptors and fallback,
leave no unresolved delimiters, and recover with localized safe copy when the value is
missing. The test does not use a fake, mock, stub, patch, monkeypatch, skip, or expected
failure and changes no production catalog or user-facing UI.

All three targeted Vitest cases passed, along with targeted ESLint and Prettier checks
and the full TypeScript 6 project check. S119 still requires a future-active comparison
for distinct token names across shipped production locales before acceptance.

### W01.P03.S119 final remediation review | pass | Findings resolved

Commit `f5126b28ab` resolves the remaining parity finding. For every production message,
the test derives and validates the source template's distinct token set, then compares
every non-source supported locale with that set. The loop does not require an additional
shipped locale today, but becomes active automatically when one enters the production
registry. Source templates still receive malformed-delimiter, nested-message,
distinct-name count, and name-length validation.

The separate real S244 case remains non-vacuous: both left-to-right and right-to-left
resources independently discover the named `section` parameter, compare equal, resolve
through production descriptors and safe fallback without unresolved delimiters, and
produce localized recovery copy when the value is absent. Distinct names remain bounded,
and no duplicated translation-option or resolver business logic was reintroduced.

All three targeted Vitest cases passed, along with targeted ESLint and Prettier checks
and the full TypeScript 6 project check. No fake, mock, stub, patch, monkeypatch, skip,
expected failure, production catalog change, user-facing copy, or development-state UI
was introduced. S119 is accepted with no open findings.

### W01.P03.S121 internal-language coverage | high | Block the full prohibited vocabulary

Commit `0d4fba990c` does not enforce the accepted no-leakage contract for several terms
named by the architecture and research. Source messages such as "Engine unavailable",
"Token unavailable", "Adapter unavailable", "Schema unavailable", "Identifier
unavailable", "WebGL unavailable", "GPU unavailable", "CLI unavailable", and
"Implementation is difficult" receive no `prohibited-term` issue. The diagnostic guard
also misses a plain `Error:` exception prefix and common internal path or command forms.
Expand the bounded prohibited-term and diagnostic tables to cover the complete accepted
internal, development-state, diagnostic, and implementation-difficulty vocabulary. Add
direct adverse assertions for each family and safe-boundary assertions proving ordinary
words such as restore, store, webhook, and telescope do not produce substring false
positives.

### W01.P03.S121 raw-key coverage | medium | Reject every namespace-qualified key shape

The generic raw-key expression requires a dot after the namespace segment. A source
message containing an undeclared but valid namespace-qualified form such as
`common:retry` therefore receives no `raw-key` issue; checking the current
`MESSAGE_KEYS` set does not protect future, stale, or misspelled keys. Recognize the
complete bounded semantic-key shape independently of the current catalog and add
adverse cases for one-segment, multi-segment, unknown, and embedded keys without
creating substring false positives.

### W01.P03.S121 actionable-recovery | medium | Distinguish recovery instructions from failure statements

The error-message check treats any sentence whose first word is in the recovery verb
set as actionable. Text such as "Retry failed." or "Try is unavailable." passes even
though it offers no useful next action. Tighten the grammar or attach an explicit
policy classification so a recovery instruction is actually actionable, including in
multi-sentence and interpolation-bearing messages. Keep interpolation values opaque and
require the static recovery instruction itself to carry the imperative.

### W01.P03.S121 review | changes required | Close policy bypasses before rollout

The English catalog remains the sole source-copy authority, the policy map classifies
exactly every current typed key, and the production catalog passes. The static-segment
parser handles valid named interpolation without inspecting user values, malformed
delimiters remain visible to the raw-placeholder check, issue emission is finitely
bounded and deduplicated, and the tests cover every declared issue code through the
production validator without reproducing its algorithm. Current copy introduces no
user-facing development metadata.

The focused four-test Vitest suite, targeted ESLint and Prettier checks, and the full
TypeScript project check passed. No fake, mock, stub, patch, monkeypatch, skip, or
expected failure was used. S121 requires the prohibited-language, raw-key, and
actionable-recovery remediations above, plus adverse coverage for hostile and malformed
templates, multiple sentences, interpolation-leading copy, approved-term casing, and
safe word boundaries, before acceptance.

### W01.P03.S121 URI boundary | medium | Do not classify URI schemes as message keys

Commit `ea91ab33db` expands raw-key detection to a single path segment, but the generic
shape is now indistinguishable from common scheme-value forms. Text containing
`mailto:user@example.com` is classified as a `raw-key` because `mailto:user` matches,
and comparable registered URI schemes can produce the same false positive. Preserve
the required `common:retry` and unknown-key detection while excluding bounded URI and
ordinary colon forms; add direct safe cases beyond a colon followed by whitespace and
an `https` URL.

### W01.P03.S121 recovery complement | medium | Avoid a finite failure-word denylist

The remediation rejects the recorded examples, but actionability still rests on a
finite first-complement-word denylist. Failure statements such as "Retry did not work.",
"Retry will fail.", and "Try again failed." receive no `not-actionable` issue. Use a
positive bounded recovery-clause contract or explicit per-message policy instead of
trying to enumerate failure predicates. Keep the passing static imperative forms and
the rule that an interpolation value cannot itself supply the recovery instruction.

### W01.P03.S121 remediation review | changes required | Two general bypasses remain

The remediation resolves the high-severity internal-language finding: every named
architecture term, plain `Error:` prefix, reviewed path, and reviewed command form is
now rejected. Exact word boundaries preserve restore, store, webhook, telescope, and
tokenized; current production messages, approved-term casing, multiple sentences, and
interpolation-bearing safe recovery cases pass. No new catalog copy or user-facing
development metadata was introduced.

All nine focused Vitest tests passed, along with targeted ESLint and the full TypeScript
project check. No fake, mock, stub, patch, monkeypatch, skip, or expected failure was
used. S121 still requires the URI-safe raw-key boundary and a positive actionable-
recovery contract before acceptance.

### W01.P03.S121 final remediation review | pass | Findings resolved

Commit `1286c92765` resolves the remaining S121 findings. Raw-key recognition now
requires a namespace derived from the typed production key set, catches current keys
and undeclared future paths within those namespaces at any depth, and automatically
tracks a newly introduced namespace when its first typed key is added. It accepts
`mailto`, `https`, `tel`, and custom scheme-value forms as well as ordinary colon
punctuation. Matching uses isolated `matchAll` iteration, and the shared word matcher is
reset before each collection, so repeated validations are deterministic.

Recovery validation now applies a positive bounded complement grammar after the
imperative verb. It rejects every recorded failure statement, including did-not-work,
will-fail, and try-again-failed forms, while accepting the production catalog,
determiner-led objects, prepositional instructions, the bounded `again` form, and
interpolated objects. An interpolation marker cannot supply the imperative itself, and
its user value remains opaque to terminology, diagnostic, and failure checks.

All nine focused Vitest tests passed, along with targeted ESLint and the full TypeScript
project check. No fake, mock, stub, patch, monkeypatch, skip, or expected failure was
used. The complete English policy map remains catalog-owned, no user-facing copy or
development metadata was introduced, and S121 is accepted with no open findings.

### W01.P03.S14 translation bindings | high | Resolve translation calls by TypeScript symbol identity

Translation recognition is based on local spellings and the presence of a
`useTranslation` import anywhere in the module. A real fixture importing that hook but
calling an unrelated local `t`, unrelated `i18n.t`, or unrelated
`createMessageDescriptor` produced no finding for hard-coded JSX copy. Conversely, a
real aliased `useTranslation` import with a genuine translated call produced neither
`dynamic-message-key` nor `translation-default`. Resolve the hook, returned translator,
runtime translator, and descriptor factories through their actual imported and bound
TypeScript symbols. Add adverse cases for unrelated same-name values and accepted cases
for aliased imports and destructured aliases.

### W01.P03.S14 translated branches | high | Do not let one translated branch hide another branch's literal

The JSX-expression rule suppresses every collected literal whenever any nested branch
is classified as translated. A real conditional fixture of the form `condition ?
t(key) : "Hot fallback copy"` returned no findings, so source-language fallback copy
can bypass both `jsx-text` and `translated-fragment`. Report every untranslated static
branch independently and classify mixed translated expressions for conditionals and
other bounded expression forms, not only binary addition and templates.

### W01.P03.S14 generated exclusion | medium | Replace the comment-controlled production bypass with exact ownership

Any TypeScript or TSX file containing `@generated` in its first 256 characters is
excluded wholesale. A real production-shaped fixture containing that comment and
hard-coded JSX returned no findings. This is a broad, author-controlled escape hatch,
not an exact semantic owner exclusion. Restrict generated-source handling to explicit
owned paths or a checked generated manifest so adding a comment cannot disable the
guard for an arbitrary production module.

### W01.P03.S14 allowlist integrity | medium | Validate stored rule and path against the current finding

Allowlist comparison uses only each entry's ID. Although the parser requires string
`path` and `rule` fields, it neither validates the rule vocabulary and normalized source
path nor checks those fields against the current finding represented by the ID. An entry
can therefore retain an allowed ID while carrying false audit metadata and still pass.
Require an exact tuple match for ID, rule, and normalized relative path, and reject
unknown rules, absolute paths, traversal segments, and paths outside the production
source owner.

### W01.P03.S14 constant cap | medium | Enforce the declared static-part limit

`mergeParts` sets an `overflow` flag after exceeding `LIMITS.parts`, but no caller reads
that flag, truncates the collection, or rejects the scan. Template head and literal
parts are also appended without consulting the limit. The file-size and finding caps
still provide coarse global bounds, but the advertised per-expression constant-part cap
is ineffective. Stop bounded resolution at the limit and conservatively report or fail
instead of continuing with an unbounded parts array relative to that declared limit.

### W01.P03.S14 review | changes required | Close scanner bypasses before lint-gate integration

The scanner parses source without application execution, exports a guarded API, emits
all nine declared rule codes, bounds files, file bytes, depth, findings, snippets, and
allowlist size, normalizes path separators, sorts findings deterministically, and seeds
an allowlist containing only IDs, rule codes, and relative paths. The current 1,560-entry
baseline is internally ordered and the production run passed in approximately 10.5
seconds. Exact catalog, alternate-locale fixture, and central formatter owners are
present, symbolic links encountered by production traversal are refused, initialization
refuses to overwrite an existing allowlist, and new or stale IDs fail the command. The
S14 plan scope correction accurately adds the allowlist owner, and the scanner does not
duplicate S121 wording-policy vocabulary.

Real temporary TypeScript and TSX fixtures exercised all nine codes, binding aliases,
same-name false positives, mixed translated branches, and the generated marker; they
were removed after the run. The production scanner, targeted Prettier, targeted ESLint,
module import/main-guard check, and Vaultspec placeholder, frontmatter, and body-link
checks passed. No fake, mock, stub, patch, monkeypatch, skip, or expected failure was
used. S14 requires the two high-severity detection remediations and the bounded
exclusion, allowlist-integrity, and constant-cap corrections above before acceptance.

### W01.P03.S14 remediation review | pass | Scanner enforcement gaps resolved

Commit `814dde93a7` resolves every recorded S14 finding. Translation recognition now
tracks imported hook, runtime, i18next, and descriptor-factory symbols rather than local
spellings. Real fixtures proved aliased named hooks, namespace hooks, destructured `t`
and `i18n` aliases, hook-result translators, and aliased descriptor factories are
recognized, while unrelated same-name functions and receivers do not produce dynamic-key
or default-value false positives. A mixed translated conditional now emits its static
fallback as `jsx-text`.

The comment-controlled generated-source exclusion is gone; a real `@generated` fixture
remained scanned and produced a JSX finding. Allowlist validation rejects unknown rules,
absolute and traversal paths, backslash paths, and duplicate IDs, while comparison now
fails exact ID matches whose rule or relative path metadata differs. Static-part
collection checks every merge and append, and a real 65-part template failed closed with
the bounded scanner message.

The production scanner remains clean with the unchanged 1,560 exact findings and rule
counts, completing in approximately 9.1 seconds. Targeted Prettier, targeted ESLint, and
the module import/main-guard check passed. Temporary fixtures were removed, no baseline
entry changed, and no fake, mock, stub, patch, monkeypatch, skip, or expected failure was
used. S14 is accepted with no open findings.

### W01.P03.S14 confirmation composition | high | Inspect shorthand and spread descriptor fields

Commit `7feef78247` correctly distinguishes the structured argument of an imported or
aliased `createConfirmationDescriptor` from an ordinary message key. Direct static
confirmation descriptors no longer produce an object-level `dynamic-message-key`,
direct and const-referenced explicit nested descriptor keys remain inspected, all four
raw confirmation presentation fields produce `presentation-field`, and an ordinary
aliased `createMessageDescriptor` with a dynamic key still produces
`dynamic-message-key`.

However, `confirmationDescriptorFields` accepts only `PropertyAssignment` nodes. A real
valid fixture declaring `body` as a `MessageDescriptor` with a dynamic `MessageKey` and
passing it through `confirm({ title, body, confirmLabel, cancelLabel })` produced no
finding for the shorthand `body`. A spread-composed confirmation object has the same
blind spot because spread fields are not resolved. Resolve bounded shorthand properties
and const object spreads, or fail closed when a confirmation field cannot be inspected,
so valid object composition cannot bypass the dynamic-key rule.

### W01.P03.S14 confirmation follow-up review | changes required | One structured-object bypass remains

The production scanner remains clean with the unchanged 1,560-entry baseline and rule
counts, completing in approximately 7.9 seconds. Targeted Prettier and ESLint checks
passed. The real temporary fixture covered imported aliases, static structured
confirmations, direct and referenced dynamic nested keys, raw labels, ordinary dynamic
message descriptors, and shorthand composition, then was removed. No fake, mock, stub,
patch, monkeypatch, skip, or expected failure was used. The shorthand and spread
composition gap must close before this confirmation fix is accepted.

### W01.P03.S14 composed confirmation remediation | pass | Structured composition is bounded and inspected

Commit `6e5381c3f8` resolves the remaining confirmation-composition finding. Real
fixtures proved shorthand descriptors, nested const objects, and ordered spreads expose
dynamic message keys and raw presentation fields. Map-based source-order resolution
honors JavaScript override semantics: a later static descriptor replaces an earlier
dynamic field without a false finding, while a later dynamic field is rejected. Fully
static shorthand and spread composition remains clean, and an ordinary dynamic
`createMessageDescriptor` continues to produce `dynamic-message-key`.

Cyclic const composition and an unresolved confirmation producer both fail closed as a
bounded `confirmation.structure` finding without crashing. A composed object exceeding
the 64-field cap stops with the scanner's bounded constant-resolution error rather than
bypassing inspection. The production scanner remains clean with the unchanged 1,560
exact findings and rule counts, completing in approximately 9.5 seconds. Targeted
Prettier and ESLint checks passed, all temporary fixtures were removed, and no fake,
mock, stub, patch, monkeypatch, skip, or expected failure was used. The S14 confirmation
scanner fix is accepted with no open findings.
