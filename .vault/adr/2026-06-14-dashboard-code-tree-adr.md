---
tags:
  - '#adr'
  - '#dashboard-code-tree'
date: '2026-06-14'
modified: '2026-06-14'
related:
  - "[[2026-06-14-dashboard-left-rail-research]]"
  - "[[2026-06-14-dashboard-sidebar-adr]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
  - "[[2026-06-14-dashboard-search-adr]]"
---

# `dashboard-code-tree` adr: `read-only codebase file-tree browser` | (**status:** `accepted`)

## Problem Statement

The left rail's file browser is vault-only: `GET /vault-tree` lists `.vault/` documents
and is the single filesystem-listing endpoint the engine exposes. The proposed rail adds a
codebase file tree beside the vault browser so an operator can navigate the actual source
of the active worktree, not only its vault corpus. Today that is an empty promise: code
artifacts exist in the graph as `code:<path>` / `code:<path>#<symbol>` nodes (the
structural tier indexes the worktree), and `GET /nodes/{id}` / `/neighbors` reach them, but
**nothing lists the working tree as a browsable directory hierarchy**. This ADR decides the
read-only codebase file-tree browser — a new bounded listing endpoint, the `code:<path>`
interlink that joins it to the graph, and the rail's code-tree mode — grounded in the
`dashboard-left-rail` research (F4). It is spec work; it authorizes no implementation and
re-decides nothing the base language or the sidebar IA already settled.

## Considerations

- **Listing files is read-and-infer's own input.** Reading and enumerating the working tree
  is squarely within the engine's read-and-infer mandate (it is what the structural tier
  already does to index code). A file-tree listing is a thinner read over the same substrate,
  not a new capability class and not a mutation.
- **The interlink primitive already exists.** A listed file path maps to the stable
  `code:<path>` node id by the same `node_id(...)` derivation the search annotator
  (`POST /search` value-add) and the graph already use. So a code-tree row joins selection to
  the stage exactly as the vault browser's `doc:<stem>` row does, with no new identity scheme.
- **The vault tree is the shape template, with two deltas.** `/vault-tree` is metadata-only,
  scope-keyed, `tiers`-bearing, and the rail renders it as a grouped, collapsible projection.
  A code tree reuses that shape but differs in two ways: it is a *directory hierarchy* (true
  nesting, not doc-type grouping), and it is *unbounded by nature* (a large repo has far more
  files than a vault has documents), so it must be explicitly bounded and lazy where the vault
  tree could be eager.
- **What "code tree" excludes.** It lists the working tree's tracked/most-relevant files for
  navigation; it does not preview file contents (the inspector owns detail, and the foundation
  §9 reserves content paging for a deliberate rev), does not author or mutate files, and is
  not the global search pillar — finding a file by meaning is `POST /search`; browsing the
  tree is this surface.
- **gitignore and noise.** A raw filesystem walk surfaces `.git`, build artefacts, and
  vendored trees that drown the signal. The listing must honor the repository's ignore rules
  (the `ingest-git` / `gix` machinery already reads them) so the tree shows the operator's
  source, not its noise.

## Constraints

- **Read-only, no content.** The endpoint lists path metadata only (name, kind dir/file,
  child presence, optionally a size or modified stamp); it never returns file bytes and never
  writes. Content preview, if it ever lands, rides the foundation §9/§W1 evidence-excerpt rev,
  not this surface.
- **Every read is bounded.** Mirroring the graph's `MAX_GRAPH_NODES` discipline, a file-tree
  read is hard-capped and lazy: it returns one directory level at a time (children of a
  requested path), cursor-paginated when a single directory is pathologically large, with a
  `truncated`-style honesty block when a level exceeds the cap. The rail never requests the
  whole tree; it expands a directory on interaction, exactly as the graph descends on demand.
- **Structural-tier degradation is honest.** The code tree is a worktree-only capability:
  a remote-ref scope (no working tree) has no code tree, and a scope whose structural tier is
  absent renders the code mode as a designed degraded state (the reason in copy tone), read
  only through the stores `tiers` hook — never a bare error and never a healthy-looking empty.
- **Layer ownership.** The code-tree mode is app-chrome: it consumes a new stores query hook
  and emits select/expand intent; it never `fetch`es, never mints a node identity (it derives
  `code:<path>` through the shared rule), and never reads raw `tiers`.
- **Parent stability.** Depends on the structural-tier worktree index (settled,
  scale-hardened) and the `code:<path>` node-id derivation (settled, used by search and the
  graph). The new endpoint is additive to the contract; the gitignore read reuses existing
  `ingest-git` capability. No frontier technology; the only real design work is the bounding
  and lazy-expansion grammar.

## Implementation

**The listing endpoint.** A new read-only `GET /file-tree?scope=&path=&cursor=` returns the
children of `path` (defaulting to the worktree root) within the given scope: per child its
repo-relative path, a kind (`dir` | `file`), a `has_children` hint for directories, and the
`code:<path>` node id the path maps to. The listing honors the repository ignore rules so
`.git`, ignored build output, and vendored trees do not appear. It is metadata-only (no
bytes), hard-capped per level, and cursor-paginated for a pathologically large directory,
carrying the standard `tiers` block and a `truncated`-style honesty marker when a level is
capped. It is one level per call — the rail lazily fetches a directory's children when the
operator expands it, so the wire never carries a whole-repo body.

