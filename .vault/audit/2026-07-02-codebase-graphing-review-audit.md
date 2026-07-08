---
tags:
  - '#audit'
  - '#codebase-graphing-review'
date: '2026-07-02'
modified: '2026-07-02'
related: []
---

# `codebase-graphing-review` audit: `codebase graphing ingest and visualization review`

## Scope

User-directed review of the CODEBASE-GRAPHING feature (landed 2026-07-02,
commits `46f13b7e03` / `37c9499181`: the `ingest-code` crate, code corpus
store, projections, wire). The user reports the graph is buggy and hard to
read. Audited end-to-end against the specific complaints: (1) folder/file
conflation; (2) bare `__init__.py` nodes; (3) module-import vs file
conflation; (4) per-language robustness; (5) wire metadata available for
coloring; (6) a concrete package/module-based coloring design using the
existing token schema. Files read whole: `ingest-code/src/{lib,modules,lang,
resolve}.rs`, `engine-query/src/code.rs`, `scene/field/categoryColor.ts`, plus
targeted reads of the route (`routes/query.rs` corpus arm), `appearance.ts`,
and `dashboardState.ts` corpus plumbing. Finding IDs `CGR-###`; audit-only.

## Findings

### CGR-001 | info | The ingest architecture is sound: disconnected corpus, constellation-mirroring rollup, bounded, stable ids, a genuinely well-tested resolver

The design is right and most complaints are PRESENTATION failures over it, not
ingest bugs. Verified: the code corpus is a SEPARATE `LinkageGraph` (never the
vault graph — the disconnection invariant holds; the vault slice still never
paints a code node); the wire is byte-conformant `GraphSlice` through the same
`node_view`/`edge_view`; module-rollup granularity mirrors the constellation
exactly (module nodes + aggregated `meta_edges` with multiplicity-weighted
counts) while file granularity serves files + modules + raw
`imports`/`contains`, endpoint-pruned; the walk is capped (file count + size)
with honest `ExtractionStats` (capped/skipped/parse_errors/
internal/external/unresolved); extraction is a pure in-process tree-sitter
parse (no subprocess — `engine-read-and-infer` held); edge stable ids exclude
the volatile blob hash and span (tested: an edit that keeps an import never
re-keys); and the resolver (`resolve.rs`) is thorough and well-tested per
language — Rust brace-group/`super`/`crate`/workspace-crate resolution, JS/TS
relative probing with ESM `.js`→`.ts` swap and directory→index landing, Python
absolute/relative with external-vs-unresolved discrimination. Corpus switching
rides dashboard state (`corpus`) off the durable `graph_corpus` setting.

### CGR-002 | high | Readability root cause 1: every code node — all four languages, files AND directories — paints ONE flat hue, and modules get no size distinction either

`categoryColor.ts:86-88` maps both `code-artifact` and `code-module` onto the
single `code` category (ADR D7: "the file/module distinction is carried by the
domain MARK, not a second hue") — but on the canvas the mark is the
inside-disc glyph at icon-mode zoom levels only, so in practice a
2,000-node file-granularity slice is a MONOCHROME field where a directory is
visually identical to a file: same hue, same circle. Compounding it,
`nodeWorldRadius` (`appearance.ts:108`) applies the member-count radius ONLY to
`kind === "feature"`, so `code-module` rollup nodes get NEITHER a
distinguishing hue NOR the constellation-style size scaling their
`member_count` wire field exists to drive. This is the substance of the user's
"folders mixed in with files" and "hard to read": the folder-as-node design is
correct (it is the code analogue of the feature constellation), but zero
visual channels distinguish the two species or any module identity. Fixes:
the module-hue design in Recommendations, plus the one-line size fix
(include `code-module` in the memberCount radius branch).

### CGR-003 | high | Readability root cause 2: entry-file nodes are titled by bare filename — every package's `__init__.py` renders as "__init__.py", and every module import appears to target one of these identical nodes

`modules.rs:82` sets a file node's title to `last_segment(rel_path)`,
unconditionally. Every Python package therefore contributes an identical
"__init__.py" node, every JS/TS directory module an "index.ts", every Rust
directory module a "mod.rs", every crate a "lib.rs". This is ALSO the user's
"module-import vs file conflation" (complaint 3): the resolver CORRECTLY lands
a module import on the module's entry file (`import pkg` →
`pkg/__init__.py`, `import './dir'` → `dir/index.ts`, `mod util;` →
`util/mod.rs` — deliberate, tested, and architecturally right for a
file-granularity graph whose module-level view is an aggregation projection) —
but because all those landing nodes carry the same bare title, the canvas
shows dozens of edges converging on interchangeable "__init__" dots and reads
as conflation. FIX (at minting, one function): package-aware entry-file
titling — `__init__.py` → the PACKAGE name (parent dir leaf, e.g. `pkg`, with
the full path staying in `key` for hover truth); `index.ts|tsx|js|jsx|mjs` →
`{parent}/index`; `mod.rs` → `{parent}/`; `lib.rs`/`main.rs` → the CRATE name
(the `ResolveIndex` already parses every `Cargo.toml` `[package] name` — the
map exists). The user's exact requested fix, generalized to all four
languages per complaint 4.

### CGR-004 | medium | Module node naming is ambiguous: bare leaf dir names collide repo-wide and the root module is titled "."

`modules.rs:112` titles a module node `last_segment(dir)` — a repo has many
`src`/`tests`/`utils` directories, so rollup nodes collide on identical labels
with no disambiguation; and the repository ROOT module renders with the
literal title "." (`ROOT_MODULE_KEY`). Fix: title modules by a short
disambiguated form (leaf + trailing `/`, with the parent prefix added only on
collision — or simply the full key for depth ≤ 2), and title the root module
by the repo/scope basename. `ui-labels-are-user-facing` applies: "." is an
internal key leaking onto the canvas.

