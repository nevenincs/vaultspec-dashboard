---
tags:
  - '#audit'
  - '#worktree-enumeration-sweep'
date: '2026-06-16'
modified: '2026-06-22'
related:
  - "[[2026-06-16-worktree-enumeration-sweep-plan]]"
---



# `worktree-enumeration-sweep` audit: `path-only enumerate migration review`

## Scope

The `worktrees::list_roots` primitive and the migration of the four path-only
worktree callers off `enumerate` (`validate_scope_token`, CLI `Ctx::resolve`, the
registry register route, the serve-boot launch-root resolver), reviewed
independently and measured on the 67-worktree aeat workspace. First wave of the
backend implementation campaign.

## Findings

### Verdict: PASS (no revisions required, merge-ready)

The reviewer verified each of the four migrated callers is semantically identical
to its `enumerate`-based predecessor:

- **`validate_scope_token`:** same `normalize(scope_token(&path))` match, same
  `.vault` check, both error messages preserved; canonicalization parity holds
  (`list_roots` canonicalizes the same descriptor `workdir` `inspect` did).
- **`Ctx::resolve`:** exact-or-prefix `clean_path` match and `BadScope` error
  preserved; `root` rebinding to the found path is correct.
- **register route:** `is_empty()` parity.
- **serve-boot resolver:** `//?/`-strip + slash-normalize prefix match and
  `.unwrap_or(cwd)` fallback preserved.
- **`list_roots`:** reuses the shared cheap `collect_descriptors` phase, no
  inspect, order preserved; unit test asserts path-set equality with `enumerate`.
- **Rules clean:** `engine-read-and-infer` (strictly less I/O, no mutation),
  `bounded-by-default`, `graph-compute-is-cpu` all satisfied/untouched.

One beneficial behavioral note: `list_roots` does not open each worktree repo, so
a worktree that is openable-as-proxy but whose later repo-open would fail no
longer errors the whole resolution — it still yields the root. The `.vault` check
remains the real gate. No regression.

### Measurement (in-process, aeat 67 worktrees)

`list_roots` **322ms** vs parallel `enumerate` **2392ms** (~7.4x); vs the old
serial `enumerate` (~5.8s) it is ~18x. The dominant inspect cost (N status diffs
+ 2N ahead/behind history walks) is eliminated for these callers. This removes
the multi-second cold-scope stall from `validate_scope_token` (the cold
`get_or_build` path / scope switch) and the per-invocation cost from the CLI
`Ctx::resolve`.

## Recommendations

- **LOW (future, residual):** `list_roots` still costs ~322ms on 67 worktrees
  because `collect_descriptors` opens each linked worktree's repo
  (`into_repo_with_possibly_inaccessible_worktree`) purely to read its workdir
  path. A lighter listing that derives the workdir without a full repo open would
  cut this further. Tracked as a backend-campaign follow-up, not a blocker.
- **LOW (cosmetic):** the four callers carry a near-identical "Path-only
  resolution" comment; the rationale also lives in the ADR follow-up section.

## Codification candidates


