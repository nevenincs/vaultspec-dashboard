---
tags:
  - '#research'
  - '#dashboard-foundation'
date: '2026-06-12'
related: []
---

# `dashboard-foundation` research: `project definition and kickoff ideation`

Migrated from the kickoff working set (`tmp/kickoff/`) on 2026-06-12; this
is the stamped record.

## Mission

vaultspec-dashboard is the unified visual surface for the vaultspec ecosystem
and **the shippable that bundles the `vaultspec` CLI engine**. It stands on
top of the CLI interfaces of two sibling backends — **vaultspec-core** (the
agent-harness development framework and its `.vault/` document trail) and
**vaultspec-rag** (the GPU-accelerated semantic search service). The siblings
are agent-facing: they expose CLIs and MCP tools that agents consume. The
dashboard is the **human-facing** counterpart: where the operator sees,
steers, and queries what the agents and services are doing — with the bundled
engine supplying the cross-linkage intelligence neither sibling provides.

## Context — lay of the land

- **vaultspec-core** provides a guided development pipeline with a persistent,
  git-tracked document trail: research, ADR, plan, execution records, and
  audits. The records cross-reference each other into an interconnected,
  loosely hierarchical network. Core has grown its own CLI that supports this
  natural-language development framework.
- **vaultspec-rag** implements semantic search over both the vault and the
  codebase, with a dedicated resident HTTP service, a filesystem watcher with
  incremental reindexing, MCP tools, and a CLI. It gives agents the search
  interface to browse, index, and filter semantic information.
- **vaultspec-dashboard** (this project) is currently a pre-alpha scaffold:
  packaging, tooling, and governance are in place; no UI exists. Core is a
  runtime dependency; rag is dev-only (its CUDA torch backend must never ship
  in the published wheel).

## The engine: `vaultspec` (prioritized deliverable)

The first deliverable is not a UI but a headless backend: a **relationship /
context aggregation engine**, shipped as a non-GUI CLI application named
plainly **`vaultspec`** — the unsuffixed binary above its suffixed siblings.
The GUI pillars below are downstream clients of it.

**Scope constraints (decided):**

- Non-GUI CLI application; the GUI consumes it, the engine never renders.
- Candidate implementation languages: Rust and C++, **preferring Rust** for
  modern tooling. This is a resource-intensive, performance-based engine, not
  a scripting-layer concern.
- Named `vaultspec` — dropping the suffix is the statement: it is the outer,
  umbrella layer of the ecosystem.

**The missing outer framework.** vaultspec-core's jurisdiction is a single
repository's vault corpus: it contains the documents and can modify, read,
and graph them. What exists nowhere is the layer above: look at a directory,
understand it as a git repository, find the branches and feature branches,
map them, and dynamically understand, read, and index the contents of those
folders. The engine owns that outer view — the multi-branch, multi-worktree
landscape within which each vault corpus lives.

**Why it must exist.** A coding agent gets vault↔codebase linkage implicitly,
because by the nature of its task it holds the documents and executes against
the code at the same time. A GUI (or any non-agent consumer) has no such
ambient context; the engine takes up that responsibility and reconstructs the
linkage explicitly.

**What it does.** Cross-navigates the vault document trail against the
codebase, git history (branches, feature branches, worktrees), and the
semantic indexes. It is a context aggregation engine: given any node, it can
assemble everything relevant to it.

**Edges carry provenance and confidence.** Stable cross-referencing cannot be
guaranteed, so linkage is tiered rather than flattened, and every edge knows
which tier it came from:

- *Declared* — explicit cross-references authored through core's graph API.
  Authoritative; doc↔doc only.
- *Structural* — file paths, function/class names, and step identifiers
  mentioned in document bodies, resolved deterministically against the active
  working tree. Verifiable but decaying; "resolved / stale / broken" is itself
  signal worth surfacing.
- *Temporal* — git commits, branches, and worktrees correlated to records.
  Inherently unstable: it depends on commit conventions that differ across
  teams and cannot be overridden. A possible vaultspec-core enrichment
  (opt-in standardized commit linkage, e.g. step identifiers in commit
  metadata) upgrades confidence where adopted — enrichment, never a
  prerequisite. Degrade, don't demand.
- *Semantic* — RAG matches between a node's content/linkage and code or doc
  chunks. Probabilistic and ranked, never asserted as fact; the recovery
  mechanism when the deterministic tiers fail.

**Nodes are aggregation points with discovery capability.** A node is more
than a visual item rendered from markdown storage: it links the related
documents, carries codebase discovery (resolving the files, functions, and
lines its content mentions against the active codebase), and can execute
semantic search queries scoped to its own linkage and content to discover
more. A node is a live lens over context, not a dot.

**Forward relevance.** This engine is also the substrate for the future agent
orchestration layer: assembling a node's full context is exactly the
context-packing operation that precedes dispatching an agent at a feature.
The two phases share this spine.

### Tabled (flagged, not yet thought through)

- Implied context missing from git commit linkage — what can and cannot be
  recovered from real-world commit histories.
