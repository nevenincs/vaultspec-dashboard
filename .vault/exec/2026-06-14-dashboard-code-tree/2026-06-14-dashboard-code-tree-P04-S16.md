---
tags:
  - '#exec'
  - '#dashboard-code-tree'
date: '2026-06-14'
modified: '2026-07-12'
step_id: 'S16'
related:
  - "[[2026-06-14-dashboard-code-tree-plan]]"
---

# Run the feature-scoped lint, test, and vault-check gates to green

## Scope

- `engine/crates/vaultspec-api/`

## Description

- Run the feature-scoped lint, test, and vault-check gates to green, distinguishing owner-surface results from unrelated peer breakage in the shared `main` worktree.

## Outcome

- Backend: `cargo build`/`test`/`clippy --all-targets` for `vaultspec-api` + `ingest-git` + `engine-model` all pass (clippy: zero warnings; tests: all green including the 5 file-tree integration + 6 ingest-git unit cases).
- Frontend: `tsc -b` clean; `eslint` clean on every touched/new file; `prettier --check` clean (after formatting the two new files); `vitest run` full suite 845 passed / 9 pre-existing skips / 0 failed.
- Vault: `vault check features --feature dashboard-code-tree` clean. The full-tree `vault check all` reports 1 ERROR — `.vault/adr/2026-06-14-worktree-parse-performance-adr.md` "ADR has no references to research documents" — which is PEER work (the worktree-parse-performance feature), entirely outside the code-tree surface.

## Notes

- OWNER-vs-PEER distinction (full-tree gate honesty): the single hard vault-check ERROR is a peer ADR, not a code-tree document; the only code-tree mention in the full check is a non-blocking "Template annotations remain: 16 HTML comment blocks" WARNING on the plan (cosmetic, a `vault sanitize annotations` candidate, pre-existing from scaffold). No owner-surface gate is red.
- The shared backend dependency tree compiles and tests green WITH the deferred entangled edits applied in the working tree; a hypothetical isolated checkout of only the committed code-tree-exclusive files would not compile until the deferred registration edits land, which is the inherent and accepted consequence of the operator's stay-on-main / defer-entangled policy for this shared worktree.
