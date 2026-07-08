---
tags:
  - '#adr'
  - '#codebase-graphing'
date: '2026-07-02'
modified: '2026-07-02'
related:
  - "[[2026-07-02-codebase-graphing-research]]"
---

# `codebase-graphing` adr: `a disconnected code graph corpus served beside the vault LinkageGraph` | (**status:** `accepted`)

## Problem Statement

The dashboard graphs the `.vault/` knowledge corpus (the engine's `LinkageGraph`
over documents, plan containers, and rule projections). The user wants the same
graph surface to also map the CODEBASE - source files and modules as nodes, with
edges from language-level imports and file/module containment - so the tool can
visualize a repository's structure the way it visualizes its decision record.

This is not a purely additive feature, and the shape of the addition is the whole
decision. Two standing rulings fence code out of the knowledge graph on purpose:
the strict reference-only ruling (2026-06-28) that in-body code mentions are not
graph fact, and the `index-node-exclusion` scope amendment (2026-06-21) that
extended "never a knowledge-graph node" to the `code` kind, gated by
`is_displayable_node` and mirrored by the frontend adapter that drops any
`code:`-prefixed node. The historical defect those rulings closed was the graph
CONFLATING vault with codebase - mixing source artifacts into the knowledge
model. The binding user directive for this feature (2026-07-02) is explicit: do
not reopen that. The vault graph is a stable, correct dataset and is NOT
modified. Codebase graphing is a NEW, fully DISCONNECTED, switchable dataset the
backend provides beside the vault graph; the frontend switches the whole graph
surface between a "vault" corpus and a "code" corpus. There are no doc-to-code
bridge edges and no mixed-node views. This ADR frames itself as compatible with
the standing rulings - a separate corpus, not a supersession of them - and
settles the architecture of that second corpus.

## Considerations

- **The directive is the load-bearing constraint.** The research (Part 4) records
  it verbatim: a separate, disconnected dataset, no cross-linkage. Every decision
  below is a consequence of keeping the two corpora provably disjoint - different
  node sets, different edge sets, different generation counters, no shared
  identity that could let one corpus's edges address the other's nodes. The
  bridge-edge idea the research raised as F8 is explicitly rejected framing here.
- **The vault contract must not drift.** The `LinkageGraph` wire shape, its
  bounded-slice envelope, its `tiers` block, and the frontend query cache are a
  precious, stable API. A second corpus must reuse the bounded-slice machinery
  without changing the vault contract's observable shape.
- **Shape conformance is a second directive (2026-07-02).** Backend and wire-shape
  similarity between the corpora is explicitly encouraged: the code corpus serves
  the SAME `GraphSlice` response shape (nodes, edges, `meta_edges`, `truncated`,
  `tiers`) and maps onto the SAME two-level granularity model the vault corpus
  uses, so the frontend's adapter, bounded query cache, and scene consume it with
  near-zero new shape code. Disconnection governs the DATA (no shared nodes or
  edges); conformance governs the SHAPE (identical envelope and slice schema).
- **The substrate mostly exists.** The research grounding inventory (G1-G8) found
  the code-node identity scheme already shipped and pinned (`code:{path}`), a
  bounded gitignore-aware worktree walk (`/file-tree`), a capped-and-timed
  subprocess runner, a content-fingerprint cache discipline
  (`worktree_corpus_fingerprint`), and the `MAX_GRAPH_NODES` / constellation-LOD
  bounding pattern. The missing pieces are extraction (imports/containment) and
  a second served corpus, not new infrastructure.
- **Extraction technique is a survey with a clear operating point.** The external
  survey (F1-F7) places file-level syntactic import extraction between
  manifest-only graphs and full compiler-backed indexing - the right point for a
  bounded local tool. `tree-sitter` is the in-process primitive; SCIP is the
  compiler-backed path but needs a compilable project and a per-language
  toolchain, fit only as a future opt-in background refresh. `stack-graphs`
  (full pure-Rust name resolution) was archived 2025-09-09 and is ruled out.
- **Bounds and read-only posture are inherited, not re-litigated.** Graph compute
  stays CPU (`graph-compute-is-cpu-gpu-is-render-and-search`); every read is
  bounded with an honest `truncated` block (`graph-queries-are-bounded-by-default`);
  a parse is a read, so extraction stays inside the read-and-infer fence
  (`engine-read-and-infer`); every accumulator is bounded at creation
  (`bounded-by-default-for-every-accumulator`).

## Considered options

