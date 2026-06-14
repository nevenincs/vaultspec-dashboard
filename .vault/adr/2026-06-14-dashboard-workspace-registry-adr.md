---
tags:
  - '#adr'
  - '#dashboard-workspace-registry'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - "[[2026-06-14-dashboard-left-rail-research]]"
  - "[[2026-06-14-user-state-persistence-adr]]"
  - "[[2026-06-14-dashboard-worktree-switcher-adr]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
---

# `dashboard-workspace-registry` adr: `multi-workspace project-root registry` | (**status:** `accepted`)

## Problem Statement

The dashboard is single-workspace by construction: at boot the engine runs
`Workspace::discover(&cwd)` and binds one git repository (workspace = its git common
dir), and `GET /map` enumerates that one repository's branches and worktrees. The
`vaultspec-session` orchestration crate generalized *worktree* scope into a warm
multi-scope registry, so switching worktrees within the bound workspace is instant —
but an operator who works across several projects (each its own repository and vault)
still cannot point the dashboard at more than the one root it launched in. The
proposed left rail offers a workspace switcher above the worktree switcher; that
control is an empty promise until the backend can hold, enumerate, select, and
persist **multiple project roots**. This ADR decides the multi-workspace project-root
registry — its home, its persistence, its wire surface, and its rail control — as a
read-only extension of the already-sanctioned orchestration layer. It is grounded in
the `dashboard-left-rail` research (F3) and authorizes no implementation.

## Considerations

- **The contract anticipated this.** The durable session store already keys state
  `<domain>:<workspace>:<scope>` — the keying carries a workspace axis even though
  discovery binds one. The worktree-switcher ADR names "a multi-repository grouping …
  or a future multi-scope composition the contract keeps open by keeping scope a
  parameter" as an opened pathway. Scope is fully stateless on the wire (foundation
  §3), and a worktree path is globally unique, so adding a workspace axis does not
  break the per-request scope key; workspace is the *grouping and registry* concern.
- **The home already exists and is sanctioned.** The user-state-persistence ADR
  introduced `vaultspec-session` as the "builds beside" layer that "may hold durable
  session state and **select workspaces**", explicitly redrawing `engine-read-and-infer`
  as a *semantic* fence: that crate persists session/settings and selects scope, while
  the inference crates and serve read path stay pure and nothing mutates git/vault/
  config. A registry of *which roots exist* is user-state config of exactly the class
  the crate already owns — not content mutation.
- **Read-only, by operator decision.** Registering a root does not clone, init, or
  modify a repository; it records an absolute path the operator points at, and the
  engine reads it (discovers its worktrees, indexes its structure) exactly as it reads
  the launch workspace. "Forget" removes the registry entry; it never touches disk.
