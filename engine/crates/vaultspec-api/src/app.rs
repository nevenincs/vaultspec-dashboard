//! The axum app skeleton (contract §1, plan W03.P11.S48): loopback-only
//! bind with fail-loud port conflict, `service.json` discovery with bearer
//! token and heartbeat, ungated `/health`, bearer gating everywhere else.
//!
//! Watcher wiring (S48 + audit gates W02P06-302/303): dirty batches drive a
//! **rebuild-at-scope-granularity** — a fresh graph is indexed and swapped
//! behind the lock, never deltas ingested into a live graph (302), so
//! removed mentions prune naturally (303). The old→new diff feeds the ring
//! buffer and the live SSE channel on one monotonic delta clock.
//!
//! # Multi-scope (user-state-persistence W02)
//!
//! What was once a single `AppState` holding one graph/clock/ring/watcher is
//! now split. The per-scope serve fields live in [`ScopeCell`] — one cell per
//! warm worktree, each with its OWN monotonic delta clock and resume ring, so
//! per-scope SSE `since=` resume is correct and independent. [`AppState`] is
//! workspace-level: it owns the [`crate::registry::ScopeRegistry`] of warm
//! cells, the single shared [`vaultspec_session::UserState`] handle (opened
//! ONCE per workspace), the bearer token, and the currently-active scope
//! token. The inference crates are untouched: the registry just holds N
//! `LinkageGraph`s; `engine-query`/`engine-graph` read fns stay pure over one.

use std::collections::HashMap;
use std::collections::HashSet;
use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, RwLock};

use axum::extract::{Request, State};
use axum::http::{HeaderMap, StatusCode};
use axum::middleware::Next;
use axum::response::Response;
use engine_graph::{LinkageGraph, MetaEdge};
use engine_model::ScopeRef;
use serde_json::Value;
use tokio::sync::broadcast;

use crate::registry::ScopeRegistry;

/// Per-generation enriched document views (perf-sweep A1): the node-id → enriched
/// node view map and the edge-id → enriched edge view map, built once per graph
/// generation by `engine_query::graph::build_document_views` and reused by every
/// Document-granularity query via `graph_query_cached`. The third member is the
/// in-scope node-id set, computed in the same pass and reused by the Document
/// arm's broken-link endpoint check so it no longer re-scans every node per
/// request (backend-hotpath-hardening F4 / graph-query-scope-memo).
type DocViews = (
    HashMap<String, Value>,
    HashMap<String, Value>,
    HashSet<String>,
);

/// Per-generation `.vault` document basename -> repo-relative path index
/// (backend-hotpath-hardening F1): built once per rebuild by
/// `crate::routes::content::build_doc_basename_index` and reused by the content
/// route so a `doc:` fetch is an O(1) lookup, not a per-request tree walk.
pub(crate) type DocBasenameIndex = HashMap<String, String>;

/// rag's stored dense embedding vectors, node-id -> vector, scrolled from Qdrant
/// (rag-control-plane ADR D4). Cached on the `ScopeCell` keyed on the semantic
/// freshness epoch; aliased so the cache field stays a simple type (mirroring
/// `DocViews`/`DocBasenameIndex`).
pub(crate) type EmbeddingVectors = HashMap<String, Vec<f32>>;

/// One multiplexed stream event (contract §7).
#[derive(Debug, Clone)]
pub struct StreamEvent {
    /// Channel name: graph | fs | git | backends | index.
    pub channel: &'static str,
    /// JSON payload (for `graph`: a §5 diff entry, verbatim shape).
    pub payload: serde_json::Value,
    /// Monotonic sequence (this cell's delta clock).
    pub seq: u64,
}

