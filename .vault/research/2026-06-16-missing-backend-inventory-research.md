---
tags:
  - '#research'
  - '#missing-backend-inventory'
date: '2026-06-16'
modified: '2026-06-16'
related: []
---

# Dead / missing backend feature inventory

## Method (queries run)

Read-only sweep of `engine/crates/**` (Rust) and `frontend/src/**` (TS), combining vaultspec-rag `search_codebase` semantic queries with ripgrep and targeted file reads. rag ran CPU-only (usable for discovery). Queries: "capability pending engine-blocked feature not yet served fallback"; "semantic embeddings not served fallback ring node similarity"; "route returns honest empty placeholder until capability lands forward proposal"; "salience size signal absent origin does not yet serve"; "status rollup not yet implemented foundation scaffold degradation". Grep vocabulary across both trees: `TODO|FIXME|not yet|pending|placeholder|engine-blocked|deferred|unimplemented|will land|held until|downgrade|out of scope|stub`.

Triage note: several "deferred/not yet" comments are **stale** — the capability shipped on one side but the other side still renders the blocked state. Those are the highest-value items (wire built, UI/seam stranded). Pure prototype mocks and dead foundation scaffolds are recorded but flagged low-priority.

## Graph-visualization-related gaps

| Feature | Layer | file:line | Current behavior | What shipping needs | Effort |
|---|---|---|---|---|---|
| Per-node semantic embedding vector (makes the semantic UMAP mode real) | engine | `rag-client/src/lib.rs:8`; absent in `engine-query/src/graph.rs`, `node.rs`, `routes/query.rs` | Engine serves no embedding; every node arrives with `embedding` undefined | §4 wire amendment: engine fetches rag embedding vectors over the loopback rag HTTP service and attaches an optional additive `embedding` node field, or a paired bounded endpoint. Seam specified in `2026-06-14-graph-representation-adr.md:165-169`. Stay CPU/read-and-infer. | L |
| Semantic ("meaning constellation") layout mode collapses to fallback ring | frontend | `scene/field/semanticLayout.ts:39-55`; `representationLayout.ts:64-73` | Nodes lacking an embedding (all of them, live) ring the fallback; mode downgrades to connectivity | Entirely client-built and waiting — unblocks automatically once the engine serves `embedding`. | S (once engine row lands) |
| Semantic-mode promotion gate HELD vs SHIPPED | frontend | `scene/field/semanticGate.ts:111-138` | Runtime gate measured on a synthetic fixture; live mode stays downgraded | Re-measure budget against real rag-embedding dimensionality when the engine row lands. | S |
| Lineage arc `derivation` framework label always `None` (timeline) | engine | `engine-query/src/lineage.rs:208-220` | Timeline arcs carry only `relation`/`tier`; the richer derivation label is dropped | (a) call `ontology::derivation_label` the way `graph.rs:144-151` already does (label is computable from relation+container today); or (b) land a real `Edge.derivation` field. Option (a) is the quick win. | S–M |
| Code/symbol mentions are navigational dead-ends (no code-artifact nodes minted) | engine | `engine-query/src/node.rs:367-374` (`bridge_node_id` returns `None` for code/symbol targets) | Step/symbol mentions resolve a label but `bridge_node_id` is `None`; clicking goes nowhere | Mint code-artifact nodes during ingest (`ingest-struct` `Mention::Symbol`/`Path` → real graph nodes). Cross-layer (ingest+graph+node view). | L |
| Status stamp / domain-mark sprite rendering deferred (shape computed, not painted) | frontend | `scene/field/statusStamp.ts:1-11`; `nodeSprites.ts:158-170` | Status→treatment mapping is pure + tested but the fine status stamp does not render (coarse ring/slash/ghost does); fallback glyph provider omits `textureForMark` | Wire `statusStamp` descriptors through `DomainGlyphs.textureForMark` to real sprites. Self-contained scene work. | M |
| StatusGallery is a DOM/SVG prototype, not the real Pixi surface | frontend | `prototype/StatusGallery.tsx:10,62,264` | Visual stand-in; Pixi integration "deferred (post-merge)" | Retired once the status-stamp sprite path ships. | S |
| Edge treatment palette uses interim hardcoded values | frontend | `scene/field/edgeMeshes.ts:27` | Fixed palette "interim values pending the S47 token layer" | Route edge treatments through the token layer (`tokenReads`) per `themes-are-oklch-generated-from-a-token-tier`. | S |

