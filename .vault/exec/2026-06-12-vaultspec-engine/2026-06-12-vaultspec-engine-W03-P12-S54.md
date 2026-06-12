---
tags:
  - '#exec'
  - '#vaultspec-engine'
date: '2026-06-12'
step_id: 'S54'
related:
  - "[[2026-06-12-vaultspec-engine-plan]]"
---

# Build the end-to-end fixture workspace with multiple worktrees and a vault corpus and exercise CLI and serve parity against it

## Scope

- `engine/tests/e2e/`

## Description

- Build the end-to-end package (workspace member `engine-e2e`) with a multi-worktree fixture landscape: main corpus plus a feature-branch worktree whose plan genuinely diverges.
- Exercise the first true multi-corpus-view path: both worktrees ingest into ONE graph under their own scopes; one node, two facets, content divergence surfaced on the edited doc and absent on the untouched one.
- CLI/serve parity (D6.1): identical node and edge id sets in identical order across the binary's graph verb and the live serve /graph/query, plus byte-stable repeated queries (identity stability clause).
- Concurrency case (DF-4 retirement): three one-shot index runs against a live serve; serve survives, /status answers, watcher reports alive (zombie detection wired this phase).
- Degradation paths: rag tier truthfully stated either way; blob-true as-of; broken lens always answers.
- REAL-repo leg (team-lead's grounding mandate): env-gated (mutates the developer repository) - run once live: temporary branch + worktree of THIS repo, vault doc diverged on-branch, two real corpus views + content divergence asserted, worktree and branch removed; repo verified clean after.

## Outcome

Every plan-verification clause exercised against fixtures, and the headline multi-branch capability proven against real git plumbing for the first time.

## Notes

Fixture repos pin core.autocrlf=false: without it Windows checkout rewrites LF to CRLF in the second worktree and every doc truthfully diverges - correct engine behavior (worktree bytes ARE the facet), wrong fixture. Worth remembering as an operator-facing footgun on autocrlf repositories. Live-rag leg folded into the degradation test (asserts available:true when the home-dir service is discovered, reasoned absence otherwise).
