---
tags:
  - '#adr'
  - '#status-overview'
date: '2026-06-16'
modified: '2026-06-16'
related:
  - "[[2026-06-16-review-rail-viewers-adr]]"
  - "[[2026-06-14-dashboard-activity-rail-adr]]"
  - "[[2026-06-14-dashboard-pipeline-status-adr]]"
  - "[[2026-06-14-dashboard-pipeline-wire-adr]]"
  - '[[2026-06-16-status-overview-research]]'
---

# `status-overview` adr: `right-rail Status overview: plan-derived open work, git history, location anchor` | (**status:** `accepted`)

## Problem Statement

The right rail is being re-scoped into a single **Status overview** that answers three
operator questions at a glance: *Where are we? What is being worked on? What has been
committed?* The sibling `review-rail-viewers` ADR settled the rail's container law (four
tabs: Inspect, Work, Changes, Search) and the document/code viewers plus the content-fetch
endpoint that feeds them. What it did **not** settle is the *content model* of the rail's
primary informational surface — specifically what "what is being worked on" actually means
and where its data comes from. This ADR pins that model.

The central question is one of source-of-truth: when the rail says work is in flight, what
is it reading? Two candidates present themselves. One reads **graph connections** — derive
"active" from how densely a node is linked, or from recent edge activity in the linkage
graph. The other reads **plan documents** — the pipeline already models a unit of work as a
plan with checkbox steps (`- [ ]` open, `- [x]` done) grouped into phases, waves, and a
complexity tier, and an open plan is precisely one with at least one unchecked step. These
are different facts. Graph density answers "what is well-connected"; plan-step state
answers "what work remains". The rail must answer the second, because that is the question
the operator is asking; the first is already answered, twice over, by the graph itself and
the left-rail tree.

This is a focused decision and authorizes no implementation beyond the one bounded engine
addition it identifies. It refines `review-rail-viewers` and the prior activity-rail /
pipeline-status / pipeline-wire ADRs rather than superseding them.

## Considerations

- **Plan documents already encode completion canonically.** A plan's leaf unit is the Step,
  rendered as a GFM task item; `- [ ]` is open and `- [x]` is done. The CLI reports this
  directly: `vaultspec-core vault plan status <plan> --json` returns
  `vaultspec.vault.plan.status.v1` with `tier`, `wave_count`, `phase_count`, `step_count`,
  `steps_completed`, `completion_percent`, `waves_completed`, `phases_completed`, and
  `next_open_step` (verified live against `2026-06-16-review-rail-viewers-plan`:
  `6/36 steps`, `16.7%`, `next P02.S07`). `vaultspec-core status` already renders exactly
  the model this rail wants — a "Plans in flight (at least one open step)" list with tier,
  waves/phases completed, done/total step counts, percent, and the next open step — which is
  strong evidence the plan-derived model is the right one, not a novel invention.
- **The engine already serves the open-work projection.** `GET /pipeline?scope=` runs the
  bounded `engine_query::pipeline::in_flight` projection: a plan is *in-flight* exactly when
  its in-scope lifecycle state is `active` (checkbox progress not yet complete), and each
  artifact carries `node_id` (`doc:{stem}`), `stem`, `title`, `doc_type`, `status` (ADRs),
  `tier` (plans), `progress: {done, total}` (plans), and `phase`. The projection is bounded
  by construction — "in-flight" *is* the bound, so there is no unbounded "all plans ever".
  This is the open-plan data the rail's "what is being worked on" section needs, already on
  the wire, already enveloped and tiers-bearing.