/// Per-scope serve state: ONE warm worktree's live graph, delta clock, resume
/// ring, SSE channel, projection cache, and watcher. Extracted out of the old
/// single `AppState` (W02.P03.S09) so the engine can serve N scopes
/// concurrently, each on its OWN monotonic clock — `since=` resume stays
/// correct and independent per scope.
pub struct ScopeCell {
    /// The served worktree root.
    pub root: PathBuf,
    /// The corpus view this cell serves.
    pub scope: ScopeRef,
    /// The live graph; swapped wholesale on rebuild (302 invariant).
    pub graph: RwLock<Arc<LinkageGraph>>,
    pub store: Mutex<engine_store::Store>,
    /// This cell's monotonic delta clock (contract REDLINE-3, now per-scope).
    pub seq: AtomicU64,
    /// Recent deltas for `since=` resume; bounded. Stored as
    /// `(seq, payload)` so BOTH granularity species (document + the
    /// feature/meta-edge projection) ride one resume buffer on this cell's
    /// clock (constellation-live-delta ADR / S50): `since=` replays across
    /// both, application is per-granularity client-side.
    pub ring: Mutex<VecDeque<(u64, serde_json::Value)>>,
    pub tx: broadcast::Sender<StreamEvent>,
    /// Memoized constellation meta-edges per graph generation (audit
    /// W02P05-203).
    pub meta_cache: Mutex<Option<(u64, Arc<Vec<MetaEdge>>)>>,
    /// Memoized salience lens basis per graph generation (graph-node-salience
    /// ADR: "the lens basis is precomputed once per graph generation for all
    /// launch lenses"). The expensive PPR/Brandes/k-core sweep runs once per
    /// rebuild and every lens combines over the shared partial-vector basis;
    /// invalidated on a generation bump.
    pub salience_cache: Mutex<Option<(u64, Arc<engine_query::salience::LensBasis>)>>,
    /// Memoized enriched document node/edge views per graph generation
    /// (perf-sweep A1): the dominant per-request Document-query cost
    /// (node_view/edge_view projections) computed once per rebuild and reused.
    pub doc_views_cache: Mutex<Option<(u64, Arc<DocViews>)>>,
    /// The UNFILTERED constellation feature-node projection, memoized per
    /// generation. The Feature query's fixed cost is aggregating the whole corpus
    /// into feature-convergence nodes; this serves the default (unfiltered) poll
    /// from cache, invalidated on a generation bump like the other projections.
    pub feature_nodes_cache: Mutex<Option<(u64, Arc<Vec<Value>>)>>,
    /// The stem-sorted `/vault-tree` document rows, memoized per generation. The
    /// left-rail Tree view re-projected + re-sorted every `doc:` node on each
    /// request; this serves the sorted listing from cache (the handler still
    /// paginates per request), invalidated on a generation bump.
    pub vault_tree_rows_cache: Mutex<Option<(u64, Arc<Vec<Value>>)>>,
    /// Memoized `.vault` document basename -> repo-relative path index per graph
    /// generation (backend-hotpath-hardening F1): the content route's per-fetch
    /// `.vault` tree walk is built once per rebuild and reused, like the sibling
    /// caches.
    pub doc_index_cache: Mutex<Option<(u64, Arc<DocBasenameIndex>)>>,
    /// Memoized rag embedding vectors keyed on the SEMANTIC freshness epoch
    /// (rag-control-plane ADR D4): the node-id -> dense-vector map scrolled from
    /// rag's Qdrant, cached so repeat embedding reads skip the multi-page scroll.
    /// Keyed on the epoch — NOT the graph generation — because the vectors are
    /// rag's index state, not the engine graph's: a watcher rebuild bumps the
    /// generation but leaves the vectors unchanged, so keying on generation would
    /// defeat the cache on every rebuild. A completed reindex advances the epoch
    /// (the semantic analog of `generation`) and THAT invalidates the cache.
    pub embeddings_cache: Mutex<Option<(u64, Arc<EmbeddingVectors>)>>,
    pub generation: AtomicU64,
    /// This cell's resident watcher handle; `/status` reports a dead watcher
    /// truthfully instead of claiming residency (DF-4 residual). Dropping the
    /// handle (on eviction) tears the OS watch down.
    pub watcher: Mutex<Option<engine_graph::watch::WatchHandle>>,
    /// Declared-tier ingestion status from the last rebuild: `None` when
    /// core's graph was ingested, `Some(reason)` when core was unreachable
    /// (or `Some(DECLARED_BUILDING)` while the async fold is in flight). The
    /// tiers block reads this so `declared` degrades TRUTHFULLY instead of
    /// claiming a tier the index could not build.
    pub declared_status: RwLock<Option<String>>,
    /// Coalescing guard for the async declared fold (perf ADR D1): true while
    /// a fold task is in flight for this cell, so at most one fold runs per
    /// cell at a time.
    pub declared_fold_active: AtomicBool,
    /// Trailing-edge flag (perf ADR D1, review HIGH): set when a rebuild lands
    /// while a fold is already in flight (the new `spawn_declared_fold` could
    /// not claim the slot, so it could not fold the NEW structural graph). The
    /// in-flight fold's completion guard checks this and re-spawns a fold at
    /// the CURRENT HEAD, guaranteeing the latest structural commit always gets
    /// a declared fold even when it is the LAST change (no further rebuild to
    /// piggy-back on). Without it, a fold finishing after a final HEAD advance
    /// would serve the superseded commit's declared edges indefinitely.
    pub declared_fold_pending: AtomicBool,
}

pub const RING_CAP: usize = 4096;

impl ScopeCell {
    /// Build a fresh cell for a served worktree root, with an empty graph and
    /// a zeroed clock. The caller indexes it (via [`ScopeCell::rebuild_and_swap`])
    /// and spawns its watcher.
    pub fn new(root: PathBuf, scope: ScopeRef, store: engine_store::Store) -> Self {
        let (tx, _) = broadcast::channel(1024);
        ScopeCell {
            root,
            scope,
            graph: RwLock::new(Arc::new(LinkageGraph::new())),
            store: Mutex::new(store),
            seq: AtomicU64::new(0),
            ring: Mutex::new(VecDeque::new()),
            tx,
            meta_cache: Mutex::new(None),
            salience_cache: Mutex::new(None),
            doc_views_cache: Mutex::new(None),
            feature_nodes_cache: Mutex::new(None),
            vault_tree_rows_cache: Mutex::new(None),
            doc_index_cache: Mutex::new(None),
            embeddings_cache: Mutex::new(None),
            generation: AtomicU64::new(0),
            watcher: Mutex::new(None),
            declared_status: RwLock::new(None),
            declared_fold_active: AtomicBool::new(false),
            declared_fold_pending: AtomicBool::new(false),
        }
    }

    pub fn graph_arc(&self) -> Arc<LinkageGraph> {
        // Poison recovery (robustness H2): a panic while another guard was held
        // poisons the lock. Paired with the CatchPanicLayer, we recover the
        // inner value instead of re-panicking, so one transient panic cannot
        // cascade into a permanent total outage on every subsequent request.
        self.graph.read().unwrap_or_else(|e| e.into_inner()).clone()
    }

