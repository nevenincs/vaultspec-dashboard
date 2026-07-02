---
tags:
  - '#research'
  - '#codebase-graphing'
date: '2026-07-02'
modified: '2026-07-02'
related:
  - '[[2026-06-16-code-artifact-nodes-adr]]'
  - '[[2026-06-14-dashboard-code-tree-adr]]'
  - '[[2026-06-20-index-node-exclusion-adr]]'
  - '[[2026-06-30-graph-worktree-edge-consistency-adr]]'
  - '[[2026-06-13-graph-scale-hardening-adr]]'
---

# `codebase-graphing` research: `mapping a codebase as a node network`

Feasibility research for extending the existing Vault graphing (the engine's
`LinkageGraph` over `.vault/` documents) to CODEBASE graphing: source files and
modules as nodes, with edges from language-level imports (e.g. Python header
imports), documentation cross-links, and file/module containment structure as a
clustering signal. Two research threads were run: (1) a grounding inventory of
what the engine already has for code artifacts, and (2) an external survey of
tools and techniques for multi-language codebase graph extraction. This document
grounds a future ADR; it decides nothing.

## Findings

### Part 1 — What the engine already has (grounding inventory)

**G1. The code-node identity scheme exists and is stable, but no code node is
ever minted.** `NodeKind::CodeArtifact` is a shipped model variant
(`engine-model/src/lib.rs:37`) with the canonical key
`CanonicalKey::CodeArtifact { path, symbol }` yielding wire ids `code:{path}` /
`code:{path}#{symbol}` (`engine-model/src/id.rs:32-35, 64-67, 79`; forms pinned
by tests). However, no production ingest path calls `upsert_node` with a
`CodeArtifact` kind. The identity contract is decided-and-stable; the node
population is entirely unbuilt.

**G2. The prior code-node plan was superseded, not completed.** The
code-artifact-nodes ADR (2026-06-16, accepted) planned to mint `code:` nodes
from resolved Path/Symbol body mentions. Today's `ingest-struct` has only two
mention kinds — `StepId` and `WikiLink` (`ingest-struct/src/extract.rs:14-21`)
— with the module comment "Code paths and code symbols are prose, not graph
relationships." A 2026-06-28 user ruling (recorded at
`engine-graph/src/index.rs:384-391`) made the graph STRICT reference-only:
in-body mentions are not graph fact, and the structural body-mention edge
producer was retired (extraction survives only as change-detection telemetry).
Separately, the index-node-exclusion ADR's 2026-06-21 scope amendment extended
"never a knowledge-graph node" to the `code` kind, and the display gate
`is_displayable_node` returns false for `CodeArtifact`
(`engine-query/src/graph.rs:199-207`). The frontend independently drops any
`code:`-prefixed node at the adapter boundary
(`frontend/src/stores/server/liveAdapters.ts:270-276`). Consequence: codebase
graphing is NOT a purely additive feature — it must deliberately reopen or
scope-around two standing rulings (the strict reference-only graph, and
code-never-a-knowledge-graph-node), most plausibly by making the code graph a
DISTINCT graph surface/corpus rather than mixing code nodes into the vault
knowledge graph.

**G3. Worktree walking already exists as a bounded, gitignore-aware listing.**
`GET /file-tree` (`ingest-git/src/file_tree.rs`,
`vaultspec-api/src/routes/file_tree.rs`) walks one directory level per call,
cursor-paginated, capped at 2000 children per level, honoring `.gitignore`
directory names plus an always-ignore set (`node_modules`, `target`, `dist`,
`__pycache__`, `venv`), metadata-only, degrading honestly on non-worktree
scopes. Every listed file already carries its derived `code:<path>` node id as
a navigation anchor. This is the natural node-enumeration substrate for a code
graph.

**G4. `code:` ids already flow through two live channels.** The temporal tier
maps every non-`.vault` commit-touched path to a `code:` id
(`engine-store/src/events.rs:25-43`), so timeline events already reference code
nodes that do not exist (the known click dead-end). The rag `/search`
pass-through annotates code hits with `code:` node ids
(`rag-client/src/search.rs`). Minting code nodes would immediately give both
channels real join targets.

**G5. rag offers no graph structure to reuse.** The engine reaches
vaultspec-rag over HTTP only; rag's codebase index is embeddings-only (dense
chunk vectors, no adjacency). Code-chunk embedding consumption is an explicitly
deferred scope (`rag-client/src/vectors.rs:47`). Import/edge extraction cannot
be delegated to rag.

**G6. The extraction-subprocess pattern and cache discipline already exist.**
`CoreRunner::run_json` carries a 64 MiB stdout cap plus wall-clock timeout
(`ingest-core/src/runner.rs`), and the present-view declared fold is cached by
`worktree_corpus_fingerprint` — a content hash over in-scope document blob
hashes — so an uncommitted edit misses the cache (`engine-graph/src/index.rs:676-692`).
A code-graph extractor (in-process or subprocess) would follow exactly this
shape: content-fingerprint cache key over the in-scope source files, bounded
output, generation-keyed projection memoization
(`vaultspec-api/src/app.rs:118-160`).

