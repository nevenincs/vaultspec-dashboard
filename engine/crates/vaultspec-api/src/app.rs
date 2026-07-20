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

use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, RwLock};

use axum::extract::{Request, State};
use axum::http::{HeaderMap, StatusCode};
use axum::middleware::Next;
use axum::response::Response;
use engine_graph::{LinkageGraph, MetaEdge};
use engine_model::ScopeRef;
use engine_query::graph::DocumentViews;
use serde_json::Value;
use tokio::sync::broadcast;

use crate::registry::ScopeRegistry;

pub use crate::discovery::{
    DiscoveryIdentity, heartbeat_service_json, remove_service_json_if_owned,
    workspace_discovery_dir, write_service_json,
};

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

/// A cached historical graph plus its lazy per-graph document projection index.
/// The graph cache is keyed by commit sha; these views are therefore also
/// sha-stable and reusable across time-travel query revisits.
pub struct CachedAsofGraph {
    pub asof: Arc<engine_graph::asof::AsofGraph>,
    doc_views_cache: Mutex<Option<Arc<DocumentViews>>>,
}

impl CachedAsofGraph {
    fn new(asof: engine_graph::asof::AsofGraph) -> Self {
        Self {
            asof: Arc::new(asof),
            doc_views_cache: Mutex::new(None),
        }
    }

    pub fn document_views(&self, scope: &ScopeRef) -> Arc<DocumentViews> {
        let mut cache = self
            .doc_views_cache
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        if let Some(cached) = cache.as_ref() {
            return cached.clone();
        }
        let fresh = Arc::new(engine_query::graph::build_document_views(
            &self.asof.graph,
            scope,
        ));
        *cache = Some(fresh.clone());
        fresh
    }
}

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
    pub doc_views_cache: Mutex<Option<(u64, Arc<DocumentViews>)>>,
    /// The UNFILTERED constellation feature-node projection, memoized per
    /// generation. The Feature query's fixed cost is aggregating the whole corpus
    /// into feature-convergence nodes; this serves the default (unfiltered) poll
    /// from cache, invalidated on a generation bump like the other projections.
    pub feature_nodes_cache: Mutex<Option<(u64, Arc<Vec<Value>>)>>,
    /// The stem-sorted `/vault-tree` document-row snapshot RING keyed by generation
    /// (vault-tree-delta ADR D2): the freshest slot is the per-generation memo, the
    /// retained generations back `/vault-tree/delta`. Memo/ring/diff in
    /// `crate::row_delta`.
    pub(crate) vault_tree_rows_ring: Mutex<crate::row_delta::RowSnapshotRing>,
    /// The served DOCUMENT graph-slice snapshot ring backing `/graph/query/delta`
    /// (graph-slice-delta ADR D2): (params fingerprint, generation) → slice.
    pub(crate) graph_slice_ring: Mutex<crate::graph_delta::GraphSliceRing>,
    /// The HEAD commit-correlated temporal event rows, memoized per generation. The
    /// /events activity feed walks up to 5000 commits and correlates each to graph
    /// nodes — immutable for a given HEAD, but it ran on every request (~2.2s).
    pub event_rows_cache: Mutex<Option<(u64, Arc<Vec<engine_store::EventRow>>)>>,
    /// The FULL range-independent timeline lineage node set, memoized per
    /// generation (backend timeline-cache hardening). `/graph/lineage` previously
    /// re-scanned every node (the per-node degree walk) AND every edge on EVERY
    /// request, so a timeline scroll/zoom — which only changes the date range —
    /// behaved like a hot interactive recompute. The range-independent node set is
    /// memoized here; the handler serves a scroll as a cheap `bound_range` slice
    /// over this cache and the default path never iterates the edges. Invalidated
    /// on a generation bump exactly like the other projections.
    pub lineage_nodes_cache: Mutex<Option<(u64, Arc<Vec<engine_query::lineage::LineageNode>>)>>,
    /// The filter vocabulary (relations, kinds, doc-types, statuses, tiers, date
    /// bounds, refs), memoized per generation. `/filters` re-scanned the whole
    /// graph on every poll to rebuild the same generation-stable vocabulary; the
    /// timeline's corpus auto-fit reads it on load, so it is part of the default
    /// view. Invalidated on a generation bump.
    pub filters_vocab_cache: Mutex<Option<(u64, Arc<engine_query::filter::Vocabulary>)>>,
    /// The in-flight pipeline artifacts (the Work surface), memoized per
    /// generation. `/pipeline` re-scanned every `doc:` node on every poll to
    /// project the active plans/ADRs — a generation-stable projection. Invalidated
    /// on a generation bump.
    pub pipeline_cache: Mutex<Option<(u64, Arc<Vec<engine_query::pipeline::PipelineArtifact>>)>>,
    /// The whole-corpus feature-coverage map (feature-group-authoring ADR D2),
    /// memoized per generation. `/features` projects per-feature pipeline coverage
    /// (present types + newest stems, missing types, eligibility, next step) over
    /// the graph; the projection is generation-stable, so ONE cached map serves
    /// both the per-feature read and the roster and repeat panel reads are warm.
    /// Bounded by the roster cap at build. Invalidated on a generation bump.
    pub feature_coverage_cache: Mutex<Option<(u64, Arc<engine_query::features::CoverageMap>)>>,
    /// The recent HEAD commit walk (subjects + touched paths), memoized per
    /// generation. `/history` ran a live `git log` walk against the object DB on
    /// EVERY poll; the walk is HEAD-stable (a new commit bumps the generation
    /// through a rebuild, exactly as `event_rows_cache` relies on), so it is
    /// memoized here and the handler correlates the cached commits to graph nodes
    /// per request in-memory — no per-request disk/git walk. Capped at
    /// `MAX_HISTORY_LIMIT` (the most any request can ask for); the handler slices.
    pub recent_commits_cache: Mutex<Option<(u64, Arc<Vec<ingest_git::log::CommitEvent>>)>>,
    /// Bounded LRU of resolved historical (as-of) graphs, keyed by 40-char commit
    /// sha. `/graph/asof` re-indexes the vault at a commit per request (~35s: the
    /// `vault graph --ref` core subprocess + a structural rebuild over every doc);
    /// time-travel scrubbing REVISITS commits, so a sha cache makes a revisit
    /// instant. Bounded (the graphs are multi-MB) per
    /// bounded-by-default-for-every-accumulator.
    pub asof_cache: Mutex<VecDeque<(String, Arc<CachedAsofGraph>)>>,
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
    /// Serializes graph commits without using the resume ring as the long-held
    /// compute mutex. Diff/projection work may be expensive, but ring readers and
    /// `since=` resume are only blocked while payloads are appended.
    pub commit_lock: Mutex<()>,
    pub generation: AtomicU64,
    /// Whether the (heavy, lazy) document views have been requested at least once
    /// this session (adaptive warming). `warm_projections` warms the DEFAULT view
    /// after every rebuild but DELIBERATELY leaves `document_views` lazy (it serves
    /// the opt-in document drill-in, not the default — warming it eagerly on every
    /// edit would burn the multi-second derive for a view the user may never open).
    /// Once a client HAS drilled into the document view, though, the cold rebuild
    /// of that projection lands on the user's next Detail open as a multi-second
    /// stall. This flag records that intent so warm_projections warms the document
    /// views ONLY for sessions that actually use them — keeping Detail warm across
    /// edits for its users with ZERO cost for everyone else. Latches true on first
    /// use; never reset (a session that opened Detail keeps it warm).
    pub doc_views_used: AtomicBool,
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
    /// The last COMPLETED declared fold's edge set (declared-edge-continuity ADR),
    /// `Arc`-shared and replaced only by a completed fold — never partially. A
    /// rebuild grafts it onto the fresh graph (pruned to the new node set) so a corpus
    /// under continuous editing is never presented edge-less; the running fold's
    /// completion replaces it. `None` before the first fold (node-only + building).
    /// Bounded by the corpus's own declared edge count — no new unbounded accumulator.
    pub(crate) declared_edges: RwLock<Option<Arc<Vec<engine_graph::StoredEdge>>>>,
    /// The CODE corpus (codebase-graphing ADR D1): a SEPARATE `LinkageGraph`
    /// instance with its own generation counter and extraction cache, served
    /// beside the vault graph and never merged into it. The two datasets share
    /// no node or edge; the frontend switches which corpus the graph surface
    /// renders.
    pub code: CodeGraphCell,
}