- **A separate code graph corpus served beside the vault graph (CHOSEN).** Its own
  node/edge set, its own generation counter, its own cache; never merged with the
  `LinkageGraph`. The frontend switches which corpus the graph surface renders.
  Kept because it is the only shape that satisfies the disconnection directive
  while leaving the vault contract untouched.
- **A third granularity of the one `LinkageGraph` (rejected).** Model code as
  another node kind inside the existing graph, alongside document and plan-container
  granularity. Rejected: this is exactly the conflation the 2026-06-21 / 2026-06-28
  rulings closed; it would reopen the `code`-is-never-a-knowledge-graph-node ruling
  and risk mixed-node slices.
- **Doc-to-code bridge edges (rejected).** Connect decisions to the files that
  implement them (research F8). Rejected by explicit directive: any shared edge
  re-creates the conflation; the pre-existing `code:` id channels (timeline
  commit-touch, rag search annotation) are join keys INTO the code corpus when it
  is active, not cross-corpus edges.
- **SCIP subprocess indexers as the v1 extractor (rejected for v1).** Compiler-exact,
  symbol-resolved edges, but require a compilable project, a per-language toolchain,
  and tens of seconds to minutes per run. Rejected for v1 as too heavy and
  toolchain-coupled; defined as a future opt-in background refresh for symbol
  precision.
- **A per-language subprocess zoo (`grimp`, `dependency-cruiser`, `cargo-modules`)
  (rejected).** Accurate per language, but multiplies runtime/toolchain
  requirements and fragments the architecture across a Python runtime, a Node
  runtime, and Cargo. Rejected in favor of one in-process extractor.
- **Regex-based polyglot extraction (`emerge`-style) (rejected).** Minimum-viable,
  no grammar dependency, but lower fidelity than tree-sitter queries for the same
  in-process cost. Rejected: tree-sitter's syntactic accuracy is worth the
  grammar-crate compile cost.
- **Call-graph / symbol-level extraction (rejected / out of scope).** Multiplies
  node count 10-100x and needs compiler-grade name resolution and dynamic-dispatch
  handling; found in production only in specialized tooling. Out of v1 scope.
- **Git co-change overlay as a v1 edge kind (deferred).** A cheap behavioral edge
  layer (research F7). Deferred to a named future extension, gated by a window and
  a threshold; not part of the v1 edge vocabulary.

## Constraints

- **The disconnection is the invariant, not a preference.** The two corpora must
  never share a node id space in a way that lets an edge cross between them, and no
  served slice may mix corpora. This is the constraint a codification candidate
  below promotes.
- **Parent-feature stability.** The feature depends on: the `/file-tree` walk and
  its gitignore + always-ignore discipline (shipped, stable - G3); the
  `code:{path}` canonical key (shipped, pinned by tests - G1); the capped/timed
  subprocess runner and the fingerprint cache pattern (shipped - G6); the
  `MAX_GRAPH_NODES`-class ceiling and constellation LOD (shipped - G7); the shared
  `tiers`-block envelope (shipped). All are stable and already relied upon
  elsewhere. The genuinely new, lower-maturity dependency is the `tree-sitter` Rust
  crate family (v0.26.x, active) plus per-language grammar crates and hand-authored
  `.scm` import queries - a frontier surface only in that per-language import-path
  resolution (tsconfig paths, Python package roots, Rust `mod`/`use` mapping) is a
  per-language cost that must be built and tested, not delegated.
- **Grammar-crate weight.** Linking several tree-sitter grammar crates adds compile
  time and binary size to the engine. The pilot language set (Rust, TypeScript,
  Python, and JavaScript via the TypeScript grammar family) bounds that cost; adding
  a language is a bounded, deliberate addition, not an open-ended one.
- **No vault mutation, no git mutation.** Extraction reads the working tree and
  writes only a deletable, re-derivable engine-side cache - identical posture to the
  existing inferred-node projections.
- **Full lint + test gate before green** (`declaring-green-runs-the-full-gate`).

## Implementation

The feature layers as a new engine ingest crate, a second served corpus behind the
existing bounded-slice envelope, and a frontend corpus switch - with the vault graph
untouched throughout.

**D1 - Corpus model: a separate code graph store served beside the vault graph.**
The code graph is its own node set, edge set, and generation counter, held in its
own store beside the `LinkageGraph`, never merged into it. The vault graph's ingest,
identity, and wire shape are unchanged. Rejected: a third granularity of the one
`LinkageGraph`; any bridge edge. The disconnection is structural - the two corpora
cannot share nodes or edges because they are different datasets in different stores
with independent generations.