## Independent backend gaps

| Feature | Layer | file:line | Current behavior | What shipping needs | Effort |
|---|---|---|---|---|---|
| Git diff browser stranded: `/ops/git/*` wire SHIPPED but UI still renders "capability pending" | frontend | `stores/server/queries.ts:893,1444-1469` (`GIT_DIFF_CAPABILITY_SERVED=false`, `CHANGED_FILES_LIST_SERVED=false`, `useGitFileDiff` issues no query); `app/right/ChangesOverview.tsx:236,241-244`; `app/right/DiffView.tsx:172` | UI shows "per-file detail not yet served" / "engine capability pending"; selector returns `{engineBlocked:true}` with no network call — **but the engine route `/ops/git/{verb}` (status/numstat/diff) exists and the client transport `client.opsGit` + `adaptGitOp` are built and tested** (`routes/ops.rs:167-182,403-457`; `engine.ts:752-766,1245-1251`; `liveAdapters.ts:968`; `liveAdapters.test.ts:838-891`) | Flip the two constants to `true`, wire `useGitFileDiff`/changed-files selectors to `client.opsGit("status"\|"numstat"\|"diff")`, parse porcelain-v1 + numstat + unified diff, render in `ChangesOverview`/`DiffView`. The hard part (engine route, validation, adapter, mock) is already done. **Highest-leverage item in the sweep.** | M |
| `QueryCore` foundation scaffold is dead code | engine | `engine-query/src/lib.rs:11-53` | `status()` returns "engine index not yet implemented (foundation scaffold)"; **no references outside its own tests** — the real `/status` lives in `routes/stream.rs:22` | Delete `QueryCore` (and its placeholder `status`/`validate_scope`), or repurpose as the documented shared query-core handle. Misleading dead surface. | S |
| `Timestamp` is a raw `i64` placeholder ("when the temporal tier is implemented") | engine | `engine-model/src/lib.rs:142-144` | `pub type Timestamp = i64`; comment flags it provisional | The temporal tier *is* served (events, as-of all work) — mostly comment-debt. Update the stale comment unless a richer time type is actually needed. | S |
| Watcher reconfigure verb deliberately not whitelisted | engine | `routes/ops.rs:45-53` (`RAG_WHITELIST` omits reconfigure) | rag watcher reconfigure deferred "rather than shipping an unvalidated argument channel" | Add a `reconfigure` entry with a validated argument schema, only if the UI needs runtime reconfiguration. | M |
| `codify` timeline lane renders label-only (no rule/codify domain glyph) | frontend | `app/timeline/phaseLanes.ts:44-48` | The domain-mark family carries no rule/codify glyph; codify lane renders label-only | Author a rule/codify domain mark on Phosphor's grid through the ink-coverage gate, map onto the lane. | S |
| Structural-mention extraction described as "placeholder for the extraction pipeline" | engine | `ingest-struct/src/lib.rs:18-19` | The `Mention` enum is real (Path/StepId/WikiLink/Symbol) and used, but the doc-comment calls it a placeholder | Likely comment-debt; verify completeness vs the comment, then update. | S |
| SPA fallback serves a literal placeholder page when no bundle present | engine | `routes/spa.rs:41,132` | Serves a minimal page when `frontend/dist` is absent (D9.2 deferred bundling) | Expected dev behavior; not a defect — recorded for completeness. | — |

## Stale "deferred" comments that are actually DONE (doc-debt only)

