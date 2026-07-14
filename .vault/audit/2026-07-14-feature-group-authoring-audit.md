---
tags:
  - '#audit'
  - '#feature-group-authoring'
date: '2026-07-14'
modified: '2026-07-14'
related:
  - "[[2026-07-14-feature-group-authoring-plan]]"
  - "[[2026-07-14-feature-group-authoring-adr]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #audit) and one feature tag.
     Replace feature-group-authoring with a kebab-case feature tag, e.g. #foo-bar.
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

# `feature-group-authoring` audit: `feature-group document creation closeout`

## Scope

Closing audit for the feature-group document-creation epic: plan 14/14
executed across five phases (Figma design, engine coverage projection,
stores seam, panel build, relabel/guards/gate), each code phase reviewed by
an independent adversarial reviewer before its commit (commits `9fd9397ff2`,
`00236b7c35`, `c60d9225ab`, `6b3c8514e8`, `f5fd80d616`). This audit
consolidates the four phase reviews into the feature's rolling findings log
and records what remains open. Verification totals: engine 11 projection +
4 route + 1 memo tests; frontend 15 dialog render tests (live engine over
the fixture vault), 52 stores tests, 135-test feature sweep; full frontend
and Rust lint gates exit 0 at S14 run time.

## Findings

### keymap-arrow-leak | high | RESOLVED - radiogroup arrows leaked to the global keymap dispatcher

Found by the P04 review (initial verdict WITHHELD): the type radiogroup's
consumed Arrow keys called preventDefault without stopPropagation, so roving
the document-type list also fired the global nav commands and mutated the
graph selection. Fixed in the P04 revision (stopPropagation on consumed
keys), locked by a non-tautological regression test (window-spy with a live
control assertion). Re-check APPROVED.

### degraded-state-test-gap | medium | RESOLVED - loading vs degraded distinctness untested

Found by the P04 review: no test pinned the coverage card's honest-state
branching, the gap that let the keymap leak ship undetected. Resolved in
the same revision: three mutually-exclusive coverage-card state tests
(loading, degraded, served-all-missing) over the production view reducer.

### submission-not-self-gated | medium | RESOLVED-BY-DESIGN - the store submission derivation does not consult eligibility

Found by the P03 review as a briefing hazard: `deriveCreateDocSubmission`
deliberately does not self-gate on served eligibility (the ADR makes gating
presentational), so the panel MUST gate submit. P04 gated every submit path
on `isCreateDocTypeEligible` and the review verified all three paths; a
render test asserts an ineligible type is unsubmittable. The store-level
behavior remains intentional and documented.

### exec-in-missing | low | RESOLVED-BY-BRIEFING - served `missing` honestly includes exec

Found by the P02 review: the projection's `missing` list includes exec,
which is never creatable from the panel (plan-derived). Carried as a hard
advisory into P04: creation affordances render only from
`deriveOfferedCreateDocTypes`; the P04 review verified exec unreachable in
every creation path. The served data stays honest by design.

### coverage-cold-first-read | low | RESOLVED - memo comment implied warming that does not happen

Found by the P02 review: the coverage memo is deliberately not in the warm
set (panel-triggered surface), but its comment implied otherwise. Comment
corrected in-session to state the lazy choice; behavior unchanged.

### divergent-absent-floors | low | OPEN (recorded, harmless) - adapter and store fallbacks disagree on absent-coverage eligibility

Found by the P03 review: the live-adapter's all-missing floor marks
research/reference ineligible while the chrome-store fallback marks them
eligible; the tiers-suppressed view means the store fallback governs and
the panel renders entry points eligible during degradation (reasonable),
but the adapter comment claims a conservative floor that is effectively
dead on the panel path. Cosmetic-comment/consistency cleanup candidate.

### transient-scan-accumulator | low | OPEN (parity-of-record) - the projection's transient scan map is unbounded pre-cap

Found by the P02 review: the build-time accumulator holds one entry per
feature/type pair before the 500-feature cap applies, the exact precedent
of the filter-vocabulary projection. Corpus-bounded in practice; recorded
for parity with the resource-bounds letter, no change requested.

### row-menu-featureless | low | OPEN (named follow-on) - per-document row menus open the panel blank

The vault-doc entity carries no feature field, so the per-document context
menu cannot pre-answer stage 1; deriving the feature from the stem was
rejected as fragile. Entity plumbing (serving the feature tag on the doc
row) is the honest fix, recorded in the S11 step record.

### next-step-test-gap | low | OPEN (future test) - out-of-order corpus case unpinned

Named by the P02 review: an adr present with no research/reference should
serve next_step research while adr reports present - correct by inspection,
untested. A cheap projection unit test next time the module is touched.

### foreign-lane-gate-drift | low | OPEN (out of scope) - concurrent lane WIP flaps the aggregate gate

The shared worktree carries a concurrent session's uncommitted authoring
decomposition plus new prettier-dirty panel files; these broke the
`vaultspec-api` lib test binary after this feature's gates ran green and
flip the aggregate lint recipe red at times. Every error is outside this
feature's lane; this feature's files are individually verified clean and
its integration tests ran green before the drift. Owned by the foreign
lane; noted so the next reader does not attribute the red gate here.

## Recommendations

- Land the entity plumbing that serves a document row's feature tag, then
  let the per-document menu pre-answer stage 1 (row-menu-featureless).
- Add the out-of-order next_step projection unit test on the next
  `engine-query` features touch (next-step-test-gap).
- Align the live-adapter absent-coverage floor (or its comment) with the
  store fallback so the two stop claiming opposite intents
  (divergent-absent-floors).
- Consider adaptive warming for the coverage memo only if real usage shows
  the cold first read on large corpora is felt in the panel.
- The plan-surface exec scaffold (step picker over `--step`) remains the
  named follow-on from ADR D4 for restoring exec creation properly.
