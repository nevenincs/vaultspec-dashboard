---
tags:
  - '#adr'
  - '#dashboard-foundation'
date: '2026-06-12'
related:
  - "[[2026-06-12-dashboard-foundation-research]]"
  - "[[2026-06-12-vaultspec-engine-adr]]"
  - "[[2026-06-12-dashboard-gui-adr]]"
  - "[[2026-06-12-dashboard-foundation-reference]]"
---

# `dashboard-foundation` adr: `kickoff decisions register` | (**status:** `accepted`)

Migrated from the kickoff working set (`tmp/kickoff/`) on 2026-06-12; this
is the stamped record.

Status: FINAL — team-lead synthesis, task #5 complete. Sources: engine spec
(review-clean), GUI spec (review-clean), contract draft 2 (AGREED), both
cross-reviews folded. This is the artifact the human approves against.
Specs: `2026-06-12-vaultspec-engine-adr`, `2026-06-12-dashboard-gui-adr`,
`2026-06-12-dashboard-foundation-reference`.

Legend — Confidence: **firm** (constrained by the brief's decided items),
**recommended** (architect's simplified pick, reversible), **provisional**
(pending cross-review/contract). "Needs human call" rows are flagged ⚑.

## Engine (`vaultspec` CLI) — from engine-spec draft 1

| ID   | Domain          | Decision                                                                                                                                                          | Confidence                                       |
| ---- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| D1.1 | Identity        | One Rust binary, two front doors: one-shot CLI verbs + resident `serve` mode                                                                                      | firm                                             |
| D1.2 | Identity        | Strictly read-and-infer: no vault writes, no sibling lifecycle control, ever                                                                                      | recommended                                      |
| D1.3 | Identity        | Inference results live in engine-owned storage, never written back to vault/core                                                                                  | recommended                                      |
| D2.1 | Outer framework | Workspace identity = repository common git dir; worktrees/refs are scopes within it                                                                               | recommended                                      |
| D2.2 | Outer framework | Worktrees privileged (all 4 tiers); remote refs degrade to declared+temporal                                                                                      | recommended                                      |
| D2.3 | Outer framework | Branch classification heuristic, configurable, advisory only                                                                                                      | recommended                                      |
| D2.4 | Outer framework | Incremental content-hash-keyed indexing; watcher in serve mode; cold one-shot stays usable                                                                        | recommended                                      |
| D2.5 | Outer framework | Git via pure-Rust `gix`; no libgit2, no shelling out                                                                                                              | recommended                                      |
| D3.1 | Linkage model   | One edge schema across all tiers; tier + provenance mandatory                                                                                                     | firm                                             |
| D3.2 | Linkage model   | Fixed per-tier confidence bands; nothing learned/tunable in v1                                                                                                    | recommended                                      |
| D3.3 | Linkage model   | Structural resolution state (resolved/stale/broken) retained and surfaced                                                                                         | firm                                             |
| D3.4 | Linkage model   | Temporal correlation = named attributed rules; core commit enrichment is opportunistic upgrade                                                                    | firm                                             |
| D3.5 | Linkage model   | Semantic edges ephemeral, lazy, TTL-cached, capped at 0.7, absent from historical views                                                                           | recommended                                      |
| D4.1 | Node model      | Feature convergence (keyed by feature tag) is the primary entity; documents are attached evidence                                                                 | firm                                             |
| D4.2 | Node model      | Cross-branch identity = stable key + per-corpus-view facets; divergence is signal                                                                                 | recommended                                      |
| D4.3 | Node model      | No rename detection in v1; renames report as absence + novelty                                                                                                    | recommended                                      |
| D4.4 | Node model      | `context(node)` is a pure serializable read — the future orchestration seam                                                                                       | firm                                             |
| D5.1 | Boundaries      | Core via CLI `--json` subprocess + direct document-byte reads; pinned schemas, loud failure                                                                       | recommended                                      |
| D5.2 | Boundaries      | Rag via optional loopback HTTP; engine adds no search/control *semantics* — transparent pass-through only (contract §6/§8), node-id annotation the sole addition  | firm                                             |
| D5.3 | Boundaries      | Sibling surface gaps filed upstream, never patched around                                                                                                         | firm                                             |
| D6.1 | CLI             | CLI verbs and serve endpoints are thin shells over one shared query core                                                                                          | recommended                                      |
| D6.2 | CLI             | `--json` envelopes follow core's result vocabulary                                                                                                                | recommended                                      |
| D7.1 | Serve           | Loopback HTTP + JSON + SSE; no WebSocket/gRPC in v1                                                                                                               | firm (contract agreed)                           |
| D7.2 | Serve           | Filter vocabulary server-enumerated; clients render, never define                                                                                                 | firm (contract agreed)                           |
| D7.3 | Serve           | `as_of` views exclude semantic tier and are blob-true: lifecycle/progress at T reconstructed from blobs as committed at T (git object DB), never the present tree | firm (contract agreed)                           |
| D8.1 | Persistence     | In-memory graph for queries; SQLite derived-artifact cache at `.vault/data/engine-data/`; no graph DB                                                             | recommended                                      |
| D8.2 | Persistence     | Full re-derivability: index --full from deleted cache converges to identical graph                                                                                | firm                                             |
| D9.1 | Packaging       | One cargo workspace in this repo; `engine-model` as dependency sink                                                                                               | recommended                                      |
| D9.2 | Packaging       | Per-platform wheels bundle the binary; Python package is locator/launcher                                                                                         | recommended ⚑ (packaging cost — human awareness) |

## Pillar 2/3 broker seam — RESOLVED in contract draft 1

**Single origin:** `vaultspec serve` serves the GUI SPA bundle, the query
API, the SSE stream, AND a clearly-namespaced **transparent ops proxy**
(`/ops/core/*`, `/ops/rag/*`, whitelisted to the brief's pillar-2 verb list)
plus `/search` pass-through to rag with engine-node-id annotation. No engine
semantics in the proxy; domain logic stays in the siblings; sibling
envelopes returned verbatim. One origin, one auth story, one degradation
model. Consequence: engine-spec D1.2/D5.2 wording is being reconciled to
"no sibling control/search *semantics*" (transparent forwarding only) —
flagged to engine-architect, due at cross-review.

Contract also commits: stable node/edge ids (GUI animates by id); a `tiers`
degradation block on every response (absent tiers render truthfully, never
as errors); engine-side event bucketing for timeline density; time-travel
as keyframe (`/graph/asof`) + delta log (`/graph/diff`) so the playhead
scrubs client-side at frame rate; multiplexed SSE channels with monotonic
sequence numbers and `/status` as the recovery snapshot.

## GUI (dashboard frontend) — final (cross-review approved and folded)

| ID   | Domain          | Decision                                                                                                                                                                               | Confidence                                    |
| ---- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| G2.a | Anatomy         | Four regions: left scope rail, center stage, right activity rail, bottom timeline; rails collapsible, timeline collapses to strip, command palette (Ctrl/Cmd-K)                        | firm                                          |
| G2.b | Anatomy         | One shared selection concept across browser/stage/timeline/inspector; inspector in right rail, no modal viewers                                                                        | recommended                                   |
| G2.c | Anatomy         | Left browser vault-scoped and read-only in v1                                                                                                                                          | firm                                          |
| G3.a | Graph stage     | Two node species: synthesized feature-convergence nodes default, document nodes by descent; whole-corpus view only as a deliberate lens                                                | firm                                          |
| G3.b | Graph stage     | Details-first interaction (van Ham & Perer DOI): scoped constellation → ego highlight → open-in-place → expand-on-demand; explicit visible working set                                 | recommended                                   |
| G3.c | Graph stage     | Fixed product-wide tier encoding: declared=solid, structural=status-colored, temporal=dotted, semantic=translucent haze; semantic candidates visually quarantined, session-pinned only | firm                                          |
| G3.d | Graph stage     | No edge bundling (degrades path tracing); meta-edge aggregation between closed clusters; motif glyphs for fans                                                                         | recommended                                   |
| G3.e | Graph stage     | ForceAtlas2 warm-start in web worker; canonical layouts for canonical structure (lifecycle axis, plan tiers); cached positions per workspace                                           | recommended                                   |
| G3.f | Filtering       | Tier dial (per-tier toggles + confidence thresholds) as primary control; engine-enumerated vocabulary; animated transitions; saveable named lenses                                     | recommended                                   |
| G4.a | Timeline        | Bottom-docked movie idiom: ≤4 fixed lanes, zoom=aggregation, glyph-coded events; LIVE by default                                                                                       | firm                                          |
| G4.b | Timeline        | Scrub = explicit time-travel mode driving the stage's temporal state, mutation verbs disabled; client diff-log replay (contract keyframe+diff), debounced snapshots as fallback        | recommended                                   |
| G4.c | Timeline        | Range-select is the product's single date-range filter; range "play" animates network growth                                                                                           | recommended                                   |
| G5.a | Delivery        | COMMITTED: decoupled web SPA served by engine `serve`; no Tauri in v1; nothing may preclude a later Tauri shell                                                                        | firm                                          |
| G5.b | Stack           | React 19 + TS + Vite 6 SPA; TanStack Router + Query v5 (server state) / Zustand-class (view state) / renderer-owned scene state outside React; SSE streams, HTTP verbs                 | recommended                                   |
| G5.c | Stack           | Tailwind v4 + Base UI as the committed unstyled-primitives default (Radix fallback); no CSS-in-JS, no component library                                                                | recommended                                   |
| G5.d | Stack           | Pins, cached node positions, and saved lenses persist client-side; the engine has no preference store                                                                                  | firm                                          |
| G6.a | Renderer        | Hybrid GPU-field + DOM-island architecture regardless of library                                                                                                                       | firm                                          |
| G6.b | Renderer        | PixiJS v8 + graphology/FA2-worker + d3 interpolators + React DOM islands; glyphs as sprite/SDF; sigma.js v3 named fallback; week-one spike with frame-time gates decides finally       | recommended ⚑ (spike gate — human visibility) |
| G7.a | Visual language | Structural=conventional / expressive=hand-drawn split; tie goes to conventional                                                                                                        | firm                                          |
| G7.b | Visual language | Precision rule: data coordinates exact; hand-drawn lives in treatment only                                                                                                             | firm                                          |
| G7.c | Visual language | One commissioned hand-drawn glyph family (SVG + GPU forms); budgeted as dedicated design work                                                                                          | firm ⚑ (commissioning cost — human call)      |
| G7.d | Visual language | Tier encoding grayscale-safe (treatment primary, hue secondary); WCAG AA + full keyboard operability floor; light+dark from day one                                                    | firm                                          |
| G8.a | Degradation     | Degradation matrix is spec'd, illustrated, debug-reachable, and tested — a feature, not an error path                                                                                  | firm                                          |

## Engine↔GUI contract — AGREED (draft 2), task #3 complete

Settled and recorded in `2026-06-12-dashboard-foundation-reference`, referenced by both specs:
single origin (engine serves SPA + API + transparent ops proxy + SSE);
loopback HTTP+JSON+SSE, no WebSocket; stable node/edge ids; tier degradation
block on every response; server-enumerated filter vocabulary; keyframe+diff
time-travel (one client animation path for liveness and scrubbing); semantic
tier present-only; **fully stateless scope** (request parameter everywhere,
no server-held scope session); `node_ids[]` on raw timeline events
(cross-highlighting join key); **single delta clock** across `/graph/diff`
and the graph SSE channel with `last_seq`/`since=` splice guarantee (closes
the LIVE-boundary race). R1 = exact pillar-2 ops whitelist (all three
parties confirmed); R2 = SPA serving requirements recorded
(implementation-detail); R3 = per-tier confidence floats on the wire,
presets GUI-side.

Cross-review additions folded into contract draft 2 as engine commitments:
structural edge state as a filter facet; constellation-level feature↔feature
edges served as engine-aggregated meta-edges `{count, breakdown_by_tier}`.

Cross-review (task #4): COMPLETE both ways. Engine spec: review-clean (D5.2
rewording, blob-true as_of, advisory + nits folded). GUI spec: approved
(client-side persistence stated, in-flight-status degraded card added,
Base UI committed, citation nits fixed).

## Items flagged for the human ⚑

- G6.b — renderer pick (PixiJS v8) is gated by a week-one frame-time spike;
  sigma.js v3 is the named fallback. **Verdict (2026-06-12, gui plan
  W01.P01.S01–S03): PixiJS v8 CONFIRMED; fallback not invoked.** Mesh-based
  edge rendering (in-place position-buffer uploads, replacing per-frame
  re-tessellation) closed the only soft spot: 10k/50k settled-animating
  7.5 → 59.3 fps, continuous-layout 8.7 → 36 fps; 1k/5k vsync-locked
  throughout. *Open condition:* measured on a discrete RTX 4080 SUPER, so
  numbers are an upper bound; the gate's literal integrated-GPU run remains
  a five-minute manual pass (`npm run dev` in frontend/, open
  `/spike.html?nodes=10000&edges=50000`, read the HUD).
- G7.c — the hand-drawn glyph family is commissioned design work with a real
  budget/schedule; needs your go/no-go when design phase starts.
- D9.2 — per-platform wheels bundling a Rust binary raise packaging/CI cost;
  posture fixed, mechanics deferred; awareness only.

## Upstream dependencies (filed against siblings, not worked around)

- vaultspec-core in-flight **date-stamping mandate** (graph API + documents)
  — the temporal tier's data foundation; track its landing.
- vaultspec-core **opt-in commit-linkage enrichment** (step/feature ids in
  commit metadata) — temporal confidence upgrade, never required.
- vaultspec-core **ref-scoped `vault graph`** (accept an explicit ref) —
  today the engine must run core inside each checkout.