    /// Meta-edges, memoized per generation (W02P05-203): the constellation
    /// hot path pays one aggregation per rebuild, not per request.
    /// Eagerly build the per-generation memoized projections OFF the request
    /// path. Called from the watcher rebuild (which already runs on a blocking
    /// thread) right after the graph swap, so the costly salience basis
    /// (PPR/Brandes/k-core over the whole scope — measured ~7 s cold on a
    /// 3135-doc corpus) and the default-view projections are built HERE, once per
    /// generation, instead of landing on the first user event after a vault edit.
    /// Without this, a node-expand or a graph poll that happens to be the first
    /// salience request after a rebuild paid the multi-second cold build itself —
    /// the "tens of seconds, not milliseconds" stall. The lazy getters stay the
    /// correctness floor (a request before warming completes still builds on
    /// demand); this just moves the common case off the interactive path. Warms
    /// the basis + the default constellation projections (meta_edges,
    /// feature_nodes); the heavier document_views / vault_tree_rows stay lazy
    /// since they serve explicit drill-in navigation, not the default view.
    pub fn warm_projections(&self) {
        let _ = self.salience_basis();
        let _ = self.meta_edges();
        let _ = self.feature_nodes();
    }

    pub fn meta_edges(&self) -> Arc<Vec<MetaEdge>> {
        let generation = self.generation.load(Ordering::SeqCst);
        // Poison recovery (robustness H2): see `graph_arc`.
        let mut cache = self.meta_cache.lock().unwrap_or_else(|e| e.into_inner());
        if let Some((cached_generation, cached)) = cache.as_ref()
            && *cached_generation == generation
        {
            return cached.clone();
        }
        let fresh = Arc::new(engine_graph::meta_edges(&self.graph_arc()));
        *cache = Some((generation, fresh.clone()));
        fresh
    }

    /// Enriched per-document node/edge views, memoized per generation
    /// (perf-sweep A1). `build_document_views` runs the heavy node_view/edge_view
    /// projections (serialize + degree-by-tier adjacency walk + ontology + status)
    /// once per rebuild; `graph_query_cached` then reuses them so repeat and
    /// concurrent Document queries skip the dominant per-request cost. Invalidated
    /// on a generation bump, exactly like `meta_edges`/`salience_basis`.
    pub fn document_views(&self) -> Arc<DocViews> {
        let generation = self.generation.load(Ordering::SeqCst);
        // Poison recovery (robustness H2): see `graph_arc`.
        let mut cache = self
            .doc_views_cache
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        if let Some((cached_generation, cached)) = cache.as_ref()
            && *cached_generation == generation
        {
            return cached.clone();
        }
        let fresh = Arc::new(engine_query::graph::build_document_views(
            &self.graph_arc(),
            &self.scope,
        ));
        *cache = Some((generation, fresh.clone()));
        fresh
    }

    /// The unfiltered constellation feature nodes, memoized per generation. The
    /// Feature query re-aggregates the whole corpus into feature-convergence nodes
    /// (a fixed cost independent of the tiny payload); memoizing it serves the
    /// default constellation poll without re-scanning every request. A FILTERED
    /// feature query bypasses this (the filter changes the pre-aggregation member
    /// set) and flows through `graph_query`. Invalidated on a generation bump
    /// exactly like `document_views`/`meta_edges`.
    pub fn feature_nodes(&self) -> Arc<Vec<Value>> {
        let generation = self.generation.load(Ordering::SeqCst);
        // Poison recovery (robustness H2): see `graph_arc`.
        let mut cache = self
            .feature_nodes_cache
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        if let Some((cached_generation, cached)) = cache.as_ref()
            && *cached_generation == generation
        {
            return cached.clone();
        }
        let fresh = Arc::new(engine_query::graph::build_feature_nodes(
            &self.graph_arc(),
            &self.scope,
        ));
        *cache = Some((generation, fresh.clone()));
        fresh
    }

    /// The stem-sorted `/vault-tree` rows, memoized per generation. The Tree view
    /// re-projected + re-sorted every `doc:` node on every poll; this serves the
    /// sorted listing from cache (the handler paginates the slice per request).
    /// Invalidated on a generation bump exactly like `document_views`.
    pub fn vault_tree_rows(&self) -> Arc<Vec<Value>> {
        let generation = self.generation.load(Ordering::SeqCst);
        // Poison recovery (robustness H2): see `graph_arc`.
        let mut cache = self
            .vault_tree_rows_cache
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        if let Some((cached_generation, cached)) = cache.as_ref()
            && *cached_generation == generation
        {
            return cached.clone();
        }
        let fresh = Arc::new(engine_query::graph::build_vault_tree_rows(
            &self.graph_arc(),
            &self.scope,
        ));
        *cache = Some((generation, fresh.clone()));
        fresh
    }

    /// The `.vault` document basename -> repo-relative path index, memoized per
    /// generation (backend-hotpath-hardening F1). The content route resolves a
    /// `doc:{stem}` node through this O(1) lookup instead of walking the whole
    /// `.vault` tree on every fetch; the walk runs once per rebuild, invalidated
    /// on a generation bump exactly like `document_views`/`meta_edges`.
    pub fn doc_basename_index(&self) -> Arc<DocBasenameIndex> {
        let generation = self.generation.load(Ordering::SeqCst);
        // Poison recovery (robustness H2): see `graph_arc`.
        let mut cache = self
            .doc_index_cache
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        if let Some((cached_generation, cached)) = cache.as_ref()
            && *cached_generation == generation
        {
            return cached.clone();
        }
        let fresh = Arc::new(crate::routes::content::build_doc_basename_index(&self.root));
        *cache = Some((generation, fresh.clone()));
        fresh
    }

