---
tags:
  - '#adr'
  - '#vaultspec-engine'
date: '2026-06-12'
related:
  - "[[2026-06-12-dashboard-foundation-research]]"
---



# `vaultspec-engine` adr: `vaultspec engine architecture` | (**status:** `accepted`)

Migrated from the kickoff working set (`tmp/kickoff/`) on 2026-06-12; this
is the stamped record.

Source of truth for scope decisions is
`2026-06-12-dashboard-foundation-research`. Author: engine-architect, team
vaultspec-kickoff-specs, 2026-06-12.

Contract seam: the engine↔GUI surface is canonical in
`2026-06-12-dashboard-foundation-reference` (draft 2, AGREED with
experience-architect 2026-06-12). §7 summarizes the engine-side commitments.

______________________________________________________________________

## 1. Identity and scope

`vaultspec` is the unsuffixed binary above its suffixed siblings: a headless,
non-GUI **relationship / context aggregation engine**, shipped inside the
`vaultspec-dashboard` package. It is the outer, umbrella layer of the
ecosystem — the layer that understands the *landscape* (repositories,
branches, worktrees, time) within which each vault corpus lives, and that
reconstructs explicitly the vault↔codebase↔history linkage a coding agent
gets implicitly.

What it is:

- A **read-and-infer** engine. It ingests core's vault graph, the git object
  database, the working trees, and rag's semantic indexes, and produces a
  unified, tiered, provenance-carrying linkage graph plus context assemblies.
- A **resource-intensive performance engine** — implemented in Rust, designed
  around an in-memory graph with persistent incremental indexes, parallel
  ingestion, and a resident serve mode.
- The future **context-packing spine** for agent orchestration: "assemble
  everything relevant to this node" is the same operation as "pack context to
  dispatch an agent at this feature". Nothing in v1 may foreclose that.

What it is not:

