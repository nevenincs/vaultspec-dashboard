---
tags:
  - '#adr'
  - '#rag-integration-hardening'
date: '2026-07-03'
modified: '2026-07-03'
related:
  - '[[2026-07-03-rag-integration-hardening-research]]'
  - '[[2026-06-14-dashboard-rag-search-adr]]'
  - '[[2026-06-16-rag-control-plane-adr]]'
  - '[[2026-06-26-rag-service-management-adr]]'
  - '[[2026-07-02-rag-console-review-audit]]'
---

# `rag-integration-hardening` adr: `semantic search rides the resident service` | (**status:** `accepted`)

## Problem Statement

Semantic search is the dashboard's third product pillar and the substrate the upcoming
advanced-semantic-compilation work will build on. The research established that the
integration is far healthier than assumed — the frontend is fully wired, the service
lifecycle is sound, and every rag surface is bounded and tiers-honest — but the headline
search path itself has four reliability holes that make it untrustworthy as a foundation:
a client/engine timeout inversion that renders a cold-but-working rag as a hard error, a
per-query CLI-subprocess execution model that contradicts the accepted control-plane
transport split, no freshness signal on the search plane, and a semantic success path
that no live test exercises. This ADR decides the hardening architecture that closes
those holes and retires the contradictory dead seams, so prototyping against `/search`
starts from a stable contract.

## Considerations

