---
tags:
  - '#research'
  - '#dashboard-backend-completion'
date: '2026-06-16'
modified: '2026-06-16'
related: []
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #research) and one feature tag.
     Replace dashboard-backend-completion with a kebab-case feature tag, e.g. #foo-bar.
     Additional tags may be appended below the required pair.

     Related: use wiki-links as '[[yyyy-mm-dd-foo-bar]]'.

     modified: CLI-maintained last-modified stamp; set at scaffold time,
     refreshed by mutating CLI verbs and vault check fix; never hand-edit.

     DO NOT add fields beyond those scaffolded; metadata lives
     only in the frontmatter. -->

<!-- LINK RULES:
     - [[wiki-links]] are ONLY for .vault/ documents in the related: field above.
     - NEVER use [[wiki-links]] or markdown links in the document body.
     - NEVER reference file paths in the body. If you must name a source file,
       class, or function, use inline backtick code: `src/module.py`. -->

# `dashboard-backend-completion` research: `frontend-driven backend completion and hardening`

Handover brief for the backend/data-plane agent. The Figma design system and every
frontend surface are settled (the design corpus lives in the Figma file the frontend team
maintains). This document scopes the engine + `frontend/src/stores/` (TanStack) work needed
so that **every surface the frontend renders has real, bounded, verified data**, and the
data plane is hardened to the project's standards. This is strictly read-and-infer engine
work plus the stores layer that consumes the wire — no design/visual work.

## Orientation

Start with `vaultspec-core status` and read the in-flight plans. Read the wire contract
`2026-06-12-dashboard-foundation-reference` (envelope, tiers block, identity guarantees,
ops/search pass-through, bounded queries). Reconcile these specced/partial features against
the live code: `2026-06-16-review-rail-viewers` (the `GET /nodes/{id}/content` + `/history`
viewer endpoints), `2026-06-16-status-overview` (right-rail Status data),
`2026-06-16-graph-viz-framework` + `2026-06-16-graph-layout-catalog` (graph data + the six
layout modes — layout is CPU/scene, the engine serves the bounded slice + adjacency),
`2026-06-16-missing-backend-inventory-research` + `2026-06-16-code-artifact-nodes` (known
gaps), and `2026-06-13-constellation-live-delta` (the SSE delta clock).

## Binding rules (override defaults; in `CLAUDE.md`)

`dashboard-layer-ownership`, `engine-read-and-infer`,
`every-wire-response-carries-the-tiers-block`,
`degradation-is-read-from-tiers-not-guessed-from-errors`,
`graph-queries-are-bounded-by-default`, `graph-compute-is-cpu-gpu-is-render-and-search`,
`provenance-stable-keys-are-identity-bearing`, `mock-mirrors-live-wire-shape`,
`bounded-by-default-for-every-accumulator`, `subprocess-calls-carry-cap-and-timeout`,
`published-wheel-purity`, `settings-are-schema-driven-from-one-registry`,
`declaring-green-runs-the-full-gate`, `review-revision-precedence`.

## Findings — per-surface backend needs (gap-analysis targets)

For each surface, confirm the endpoint exists, returns the shared envelope **with the
`tiers` block on success AND error**, is **bounded**, carries **stable `doc:`/`code:` ids**,
and that the `mockEngine` mirrors the live shape exactly; then prove it renders from a live
`vaultspec serve` origin.

- **Graph view** — `/graph/query`: nodes (stable id, category = doc-type, human title,
  connection-count, and a `date` for the timeline), edges with feature granularity emitting
  a SEPARATE `meta_edges` array (edges empty) per `mock-mirrors-live-wire-shape`;
  constellation LOD default, document granularity under `MAX_DOCUMENT_NODES` with a
  `truncated` block. Layout modes (connectivity / lineage / hierarchical / radial /
  community / semantic) are scene/CPU — the engine only serves the node set + adjacency.
  **Code is not a graph category** — exclude code from graph nodes.
- **Typed hover card** — per-node frontmatter-derived fields the design shows (plan status /
  remaining waves+phases+tier, decision supersedes, step parent-plan, audit verdict,
  findings counts, per-node git-dirty). Several are known data gaps — close them or mark
  explicitly unavailable so the UI degrades honestly.
- **Filters** — Type (doc-type), Topic (feature/tag), Date (edited range) facet values with
  counts; decide engine-aggregated vs. stores-derived and document it.
- **Left rails** — Vault (`/vault-tree`, sections by doc-type, rows with human title +
  feature tag + date), Tree (feature hierarchy), Code (a repo **file tree** with git M/A
  status — a browse, not the graph; read git via a capped+timed subprocess or `/ops/*`).
- **Right activity rail** — Status (location anchor: absolute path + worktree + branch; open
  plans with step trees + progress; recent commits as hash + subject), Changes (changed
  files + docs, cross-linked), Search (rag semantic results: title, snippet, source,
  relevance, type via the `/search` pass-through, gated on the search tier).
- **Timeline** — documents as POINT events at their single `date:` (frontmatter is the safe
  signal; never infer per-document ranges from modified-time / filename); per-feature doc
  lists so the client derives feature spans (first→last). Doc-type drives the y-split.
  Likely an extension of `/graph/query` or `/vault-tree` to carry `date` + type.
- **Viewers** — `GET /nodes/{id}/content` (bounded, `MAX_CONTENT_BYTES`, `truncated` block,
  path-guarded) and `GET /history` (commits + subjects). Build if still specced-only.
- **Settings** — `/settings/schema` from the single engine registry
  (`settings_schema.rs`); typed `PUT` + effective-value resolution; no setting nothing reads.
- **Live delta (SSE)** — verify the constellation delta clock emits both delta species on
  the single `last_seq` clock.
- **Selection / cross-view state** — a stores-layer (TanStack) concern: one shared
  selection+hover slice that fans out to graph, timeline, and rails; views emit intent and
  render store state. The engine's only obligation is stable ids so cross-ref resolves.

## Hardening mandate (non-negotiable)

Tiers block on every envelope via the shared `vaultspec-api` helper (no hand-built bodies);
every cache/channel/queue/retained list bounded at creation; every subprocess
(`vaultspec-core`, `git`, `vaultspec-rag`) carries BOTH an output byte cap AND a wall-clock
timeout and kills the child on either breach; graph queries bounded (LOD default,
`MAX_DOCUMENT_NODES`, honest `truncated`); read-and-infer only (no `.vault/` writes, no git
mutation; sibling verbs verbatim through `/ops/*` / `/search`); rag/torch stay in the `dev`
group, never `[project] dependencies`.

## Definition of Done — verified functioning

`just dev lint all` exits 0 (eslint + prettier `format:check` + tsc, and `cargo fmt --check`
+ clippy) — a partial run is never green. Engine `cargo test` + frontend `vitest` green,
including a conformance test asserting every route carries the tiers block (success +
error), and a mock-vs-live shape test that feeds a captured live sample through the real
client path (the mock emits the live shape byte-for-byte). A live-origin pass: run
`vaultspec serve`, point the GUI at it, verify each surface renders with real data and
degrades honestly when a tier is absent. Stable ids verified: re-running inference never
re-keys existing nodes/edges.

## Process

Run the pipeline: produce a gap-analysis ADR first and confirm scope before executing;
per-phase review with required revisions blocking forward work; stay inside the four layers
(engine serves the wire; `frontend/src/stores/` is the sole wire client; scene/app are dumb
views); commit/push only when asked and branch off `main` first.