**G7. Bounds and LOD are settled disciplines the code graph must inherit.**
`MAX_GRAPH_NODES = 5000` (`engine-query/src/graph.rs:214`) governs every served
slice; the vault graph's constellation-vs-document LOD split is the shape a
code graph must mirror (module/directory rollup as the default LOD, file
granularity only under a scoped/bounded descent). Graph compute stays CPU;
GPU is render/search only.

**G8. Frontend enrollment surface is small and known.** Admitting a code
category would touch: the adapter exclusion gate, the engine display gate, one
new scene category color/glyph band, a new facet value in the engine filter
vocabulary consumed by the legend, and the granularity boundary (code nodes at
document granularity or a dedicated code LOD, never the feature constellation).

### Part 2 — External tools and techniques survey

**F1. tree-sitter is the practical in-process extraction primitive.** The
`tree-sitter` Rust crate is actively maintained (v0.26.8, 2026-03) with
first-party grammar crates covering Rust, Python, TypeScript/JavaScript, Go,
C/C++ and dozens more; a single binary can link many grammars. The query DSL
(`.scm` files) extracts import/use/require statements and definitions
syntactically in microseconds per file — no build system, no subprocess, works
on uncommitted working-tree files, supports incremental re-parse. Sources:
crates.io/crates/tree-sitter; github.com/tree-sitter/tree-sitter/wiki/List-of-parsers.

**F2. tree-sitter-graph is the declarative edge-schema extension point;
stack-graphs is dead.** `tree-sitter-graph` (pure Rust, active) maps AST
captures to arbitrary graph nodes/edges via per-language `.tsg` files.
`github/stack-graphs` — the full cross-file name-resolution layer on top of it
— was archived by GitHub on 2025-09-09 and must not be adopted. Full local
name resolution in pure Rust therefore means building it yourself or delegating
to compiler-backed indexers. Sources: github.com/tree-sitter/tree-sitter-graph;
github.com/github/stack-graphs.

**F3. SCIP is the compiler-backed path; LSIF is deprecated.** Sourcegraph's
SCIP (protobuf; a Rust consumer crate `scip` exists) superseded LSIF; per-
language indexers exist (`rust-analyzer scip` natively, `scip-typescript`,
`scip-python`, `scip-go`, …). They produce exact, name-resolved symbol-level
edges but require a compilable project, an installed per-language toolchain,
and tens of seconds to minutes per run — fit only as an opt-in background
refresh subprocess, not per-request ingest. Kythe, Glean, and CodeQL are
heavyweight (build-system integration, distributed compute, or 14 GB+ resource
class) and are ruled out for a local bounded engine. Sources: scip-code.org;
sourcegraph.com/blog/announcing-scip; crates.io/crates/scip;
kythe.io/docs/kythe-overview.html; codeql.github.com/docs/codeql-overview/system-requirements.

**F4. Per-language subprocess tools exist but fragment the architecture.**
Python: `grimp` (queryable import graph), `pydeps`, `modulegraph` — all require
a Python runtime. JS/TS: `dependency-cruiser` (JSON node/edge output,
tsconfig-path-aware) — requires Node. Rust: `cargo metadata` (crate-level
edges, bounded JSON) and `cargo-modules` (module-level). Each is accurate for
its language but a per-language subprocess zoo multiplies toolchain
requirements; the survey's polyglot reference (`emerge`, regex-based, 12
languages) demonstrates the minimum-viable technique but with lower accuracy
than tree-sitter queries. Sources: github.com/python-grimp/grimp;
github.com/sverweij/dependency-cruiser; crates.io/crates/cargo-modules;
github.com/glato/emerge.

**F5. Granularity consensus: file-level import edges are the right default;
call graphs are out of scope.** File-to-file import edges are cheap (syntactic
parse only), sufficient for cycle detection, clustering, and impact analysis.
Symbol-level graphs multiply node count 10-100x and need compiler-grade name
resolution; call graphs additionally face dynamic-dispatch ambiguity and are
found in production only inside specialized (security) tooling. Production
tools span a spectrum: GitHub dependency graph = manifest-only; Obsidian =
declared links only; CodeScene = git history only; Sourcegraph = full SCIP.
File-level syntactic extraction sits between manifest-only and full indexing —
the right operational point for a bounded local tool. Sources:
tweag.io/blog/2025-12-04-the-anatomy-of-a-dependency-graph;
codescene.io/docs/guides/technical/change-coupling.html.