mod code_graph;
pub use code_graph::{
    CODE_DIRTY_PATHS_CAP, CODE_FRESHNESS_DEBOUNCE_MS, CODE_RECENCY_MAX_COMMITS, CodeGraphCell,
};

pub const RING_CAP: usize = 4096;

/// How many resolved historical (as-of) graphs to retain per cell. Each is a
/// full multi-MB `LinkageGraph`, so the window is small — enough that the
/// scrub-back-and-forth time-travel pattern hits, without unbounded retention
/// (bounded-by-default-for-every-accumulator).
const ASOF_CACHE_CAP: usize = 4;

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
            vault_tree_rows_ring: Mutex::new(crate::row_delta::RowSnapshotRing::default()),
            graph_slice_ring: Mutex::new(crate::graph_delta::GraphSliceRing::default()),
            event_rows_cache: Mutex::new(None),
            lineage_nodes_cache: Mutex::new(None),
            filters_vocab_cache: Mutex::new(None),
            pipeline_cache: Mutex::new(None),
            feature_coverage_cache: Mutex::new(None),
            recent_commits_cache: Mutex::new(None),
            asof_cache: Mutex::new(VecDeque::new()),
            doc_index_cache: Mutex::new(None),
            embeddings_cache: Mutex::new(None),
            commit_lock: Mutex::new(()),
            generation: AtomicU64::new(0),
            doc_views_used: AtomicBool::new(false),
            watcher: Mutex::new(None),
            declared_status: RwLock::new(None),
            declared_fold_active: AtomicBool::new(false),
            declared_fold_pending: AtomicBool::new(false),
            declared_edges: RwLock::new(None),
            code: CodeGraphCell::new(),
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
        // The activity feed's HEAD commit walk + correlation (~2.2s) is part of
        // the default view (timeline / activity rail), so warm it too.
        let _ = self.commit_event_rows();
        // The default-view projections that previously recomputed per request:
        // the timeline lineage node set, the filter vocabulary (corpus auto-fit),
        // the Work-surface pipeline artifacts, and the recent commit walk (history
        // rail). Warming them here lands the first post-rebuild read warm instead
        // of paying the scan/walk on the interactive path.
        let _ = self.lineage_nodes();
        let _ = self.filters_vocabulary();
        let _ = self.pipeline_artifacts();
        let _ = self.recent_commits();
        // Adaptive: the heavy document views stay lazy for sessions that never
        // drill in (no waste), but once a client HAS opened the document view, the
        // post-rebuild cold rebuild would otherwise land as a multi-second stall on
        // their next Detail open. Warm it here off the request path for those
        // sessions only, so Detail stays warm across edits for the users who use it.
        if self.doc_views_used.load(Ordering::Relaxed) {
            let _ = self.document_views();
        }
    }

    /// The HEAD commit-correlated temporal event rows, memoized per generation.
    /// The `/events` activity feed walks up to 5000 git commits and correlates
    /// each to graph nodes; the walk is immutable for a given HEAD (a new commit
    /// bumps the generation through a rebuild) but it ran on EVERY request
    /// (~2.2s on a 3135-doc corpus). Memoized here so repeat polls are warm and
    /// the handler just clones + filters/buckets the cached rows; warmed off the
    /// request path by `warm_projections`. A git failure is returned UNCACHED so
    /// a transient error does not poison the cache for the generation.
    pub fn commit_event_rows(&self) -> Result<Arc<Vec<engine_store::EventRow>>, String> {
        let generation = self.generation.load(Ordering::SeqCst);
        let mut cache = self
            .event_rows_cache
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        if let Some((cached_generation, cached)) = cache.as_ref()
            && *cached_generation == generation
        {
            return Ok(cached.clone());
        }
        let workspace =
            ingest_git::workspace::Workspace::discover(&self.root).map_err(|e| e.to_string())?;
        let rows =
            engine_query::events::commit_rows(&workspace, "HEAD", 5000, Some(&self.graph_arc()))?;
        let fresh = Arc::new(rows);
        *cache = Some((generation, fresh.clone()));
        Ok(fresh)
    }

    /// The FULL range-independent timeline lineage node set, memoized per
    /// generation (backend timeline-cache hardening). The default `/graph/lineage`
    /// path (no filter, nodes-only) serves a scroll/zoom as a cheap
    /// `engine_query::lineage::bound_range` slice over THIS cache instead of
    /// re-scanning every node (the per-node degree walk) per request; the edges
    /// are never iterated on the default path. A FILTERED or arcs-requested read
    /// bypasses this and flows through `engine_query::lineage::lineage` (the filter
    /// changes the member set, and arcs need the edge scan). Invalidated on a
    /// generation bump exactly like `feature_nodes`/`vault_tree_rows`. The default
    /// (unfiltered) filter never fails validation, so this returns the node set
    /// directly rather than a `Result`.
    pub fn lineage_nodes(&self) -> Arc<Vec<engine_query::lineage::LineageNode>> {
        let generation = self.generation.load(Ordering::SeqCst);
        let mut cache = self
            .lineage_nodes_cache
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        if let Some((cached_generation, cached)) = cache.as_ref()
            && *cached_generation == generation
        {
            return cached.clone();
        }
        // The default timeline view is unfiltered; `Filter::default()` is always
        // valid, so `lineage_nodes` cannot error here.
        let fresh = Arc::new(
            engine_query::lineage::lineage_nodes(
                &self.graph_arc(),
                &self.scope,
                engine_query::filter::Filter::default(),
            )
            .expect("the default (empty) filter is always valid"),
        );
        *cache = Some((generation, fresh.clone()));
        fresh
    }

    /// The filter vocabulary, memoized per generation. `/filters` re-scanned the
    /// whole graph on every poll to rebuild the same generation-stable vocabulary
    /// (relations, kinds, doc-types, statuses, tiers, corpus date bounds, refs);
    /// the timeline's corpus auto-fit reads it on load. Invalidated on a
    /// generation bump exactly like the other projections.
    pub fn filters_vocabulary(&self) -> Arc<engine_query::filter::Vocabulary> {
        let generation = self.generation.load(Ordering::SeqCst);
        let mut cache = self
            .filters_vocab_cache
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        if let Some((cached_generation, cached)) = cache.as_ref()
            && *cached_generation == generation
        {
            return cached.clone();
        }
        let fresh = Arc::new(engine_query::filter::vocabulary(&self.graph_arc()));
        *cache = Some((generation, fresh.clone()));
        fresh
    }

    /// The in-flight pipeline artifacts (the Work surface), memoized per
    /// generation. `/pipeline` re-scanned every `doc:` node on every poll to
    /// project the active plans/ADRs — a generation-stable projection over this
    /// scope's graph. Invalidated on a generation bump.
    pub fn pipeline_artifacts(&self) -> Arc<Vec<engine_query::pipeline::PipelineArtifact>> {
        let generation = self.generation.load(Ordering::SeqCst);
        let mut cache = self
            .pipeline_cache
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        if let Some((cached_generation, cached)) = cache.as_ref()
            && *cached_generation == generation
        {
            return cached.clone();
        }
        let fresh = Arc::new(engine_query::pipeline::in_flight(
            &self.graph_arc(),
            &self.scope,
        ));
        *cache = Some((generation, fresh.clone()));
        fresh
    }

    /// The whole-corpus feature-coverage map (feature-group-authoring ADR D2),
    /// memoized per generation. `/features` re-projected per-feature pipeline
    /// coverage over every `doc:` node on each panel read; the map is
    /// generation-stable (it changes only on a rebuild), so it is memoized here
    /// (cache-until-invalidated) and the handler just looks up the requested
    /// feature or derives the roster from the cached map — no per-read re-scan. A
    /// single map serves both shapes and is bounded by the roster cap at build.
    /// Invalidated on a generation bump. Deliberately NOT in `warm_projections`
    /// (panel-triggered, not default-view): the first panel read per generation
    /// pays the one full-corpus scan, like the lazily-warmed document views.
    pub fn feature_coverage(&self) -> Arc<engine_query::features::CoverageMap> {
        let generation = self.generation.load(Ordering::SeqCst);
        let mut cache = self
            .feature_coverage_cache
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        if let Some((cached_generation, cached)) = cache.as_ref()
            && *cached_generation == generation
        {
            return cached.clone();
        }
        let fresh = Arc::new(engine_query::features::coverage_map(&self.graph_arc()));
        *cache = Some((generation, fresh.clone()));
        fresh
    }

    /// The recent HEAD commit walk (subjects + touched paths), memoized per
    /// generation. `/history` ran a live `git log` walk against the object DB on
    /// EVERY poll; the walk is HEAD-stable (a new commit bumps the generation
    /// through a rebuild, the same assumption `commit_event_rows` already relies
    /// on), so it is memoized here at the `MAX_HISTORY_LIMIT` ceiling and the
    /// handler correlates the cached commits to graph nodes in-memory and slices
    /// to the requested `limit` — no per-request git walk. A git failure is
    /// returned UNCACHED so a transient error does not poison the cache for the
    /// generation (mirrors `commit_event_rows`).
    pub fn recent_commits(&self) -> Result<Arc<Vec<ingest_git::log::CommitEvent>>, String> {
        let generation = self.generation.load(Ordering::SeqCst);
        {
            let cache = self
                .recent_commits_cache
                .lock()
                .unwrap_or_else(|e| e.into_inner());
            if let Some((cached_generation, cached)) = cache.as_ref()
                && *cached_generation == generation
            {
                return Ok(cached.clone());
            }
        }
        let workspace =
            ingest_git::workspace::Workspace::discover(&self.root).map_err(|e| e.to_string())?;
        let commits = ingest_git::log::walk(
            &workspace,
            "HEAD",
            crate::routes::history::MAX_HISTORY_LIMIT,
        )
        .map_err(|e| e.to_string())?;
        let fresh = Arc::new(commits);
        let mut cache = self
            .recent_commits_cache
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        *cache = Some((generation, fresh.clone()));
        Ok(fresh)
    }

    /// The resolved historical (as-of) graph for a time-travel token, served from
    /// a bounded by-sha LRU. `/graph/asof` re-indexes the vault at the resolved
    /// commit per request — the `vault graph --ref` core subprocess plus a
    /// structural rebuild over every doc (~35s on a large corpus) — so a revisit
    /// (time-travel scrubbing returns to commits) is the common case worth caching.
    /// The cheap sha resolve (`resolve_ref`: no tree walk, no subprocess) is the
    /// cache key; a hit skips the re-index entirely. A miss re-indexes OFF the lock
    /// (the multi-second build must never hold the cache mutex). First visit to a
    /// never-seen sha still pays the re-index (core must re-parse the historical
    /// vault — inherent). NOTE the cached graph carries the `interpretation` of the
    /// token that first resolved this sha; the time-travel client sends epoch-ms
    /// timestamps consistently, so that label is stable in practice.
    /// Fetch the historical graph for an ALREADY-RESOLVED commit `sha` (the caller
    /// resolves `(sha, interpretation)` cheaply via
    /// [`engine_graph::asof::resolve_ref_interpreted`] and echoes the per-request
    /// interpretation itself — the cache is keyed on the sha and carries no token
    /// reading, so two token forms resolving to one commit share the graph yet each
    /// echo their own interpretation). On a hit the ~35s re-index is skipped; on a
    /// miss it runs OFF the lock (the multi-second build must never hold the mutex).
    pub fn asof_graph(
        &self,
        sha: &str,
    ) -> std::result::Result<Arc<CachedAsofGraph>, engine_graph::IndexError> {
        {
            let mut cache = self.asof_cache.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(pos) = cache.iter().position(|(s, _)| s == sha) {
                // LRU: move the hit to the front so the most-recently-used survives.
                let hit = cache.remove(pos).expect("position just found");
                cache.push_front(hit.clone());
                return Ok(hit.1);
            }
        }
        // Reuse / populate the HISTORICAL (as-of) declared-graph snapshot for THIS
        // committed sha, in its OWN cache kind (`DECLARED_GRAPH_ASOF_KIND`), keyed by
        // the sha. This is a SEPARATE key space and kind from the present-view fold's
        // fingerprint cache (graph-worktree-edge-consistency ADR): a historical view can
        // never pick up the present-view fold's working-tree edges (which may include
        // uncommitted `related:` links absent at this sha), and the two caches never
        // evict each other (audit MEDIUM-1). On a miss we fetch the committed `--ref
        // sha` declared JSON ONCE (off the lock), persist it under the sha key, and pass
        // it into the build — so a later as-of revisit to this sha reuses it across
        // restart / in-memory-LRU eviction.
        let asof_key =
            crate::registry::declared_cache_key(&crate::routes::scope_token(&self.root), sha);
        let cached_declared = {
            let store = self.store.lock().unwrap_or_else(|e| e.into_inner());
            store
                .get_artifact(crate::registry::DECLARED_GRAPH_ASOF_KIND, &asof_key)
                .ok()
                .flatten()
        };
        let declared = match cached_declared {
            Some(json) => Some(json),
            // Miss: fetch the committed `--ref sha` declared JSON (read-only object-DB
            // read) and persist it under the sha key for future reuse. On a fetch
            // failure, fall through with None — `asof_graph_resolved_cached` then runs
            // its own subprocess and degrades the declared tier truthfully.
            None => match engine_graph::index::fetch_core_graph_json(&self.root, Some(sha)) {
                Ok(json) => {
                    let store = self.store.lock().unwrap_or_else(|e| e.into_inner());
                    if let Err(e) = store.put_artifact(
                        crate::registry::DECLARED_GRAPH_ASOF_KIND,
                        &asof_key,
                        &json,
                        now_ms(),
                    ) {
                        eprintln!("vaultspec serve: caching as-of declared graph failed: {e}");
                    }
                    if let Err(e) = store.prune_artifacts_keep_newest(
                        crate::registry::DECLARED_GRAPH_ASOF_KIND,
                        crate::registry::DECLARED_GRAPH_KEEP,
                    ) {
                        eprintln!("vaultspec serve: pruning as-of declared cache failed: {e}");
                    }
                    Some(json)
                }
                Err(_) => None,
            },
        };
        // Re-index OFF the lock (the ~35s build must not hold the cache mutex). The
        // sha is itself a valid revision token, so the build resolves it cheaply.
        let resolved = Arc::new(CachedAsofGraph::new(
            engine_graph::asof::asof_graph_resolved_cached(
                &self.root,
                sha,
                &self.scope,
                0,
                declared.as_deref(),
            )?,
        ));
        let mut cache = self.asof_cache.lock().unwrap_or_else(|e| e.into_inner());
        // A concurrent request may have built the same sha while we did; de-dup.
        if !cache.iter().any(|(s, _)| s == sha) {
            cache.push_front((sha.to_string(), resolved.clone()));
            while cache.len() > ASOF_CACHE_CAP {
                cache.pop_back();
            }
        }
        Ok(resolved)
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
    pub fn document_views(&self) -> Arc<DocumentViews> {
        // Record drill-in intent so `warm_projections` keeps this heavy view warm
        // across rebuilds for this session (adaptive warming — see the field doc).
        self.doc_views_used.store(true, Ordering::Relaxed);
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
    /// D1): the worktree is interactive in roughly the structural-parse time.
    /// `declared_status` is set to the building sentinel ONLY when there is no
    /// last-good declared graph to carry — on a routine re-index where declared
    /// was already available and the cached declared graph for the current HEAD
    /// is reusable, those edges are folded synchronously so the tier stays
    /// available rather than flapping to unavailable-while-building (Issue #4 /
    /// #1). The slow declared-tier core subprocess is otherwise folded in
    /// asynchronously by [`crate::registry::spawn_declared_fold`], called by the
    /// caller after a successful rebuild.
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
        // Uses the SAME fetch+ingest seam the async fold uses, at the version-gated
        // present-view ref (graph-worktree-edge-consistency ADR: the working tree on a
        // verified read-only core so present-view edges share the nodes' snapshot,
        // else committed HEAD), so the sync and async declared graphs converge.
        // Reconcile the declared tier into the fresh structural graph BEFORE the swap
        // (declared-edge-continuity ADR): ingest inline (no-runtime tests) or from the
        // unchanged-corpus cache (available), else GRAFT the last completed fold's
        // carried edges pruned to the new node set so a churned corpus is never
        // edge-less. The reason distinguishes refreshing (carried edges served) from
        // building (none). Extracted to `registry` (where the declared machinery lives)
        // so this handler stays under its module-size baseline.
        let declared_status =
            crate::registry::reconcile_declared_into(self, &mut fresh, stats.declared_unavailable);

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
        let _commit = self.commit_lock.lock().unwrap_or_else(|e| e.into_inner());
        let old = self.graph_arc();
        let t = now_ms();

        // Document deltas first, then the feature/meta-edge projection deltas,
        // CONTINUING the same monotonic clock (constellation-live-delta ADR /
        // S50): one seq space across both species so a held constellation
        // keyframe splices live with no gap. Both ride the ring (resume
        // buffer) and the `graph` channel; each carries its `granularity` tag.
        //
        // The expensive diff/projection/serialization work runs under a narrow
        // commit mutex but OUTSIDE the resume-ring lock. The ring is then held
        // only for sequence reservation and append/broadcast, so `since=` readers
        // are not blocked by graph-scale projection work.
        let doc_log = engine_graph::diff::diff(&old, &fresh, t, 0);
        let feat_seq_start = doc_log.entries.len() as u64;
        // GIR-014/GIR-015: both diffs are delta-ceiling bounded and degrade to
        // keyframe-only (empty entries + a truncation block) on a pathological
        // over-ceiling single commit. When that happens the deltas are DROPPED from
        // this broadcast — but the SIGNAL must NOT be. The client's ONLY live
        // invalidation trigger is stream-chunk processing (`useGraphLiveSync`): a
        // non-"feature" chunk sets `sawDocumentDelta`, which fires the debounced
        // constellation refetch. An over-ceiling commit that emitted ZERO chunks
        // would advance nothing and the client would silently miss the change until
        // the next commit/reconnect — the server-side generation bump below is NOT
        // a client backstop (the client never reads it). So a degraded commit
        // broadcasts one synthetic "rekeyframe" marker chunk (below) that rides the
        // seq clock + resume ring and triggers that refetch. Invariant: degradation
        // may drop the DELTAS, never the SIGNAL.
        let (feat_entries, _, feat_truncated) =
            engine_query::graph::feature_delta(&old, &fresh, &self.scope, t, feat_seq_start);
        let degraded = doc_log.truncated.is_some() || feat_truncated.is_some();

        // Unify both species as (seq, payload) for the resume buffer + the
        // live channel; the document entries serialize to the same wire shape.
        // Robustness H2: a malformed entry SKIPS rather than panics — a single
        // unserializable delta or a feature entry missing its `seq` must not
        // panic inside the commit section (which would poison the ring lock and
        // wedge every later commit + every `since=` resume). The dropped entry
        // is logged; the rest of the batch and the clock advance normally.
        let mut payloads: Vec<serde_json::Value> = Vec::new();
        for entry in &doc_log.entries {
            match serde_json::to_value(entry) {
                Ok(value) => payloads.push(value),
                Err(e) => eprintln!(
                    "vaultspec serve: dropping unserializable doc delta seq={}: {e}",
                    entry.seq
                ),
            }
        }
        for entry in feat_entries {
            match entry["seq"].as_u64() {
                Some(_) => payloads.push(entry),
                None => eprintln!("vaultspec serve: dropping feature delta with no seq: {entry}"),
            }
        }
        // GIR-015: a degraded commit dropped its deltas above; broadcast ONE
        // synthetic non-"feature" marker so the client re-keyframes. Its `seq` is
        // assigned by the broadcast loop below (like every other payload), so it
        // rides the resume ring with a valid contiguous seq — the clock advances
        // by exactly one and the next commit stays gapless; a `since=` resume
        // replays it as a harmless extra refetch. Non-"feature" granularity routes
        // it through the client's `sawDocumentDelta` → `invalidateConstellation`.
        if degraded {
            payloads.push(serde_json::json!({
                "op": "rekeyframe",
                "granularity": "rekeyframe",
                "t": t,
                "reason": format!(
                    "diff exceeded the delta ceiling ({}); re-keyframe",
                    engine_graph::diff::MAX_DIFF_DELTAS
                ),
            }));
        }

        let emitted = payloads.len();
        if emitted > 0 {
            let seq_start = self.seq.fetch_add(emitted as u64, Ordering::SeqCst);
            // Poison recovery (robustness H2): see `graph_arc`.
            let mut ring = self.ring.lock().unwrap_or_else(|e| e.into_inner());
            for (offset, mut payload) in payloads.into_iter().enumerate() {
                let seq = seq_start + offset as u64;
                if let Some(obj) = payload.as_object_mut() {
                    obj.insert("seq".into(), serde_json::Value::from(seq));
                }
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
        emitted
    }
}

/// Workspace-level serve state: the warm scope registry, the single shared
/// user-state handle, the bearer token, and the active scope. Per-scope serve
/// state lives in [`ScopeCell`], resolved through the registry.
/// The freshness window for the cached semantic epoch
/// (rag-integration-hardening D3). rag's index epoch only advances when a
/// reindex COMPLETES — a minutes-long operation — so serving an epoch up to a
/// few seconds stale is negligible against the build it tracks, while the window
/// collapses a burst of `/search` freshness annotations and `/graph/embeddings`
/// polls onto a single `/jobs` round-trip.
const SEMANTIC_EPOCH_TTL: std::time::Duration = std::time::Duration::from_secs(5);

/// The value + read instant of a cached semantic epoch.
struct CachedEpoch {
    epoch: u64,
    read_at: std::time::Instant,
}

/// A bounded, single-value, short-TTL cache of rag's machine-global semantic
/// freshness epoch (rag-integration-hardening D3). The epoch is ONE fact for the
/// resident service — the newest terminal reindex timestamp across its `/jobs`,
/// derived by [`rag_client::control::semantic_epoch`] — so the whole cache is a
/// single `(epoch, read_at)` slot, never a growing per-scope map
/// (`every-accumulator-is-bounded`: one value plus a TTL bound). Both the
/// `/graph/embeddings` vector-cache key and the `/search` freshness annotation
/// read the epoch through this one seam, so the derivation lives in exactly one
/// place and a warm read costs no round-trip.
#[derive(Default)]
pub struct SemanticEpochCache {
    slot: Mutex<Option<CachedEpoch>>,
}

impl SemanticEpochCache {
    /// The cached epoch IF it was read within [`SEMANTIC_EPOCH_TTL`], else `None`
    /// (a cold or expired slot). A `None` is each caller's cue to refresh on its
    /// own terms: `/graph/embeddings` does the one bounded `/jobs` read and
    /// [`SemanticEpochCache::store`]s it; `/search` annotates an honest absent
    /// marker rather than adding a second blocking round-trip on the search path.
    pub fn fresh(&self) -> Option<u64> {
        // Poison recovery (robustness H2): see `graph_arc`.
        let slot = self.slot.lock().unwrap_or_else(|e| e.into_inner());
        slot.as_ref()
            .filter(|c| c.read_at.elapsed() < SEMANTIC_EPOCH_TTL)
            .map(|c| c.epoch)
    }

    /// Store a freshly-read epoch, opening a new TTL window. Only a genuinely
    /// read epoch is stored — a legitimate `0` ("nothing reindexed yet") included;
    /// a FAILED read is never stored, so a rag flake leaves the slot cold and
    /// `/search` reports absent rather than a fabricated `0`.
    pub fn store(&self, epoch: u64) {
        let mut slot = self.slot.lock().unwrap_or_else(|e| e.into_inner());
        *slot = Some(CachedEpoch {
            epoch,
            read_at: std::time::Instant::now(),
        });
    }
}

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
    /// Bounded, transient dashboard intent snapshots, keyed by scope for this
    /// process session only. This is never persisted to `.vault`, git, or graph
    /// semantics; it exists so the dashboard has one backend-backed state
    /// authority during the browser session.
    pub dashboard_state: Mutex<crate::routes::state::DashboardStateSlot>,
    /// Bounded short-TTL cache of rag's machine-global semantic-index freshness
    /// epoch (rag-integration-hardening D3): the `/search` freshness annotation
    /// and the `/graph/embeddings` vector-cache key read the epoch through this
    /// one seam, so a warm read never pays a second `/jobs` round-trip and the
    /// derivation is not duplicated. Single value plus a TTL — bounded at creation.
    pub semantic_epoch_cache: SemanticEpochCache,
    /// Graceful-shutdown signal (single-app-runtime D5): the bearer-gated
    /// `/shutdown` route notifies it; the serve loop's graceful-shutdown
    /// future awaits it alongside ctrl-c/SIGTERM.
    pub shutdown: tokio::sync::Notify,
    /// Process boot instant (ms since epoch), advertised in discovery so the
    /// CLI seat block can report uptime.
    pub started_ms: i64,
    /// The fenced authoring domain's durable store (agentic-spec-authoring-
    /// backend W03.P39). Opened LAZILY against `workspace_root/.vault` on the
    /// first authoring request — as an `Option` so a bad or unopenable authoring
    /// db DEGRADES the authoring panel (a typed error at the route) rather than
    /// panicking the engine at boot, and so a workspace that never touches
    /// authoring pays nothing. Held behind a `Mutex` because the store wraps a
    /// `!Sync` rusqlite `Connection`; the authoring single-writer discipline
    /// serializes every unit of work through this one handle, exactly like
    /// `user_state`.
    pub authoring_store: Mutex<Option<crate::authoring::store::Store>>,
    /// The A2A component lifecycle plane (a2a-product-provisioning W01.P03): the
    /// `vaultspec-product` lifecycle controller plus its bounded, atomic job
    /// registry, rooted at the machine product app home. Owned HERE inside
    /// `AppState` — never a process-global static — so seated instances and tests
    /// each get their own registry and cannot share lifecycle mutation state.
    pub a2a_lifecycle: Arc<crate::routes::a2a_lifecycle::LifecyclePlane>,
    /// The dedicated, durable A2A run-token lease repository (a2a-product-
    /// provisioning W02.P05.S35/S151): the hash-only lease lifecycle store for
    /// admit-before-mint run-start, attach-control terminal settlement, and boot
    /// reconciliation. Its OWN SQLite file under the workspace vault data dir —
    /// deliberately decoupled from the authoring-session store.
    pub a2a_run_leases: Arc<crate::a2a_run_leases::LeaseRepo>,
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

    /// Run `f` against the fenced authoring store, opening it lazily on first
    /// use (agentic-spec-authoring-backend W03.P39). Serializes through the one
    /// `Mutex`-held handle (single-writer). A lazy-open failure surfaces as the
    /// store's own typed error so the route degrades honestly rather than the
    /// engine panicking; poison is recovered like every other guard here.
    pub fn with_authoring_store<T>(
        &self,
        f: impl FnOnce(&mut crate::authoring::store::Store) -> crate::authoring::store::Result<T>,
    ) -> crate::authoring::store::Result<T> {
        let mut guard = self
            .authoring_store
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        if guard.is_none() {
            *guard = Some(crate::authoring::store::Store::open(
                &self.workspace_root.join(".vault"),
            )?);
        }
        f(guard
            .as_mut()
            .expect("authoring store present after lazy open"))
    }
}

pub use engine_model::now_ms;

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
        sanitize_boundary_message(&original)
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

/// Sanitize a framework-boundary error message before it reaches a wire client.
/// Axum's `Json` extractor rejection leaks serde framing AND the source position:
///   "Failed to deserialize the JSON body into the target type: <reason> at line N column M"
/// The `<reason>` is the actionable part a client needs (the offending field, what
/// is wrong, and the set of valid fields) and is kept; the "into the target type"
/// framing and the " at line N column M" parser position are noise that also leak
/// internal structure, so they are stripped. This keeps boundary rejections
/// CONSISTENT with the engine's own clean validation errors ("invalid value for
/// `theme`: must be one of …") instead of shipping two error dialects on the wire.
/// A message that does not match the axum framing passes through unchanged.
fn sanitize_boundary_message(raw: &str) -> String {
    let reason = raw
        .strip_prefix("Failed to deserialize the JSON body into the target type: ")
        .or_else(|| raw.strip_prefix("Failed to deserialize the JSON body: "))
        .unwrap_or(raw);
    // Drop a trailing " at line N column M" parser position, if present.
    let reason = match reason.rfind(" at line ") {
        Some(i) => &reason[..i],
        None => reason,
    };
    reason.trim().to_string()
}

/// Constant-time byte comparison (audit low rider): the bearer check must
/// not leak prefix length through timing, loopback or not.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// Build the workspace-level application state for a launch root, opening the
/// shared user-state handle and eagerly building the launch scope's cell into
/// the registry as the active scope.
///
/// Boot (S11, in `lib.rs`) further restores/persists the active scope through
/// the user-state handle; this constructor is the shared core used by both
/// `serve` and the unit tests.
pub fn build_state(root: PathBuf) -> Arc<AppState> {
    build_state_with_bearer(root, mint_bearer())
}

/// Mint the 128-bit OS-CSPRNG bearer token (B10, resource-hardening).
/// Public so the BOOT path can mint it BEFORE the heavy initial index and
/// publish a `starting` discovery record carrying it (single-app-runtime
/// S23); getrandom draws from the OS entropy source, hex-encoded to the
/// 32-char shape every consumer expects.
pub fn mint_bearer() -> String {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).expect("OS CSPRNG unavailable for bearer token");
    let mut hex = String::with_capacity(32);
    for b in bytes {
        use std::fmt::Write as _;
        let _ = write!(hex, "{b:02x}");
    }
    hex
}