- Not a renderer. The GUI consumes it; the engine never draws.
- Not a vault CRUD layer (core's jurisdiction) and not a semantic indexer
  (rag's jurisdiction). The division restated from the brief: **vault CRUD
  and semantic indexing stay in core/rag; cross-source, cross-branch
  relationship inference belongs to the engine.**
- Not a mutation surface. The engine never writes `.vault/` documents, and
  its own graph/query surface is read-only. One scoped exception, forced by
  the single-origin contract (§7): the serve mode hosts a *transparent* ops
  proxy (`/ops/*`) forwarding whitelisted sibling verbs verbatim — a browser
  SPA cannot exec core's CLI, so the engine is the only server-side hand
  available. The proxy carries no engine semantics; domain logic stays in
  the siblings.

**Proposed decisions**

- D1.1 — `vaultspec` is a single Rust binary with two modes: one-shot CLI
  verbs and a resident `serve` mode. Same engine, two front doors.
- D1.2 — The engine carries **no sibling control semantics**: it is strictly
  read-and-infer (no `.vault/` writes, no engine-owned mutation semantics,
  ever; orchestration later builds *beside* it, not by widening it). Under
  contract §6 the serve mode *forwards whitelisted sibling verbs verbatim*
  as a transparent, namespaced `/ops/*` proxy and originates none of its
  own.
- D1.3 — Inference results live in engine-owned storage (§8), never written
  back into vault documents or core's graph.

______________________________________________________________________

## 2. The outer framework: workspace → repository → refs → index

This is the layer that exists nowhere today. The model is a four-stage
funnel, each stage a queryable artifact in its own right.

### 2.1 Workspace discovery

Input is a directory. The engine resolves it to a **workspace**: the git
repository it belongs to (common-dir resolution handles being launched from
inside any worktree), and the set of sibling worktrees of that repository.
A workspace is identified by the repository's common git dir, not by the
launch path — launching from `…-worktrees/main` or `…-worktrees/feature-x`
resolves to the *same* workspace.

### 2.2 Repository understanding

From the workspace the engine enumerates:

- **Worktrees** — the local, disk-persisted development environments. Each
  worktree = (checkout path, HEAD ref, dirty state). Worktrees are the
  primary scopes: they are where structural resolution (file paths, symbols)
  actually has a working tree to resolve against.
- **Local branches**, classified by a cheap convention heuristic into
  default / feature / other (configurable pattern, default: anything not the
  default branch is a candidate feature branch; a branch whose vault corpus
  contains feature tags absent from the default branch is *confirmed*
  feature-carrying). Classification is advisory metadata, never a gate, and
  the corpus-diff confirmation step is computed **lazily** (on `/map`
  expansion or first scope touch, then cached) — cold start never ingests
  every branch's corpus just to classify it.
- **Remote feature branches without a local worktree** are mapped as refs
  only (commit-level and vault-blob-level visibility via the object DB, no
  structural resolution — there is no tree on disk to resolve against). This
  is the honest degradation for the brief's tabled "worktree vs. remote
  branch" question: remote refs get the declared + temporal tiers, worktrees
  get all four.

### 2.3 Corpus views

Each (workspace, ref-or-worktree) pair under which a `.vault/` exists is a
**corpus view**: one vault corpus as it stands on one line of development.
The same logical corpus appears in multiple views; the node model (§4)
reconciles identity across them. **Scope is stateless**: every
working-tree-dependent query names its scope (worktree or ref) per request —
CLI via `--scope`, serve mode via a required `scope` parameter (contract §3).
The engine holds no active-scope state; the launch worktree is only the
advertised default (`/map`) and the CLI's implicit `--scope` fallback.

### 2.4 Dynamic indexing

Indexing is incremental and watcher-driven, mirroring the posture rag already
proves:

- **Ingestion sources:** core's `vault graph --json` (per corpus view, via
  the scope's checkout; schema `vaultspec.vault.graph.v2`), document bodies
  (read directly for structural extraction — reading files is not CRUD), git
  log/object DB (temporal tier), rag HTTP (semantic tier, lazy).
- **Watcher:** filesystem watch over each worktree's `.vault/` and `.git`
  (HEAD moves, new refs, new worktrees), debounced, driving partial
  re-ingestion of only the dirtied corpus view / ref range.
- **Cold start is a feature:** a full index pass is parallel (per-view, per-
  source fan-out) and must be fast enough to make `vaultspec` usable as a
  one-shot CLI without a resident service — the resident mode is an
  optimization (warm cache + push updates), not a requirement.
- **Cache discipline:** every derived artifact is keyed by content hash of
  its inputs (doc blob hash, commit SHA, core graph payload hash), so
  re-index is skip-heavy and deterministic.

**Proposed decisions**

- D2.1 — Workspace identity = repository common git dir; worktrees and refs
  are scopes within it, not separate workspaces.
- D2.2 — Worktrees are first-class and privileged: all four linkage tiers.
  Remote refs without a checkout degrade to declared + temporal. Degrade,
  don't demand.
- D2.3 — Branch classification (default/feature/other) is heuristic,
  configurable, advisory — never load-bearing for correctness — and its
  corpus-confirmation step is lazy and cached, protecting cold-start cost
  on branch-heavy repositories.
- D2.4 — Incremental, content-hash-keyed indexing with a filesystem watcher
  in serve mode; one-shot CLI runs the same pipeline cold and must stay
  usable without a resident service.
- D2.5 — Git access via the pure-Rust `gix` (gitoxide) library, not libgit2
  bindings and not shelling out to `git` — performance engine posture, no
  C dependency, no PATH dependency.

______________________________________________________________________

## 3. Linkage and provenance data model

The decided four-tier model, made concrete. **The edge is the atom of the
engine.** Every edge, regardless of tier, is:

```
Edge {
  src: NodeId,
  dst: NodeId,
  relation: RelationKind,     // fulfills | implements | resolves | reviews |
                              // references | mentions | touches | resembles | …
  tier: Declared | Structural | Temporal | Semantic,
  confidence: f32,            // tier-calibrated, see below
  state: Option<Resolved | Stale | Broken>,   // structural tier only
  provenance: Provenance,     // who said so, from what input, when
  scope: ScopeRef,            // which corpus view / ref this edge holds in
  observed_at: Timestamp,
}
```

`Provenance` records the producing source concretely: the core graph payload
hash + edge id (declared); the document blob + byte span + resolved target
path/symbol (structural); the commit SHA + correlation rule that fired
(temporal); the rag query, result rank, and score (semantic). Provenance is
what makes an edge auditable and re-derivable; it is never optional.

Tier semantics and confidence bands (fixed bands, not a learned scale —
simplicity over false precision):

- **Declared** (confidence 1.0) — ingested from core's graph v2 payload:
  typed weighted explicit edges, `kind`/`multiplicity`/`weight` preserved.
  Doc↔doc only. Core's separate `derived_edges` array is ingested as a
  distinct relation (`core-derived`) at confidence 0.8 — never mixed into
  declared, mirroring core's own discipline.
- **Structural** (0.9 resolved / 0.5 stale / retained-but-flagged broken) —
  deterministic extraction from document bodies: file paths, step
  identifiers (`W##.P##.S##` — the exec-record filename schema makes these
  parse-stable), wiki-link stems, and code symbols, resolved against the
  scope's working tree. v1 resolves paths and step IDs exactly and symbols
  by qualified-name match; tree-sitter-grade symbol resolution is a v2
  upgrade, not a v1 gate. *Resolution state is signal:* stale/broken edges
  are kept and surfaced, not dropped — "this plan references a file that no
  longer exists" is exactly what an operator wants to see.
- **Temporal** (0.3–0.9 by rule) — commit↔record correlation. v1 rules, in
  descending confidence: explicit step/feature identifier in commit message
  (the opt-in core enrichment, when adopted — 0.9); commit touches both a
  vault document and code files within one commit (0.7); path-overlap within
  a time window around a record's date (0.4); same-day same-branch
  co-activity (0.3). Rules are additive and independently attributable in
  provenance. The enrichment upgrades confidence where adopted; absence of
  the convention degrades confidence, never breaks the tier.
- **Semantic** (rag score, capped at 0.7) — RAG matches between a node's
  content/linkage and code or doc chunks. Lazily computed (on node expansion
  or explicit discovery, not during bulk indexing), cached with TTL,
  **ephemeral**: semantic edges are suggestions, never persisted as graph
  fact, always labelled, omitted from any historical (`as_of`) view, and
  absent entirely when rag is down. The recovery mechanism when the
  deterministic tiers fail — and visibly nothing more.

**Proposed decisions**

- D3.1 — One edge schema across all four tiers; tier and provenance are
  mandatory fields, never inferred from context.
- D3.2 — Fixed per-tier confidence bands as above; no learned or tunable
  confidence in v1.
- D3.3 — Structural resolution state (resolved/stale/broken) is a retained,
  surfaced property — broken edges are signal, not garbage.
- D3.4 — Temporal correlation is a set of named, independently-attributed
  rules; the core commit-metadata enrichment is an upgrade path consumed
  opportunistically, never required.
- D3.5 — Semantic edges are ephemeral, lazily computed, TTL-cached, capped
  below structural confidence, and excluded from historical views.

______________________________________________________________________

## 4. Node model and identity across branches

### 4.1 The convergence is the entity

Following the brief's lean, adopted as decided here: **the primary node is
the convergence of cross-references, and the canonical convergence is the
feature** — the cluster of relations among its research, ADRs, plans, exec
records, and audits. Core already gives features a stable, mandated key (the
`#{feature}` tag, kebab-case, consistent across the lifecycle); the engine
gets entity identity for free by standing on that convention.

Node kinds, with their identity keys:

| Kind            | Identity key                              | Branch-variant? |
| --------------- | ----------------------------------------- | --------------- |
| Feature         | feature tag                               | no (key) — yes (facets) |
| Document        | vault stem (filename sans `.md`)          | no — yes        |
| Plan container  | plan stem + canonical id (`W##/P##/S##`)  | no — yes        |
| Commit          | SHA                                       | inherently ref-scoped |
| Code artifact   | repo-relative path (+ symbol qualifier)   | yes per ref     |

### 4.2 Identity across branches: key vs. facet

The reconciliation rule: **identity lives in the key; branch variance lives
in facets.** A feature node `editor-demo` is *one node* across every corpus
view. Per view, the node carries a **facet**: presence (exists / absent /
archived), document set, lifecycle state (plan 60% checked on `feature-x`,
30% on `main`), and content hashes. Divergence between facets is not a
conflict to resolve — it *is the information*: "this feature is ahead on its
branch" is precisely the outer-framework insight nothing else provides.

Documents and plan containers reconcile the same way (stem / canonical id as
key, per-view facet). Core's gap-no-reuse guarantee on canonical step IDs
makes plan-container identity survive plan mutation. Renames across branches
are out of v1 scope: a renamed stem is two nodes (one absent-facet, one new),
honestly reported; rename detection is a v2 heuristic.

### 4.3 Nodes are live lenses

A node is an aggregation point with discovery capability, not a dot:

- **Attached evidence:** its documents (reachable by descent from the
  convergence), per the brief's decided framing.
- **Interior structure:** a plan node opens into waves/phases/steps with
  state; exec records bind to specific steps.
- **Codebase discovery:** the node's structural edges resolve its mentioned
  files/symbols/lines against the active scope, with live resolution state.
- **Self-scoped semantic discovery:** the node can execute rag queries built
  from its own content + linkage to *discover more* — the explicit,
  user-triggered form of the semantic tier.
- **Query-time derivations:** per-tier degree counts (`degree_by_tier`) and
  lifecycle/progress summaries (e.g. plan 7/12 steps done) promised on
  graph nodes by contract §4 are engine-derived at query time from the
  in-memory graph and facets — they are projections, not stored node
  fields.
- **Context assembly:** `context(node)` returns everything above as one
  tier-labelled bundle. This function is the orchestration-era contract: it
  must remain a pure, serializable read so it can later feed agent dispatch
  unchanged.

**Proposed decisions**

- D4.1 — Feature (keyed by feature tag) is the primary entity; documents are
  evidence attached to convergences. Document/plan-container/commit/code
  nodes exist as first-class but subordinate kinds.
- D4.2 — Cross-branch identity = stable key + per-corpus-view facets; facet
  divergence is surfaced as signal, never auto-merged.
- D4.3 — No rename detection in v1; renamed stems are reported as
  absence + novelty.
- D4.4 — `context(node)` is a pure serializable read and the stable seam for
  the future orchestration layer.

______________________________________________________________________

## 5. Integration boundaries

### 5.1 vaultspec-core (required)

- Consumed via **CLI subprocess with `--json`** — core is Python, the engine
  is Rust; process boundary is the only sane seam, and core's `--json`
  envelopes are versioned (`vaultspec.vault.graph.v2`). Primary verbs:
  `vault graph --json` (declared tier, per corpus view; `--node`/`--depth`
  for ego refresh), `vault list/stats/feature list --json` (inventory),
  `vault check --json` (health passthrough for /status).
- Document **bodies are read directly from disk/object-DB** for structural
  extraction. Reading is not CRUD; the engine still never writes.
- Schema versioning: the engine pins the graph schema versions it
  understands and fails loud (in /status) on an unknown version rather than
  guessing.
- Wishlist filed against core, not patched around: the in-flight date-stamp
  mandate (temporal tier upstream dependency — track its landing); the
  opt-in commit-linkage enrichment; a long-run `vault graph` that accepts an
  explicit ref (today the engine runs core inside each checkout, which works
  but costs a worktree).

### 5.2 vaultspec-rag (optional, always)

- Consumed via its **resident HTTP service** on loopback (bearer-token
  routes, `service.json` discovery) — never via Python import, never bundled.
  The published wheel's torch-free guarantee is untouchable.
- Used internally for the semantic tier (scoped queries for edge suggestion
  and node self-discovery). The engine carries **no search semantics**: per
  contract §8 the serve mode forwards rag search (`/search`) and whitelisted
  rag control verbs (`/ops/rag/*`) as transparent pass-throughs — node-id
  annotation on search results is the engine's only addition. It never
  manages rag's lifecycle on its own initiative and never re-implements
  search or embeddings.
- Absence/death of rag = semantic tier absent + a truthful /status entry.
  All other tiers, and the whole engine, function fully without it.
- Delineation vs. rag's own code indexing, restated from the brief: rag
  indexes one project's working tree *semantically*; the engine maps the
  multi-branch repository landscape *relationally* and consumes rag as one
  linkage tier. The engine builds no embeddings, ever.

### 5.3 git

- Via `gix` in-process (D2.5). The engine treats the object DB as read-only
  truth; it never mutates refs, trees, or config.

**Proposed decisions**

- D5.1 — Core boundary = CLI `--json` subprocess + direct read of document
  bytes; pinned schema versions; loud failure on unknown schemas.
- D5.2 — Rag boundary = loopback HTTP only, optional at runtime; the
  engine's own use of rag is the semantic tier only. Search and rag control
  transit the engine solely as transparent namespaced pass-throughs (D7.5,
  contract §6/§8); the engine originates neither and carries no search
  semantics beyond node-id annotation.
- D5.3 — Surface gaps discovered in siblings are filed against the siblings
  (the wishlist above), not worked around in the engine.

______________________________________________________________________

## 6. CLI surface (agent/operator front door)

All verbs accept `--json` (machine envelope, same vocabulary discipline as
core) and `--scope <worktree|ref>`. Conceptual inventory, not final flags:

- `vaultspec map` — the §2 landscape: repo, branches, worktrees, corpus
  views, classification.
- `vaultspec index [--full]` — run/refresh the index pipeline; incremental
  by default, content-hash skip-heavy.
- `vaultspec graph [--filter …] [--as-of …]` — export the linkage graph
  (node-link JSON, tier-labelled edges).
- `vaultspec node <id> [--context] [--tiers …]` — node detail / full context
  assembly.
- `vaultspec events [--from --to --kinds --bucket]` — the temporal event
  stream; same event shape as contract §5 (stable id, ts, kind, ref,
  `node_ids[]`; bucketed = per-bucket counts by kind).
- `vaultspec serve [--port …]` — resident mode (§7).
- `vaultspec status` — index state, backend health rollup, watcher state.

**Proposed decisions**

- D6.1 — CLI verbs and serve endpoints are thin shells over one shared query
  core; no capability exists in only one front door.
- D6.2 — `--json` envelopes follow core's established result vocabulary so
  agents already fluent in the siblings parse the engine for free.

______________________________________________________________________

## 7. Serve/query surface for GUI clients (contract seam)

Canonical form: `2026-06-12-dashboard-foundation-reference` — **AGREED** at
capability level with experience-architect, 2026-06-12 (draft 2; all
redlines resolved). Engine-side commitments, summarized:

- **Single origin.** `vaultspec serve` serves the SPA bundle, the query API,
  the ops proxy, and the SSE stream on one loopback HTTP origin; JSON
  payloads, SSE streaming, `service.json` discovery (rag's pattern),
  `/health` ungated, everything else bearer-gated.
- **Stable identity:** node ids (kind + canonical key) and edge ids (content
  hash) are stable across queries, scopes, and time — the GUI animates by
  id. Unbounded responses are cursor-paginated; every response carries a
  per-tier degradation block.
- **Families:** `/map` + `/vault-tree` (landscape; **scope is fully
  stateless** — a required, per-request-validated parameter on every
  working-tree-dependent endpoint, no server-held scope state);
  `POST /graph/query` with an engine-owned, validated, echoed filter object
  and `/filters` vocabulary enumeration; `/nodes/{id}` (interior structure),
  `/neighbors` (lazy ego), `/evidence` (docs, resolved code locations,
  correlated commits), `POST /discover` (node-scoped rag candidates);
  `/events` with **engine-side bucketing** (raw events carry stable id, ts,
  kind, ref, `node_ids[]`); time-travel as **keyframe + diff**
  (`/graph/asof`, `/graph/diff`) so the playhead scrubs on a client-applied
  delta log; `/status` snapshot + multiplexed `/stream` SSE (graph deltas,
  fs, git, backends, index progress). Diff entries and the live `graph`
  channel share **one monotonic delta clock** (`last_seq` / `since=`
  splice).
- **Pass-throughs (single-origin consequence):** `/ops/core/*` (whitelisted
  core CLI verbs via subprocess `--json`) and `/ops/rag/*` (forwarded rag
  control), envelopes verbatim; `/search` forwards rag search and annotates
  results with engine node ids for click-through into the graph.

**Proposed decisions**

- D7.1 — Single-origin loopback HTTP + JSON + SSE; engine serves the SPA;
  no WebSocket/gRPC in v1. A later Tauri shell changes nothing here.
- D7.2 — Filter is an engine-owned validated object; vocabulary is
  server-enumerated via `/filters`; clients render, never define, it.
- D7.3 — Historical (`as_of`) views serve declared + structural + temporal
  tiers only; semantic is present-only (consistent with D3.5). Historical
  views are **blob-true**: node lifecycle/progress at T (e.g. plan
  check-state) is reconstructed from the document blobs as committed at T
  via the git object DB — never from the present working tree.
- D7.4 — Time-travel is keyframe + ordered diff log (option (b)); graph
  liveness over SSE reuses the same delta shape.
- D7.5 — Sibling operations and search transit the engine only as
  transparent, whitelisted, namespaced pass-throughs (no engine semantics
  beyond node-id annotation on search results).

______________________________________________________________________

## 8. Persistence and performance posture

- **Hot path in memory:** the linkage graph (nodes, edges, facets) is an
  in-memory adjacency structure; all queries answer from RAM. Vault corpora
  are thousands of documents, not millions — the graph fits; the expensive
  part is ingestion, not storage.
- **Persistence = cache, not truth:** a single-file embedded **SQLite**
  store (via `rusqlite`) under `.vault/data/engine-data/` (sibling
  convention to rag's `search-data/`, gitignored, invisible to core's
  scanner). It holds derived artifacts keyed by input content hashes —
  extraction results, temporal correlations, the event log, semantic TTL
  cache. Deleting it loses nothing but warm-up time; truth is always
  re-derivable from core + git + rag.
- **Why SQLite over a graph DB / custom store:** the graph lives in memory
  anyway; what persistence needs is durable, queryable, transactional,
  zero-ops storage for derived rows and the temporal event log — exactly
  SQLite's sweet spot. A graph database is a second operational system for
  no v1 gain.
- **Concurrency model:** tokio for the serve mode and subprocess/HTTP I/O;
  rayon (or spawn-blocking pools) for CPU-bound ingestion fan-out
  (per-corpus-view, per-document, per-ref-range). Single-writer index, many
  concurrent readers (the rag posture, kept).

**Proposed decisions**

- D8.1 — In-memory graph for queries; SQLite at `.vault/data/engine-data/`
  as a rebuildable derived-artifact cache. No graph database.
- D8.2 — Truth is re-derivable: `vaultspec index --full` from a deleted
  cache must converge to the identical graph.

______________________________________________________________________

## 9. Rust architecture posture (crate-level shape)

One cargo workspace, one shipped binary. Crates by responsibility, with the
dependency arrow always pointing at `engine-model`:

```
vaultspec-cli  (bin: clap verbs)        vaultspec-api  (axum serve: HTTP+SSE)
        \                                   /
         +----------- engine-query --------+        ← one shared query core (D6.1)
                          |
                    engine-graph                    ← in-memory graph, facets,
                          |                            context assembly, filters
        +---------+-------+--------+-----------+
        |         |                |           |
  ingest-core  ingest-git    ingest-struct  rag-client
  (core CLI    (gix: refs,   (body extract: (semantic tier,
   --json       worktrees,    paths, step    loopback HTTP,
   adapter)     temporal      ids, symbols)  TTL cache)
                rules)
                          |
                    engine-store (rusqlite cache)   engine-model (types: Node,
                                                    Edge, Tier, Provenance,
                                                    ScopeRef — no I/O)
```

- `engine-model` is pure types, zero I/O — the vocabulary every crate shares
  and the thing the future orchestration layer links against.
- Each ingest crate is independently testable against fixtures (a recorded
  core `--json` payload, a fixture repo, fixture documents) without the
  others existing.
- `engine-query` is the single implementation behind both front doors; the
  CLI and the API crates contain no domain logic.
- Key dependencies, deliberately few: `gix`, `tokio`, `axum`, `rusqlite`,
  `serde`, `clap`, `notify`, `rayon`. No C-linkage requirement anywhere.

**Bundling note (implementation detail per the brief, posture only):** the
engine is built per-platform and shipped inside platform-specific
`vaultspec-dashboard` wheels; the Python entry point locates the bundled
binary via package data and execs it. The Rust workspace lives in this
repository so engine and dashboard version together.

**Proposed decisions**

- D9.1 — Single cargo workspace in this repo; crate split as above;
  `engine-model` is the dependency sink.
- D9.2 — Per-platform wheels carry the binary; the Python package is a thin
  locator/launcher for it. Mechanics deferred, posture fixed.

______________________________________________________________________

## 10. Decision register (rollup)

| ID | Decision |
| --- | --- |
| D1.1–D1.3 | One Rust binary, CLI + serve; engine core strictly read-and-infer (sole exception: the namespaced `/ops/*` pass-through); inferences never written back |
| D2.1–D2.5 | Workspace = common git dir; worktrees privileged, remote refs degraded; advisory branch classification; incremental hash-keyed indexing; `gix` |
| D3.1–D3.5 | One edge schema; fixed confidence bands; broken-edge retention; named temporal rules with opportunistic enrichment; ephemeral semantic tier |
| D4.1–D4.4 | Feature-convergence as primary entity; key+facet cross-branch identity; no v1 rename detection; `context()` as orchestration seam |
| D5.1–D5.3 | Core via CLI `--json` + direct body reads; rag via optional loopback HTTP; sibling gaps filed upstream |
| D6.1–D6.2 | One query core behind both front doors; core-compatible JSON envelopes |
| D7.1–D7.5 | Single-origin loopback HTTP+JSON+SSE serving the SPA; stateless per-request scope; engine-owned filter objects; semantic excluded from `as_of`; blob-true keyframe+diff time-travel on one delta clock; transparent whitelisted pass-throughs |
| D8.1–D8.2 | In-memory graph + SQLite derived cache; full re-derivability |
| D9.1–D9.2 | Cargo workspace here; per-platform wheels bundle the binary |

**Upstream dependencies (register inputs — tracked against the siblings, not
decided here):**

- U1 — vaultspec-core's in-flight **date-stamp mandate** across the graph API
  and vault documents: the temporal tier and the timeline build on it; track
  its landing.
- U2 — vaultspec-core's proposed **opt-in commit-linkage enrichment** (step/
  feature identifiers in commit metadata): upgrades temporal confidence where
  adopted; consumed opportunistically, never required (D3.4).
- U3 — Wishlist filed against core: a **ref-scoped `vault graph`** (accept an
  explicit ref) so the engine need not run core inside each checkout to
  ingest per-view declared edges.
