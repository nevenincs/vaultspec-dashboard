---
tags:
  - '#audit'
  - '#section-scoped-operations'
date: '2026-07-11'
modified: '2026-07-12'
related:
  - "[[2026-07-11-section-scoped-operations-plan]]"
  - "[[2026-07-11-section-scoped-operations-adr]]"
  - "[[2026-06-30-agentic-spec-authoring-backend-plan]]"
---

# `section-scoped-operations` audit: `Section-scoped operations build and review closeout`

## Scope

The section-scoped-operations build and its adversarial review: the `SectionEdit` operation
kind implemented per the section-scoped-operations ADR, which delivers agentic plan phase
`W13.P45` (the section-scoped proposal operations un-deferred by operator directive). It
covers the selector schema and resolver, whole-document materialization, the conflict split,
the selected-preimage rollback inverse, and the full test coverage, plus the one adversarial
review pass over the whole build and its two hardening revisions. This closeout satisfies the
per-phase review rows (S07/S12/S16/S21) with one consolidated verdict and records that both
the feature plan (21/21) and the agentic epic (250/250) reach full closure.

## Findings

### exact-or-conflict-holds | info | the selector resolver never fuzzy-matches; every miss fails closed as a typed conflict

The core safety property holds. The resolver in `sections.rs` fails closed on a missing
anchor, an ambiguous heading with no disambiguating ancestor path, or a content-hash
mismatch, each returning a typed `SectionResolveError` and never a best-effort resolve. The
heading-path match requires a contiguous tail match against the full ancestor path so it
cannot silently resolve the wrong section, and slicing is character-boundary safe. Base drift
still blocks apply unconditionally: the `SectionSelectorUnresolved` versus
`StaleWholeDocumentDraft` split is diagnostic only, both map to the stale-base denial, and
preflight re-detects conflicts against the live worktree at apply time. The review verified
this against a real vaultspec-core round trip, not only in-memory assertions.

### materialization-and-rollback-sound | info | whole-document splice and selected-preimage restore are byte-exact and reuse the proven path

Materialization resolves the selector, captures the resolved bytes as the selected preimage,
splices the new content, and writes the whole body through the existing `SetBody` capability
folded into the `ReplaceBody` arms, with core-authoritative `ExactBlobHash` post-verify
rather than a preview-hash compare. Rollback re-resolves the anchor against the current base
and splices the selected preimage back into its resolved range, never a whole-document
clobber of concurrent edits elsewhere, degrading to an honest `rollback_available=false` plus
manual-repair hook when the section no longer resolves. Both were proven against a real
vaultspec-core apply and rollback, including a concurrent unrelated edit surviving untouched.

### two-hardening-nits-fixed | info | the review's two MEDIUM findings were fixed and re-approved

The adversarial review returned APPROVED-WITH-NITS with two MEDIUM hardening items, both
fixed and re-verified before merge. The Markdown fence toggle was tracking any fence line
rather than the opening delimiter, so a mismatched-delimiter line inside a fenced block could
close it early and expose a fenced heading candidate (never a corruption, since the
content-hash check caught any drift as an honest conflict); it now tracks the opening marker
character and run length and closes only on a matching delimiter. Separately, an R1 gap let
the non-section validators silently drop a stray `section_selector`; a typed
`UnexpectedSectionSelector` is now rejected in every other kind's validator, mirroring the
existing unexpected-payload pattern. The re-review independently re-ran the gate and confirmed
both resolved with no new findings.

### coverage-and-gate-green | info | 30 section-edit tests plus the full suite pass, gate clean

The build carries genuine coverage with no mocks: resolver unit tests for exact resolve and
each fail-closed error, materialization splice and preimage round-trip tests, live-core apply
tests against the real vaultspec-core binary including the crash-recovery indeterminate-kill
falsifier, conflict-detector tests for both branches, rollback restore and degradation tests,
and wire-level full-lifecycle plus negative-path HTTP tests. The independent gate is clean:
formatting, clippy under deny-warnings, the library suite at 697 tests, and the vertical-slices
integration binary at 12, all passing.

## Recommendations

- No blocking work. One very minor pre-existing resolver edge (a closing fence line with
  trailing content after the marker run is treated as a valid close, looser than strict
  CommonMark) is caught by the content-hash safety net and is not worth a follow-up unless a
  strict-CommonMark need appears.
- The served chunk retrieval API and the CreateDocument delete-inverse remain deferred under
  their own return triggers, unchanged by this work.
