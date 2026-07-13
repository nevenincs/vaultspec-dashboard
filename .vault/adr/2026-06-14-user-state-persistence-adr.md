---
tags:
  - '#adr'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-07-12'
related:
  - "[[2026-06-14-user-state-persistence-research]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
  - "[[2026-06-12-dashboard-foundation-adr]]"
  - "[[2026-06-12-vaultspec-engine-adr]]"
  - "[[2026-06-13-frontend-state-system-reference]]"
---

# `user-state-persistence` adr: `co-resident orchestration layer for session state and workspace selection` | (**status:** `accepted`)

## Problem Statement

The dashboard has a complete in-memory view-state system but **no backend persistence
and no application-state layer**. A page reload is total amnesia: nothing the user
chooses — which project, which worktree, which vault folder, which contexts — survives,
and there is no component that owns "where am I and what am I looking at." The research
(`2026-06-14-user-state-persistence-research`) confirmed three structural facts: the
engine is single-scope, frozen at boot, and **stateless by contract** (foundation
reference §9 reserves "no server-held scope session" and "future layer builds beside",
the redline dropped `POST /scope`); the frontend calls the engine wire directly, which is
"one layer too thin"; and the engine's only persisted store is a deletable, re-derivable
cache whose self-heal path **deletes itself on corruption**, making it the wrong home for
non-re-derivable user state.

This ADR records the decision to introduce the reserved "builds beside" layer as a
**co-resident Rust orchestration crate** that owns session state, persistence, and
workspace selection, and becomes the new top-level API the frontend calls — settling the
placement fork the research left open (the user selected Option A over a Python ASGI layer
beside the engine).

**Prototype posture (explicit user direction):** this is a prototype with nothing to keep
or safeguard. The decision is therefore a **full rollout with no phasing or deferrals** —
the complete feature set lands at once (the warm multi-scope registry, the full
session/settings surface including global settings) — and persistence carries **no
durability ceremony**: the store is best-effort and losing it on corruption is acceptable.
The structural separation from the engine's re-derivable cache is kept only for
cleanliness, not to safeguard data.

## Considerations

- **The placement was a deliberate, user-settled trade.** Option A (co-resident Rust
  crate) wins on runtime simplicity (one process, one port, no proxy hop, in-process
  delegation to `engine-query`) and on seam reuse, at the cost of rule tension:
  orchestration living inside the `engine/` workspace strains the spirit of
  `engine-read-and-infer`. The rejected alternatives were a Python ASGI layer beside the
  engine (rule-clean and packaging-fit, but a second loopback server with a proxy hop)
  and a Node BFF (dominated — a new persistent process with no home in the wheel).

- **The read-and-infer fence is semantic, not folder-based.** The `engine-read-and-infer`
  rule must be read as binding the **inference crates** (`engine-graph`, `engine-query`,
  `engine-store`, the `ingest-*` crates) and the **serve read path** — the things whose
  value is trustworthy inference over sources of truth they do not own. The new
  orchestration crate is the sanctioned layer §9 reserved; it may hold durable session
  state and select workspaces, but it inherits the same hard prohibitions it delegates:
  it **never writes `.vault/` documents, never mutates git refs/trees/config, and never
  grows sibling vault-CRUD or search semantics** — those stay in `vaultspec-core` and
  `vaultspec-rag`, reached over the existing bounded `--json` subprocess seam.

- **The engine is single-scope by construction, and that is its biggest lever and its
  biggest obstacle.** Every read endpoint resolves the one bound graph; `validate_scope`
  is a 400 gate, not a retarget. Letting the user browse across worktrees requires the
  orchestrator to make scope selectable — the central engineering question of this ADR.

- **User state is not re-derivable, but for this prototype that does not warrant
  ceremony.** The structural fact stands — user state has no source of truth to rebuild
  from, so it does not belong inside the engine's wipe-on-corruption cache (`engine.sqlite3`).
  But because there is nothing to safeguard, the store needs only a **best-effort**
  discipline (corrupt → recreate is acceptable, just like the cache); the separate file is
  for cleanliness, not preservation. No back-up-aside, no migration ceremony.

- **Prior art already sets the keying and hardening pattern.** The browser localStorage
  surfaces (pins, lenses, position cache) are keyed `<domain>:<workspace>:<scope>` with a
  versioned blob, corrupt-reads-as-default, best-effort writes, and re-key on worktree
  switch. The durable backend store reuses this discipline; `feature_tags` is the existing
  grouping primitive for "a folder and its contexts" — to be reused, not reinvented.

