---
tags:
  - '#audit'
  - '#status-worktree-latency'
date: '2026-06-16'
modified: '2026-06-16'
related:
  - "[[2026-06-16-status-worktree-latency-plan]]"
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #audit) and one feature tag.
     Replace status-worktree-latency with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `status-worktree-latency` audit: `worktree latency fix review`

## Scope

The ingest-git worktree changes (`inspect_one` + bounded parallel `enumerate`)
and their two consumers (`/status` route, CLI `status`), reviewed by an
independent code-reviewer pass and validated against live data on the
67-worktree aeat workspace.

## Findings

### Verdict: PASS-WITH-NITS (merge-ready, no required revisions)

The reviewer independently re-ran the engine gate green (`fmt --check`, `clippy`,
`ingest-git`/`vaultspec-cli` tests) and confirmed:

- **Path-match parity (correct):** `inspect_one` canonical-path matching is
  equivalent in practice to the old `scope_token`/`clean_path` find, because the
  served scope always exists on disk and both sides resolve to the same verbatim
  form; first-match short-circuit and descriptor order preserve the old `find`.
- **Bound honest:** combined fan-out is `worktree_inspect_concurrency()` (4) x the
  B5b `git_status_thread_limit()` (2) = 8 threads, independent of worktree and
  core count; no rayon-in-rayon nesting; serial below 2 descriptors.
- **Rules clean:** satisfies `bounded-by-default-for-every-accumulator`,
  `graph-compute-is-cpu-gpu-is-render-and-search`, `engine-read-and-infer`.
- **Tests adequate:** parity, main resolution, None, and parallel-vs-serial set.

### Live measurement (aeat, 67 worktrees, authed routes)

- `/status`: ~5.8s (old serial enumerate of all 67) -> 410-450ms (`inspect_one`,
  one worktree), now flat in worktree count. The residual ~450ms is
  `active_cell` + `CoreRunner::detect` + rag discover + one worktree inspect, not
  worktree-scaling.
- `/map`: 5.8s (serial enumerate) -> 2.1s (parallel enumerate), ~2.7x.

The prior "~5s /status" root cause is confirmed: serial per-worktree
`ahead_behind` history walks x 67.

## Recommendations

- **LOW (follow-up, out of this ADR's scope):** other enumerate-then-find callers
  pay the full enumeration too: `validate_scope_token` (per authed request) and
  the CLI `Ctx::resolve` (per invocation). Migrating them to `inspect_one` would
  remove the same waste from the request gate. This ADR deliberately scoped to
  `/status` + CLI `status`; the parallel `enumerate` already mitigates them.
- **LOW (informational):** `inspect_path` re-opens each worktree via
  `gix::open(path)` (required for the parallel fan-out); error-propagation parity
  with the old whole-enumeration-aborts behavior holds.

## Codification candidates

<!-- Findings that satisfy the three durability criteria
(cross-session, constraint-shaped, project-bound) and should be
promoted into project-shared rules under `.vaultspec/rules/rules/`
via `vaultspec-core vault rule promote --from <this-audit-stem>
--as <rule-name>`.

Each candidate names the finding it derives from, the proposed
rule slug (kebab-case, naming the constraint's subject not the
failure), and a one-sentence statement of the rule.

Most audits produce zero codification candidates. Some produce one.
Only the rare framework-wide-pattern audit produces several. If
none of the findings above meet the bar, state that explicitly and
move on -- an empty Codification candidates section is a positive
signal, not a failure. -->

<!-- Example:

- **Source:** finding S04 (destructive verbs lack preview).
  **Rule slug:** `destructive-verbs-need-dry-run`.
  **Rule:** Every CLI verb that writes or removes state must
  accept `--dry-run` and emit a usable preview before applying.

-->
