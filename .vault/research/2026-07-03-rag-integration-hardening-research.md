---
tags:
  - '#research'
  - '#rag-integration-hardening'
date: '2026-07-03'
modified: '2026-07-03'
related:
  - '[[2026-06-14-dashboard-rag-search-adr]]'
  - '[[2026-06-16-rag-control-plane-adr]]'
  - '[[2026-06-26-rag-service-management-adr]]'
  - '[[2026-06-27-rag-affordance-adoption-adr]]'
  - '[[2026-06-27-rag-schema-gate-adr]]'
  - '[[2026-07-02-rag-console-review-audit]]'
---

# `rag-integration-hardening` research: `semantic search as a stable contract`

Three parallel research tracks established ground truth on the engine↔vaultspec-rag
integration ahead of a hardening decision: (1) service-management reliability, (2) the
engine's rag API surface and scope, (3) semantic-search end-to-end reliability including
the frontend wiring. The mandate's motivating assumptions were tested against code, the
seven governing rag ADRs, and the 2026-07-02 rag-console-review audit.

## Findings

### Headline: the mandate's two assumptions are false; the real gaps are narrower and different

Semantic search is NOT "unwired in the frontend": the Cmd/Mod+P palette search mode
(`frontend/src/app/palette/CommandPalette.tsx:76`) renders `SearchPaletteSurface`, which
consumes `useUnifiedSearchController` (`frontend/src/stores/server/searchController.ts:849`)
→ `useEngineSearch` (`frontend/src/stores/server/queries.ts:5436`) → `POST /search`
(`frontend/src/stores/server/engine.ts:2142`), with identity-bearing click-through into
the graph stage. Service management is NOT poorly integrated: all six decisions of the
2026-06-26 service-management ADR are implemented as decided, discovery is
machine-global-first and STATUS_DIR-free, every subprocess spawn carries both an output
cap and a wall-clock timeout, and nine enumerated wedge states (stale service.json,
suspended pid, squatted port, version skew, concurrent-start race, degraded Qdrant,
missing heartbeat, malformed candidates) all resolve without wedging
(`engine/crates/rag-client/src/client.rs:52,413,483`;
`engine/crates/vaultspec-api/src/routes/ops.rs:924,1013,1046,1102,1244`).

What IS unreliable is the headline search path itself, for four concrete reasons (G1–G4
below), plus a set of dead/contradictory seams and minor residuals. Hardening should be
scoped to those, not to a broad re-integration.

### Track 1 — service lifecycle: sound; three minor residuals

- Verified sound end to end: gate-then-attach start (`ops.rs:1102`), typed
  `DiscoveryOutcome`/`RagMachineState` predicates (`client.rs:413,483`), version-tolerant
  `--json` start with exit-2 detection (`ops.rs:1080,1137`), bounded lifecycle capture
  (120s / 8 MiB per stream, kill on breach, `ops.rs:924`), and the full subprocess
  discipline table (sibling 120s/8MiB, storage 300s/8MiB, core 120s/64MiB, capability
  probe 30s) — compliant with the resource-bounds rule at every site.
- T1-R1 (minor): `server-status`/`server-doctor`/`server-install` append `--json`
  unconditionally via the shared `run_sibling` with no exit-2 retry (`ops.rs:2324`) —
  the version-tolerance principle is applied only to `server start`. A future rag
  dropping `--json` on these verbs would 502 loudly (not silently), so risk is low.
- T1-R2 (minor): `reprobe_rag_until_running` (`ops.rs:1013`) runs blocking probe I/O on
  a Tokio async worker (worst case ≈7.5s of occupancy); the gate and post probes were
  offloaded via `rag_offload`/spawn_blocking under RCR-001 but the reprobe loop was not.
  Known accepted-low residual from the console audit.
- T1-R3 (minor, ADR-silent): `stop_rag_service` returns non-degraded filesystem tiers on
  a `stop_failed` outcome (`ops.rs:1253`); callers must read `status:"stop_failed"` from
  the envelope. Functionally correct; the tiers behavior for stop failure is simply
  undecided.

### Track 2 — API surface: fully inventoried; one dead-and-wrong seam; contracts otherwise clean

