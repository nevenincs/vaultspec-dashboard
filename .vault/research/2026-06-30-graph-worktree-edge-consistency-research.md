---
tags:
  - '#research'
  - '#graph-worktree-edge-consistency'
date: '2026-06-30'
modified: '2026-06-30'
related:
  - '[[2026-06-12-vaultspec-engine-adr]]'
  - '[[2026-06-12-dashboard-foundation-reference]]'
---

# `graph-worktree-edge-consistency` research: `present-view graph node/edge corpus-snapshot consistency`

The dashboard graph renders a recently-added cluster of cross-referencing ADRs as
disconnected, edge-less nodes. This research establishes the root cause, confirms
it empirically end-to-end (core source data, the live engine wire, the ingest
code), and weighs the options for making the present-view graph internally
consistent — a node and its authored `related:` relationships drawn from the
**same** corpus snapshot — without the engine ever mutating the vault and without
widening the engine beyond read-and-infer. It grounds the forthcoming ADR.

## Summary of the defect

The engine assembles its live ("present view") node-graph from **two different
corpus snapshots**:

- **Nodes** come from a read-only working-tree filesystem walk
  (`engine-graph/src/index.rs`, `vault_documents(root)` inside `index_structural`,
  reading each body via `ingest_struct::reader::read_from_worktree`). This walk
  sees **uncommitted and untracked** documents.
- **Declared cross-reference edges** — today the *only* source of authored
  document-to-document edges — come from the **committed git HEAD**:
  `index_documents` calls `ingest_core_graph(.., Some("HEAD"))`, which runs
  `vaultspec-core vault graph --ref HEAD` and parses the `vaultspec.vault.graph.v2`
  payload (`ingest-core/src/graph_v2.rs`). HEAD does not contain uncommitted files.

Therefore any **uncommitted** `.vault/` document appears as a node (working tree
sees it) but carries **zero edges** (HEAD lacks it). It floats.

## Empirical confirmation (end to end)

Reproduced on the 17 untracked `2026-06-29-agentic-*-adr` documents (each authored
with a dense `related:` frontmatter cross-referencing the others):

- **Core, working tree** (`vault graph`, no `--ref`): the 18 agentic nodes are
  present **with all 289 `related` edges** among them (corpus totals 1336 nodes /
  3051 edges).
- **Core, committed HEAD** (`vault graph --ref HEAD`): **0** agentic nodes, **0**
  agentic edges (corpus totals 1315 / 2703). The documents are untracked.
- **Live engine** (`POST /graph/query`, document granularity, the worktree-path
  scope): serves all **18** agentic nodes and **0** edges touching them. By
  document date, every committed date is ~100% edged; `2026-06-29` is the lone
  outlier at 11/31 edged — the uncommitted agentic ADRs are the un-edged remainder.

`vaultspec-core` installed version: `0.1.36`.

## Why HEAD was chosen — and why that premise is now obsolete

The `Some("HEAD")` choice is deliberate and documented in `index.rs`: it cites the
read-and-infer boundary (`D1.2` of the engine foundation decision record) and an
adversarial finding (2026-06-13) that plain working-tree `vault graph` "runs core's
index refresh, which stamps `modified:` frontmatter onto un-migrated docs and
rewrites `.gitignore`" — i.e. reading the corpus would silently mutate it. Reading
the object DB at HEAD is read-only, at the cost of reflecting committed rather than
working-tree state. The engine foundation contract reserves blob-true HEAD
reconstruction strictly for **historical** views (the as-of and lineage routes) and
frames the live graph as the working-tree present view; it does **not** require the
present declared tier to be HEAD. The HEAD pin is an engine implementation choice
forced by core's then-mutating working-tree mode, not a contract requirement — and
it is the exact seam where the present-view inconsistency lives.