**D2 - Extraction: in-process tree-sitter in a new engine crate.** A new
`engine-*` ingest crate links per-language tree-sitter grammar crates and drives
per-language `.scm` import queries to extract file-to-file import edges
syntactically; containment edges (file -> directory -> workspace) derive from paths
at zero cost. Pilot languages are Rust, TypeScript, and Python, plus JavaScript via
the TypeScript grammar family. Per-language import-path normalization rules resolve
literal import strings to repo-relative target paths. A parse is a read, so the
crate stays inside the read-and-infer fence with no subprocess and no toolchain
dependency, and works on uncommitted working-tree files. Rejected: SCIP indexers
for v1, the per-language subprocess zoo, `stack-graphs` (archived), regex polyglot
extraction, call graphs, and a v1 git co-change overlay - each named above.

**D3 - Granularity and LOD: module rollup mirrors the constellation MECHANICALLY,
not just conceptually.** The stored code graph holds file nodes, file-to-file
import edges, module (directory) nodes, and file-to-module containment edges —
exactly as the vault graph stores document nodes AND feature nodes. The
module-level aggregated import edges are NOT stored fact: they are a
generation-memoized PROJECTION served as `meta_edges` (weight = count of
underlying file imports), precisely as the feature constellation serves its
aggregated `meta_edges` today. The granularity axis maps one-to-one onto the
existing enum: the constellation-class granularity serves module nodes plus
projected `meta_edges` (the unbounded-safe default), and the document-class
granularity serves file nodes plus raw import edges — only under a scoped descent
(directory-prefix filter or ego/neighbor query). Every served slice sits under
the existing `MAX_GRAPH_NODES`-class ceiling with an honest `truncated` block,
and the extraction walk respects `.gitignore` plus the always-ignore set by
reusing the `/file-tree` ignore discipline. Because the LOD split, the
`meta_edges` projection, and the slice schema all reuse the vault shapes
byte-for-byte, the frontend consumes the code corpus through machinery it
already has; a repo of 10k-100k files never serializes whole.

