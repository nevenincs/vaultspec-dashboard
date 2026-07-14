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
