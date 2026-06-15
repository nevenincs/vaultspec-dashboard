---
tags:
  - '#audit'
  - '#dashboard-left-rail'
date: '2026-06-15'
modified: '2026-06-15'
related:
  - "[[2026-06-14-dashboard-left-rail-adr]]"
  - "[[2026-06-14-dashboard-workspace-registry-adr]]"
  - "[[2026-06-14-dashboard-code-tree-adr]]"
  - "[[2026-06-14-dashboard-left-rail-plan]]"
---

# `dashboard-left-rail` audit: `left scope rail campaign review, verification, and closeout`

## Scope

This audit closes out the three-feature left scope rail campaign — multi-workspace
project-root registry (`dashboard-workspace-registry`), read-only codebase
file-tree browser (`dashboard-code-tree`), and the left-rail information
architecture that composes them (`dashboard-left-rail`). It records the
independent code review of the committed campaign surface, the integrated
verification on `main`, the one hardening change made in response to the review,
and the deferred items left for a clean follow-up. It exists to certify that the
features are merged and verified, and to track honestly what remains.

The campaign was built by three autonomous executors landing 12 commits on `main`
(workspace-registry: `561ab93`, `0503a4b`, `b9bcff6`, `0672fd4`; code-tree:
`69e8157`, `747fa9d`, `9c9c11d`, `475bb40`; left-rail IA: `934dce1`, `33401b7`,
`59fce25`, `6cc3872`), plus the review-driven hardening commit `2812a4b`. It ran
on a live shared `main` worktree alongside several concurrent peer campaigns
(`dashboard-pipeline-wire`, `dashboard-pipeline-status`, `dashboard-activity-rail`,
`dashboard-timeline`, `node-visual-richness`), which shapes the deferral notes
below.

## Findings

### Merge status — all three features are on `main`

Verified at HEAD by inspection: `AppShell` imports and renders `<LeftRail/>`;
`stores/server/queries.ts` exposes `useFileTree`; `stores/server/engine.ts`
carries the workspace and file-tree adapters and types; `vaultspec-api`'s router
registers both `/workspaces` and `/file-tree` (with route tests). The shared-file
edits that were deferred during the build (to avoid absorbing peers' uncommitted
work) landed when a peer commit integrated those files; the campaign's own commits
carry only campaign-exclusive files. No campaign work is lost or stranded.

### Code review verdict — SHIP

An independent review of the committed campaign surface across nine axes returned
**SHIP** with no blocker or major findings. Clean axes: read-only fence
(production code mutates nothing; the workspace registry is user-state config
only); layer ownership (rail chrome never fetches, never mints node identity,
reads `tiers` only through stores selectors; endpoints carry the `tiers` block on
success and error); bounded reads (`/file-tree` is one-level, hard-capped at 2000,
cursor-paginated, with an honest truncation marker); stable-id interlink
(`code:<path>` / `doc:<stem>` via the shared `node_id` rule); scope isolation (the
022 wholesale reset clears all per-scope state plus the cached worktree set;
browser mode and in-rail filter reset on swap); read-only navigation law (no
mutation affordance in the rail; the in-rail filter issues no wire request and is
distinct from global search); test integrity (real adapters and transport, no
skips/xfail/tautology, no lint suppressions; mocks mirror the live wire shape);
design language (Lucide chrome / Phosphor domain marks at 14px, token-driven, four
honest states); and ADR fidelity.

The review raised two minor and two nit findings, all optional:

- **M1 (minor) — forgetting the active workspace was not guarded engine-side.** A
  bare `forget_workspace` of the currently-active workspace, with no paired active
  re-select, left the persisted active-workspace pointer naming a forgotten id. It
  degraded gracefully (the active scope cell is pinned and falls back to the launch
  root), but the invariant depended on the caller pairing two fields. **Actioned —
  see Recommendations.**
- **M2 (minor) — `/workspaces` re-probes and persists reachability for every root
  on every enumeration, serially under the user-state mutex.** Correct and
  read-only, but O(roots) synchronous git discovery on a polled hot path.
  **Deferred** (not load-bearing at expected scale; behaviour-changing to batch).
- **N1 (nit) — workspace path "monospace on hover" is a native `title` tooltip**,
  which cannot carry the `font-mono` treatment the design language reserves for
  path identity. Honors the spirit (path on hover) but not the literal styling.
  **Deferred** (cosmetic; needs a styled hover popover).
- **N2 (nit) — `truncated.returned_children` reports the per-level cap (2000), not
  the page size**, on a paginated capped level. Internally consistent and not
  currently misread by any consumer. **Deferred** (optional naming clarity).

### Verification — green

- Backend feature crates (`vaultspec-session`, `vaultspec-api`, `ingest-git`,
  `engine-model`): 110 tests passed, 0 failed.
- `vaultspec-api` after the M1 hardening: lib suite 50 passed, 0 failed; `clippy
  --all-targets -- -D warnings` clean.
- Frontend suite: 868 passed. The only 3 failures belong to a separate peer
  degradation-hardening sweep that is uncommitted in the working tree — proven by
  confirming the failing assertions (the "tiers-bearing" degraded-state tests)
  exist only in the working tree and are absent at committed HEAD. The campaign's
  own frontend tests (rail composition render, cross-scope mode/filter isolation,
  the no-wire-request-on-filter proof, the read-only-law accessible-name scan, the
  `code:` selection join, the four honest states) are all in the passing set.
- The full Rust `--workspace` test run could not complete because a running
  `vaultspec serve` holds `vaultspec.exe`, so the CLI test binary could not relink
  (`link.exe` exit 1104). This is environmental, not a code regression; the library
  crates that carry all campaign backend logic were tested directly and pass.

## Recommendations

### Actioned this pass

- **M1 hardening (committed `2812a4b`).** `forget_root` now re-points the
  active-workspace pointer to the launch root engine-side when the forgotten root
  was the active one, so the persisted selection never names a forgotten id and the
  invariant no longer depends on the caller pairing the forget with an active
  re-select. The frontend swap still drives the wholesale UI reset. Verified:
  `vaultspec-api` lib 50 passed / 0 failed, clippy clean, no regression.

### Deferred closeout items (tracked, not blocking)

- **M1 dedicated behavioural regression test.** A test asserting that forgetting
  the active workspace re-points active to the launch root belongs beside the other
  forget tests in the `vaultspec-api` lib test module, but that file currently
  carries fresh uncommitted peer WIP; adding and committing the test there would
  absorb peer work. The fix is verified by the passing forget-path suite and clippy;
  add the dedicated test once that file disentangles.
- **M2** — batch the reachability writes into one locked transaction and/or debounce
  the per-poll re-probe on `/workspaces`.
- **N1** — replace the native `title` tooltip on the workspace path with a styled
  hover popover so path identity renders monospace.
- **N2** — rename or clarify `truncated.returned_children` (e.g. `capped_to`) if it
  is ever consumed as a page count.

These are quality/cosmetic follow-ups; none blocks the campaign from being merged
and verified.

## Codification candidates

No new codification candidates. Every constraint the review exercised is already
bound by an existing project rule — `engine-read-and-infer`,
`dashboard-layer-ownership`, `views-are-projections-of-one-model`,
`every-wire-response-carries-the-tiers-block`,
`degradation-is-read-from-tiers-not-guessed-from-errors`,
`graph-queries-are-bounded-by-default`,
`provenance-stable-keys-are-identity-bearing`,
`icons-come-from-the-two-sanctioned-families`, and `mock-mirrors-live-wire-shape`.
The campaign is a faithful per-surface application of those rules, so this section
is intentionally empty.