- Full inventory (all tiers-carrying on success AND error, all bounded): `POST /search`
  (CLI subprocess, 8s/8MiB, `ops.rs:2553`); `GET /ops/rag/{verb}` — 10 read verbs over
  rag HTTP at READ_BUDGET 10s / 16MiB body cap, all offloaded via spawn_blocking
  (`ops.rs:2109`); `POST /ops/rag/{verb}` — 6 HTTP control verbs (15s, quality 60s) + 5
  CLI lifecycle verbs (`ops.rs:2182`); `POST /ops/rag/storage/{verb}` — 3 destructive
  CLI verbs, dry-run-default, validated args (`ops.rs:2355`); `GET /graph/embeddings` —
  Tier-2 Qdrant scroll behind the two-stage schema gate with a semantic-epoch cache key
  (`engine/crates/vaultspec-api/src/routes/query.rs:892`).
- Contract quality: every surface has typed request bodies, verbatim rag envelopes under
  `data.envelope`, degradation as HTTP 200 + degraded tiers (never a guessed 5xx), and
  both timeout and body/output caps. The rag-console-review P01 fixes (RCR-001, -002,
  -004, -005) are landed; P02.S06 (RCR-003 rule amendment) is landed; **P02.S05 — the
  Tier-3 coordination ask toward rag for machine-wide aggregate storage totals — remains
  open** and doubles as the blake2b sunset trigger.
- T2-R1 (the one hard defect): `engine/crates/rag-client/src/search.rs:13,35` —
  `forward_search` (rag-HTTP search + annotation) and `target_node_id` have **zero
  production consumers**, and `target_node_id` implements the historically-wrong
  semantics (`source` read as a path) that the live annotator `flatten_and_annotate` /
  `hit_node_id` (`ops.rs:2700,2650`) explicitly documents as a past bug. Two divergent
  annotators with contradictory `source` semantics invite wiring the wrong one.
  `degradation_reason` (`search.rs:61`) IS live (consumed by `brokered_envelope` and
  `graph_embeddings`) and must survive any cleanup.
- No structural ADR contradictions remain across control-plane, schema-gate, and
  storage-broker ADRs; all decided behavior is implemented.

### Track 3 — semantic search end to end: wired and honest, but four reliability holes

The engine path works: bounds validated pre-rag (query ≤512 chars, target ∈ {vault,code},
`max_results` ceiling), rag-absent → 200 + `{results:[]}` + degraded tiers, sibling fault
→ degraded tiers, shape miss → typed `SearchShapeMiss` with stated reason, node-id
annotation guarded against both historical mis-derivations, and tier parity asserted by
`engine/crates/vaultspec-api/tests/declared_tier_parity.rs:128`. The frontend controller
implements the full dashboard-rag-search ADR state machine (debounce, tiers-gated
offline, sub-semantic fallback band, rag-health invalidation over the backends stream,
merged bound of 40). The full frontend suite for it passes live (44/44 against a real
serve on an ephemeral port). The rag-schema-gate does NOT sit on this path — it gates
only the Qdrant embedding scroll; conflating the two in the hardening decision would be
an error.

Gaps, ranked:

- **G1 (critical) — client/engine timeout inversion.** The frontend aborts search at
  5000ms (`queries.ts:5482` `SEARCH_QUERY_TIMEOUT_MS`) while the engine's search budget
  is 8s (`ops.rs:44` `SEARCH_SIBLING_TIMEOUT`), deliberately sized for a cold rag. A
  5–8s first-search-after-serve is aborted client-side, arrives as a raw AbortError with
  no tiers envelope, trips `isTransportError` (`searchController.ts:139`), and renders
  the hard "search request failed" error state. The engine's honest degradation envelope
  never arrives because the client hung up first. The most common cold-start experience
  is a false hard failure.
- **G2 (major) — live search is a per-query CLI subprocess, not the resident service.**
  `ops.rs:2583` spawns `vaultspec-rag search <query> --json` per request, paying
  process-spawn + interpreter + model-attach latency every time — the root cause feeding
  G1. This contradicts rag-control-plane ADR D1, which decided search "goes over rag's
  HTTP service through rag-client"; the HTTP path (`forward_search`) was built but never
  wired (T2-R1). Whether rag's CLI search attaches to the resident Qdrant or re-embeds
  per call was not measured (no live rag in this worktree).
- **G3 (major) — no freshness/staleness signal on the search plane.** `/search` is a
  pure read of whatever rag last indexed; reindex is manual (console trigger or rag's
  watcher, which nothing auto-starts). A never-indexed scope surfaces as semantic-offline
  with a stated reason, but a STALE index is indistinguishable from a fresh one. The
  control-plane ADR D4 semantic-epoch exists and is wired only to `/graph/embeddings`
  (`query.rs` epoch cache key); search responses carry no epoch/staleness annotation.
  For "a feature to build upon," this is the core reliability hole.