    /// The salience lens basis, memoized per generation (graph-node-salience ADR:
    /// the basis is precomputed once per graph generation for all launch lenses;
    /// only the focus-folded final score is computed per request). The basis is
    /// built over this cell's scope document nodes — the bounded member set the
    /// query serves. The expensive PPR/Brandes/k-core sweep runs at most once per
    /// rebuild.
    pub fn salience_basis(&self) -> Arc<engine_query::salience::LensBasis> {
        let generation = self.generation.load(Ordering::SeqCst);
        // Poison recovery (robustness H2): see `graph_arc`.
        let mut cache = self
            .salience_cache
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        if let Some((cached_generation, cached)) = cache.as_ref()
            && *cached_generation == generation
        {
            return cached.clone();
        }
        let graph = self.graph_arc();
        // The bounded member set: this scope's document nodes (the salience model
        // ranks documents; feature-convergence nodes are not ranked).
        let members: Vec<&engine_model::Node> = graph
            .nodes()
            .filter(|n| n.facets.iter().any(|f| f.scope == self.scope))
            .collect();
        let fresh = Arc::new(engine_query::salience::LensBasis::compute(
            &graph,
            &self.scope,
            &members,
        ));
        *cache = Some((generation, fresh.clone()));
        fresh
    }

    /// The cached rag embedding vectors IF they were scrolled at `epoch`, else
    /// `None` (rag-control-plane ADR D4 / P03.S18). A `None` return means either
    /// a cold cache or a reindex that advanced the semantic epoch — in both cases
    /// the embeddings route re-scrolls Qdrant and stores the fresh map under the
    /// new epoch via [`ScopeCell::store_embeddings`]. Keyed on the epoch alone
    /// (see the `embeddings_cache` field doc), so the served vectors invalidate
    /// exactly when rag's index changed, not on every graph rebuild.
    pub fn embeddings_if_fresh(&self, epoch: u64) -> Option<Arc<EmbeddingVectors>> {
        // Poison recovery (robustness H2): see `graph_arc`.
        let cache = self
            .embeddings_cache
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        cache
            .as_ref()
            .filter(|(cached_epoch, _)| *cached_epoch == epoch)
            .map(|(_, vectors)| vectors.clone())
    }

    /// Store the freshly-scrolled rag embedding vectors under the semantic epoch
    /// they were read at (rag-control-plane ADR D4 / P03.S18). The next read at
    /// the SAME epoch is a warm-cache hit; the next read after a reindex (a new
    /// epoch) misses and re-scrolls.
    pub fn store_embeddings(&self, epoch: u64, vectors: Arc<EmbeddingVectors>) {
        let mut cache = self
            .embeddings_cache
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        *cache = Some((epoch, vectors));
    }

    /// Rebuild the scope's graph fresh and commit it (the watcher's path;
    /// also used at startup).
    ///
    /// Builds the STRUCTURAL tier only and commits it immediately (perf ADR
    /// D1): the worktree is interactive in roughly the structural-parse time,
    /// with `declared_status` set to the building sentinel so the tiers block
    /// reports `declared` unavailable-while-building. The slow declared-tier
    /// core subprocess is folded in asynchronously by
    /// [`crate::registry::spawn_declared_fold`], called by the caller after a
    /// successful rebuild.
    ///
    /// SYNC FALLBACK: when no tokio runtime is current (unit tests calling this
    /// directly), there is no async fold to defer to, so the declared tier is
    /// ingested INLINE here — behavior stays correct and the served graph still
    /// carries declared edges. Under `serve` the runtime is always up, so the
    /// fast structural commit is what users see and the fold runs in the
    /// background.
    pub fn rebuild_and_swap(&self) -> Result<usize, String> {
        let store = self.store.lock().map_err(|_| "store lock".to_string())?;
        let (mut fresh, stats) = engine_graph::index::index_worktree_structural(
            &self.root,
            &self.scope,
            &store,
            now_ms(),
        )
        .map_err(|e| e.to_string())?;
        drop(store);

        // No async runtime ⇒ no deferred fold; ingest declared synchronously so
        // the served graph is complete in non-serve (test) contexts. Under
        // `serve` a runtime is always current, so this branch never runs there.
        // Uses the SAME fetch+ingest seam the async fold uses (read-and-infer
        // `--ref HEAD`), so the sync and async declared graphs converge.
        let declared_status = if tokio::runtime::Handle::try_current().is_err() {
            match engine_graph::index::fetch_core_graph_json(&self.root, Some("HEAD")) {
                Ok(json) => {
                    let (_, unavailable) = engine_graph::index::ingest_declared_from_json(
                        &mut fresh,
                        &json,
                        &self.scope,
                        now_ms(),
                    );
                    unavailable
                }
                Err(reason) => Some(reason),
            }
        } else {
            // Async path: serve the structural graph now; the fold flips this to
            // None (available) or a real reason once it lands.
            stats.declared_unavailable
        };

        if let Ok(mut status) = self.declared_status.write() {
            *status = declared_status;
        }
        Ok(self.commit_graph(fresh))
    }