**That forcing premise no longer holds in core `0.1.36`.** Verified empirically with
a full before/after snapshot (mtime + content hash) of all 1336 `.vault/*.md` files
around an isolated working-tree `vault graph` run: **zero `.vault/` documents
changed** — no `modified:` stamping, no `.gitignore` rewrite. `modified:`-stamping
is owned exclusively by `vault check --fix` / `vault repair` (the stamp writer is
gated behind `fix=True`), never by `vault graph`. The `status: "unchanged"` in the
graph envelope is a hard-coded constant, not a mutation signal. The single real side
effect of working-tree mode is a **conditional, gitignored, scan-excluded** cache
write at `.vault/data/.graph-cache/graph.json` — fingerprint-guarded, so a warm
(unchanged) vault writes **nothing at all**, and it lands in the same `.vault/data/`
auxiliary cache zone the engine already owns its own inference cache in. So the
working-tree graph is, today, read-only with respect to documents.

## Tier / corpus-view map (what reads which snapshot)

- **Declared (authored `related:` cross-references):** committed HEAD via the core
  subprocess. This is the only source of authored doc-to-doc edges and the entire
  locus of the bug. The other declared-tier edges the engine mints itself (plan
  `Contains` hierarchy, step-to-exec binding, rule `promoted-from`) are derived from
  the **working-tree** node set and are therefore already self-consistent with the
  nodes.
- **Structural body-mention edges:** **retired** (the 2026-06-28 strict
  reference-only ruling). In-body `[[wiki-link]]` extraction still runs, but only as
  incremental-index change-detection telemetry; it mints no edges. Authored
  cross-references live only in `related:` frontmatter.
- **Temporal (git commit correlation):** computed from a `HEAD` commit walk but
  served only as `/events` activity rows; it is **not** folded into the node-graph
  as `Tier::Temporal` edges. Orthogonal to this defect.

## The cache-keying trap (a second, mechanical cause)

The async declared-fold (perf split) caches core's graph JSON keyed on the **HEAD
sha** (`registry.rs`, `declared_cache_key(scope_token, head_sha)`). A watcher
file-change event re-runs the structural rebuild (refreshing nodes from the working
tree) and spawns the declared fold — but an uncommitted edit **does not change
HEAD**, so the fold takes a cache hit and re-folds the same HEAD-pinned edges; the
core subprocess only re-runs on a HEAD change (commit/checkout). So even editing a
*committed* document's `related:` in the working tree will not move its drawn edges
until the commit lands. Any fix that moves declared to the working tree must
**re-key this cache** on a content fingerprint (or invalidate per structural
rebuild), or edits still will not refresh edges.

## Identity stability — the decisive enabler

A declared edge's stable id is composed from **source stem, target stem, relation
kind, and tier** (`graph_v2.rs` builds `edge_id` from the source stem, target stem,
and kind string;
`engine-model/src/id.rs` hashes endpoints + relation + tier + the provenance stable
key, deliberately excluding the volatile payload hash). None of those inputs depend
on whether the source was the working tree or the HEAD object DB. Consequences: a
working-tree-derived `references` edge and core's HEAD-derived edge for the same
`stem->stem:kind` carry the **same id** and merge under replace-by-id (no phantom
add/remove on the SSE delta clock); and an uncommitted edge keeps its id when later
committed (no re-key, no diff churn). This satisfies the provenance-stable-keys
identity rule and is what makes a working-tree edge source safe. The one caveat: the
relation **kind** is part of the id, so an engine-side derivation must reproduce
core's kind classification (`fulfills`/`implements`/`resolves`/`reviews`/… with
`references` as the fallback) or a brief double-draw occurs across the commit
boundary for a doc that had a typed kind.

## Options considered

- **Option A — switch the present-view declared ingest to working-tree
  `vault graph` (drop `--ref HEAD` for the live view, keep `--ref` with an explicit commit sha for
  historical/as-of).** Fully consistent (nodes and edges from one working-tree
  snapshot), simplest engine change (the ref selector is already a parameter), and
  preserves edge-id stability. Now viable because core `0.1.36` working-tree mode is
  document-read-only. Residual concerns: the gitignored `.graph-cache` write (in the
  engine-owned `.vault/data/` cache zone — arguably already in-contract), and the
  HEAD-sha cache-key trap above, which must be re-keyed on content. **Recommended.**
