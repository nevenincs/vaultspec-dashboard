---
tags:
  - '#reference'
  - '#dashboard-foundation'
date: '2026-06-12'
related:
  - "[[2026-06-12-vaultspec-engine-adr]]"
  - "[[2026-06-12-dashboard-gui-adr]]"
---

# `dashboard-foundation` reference: `engine-GUI contract`

Migrated from the kickoff working set (`tmp/kickoff/`) on 2026-06-12; this
is the stamped record.

Status: AGREED at capability level by engine-architect and
experience-architect, 2026-06-12 (redlines 1–3 folded in; R1–R3 resolved
below). Referenced by both `2026-06-12-vaultspec-engine-adr` and the GUI spec.
Capabilities are binding; exact endpoint paths/field names are illustrative
until implementation.

## 1. Delivery model (confirmed)

- The engine runs `vaultspec serve`: a resident local server on loopback.
- **Single origin.** The engine serves (a) the GUI SPA static bundle, (b) the
  query API, (c) the ops proxy (§6), (d) the SSE stream. The GUI talks ONLY
  to the engine — one origin, one auth story, one degradation model.
- Transport: HTTP + JSON; **SSE** for streaming (no WebSocket in v1 — no
  bidirectional need identified).
- Discovery: `service.json` (port, bearer token, pid, heartbeat) mirroring
  vaultspec-rag's resident-service pattern. `/health` ungated; everything
  else bearer-gated, loopback-only. Not an auth boundary; keep on loopback.
- **SPA token bootstrap** (amendment, audit DF-6, agreed by both sides
  2026-06-12): the engine injects the service token into the served
  `index.html` (meta tag); SPA clients send it as the bearer on every
  request **including `/stream` - which requires fetch-based SSE
  consumption; native `EventSource` cannot set an Authorization header and
  is insufficient**. `service.json` remains the discovery path for
  cross-process consumers; dev-server proxies read `service.json` and
  inject the Authorization header server-side, and **meta-tag absence is
  legal** (the SPA degrades to no-header and lets the proxy carry auth).
  **Stale-token semantics:** an engine restart mints a new token; `401` is
  the canonical "token stale - re-bootstrap by reloading the page" signal,
  a designed degraded state (reconnect, 401, reload prompt), never an
  anonymous error. The engine validates the `Host` header on every request
  (DNS-rebinding defense).

## 2. Identity guarantees (cross-cutting)