- **G4 (major) — the semantic success path is never exercised end to end in CI.** The
  live suite runs without rag, so the settled state it exercises is semantic-offline;
  the success chain is covered only by pure-function tests plus one engine fixture
  recorded 2026-06-13 (`ops.rs:2748`), which can rot against a moving rag. No test runs
  a real rag query through the full chain; real shape drift would land on users first.
- G5 (minor) — the dead `search.rs` seam (same defect as T2-R1).
- G6 (minor) — the frontend never sends `max_results` (`engine.ts:2142`); the engine
  ceiling and rag `--max-results` arg are dead from the app, so the wire payload size is
  rag's CLI default rather than an app-chosen bound (the palette bounds the merged view
  at 40 client-side).

### Decision candidates for the ADR

Ordered by load-bearing weight:

1. **Search transport (resolves G2, G5; shrinks G1).** Either revive the D1-decided
   HTTP path — route `/search` through `rag-client` against the resident service,
   porting the correct `flatten_and_annotate`/`hit_node_id` semantics into the crate and
   deleting the stale `target_node_id` — or consciously re-decide that search stays a
   CLI subprocess and delete `forward_search`/`target_node_id` outright (the
   no-deprecation-bridges discipline forbids keeping both). The HTTP path aligns with
   the accepted control-plane architecture, removes per-query spawn latency, and reuses
   the proven bounded `LoopbackTransport`; the CLI path's only advantage is that it
   works when the service is down — which the availability gate already handles as a
   degraded state anyway.
2. **Timeout coherence (resolves G1).** Make the client search budget strictly greater
   than the engine budget (or serve the engine budget to the client) so the engine's
   tiers envelope always arrives before the client aborts; treat a client-side abort as
   loading-too-long, not as the hard error state.
3. **Search-plane freshness (resolves G3).** Annotate `/search` responses with the D4
   semantic epoch (and/or an index-state field sourced from rag's service-state), so a
   consumer can distinguish fresh, stale, and absent-index results; decide the minimal
   honest vocabulary rather than inventing staleness semantics engine-side.
4. **Live success coverage (resolves G4).** One rag-gated live test (skipped honestly
   when no resident rag on the machine) driving a real query through engine → rag →
   annotation → controller, so shape drift is caught in CI on machines with rag.
5. **Ride-alongs:** send `max_results` from the app (G6); version-tolerant `--json`
   retry for `server-status`/`server-doctor`/`server-install` (T1-R1); offload
   `reprobe_rag_until_running` via `rag_offload` (T1-R2); file the P02.S05 Tier-3
   coordination note (also the blake2b sunset trigger); optionally decide tiers behavior
   on `stop_failed` (T1-R3).

### Sources

- `engine/crates/vaultspec-api/src/routes/ops.rs:44,58,102,115,870,924,1013,1046,1080,1102,1244,1927,1953,2109,2182,2324,2355,2489,2501,2553,2567,2583,2594,2610,2650,2680,2700,2748` — search handler, lifecycle, brokered verbs, whitelists, annotation
- `engine/crates/vaultspec-api/src/routes/query.rs:892,1049,1093,1143` — embeddings gate sequence, epoch cache, blake2b consumption
- `engine/crates/vaultspec-api/tests/declared_tier_parity.rs:128` — rag-down tier parity
- `engine/crates/rag-client/src/client.rs:52,392,413,453,467,483` — discovery, predicates
- `engine/crates/rag-client/src/control.rs:182,194,244,391,420` — Tier-1 verbs, ops-state rollup
- `engine/crates/rag-client/src/search.rs:13,35,61` — dead seam + live degradation_reason
- `engine/crates/rag-client/src/vectors.rs:52` — vault_collection_name (RCR-003)
- `frontend/src/stores/server/searchController.ts:79,128,139,616,638,724,764,849`
- `frontend/src/stores/server/queries.ts:5436,5482`; `frontend/src/stores/server/engine.ts:2142`
- `frontend/src/app/palette/CommandPalette.tsx:70,76`; `frontend/src/app/palette/SearchPaletteSurface.tsx:117,183`
- `frontend/src/app/right/RagOpsConsole.tsx:357,363` — manual reindex trigger
- Vault: the seven rag ADRs (2026-06-14 ×2, 2026-06-16, 2026-06-26, 2026-06-27 ×3), the 2026-07-02 rag-console-review audit (RCR-001..005 disposition), plan 2026-07-02-rag-console-review (P02.S05 open)
- Live evidence: frontend `searchController.test.ts` 44/44 pass, 11.96s, real serve on ephemeral port, rag absent (degrade path exercised, success path not)