    /// THE single commit path for a new graph (audit N3+N4): one function
    /// owns the ordering — (1) diff against the outgoing graph and advance
    /// this cell's delta clock, (2) append to the ring and broadcast, (3)
    /// swap the graph, (4) bump the generation (invalidating projections).
    /// Steps 1–2 happen under the ring lock so concurrent committers
    /// serialize; the clock is only ever advanced here.
    pub fn commit_graph(&self, fresh: LinkageGraph) -> usize {
        let old = self.graph_arc();
        let t = now_ms();

        // Ring lock taken FIRST: it is the commit-section mutex.
        // Poison recovery (robustness H2): see `graph_arc`.
        let mut ring = self.ring.lock().unwrap_or_else(|e| e.into_inner());
        let seq_start = self.seq.load(Ordering::SeqCst);
        // Document deltas first, then the feature/meta-edge projection deltas,
        // CONTINUING the same monotonic clock (constellation-live-delta ADR /
        // S50): one seq space across both species so a held constellation
        // keyframe splices live with no gap. Both ride the ring (resume
        // buffer) and the `graph` channel; each carries its `granularity` tag.
        let doc_log = engine_graph::diff::diff(&old, &fresh, t, seq_start);
        let feat_seq_start = doc_log.entries.last().map_or(seq_start, |e| e.seq + 1);
        let (feat_entries, _) =
            engine_query::graph::feature_delta(&old, &fresh, &self.scope, t, feat_seq_start);

        // Unify both species as (seq, payload) for the resume buffer + the
        // live channel; the document entries serialize to the same wire shape.
        // Robustness H2: a malformed entry SKIPS rather than panics — a single
        // unserializable delta or a feature entry missing its `seq` must not
        // panic inside the commit section (which would poison the ring lock and
        // wedge every later commit + every `since=` resume). The dropped entry
        // is logged; the rest of the batch and the clock advance normally.
        let mut payloads: Vec<(u64, serde_json::Value)> = Vec::new();
        for entry in &doc_log.entries {
            match serde_json::to_value(entry) {
                Ok(value) => payloads.push((entry.seq, value)),
                Err(e) => eprintln!(
                    "vaultspec serve: dropping unserializable doc delta seq={}: {e}",
                    entry.seq
                ),
            }
        }
        for entry in feat_entries {
            match entry["seq"].as_u64() {
                Some(seq) => payloads.push((seq, entry)),
                None => eprintln!("vaultspec serve: dropping feature delta with no seq: {entry}"),
            }
        }

        let emitted = payloads.len();
        if let Some((tip, _)) = payloads.last() {
            self.seq.store(tip + 1, Ordering::SeqCst);
            for (seq, payload) in payloads {
                if ring.len() == RING_CAP {
                    ring.pop_front();
                }
                ring.push_back((seq, payload.clone()));
                let _ = self.tx.send(StreamEvent {
                    channel: "graph",
                    payload,
                    seq,
                });
            }
        }
        // Poison recovery (robustness H2): see `graph_arc`.
        *self.graph.write().unwrap_or_else(|e| e.into_inner()) = Arc::new(fresh);
        self.generation.fetch_add(1, Ordering::SeqCst);
        drop(ring);
        emitted
    }
}

/// Workspace-level serve state: the warm scope registry, the single shared
/// user-state handle, the bearer token, and the active scope. Per-scope serve
/// state lives in [`ScopeCell`], resolved through the registry.
pub struct AppState {
    /// The launch root of the workspace — used for worktree discovery so any
    /// vault-bearing worktree in this workspace is a selectable scope.
    pub workspace_root: PathBuf,
    /// The warm per-scope cells, keyed by scope token, bounded by a
    /// working-set cap with LRU eviction.
    pub registry: RwLock<ScopeRegistry>,
    pub bearer: String,
    /// The single shared durable user-state handle, opened ONCE per workspace
    /// from `workspace_root/.vault` — NEVER per-scope (the W01 single-writer
    /// invariant: one SQLite writer per process). The W01 `Store` wraps a
    /// `rusqlite::Connection`, which is `!Sync`, so the shared handle rides a
    /// `Mutex` — serializing every read/write through one writer, exactly the
    /// single-writer discipline the W01 review requires.
    pub user_state: Arc<Mutex<vaultspec_session::UserState>>,
    /// The currently-active default scope token: the scope `/status`, boot,
    /// and the error-path tiers fallback resolve when no `scope=` is supplied.
    pub active_scope: RwLock<String>,
}

impl AppState {
    /// The active-scope cell, always present (boot builds it eagerly and the
    /// registry never evicts the active scope). Used by `/status` and the
    /// error-path tiers fallback, where there is no per-request scope to
    /// resolve.
    pub fn active_cell(&self) -> Arc<ScopeCell> {
        let token = self
            .active_scope
            .read()
            .map(|s| s.clone())
            .unwrap_or_else(|e| e.into_inner().clone());
        // The active cell is built at boot and pinned (never evicted), so the
        // warm peek is the always-taken path. Touch nothing here: a fast,
        // lock-cheap read used by `/status` and the error-path tiers fallback.
        if let Some(cell) = self
            .registry
            .read()
            .unwrap_or_else(|e| e.into_inner())
            .peek_arc(&token)
        {
            return cell;
        }
        // Last-resort (not expected to fire): rebuild the active cell over its
        // own root so the tiers fallback and `/status` never panic.
        crate::registry::build_active(self, PathBuf::from(&token))
            .expect("active-scope cell rebuildable")
    }

