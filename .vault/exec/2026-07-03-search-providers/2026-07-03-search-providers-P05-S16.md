---
tags:
  - '#exec'
  - '#search-providers'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S16'
related:
  - "[[2026-07-03-search-providers-plan]]"
---

# Update the existing suites for the new shapes: the search controller fallback fold, the document controller thin consumer, the palette guard and render tests, and the keymap coverage guards for the deleted action

## Scope

- `frontend/src/stores/server/*.test.ts + app/palette tests`

## Description

- Add the positive document-controller thin-consumer live test: render
  `useDocumentSearchController` against the real engine and assert it is idle on
  an empty query and, on a real query, settles to a ready listing backed by the
  files(vault) provider — every hit a navigable `doc:` document (never a code
  node), `count` matching the results length.
- Confirm the other named suite updates already landed with their driving code
  changes (each step had to stay green): the search-controller fallback-fold
  vectors (P03.S09), the document-controller scanner-removal trim (P04.S13), and
  the palette/keymap coverage guards for the deleted focus-search action
  (P04.S14).

## Outcome

The document controller's thin-consumer wiring is now positively pinned (3 tests
green). Every S16-named suite reflects the new shapes; the full frontend suite was
green at 2623 tests when last runnable (after P04.S14, before the foreign
`queries.ts` breakage below). This is the last step of the feature I own; S17
(live end-to-end verification), the mandatory review, and the phase summaries are
the team lead's.

## Notes

The whole-project `tsc` gate is currently RED because of a concurrent teammate's
UNCOMMITTED, mid-refactor edit to `queries.ts` (the worktree-picker
`WorkspaceMapPickerRowView` and a `useLocationAnchor`/`deriveLocationAnchor`
rename), breaking `WorktreePicker.tsx`, `StatusTab.tsx`, and two picker tests —
all unrelated to search-providers and outside my import chain. That foreign WIP
was NOT folded into this commit; my files type-check and this step's suite passes
in isolation (esbuild transpiles per file). The full-project gate will go green
once the teammate's picker/location refactor lands; flagged to the lead so S17 is
run against a compiling tree.
