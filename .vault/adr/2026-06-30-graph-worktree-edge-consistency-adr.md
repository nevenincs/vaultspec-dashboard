---
tags:
  - '#adr'
  - '#graph-worktree-edge-consistency'
date: '2026-06-30'
modified: '2026-06-30'
related:
  - "[[2026-06-30-graph-worktree-edge-consistency-research]]"
---

# `graph-worktree-edge-consistency` adr: `present-view declared edges read the working tree` | (**status:** `accepted`)

## Problem Statement

The dashboard's live graph renders uncommitted `.vault/` documents as disconnected,
edge-less nodes. The grounding research established the cause: the engine assembles
its present-view node-graph from **two different corpus snapshots**. Nodes come from
a read-only working-tree filesystem walk (so uncommitted and untracked documents
appear), while declared cross-reference edges — today the only source of authored
document-to-document relationships — come from the committed git HEAD, because the
engine runs `vaultspec-core vault graph --ref HEAD`. HEAD does not contain uncommitted
files, so a freshly authored document shows as a node with zero edges. This was
reproduced end to end on a 17-document cluster of cross-referencing ADRs: core's
working-tree graph carries all 289 of their `related` edges, core's HEAD graph carries
none, and the live engine serves all 18 nodes with no edges touching them. The defect
defeats the dashboard's core purpose — visualising in-progress authoring (the very
agentic-authoring work this tool is being built to support) the moment it is written.

This ADR decides how to make the present view internally consistent: a node and its
authored `related:` relationships drawn from the **same** corpus snapshot, without the
engine ever mutating the vault and without widening the engine beyond read-and-infer.

## Considerations

The `--ref HEAD` pin was adopted deliberately (engine foundation decision `D1.2`,
read-and-infer) after a 2026-06-13 adversarial finding that plain working-tree
`vault graph` ran core's index refresh — stamping `modified:` frontmatter and
rewriting `.gitignore`, i.e. silently mutating the corpus it was meant only to read.
HEAD reads the git object DB read-only, at the cost of reflecting committed rather
than present state. The research re-verified this premise against the **currently
installed** core (`0.1.34`) and found it **no longer holds**: a full before/after
snapshot (mtime + content hash) of all 1336 `.vault/*.md` files around an isolated
working-tree `vault graph` run showed **zero document mutations**. `modified:` stamping
is now owned exclusively by `vault check --fix` / `vault repair` (gated behind
`fix=True`); `vault graph` never invokes it. The only residual side effect of
working-tree mode is a conditional, fingerprint-guarded, gitignored cache write at
`.vault/data/.graph-cache/graph.json` — nothing at all on a warm/unchanged vault, and
located in the same `.vault/data/` auxiliary cache zone the engine already owns its own
inference cache in.

Three further facts shape the decision. First, the engine foundation contract frames
the live graph as the **working-tree present view** and reserves blob-true HEAD
reconstruction strictly for **historical** views (the as-of and lineage routes); it
does not require the present declared tier to be HEAD. Second, declared edge stable ids
are composed only from source stem, target stem, relation kind, and tier — never from
the corpus snapshot — so an edge derived from the working tree and the same edge later
read from HEAD share one id (they merge under replace-by-id; no SSE delta-clock churn,
no re-key on commit). Third, the engine **already** reads frontmatter and mints declared
`References` edges itself (for rule `promoted-from` provenance), and already minted plan
`Contains` and step-to-exec edges from the working-tree node set — so consuming a
working-tree relationship graph is squarely inside the existing read-and-infer surface,
not a widening of it.

The alternatives weighed in research: (B) the engine derives `related:` edges itself
from working-tree frontmatter — viable and read-and-infer-clean, but it must reproduce
core's typed-kind classification and stem resolution, duplicating logic core owns;
(E) a hybrid keeping HEAD edges for committed docs and overlaying only uncommitted ones
— correct but more moving parts; (C) align nodes to HEAD — rejected, it amputates the
present view and hides all in-progress work; (D) temp checkout/stash to read a
working-tree graph — rejected, heavy and risky to avoid a mutation core no longer makes.

## Constraints

- **Read-and-infer is absolute.** The fix must cause no `.vault/` document mutation.
  Working-tree `vault graph` satisfies this in `0.1.34` (verified). The decision treats
  the gitignored `.graph-cache` write as **in-contract** — it is re-derivable auxiliary
  cache under `.vault/data/`, the same zone the engine's own SQLite inference cache
  occupies under the `engine-read-and-infer` discipline. This assessment is the one
  load-bearing judgement call and is called out for sign-off.
- **The HEAD-sha cache-key trap is a hard blocker that must be fixed in the same
  change.** The async declared-fold caches core's graph JSON keyed on the worktree HEAD
  sha. An uncommitted edit does not change HEAD, so the fold would take a cache hit and
  re-serve stale edges even after switching the ref. Simply changing the ref is
  insufficient: the declared cache must be re-keyed on a content fingerprint (or
  invalidated per structural rebuild) so a `.vault/` edit actually refreshes edges.
- **Parent-feature stability.** The fix rides mature, stable surfaces: the
  `ingest_core_graph` ref selector is already an `Option` parameter (the as-of path
  already passes explicit refs); the per-generation projection caches, the bounded
  coalescing watcher, and the commit/generation clock are all long-settled. Core
  `0.1.34` is the installed, pinned version; the behaviour relied upon (document-read-only
  working-tree graph) is verified against it, not assumed.
