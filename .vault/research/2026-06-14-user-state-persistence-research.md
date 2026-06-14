---
tags:
  - '#research'
  - '#user-state-persistence'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - '[[2026-06-12-dashboard-foundation-reference]]'
  - '[[2026-06-12-dashboard-foundation-adr]]'
  - '[[2026-06-13-frontend-state-system-reference]]'
  - '[[2026-06-12-vaultspec-engine-adr]]'
---



# `user-state-persistence` research: `application session-state and delegation layer`

The dashboard has a complete in-memory view-state system but **no backend
persistence and no application-state layer**. Nothing the user chooses survives a
page reload, and there is no component that owns "which project / worktree / vault
folder am I in, and what are its contexts." This research establishes exactly what
exists today, confirms the engine structurally cannot own this layer, and weighs
three placements for the missing delegation/session layer plus where its durable
state should live. Single-user local (loopback) deployment is assumed throughout.

## Findings

### F1 — The engine is single-scope, frozen at boot, and stateless by contract

`vaultspec serve` binds to exactly one worktree at process start. `build_state(root)`
fixes one immutable `root`/`scope` for the process lifetime; the live graph is indexed
from that one root and the watcher watches only that root. Every scoped route runs the
request's `scope` param through `validate_scope`, which is a **validate-or-400 gate, not
a retarget** — a non-matching scope is rejected with "v1 serves the launch worktree
only". The `scope` param exists for cache-key correctness and honest rejection, never to
multiplex worktrees.

This is by design, not a gap. The foundation contract's non-goals (§9) explicitly reserve
this: **"no server-held scope session"** and **"future layer builds beside"**, and the
engine redline dropped `POST /scope` to make scope fully stateless. The
`engine-read-and-infer` rule forbids the Rust workspace from writing config, mutating
refs, or growing session/control semantics. **Conclusion: session selection and
persistence cannot live in the engine** — confirming the "one layer too thin" intuition.

### F2 — One engine equals one worktree; `/map` is the only cross-worktree view

There is exactly one engine process per served worktree. `serve --port N [--scope WT]`
resolves a single worktree root (which must contain a `.vault`), and the frontend dev
proxy hardcodes one port and one `service.json` path — the client assumes **one engine**.
The lone endpoint that sees beyond the bound worktree is `/map`: it enumerates the whole
workspace (all worktrees, branches, remotes, and the `corpus_views` subset that have a
vault), but serves graph data for **none** of them but the bound one. So selecting a
different vault-bearing worktree in the UI today would 400 against the bound engine unless
it happens to be the served one. Multi-worktree serving is entirely missing.

### F3 — Frontend session state is purely ephemeral; reload is total amnesia

The "current scope/worktree" lives only in a Zustand field (`viewStore.scope`), defaulting
to `null` and recomputed from `/map`'s first `is_default && has_vault` worktree on every
load. A repo-wide sweep found **no `localStorage`, `sessionStorage`, URL param, or backend
write for scope or view state**. On reload, the chosen worktree, all selection, working
set, opened nodes, pins, lenses, tier filter, timeline scrub position, and granularity are
gone, and the query cache is memory-only.

There is also **no "current folder / current feature-context" concept** in the model or the
stores. A "folder" today is a purely presentational client-side grouping of the flat
`/vault-tree` list by `doc_type`; `feature_tags` exists as data and a passive badge but is
not a selectable, state-backed context. "The folder I'm in and its associated contexts"
does not exist as state.

### F4 — Persistence prior art: the engine cache is the WRONG home; localStorage sets the pattern

The engine persists exactly one thing: a **deletable, fully re-derivable SQLite cache**
under `.vault/data/engine-data/engine.sqlite3` (gitignored, local-only). Its self-heal
discipline is the disqualifier: `open_or_heal` **deletes the entire DB file on any
corruption** (stale WAL after a hard kill) without asking — safe only because every byte is
re-derivable. User state (project/worktree/folder/settings) has **no source of truth to
rebuild from**, so co-locating it in that file means a routine cache heal silently and
permanently erases it. Cache and durable user state require **opposite corruption
disciplines** (wipe-and-rebuild vs preserve-at-all-costs) and must not share a DB.

There is **no OS-config-dir / `platformdirs` / `dirs` usage anywhere in the repo** — every
per-user value today is browser `localStorage`. Three surfaces already establish the exact
convention a durable layer should reuse: pins, named lenses, and the node-position cache,
all keyed `vaultspec-dashboard:<domain>:<workspace>:<scope>`, all with a **versioned blob**
(`v:N`, mismatch discarded), **corrupt-reads-as-default** tolerance, **best-effort writes**,
an **injectable `KeyValueStore`** seam for testability, and **re-key on worktree switch**
(guarded by adversarial isolation tests). `feature_tags` is the existing grouping primitive
for "a folder and its contexts" — to be reused, not reinvented.

