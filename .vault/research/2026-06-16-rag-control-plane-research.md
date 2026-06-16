---
tags:
  - '#research'
  - '#rag-control-plane'
date: '2026-06-16'
modified: '2026-06-16'
related:
  - '[[2026-06-16-graph-viz-quality-research]]'
  - '[[2026-06-16-graph-semantic-embeddings-adr]]'
  - '[[2026-06-12-dashboard-foundation-reference]]'
---

<!-- FRONTMATTER RULES:
     tags: one directory tag (hardcoded #research) and one feature tag.
     Replace rag-control-plane with a kebab-case feature tag, e.g. #foo-bar.
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

# `rag-control-plane` research: `rag service control plane and semantic linkage lifecycle`

A vault is just markdown files on disk with no linkage data embedded. Two separate engines
turn those files into a navigable, semantically-linked graph: the **vaultspec engine** (Rust,
read-and-infer) compiles the STRUCTURAL linkage graph from the files and serves it; the
**vaultspec-rag** sibling service (Python, GPU) compiles the SEMANTIC linkage — chunking,
embedding, and storing vectors in Qdrant — and continuously re-indexes as the vault evolves.
The dashboard intends to drive the *entire* rag service (indexing, search, watcher, lifecycle,
observability) from the frontend, and to build second-order semantic features on top of the
semantic database. Today the engine exposes only a coarse, fire-and-forget slice of rag's
control surface. This research maps both halves — the build lifecycle and the service-control
surface — establishes the gap, and frames the design decisions for a properly integrated rag
control plane. It pairs with the `graph-viz-quality` semantic work, which consumes rag's
embeddings but cannot yet drive or observe the build that produces them.

## Findings

### F1. Two compilation engines, one user-visible graph

- **Structural linkage (the engine, in-repo `engine/`).** A file watcher (notify crate,
  2s-debounced, coalesced through a bounded capacity-1 channel) triggers `rebuild_and_swap`:
  a two-pass ingest (Pass 1 parallel read + content-hash extraction cache + node upsert; a
  batched O(N·distinct-symbols) resolver that fixed the prior O(N^2), 601s→2.1s at 4000 docs;
  Pass 2 serial edge ingest minting structural + code-artifact nodes) builds an immutable
  `LinkageGraph` that is committed by an atomic `Arc` swap + `generation` bump (SeqCst), with
  memoized projections invalidating on the new generation. A separate async "declared fold"
  folds a slower `vaultspec-core` subprocess result, cached by HEAD sha, behind a coalescing
  trailing-edge guard. The graph is RAM-resident; the SQLite cache under
  `.vault/data/engine-data/` holds re-derivable artifacts (extract cache, declared snapshots
  kept N=4, temporal events 90-day retention) with WAL + incremental vacuum. The engine serves
  the structural graph while a new generation builds — never blocking.
- **Semantic linkage (the rag service, sibling `vaultspec-rag`).** A separate GPU process
  chunks vault markdown (heading-aware, ~512 char + overlap), embeds each chunk with
  Qwen3-Embedding-0.6B (1024-dim dense) + SPLADE (sparse), and upserts named-vector points into
  per-project Qdrant collections `r{blake2b6(normcase(root))}_vault_docs` (payload key `path`).
  Its OWN file watcher (2s debounce, 30s cooldown per source) continuously re-indexes vault and
  code as content changes. Indexing is ASYNC and JOB-BASED: a reindex returns a `job_id`; jobs
  carry phase/progress/result/resource (rss, cuda) snapshots.
- **The seam.** The engine reads rag's embeddings on demand over loopback HTTP via
  `rag-client` (`vectors.rs` Qdrant scroll, bounded by a 45s wall-clock budget + 16 MiB body
  cap + 64-page cap + `MAX_GRAPH_NODES`), serving them on the dedicated `/graph/embeddings`
  route; it never imports torch/rag (published-wheel-purity). Semantic availability is read
  from rag's heartbeat (`service.json`, stale > 120s) and reported in the per-response `tiers`
  block (the live "rag responded 404" / "available:false" truth the frontend reads).

### F2. The rag service control surface is rich, HTTP, job-based — and largely unexposed

The rag service (`~/.vaultspec-rag/service.json`, default port 8766, bearer-gated except
`/health`) serves a full management API. Capability inventory:

- **Lifecycle:** `server start/stop/status/doctor/warmup` (CLI; daemon spawn), `GET /health`
  (ungated readiness: qdrant, models_loaded, cuda, uptime), `GET /readiness`, `GET
  /service-state` (gpu, models, uptime, watching[], projects[]). Local vs Qdrant-server mode;
  `server qdrant install/status/clean`.
- **Indexing:** `POST /reindex` `{type: vault|codebase, clean, project_root}` → `{job_id,
  status:"queued"}` (ASYNC); `GET /jobs?phase&source&job_id&limit&since` → per-job
  phase/progress/result/resources/runtime; index status (vault_count, code_count, target_dir,
  size); dry-run.
- **Watcher:** `GET /watcher` (watch_enabled, debounce_ms, cooldown_s, watching[]),
  `POST /watcher/{start,stop,reconfigure}` `{root, debounce_ms?, cooldown_s?}`.
- **Search:** `POST /search` `{type, query, top_k, + filters}` — vault filters (doc_type,
  feature, date, tag, like/unlike_ids), code filters (language, path, node_type, function/
  class_name, include/exclude_paths, prefer); hybrid dense+sparse + cross-encoder rerank; rich
  `timing` breakdown; `POST /code-file`, `POST /vault-document`.
- **Multi-tenancy:** `GET /projects` (root, idle_seconds, ref_count, max_projects, idle_ttl),
  `POST /projects/evict` `{root}` → `{evicted, reason: ok|busy|not_found}`; LRU slots (default
  16), 30-min idle TTL, busy-skip.
- **Observability:** `GET /logs` + `/logs/json` (filtered by job_id/contains), `GET /metrics`
  (Prometheus), `POST /benchmark` (latency p50/p95/p99), `POST /quality` (MRR/recall@k/NDCG).

All control/read operations are HTTP on the running service; indexing is async with job
polling. The CLI and the MCP tools both delegate to these HTTP routes.

### F3. The engine exposes only a coarse CLI-subprocess slice

The engine's sibling pass-through (`vaultspec-api/src/routes/ops.rs`) forwards a whitelist by
shelling out to the `vaultspec-rag` CLI (NOT the rag HTTP service), bounded by a 120s timeout +
8 MiB stdout cap, killing the child on breach, attaching the `tiers` block, and returning the
sibling envelope verbatim (read-and-infer; contract reference §6). The current `RAG_WHITELIST`
is only: `server-start`, `server-stop`, `server-status`, `reindex` (= `index`), and
`watcher-status`. `/search` is likewise a CLI subprocess (flattened + `node_id`-annotated).
`rag-client` reaches rag's HTTP service for `search`, `embeddings`/`vectors`, node `discover`,
and availability — but NOT for any management verb. The frontend (`stores/server`) has
`opsRag(verb)` + `search()` client methods, an `OpsPanel` with a few coarse buttons
(service-start/stop, reindex, a not-wired watcher-reconfigure placeholder), and a tiers-gated
search controller. There is no store hook or UI for jobs, progress, watcher state, projects,
logs, metrics, or quality.

### F4. The gap — coarse fire-and-forget vs. an observable, controllable build

The mismatch is structural, not cosmetic:

- **Async indexing is invisible.** `/ops/rag/reindex` shells the CLI and returns when the CLI
  call returns; rag's real model is "reindex → `job_id` → poll `/jobs` for phase/progress." The
  frontend cannot watch an index build, see progress, know when embeddings are fresh, or detect
  failure — the very thing a "build and compile semantic linkage" UX needs.
- **No service state.** No `/service-state`, `/jobs`, `/watcher` (read), `/projects`, `/logs`,
  `/metrics`, `/quality` reach the frontend. The dashboard cannot show GPU/model readiness,
  watched roots, loaded projects, or index health.
- **Watcher control is read-only and partial.** `watcher-status` is whitelisted but
  start/stop/reconfigure are not; the reconfigure UI is an unwired placeholder (it needs
  validated args).
- **Transport mismatch.** Management/observability is HTTP + job-based on the live service;
  the engine's proxy is CLI-subprocess + synchronous. A control plane that polls jobs, reads
  state, and reconfigures the watcher wants the HTTP path (the rag service is the source of
  truth for its own runtime state), while true lifecycle (start/stop/doctor) must stay
  CLI/process (you cannot HTTP a service that is not running).
- **No freshness/generation signal for downstream builds.** The structural graph has a
  `generation` counter that downstream projections memoize and invalidate on. The semantic
  side has no equivalent surfaced to the engine/frontend: a second-order "semantic build on top
  of the semantic database" (e.g. the `graph-viz-quality` constellation, a derived similarity
  index, clustering) cannot know when the underlying embeddings changed, cannot trigger and
  await a rebuild, and cannot invalidate correctly.