**The interlink.** Each file row carries the `code:<path>` node id (and the listing derives
it through the shared `node_id(...)` rule, never a private convention). Selecting a file row
emits the shared select intent, focusing the corresponding `code:` node on the stage; when
the stage selection names a `code:` node present in the visible tree, its row highlights with
the muted accent — the same bidirectional join the vault browser realizes for `doc:<stem>`,
now for code. A file with no `code:` node in the current graph (not yet indexed, or below the
structural tier's reach) is still listed and selectable for navigation, but its interlink is a
quiet absent state, not an error.

**The rail's code mode (frontend).** Per the `dashboard-left-rail` IA, the browser region
carries a vault mode and a code mode behind a compact keyboard-reachable toggle; vault is the
default. The code mode renders the `/file-tree` projection as a directory hierarchy of
collapsible disclosure rows: a Lucide chevron for directory disclosure, a Phosphor file/dir
mark passing the 14px grayscale-by-shape gate, the file or directory name (monospace, as path
identity, truncating with the full repo-relative path on hover), and — when the design hosts
it — a quiet right-aligned marker for files that carry graph linkage. Directories expand
lazily, fetching their children on first expansion and caching per scope. The in-rail filter
(IA ADR) narrows the *visible, already-fetched* tree client-side; it is not a wire search.

**States.** The code mode renders the rail's four honest states. Loading: a quiet pending
line while a level is in flight (and per-directory expansion shows a subordinate liveness cue,
no spinner theatre). Empty: an approachable empty state for a worktree that resolves to no
listable source. Degraded: when the scope has no working tree (a remote ref) or the structural
tier is absent, the code mode renders as designed degraded state explaining the absence,
distinct from empty; the vault mode remains available. Error: a contained, region-scoped
`/file-tree` failure with retry, distinguished from degradation.

**Keyboard and a11y.** The code mode keeps the rail's keyboard-first contract: roving focus
through directory disclosures and file rows in tree order (skipping collapsed directories),
`aria-expanded` on disclosures, Enter/Space to select a file (emitting the `code:` selection),
arrow keys to move and to expand/collapse, the mode is a labelled region, and selection is
conveyed by fill plus weight, not hue alone. Keyboard actions are instant; `prefers-reduced-
motion` collapses expansion transitions to immediate changes.

**Place in the four-layer ownership map.** The code-tree mode is app-chrome consuming a new
`/file-tree` stores query and emitting select/expand intent; the descent into the graph that a
selection triggers is the stage's bounded concern. It projects over the one model — the
working tree mirrored as `code:` nodes — joining selection on the contract's stable ids, and
every addition is a stores selector plus a dumb view, never a rail-local fetch.

## Rationale

The decision keeps a code browser honestly within the engine's mandate and the rail's laws.
Listing files is the same read the structural tier already performs, so the endpoint is a
thinner projection over an existing substrate, not a new capability — and the `code:<path>`
derivation that search and the graph already share means the interlink needs no new identity
scheme, only the same join the vault browser proved for documents. Modelling the endpoint on
`/vault-tree` (scope-keyed, metadata-only, `tiers`-bearing) but making it directory-nested,
bounded, and lazy is the only safe shape: the research (F4) and the graph-scale work both show
an unbounded tree read can reach pathological sizes, so the one-level-per-call, hard-capped,
cursor-paginated grammar mirrors the graph's bounded-by-default discipline. Honoring the
repository ignore rules is what makes the tree the operator's source rather than its noise, and
degrading the code mode honestly on a remote-ref or structural-absent scope follows the
contract's `tiers` truthfulness exactly as the vault browser and worktree switcher do. Routing
"find a file by meaning" to the global `POST /search` pillar and keeping the in-rail filter a
client-side narrowing preserves the single-wire-client boundary the sidebar IA demands.

## Consequences

- **Gains.** The rail can browse real source, not only vault documents, with the same
  read-only, projection-only, bidirectionally-interlinked discipline the vault browser already
  has — so a code file and its graph node are one click apart in either direction. The
  bounded, lazy grammar means the surface scales to a large repository without an unbounded
  wire body. gitignore-awareness keeps the tree legible.
- **Costs and difficulties.** Lazy per-directory expansion plus per-scope caching plus the
  in-rail filter over a partially-fetched tree is more state than the eager vault tree, and the
  bounding/truncation honesty must be designed so a capped directory reads as "more here" rather
  than "empty". Files without a `code:` node need a deliberate quiet absent-interlink state, not
  an error. The Phosphor file/dir marks must pass the 14px grayscale gate like every other mark.
- **Risks.** The standing temptation is to add a content preview "because the bytes are right
  there" — that crosses into the inspector's scope and the foundation §9 content-paging rev, and
  must be resisted at this surface. A naive walk that ignores gitignore would flood the tree with
  `.git` and build noise; the ignore read is not optional. An unbounded "load the whole tree"
  shortcut would breach the bounded-read invariant.
- **Pathways opened.** A bounded file-tree projection makes future code-navigation facets cheap
  — a symbol outline per file (the `code:<path>#<symbol>` nodes already exist), a changed-files
  overlay joined to the git status, or a "reveal in tree" action from a search result or graph
  node — each a stores-backed dumb view over the same projection.

## Codification candidates

This ADR introduces no genuinely new durable constraint. The bounded-read discipline it honors
is already bound by `graph-queries-are-bounded-by-default`; the read-only and single-wire-client
boundaries by `engine-read-and-infer`, `dashboard-layer-ownership`, and
`views-are-projections-of-one-model`; the stable-identity interlink by
`provenance-stable-keys-are-identity-bearing`; and the honest-degradation requirement by
`every-wire-response-carries-the-tiers-block`. The code-tree browser is a per-surface
application of those settled rules, so this section is intentionally empty.