/// Resolve the product app home the A2A lifecycle plane roots at. The install is
/// machine-global (single-app-runtime app home); when no home variable is set the
/// engine's re-derivable data dir under the workspace is the deterministic
/// fallback. A test isolates itself with [`build_state_with_product_home`].
fn resolve_product_app_home(root: &std::path::Path) -> PathBuf {
    vaultspec_session::app_home::app_home_dir()
        .unwrap_or_else(|| root.join(".vault/data/engine-data"))
}

/// [`build_state_with_bearer`] with an explicit product app home, so a test can
/// isolate the A2A lifecycle plane from the real machine app home.
#[cfg(test)]
pub(crate) fn build_state_with_product_home(
    root: PathBuf,
    bearer: String,
    product_app_home: PathBuf,
) -> Arc<AppState> {
    build_state_full(root, bearer, product_app_home)
}

/// [`build_state`] with a caller-minted bearer (the boot path mints early so
/// discovery can publish before the index).
pub fn build_state_with_bearer(root: PathBuf, bearer: String) -> Arc<AppState> {
    let product_home = resolve_product_app_home(&root);
    build_state_full(root, bearer, product_home)
}

/// The shared state builder: [`build_state_with_bearer`] and the test isolation
/// builder both funnel here so the A2A lifecycle plane is constructed once.
fn build_state_full(root: PathBuf, bearer: String, product_app_home: PathBuf) -> Arc<AppState> {
    let workspace_root = root.clone();
    let active_token = crate::routes::scope_token(&workspace_root);
    // The single shared user-state handle, opened ONCE per workspace. Like the
    // cache, this is best-effort: a corrupt store is recreated empty (W01
    // open_or_heal), never fatal at boot.
    let user_state = Arc::new(Mutex::new(
        vaultspec_session::UserState::open(&workspace_root.join(".vault"))
            .unwrap_or_else(|e| panic!("user-state store unavailable: {e}")),
    ));
    let state = Arc::new(AppState {
        workspace_root,
        registry: RwLock::new(ScopeRegistry::new()),
        bearer,
        user_state,
        active_scope: RwLock::new(active_token.clone()),
        dashboard_state: Mutex::new(crate::routes::state::DashboardStateSlot::new()),
        semantic_epoch_cache: SemanticEpochCache::default(),
        shutdown: tokio::sync::Notify::new(),
        started_ms: now_ms(),
        authoring_store: Mutex::new(None),
        a2a_lifecycle: Arc::new(crate::routes::a2a_lifecycle::LifecyclePlane::new(
            &product_app_home,
        )),
        // The dedicated A2A run-lease store, opened under the workspace vault data
        // dir (its own file, isolated from the authoring store). Like `user_state`
        // this is a workspace-level durable store opened once; a failure to open
        // it is a genuine environment fault, surfaced loud rather than silently
        // dropping run-admission durability.
        a2a_run_leases: Arc::new(
            crate::a2a_run_leases::LeaseRepo::open(&root.join(".vault"))
                .unwrap_or_else(|e| panic!("a2a run-lease store unavailable: {e}")),
        ),
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
mod tests;