- **The step-tree dropdown is the right expand idiom — keep it.** Per-plan open-step detail
  is already served by `GET /nodes/{id}/plan-interior`, which returns the wave/phase/step
  tree with per-step `{id, action, done}` and a `truncated` honesty block at the node
  ceiling. The existing plan step-tree dropdown (the Work pillar's expandable plan row) is
  the established idiom for showing a plan's open steps; this ADR keeps it rather than
  inventing a new disclosure.
- **The location anchor is already served.** `GET /status` returns `scope` (the absolute
  worktree path in canonical token form, forward slashes) and a `git` block with `head_ref`
  (current branch), `dirty`, `ahead`, `behind`; `GET /map?workspace=` enumerates worktrees
  with `path`, `head_ref`, `is_main`, `has_vault`. The "Where are we?" anchor — absolute
  path, worktree, branch — is reuse, not new work.
- **Git history with commit subjects is the one real gap.** Nothing on the wire returns a
  recent-commit list of `{hash, subject}`. `GET /events?scope=` carries commit *events*
  (seq, ts, kind=`commit`, `git_ref`) correlated to vault docs, but the commit **subject
  line is explicitly not exposed** — the engine itself flags this as a deferred git lookup
  (`routes/query.rs` evidence note: "`commits` lack the `subject` (a git lookup)"). The
  read-only `/ops/git/{verb}` proxy whitelists only `status`, `numstat`, `diff` — no `log`.
  So "What has been committed?" — last N commit hashes + subject lines — needs a bounded,
  read-only addition.
- **The rail has a four-tab law.** The activity-rail ADR fixed Inspect / Work / Changes /
  Search and a scarcity discipline: a surface earns a tab only if it is *standing* AND asks
  a *distinct* question. This ADR mints no fifth tab; the Status overview is the recomposed
  primary informational surface, and the changed-files / diff capability that
  `review-rail-viewers` unblocked stays.

## Constraints

- **Engine stays read-and-infer (`engine-read-and-infer`).** The one new datum — recent git
  history — is a read of commit metadata, never a mutation; it reads the worktree's git log
  and grows no sibling control or search semantics. It may be served either as a new bounded
  read-only route or by extending the existing read-only commit projection to carry the
  subject; it must not become a write path or a general git-command surface.
- **Bounded by default (`graph-queries-are-bounded-by-default`,
  `bounded-by-default-for-every-accumulator`).** Git history is served as **last N** commits
  (a fixed, small ceiling — e.g. 20), never an unbounded log walk serialized onto the wire;
  the open-plan list is already bounded by the `in_flight` projection. The stores-layer
  history query is cache-bounded with an explicit `gcTime`.
- **Every response carries tiers through the shared helper
  (`every-wire-response-carries-the-tiers-block`).** Any new route returns
  `envelope(data, tiers, next_cursor)` from `routes/mod.rs`; a worktree with no readable git
  history (e.g. a ref-only scope) degrades the **structural** tier honestly via
  `degraded_tiers_for`, never a bare 500 or a healthy-looking empty list.
- **Layer ownership (`dashboard-layer-ownership`, `views-are-projections-of-one-model`,
  `degradation-is-read-from-tiers-not-guessed-from-errors`).** The history datum is a new
  projection in `vaultspec-api` / `engine-query`; `frontend/src/stores/` is its sole wire
  client and the only reader of the `tiers` block; the rail is a dumb `app/` view that
  subscribes to stores selectors, fetches nothing, and reads no raw `tiers`. The overview
  composes existing stores queries (`/pipeline`, `/status`, `/map`) plus the one new history
  query. Open/in-flight is read from the `/pipeline` projection's `progress` and the plan
  step state, never inferred from transport errors or graph density.
- **Do not bloat the metadata routes.** `/vault-tree` and `/file-tree` stay metadata-only;
  git history does **not** ride `/vault-tree`. The location anchor stays on `/status` /
  `/map`. The new history datum gets its own bounded surface (or extends the commit-event
  projection), keeping each route's question singular.
- **Parent stability.** Every reused piece is shipped and scale-hardened: `/pipeline` and the
  `in_flight` projection (pipeline-wire), `/status` and the worktree git block (foundation),
  `/nodes/{id}/plan-interior` and the step tree, the shared envelope/tiers, and the four-tab
  rail (`review-rail-viewers`, activity-rail). The only frontier-free new work is the bounded
  git-history read; the engine already links `gix` and shells `git` through the `/ops` proxy,
  so reading a short commit log is within settled capability.

## Implementation

**The plan-derived open-work model (the decision).** "What is being worked on" is computed
from **plan documents**, not graph connections. An open / in-flight plan is a plan document
with at least one unchecked step (`- [ ]`). The rail's open-work section is fed by the
existing `GET /pipeline?scope=` projection, which already filters to active plans (and
proposed/accepted ADRs) and carries per-plan `tier`, `progress: {done, total}`, `phase`, and
`doc_type`. Each open-plan row shows done/total step counts, percent complete, complexity
tier, and the open phases/waves, and is **expandable into its open steps** via the existing
plan step-tree dropdown over `GET /nodes/{id}/plan-interior` (wave → phase → step tree with
per-step `done` state and a `truncated` block). Rows cross-link to the plan's `doc:{stem}`
node and open it in the markdown reader (the `review-rail-viewers` viewer). The model is the
same one `vaultspec-core status` already renders; the rail is its projection in the GUI.

**The location anchor ("Where are we?").** A compact header reads from the existing
`GET /status` response: the **absolute path** being browsed (the `scope` token, forward
slashes, no extended-length prefix), the **git worktree** it belongs to (resolved via
`GET /map?workspace=` when the scope is one of several worktrees, including the `is_main`
flag), and the **current git branch** (`git.head_ref`, with `dirty`/`ahead`/`behind` as
secondary chips). No new engine work; this is reuse.

**Recent git history ("What has been committed?").** The last **N** commits as
`{hash, subject}` (subject = the commit's first summary line), newest first, each row showing
the short hash and subject and cross-linking to any vault docs the commit touched (the
`/events` correlation already maps commits to `node_ids`). This is the one engine gap. It
lands as a bounded, read-only, enveloped, tiers-bearing addition — the recommended shape is a
new route:

> `GET /history?scope=&limit=N` →
> `envelope({ commits: [ { hash, short_hash, subject, ts, author?, node_ids: [] } ], truncated? }, tiers, next_cursor)`
>
> reading the served worktree's git log capped at a small `limit` (default ~20, hard
> ceiling), newest first. `node_ids` reuses the existing commit→document correlation so each
> commit cross-links into the graph. A scope with no readable git history degrades the
> structural tier honestly.

An acceptable alternative is to **extend the existing commit-event projection** (the
`commit_rows` path behind `/events`) to carry `subject` (and surface a `kinds=commit&limit=N`
read), closing the already-flagged subject gap in place rather than adding a route. Either
way the datum is a short, bounded commit list with subjects, served read-only through the
shared envelope. The stores layer adds one history query (cache-bounded, `gcTime`-capped,
reading the `tiers` block); the rail consumes it as a dumb view.

**The rail IA.** The Status overview is the **primary tab** of the rail — the snapshot
answering the three questions, composed of the location anchor (header), the plan-derived
open-work list (with the step-tree dropdown), and the recent-history list. It honors the
four-tab law: no fifth tab is minted; the changed-files / per-file diff capability that
`review-rail-viewers` unblocked via the content route remains available (as the Changes
pillar / its sections), and Inspect and Search are unchanged. Where `review-rail-viewers`
placed plan status in the Work pillar and history as a compact list within the Changes
overview, this ADR consolidates them into the Status overview as the rail's headline surface
and fixes their data sources to the plan-derived model above.

**Explicitly dropped: a "connections" section.** The rail will **not** carry a connections /
related-nodes section. Connectivity is already expressed twice — by the center graph (the
linkage graph is connectivity made visible) and by the left-rail tree (structural
containment and relation). Duplicating it in the right rail is bloat that competes with the
three questions the overview exists to answer. This is a deliberate non-goal: "what is being
worked on" is read from plan-step state, and connectivity is left to the surfaces that
already own it.

## Rationale

Reading open work from **plan documents** rather than graph connections is correct because
the plan is the canonical unit of work in this project's pipeline: a Step's checkbox is the
ground truth of "done vs. remaining", and the engine already projects it
(`in_flight`/`progress`, `plan_interior`) and the CLI already renders the exact in-flight
list the rail wants (`vaultspec-core status`). Graph density is a different fact — it answers
connectedness, not remaining work — and using it would make the rail lie about progress while
duplicating what the graph and tree already show. Anchoring the model on the plan-step state
also means the rail stays truthful through re-indexes: completion is read, never guessed.

Reusing `/pipeline`, `/status`, `/map`, and `/nodes/{id}/plan-interior` keeps the feature
almost entirely additive — three of the four sections are pure projections already on the
wire. The single new datum, recent commit history with subjects, fills a gap the engine had
already self-identified (the `commits` `subject` note) and lands within settled, read-only,
bounded, tiers-bearing capability. Dropping the connections section follows the activity-rail
scarcity discipline: a surface earns its place only by asking a distinct question, and
connectivity is not a question the rail needs to re-answer.

## Consequences

- **Gain.** The rail answers *Where are we / What is being worked on / What has been
  committed* from honest sources: the location anchor from `/status`, open work from the
  plan-step projection (`/pipeline` + `plan-interior` step tree), and history from a bounded
  commit read — each a projection over the one model, none a duplicated or guessed fact.
- **Gain.** Keeping the existing step-tree dropdown means the open-steps disclosure is reuse,
  not new UI, and stays consistent with the Work pillar already shipped.
- **Cost.** One new engine surface (a `/history` route or a `subject`-bearing extension of the
  commit-event projection) plus one new stores query. It is small and read-only, but it is the
  one piece that is not pure reuse, and it must be bounded (last N) and tiers-bearing at
  creation.
- **Pitfall avoided.** The tempting "connections" section is explicitly refused: it would
  duplicate the graph and the tree and pull the rail away from the three questions. Recording
  it as a non-goal stops a future agent from re-adding it as an apparent omission.
- **Refinement, not supersession.** `review-rail-viewers` and the activity-rail / pipeline
  ADRs remain in force; this ADR fixes the Status overview as the primary tab and pins the
  plan-derived data model and the dropped-connections non-goal. The four-tab law and the
  changed-files/diff capability are unchanged.
- **Pathway.** A bounded `/history` (or subject-bearing commit projection) is reusable beyond
  the rail — the bottom timeline, search-result provenance, and commit→document cross-links
  all benefit from commit subjects being on the wire.

## Codification candidates

- **Rule slug:** `open-work-is-read-from-plan-steps-not-graph-density`.
  **Rule:** Any surface that reports "what is being worked on" / open or in-flight work derives
  it from plan-document step state (the `- [ ]`/`- [x]` checkbox completion the engine projects
  via `in_flight`/`progress` and `plan-interior`), never from graph connectivity, edge recency,
  or transport state; connectivity stays the graph's and the tree's concern and is not
  re-expressed as a work signal.
  (Candidate only — promote after the boundary has held across at least one full cycle, per the
  codify discipline; first encounter is not yet a rule.)