### CGR-005 | medium | Resolver gap: multi-name Python froms resolve only the FIRST matching submodule — sibling edges silently dropped

`probe_py_base` (`resolve.rs:352-366`) iterates `names` and returns the FIRST
existing submodule candidate; `resolve_py_absolute`/`resolve_py_relative`
wrap it in a single `Resolution`. So `from pkg import a, b` mints an edge to
`pkg/a.py` ONLY — `pkg/b.py` is dropped without even a counter, and
`from . import x, y` likewise. Multi-name froms are ubiquitous in Python, so
this is a systematic undercount of real import edges (and skews the
module-level meta counts). Contrast: the Rust arm handles the analogous case
correctly (`expand_rust_use` returns one resolution PER expanded brace path).
Fix: make the Python resolvers return one `Resolution` per name (submodule
hit per name, falling back to the module base once for the pure-symbol
names), mirroring the Rust shape; `resolve()` already returns `Vec`.

### CGR-006 | low | Empty `__init__.py` nodes: keep-but-rename now, elision is a later evidence call

An EMPTY `__init__.py` exists only as a package marker; as a node it
duplicates the module node's identity (the user's "bare init nodes pulled
in"). With CGR-003's package-aware titling these become legible ("pkg"
alongside the `pkg/` module node), which is the honest v1: the file exists,
the walk admitted it, eliding it would make file counts lie. If they still
read as noise after the rename, the follow-up option is folding empty inits
into their module node at MINTING (elide when the content hash is the empty
hash AND the file has zero imports), recorded as a deliberate projection
choice — not silently.

### CGR-007 | low | Per-language spot-check: arms individually solid; deliberate v1 boundaries and one duplication noted

Verified per arm (complaint 4): Rust — brace expansion, renames, `self`/
`super`/`crate`, workspace-crate landing on `lib.rs`/`main.rs`, greedy
longest-prefix probing with the no-false-`lib.rs` guard; JS/TS — relative-only
internal (bare specifiers external), ESM `.js`-suffix→TS swap, directory→index
probing; Python — ancestor-package + `src`-layout roots,
external-vs-unresolved via top-package existence. Deliberate v1 boundaries
(counted, not broken): tsconfig path aliases read as external; Rust re-export
chains land on the re-exporting file (correct file-level semantics). Residual
hygiene: `language_token` in `engine-query/src/code.rs:38-47` DUPLICATES
`lang.rs`'s classification as a hand-mirrored map (tsx folds to `typescript`
consistently today) — a drift trap; move the token map into a shared location
or add a cross-crate consistency test.

## Recommendations

INGEST (engine plan): 1. CGR-003 entry-file titling (one minting function,
covers all four languages, includes the user's `__init__.py` ask). 2. CGR-004
module titles + root-module name. 3. CGR-005 multi-name Python resolution.
4. CGR-007 token-map dedup/guard. 5. CGR-006 stays keep-but-rename; revisit
elision on evidence.

VIZ (scene/frontend plan) — the module-coloring design (complaints 5+6):

- WIRE (small engine addition, `display-state-is-backend-served`): the file
  view already serves `language`; add to BOTH granularities a served
  `module: <parent dir key>` on file nodes and `module_hue: 0..6 | null` on
  file AND module nodes, where the hue index is assigned per generation by
  ranking TOP-LEVEL modules (first path segment) by member count and giving
  the top seven the indexes; every other module serves null. Optionally
  `depth: <segments>` (one integer) so the client never parses paths for
  classification. Deterministic, backend-served, memoized per generation like
  every sibling projection.
- COLOR MODEL (no new hex — `themes-are-oklch` / literal-hex seam): hue =
  MODULE IDENTITY, lightness = DEPTH, size = importance (keeps the existing
  one-channel-per-meaning doctrine: "size carries salience, color carries
  type"). The seven existing `--color-scene-category-*` literal-hex tokens are
  REUSED as an ordered categorical palette for `module_hue` 0..6 — zero new
  tokens, automatically theme-correct in all three modes; nodes with
  `module_hue: null` (long-tail modules) paint the existing neutral `code`
  hue. Depth gradient is presentation math the scene already owns: mix the
  module hue toward `canvasBackground()` by a clamped per-depth step (the
  exact NODE_RECEDE_MIX mechanism, reused) so top-of-module files read
  saturated and deep leaves recede into the warm ground — a hierarchical
  gradient with a legibility floor, satisfying `warmth-lives-in-tokens`.
- PLUG-IN POINT (one seam): `appearance.ts nodeColorNumber` grows a code-
  corpus branch — `module_hue != null ? mix(categoryPaletteHue(module_hue),
  canvasBackground, depthStep) : categoryColor("code")` — and everything
  downstream is FREE: `buildNodes` bakes the per-node color, and
  `edgeEndColors`' existing gradient mode automatically paints import edges
  as leaf→target module-hue gradients, which IS the intuitive "which modules
  feed which" heat map the user wants. The legend swaps to the code
  vocabulary when the corpus is code (top-seven module names + hues, served
  from the code filter vocabulary + hue indexes — the legend is already a
  canonical-filter co-author, so module rows can double as `dir_prefix`
  narrows).
- MODULE/FILE DISTINCTION (CGR-002): `code-module` joins the memberCount
  radius branch (one line) so rollup directories read as constellation
  anchors; the folder glyph rides the existing icon channel.
- Explicitly REJECTED as the primary color dimension: fan-in/centrality heat
  maps — importance already has the size channel; putting it on hue would
  overload color and lose module identity, the thing the user asked to see.
