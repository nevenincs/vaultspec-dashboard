---
tags:
  - '#research'
  - '#status-overview'
date: '2026-06-16'
modified: '2026-06-16'
related: []
---

# `status-overview` research: `right-rail Status overview: plan-completion model, engine data inventory, git-history gap`

Grounding for the `status-overview` ADR. Question: when the right rail reports "what is
being worked on", what is the source of truth, and does the engine already serve the data
the three-question Status overview needs (location anchor, open work, recent history)?
Findings are from the live CLI and a read of the engine route handlers.

## Findings

### F1 — Plan documents encode completion canonically; the CLI already projects it

A plan's leaf unit is the Step, rendered as a GFM task item: `- [ ]` is open, `- [x]` is
done. `vaultspec-core vault plan status <plan> --json` emits schema
`vaultspec.vault.plan.status.v1` with `tier`, `wave_count`, `phase_count`, `step_count`,
`steps_completed`, `completion_percent`, `waves_completed`, `phases_completed`, and
`next_open_step`. Verified live against `2026-06-16-review-rail-viewers-plan`: `tier: L2`,
`step_count: 36`, `steps_completed: 6`, `completion_percent: 16.7`, `phases_completed: 1`,
`next_open_step: P02.S07`. `vaultspec-core status` already renders the exact list the rail
wants — "Plans in flight (at least one open step)" with tier, waves/phases, done/total
steps, percent, and the next open step. This is the canonical open-work model.

### F2 — The engine already serves open work: `GET /pipeline?scope=`

`routes/query.rs` `pipeline` runs `engine_query::pipeline::in_flight` over the scope's live
graph. A plan is in-flight exactly when its in-scope lifecycle state is `active` (checkbox
progress not complete); the projection is bounded — "in-flight" is the bound, never "all
plans ever". Each `PipelineArtifact` (`engine-query/src/pipeline.rs`) carries `node_id`
(`doc:{stem}`), `stem`, `title`, `doc_type`, `status` (ADRs), `tier` (plans),
`progress: {done, total}` (plans), and `phase`. Returned through the shared `envelope(...)`
with the tiers block.

### F3 — Per-plan open steps: `GET /nodes/{id}/plan-interior`

`engine_query::node::plan_interior` projects the wave → phase → step tree with per-step
`{id, action, done}` and a `truncated` honesty block at the node ceiling. This is the data
behind the existing plan step-tree dropdown (the Work pillar's expandable plan row) — the
established disclosure idiom for a plan's open steps; reuse, not new UI.

### F4 — Location anchor already served: `GET /status` (+ `/map`)

`routes/stream.rs` `status` returns `scope` (absolute worktree path, canonical token form,
forward slashes, no extended-length prefix) and a `git` block: `head_ref` (current branch),
`dirty`, `ahead`, `behind`. `GET /map?workspace=` (`routes/query.rs`) enumerates worktrees
with `path`, `head_ref`, `is_main`, `has_vault`, `ahead`, `behind`. The "Where are we?"
anchor (absolute path + worktree + branch) is pure reuse.

### F5 — Git history with commit subjects is the one gap

Nothing on the wire returns a recent-commit list of `{hash, subject}`. `GET /events?scope=`
carries commit events (`seq`, `ts`, `kind=commit`, `git_ref`, `node_ids`) via
`engine_query::events::commit_rows`, correlated to vault docs — but the commit **subject**
is not exposed. The engine self-flags this in `routes/query.rs`: the evidence note records
that `commits` "lack the `subject` (a git lookup)", deferred as a contract event. The
read-only `/ops/git/{verb}` proxy whitelists only `status`, `numstat`, `diff` — no `log`.
So "What has been committed?" (last N hashes + subjects) needs a bounded, read-only,
enveloped addition: a new `GET /history?scope=&limit=N` returning
`{commits: [{hash, short_hash, subject, ts, node_ids}], truncated?}`, or an extension of the
`commit_rows` projection to carry `subject`.

### F6 — Shared envelope, router, and proxy patterns (for any new route)

The tiers-bearing envelope helper is `envelope(data, tiers, next_cursor)` in
`routes/mod.rs`; degradation helpers (`query_tiers`, `degraded_tiers`, `degraded_tiers_for`)
live in `engine-query/src/envelope.rs`. Routes register in `vaultspec-api/src/lib.rs`
`build_router`, wrapped by `CatchPanicLayer`, the bearer gate, the tiers-envelope error
layer, and a 1 MiB body limit. The `/ops/git/{verb}` proxy (`routes/ops.rs`) is the verbatim
read-only sibling-pass-through pattern, with a fixed verb whitelist. A new `/history` route
follows these settled primitives and adds no engine frontier risk.

### F7 — Connections are already expressed; a rail "connections" section is bloat

Connectivity is shown twice: the center linkage graph (connectivity made visible) and the
left-rail tree (containment + relation). A connections section in the right rail duplicates
both and competes with the three questions the overview answers. Per the activity-rail
scarcity discipline (a surface earns its place only by asking a distinct question), it is a
deliberate non-goal — "what is being worked on" is read from plan-step state (F1–F3), not
from connectivity.