**F6. Directory containment is a free hierarchy/clustering edge type.**
Containment (file -> directory -> workspace) derives from paths at zero cost
and is the primary LOD mechanism: collapsed view = directory/module nodes with
aggregated import edges; expanded view = file nodes within a scoped subtree.
This mirrors the vault graph's constellation-vs-document split exactly, and
matches the user's intuition that parent submodules/modules are clustering
signals.

**F7. Git co-change ("logical coupling") is a cheap behavioral edge layer.**
`git log --name-only` over a bounded date window yields co-change pairs
(files that change in the same commits), thresholded by minimum co-occurrence —
the CodeScene/code-maat technique. Language-independent, no parsing, rides the
existing capped-subprocess discipline. Valuable as an overlay edge kind
surfacing coupling that imports miss; noisy under mass-refactor commits, so it
needs a window + threshold. Source: codescene.io/docs/guides/technical/change-coupling.html.

**F8. Doc-to-code bridge edges reuse existing machinery.** Vault documents
already mention code paths in prose; the temporal tier already correlates
commits to `code:` ids; `/file-tree` already derives `code:` anchors. A
declared doc->code edge kind (from explicit path references in frontmatter or a
sanctioned field, respecting the 2026-06-28 strict reference-only ruling) plus
the existing commit-touch correlation would bridge the spec graph and the code
graph without new parsing infrastructure. This is the highest-leverage
integration point: connecting decisions to the files that implement them.

### Part 3 — Candidate extraction strategies (comparative)

| Strategy | Granularity | In-process | Toolchain needed | Speed | Fidelity |
|---|---|---|---|---|---|
| A: tree-sitter `.scm` queries | file -> file imports, syntactic | yes (Rust crates) | none | ms/file | literal import strings; per-language path resolution rules needed |
| B: SCIP indexers | symbol-level, resolved | no (subprocess) | per language, compilable project | tens of s - minutes | compiler-exact |
| C: git co-change | file <-> file, behavioral | no (git subprocess) | git only | seconds | statistical overlay |

Recommended shape from the survey: **A as the primary extraction layer**
(per-language grammar crates + import queries, path-normalization rules per
language, containment edges free from paths), **C as an optional overlay**
(bounded window, thresholded), **B as the defined opt-in extension** for
symbol-precision features, run as a background capped subprocess — never
per-request. All three respect read-only, CPU-bound, bounded-output
constraints; A additionally works on uncommitted working-tree state, matching
the present-view one-corpus-snapshot rule.

### Part 4 — Tensions and open questions for the ADR

- **User directive (2026-07-02): a separate, DISCONNECTED dataset — no
  cross-linkage.** The historical defect was precisely that the graph conflated
  vault with codebase; that issue is not to be reopened. The standing rulings —
  the strict reference-only graph (2026-06-28) and the index-node-exclusion
  scope amendment (2026-06-21, `code` never a knowledge-graph node) — remain
  fully in force for the vault graph, which is treated as a STABLE, CORRECT
  dataset and is not modified. Codebase graphing is a NEW, switchable dataset
  the backend provides alongside it: the frontend switches the whole graph
  surface between "vault" and "code" corpora. There are no doc<->code bridge
  edges and no mixed-node views; the bridge-edge idea in F8 is explicitly
  rejected framing for this feature. (The pre-existing `code:` id channels —
  timeline commit-touch annotation and rag search annotation — are join keys
  INTO the code dataset when it is the active corpus, not cross-corpus edges.)
- **Node universe and bounds.** A repo can have 10k-100k files against
  `MAX_GRAPH_NODES = 5000`. The default LOD must be module/directory rollup
  (mirroring the constellation), with file granularity only under a scoped
  descent (directory prefix, ego network, or feature filter), truncation stated
  honestly.
- **Language set v1.** The dashboard's own stack (Rust, TypeScript, Python) is
  the natural pilot set; each has a mature tree-sitter grammar and known import
  syntax. Per-language import-path resolution (tsconfig paths, Python package
  roots, Rust `mod`/`use` mapping) is the main per-language cost.
- **Edge kinds v1.** Imports (directed), containment (hierarchy), doc->code
  bridge (declared). Co-change as a later overlay. Call graphs explicitly out
  of scope.
- **Where extraction lives.** In-process tree-sitter in a new engine crate
  (grammar crates as Cargo deps) vs. a subprocess extractor. In-process avoids
  the toolchain zoo and fits the read-and-infer engine (a parse is a read); the
  compile-time/binary-size cost of grammar crates is the trade-off to size.
- **Cache keying.** Extend the `worktree_corpus_fingerprint` discipline to a
  source-tree fingerprint (path + blob hash over the in-scope, non-ignored
  file set) so uncommitted edits refresh the code graph; keep present-view and
  as-of key spaces distinct.
- **Identity.** `code:{path}` ids are already pinned and provenance-stable;
  file renames mint new ids (same as document stems today). Whether a
  module-rollup node gets its own id scheme (`code-mod:{dir}`?) is an identity
  contract event per the provenance-stable-keys rule.
