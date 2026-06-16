---
tags:
  - '#exec'
  - '#review-rail-viewers'
date: '2026-06-16'
modified: '2026-06-16'
step_id: 'S04'
related:
  - "[[2026-06-16-review-rail-viewers-plan]]"
---




# Degrade the structural tier on an unreadable worktree and return a tiered 400 on traversal or missing path via degraded_tiers_for and api_error

## Scope

- `engine/crates/vaultspec-api/src/routes/content.rs`

## Description

- Add `content_error` mapping each resolution failure to the right tiered response: malformed id, traversal, and non-content node kinds are tiered 400s; an unknown doc stem or missing-at-ref path is a tiered 404.
- Degrade the structural tier honestly via `degraded_tiers_for` when the worktree substrate cannot read the resolved path, returning a tiered 400 with the structural reason rather than a bare 500.

## Outcome

The 400-vs-degrade split mirrors the file-tree route. Tests confirm a traversal 400, a structural degradation on an unreadable path, an unknown-stem 404, and a non-content-node 400, all carrying the tiers block.

## Notes

None.
