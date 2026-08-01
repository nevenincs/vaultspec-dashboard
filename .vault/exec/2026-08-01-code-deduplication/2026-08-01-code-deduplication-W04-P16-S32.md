---
tags:
  - '#exec'
  - '#code-deduplication'
date: '2026-08-01'
modified: '2026-08-01'
body_schema: 'body-v1'
body_hash: 'sha256:415d51ec04af60d8bd4f8b2043c9a04b9cc5c4c87c12aa90898a705c64b9abeb'
step_id: 'S32'
related:
  - "[[2026-08-01-code-deduplication-plan]]"
---
## Description

Migrated `SegmentedToggle` and `Segment` to direct canonical `useFocusZone` use. Segment-local registration, order tracking, arrow handling, DOM focus movement, and tab-index ownership were deleted. The toggle retains only its local automatic activation policy by mapping roving changes to `onChange`.

## Outcome

- VaultSpec RAG semantic discovery returned the focused segmented-control and FocusZone ownership results from a consistent index.
- Real stateful render and primitive suites passed: 3 suites, 26 tests.
- Coverage proves disabled segments cannot retain the tab stop, are skipped by traversal, and horizontal wrap plus Home/End stay owned by the primitive.
- Scoped ESLint, Prettier, exact residue search, and scoped `git diff --check` passed.
- Scoped typecheck passed before later unrelated concurrent worktree changes.
- Independent Sol review approved.

## Notes

Evidence and scope limits are recorded above.
