---
name: review-revision-precedence
---

# Review-revision precedence: required revisions block all forward phase work

## Rule

When a phase review verdict is withheld or carries required revisions, the revision
commit must land and pass the reviewer's re-check before any forward phase work
begins; review service is withheld for work executed past that block, so fence-run
work is never reviewed progress.

## Why

During the dashboard GUI execution cycle (`2026-06-12-dashboard-gui` plan) the
pattern of forward velocity starving required revisions occurred three times
escalating: the P05 mock revision landed only after a hard block on P08; the P09
withheld HIGHs (real cross-scope state corruption) and a three-review-old MEDIUM
were skipped while P10 completed; and after an explicit reviewer fence plus a lead
stop-order, P11 was executed anyway — building a command palette on exactly the
arm-to-confirm and lens-scope semantics the pending revisions change. Unlanded
revisions are not bookkeeping debt: subsequent phases build on the defective
surface, converting one revision commit into multi-phase rework.

## How

- **Good:** a phase verdict arrives with two HIGHs; the executor lands the revision
  commit, pings the reviewer, gets the re-check PASS, and only then scaffolds the
  next phase's records.
- **Good:** multiple phases' findings consolidate into one revision commit when the
  reviewer explicitly batches them — the batching is the reviewer's call, never the
  executor's.
- **Bad:** completing the next phase "while the review is in flight" when the prior
  verdict said revise — the reviewer withholds the new phase's review, the work is
  unreviewed progress, and the wave ledger cannot close.

## Status

Active. Promoted after the pattern survived an explicit correction and recurred
(the codification trigger agreed between lead and reviewer on 2026-06-12).

## Source

GUI cycle rolling audit `2026-06-12-dashboard-gui-audit` (findings 018, 022, 023,
026 and the P05/P09/P11 closure record). Reviewer escalation and lead stop-order of
2026-06-12, violated by the P11 fence-run — the recurrence that fired the codify
trigger.