- The rag-control-plane ADR already decided the transport split (D1: runtime verbs ride
  rag's resident HTTP service through `rag-client`; only process lifecycle is CLI) and
  the freshness contract (D4: a semantic-index epoch downstream builds key on). `/search`
  predates that decision and still spawns `vaultspec-rag search` per query
  (`engine/crates/vaultspec-api/src/routes/ops.rs`), paying process + interpreter +
  model-attach latency on every keystroke-settled query; the HTTP search seam was built
  (`engine/crates/rag-client/src/search.rs`) but never wired, and its annotator carries
  the historically-wrong `source`-as-path semantics.
- The engine's live annotator `flatten_and_annotate`/`hit_node_id` is correct, guarded
  against both historical mis-derivations, and covered by a recorded-fixture test; any
  transport change must keep exactly this annotation semantics.
- The frontend aborts search at 5s while the engine budget is 8s, so the engine's honest
  degradation envelope can never arrive on a slow search; degradation-is-read-from-tiers
  only works when the tiers envelope actually reaches the client.
- The D4 semantic epoch already exists engine-side (sourced from rag's `/jobs`) but is
  wired only to the embeddings cache; search responses carry no epoch, so consumers
  cannot distinguish fresh from stale results or key caches on index state.
- The live frontend suite runs without rag, so CI exercises only the degrade path; the
  success chain rests on one 2026-06-13 recorded fixture that can rot against a moving
  rag CLI.
- Governing rules bind the shape: engine-read-and-infer (verbatim forwarding, engine
  value-add limited to annotation), bounded transport everywhere, tiers on every
  response, no deprecation bridges (one canonical seam, delete the loser), and the
  stores layer as sole wire client.

## Considered options

- **O1 — Move `/search` onto the resident HTTP service via `rag-client` (chosen).**
  Aligns with the accepted control-plane D1 split, removes per-query spawn latency,
  reuses the proven bounded `LoopbackTransport`, and lets the availability gate degrade
  exactly as today. Con: search requires the resident service — acceptable because the
  current path already degrades when discovery fails, so the served surface is unchanged.
- **O2 — Keep the CLI-per-query model; fix only the client timeout.** Minimal diff, but
  permanently codifies the contradiction with control-plane D1, keeps cold-spawn latency
  as the steady state, and leaves the dead HTTP seam inviting mis-wiring. Rejected.
- **O3 — HTTP transport with CLI fallback when the service is absent.** Two transports,
  two failure vocabularies, a permanent deprecation bridge — forbidden shape. Rejected.

## Constraints

- **Parent stability.** Depends on shipped, audited seams: `LoopbackTransport` (socket
  timeout + 16 MiB body cap), typed discovery (`discover`/`probe_machine_state`), the
  `brokered_envelope` degradation path, `flatten_and_annotate`/`hit_node_id`, and the
  existing `semantic_epoch` read. All verified sound by the 2026-07-02 console audit and
  this feature's research. No frontier risk anywhere on the path.
- **rag's HTTP `/search` is an external cross-repo contract — verified live against
  rag 0.2.28.** Request body: `{query, type, project_root, top_k}` plus rag's optional
  filter vocabulary; `project_root` is REQUIRED and the route is bearer-token-gated with
  the `service_token` discovery already carries (the transport already sends it).
  Response is FLAT — `{request_id, results, summary, timing, index_state}` — not the
  CLI's nested `{ok, command, data:{results}}` envelope, and result items carry
  `source` (the vault/codebase discriminator), `path`, `id`, `title`, `score`,
  `snippet` (not the CLI's `excerpt`). The engine annotator and the frontend adapter
  vocabulary must be pointed at this flat shape; a shape miss still degrades the
  semantic tier with a stated reason (the existing `SearchShapeMiss` discipline), never
  a parse-or-crash.
- **Per-verb budgets, not one global timeout.** The HTTP search budget must be sized for
  a warm resident service, while the client budget must strictly exceed the engine
  budget so the tiers envelope always lands.
- **engine-read-and-infer.** Epoch/index-state annotation on the search response is
  engine value-add of the node-id kind: sourced verbatim from rag's own state, never
  engine-invented staleness semantics.
- **Live tests must skip honestly** on machines without a resident rag (typed skip with
  a stated reason), never mock the wire, and never start a service against this
  worktree.

## Implementation

Five decisions.

**D1 — `/search` rides the resident service through `rag-client`.** The `rag-client`
search module becomes a pure bounded HTTP transport: POST to rag's `/search` on the
discovered port, per-verb wall-clock budget + `MAX_RAG_BODY` cap, returning rag's
envelope verbatim as `serde_json::Value`. The engine route keeps its existing shape: the
same request validation (query length, target, `max_results` ceiling), the same
availability gate via typed discovery, the same `flatten_and_annotate`/`hit_node_id`
annotation, the same degraded-tiers-200 on every fault, run under `rag_offload` like
every other brokered read. The CLI spawn (`SEARCH_SIBLING_TIMEOUT`, the `rag_invocation`
search arm) is deleted, and the stale `target_node_id` plus the annotation half of
`forward_search` are deleted with it — one transport, one annotator, no bridge.
`degradation_reason` survives (it is live on the brokered and embeddings paths).

**D2 — Timeout coherence: the client outlives the engine budget.** The engine's HTTP
search budget is set for the warm service (the Tier-1 read class), and the frontend's
search abort is set strictly above the engine budget plus transport margin, so every
outcome — success, degraded, shape-miss — arrives as a tiers-carrying envelope before
the client can abort. A client-side abort therefore only ever means the engine itself is
unreachable, which is the transport-error state, honestly.

**D3 — The search plane carries the freshness contract.** rag 0.2.28 already serves
`index_state` on every HTTP `/search` response — `{source, indexed_count, vault_count,
code_count, indexed_target_root, requested_target_root, target_matches, status}` — so
the core freshness facts ride the same response verbatim at zero extra cost; the engine
forwards them untouched. The engine additionally annotates the response with the D4
`semantic_epoch` (from the same short-TTL cached read the embeddings path uses,
degrading to an honest absent marker — never blocking the search on a second slow
round-trip) so downstream builds share one invalidation key across search and
embeddings. The stores search controller surfaces both to consumers; presentation stays
a served-token mapping.

**D4 — The success path is exercised live, gated on a resident rag.** One engine test
and one frontend test drive a real query through the full chain — engine → resident rag
→ annotation → controller — gated on machine-global discovery finding a live service,
skipping with a stated reason otherwise. The recorded fixture stays as the always-on
shape guard; the gated live test is the drift detector.

**D5 — Ride-along residuals close with the same change.** The frontend sends
`max_results` so the wire payload is app-bounded; `server-status`/`server-doctor`/
`server-install` gain the same version-tolerant `--json` exit-2 retry the start path
has; `reprobe_rag_until_running` runs under `rag_offload`; the P02.S05 Tier-3
coordination note (machine-wide aggregate storage totals on `/storage/survey`, which is
also the blake2b sunset trigger) is filed; and tiers-on-`stop_failed` is decided as
correct-as-is — the tiers block reports the true current service state, and the
`stop_failed` outcome lives in the envelope status, closing the ADR silence.

## Rationale

The research showed the substrate (lifecycle, brokered control plane, bounds, tiers
honesty) is already the stable part; the instability is concentrated in exactly the path
the control-plane ADR's transport split never reached. Moving `/search` onto the
resident service is not a new architecture — it is finishing an accepted one, with the
proven halves (bounded transport from `rag-client`, correct annotator from the route)
composed and the wrong halves deleted. The timeout inversion is the highest-severity
fix because it converts the most common cold-start experience from a false hard failure
into the honest envelope the whole degradation architecture was built to deliver; it is
also two constants once the transport is warm. The freshness annotation reuses D4's
existing epoch rather than inventing staleness semantics, which keeps the engine
read-and-infer and gives the advanced-semantic-compilation follow-on the invalidation
key it needs. The live-gated success test is the only way shape drift in an external
sibling lands in CI instead of on users, and honest skipping keeps it from flaking on
rag-less machines.

## Consequences

- **Gains.** Search latency drops to a warm HTTP round-trip; every search outcome
  reaches the client as a tiers-carrying envelope; downstream builds get a freshness key
  on the search plane; the dead contradictory seam is gone; CI catches rag shape drift
  on any machine with a resident rag; five audited residuals close.
- **Costs and difficulties.** rag's HTTP `/search` request/response vocabulary must be
  confirmed against the sibling before the transport lands (a small cross-repo
  verification, not a redesign); the epoch annotation must be genuinely non-blocking or
  it would tax every search with a second round-trip; the live-gated tests introduce a
  machine-dependent test class that must skip loudly, not silently.
- **Risks.** If rag's HTTP search shape diverges from the CLI shape, the annotator's
  fixture must be re-recorded from the HTTP path — the shape-miss discipline degrades
  honestly in the interim. A future rag changing `/search` semantics remains a
  cross-repo coordination event, as with every brokered verb.
- **Pathways opened.** A warm, epoch-annotated `/search` is the substrate the
  advanced-semantic-compilation prototype builds on directly; the same pattern (bounded
  HTTP verb + verbatim envelope + engine annotation) extends to any future rag search
  affordance (filters, similarity, clustering) without re-deciding transport.

## Codification candidates

- **Rule slug:** `search-rides-the-resident-service`. **Rule:** `/search` is a bounded
  `rag-client` HTTP verb against the resident rag service — never a per-query CLI spawn —
  and every search response carries the semantic epoch annotation; client-side search
  budgets strictly exceed the engine's search budget so the tiers envelope always
  arrives. (Candidate; promote after one full execution cycle. Extends
  `rag-control-is-brokered-not-absorbed` to the search plane.)