## Constraints

- **No new language runtime, no wheel-purity regression.** The layer ships in the one
  bundled Rust binary; `vaultspec-rag`/`torch` stay dev-only and no Node process is
  introduced (`published-wheel-purity`).

- **The engine read path must not regress.** The inference crates are stable, audited, and
  scale-hardened; this work must not alter their semantics. Scope multiplexing lives
  entirely in the new crate and the HTTP veneer (`vaultspec-api`), not in `engine-graph`
  or `engine-query`.

- **Multi-scope serving is the largest blast radius (full rollout, not deferred).** Today
  one `AppState` holds one graph, one watcher, one delta clock, one resume ring. This work
  generalizes that to a **scope registry** holding N warm per-scope graphs concurrently
  (each with its own watcher, delta clock, and resume ring), routed by scope and bounded by
  a working-set cap so a many-worktree workspace stays in memory budget. Switching worktrees
  is then instant against an already-warm scope; a cold scope builds on first access (~2.1s
  at 4000 docs per the scale-hardening cycle). This touches the serve layer's load-bearing
  single-`AppState` assumption across the watcher, the delta clock, the resume ring, and the
  SSE `since=` resume — the hardest part of the build, and where live-state regressions are
  most likely. The inference crates (`engine-graph`/`engine-query`) are still untouched: the
  registry holds N `LinkageGraph`s; the read functions are already pure over one.

- **The frontend stays the sole wire client through `frontend/src/stores/`.** Chrome and
  scene never fetch; the new session/settings endpoints are consumed through stores
  hooks, preserving `dashboard-layer-ownership`. Views remain projections over the one
  model (`views-are-projections-of-one-model`).

## Implementation

**The orchestration crate (the "builds beside" layer).** A new workspace crate — proposed
name `vaultspec-session` — owns three responsibilities the inference crates do not: (1) the
**selectable scope** — it holds the currently-served worktree and re-points the bound graph
on selection; (2) the **durable store** — session selection and user settings persisted with
preserve-at-all-costs discipline; (3) **delegation** — graph reads resolve in-process against
`engine-query` over the currently-bound graph, and vault mutations route to `vaultspec-core`
over the existing bounded `--json` subprocess pattern. `vaultspec-api` remains the HTTP
veneer: its `AppState` gains a handle to the session crate, its scoped routes resolve scope
through the orchestrator instead of comparing against one frozen value, and it grows the new
session/settings endpoints. The inference crates are untouched.

**Workspace/worktree selection (warm multi-scope registry).** `build_state` today pins
`root`/`scope` immutably. This work replaces the single bound graph with a **scope registry**
under orchestrator control: a map from scope to a per-scope cell (its graph `RwLock`, watcher,
delta clock, resume ring, and meta cache). Selecting a vault-bearing worktree (from the set
`/map` already enumerates) resolves or lazily builds its cell and keeps it warm, bounded by a
working-set cap that evicts the least-recently-used scope when the budget is exceeded.
`validate_scope` changes meaning from "is this the one frozen scope" to "is this a selectable
worktree in this workspace" — an unknown or non-vault-bearing scope still 400s honestly. Each
scope keeps its own monotonic delta clock so the SSE `since=` resume stays correct per scope.

**The top-level API the frontend calls.** The new sole backend surface adds session
endpoints alongside the existing engine endpoints (which now resolve scope through the
orchestrator): read and update the current **session** (active project/workspace, active
worktree/scope, active vault folder + its associated feature-tag contexts, recent
selections) and read and update **user settings**. Every response continues to carry the
per-tier `tiers` block through the shared envelope helper
(`every-wire-response-carries-the-tiers-block`). The frontend's `stores/` layer becomes the
sole client of this surface; on load it reads the persisted session to restore "where am I"
rather than recomputing a default, ending the reload amnesia.

**Persistence substrate (dedicated SQLite, best-effort).** The store is a **dedicated
SQLite database** (proposed `user-state.sqlite3`) co-located with `service.json` in the
gitignored `.vault/data/engine-data/` zone — a separate file from `engine.sqlite3`, reusing
the `engine-store` rusqlite/WAL machinery the workspace already proves. It holds the durable
session and settings tables (active workspace/scope, per-scope active folder + feature-tag
contexts, recents, and the settings keys including global ones). Given the prototype posture,
its corruption discipline is **best-effort, the same as the cache** — a corrupt or unopenable
file is recreated empty (the existing `open_or_heal` pattern), no back-up-aside and no
fail-loud migration ceremony. The separation from `engine.sqlite3` is for cleanliness (the
cache may be wiped by its own self-heal independently), not to safeguard the user data.