### F5 — The placement fork: where the delegation layer lives

The missing layer must own and persist session state and **delegate** graph reads to the
read-and-infer engine (loopback HTTP, `service.json` + bearer discovery) and vault ops to
`vaultspec-core` (already invoked as a bounded `--json` subprocess behind the engine's
`/ops/core/*` whitelist). Three placements were weighed:

| Option | New runtime/process | Rule risk | Reuse of existing seams | Deployment |
| --- | --- | --- | --- | --- |
| **A — Rust crate in the engine workspace** (orchestrator above the read-and-infer crates) | None; folds into the bundled binary (adds a persistence dep) | **High** — orchestration living inside `engine/` strains `engine-read-and-infer`'s spirit even as a separate crate (the stated "monolith" failure mode); reviewers assume everything in `engine/` is read-and-infer | **Highest** — in-process `engine-query`, reuses the `ops.rs` subprocess pattern, no second hop | **Lowest** — one binary, one wheel |
| **B — Node BFF in the frontend stack** | **New persistent Node process** (none exists today; the SPA is static) | **High** — no home in the Python-wheel-bundling-a-Rust-binary model; relocates wire access out of the owned `stores/` layer; analogous to a wheel-purity violation | **Lowest** — re-implements `service.json`/bearer + the core subprocess in a third language | **Highest** — un-shippable in the current wheel model; needs its own supervision |
| **C — Python session/serve layer in `vaultspec-dashboard`** (the package in THIS repo, beside the engine) | Adds a Python ASGI serve runtime (Python is already the shipped wheel) | **Low** *if scoped to the dashboard package, not `vaultspec-core` itself* — engine stays read-and-infer, wheel stays torch/Node-free | **High** — reuses `service.json`/bearer launch, engine over loopback, core via CLI/in-proc | **Low** — it *is* the wheel; matches the foundation ADR's "locator/launcher" posture (D9.2), and `__main__.py` is today an empty stub awaiting exactly this |

**Recommendation: Option C.** The published artifact is already a Python wheel whose one
runtime dependency is `vaultspec-core` and whose entry point is a stub launcher the
foundation ADR already names "locator/launcher"; a session layer is the body that launcher
was always going to grow. It keeps the `engine-read-and-infer` boundary crisp by placing
orchestration definitively *outside* `engine/` (honoring §9's "future layer builds beside"),
and reuses every existing seam without inventing a new process model or language runtime.

**The honest argument against C:** it introduces a **second long-lived loopback HTTP server**
(Python ASGI) in front of the first (the Rust engine) for a strictly single-user local tool
— two processes, two ports, two discovery handshakes, and a latency hop for graph reads the
Python layer can only proxy, never serve. If session state proves thin, Option A's
co-resident Rust crate is materially simpler at runtime, and the rule tension could be
contained by making the boundary a *named, reviewed crate split* rather than relying on the
folder as the fence. **C wins on rule-clarity and packaging-fit; A wins on runtime
simplicity — and that trade is the decision to settle before the ADR.**

### F6 — Recommended state split and substrate (independent of the placement fork)

- **Stays in the browser (ephemeral, view-local):** pins, lenses, position warm-start
  (already there), plus transient chrome — open panels, last hover, zoom/pan, sidebar
  widths, theme. Losing these costs a click and they are legitimately per-browser.
- **Needs the durable backend store (non-re-derivable, session-defining):** current project
  / worktree (scope), current vault folder/feature + its scoped contexts, and user settings —
  these must survive a browser/profile change, which `localStorage` cannot guarantee.
- **Substrate:** a durable store that is **not** `engine.sqlite3` and uses a
  **preserve-at-all-costs** corruption discipline (back-up-aside, never auto-delete),
  workspace-scoped, routed through the `frontend/src/stores/` sole-wire-client boundary, and
  carrying the proven hardening (versioned blob, corrupt-reads-as-default, best-effort writes,
  `workspace + scope` keying). Lead with a versioned JSON/TOML file co-located with
  `service.json` (lightest, most contract-aligned); promote to a dedicated SQLite DB only if
  settings volume or query needs outgrow a flat file.

### Open question routed to the ADR

The single decision the ADR must settle is **F5: Option C (Python session/serve layer
beside the engine) vs Option A (Rust orchestrator crate co-resident in the binary)** — a
rule-clarity/packaging-fit vs runtime-simplicity trade. F6's state split and substrate
guidance hold regardless of that choice.
