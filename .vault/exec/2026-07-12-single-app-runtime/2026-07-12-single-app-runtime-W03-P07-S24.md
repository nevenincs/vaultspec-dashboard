---
tags:
  - '#exec'
  - '#single-app-runtime'
date: '2026-07-12'
modified: '2026-07-17'
step_id: 'S24'
related:
  - "[[2026-07-12-single-app-runtime-plan]]"
---

# Serve a bounded, bearer-gated, read-only directory-listing route (filesystem roots plus one directory level, directories only, capped count, vaultspec-managed and git markers) through the shared envelope, with adverse coverage (tokenless refusal, non-directory refusal, cap honored)

## Scope

- `engine/crates/vaultspec-api/src/routes/fs_browse.rs`

## Description

- Add bearer-gated GET `/fs/list` (`routes/fs_browse.rs`): no param lists filesystem roots (Windows drive letters, `/` elsewhere); `?path=` lists one level of SUBDIRECTORIES only, name-sorted, capped at 256 rows with `truncated` stated, each row carrying `is_managed` (.vault) and `is_git` markers; unreadable children skipped silently; absolute-existing-dir validation with tiered 400s.
- Registered in `CONTRACT_ROUTES` and `API_PREFIXES` (the bearer anti-drift guard passes); unit tests cover directories-only sorting + markers, the stated cap, and roots.

## Outcome

The add-project picker's server half exists: bounded, read-only, envelope-conformant browsing of the operator's own machine.

## Notes

Read-only metadata within the same trust boundary the add_workspace path seam already extends; no traversal surface beyond what the operator can already type.