**The state split.** Ephemeral, view-local, cheaply re-establishable state **stays in browser
localStorage** (the existing pins/lenses/position-cache pattern, plus transient chrome —
open panels, hover, zoom/pan, sidebar widths, theme). Durable, session-defining,
non-re-derivable state — **current project/worktree (scope), current vault folder/feature +
its scoped contexts, and user settings** — goes to the new backend store, because it must
survive a browser/profile change that localStorage cannot guarantee. The "current folder +
contexts" concept is built on the existing `feature_tags` grouping (an active feature tag /
`/vault-tree` subtree plus its scoped lens/filter selection), not a new node schema.

## Rationale

The decision follows the research's strongest grounded reasons (F1–F6) and the user's
settled fork (F5 → Option A). The engine is read-and-infer and stateless **by design**, and
the foundation contract §9 already reserved a layer that "builds beside" — so this is the
sanctioned realization of a reserved seam, not a violation invented after the fact. Option A
keeps that layer in-process for the lowest runtime cost (no second loopback server, no proxy
hop, in-process `engine-query` delegation) and reuses every existing seam — `service.json`
discovery, the bearer gate, the `/ops/core/*` subprocess pattern. The honest cost the user
accepted is rule tension; this ADR neutralizes it by making the read-and-infer fence
**semantic and explicit** — the inference crates and serve read path stay pure, the
orchestration crate inherits the same hard prohibitions on vault writes / ref mutation /
sibling semantics, and the fence is named so a future reviewer does not read "everything in
`engine/` is read-and-infer" and either block legitimate orchestration or wave through a
genuine regression. The persistence substrate follows F4 structurally — a separate store
in the existing cache zone, reusing the localStorage keying convention — but the prototype
posture means it carries no durability ceremony: it is kept out of `engine.sqlite3` only so
the cache's own self-heal cannot wipe it as a side effect, not to safeguard the data, which
is acceptable to lose.

## Consequences

- **Gain:** reload amnesia ends — the user's project/worktree/folder/context/settings
  persist, and the dashboard finally has the application-state layer it was missing. The
  frontend gets a single, honest top-level backend instead of speaking the engine wire
  directly.
- **Gain:** cross-worktree browsing becomes possible for the first time, with instant
  switching between warm scopes — unblocking the `/map` worktree picker that today can only
  400 against the bound engine.
- **Pathway opened:** the orchestration crate is the natural home for the future
  agent-orchestration layer the engine ADR deferred; session, recents, and named-views all
  extend it without touching the inference crates.
- **Difficulty / blast radius:** generalizing the single `AppState` to a multi-scope registry
  is load-bearing across the watcher, the delta clock, the resume ring, and the SSE `since=`
  resume — each must become per-scope while preserving each scope's monotonic clock and clean
  eviction. This is the hardest part of the build and the most likely place for live-state
  regressions; the working-set cap keeps a many-worktree workspace within memory budget.
- **Pitfall:** the read-and-infer fence is a discipline, not a compiler guarantee — Bash and
  the filesystem let the new crate write anywhere. The codification candidate below exists to
  bind future agents to the semantic boundary so the orchestration crate does not slowly grow
  vault-mutating or sibling-search semantics and re-create the monolith the rule prevents.
- **Accepted trade (prototype):** there are no durability safeguards by intent — a corrupt
  store is recreated empty and the session resets to defaults. This is acceptable because the
  state is cheap to re-establish and nothing here is precious; a production posture would
  later add a preserve-on-corruption discipline and migrations.

## Codification candidates

- **Rule slug:** `orchestration-crate-is-the-read-and-infer-exception`.
  **Rule:** The co-resident orchestration crate (`vaultspec-session`) is the only crate in
  the `engine/` workspace permitted to hold durable session/settings state and select
  workspaces; it still must never write `.vault/` documents, mutate git refs/trees/config, or
  grow sibling vault-CRUD/search semantics — those stay in `vaultspec-core`/`vaultspec-rag`
  reached over subprocess, and the inference crates plus the serve read path remain strictly
  read-and-infer.
  *(Promote only after the constraint has held across one full execution cycle, per the
  codify discipline; pair it with a scoped amendment to `engine-read-and-infer`.)*

  *(Note: a second candidate — durable user state using a preserve-at-all-costs corruption
  discipline separate from the re-derivable cache — was considered but dropped under the
  prototype posture, which explicitly accepts losing user state on corruption. Revisit it if
  this graduates beyond a prototype.)*
