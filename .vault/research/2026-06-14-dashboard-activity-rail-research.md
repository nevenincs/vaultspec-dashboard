---
tags:
  - '#research'
  - '#dashboard-activity-rail'
date: '2026-06-14'
modified: '2026-07-12'
related:
  - "[[2026-06-14-dashboard-activity-rail-adr]]"
  - "[[2026-06-14-dashboard-pipeline-status-adr]]"
  - "[[2026-06-14-dashboard-pipeline-wire-adr]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
---

# `dashboard-activity-rail` research: `right-hand review rail: in-flight pipeline status and changes`

The right-hand rail of the dashboard is being re-scoped into the surface that
converged-on agentic development tools now call the *review pane*: the place that
answers two operator questions at a glance — *what work is in flight* and *what has
changed*. The brief asks that this surface conform the emergent industry idiom (the
changed-files-and-diff review pane, the agent task/plan window) to the vaultspec
pipeline, whose unit of work is the ADR and the plan rather than a chat conversation.
This document grounds three decisions that follow it: the rail's information
architecture, the in-flight pipeline-status surface, and the engine wire buildout
required to feed both. It was researched by surveying the converged tools (Google
Antigravity 2.0, Cursor, Claude Code's Tasks), inventorying every current right-rail
surface and the accepted sibling ADRs that govern them, and mapping the engine wire to
find exactly what is already on the wire versus what must be built.

## Findings

### F1 — The industry idiom is two pillars, not one panel

The recently shipped agentic IDEs have converged on a stable shape for the right-hand
work surface, and it is consistently *two* distinct pillars rather than one blended
panel:

- **A review-changes pillar.** Antigravity 2.0's Diff View opens from a "Review Changes"
  entry in the agent panel; when multiple files are modified it shows a left list of all
  modified files with a per-file summary of additions and deletions, additions in green
  and deletions in red, and selecting a file focuses its diff. Cursor's review pane does
  the same: selecting a filename from the change summary focuses that file's diff, with a
  split/unified toggle. The load-bearing primitives are a **changed-files list with
  per-file `+adds`/`−dels` counts** and a **focused, legible diff** reached by clicking a
  file.
- **A plan/tasks pillar.** Claude Code's 2026 "Tasks" update promotes the old chat-resident
  to-do list into a durable, cross-session task layer that opens in a dedicated plan/task
  window, reviewable *before approving* a larger change, with tasks able to block one
  another (a DAG, not a flat list). The lesson is that the unit of in-flight work
  deserves its own persistent surface, separate from the diff, showing structure and
  progress.

The synthesis for vaultspec is direct: the **plan/tasks pillar maps onto in-flight ADRs
and plans** (the pipeline's unit of work, with waves/phases/steps as the task tree and
the research→adr→plan→execute→review→codify arc as the DAG), and the **review-changes
pillar maps onto the git working tree** (the material evidence advancing that work). They
are tightly related but conceptually distinct, which argues for distinct surfaces.

### F2 — The right rail today: an "Activity" rail of three tabs, with no rail-level ADR

The rail is `frontend/src/app/right/`, composed by `AppShell.tsx` as the rightmost of the
four regions (left scope rail, center stage, right activity rail, bottom timeline). It is
20rem expanded, 2.5rem collapsed, and carries three tabs — `now`, `changes`, `search`:

- **`now`** stacks three surfaces: `NowStrip` (git/core/rag status rollup cards),
  `OpsPanel` (the whitelisted ops cluster with arm-then-confirm), and `Inspector` (the
  selected-node detail: metadata, evidence, edges-by-tier).
- **`changes`** is `ChangesOverview`: a git status header (branch, ahead/behind, clean or
  dirty), a working-tree changes section whose diff body is an engine-blocked placeholder
  (`DiffView`), and recent-commit plus vault-activity event rows from `/events`.
- **`search`** is `SearchTab`: the semantic/text search consumer of the stores search
  controller.

Each *sub-surface* already has an accepted ADR — `dashboard-rag-manager` (NowStrip +
OpsPanel), `dashboard-git-diff-browser` (ChangesOverview + DiffView),
`dashboard-search`/`dashboard-rag-search` (SearchTab + controller). What does **not**
exist is an ADR for the **rail container itself** — its tab set, the law for what earns a
tab, and how the surfaces compose. And critically, **no surface shows in-flight ADRs or
plans**: the rail can show what *changed* (git) but not what is *being worked on*
(pipeline). That gap is the brief.

### F3 — In-flight pipeline status is partly derivable today, partly engine-blocked

The engine (`vaultspec-api`) already ingests every `.vault/**/*.md` file into the
`LinkageGraph` as a `doc:*` node carrying `doc_type` (plan, adr, research, …), `dates`,
`feature_tags`, and a query-time `lifecycle: {state: active|complete, progress: {done,
total}}` derived from counting `- [x]`/`- [ ]` checkbox items. So an "in-flight plans"
list — active plans with a done/total progress ring — is **already assembleable from the
existing `/graph/query` wire today**, bounded by the feature LOD.

What is **not** on the wire:

- **ADR/plan frontmatter status.** ADRs carry a `proposed`/`accepted`/`deprecated` status
  in their H1, and plans carry a tier (`L1`–`L4`); neither is extracted. For an ADR the
  checkbox-derived lifecycle is meaningless (an ADR has no steps), so "in-flight ADR" is
  dishonest without reading the real status field.
- **Plan-container interior.** The engine ADR (`2026-06-12-vaultspec-engine-adr` §4.3,
  D4.1) *explicitly anticipates* that "a plan node opens into waves/phases/steps with
  state; exec records bind to specific steps", and lists plan-container as a first-class
  but subordinate node kind — but it is unbuilt. Today `W##.P##.S##` steps exist only as
  `MentionKind::StepId` edges (dead-end mentions), not as entities with completion state.
  The Work tab's expandable step tree (the chosen v1 depth) needs this minting.
- **Per-file git changes and diff.** `/status` serves only a `dirty` boolean — no per-file
  list, no `+adds`/`−dels` counts, no diff body. The `dashboard-git-diff-browser` ADR
  already flags its file-list and diff body as engine-blocked. The engine's
  read-and-infer fence forbids it from shelling git directly with semantics; the
  sanctioned shape is a **read-only `/ops/git` pass-through** (porcelain status, numstat,
  unified diff) enveloped with the tiers block, exactly as `/ops/core` and `/ops/rag`
  already forward sibling verbs verbatim.

### F4 — The architecture for "what's being worked on" already exists; do not re-author it

The dashboard's layer ownership is settled: the engine `LinkageGraph` is the one model,
`engine-query` projects it many ways (`/graph/query`, `/vault-tree`, `/nodes`,
`/events`), `frontend/src/stores/` is the sole wire client, and the app rails are dumb
views that consume stores selectors and emit intent. The existing rules
(`views-are-projections-of-one-model`, `dashboard-layer-ownership`,
`graph-queries-are-bounded-by-default`, `engine-read-and-infer`,
`every-wire-response-carries-the-tiers-block`,
`degradation-is-read-from-tiers-not-guessed-from-errors`) fully govern this work. The
in-flight surface is therefore *a new projection over the one model plus a dumb view*,
not a new model, not a per-view fetch, and not a new architecture. The engine buildout is
*additions* (a pipeline projection, frontmatter-status extraction, plan-container minting,
a read-only git pass-through) that stay inside read-and-infer — none of them writes
`.vault/`, mutates git, or grows sibling semantics.

### F5 — Decisions taken (operator-confirmed)

- **Rail IA: four tabs — `now` / `work` / `changes` / `search`.** Separate the pipeline
  *work* pillar from the git *changes* pillar (F1), keep the live-status `now` pillar and
  the `search` pillar. `now` retains status + ops + the selection-driven inspector.
- **Pipeline depth in v1: full step tree.** The Work tab expands an active plan into its
  waves → phases → steps with per-step completion — which requires the engine to mint
  plan-container/step entities (F3), the anticipated `vaultspec-engine` §4.3 capability.
- **ADR packaging: three ADRs.** `dashboard-activity-rail` (rail IA), then
  `dashboard-pipeline-status` (the Work surface, frontend), then `dashboard-pipeline-wire`
  (the engine buildout that unblocks both Work and Changes). Each is independently
  buildable with a clear frontend/backend ownership line.

### F6 — Risks and constraints to carry into the ADRs

- **Read-and-infer is absolute.** The Work tab and Changes tab observe; they never run
  pipeline verbs, never write `.vault/`, never stage/commit/checkout. New operator needs
  are filed upstream, not grown into the engine or the chrome.
- **Bounded by default.** The step tree is a potentially large interior; it must be served
  under a ceiling with honest truncation, and the Work list bounded to active artifacts in
  the current scope, never an unbounded "every plan ever".
- **Honest degradation.** Both surfaces read availability from the per-tier `tiers` block,
  never guess offline from a transport error; an absent capability renders as a designed
  degraded state.
- **Mock mirrors live wire.** New endpoints (pipeline projection, plan-container interior,
  `/ops/git`) must be mirrored byte-for-byte in the mock engine and exercised through the
  same client path, or the surfaces pass tests and break live.
- **Grayscale-safe identity + warmth-in-tokens.** Progress rings, status pills, and
  per-file `+/−` counts carry meaning by shape and text first; diff green/red stays at
  full contrast (diff legibility overrides warmth).