- Local disk-persisted development environments: worktree vs. remote feature
  branch cross-linking.
- Whether/what vaultspec-core pipeline changes would standardize linkage
  enrollment, given that team working styles differ and cannot be overridden.
- Requires a close read of the actual vaultspec-core implementation (its graph
  API in particular) before this crystallizes further.

## The three pillars (current scope)

1. **Vault graph visualization — a richer node-based representation.** Render
   the semantic structure the vault's cross-references encode, not merely the
   files that encode it. In existing graph tools a node is a single document
   and every edge is the same anonymous line; the vault's schema is richer,
   and the representation must carry that richness. Nothing currently provides
   this. Specifically:
   - **Cross-linkage as the entity.** Documents are deliberately
     cross-referenced; the convergence of those references is itself the thing
     to render. A feature exists as the cluster of relations between its
     research, decisions, plans, execution records, and audits — not as any
     single file. Nodes represent these convergences; documents are the
     evidence attached to them, reachable by descent.
   - **Typed, directed relations.** An execution record fulfills a plan; a
     plan implements a decision; a decision resolves a research question; an
     audit reviews an execution. Edges carry that semantics and direction
     rather than rendering as undifferentiated "related" lines.
   - **Nodes with interior structure.** Records are not atoms — a plan
     contains waves, phases, and steps with their own state, and execution
     records bind to specific steps inside it. Nodes open up: zooming into a
     node reveals its internal graph.
   - **State and time as dimensions.** Every record is dated, git-tracked, and
     carries lifecycle state; the representation can express progress (a
     feature node that knows its plan is half-executed) and history (the
     network as it stood at a point in time).
1. **Backend visual control.** A control surface over the two backends:
   vaultspec-core health (vault stats, check results, feature state) and the
   vaultspec-rag service (service/watcher status, index counts, jobs, GPU
   state), including operational actions the backends already expose.
1. **RAG search interface.** The human front-end for asking and browsing the
   semantic databases: query vault and codebase indexes, apply the existing
   filter vocabulary, and browse results through to source documents and code.

## GUI concept (ideation pass — organized from free-flow)

### Main window anatomy

Three regions:

- **Left — orientation and scope.** The current worktree and a worktree
  picker, wired to the `vaultspec` engine's repository/branch/worktree
  mapping. Below it, a vault-scoped file browser: a tree that scopes to the
  vault corpus only, not the whole repository. Toolbar and/or browser as
  needed for overview; exact composition open.
- **Center — the stage.** A GPU-accelerated node network rendering the
  second-brain graph, with a robust filtering system. **Visual browsing of
  the second brain is the key feature of the dashboard** — this is where the
  energy focuses; everything else is supporting cast.
- **Right — activity rail.** Following the pattern modern tools have
  converged on: current changes, git status, modified files, and overviews —
  driven by git plus vaultspec-core's in-flight status and built-in status
  services.

### Temporal mapping and the timeline

- **Upstream dependency (in-flight):** vaultspec-core is gaining a feature
  that adds and mandates date stamping across the graph API and vault
  documents, feeding core's in-flight status backend. Temporal mapping in the
  dashboard builds on that mandate; track its landing.
- **Component (leaning): a linear timeline** in the movie-editing idiom —
  scrollable, zoomable, clickable — plotting heterogeneous events on a single
  axis: commits, document modifications, and vault content events. Calendar
  and date-range filtering ride on the same temporal data.
- **Timeline and graph as one instrument.** A movie timeline implies a
  playhead: scrubbing it can drive the center stage, rendering the node
  network as it stood at that moment. The timeline is the time axis of the
  second brain; the graph is its spatial axis; the filtering system spans
  both. This is the UI of the engine's temporal tier and of pillar 1's
  "state and time as dimensions".
- Placement in the window anatomy (bottom rail is the natural slot in the
  movie idiom) and depth of the scrub-to-rewind capability are open.

### Frontend architecture posture

- Bleeding-edge modern, design-robust, probably **React-driven**.
- **Provisional decision (leaning):** the GUI is web-driven and fully
  decoupled from the CLI, served entirely via a **local server** — rather
  than a Tauri-style bundling layer fusing React and Rust into a desktop
  shell. Rationale: simpler; composes with the bundled `vaultspec` engine
  growing a `serve` mode (the pattern vaultspec-rag's resident service
  already proves); a local-server app can be shelled in Tauri later, the
  reverse unfusing is harder.
- Use existing fast, robust rendering engines / node-graph backends for
  muscle, but **implement our own node interface** on top — the node
  abstraction is ours, the renderer is a dependency.

### Research mandate (blocks architecture decisions)

No frontend architectural decisions without backing research. Two strands:

- **Node representation as a data-visualization science problem.** What a
  node is visually, how it is wired, and how complex data linkage and
  relationships are mapped so they provide *useful signal* to the user (not
  hairball). Survey the arXiv research corpus for graph/network visualization
  literature that deals with exactly this.