**D4 - Identity: reuse `code:{path}` for files; one new node kind for modules; one
new relation kind for imports; volatile-free edge keys.** File nodes reuse the
pinned, provenance-stable `code:{path}` canonical form already shipped and tested
(`CanonicalKey::CodeArtifact`). Module nodes are STORED nodes under a new node
kind and canonical key (a directory-scoped `code-mod:{dir}` form) - a deliberate,
additive identity contract event per `provenance-stable-keys-are-identity-bearing`,
composed only from the repo-relative directory path; the vault corpus never mints
it, so the vault contract is untouched. Import edges carry a new additive
`RelationKind::Imports` (kebab-case `imports` on the wire) at the `Structural`
tier - a deterministic extraction resolved against a working tree, which is that
tier's definition - and REUSE the existing `Provenance::DocumentBody
{blob_hash, span, target}` form verbatim (an import statement IS a body span);
its `stable_key` already excludes the volatile inputs (blob hash, byte span), so
a re-parse re-derives identical edge ids from `(src, dst, relation, tier,
resolved target)`. Containment edges reuse `RelationKind::Contains` at declared
confidence, mirroring the plan-container precedent, and carry a new additive
`Provenance::TreeLayout` variant (stable key `tree:{target}`) — neither the
core-graph nor the document-body provenance form truthfully describes
filesystem layout, and provenance is mandatory and honest by contract. A file rename mints a new
node id, the same behavior document stems carry today.

**D5 - Wire/API: a corpus parameter on the existing bounded-slice route family.**
The active corpus is a parameter (`vault` | `code`) on the existing `/graph/query`
and `/filters` family rather than a parallel `/code-graph/*` route tree. The route
handler dispatches to the vault store or the code store by the parameter; both
corpora ride the SAME shared envelope, so every response - success and error -
carries the `tiers` block for free, and the code corpus reports its own tier
honestly. This is the recommended option because it reuses the bounded-slice
envelope machinery and the tiers obligation without duplicating routes, WHILE
keeping the vault contract's observable shape unchanged: the parameter defaults to
`vault`, so an existing vault query is byte-identical to today. In the stores layer
the corpus becomes part of the TanStack query key, so the two corpora cache under
distinct identities and a corpus switch is a cache-key change, not a shape change.
The request-side filter grammar is fenced per corpus: code-only facets (language,
directory prefix) are additive optional fields, and a facet that does not belong
to the active corpus is a typed VALIDATION ERROR (envelope-shaped, tiers-bearing),
never silently ignored - so the union request shape cannot become semantic drift.
The `/filters` vocabulary route serves the ACTIVE corpus's facet vocabulary only,
so the frontend's facet controls populate per corpus with no mixed vocabulary.
Rejected: parallel `/code-graph/*` routes - they would fork the envelope, the
filter vocabulary, and the tiers wiring for no isolation benefit the parameter does
not already provide, since the store dispatch is where the corpora are actually
kept disjoint. The vault contract is isolated by the store boundary, the `vault`
default, and the per-corpus facet validation - not by a separate route.

**D6 - Cache and refresh: source-tree fingerprint key, generation-keyed
projections, incremental re-parse.** The extraction cache keys on a source-tree
fingerprint over the in-scope, non-ignored file set, mirroring
`worktree_corpus_fingerprint`'s discipline in a distinct key space, so an
uncommitted source edit misses the cache and re-parses while an unchanged tree
hits it. AMENDED at execution (review M2): the fingerprint composition is
`(path, byte length, mtime)` per file — the build-system-standard fast key —
rather than a content blob hash, because the freshness probe must cost one
metadata walk, not a full re-read of every source file per query. The accepted
trade-off: an edit that preserves BOTH size and mtime false-hits (editor
tooling always advances mtime; the window is one 2-second debounce period);
per-file content hashes are still computed at extraction and ride each node's
facet for exact provenance. Served slices are
generation-keyed projection-memoized over the code graph's own generation counter,
exactly as the vault projections memoize on the `LinkageGraph` generation. File
changes drive an incremental re-parse through the existing watcher/rebuild path over
a bounded channel. Present-view and any future as-of key spaces stay distinct, so a
code query can never serve a stale generation's slice.

**D7 - Frontend switching: a user-settings-backed view mode drives a live
dashboard-state corpus field.** AMENDED at frontend execution (2026-07-02): the
active graph corpus (`vault` | `code`) is realized as TWO composed layers,
mirroring the shipped `default_granularity` setting / `graph_granularity`
dashboard-state precedent exactly - the durable USER SETTING is the source of
truth, the dashboard-state field is the live driver:

- A durable engine SETTING `graph_corpus` (`Enum{vault,code}`,
  `ControlKind::Segmented`, `scope_eligible`) declared once in the settings
  registry - the user-settings-backed persistence and the rail control's
  vocabulary, rendered through the existing enum-control deriver (no new control
  component).
- A live `corpus` field on `DashboardState` (+ its patch) threaded into the
  `engineKeys.graph(...)` TanStack cache key AND the `/graph/query` request body,
  exactly as `graph_granularity` is. Flipping it changes the cache key, so
  TanStack refetches the other corpus and the scene reloads - the corpus switch
  is a cache-key change, not a shape change.
- The left-rail toggle (composing the centralized kit `SegmentedToggle`, one tab
  stop through the shared `FocusZone`) writes the durable setting; a
  settings-effect seeds `DashboardState.corpus` from it on load and on change
  (the `applyGraphSettingsDefaults` bridge), so the setting is the single source
  of truth and the dashboard-state mirror owns the live re-query.

The scene renders whichever corpus is active. The WIPE-AND-RELOAD the switch
requires is produced by the disconnection invariant itself: the two corpora share
NO node id (`doc:`/`feature:` vs `code:`/`code-mod:`), so a corpus swap's
`set-data` carries a fully DISJOINT node set, which the field's warm/cold gate
detects (`carried == 0`) and serves as the COLD path - a full re-explode plus a
one-time camera fit, i.e. the canvas wiped clean and reloaded, with no bespoke
reset command. The client working set (ego expansions) and pins are cleared on a
corpus change so no stale vault node id leaks into the code display (the
frontend half of the disconnection invariant). Vault-only affordances (the
feature constellation, doc-type facets) and code-only affordances (language and
directory facets) swap with the corpus. The existing frontend adapter exclusion
of `code:` nodes stays in force for the VAULT corpus and is gated OFF for the
code corpus (the adapter is told the active corpus) - the exclusion keeps the
vault graph clean, and the code corpus is a different dataset. Filters remain one
authority PER corpus: the code corpus has its own facet vocabulary, never mixed
with the vault filter.

**D8 - Bounds and safety: every accumulator bounded, extraction capped, tiers
honest.** Every cache, channel, and retained collection in the code-graph path is
bounded at creation. The extraction walk is capped at a maximum file count, a
maximum per-file size to parse, and a per-file parse timeout, so a pathological or
enormous repository degrades honestly - the `tiers` block reports the code corpus
tier as truncated or degraded and the served slice carries a `truncated` block -
rather than hanging or exhausting memory. A repo too large to fully parse yields a
bounded, honest partial graph, never a stall.

## Rationale

The disconnected-corpus shape (D1) is the direct expression of the binding directive
and the only shape that both delivers codebase graphing and honors the standing
rulings the research grounded (G2: strict reference-only, `code`-never-a-node). By
making the code graph a different dataset rather than a new node kind, the vault
graph stays the stable, correct model it is today, and the historical
vault/codebase conflation cannot recur - the two corpora are disjoint by
construction, not by discipline.

In-process tree-sitter (D2) is the survey's recommended operating point (F1, F5):
file-level syntactic import edges are cheap, sufficient for structure, clustering,
and impact views, and work on uncommitted files - matching the present-view
one-corpus-snapshot posture. It avoids the toolchain zoo (F4) and the archived
`stack-graphs` dead end (F2), while leaving SCIP (F3) and git co-change (F7) as
named, deferred extensions the identity and cache design already accommodate.

The bounding, identity, cache, and wire decisions (D3, D4, D6, D5) are deliberate
reuses of shipped, proven disciplines: the constellation-vs-document LOD split (G7),
the pinned `code:{path}` key (G1), the `worktree_corpus_fingerprint` cache pattern
(G6), and the shared tiers-block envelope. Reusing them keeps the new corpus cheap
to build and consistent with the vault graph's behavior, and the corpus parameter
(D5) reuses the envelope without ever changing the vault contract's shape - the
isolation the directive demands is achieved at the store boundary and the default,
where it is real, not merely at the URL.

## Consequences

- **A whole codebase becomes a first-class, switchable graph** beside the knowledge
  graph, using the same bounded, memoized, honestly-degrading machinery - the
  highest-value structural view the tool has lacked.
- **The vault graph is provably untouched.** No vault node, edge, identity, or wire
  shape changes; the corpus parameter defaults to `vault` and an existing query is
  byte-identical. The 2026-06-28 and 2026-06-21 rulings remain in force, unamended.
- **The pre-existing `code:` id channels gain a real target when code is active.**
  The timeline's commit-touch annotations and rag's search-hit `code:` ids become
  join keys INTO the code corpus (a navigation affordance when that corpus is the
  active surface), without ever becoming cross-corpus edges.
- **New per-language cost.** Each pilot language needs a grammar crate, an import
  `.scm` query, and hand-built import-path normalization; adding a language is a
  bounded, deliberate addition. Import-path resolution (tsconfig paths, package
  roots, `mod`/`use` mapping) is the main accuracy risk and the main test surface.
- **Grammar crates add engine compile time and binary size.** Bounded by the pilot
  set; a real, accepted cost of in-process extraction over a subprocess.
- **Fidelity is file-level, not symbol-level.** Cycles, clustering, and impact
  analysis are well served; precise symbol/call relationships are explicitly out of
  v1 and await the deferred SCIP opt-in. Literal import strings that resolve
  ambiguously are a known accuracy floor, honestly a v1 limitation.
- **Pathways opened.** SCIP background refresh for symbol precision, a git co-change
  overlay edge kind, and additional languages all extend this corpus without
  touching the vault graph or reopening the conflation.
- **Pitfall to guard.** The disconnection must be enforced structurally (distinct
  stores, distinct generations, corpus-scoped filters and query keys), or a future
  change could quietly let a code edge address a vault node - the exact conflation
  this ADR exists to prevent. The codification candidate below binds it.

## Codification candidates

- **Rule slug:** `code-graph-is-a-disconnected-corpus`.
  **Rule:** The code graph and the vault `LinkageGraph` are two disconnected
  corpora - separate node sets, separate edge sets, separate generation counters,
  separate stores, and separate per-corpus filter authorities - served beside each
  other behind one bounded-slice envelope and switched by a single centralized
  dashboard-state corpus field. They never share a node or an edge; there are no
  doc-to-code bridge edges and no mixed-corpus slices. The pre-existing `code:` id
  channels (timeline commit-touch, rag search annotation) are join keys into the
  code corpus when it is active, never cross-corpus edges. The frontend adapter's
  `code:`-node exclusion stays in force for the vault corpus and does not apply to
  the code corpus. (Promote only after this feature's first execution cycle review
  confirms the disconnection holds structurally; compatible with, and does not
  supersede, `index-node-exclusion` and the 2026-06-28 strict reference-only
  ruling.)
