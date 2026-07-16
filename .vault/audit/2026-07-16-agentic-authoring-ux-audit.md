---
tags:
  - '#audit'
  - '#agentic-authoring-ux'
date: '2026-07-16'
modified: '2026-07-16'
related:
  - "[[2026-07-16-agentic-authoring-ux-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #audit) and one feature tag.
     Replace agentic-authoring-ux with a kebab-case feature tag, e.g. #foo-bar.
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

# `agentic-authoring-ux` audit: `wave W01 detangle and unify review` | APPROVED

## Scope

Independent code review of Wave W01 (the detangle/unify phase) of the
agentic-authoring-ux epic against the accepted ADR's D5 (kill the sign-in gate,
ambient provenance, ungate/rename Review) and D7 (one diff primitive). Reviewed:
the new `DiffView` primitive and both its call sites; the deleted
`ReviewerIdentity` gate and the ambient `ensureActorToken` mint; the Review
dialog rename/ungate; the no-signin guard; and the localization plane for the
deletions/renames. Reviewer-verified independently: tsc, eslint, and targeted
vitest across the diff/identity/guard/vocabulary suites (all green, no wire
mocks). This is a rolling audit for the whole epic; W01 is the first entry.

## Findings

### diff-primitive-unified | none (confirmed) | D7 correct — one line-diff implementation, both sources proven one component

Exactly one `diffLines`/`diffStat` implementation survives (`diffLines.ts`); the
embedded `DiffLinesView` duplicate is gone. `DiffView.tsx` is genuinely
source-agnostic — the in-editor site (`MarkdownDocView.tsx`, `source="draft-vs-
saved"`, a 4-line import swap leaving the `Mod+Alt+G` toggle/debounce/highlighting
untouched) and the proposal `DiffPanel` (`source="proposal-preview"`) both mount
it unchanged. `DiffView.render.test.tsx` renders both sources back-to-back and
asserts `data-diff-source` flips while the grammar stays identical — a real
single-component proof. The deleted `DiffPanel.render.test.tsx` coverage
(add/remove/context, tally, honest truncation, empty state, highlighting)
reappears verbatim in `DiffView.render.test.tsx`. No coverage lost.

### sign-in-gate-removed | none (confirmed) | D5 correct — no token-throw survives on any review path

Zero `ReviewerIdentity`/`hasToken` gating remains on any action; every
`ActionButton` disables purely on served `!eligibility.allowed`. `ensureActorToken`
mints once, caches, and dedupes concurrent callers via a shared in-flight promise;
all four review mutations route through it, so Approve/Reject/Submit/Apply/Rollback
work with zero prior editing (the original bug). The retained throwing
`requireActorToken` is used ONLY by `useCreateProposal`, which has no production
call site yet (the composer that will call it is W02) — not a hidden gate on any
live review path. The `noSigninVocabulary` guard has teeth (strips comments, scans
production incl. catalogs, phrase-match excluding camelCase) and every sign-in
string was deleted in lockstep across all localization planes. The
Approvals→Review rename is consistent across en/fr/ar.

### orphaned-approvals-keys | low | dead `common:actions.showApprovals`/`hideApprovals` pair, pre-existing

`locales/en/common.ts:59,79` carry an unwired `actions.showApprovals`/
`hideApprovals` pair with zero production call sites (the live consumer is the
separate `controlPanels.actions.*` namespace this wave renamed). It predates W01
(this branch touched only the `controlPanels.*` namespace) and is not a regression,
but sits adjacent to the rename. **Follow-up cleanup task, non-blocking.**

### foreign-suite-failures | none (W01) | three tree failures confirmed as the parallel localization lane's, not W01

`catalogInterpolation.test.ts` (unexpectedSection `{{section}}` token),
`MarkdownDocView.render.test.tsx` (label-casing "Document body editor"), and
`messagePolicy.test.ts` (`finalWave.planSteps.named`) all fail on files W01 never
touched (confirmed by diff). Pre-existing parallel-lane localization inconsistency
in the shared tree, tracked to that lane, not this wave.

## Recommendations

- W01 APPROVED, no required revisions — safe to proceed to W02.
- Follow-up (LOW): delete the orphaned `showApprovals`/`hideApprovals` key pair
  and its policy/allowlist entries when a wave next touches the generic actions
  catalog (avoid churning it standalone mid-flight for the localization lane).
- The three foreign suite failures belong to the localization-migration lane;
  do not attribute them to this epic at closeout.

## Recommendations

<!-- Actionable recommendations -->