- **Node ids are stable across queries, scopes, and time**: derived from
  kind + canonical key (feature tag; vault stem; plan stem + `W##/P##/S##`;
  commit SHA; repo-relative path[#symbol]). Never positional, never
  regenerated. The GUI caches and animates by id.
- **Edge ids are stable**: content hash of (src, dst, relation, tier,
  provenance key). Re-derivation of the same edge yields the same id.
- Anything unbounded is cursor-paginated (`cursor`/`next_cursor`).
- **Every response carries a `tiers` degradation block**, e.g.
  `{"semantic": {"available": false, "reason": "rag service down"}}` so the
  UI renders absent tiers truthfully, never as errors.

## 3. Workspace map (left rail)

- `GET /map` — repository → branches (default/feature/other classification,
  advisory) → worktrees, flagged with which contain vault corpora; the
  engine's *launch-default* scope marked (advisory only). Remote feature
  refs without checkouts appear with a `degraded: ["structural"]` marker
  (no working tree to resolve against).
- **Scope is fully stateless.** Every working-tree-dependent endpoint takes
  a required `scope` parameter (a worktree path or ref id from `/map`),
  validated per request; there is no server-held scope state and no
  `POST /scope`. Two clients on different scopes never interfere, and
  responses are cacheable by `(scope, filter, as_of)`.
- `GET /vault-tree?scope=` — vault-scoped file tree: paths + doc type +
  feature tag(s) + dates. Metadata only, no content.

## 4. Graph queries (center stage)

- `POST /graph/query` — scoped snapshot. Body: `{scope, filter, as_of?}`.
  Filter is a JSON object **owned and validated by the engine** and echoed
  back normalized: provenance tiers on/off, min confidence per tier
  (float 0..1, per R3), edge relation types, **structural edge state
  (resolved|stale|broken — powers the "show broken" lens)**, node kinds/doc
  types, feature tags, date range, text match. Response: nodes + edges.
  Broken-edge consumption rule (audit finding W02P05-201, agreed by both
  sides): broken structural edges carry confidence 0.0 — broken-ness is
  STATE, not low confidence — so the state facet is the canonical surfacing
  channel; the "show broken" lens selects on state without applying the
  structural confidence floor, and the structural tier's confidence slider
  governs resolved/stale shading only.
  - Edge fields: `id, src, dst, relation, direction, tier, confidence, state (structural only: resolved|stale|broken), provenance, observed_at`.
    Clarification (audit W03P10-602): `direction` is not a separate wire
    field - it is carried entirely by the `src` to `dst` ordering, which
    every tier populates meaningfully. Clients render direction from that
    ordering.
  - Node fields: `id, kind, doc_type?, feature_tags[], title, dates {created, modified}, lifecycle {state, progress?: {done, total}}, degree_by_tier {declared, structural, temporal, semantic}`.
  - **Constellation granularity:** queries at feature level return
    feature↔feature edges as **engine-aggregated meta-edges**
    `{count, breakdown_by_tier}` derived from the underlying document-level
    edges; the GUI never flattens doc-level edges client-side to draw the
    constellation. Document-level edges arrive on descent/expansion.
- `GET /filters?scope=` — enumerates the legal filter vocabulary actually
  present (relation types, tiers, doc types, feature tags, node kinds,
  date bounds, refs). The filter UI is data-driven; nothing hardcoded.
- `GET /nodes/{id}` — detail + **interior structure** as a subgraph (plan →
  waves/phases/steps with state; exec records bound to steps).
- `GET /nodes/{id}/neighbors?depth=1&tiers=&filter=` — ego network with full
  edge metadata. Lazy, on interaction.
- `GET /nodes/{id}/evidence` — attached documents, resolved code locations
  (file/symbol/line + resolution state), correlated commits (+ rule that
  correlated them).
- `POST /nodes/{id}/discover` — run rag discovery scoped to the node's
  content + linkage → ranked **candidate** edges, never auto-asserted,
  clearly tier-labelled semantic. Degrades to the §2 tier block when rag is
  absent.

## 5. Temporal (timeline + playhead)

- `GET /events?scope&from&to&kinds&bucket=` — heterogeneous dated events
  (commits, doc modifications, vault lifecycle events). **Engine-side
  bucketing committed**: `bucket=auto|raw|1h|1d|…`. The engine owns
  downsampling.
  - Raw event fields: `{id (stable), ts, kind, ref (sha|path|stem), node_ids[]}` — `node_ids` is load-bearing: timeline click → pulse the
    corresponding stage nodes; range-select → highlight; both join on it.
  - Bucketed response: per-bucket `{from, to, counts_by_kind}`.
- **Time-travel: keyframe + diff (option (b), committed).**
  - `GET /graph/asof?scope&t=<ts|sha>&filter=` — full snapshot (keyframe).
  - `GET /graph/diff?scope&from=T1&to=T2&filter=` — ordered delta log:
    `{op: add|remove|change, node|edge, t, seq}` entries. Scrubbing applies
    deltas client-side at frame rate; re-keyframe on large jumps.
  - **One delta clock.** Diff entries and the live `graph` SSE channel share
    a single monotonic sequence. `/graph/diff` responses carry `last_seq`;
    `/stream` accepts `since=<seq>` and resumes (or signals a gap requiring
    re-keyframe). A client that keyframed at T and holds diffs to T2 splices
    the live stream with no gap/overlap ambiguity at the LIVE boundary.
  - Historical views serve declared + structural + temporal tiers only;
    the semantic tier is present-only by design.
  - Historical views are **blob-true**: node lifecycle/progress at T (e.g.
    plan check-state) is reconstructed from document blobs as committed at
    T via the git object DB, never from the present working tree — the
    playhead's progress rings are time-accurate.

## 6. Ops proxy and status (right rail, pillar 2)

GUI talks only to the engine (§1), so sibling operations pass through a
clearly-namespaced, **transparent** proxy: the engine forwards whitelisted
verbs and returns sibling envelopes verbatim (plus the §2 degradation
block). No engine semantics in the proxy; domain logic stays in siblings.

- `POST /ops/core/{verb}` — whitelisted core CLI verbs run as subprocess
  with `--json` (e.g. `vault check`, `vault stats`). Required: a browser SPA
  cannot exec a CLI; the engine is the only server-side hand available.
- `POST /ops/rag/{verb}` — forwarded to rag's HTTP/control surface (service
  lifecycle where exposed, reindex, watcher tuning). 502-with-tier-block
  when rag is down.
- `GET /status` — point-in-time rollup: engine index state, watcher state,
  core reachability + vault health summary, rag service/watcher/index/job
  state, git status of the active worktree. Recovery snapshot for §7.

## 7. Streams (SSE)

`GET /stream?channels=` — one SSE connection, multiplexed channels:

- `graph` — incremental deltas (same shape as §5 diff entries) as the
  watcher re-indexes; GUI animates without refetching. Coarse `dirty`
  events accompany deltas as a fallback resync hint.
- `fs` — vault filesystem change notices.
- `git` — HEAD moves, ref changes, worktree dirty-state changes.
- `backends` — core/rag health transitions, rag job/index/watcher state.
- `index` — engine indexing progress.

Stream is delta; `/status` (§6) is recovery. Events carry monotonic
sequence numbers so the GUI can detect gaps and resync. The `graph` channel
shares the §5 delta clock: `GET /stream?channels=graph&since=<seq>` resumes
from a known sequence point or signals a gap (client re-keyframes).

## 8. Search (pillar 3)

- `POST /search` — pass-through to rag (`vault` and `code` targets, rag's
  existing filter vocabulary forwarded intact), with one engine value-add:
  each result is **annotated with the engine node id** it maps to (doc stem
  → document node; code path/symbol → code-artifact node) so results click
  through into the graph. Degrades to tier block when rag is absent.

## 9. Non-goals of this contract

- No vault document authoring/mutation through any surface.
- No agent orchestration endpoints (future layer builds beside, on
  `context()`-style reads).
- No multi-user/remote auth model; loopback single-operator only.
- Engine's own graph/query surface is read-only; the only writes that
  transit the engine are the §6 whitelisted sibling verbs, forwarded
  transparently.

## 10. Resolved redlines (record)

- R1 — ops whitelist: **exactly the brief's pillar-2 list** (rag service
  lifecycle, reindex, watcher tuning; core vault check/stats). Nothing
  destructive beyond what siblings already gate; anything else is a sibling
  filing, not whitelist growth. Approved by team-lead and confirmed by
  experience-architect, 2026-06-12.
- R2 — SPA serving mechanics are implementation detail (embed vs. dist
  dir), but the contract records these serving requirements: SPA fallback
  routing (unknown non-API paths → index.html), correct MIME types on
  assets, loopback-only bind, `--port` flag, fail-loud on port conflict.
- R3 — min-confidence wire grammar: **per-tier float 0..1**,
  engine-validated. Named presets are a GUI concern, compiled to floats
  client-side. Engine grammar stays primitive.
- REDLINE-1 — scope made fully stateless (§3); `POST /scope` dropped.
- REDLINE-2 — raw event fields and bucketed shape specified (§5).
- REDLINE-3 — single delta clock across `/graph/diff` and the `graph` SSE
  channel, with `last_seq`/`since=` splice guarantee (§5, §7).
