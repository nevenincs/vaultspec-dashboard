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