### F5. Constraints any design must honor

- **engine-read-and-infer:** the engine must grow NO rag semantics — it validates args, bounds,
  and forwards rag's envelopes verbatim, attaching `tiers`. The control plane *is rag's*; the
  engine is the authenticated, bounded, tiers-honest broker (contract §6/§8 transparent
  forwarding).
- **subprocess-calls-carry-cap-and-timeout** (CLI path) and the **bounded HTTP** discipline
  (rag-client cap + wall-clock budget) apply to every new reach.
- **every-wire-response-carries-the-tiers-block** + **degradation-is-read-from-tiers:** every
  control/read response carries `tiers`; the frontend gates control availability on the
  `semantic`/search tier truth, never on a transport error.
- **published-wheel-purity:** the engine reaches rag only over HTTP/CLI, never a Python import;
  rag/torch stay out of the runtime.
- **dashboard-layer-ownership:** `stores/` is the sole wire client of the new `/ops/rag/*`
  control plane; scene/chrome consume it through stores hooks, never fetch directly.

### F6. The "semantic build on top of the semantic database"

The user intends to build derived semantic features over the embeddings (the quality
scorecard's semantic layout is the first; clustering, similarity edges, semantic search
affordances follow). Each such build is a downstream consumer that needs three things the
control plane must provide: (1) a way to TRIGGER and AWAIT a (re)index, (2) a FRESHNESS /
generation signal so it invalidates when embeddings change (a rag-side analog of the engine
`generation`, e.g. a per-collection index epoch or content hash exposed through
`/service-state`/`/jobs`), and (3) honest DEGRADATION when the semantic tier is building or
down. Without these, downstream semantic builds are racy against the continuously-updating rag
store.