- **Option B — engine derives `related:` reference edges itself** from working-tree
  frontmatter over the same `vault_documents` walk it already does for nodes. Stays
  read-and-infer (the engine already parses frontmatter for feature tags/dates/ADR
  status, and already mints declared `References` edges engine-side for rule
  `promoted-from`), and honors the reference-only ruling (it reads exactly the
  blessed `related:` frontmatter). No core dependency. Cost: it must reproduce core's
  typed-kind classification and stem resolution to reach edge parity, duplicating
  logic core already owns. Strong fallback if a core dependency is undesirable.
- **Option E — hybrid: keep cached HEAD declared edges for the committed corpus,
  engine-derive `related:` edges (the Option-B mechanism) only for uncommitted/dirty
  docs.** Targets the exact symptom while leaving the fast HEAD path untouched; edge
  identity makes the overlay dedupe cleanly with HEAD edges. More moving parts than A.
- **Option C — align nodes to HEAD (reject uncommitted nodes).** Rejected: achieves
  consistency by amputation, hides all in-progress authoring (the very agentic
  cluster this dashboard is being built to support), and collapses the
  present/historical distinction the as-of route exists to serve.
- **Option D — read a working-tree graph via a temp copy / stash / scratch
  worktree.** Not recommended: reintroduces per-rebuild checkout cost, risks
  concurrent-edit corruption, and creates worktree sprawl — all to avoid a mutation
  that core `0.1.36` no longer performs.

## Minimal upstream ask (optional hardening)

If the engine's read-and-infer contract is read strictly enough that even the
gitignored, re-derivable `.graph-cache` write is unacceptable, there is exactly one
small, additive, backward-compatible core ask: **expose the existing
`use_cache=False` library path as a `vault graph` CLI flag** (e.g. `--no-cache` /
`--pristine`). The forced-fresh, read-and-discard build already exists in the
library; only the CLI surface is missing. The mutation that originally forced HEAD
is already separated from graph computation, so no other core change is needed.

## Recommendation

Adopt **Option A** as the primary fix — present-view declared edges from the
working tree, historical views unchanged on `--ref` with an explicit commit sha — paired with the
mandatory cache re-key (content fingerprint rather than HEAD sha) so working-tree
edits actually refresh edges. Treat the `--no-cache` upstream flag as optional
hardening, not a blocker, since working-tree `vault graph` is already
document-read-only in `0.1.36`. Edge-id stability guarantees no SSE churn across the
commit boundary; the only fidelity care is matching core's relation-kind mapping,
which Option A gets for free (it consumes core's own classified edges) and which is
the chief cost of the Option-B/E alternatives.

## Open questions for the ADR

- Accept the gitignored `.graph-cache` write as in-contract, or gate the fix on the
  `--no-cache` upstream flag?
- Re-key the declared cache on a content fingerprint, or invalidate it on every
  structural rebuild (simpler, slightly more core subprocess calls — core's own
  fingerprint cache makes a no-change call cheap)?
- Confirm historical/as-of views remain strictly `--ref` with an explicit commit sha (committed,
  blob-true) and only the present view moves to the working tree.

## Verification environment note

`vault add` for every doc type was initially blocked: an in-flight, uncommitted
`.vaultspec/` source-layout restructure (flattening ``.vaultspec/rules/` per-category subdirs`
to flattened `.vaultspec/` subdirs) moved the deployed template mirror to
`.vaultspec/templates/`, while installed core `0.1.36` resolves templates from
`.vaultspec/rules/templates/`. Byte-identical template copies were restored to the
core-expected location to unblock the pipeline; this is independent of the graph
defect and should be reconciled with that restructure (or by re-running the core
installer once the restructure settles).