- **Engine survey.** Evaluate GPU-accelerated graph rendering engines and
  node-editor frameworks against the scale and interaction model the vault
  graph demands, and against the custom-node-interface requirement.

### Visual language charter (persisted note — not actioned yet)

This is a precursor to the UX design questions, not a code concern.

- **This project defines the vaultspec visual language.** No vaultspec project
  has a unified visual interface yet; the dashboard is explicitly the project
  where that language is designed and modelled, and the ecosystem inherits it.
- **Layout: deliberately trend-following.** Agentic tools (Claude desktop,
  Codex desktop, Antigravity desktop) have converged on uniform, almost
  identical layouts. The dashboard follows that convention so it stays usable
  and intuitive for users who are still actively learning, through industry
  change, how to operate these applications. The layout is not where we
  innovate.
- **Identity: hand-drawn and illustrative.** What makes the application stand
  out is a custom, hand-drawn, illustration-driven, *simple* visual language —
  in the lineage of MailChimp, Claude, and other successful organic
  interfaces — bound to the conventional layout. Conventional skeleton,
  distinctive skin.
- Genuine dedicated attention is required for UI, visual language, and
  illustration work when this is actioned; it is design work in its own
  right, not a by-product of implementation.

## Future extension (documented now, out of scope now)

The planned end-state grows the dashboard into an **agent orchestration
network** in the vein of existing agent desktop applications (Codex desktop,
Claude desktop): making agent calls and orchestrating agent teams to work on
features, on top of the vaultspec pipeline. This is explicitly **not** in
scope for the current implementation, but it constrains today's choices: the
architecture must not foreclose a later orchestration layer (e.g., the
dashboard should be structured as a client over backend services, not a
monolith fused to one rendering of the vault).

## Scope boundaries (working assumptions — confirm or redline)

- **Control reach:** operational actions only — the verbs the backends already
  expose (service lifecycle, reindex, watcher tuning, vault checks). The
  dashboard does not author or mutate vault documents in this implementation.
- **Audience:** local-first, single operator on their own machine, pointed at
  vaultspec-managed workspaces — but no decision may structurally block later
  multi-workspace or adopter-facing use.
- **Division of labor:** all domain logic stays in the siblings. The dashboard
  consumes their existing surfaces (CLI `--json`, HTTP routes, MCP tools) and
  adds presentation and interaction only; gaps discovered in those surfaces
  are filed against the siblings, not patched around in the dashboard.
- **Packaging:** vaultspec-rag remains optional at runtime — the dashboard
  degrades gracefully (pillars 1 and core-side 2 still work) when rag is not
  installed or its service is down.

## Success criteria (v1 bar — confirm or redline)

- `vaultspec-dashboard` launched inside a vaultspec-managed workspace brings
  up a working UI with zero configuration.
- The vault record graph renders interactively, stays current with the
  filesystem, and every node opens to its document content.
- Backend state is visible and truthful: vault health from core; service,
  watcher, index, and job state from rag — including the degraded states
  (service stopped, crashed, rag absent).
- Semantic search over vault and codebase works from the UI with the existing
  filter vocabulary, and results link through to their sources.
- The exposed operational controls round-trip correctly (action issued from
  the UI → backend state change → state reflected back in the UI).
- Nothing in the published wheel depends on vaultspec-rag or torch.

## Non-goals (this implementation)

- Agent orchestration, agent calls, team coordination (future extension).
- Authoring or editing vault documents from the UI.
- Multi-user / remote / authenticated deployment.
- Replacing the CLIs — they remain the canonical agent-facing surfaces.

## Sequencing (current thinking)

1. **`vaultspec` engine** — the non-GUI CLI relationship/context aggregation
   engine. Prioritized; the cross-linkage system is worth building first.
1. **GUI** — the visual surface (graph representation, backend control, search
   interface), consuming the engine.
1. **Agent orchestration** — future extension, sharing the engine as its
   context-packing spine.

## Standing conflicts (acknowledged, to resolve at write-up)

- ~~Where the engine lives~~ — **resolved**: vaultspec-dashboard is the
  project and the shippable; it bundles the `vaultspec` CLI engine within it.
  How a Rust binary is bundled inside the Python-scaffolded package is an
  implementation detail for later.
- The earlier "all domain logic stays in the siblings" boundary is broken by
  the engine, which is substantial domain logic of its own. Restate at
  write-up: vault CRUD and semantic indexing stay in core/rag; cross-source,
  cross-branch relationship inference belongs to the engine.
- Overlap with vaultspec-rag's existing codebase indexing needs delineation:
  rag indexes one project's working tree semantically; the engine maps and
  indexes the multi-branch repository landscape and consumes rag as one of
  its linkage tiers.

## Open questions (deliberately undecided — not blocking definition)

- UI technology and delivery shape (web app, desktop shell, TUI) — an
  architecture decision, deliberately not made here.
- How the dashboard talks to core (CLI subprocess vs. a future core service).
- Single- vs. multi-workspace presentation (rag's service already holds
  multiple project slots).
