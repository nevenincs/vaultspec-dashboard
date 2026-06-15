---
tags:
  - '#audit'
  - '#dashboard-left-rail-verification'
date: '2026-06-15'
modified: '2026-06-15'
related:
  - "[[2026-06-14-dashboard-left-rail-adr]]"
  - "[[2026-06-14-dashboard-workspace-registry-adr]]"
  - "[[2026-06-14-dashboard-code-tree-adr]]"
  - "[[2026-06-15-dashboard-left-rail-audit]]"
---

# `dashboard-left-rail-verification` audit: `live YDrive vault verification of the left scope rail`

## Scope

A live, end-to-end hardening pass that stood up `vaultspec serve` against the
real `Y:/code` repositories — where production-like `.vault/` corpora live — and
manually exercised every left scope rail capability and every backing command
against that real data, fixing whatever was not truly functional. This is the
production-like counterpart to the static review in
`2026-06-15-dashboard-left-rail-audit` (which was code-only and returned SHIP);
driving the actual UI against real data surfaced four real defects the static
review and the unit suites could not see.

**Method.** A fresh engine binary served the dashboard workspace; the API was
probed with the bearer token via direct HTTP, and the SPA was driven in a real
browser (Playwright). Real workspaces used: `vaultspec-dashboard` (539 vault
docs, 2 worktrees), `aeat` (7,175 vault docs, 67 worktrees), `vaultspec-core`
(750), `vaultspec-rag` (613) — four distinct project roots registered
concurrently.

## Findings

### Commands verified against real data (all GREEN)

Every left-rail-backing endpoint returned real content at real scale:

- `GET /health` — ok, four tiers reported.
- `GET /workspaces` — launch root auto-registered; add/forget; reachability;
  scaled to 4 registered roots.
- `GET /map` (default + `?workspace=`) — real branches/worktrees; aeat enumerated
  all 67 worktrees.
- `GET /vault-tree?scope=` — real docs with correct `doc:<stem>` ids, page-capped
  at 500 with a working `next_cursor` (dashboard 539, aeat 7,175, etc.).
- `GET /file-tree?scope=&path=` — real source, `code:<path>` ids, `has_children`,
  `truncated` marker, **gitignore-aware** (no `.git`/`node_modules`/`target`),
  one-level lazy descent verified (`engine/crates` → 11 crates).
- `GET /session` + `PUT /session` — active scope/workspace, recents, context;
  add/forget/switch all exercised.
- The per-tier `tiers` block was present on every response, including the honest
  "declared tier building" transient on a fresh serve.

### UI switchable elements verified against real data (all functional)

Driven in a real browser against the live engine: the collapse toggle, the
"scope rail" landmark, the **workspace switcher** (quiet-header at one root;
interactive picker listing all roots; "add a project" affordance accepting an
absolute path), the **worktree switcher**, the **vault/code mode toggle** (real
docs vs real source, filter placeholder adapts), the **in-rail filter** (vault
mode narrowed 500→21 precisely; code mode shows correct lazy-tree behaviour and
is a distinct input from the global search), the four honest states (loading,
empty, the designed degraded banner, error), and the read-only law (no
mutation-shaped control anywhere in the rail; git status display-only). Switching
across all four projects landed each project's real corpus.

### Defects found and fixed (invisible to the static review)

- **H1 — forget-active left the scope dangling.** Forgetting the active
  workspace re-pointed `active_workspace` but left `active_scope` on the
  forgotten project's worktree, so the browser showed the wrong corpus. Fixed:
  `forget_root` now re-points BOTH pointers (persisted + in-memory) to the launch
  root. Verified live (forget aeat-while-active → both return to dashboard).
  Committed `db90e16`.
- **H2 — `/workspaces` hung at real scale.** Reachability was probed via a full
  worktree enumeration for every root on every call; registering aeat (67
  worktrees) made `/workspaces` time out (12s+), which broke the workspace
  switcher UI (it could not load its roots). Fixed: reachability is now a cheap
  discover-only check; the worktree walk stays on `/map`. Verified live: 12s+
  hang → ~0.06s with aeat registered. Committed `db90e16`.
- **H4 — workspace switch never set the new scope.** The UI swap persisted
  `active_workspace` only (and passed `scope=null`), so switching a project moved
  the workspace pointer but kept the old corpus. Fixed: the picker passes the new
  root's worktree (`root.path`) and the swap persists `active_scope` alongside
  `active_workspace`. Verified live (switch to vaultspec-core → both pointers and
  the rendered corpus move). Implemented in-tree; commit deferred (see below).
- **H6 — workspace switch raced and left the rail empty.** The optimistic scope
  change fired the scoped reads against a still-cold scope (`validate_scope`
  400s a not-yet-built scope) and never refetched, so an in-session switch showed
  an empty rail until a manual reload. Fixed: the swap refetches the scoped
  queries after the PUT warms the scope. Verified live (switch to cold
  vaultspec-rag → rail populates in-session, no reload). Implemented in-tree;
  commit deferred (see below).

### Findings not requiring a code fix

- **H5 — large-workspace cold build OOM (debug only).** Under the unoptimized
  debug binary and system memory pressure, the cold build of aeat (7,175 docs)
  aborted with `memory allocation … failed`. Under the **release** (production-
  like) binary the same cold build completes in **3.4s with the serve alive** —
  so H5 is a debug-build/dev-pressure artifact, not a production defect. Recommend
  developers use the release serve for very large corpora; optionally profile
  debug-mode graph-build memory.
- **H3 — ambiguous project labels (UX nit).** Two projects whose root worktree
  branch is `main` both render the visible label "main" in the switcher; they are
  disambiguated only by the aria-label and the path tooltip. Consider labelling
  by repository name when branch labels collide.

## Recommendations

- **Land the deferred frontend fixes (H4, H6).** They are implemented in the
  working tree, are live in the served bundle, and are verified, but their files
  (`frontend/src/app/left/WorkspacePicker.tsx`, `frontend/src/stores/server/queries.ts`)
  currently carry concurrent peer WIP (a context-menu feature and pipeline-wire
  edits), so committing them would absorb peer work. Commit them once those files
  disentangle. The engine fixes (H1, H2) are committed (`db90e16`).
- **H3 / H5** are optional follow-ups (label disambiguation; debug-mode memory),
  tracked here.

## Codification candidates

- **Source:** the H4/H6 class (a scope-coupled control whose swap must move both
  the workspace pointer and the scope, and must refetch after the scope is warm).
  **Rule slug:** `workspace-swap-repoints-and-rewarms-scope`.
  **Rule:** Any control that swaps the active workspace MUST also re-point the
  active scope to a worktree of the new workspace (engine-guarded, not caller-
  dependent) and MUST refetch the scoped reads once the new scope is warm, so a
  switch never strands the prior corpus or an empty rail.
  *(Candidate only; promote after it holds across one execution cycle, paired
  with the existing scope-isolation invariant.)*
