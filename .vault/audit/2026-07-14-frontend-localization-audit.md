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