- `app/AppShell.tsx:170` / `Timeline.tsx:311` — "deferred S45 wiring": `onNodeClick` is actually wired (`AppShell.tsx:180`, `Timeline.tsx:689`).
- `routes/temporal.rs:258-269` — "deferred fast-follow as-of lineage": the BLOB-TRUE as-of branch is implemented.
- `engine-query/src/salience.rs:1197-1282` — salience is fully served; the FE "salience ABSENT fallback" (`nodeSprites.ts:215`) is graceful degradation, not a gap.

## Recommended pipeline decomposition

- **Feature A — "Semantic constellation: engine embedding seam"** (graph-viz, marquee gap). Engine embedding row + the auto-unblocking FE rows. Whole frontend is built and waiting; work is the engine §4 amendment. Seam specified in `2026-06-14-graph-representation-adr.md:165-169` → plan→execute, not research→ADR (covered by `[[2026-06-16-graph-semantic-embeddings-research]]`). Effort L.
- **Feature B — "Wire the git diff browser to the shipped `/ops/git` route"** (independent, highest leverage). Engine route, transport, adapter, mock all done and tested; only chrome constants/selectors stranded behind `GIT_*_SERVED=false`. Pure FE wiring. Effort M; biggest return for least new code.
- **Feature C — "Lineage derivation label"** (graph-viz quick win). Reuse `ontology::derivation_label` in `lineage.rs::lineage_arc`, or land a real `Edge.derivation` field. Effort S–M; folds into `[[2026-06-16-graph-lineage-dag-research]]`.
- **Feature D — "Status-stamp sprite rendering + codify glyph + edge token palette"** (graph-viz scene polish). `statusStamp`→`DomainGlyphs.textureForMark`, retire `StatusGallery`, add rule/codify domain mark, route edge treatments through the token layer. Effort M.
- **Feature E — "Code-artifact node minting"** (graph-viz, larger). Mint code-artifact nodes in ingest so symbol/path mentions bridge (`node.rs:367`). Cross-layer; effort L; own research/ADR.
- **Cleanup (curate pass, no feature):** delete or repurpose dead `QueryCore`; refresh stale "deferred" comments in `temporal.rs`, `AppShell.tsx`, `Timeline.tsx`, `ingest-struct/lib.rs`, `engine-model` `Timestamp`, and the `queries.ts` git comments that wrongly claim "no `/ops/git/*` route exists".

## References

- Engine: `rag-client/src/lib.rs:8`; `engine-query/src/lineage.rs:68-93,202-220`; `engine-query/src/lib.rs:11-53`; `engine-query/src/node.rs:360-374`; `engine-query/src/graph.rs:124-159`; `engine-model/src/lib.rs:142-144`; `ingest-struct/src/lib.rs:18`; `routes/ops.rs:45-53,167-182,394-457`; `routes/temporal.rs:200-269`; `routes/spa.rs:41,132`; `routes/stream.rs:22`.
- Frontend: `stores/server/queries.ts:888-900,1441-1470`; `stores/server/engine.ts:411,752-766,1245-1251`; `stores/server/liveAdapters.ts:968`; `app/right/ChangesOverview.tsx:236,241-244`; `app/right/DiffView.tsx:172`; `scene/field/semanticLayout.ts:39-55`; `scene/field/semanticGate.ts:111-138`; `scene/field/representationLayout.ts:11-73`; `scene/field/statusStamp.ts:1-11`; `scene/field/nodeSprites.ts:158-223`; `scene/field/edgeMeshes.ts:27`; `app/timeline/phaseLanes.ts:44-48`; `prototype/StatusGallery.tsx:10,62,264`; `app/AppShell.tsx:170,180`; `app/timeline/Timeline.tsx:311,689`.
- ADRs: `[[2026-06-14-graph-representation-adr]]` (semantic mode + embedding §4 amendment seam); `[[2026-06-14-graph-node-semantics-adr]]` (derivation label); `[[2026-06-14-graph-node-salience-adr]]` (salience, served).