## Design space (for the ADR to decide)

- **Transport split.** Likely: management + reads + reindex-trigger + job polling + search go
  over rag's HTTP service via an extended `rag-client` (the service owns its runtime truth);
  true process lifecycle (start/stop/doctor/install) stays CLI-subprocess (bounded). Decide the
  exact boundary.
- **Whitelist expansion.** Add transparent `/ops/rag/*` verbs for jobs, watcher get/start/stop/
  reconfigure (validated args), projects list/evict, service-state, logs, metrics, quality,
  typed reindex (vault|code, clean, scope). GET for reads, POST for controls.
- **Job lifecycle surface.** v1 poll `/ops/rag/jobs` (matches rag's snapshot model) with
  client backoff; consider a v2 engine SSE channel that polls rag and streams job progress
  (reusing the stream infra) so an index build animates live.
- **Freshness/generation contract.** Surface a semantic-index epoch/freshness token (from
  `/service-state` or `/jobs`) so downstream builds and the `/graph/embeddings` cache
  invalidate correctly, analogous to the structural `generation`.
- **Lifecycle ownership.** Does the engine ever auto-supervise rag (auto-start on demand), or
  does the frontend always drive start/stop explicitly (preserving the read-and-infer fence)?
- **Frontend control plane shape.** One stores-layer rag-control module (queries + mutations +
  a jobs-progress hook + watcher/projects/search controls) that the chrome renders.

## Open questions

- Poll vs engine-mediated SSE for job progress in v1 — and does rag's `/jobs since=` cursor
  support an efficient incremental stream?
- The exact freshness token: a per-collection index epoch, a content/manifest hash, or the
  newest job's finished_at? What does rag already expose that is stable and cheap?
- Should server lifecycle (start) be engine-supervised (auto-start when a semantic feature is
  requested) or strictly frontend-driven? The read-and-infer fence argues frontend-driven.
- Bounded-HTTP for the control path: per-verb timeout/size budgets, and how a long-running
  reindex job (minutes) is represented without holding an HTTP request open (job-id + poll, not
  a blocking call).
- Multi-project/workspace: the dashboard's served workspace vs rag's per-project slots — how
  the control plane scopes verbs to the active workspace and surfaces project eviction/idle.

## Sources

Engine seam + lifecycle verified in-repo: `engine/crates/engine-graph/src/{index.rs,watch.rs}`,
`engine/crates/vaultspec-api/src/{app.rs,registry.rs,lib.rs,routes/ops.rs,routes/mod.rs,
routes/query.rs}`, `engine/crates/rag-client/src/{client.rs,vectors.rs,discover.rs,search.rs}`,
`engine/crates/engine-store/src/lib.rs`, `frontend/src/stores/server/{engine.ts,opsActions.ts,
searchController.ts,graphSync.ts}`, `frontend/src/app/right/OpsPanel.tsx`. Rag service surface
verified in the sibling checkout `Y:/code/vaultspec-rag-worktrees/main/src/vaultspec_rag/`
(`server/_routes.py`, `cli/`, `mcp/_tools.py` + `_admin_tools.py`, `server/_jobs.py`,
`server/_watcher.py`, `server/_projects.py`, `store.py`, `embeddings.py`) and the live service
on `127.0.0.1:8766` + Qdrant `8765`. Contract reference `2026-06-12-dashboard-foundation-reference`
§6 (ops proxy) / §8 (search pass-through). Pairs with `2026-06-16-graph-viz-quality-research`
(the first downstream semantic build) and the `graph-semantic-embeddings` ADR.