    /// The root path of the ACTIVE WORKSPACE — the registered root a per-request
    /// scope is validated against (dashboard-workspace-registry ADR, P03.S11).
    ///
    /// Multi-workspace generalizes scope routing: `validate_scope` resolves a
    /// requested worktree against the *active workspace's* enumerable worktrees,
    /// not one frozen launch value. This reads the active-workspace id from the
    /// user-state config and returns its registered root path, falling back to
    /// the engine's launch `workspace_root` when no registry/active selection
    /// exists yet (the unchanged single-workspace case). Pure READ over config;
    /// it never mutates anything.
    pub fn active_workspace_root(&self) -> PathBuf {
        let us = self.user_state.lock().unwrap_or_else(|e| e.into_inner());
        let Some(active) = us.active_workspace().ok().flatten() else {
            return self.workspace_root.clone();
        };
        us.root(&active)
            .ok()
            .flatten()
            .map(|r| PathBuf::from(r.path))
            .unwrap_or_else(|| self.workspace_root.clone())
    }
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Bearer gate: everything except `/health` requires the service token
/// (contract §1 — not an auth boundary; loopback-only).
pub async fn bearer_gate(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    // Host validation on EVERY request (contract DF-6 amendment): a
    // loopback service is still reachable by name from a browser, and a
    // foreign Host header is the DNS-rebinding signature.
    let host_ok = headers
        .get("host")
        .and_then(|v| v.to_str().ok())
        .map(|h| h.split(':').next().unwrap_or(h))
        .is_some_and(|h| matches!(h, "127.0.0.1" | "localhost" | "[::1]"));
    if !host_ok {
        return Err(StatusCode::FORBIDDEN);
    }
    // Bearer boundary (dogfood DF-7): only API paths are gated. The
    // static shell (/, assets, SPA fallback) must be reachable by a clean
    // browser — it DELIVERS the token via the DF-6 meta tag; gating it
    // makes the bootstrap circular and the dashboard unreachable.
    // /health stays ungated as the liveness ping.
    let path = request.uri().path();
    let is_api = path != "/health"
        && crate::routes::spa::API_PREFIXES
            .iter()
            .any(|p| path == *p || path.starts_with(&format!("{p}/")));
    if !is_api {
        return Ok(next.run(request).await);
    }
    let authorized = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .is_some_and(|token| constant_time_eq(token.as_bytes(), state.bearer.as_bytes()));
    if authorized {
        Ok(next.run(request).await)
    } else {
        Err(StatusCode::UNAUTHORIZED)
    }
}

/// Cap on an error body we will buffer to inspect/rewrite. Error responses
/// are tiny; success bodies are never buffered (we short-circuit on 2xx).
const MAX_ERROR_BODY: usize = 64 * 1024;

/// Post-response guarantee for the contract §2 / codified tiers-block rule:
/// EVERY wire response carries the per-tier degradation block. Handlers build
/// it through the shared envelope, but framework-boundary rejections — axum
/// extractor failures (malformed/missing body fields) and the bearer/Host
/// gate's bare `StatusCode` — are produced BEFORE any handler and would ship a
/// tiers-less body. Layered OUTSIDE the gate, this catches every error
/// response and, when it lacks the block, rebuilds it through the shared shape
/// so no error escapes the guarantee. Success (2xx) and SSE streams are passed
/// through untouched (never buffered).
pub async fn ensure_tiers_envelope(
    State(state): State<Arc<AppState>>,
    request: Request,
    next: Next,
) -> Response {
    let response = next.run(request).await;
    let status = response.status();
    if !(status.is_client_error() || status.is_server_error()) {
        return response;
    }
    let (mut parts, body) = response.into_parts();
    let bytes = axum::body::to_bytes(body, MAX_ERROR_BODY)
        .await
        .unwrap_or_default();
    // Already a shared envelope (handler-built error with the block)? Keep it.
    let has_tiers = serde_json::from_slice::<serde_json::Value>(&bytes)
        .ok()
        .is_some_and(|v| v.get("tiers").is_some());
    if has_tiers {
        return Response::from_parts(parts, axum::body::Body::from(bytes));
    }
    // Rebuild: preserve the boundary's own message, else the status reason,
    // and attach the truthful tiers block. There is no per-request scope on
    // this framework-boundary path, so the tiers come from the ACTIVE-scope
    // cell (always present).
    let original = String::from_utf8_lossy(&bytes);
    let message = if original.trim().is_empty() {
        status.canonical_reason().unwrap_or("error").to_string()
    } else {
        original.into_owned()
    };
    let envelope = serde_json::json!({
        "error": message,
        "tiers": crate::routes::query_tiers(&state.active_cell()),
    });
    let rebuilt = serde_json::to_vec(&envelope).expect("error envelope serializes");
    parts.headers.remove(axum::http::header::CONTENT_LENGTH);
    parts.headers.insert(
        axum::http::header::CONTENT_TYPE,
        axum::http::HeaderValue::from_static("application/json"),
    );
    Response::from_parts(parts, axum::body::Body::from(rebuilt))
}

/// Constant-time byte comparison (audit low rider): the bearer check must
/// not leak prefix length through timing, loopback or not.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// Write the discovery file (rag's pattern, contract §1). One process, one
/// port/token — written under the WORKSPACE root's vault, unchanged by the
/// multi-scope refactor.
pub fn write_service_json(state: &AppState, port: u16) -> std::io::Result<PathBuf> {
    let dir = engine_store::engine_data_dir(&state.workspace_root.join(".vault"));
    std::fs::create_dir_all(&dir)?;
    let path = dir.join("service.json");
    let payload = serde_json::json!({
        "port": port,
        "service_token": state.bearer,
        "pid": std::process::id(),
        "last_heartbeat": now_ms(),
    });
    std::fs::write(&path, serde_json::to_string_pretty(&payload)?)?;
    Ok(path)
}

/// Build the workspace-level application state for a launch root, opening the
/// shared user-state handle and eagerly building the launch scope's cell into
/// the registry as the active scope.
///
/// Boot (S11, in `lib.rs`) further restores/persists the active scope through
/// the user-state handle; this constructor is the shared core used by both
/// `serve` and the unit tests.
pub fn build_state(root: PathBuf) -> Arc<AppState> {
    let workspace_root = root.clone();
    let active_token = crate::routes::scope_token(&workspace_root);
    // The single shared user-state handle, opened ONCE per workspace. Like the
    // cache, this is best-effort: a corrupt store is recreated empty (W01
    // open_or_heal), never fatal at boot.
    let user_state = Arc::new(Mutex::new(
        vaultspec_session::UserState::open(&workspace_root.join(".vault"))
            .unwrap_or_else(|e| panic!("user-state store unavailable: {e}")),
    ));
    // Token: 128 bits from the OS CSPRNG (B10, resource-hardening). The prior
    // token was a non-cryptographic FNV hash of pid + wall-clock time — a
    // ~10^7 search space a co-resident process could brute-force, and the token
    // also rides into `service.json` in cleartext. getrandom draws from the OS
    // entropy source; hex-encoded it keeps the 32-char `[0-9a-f]` shape every
    // consumer (and the SPA meta-tag injection) already expects.
    let bearer = {
        let mut bytes = [0u8; 16];
        getrandom::fill(&mut bytes).expect("OS CSPRNG unavailable for bearer token");
        let mut hex = String::with_capacity(32);
        for b in bytes {
            use std::fmt::Write as _;
            let _ = write!(hex, "{b:02x}");
        }
        hex
    };
    let state = Arc::new(AppState {
        workspace_root,
        registry: RwLock::new(ScopeRegistry::new()),
        bearer,
        user_state,
        active_scope: RwLock::new(active_token.clone()),
    });
    // Eagerly build the launch scope's cell so `/status`, the tiers fallback,
    // and the active-cell resolve are always satisfiable. The cell is pinned
    // as the active scope and never evicted. The launch root is trusted by
    // construction, so it is warmed directly (not through the worktree-
    // membership check `get_or_build` runs on client-supplied scopes).
    crate::registry::build_active(&state, root)
        .unwrap_or_else(|e| panic!("launch scope cell: {e}"));
    state
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_state() -> (tempfile::TempDir, Arc<AppState>) {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join(".vault/plan")).unwrap();
        std::fs::write(
            dir.path().join(".vault/plan/2026-06-12-w-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#w'\n---\n\nMentions `src/a.rs` and [[2026-06-12-w-adr]].\n",
        )
        .unwrap();
        let state = build_state(dir.path().to_path_buf());
        (dir, state)
    }

    #[test]
    fn rebuild_swap_prunes_removed_mentions_and_emits_diffs() {
        // Audit gates W02P06-302/303: the watcher path is rebuild+swap at
        // scope granularity — an EDIT THAT REMOVES A MENTION must prune
        // the stale edge, and the old→new diff must carry the removal. The
        // per-scope clock now lives on the active cell (W02.P04.S12).
        let (dir, state) = fixture_state();
        // build_state already cold-indexed the launch cell, so the live graph
        // holds the initial adds. Assert that starting state directly.
        let cell = state.active_cell();
        let edges_before = cell.graph_arc().edge_count();
        assert_eq!(edges_before, 2, "path + wiki mention");

        // Edit: the path mention disappears.
        std::fs::write(
            dir.path().join(".vault/plan/2026-06-12-w-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#w'\n---\n\nOnly [[2026-06-12-w-adr]] remains.\n",
        )
        .unwrap();
        let emitted = cell.rebuild_and_swap().unwrap();
        assert!(emitted > 0, "edit emits deltas");
        assert_eq!(
            cell.graph_arc().edge_count(),
            1,
            "stale edge pruned: live graph converges to the cold rebuild"
        );

        // The clock is monotonic across rebuilds and the ring holds both
        // batches in order, on THIS cell's own clock.
        let ring = cell.ring.lock().unwrap();
        let seqs: Vec<u64> = ring.iter().map(|(seq, _)| *seq).collect();
        assert!(seqs.windows(2).all(|w| w[1] > w[0]));
    }

    #[test]
    fn meta_edges_are_memoized_per_generation() {
        let (_dir, state) = fixture_state();
        let cell = state.active_cell();
        cell.rebuild_and_swap().unwrap();
        let a = cell.meta_edges();
        let b = cell.meta_edges();
        assert!(Arc::ptr_eq(&a, &b), "same generation: cached (W02P05-203)");
        let _ = cell.rebuild_and_swap();
        let c = cell.meta_edges();
        // New generation recomputes (pointer may differ even if equal).
        assert_eq!(*a, *c, "content equal across no-op rebuild");
    }

    #[test]
    fn feature_nodes_are_memoized_per_generation() {
        // The constellation feature-node aggregation scans the whole corpus (group
        // members by tag, fold each member's degree-by-tier and lifecycle), so it
        // is memoized per graph generation exactly like meta_edges/document_views:
        // a same-generation query is a warm-cache hit (same Arc — no
        // re-aggregation), and a generation bump (rebuild) recomputes. This is what
        // lets the default (unfiltered) constellation poll serve from cache instead
        // of re-folding every member document on every request.
        let (_dir, state) = fixture_state();
        let cell = state.active_cell();
        cell.rebuild_and_swap().unwrap();
        let a = cell.feature_nodes();
        let b = cell.feature_nodes();
        assert!(
            Arc::ptr_eq(&a, &b),
            "same generation: feature nodes are a warm-cache hit, not re-aggregated"
        );
        let _ = cell.rebuild_and_swap();
        let c = cell.feature_nodes();
        assert_eq!(*a, *c, "content equal across a no-op rebuild");
    }

    #[test]
    fn warm_projections_primes_the_per_generation_caches() {
        // The watcher calls warm_projections off the request path after a rebuild
        // so the first user event finds the salience basis + default-view
        // projections warm, not paying the multi-second cold build. Smoke-test
        // that it runs and leaves the getters as warm-cache hits (same Arc) within
        // the generation — i.e. it wired the right projections and they cache.
        let (_dir, state) = fixture_state();
        let cell = state.active_cell();
        cell.rebuild_and_swap().unwrap();
        cell.warm_projections();
        assert!(Arc::ptr_eq(&cell.salience_basis(), &cell.salience_basis()));
        assert!(Arc::ptr_eq(&cell.meta_edges(), &cell.meta_edges()));
        assert!(Arc::ptr_eq(&cell.feature_nodes(), &cell.feature_nodes()));
    }

    #[test]
    fn vault_tree_rows_are_memoized_per_generation() {
        // The Tree view's `/vault-tree` listing re-projected + re-sorted every doc
        // node on each poll; the rows are filter-independent and generation-stable,
        // so they are memoized like feature_nodes/document_views: same generation =
        // warm-cache hit (same Arc), a rebuild recomputes.
        let (_dir, state) = fixture_state();
        let cell = state.active_cell();
        cell.rebuild_and_swap().unwrap();
        let a = cell.vault_tree_rows();
        let b = cell.vault_tree_rows();
        assert!(
            Arc::ptr_eq(&a, &b),
            "same generation: vault-tree rows are a warm-cache hit, not re-projected"
        );
        let _ = cell.rebuild_and_swap();
        let c = cell.vault_tree_rows();
        assert_eq!(*a, *c, "content equal across a no-op rebuild");
    }

    #[test]
    fn salience_basis_is_memoized_per_generation() {
        // graph-node-salience W05.P11.S45: the expensive lens basis (the PPR
        // partial vectors, Brandes betweenness, k-core, role features) is computed
        // ONCE per graph generation and shared by every lens. A no-op query is a
        // warm-cache hit (same Arc); a generation bump (rebuild) recomputes.
        let (_dir, state) = fixture_state();
        let cell = state.active_cell();
        cell.rebuild_and_swap().unwrap();
        let a = cell.salience_basis();
        let b = cell.salience_basis();
        assert!(
            Arc::ptr_eq(&a, &b),
            "same generation: the basis is a warm-cache hit, not recomputed"
        );
        // A generation bump (rebuild) invalidates the cache and recomputes.
        let _ = cell.rebuild_and_swap();
        let c = cell.salience_basis();
        assert_eq!(
            a.node_count(),
            c.node_count(),
            "the recomputed basis covers the same bounded node set"
        );
    }

    #[test]
    fn embeddings_cache_invalidates_when_the_semantic_epoch_advances() {
        // rag-control-plane P03.S19: the embedding vector cache is keyed on the
        // semantic freshness epoch. An unchanged epoch serves the cached vector
        // map (no Qdrant re-scroll); an advanced epoch (a completed reindex)
        // invalidates it, forcing a re-read. This is the semantic analog of the
        // generation-keyed projection caches.
        let (_dir, state) = fixture_state();
        let cell = state.active_cell();

        // Cold cache: nothing stored at any epoch yet.
        assert!(
            cell.embeddings_if_fresh(1000).is_none(),
            "cold cache misses"
        );

        // Store the vectors scrolled at epoch 1000.
        let map_a = std::sync::Arc::new(std::collections::HashMap::from([(
            "doc:x".to_string(),
            vec![0.1f32, 0.2, 0.3],
        )]));
        cell.store_embeddings(1000, map_a.clone());

        // Same epoch ⇒ warm-cache hit (the SAME Arc, no re-scroll).
        let hit = cell.embeddings_if_fresh(1000).expect("same epoch hits");
        assert!(
            Arc::ptr_eq(&hit, &map_a),
            "an unchanged epoch serves the cached vector map"
        );

        // A reindex advances the epoch ⇒ the stale slice is invalidated.
        assert!(
            cell.embeddings_if_fresh(2000).is_none(),
            "an advanced semantic epoch invalidates the cache (re-scroll)"
        );

        // After the re-scroll stores the new map, the new epoch is the warm one
        // and the old epoch no longer hits.
        let map_b = std::sync::Arc::new(std::collections::HashMap::from([(
            "doc:y".to_string(),
            vec![0.9f32],
        )]));
        cell.store_embeddings(2000, map_b.clone());
        assert!(Arc::ptr_eq(
            &cell.embeddings_if_fresh(2000).unwrap(),
            &map_b
        ));
        assert!(
            cell.embeddings_if_fresh(1000).is_none(),
            "the superseded epoch's slice is gone"
        );
    }

    #[test]
    fn each_scope_cell_owns_an_independent_delta_clock() {
        // W02.P03/P04: two warm cells must NOT share a delta clock — a rebuild
        // on one advances only its own seq, so per-scope `since=` resume stays
        // correct and independent.
        let (_dir, state) = fixture_state();
        let active = state.active_cell();
        active.rebuild_and_swap().unwrap();
        let active_tip = active.seq.load(Ordering::SeqCst);
        assert!(active_tip > 0, "active cell advanced its own clock");

        // A second cell over the same root but never rebuilt: its clock is
        // still zero — the active cell's commit did not touch it.
        let store =
            engine_store::Store::open_or_heal(&state.workspace_root.join(".vault")).unwrap();
        let other = ScopeCell::new(
            state.workspace_root.clone(),
            ScopeRef::Worktree {
                path: crate::routes::scope_token(&state.workspace_root),
            },
            store,
        );
        assert_eq!(
            other.seq.load(Ordering::SeqCst),
            0,
            "an independent cell's clock is untouched by another cell's commit"
        );
    }
}
