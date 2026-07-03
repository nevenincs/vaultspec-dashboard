---
tags:
  - '#exec'
  - '#search-providers'
date: '2026-07-03'
modified: '2026-07-03'
step_id: 'S15'
related:
  - "[[2026-07-03-search-providers-plan]]"
---

# Add the isolated search-pill derivation test file covering species eyebrows, mechanism-free faces, and selected-state derivations

## Scope

- `frontend/src/stores/server/searchPill.test.ts`

## Description

- Add `searchPill.test.ts`, the isolated pill-derivation vectors the research
  flagged as missing.
- Species eyebrows: a vault doc shows its plain doc-type word on the doc-type
  scene-category token; a code file shows "Code" with a mono filename title and
  no feature chip; a commit shows the reserved "Change" word in the accent tone.
- Mechanism-free face: the projected view carries no `score`, and neither the
  type word nor the why-line leaks a percentage or mechanism vocabulary
  (semantic / text / rag / vector).
- Identity + selectable: a node-bearing hit is selectable and keyed by its node
  id; a node-less hit is non-selectable, keyed by source+index, and says so in
  its aria label; the list derivation preserves order and per-index keys.
- Pure helpers: `prettifyStem`, `cleanWireTitle`, `pillRelativeDate`.

## Outcome

10 pill vectors green; the file type-checks and lints clean in isolation. The
pill face's mechanism-free contract is now pinned by spec-derived tests.

## Notes

At the time of this step the shared working tree carried a concurrent teammate's
UNCOMMITTED, non-compiling edit to `queries.ts` (the worktree-picker
`WorkspaceMapPickerRowView` gaining `bareLabel`/`branchLabel`/`noVaultLabel`
inconsistently), which makes the whole-project `tsc` red on three worktree-picker
files unrelated to search-providers. That foreign WIP was NOT folded into this
commit (staged files are only `searchPill.test.ts` + this record + the plan), and
this step's own files compile and pass in isolation. Flagged to the team lead;
the full-project gate will go green once the teammate's picker change lands.