- **Historical views must not change.** The as-of and lineage routes remain strictly
  `--ref` with an explicit commit sha (committed, blob-true). Only the present view moves to the working tree.
- **Relation-kind fidelity.** Because kind is part of the edge id, the present-view path
  must preserve core's kind classification. Consuming core's own working-tree graph
  (this decision) gets this for free; it is the chief cost the rejected engine-side
  derivation alternative would have incurred.

## Implementation

The decision is **Option A**: the present-view declared-edge ingest reads the
**working tree** rather than committed HEAD, while every historical view stays on its
explicit commit ref.

At the ingest seam, the present-view path stops pinning `Some("HEAD")` and instead runs
core's working-tree `vault graph` (no ref), so the same corpus snapshot that produced
the nodes produces the edges. The historical/as-of path is untouched — it continues to
pass an explicit commit sha, preserving blob-true reconstruction for time travel. The
engine continues to consume core's classified edge kinds verbatim, so edge ids and the
typed-relation vocabulary are unchanged.

The declared-fold cache is re-keyed. Today it keys on the worktree HEAD sha, which is
invariant under uncommitted edits; it moves to a key derived from the working-tree
corpus content (a fingerprint over the scanned `.vault/` documents, the same signal
core itself already computes to gate its own cache), or, equivalently, the fold is
invalidated and recomputed on each structural rebuild. Either way the rule is: when a
`.vault/` document changes, the next rebuild refreshes both nodes and edges together.
The existing bounded coalescing watcher and per-generation projection caches already
bound the work; core's own fingerprint cache makes a no-change `vault graph` call cheap,
so re-running it per rebuild does not reintroduce the cost the HEAD-sha cache avoided.

The gitignored `.graph-cache` write that working-tree mode performs is accepted as
in-contract auxiliary cache. As **optional, non-blocking** hardening, a minimal upstream
ask is recorded for core: expose its existing `use_cache=False` library path as a
`vault graph --no-cache` (or `--pristine`) flag, after which the engine can pass it to
guarantee a strictly zero-write read. This is a follow-up, not a dependency of this fix.

The blast radius is the engine ingest and its API-layer declared cache; no wire-shape,
no frontend, and no contract change. The fix is validated by querying the live engine
for the previously edge-less uncommitted cluster and confirming its `related:` edges are
served, plus confirming an uncommitted `related:` edit refreshes edges without a commit,
and that historical as-of views are unchanged.

## Rationale

The research is decisive on two points that, together, make Option A both correct and
low-risk. The constraint that originally forced HEAD — corpus mutation on a working-tree
read — was re-verified and found absent in the installed core, so the trade that
sacrificed present-view consistency for safety no longer buys anything. And edge-id
stability across the working-tree/HEAD boundary means the switch introduces no
identity churn: an uncommitted edge keeps its id when committed, and a working-tree edge
and its eventual HEAD counterpart merge rather than flicker. Option A is preferred over
the engine-side derivation alternatives because it keeps core as the single authority for
relationship resolution and typed-kind classification (the engine consumes, it does not
re-derive), which both preserves edge-id fidelity for free and avoids duplicating logic
that would drift from core. It is preferred over aligning nodes to HEAD because that
solves the wrong end — hiding the in-progress authoring the dashboard exists to show.
The cache re-key is not optional polish; it is the second, mechanical half of the same
bug, and the research showed the symptom persists without it.

## Consequences

**Gains.** Uncommitted and untracked documents connect on the canvas the moment their
`related:` frontmatter is written; the present view becomes internally consistent
(nodes and edges from one snapshot); editing a committed document's `related:` in the
working tree now updates its drawn edges immediately rather than only after commit. The
fix is contained to the engine ingest and one cache, with no wire or frontend change,
and rides stable surfaces.

**Costs and pitfalls, framed honestly.** The present view now reflects uncommitted state
for edges as well as nodes — which is the intent, but it means the live graph is no
longer a committed-only artifact (historical views remain committed-true, so the
distinction is preserved where it matters). Re-keying the declared cache on content
means `vault graph` is invoked on each structural rebuild rather than only on HEAD
change; this is bounded by the existing coalescing watcher and cheap on a warm core
cache, but it is more core subprocess calls than before and must be measured so it does
not regress rebuild latency. The accepted `.graph-cache` write is a (gitignored,
re-derivable) filesystem write the engine triggers during a read; it is judged
in-contract, but that judgement is the decision's one soft edge and is why the `--no-cache`
upstream ask is recorded. Finally, the relation-kind fidelity guarantee depends on
continuing to consume core's classified edges; an engine that ever bypassed core to
derive edges itself would have to reproduce that classification or accept transient
double-draws across commits.

**Pathways opened.** A consistent present-view graph makes live multi-document authoring
legible, which is foundational for the agentic-authoring features. The recorded
`--no-cache` ask, if core adopts it, closes the last soft edge to a strictly zero-write
read.

## Codification candidates

- **Rule slug:** `present-view-graph-reads-one-corpus-snapshot`.
  **Rule:** The engine's live (present-view) graph must source its nodes AND its
  declared `related:` edges from the SAME working-tree snapshot — never nodes from the
  working tree and edges from committed HEAD — so uncommitted authoring is internally
  consistent; historical/as-of views read an explicit commit ref, and any
  corpus-reading subprocess must be document-read-only (no `.vault/` mutation), with its
  result cache keyed on corpus content, not on the HEAD sha (which an uncommitted edit
  does not change).