- **Reachability is a first-class state.** A registered root can move or disappear on
  disk between sessions. It must render as a degraded, retry-able entry, never silently
  vanish (mirroring the worktree-switcher's degraded-worktree treatment), so the
  operator sees "this project is unreachable" rather than a shorter list.
- **The warm registry already bounds memory.** The scope registry holds N warm
  per-scope cells under an LRU working-set cap. Scopes drawn from several workspaces use
  the same cap; the only new dimension is that a cell's scope now belongs to a known
  workspace. No new memory mechanism is required.

## Constraints

- **Read-and-infer fence (semantic).** The registry and active-workspace selection live
  in `vaultspec-session` as user-state config; the crate still must never write `.vault/`
  documents, mutate git refs/trees/config, or grow sibling vault-CRUD/search semantics.
  Each registered repository is read exactly as the launch workspace is.
- **No wheel-purity regression and no new process.** The registry ships in the one
  bundled Rust binary, persisted in the existing dedicated `user-state.sqlite3` under the
  gitignored engine-data zone, reusing the `engine-store` rusqlite/WAL machinery. No new
  language runtime, no second server.
- **The inference crates stay untouched.** Multi-workspace is a registry-and-routing
  concern in `vaultspec-session` and the `vaultspec-api` veneer; `engine-graph` /
  `engine-query` remain pure over one bound graph, as the multi-scope work already
  established. The registry simply lets a scope cell's worktree come from any registered
  workspace.
- **Persistence is best-effort (prototype posture).** Per the user-state-persistence
  decision, a corrupt store is recreated empty; the registry resets to the launch
  workspace only. There is nothing precious to safeguard, so no migration or back-up
  ceremony.
- **Parent stability.** This ADR depends on the `vaultspec-session` crate and its
  session/settings surface being built; that is the accepted parent. It depends on `/map`
  and stateless scope (settled) and on the worktree-switcher's `setScope` wholesale reset
  (settled), which it widens. If the session crate's persistence surface were not yet
  built this work would block on it; nothing else here is frontier.

## Implementation

**The registry, in the orchestration crate.** `vaultspec-session` gains a durable
**workspace registry**: an ordered set of project roots, each an absolute path to a git
workspace plus a stable workspace id (derived from the git common dir, the same
identity-bearing derivation the rest of the contract uses), an operator-facing label,
and a last-seen reachability state. The launch workspace auto-registers as the first
root on first run so the single-project experience is unchanged. The registry persists in
`user-state.sqlite3` alongside the session and settings tables, best-effort.

**Registering, selecting, forgetting (all read-only).** Adding a root takes an absolute
path the operator supplies; the orchestrator validates it is a discoverable git workspace
(a git common dir resolves and at least one worktree is enumerable) and, on success,
persists a registry entry — refusing with an honest, `tiers`-bearing reason (not a git
workspace / path unreachable / not readable) when it is not, never partially registering.
Selecting a workspace sets the active-workspace field in the durable session. Forgetting a
workspace removes its registry entry (and evicts any of its warm scope cells); it is a
config delete only and never touches the repository on disk. The launch workspace cannot be
forgotten while it is the only root.

**The wire surface.** A new `GET /workspaces` enumerates the registry: per root the
workspace id, label, absolute path (monospace identity), the launch-default marker
(advisory), and a reachability state with a reason when degraded; the response carries the
`tiers` block like every other. `GET /map` gains an optional `workspace` parameter
defaulting to the active workspace, so it lists branches and worktrees within a chosen
root exactly as today — the existing single-workspace behaviour is the `workspace=active`
case, unchanged. The session surface (`/session`) gains an `active_workspace` field beside
the existing active scope; mutating it is a `PUT /session` write of user-state config, the
same mechanism the worktree selection already uses. Registry mutation (add/forget) routes
through the same user-state config surface, not through the read-only graph API and not
through the `/ops/*` sibling proxy.

**Scope routing across workspaces.** The warm multi-scope registry is unchanged in shape:
it holds N per-scope cells (each its graph, watcher, delta clock, resume ring) under the
LRU cap. The only generalization is that a cell's worktree may belong to any registered,
reachable workspace; `validate_scope` resolves a requested worktree against the *active
workspace's* enumerable worktrees (an unknown or non-vault scope still 400s honestly). Each
scope keeps its own monotonic delta clock so SSE `since=` resume stays correct per scope
regardless of which workspace it came from.

**The workspace switcher (frontend, hosted slot).** The left rail hosts the workspace
switcher above the worktree switcher per the `dashboard-left-rail` IA. It reads
`GET /workspaces` and the active-workspace session field through stores hooks, renders a
compact picker — each root showing its label, its path as monospace identity on hover, the
launch-default marker, and a Lucide warning mark with a reason when unreachable — and an
"add a project" affordance that takes an absolute path and surfaces the validation refusal
as a non-silent status line. Selecting a workspace fires a **workspace-level wholesale
reset**: it re-points the worktree set (the next `/map` is keyed to the new workspace),
resets the active scope to that workspace's launch-default or first vault-bearing worktree,
and performs the full 022 cross-store reset (filter, lens, pin, selection, working set,
opened islands, timeline mode, granularity, live-connection slice) so nothing from the
prior project's corpus survives — the same reset the worktree swap fires, widened to also
clear the prior worktree set. When only one root is registered the switcher renders as a
quiet header, not a control, keeping the common case uncluttered. The control owns no reset
logic; it invokes the stores action, exactly as the worktree switcher invokes `setScope`.

**States.** The switcher renders the rail's four honest states: loading (a quiet "loading
projects…" line), empty (only the launch workspace — rendered as the header fallback),
degraded (a registered root unreachable, or the `tiers` block reporting a backend down, with
the reason in copy tone and the entry kept with a retry, never dropped), and error (a
contained `/workspaces` failure with manual retry). The validation refusal on add is a
fifth transient honest state.

## Rationale

The decision realizes a seam the contract already reserved rather than inventing one. The
session store's `<domain>:<workspace>:<scope>` keying, the worktree-switcher's named
"multi-repository grouping" pathway, and the user-state-persistence ADR's explicit grant
that the orchestration crate "may hold durable session state and select workspaces"
together make multi-workspace an additive extension of an accepted layer, not a new
architecture or a read-and-infer breach — registering a root is user-state config, and
reading a registered repository is the same inference the engine already does over the
launch workspace. Keeping `/map` workspace-parameterized with `workspace=active` as the
unchanged default means the single-project experience does not regress and the existing
picker keeps working. Widening the 022 wholesale reset to the workspace level is the only
honest way to swap projects: a coarser scope change must clear at least as much as a
worktree change, plus the worktree set itself, or cross-project residue bleeds.
Reachability-as-state and the honest add-refusal follow the contract's `tiers` truthfulness
and the worktree-switcher's degraded-entry precedent. The best-effort persistence and the
single bundled binary follow the user-state-persistence posture and `published-wheel-purity`
directly.

## Consequences

- **Gains.** The dashboard becomes genuinely multi-project for the first time: an operator
  registers several roots and switches between them with the same instant, warm-scope feel
  the worktree switcher already has. The workspace switcher stops being an empty promise. The
  single-project case is untouched (auto-registered launch workspace, switcher-as-header).
- **Costs and difficulties.** Widening the wholesale reset to the workspace level is
  load-bearing: every piece of per-scope state, plus the cached worktree set, must clear on a
  workspace swap, and the isolation tests that guard worktree swaps must be extended to
  workspace swaps or cross-project bleed reappears. Validating and surfacing reachability for
  roots that move on disk is real state to manage. `validate_scope` must now resolve against
  the active workspace's worktrees, not one frozen value.
- **Risks.** The standing temptation is to let "register a project" grow into "clone /
  init / create a worktree" — every one of those is a git mutation outside the read-only
  fence and the codification candidate guards against it. A registered absolute path is
  operator-supplied trust on a loopback single-operator tool; it is read, not sandboxed, so
  the engine reads only what the operator points it at and never writes there. A best-effort
  store means a corrupt registry resets to the launch workspace — acceptable under the
  prototype posture, surprising if forgotten.
- **Pathways opened.** A workspace registry is the natural home for project-level metadata a
  future rev may want (a per-project label, a recents-across-projects shortlist, a default
  worktree per project), and it composes with the future agent-orchestration layer the engine
  ADR deferred, which is also reserved to this crate.

## Codification candidates

- **Rule slug:** `workspace-registry-is-config-not-content`.
  **Rule:** Registering, selecting, or forgetting a project root in `vaultspec-session` is
  user-state config persisted in the user-state store and must never clone, init, create,
  delete, or otherwise mutate a repository, a worktree, a branch, or any file on disk;
  each registered root is read exactly as the launch workspace is, under the semantic
  read-and-infer fence. *(Candidate; promote only after the constraint has held across one
  full execution cycle, paired with the existing `engine-read-and-infer` fence and the
  `orchestration-crate-is-the-read-and-infer-exception` candidate from the
  user-state-persistence ADR.)*
