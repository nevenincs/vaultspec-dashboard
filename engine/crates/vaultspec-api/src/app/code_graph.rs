use super::*;

/// The disconnected code-corpus store (codebase-graphing ADR D1/D6): its own
/// graph, generation, source-tree fingerprint, and honest extraction stats.
/// Refresh is LAZY: a code-corpus query calls [`CodeGraphCell::ensure_fresh`]
/// (on a blocking thread), which re-walks + fingerprints the source tree —
/// debounced to at most one probe per [`CODE_FRESHNESS_DEBOUNCE_MS`] — and
/// re-extracts only on a fingerprint miss. This keeps the vault watcher
/// untouched (ADR D6 refinement: query-time freshness instead of watching the
/// whole source tree) while an uncommitted source edit still refreshes the
/// served graph on the next query.
pub struct CodeGraphCell {
    graph: RwLock<Arc<LinkageGraph>>,
    /// Bumped AFTER the graph swap (both SeqCst): a reader observing G+1
    /// necessarily observes the new graph — the vault commit discipline.
    pub generation: AtomicU64,
    fingerprint: Mutex<Option<String>>,
    last_probe_ms: std::sync::atomic::AtomicI64,
    /// Extraction honesty counters from the last rebuild (ADR D8): the route
    /// serves these so truncation/accuracy is stated, never implied away.
    pub stats: RwLock<Option<ingest_code::ExtractionStats>>,
    rebuild_lock: Mutex<()>,
    /// The DEFAULT (un-narrowed) module-rollup slice, memoized per code
    /// generation (review M1; `derived-projections-memoize-on-the-graph-
    /// generation`): the default rollup poll is the code corpus's hot path and
    /// its aggregation + per-node projection are generation-stable. A NARROWED
    /// query flows through the projection per request, exactly as a filtered
    /// vault constellation does. The recency Arc rides the key by POINTER
    /// identity (the recency memo hands back the same Arc until its own key
    /// changes), so a commit or dirty-set change invalidates the rollup even
    /// at an unchanged parse generation.
    #[allow(clippy::type_complexity)]
    rollup_cache: Mutex<
        Option<(
            u64,
            Option<Arc<engine_query::code::CodeRecency>>,
            Arc<engine_query::graph::GraphSlice>,
        )>,
    >,
    /// Per-file GIT recency for the heat ranking (code-graph-heat ADR
    /// amendment), memoized on its OWN freshness key — `HEAD sha @ dirty-set
    /// hash` — distinct from the parse generation (a commit moves HEAD without
    /// changing the tree fingerprint; an edit moves the fingerprint without
    /// changing HEAD). The `embeddings_cache` epoch-key precedent.
    recency_cache: Mutex<Option<(String, Arc<engine_query::code::CodeRecency>)>>,
    recency_probe_ms: std::sync::atomic::AtomicI64,
    /// The path-sorted `/code-files` snapshot RING keyed by the CODE generation
    /// (vault-tree-delta `/code-files` follow-on), sharing `crate::row_delta` with
    /// the vault tree; backs `/code-files/delta`. A truncated (walk-capped) corpus
    /// is NEVER recorded (not a stable complete baseline).
    pub(crate) code_file_rows_ring: Mutex<crate::row_delta::RowSnapshotRing>,
}

/// Commit-walk ceiling for the per-file recency fold — the event tier's
/// established 5000-commit horizon. Files last touched beyond it join the
/// oldest tie block honestly (rank 0), never a fabricated time.
pub const CODE_RECENCY_MAX_COMMITS: usize = 5_000;

/// Ceiling on the enumerated dirty/untracked path set fed to the recency key
/// and ranking (`bounded-by-default-for-every-accumulator`).
pub const CODE_DIRTY_PATHS_CAP: usize = 20_000;

/// Freshness-probe debounce: repeated code-corpus polls within this window
/// serve the held graph without re-walking the tree.
pub const CODE_FRESHNESS_DEBOUNCE_MS: i64 = 2_000;

impl CodeGraphCell {
    pub(super) fn new() -> Self {
        CodeGraphCell {
            graph: RwLock::new(Arc::new(LinkageGraph::new())),
            generation: AtomicU64::new(0),
            fingerprint: Mutex::new(None),
            last_probe_ms: std::sync::atomic::AtomicI64::new(0),
            stats: RwLock::new(None),
            rebuild_lock: Mutex::new(()),
            rollup_cache: Mutex::new(None),
            recency_cache: Mutex::new(None),
            recency_probe_ms: std::sync::atomic::AtomicI64::new(0),
            code_file_rows_ring: Mutex::new(crate::row_delta::RowSnapshotRing::default()),
        }
    }

    /// The default module rollup, memoized on the code generation (review M1)
    /// AND the recency snapshot (by Arc pointer identity — the recency memo
    /// returns the same Arc until its own `HEAD@dirty` key changes). The
    /// caller passes a graph Arc it already holds so the projection runs over
    /// exactly the generation it read.
    pub fn default_rollup(
        &self,
        graph: &Arc<LinkageGraph>,
        scope: &ScopeRef,
        recency: Option<&Arc<engine_query::code::CodeRecency>>,
    ) -> Arc<engine_query::graph::GraphSlice> {
        let generation = self.generation.load(Ordering::SeqCst);
        let mut cache = self.rollup_cache.lock().unwrap_or_else(|e| e.into_inner());
        if let Some((cached_generation, cached_recency, cached)) = cache.as_ref()
            && *cached_generation == generation
            && match (cached_recency, recency) {
                (Some(a), Some(b)) => Arc::ptr_eq(a, b),
                (None, None) => true,
                _ => false,
            }
        {
            return cached.clone();
        }
        let fresh = Arc::new(engine_query::code::code_graph_query(
            graph,
            scope,
            true,
            &engine_query::code::CodeNarrow::default(),
            recency.map(Arc::as_ref),
        ));
        *cache = Some((generation, recency.cloned(), fresh.clone()));
        fresh
    }

    /// The complete path-sorted `/code-files` rows, memoized on the code
    /// generation (search-providers ADR; `derived-projections-memoize-on-the-
    /// graph-generation`). The caller passes a graph Arc it already holds so
    /// the projection runs over exactly the generation it read — the
    /// `default_rollup` discipline. Filter-independent (the whole listing), so
    /// the handler paginates the cached slice per request.
    /// Per-file git recency for the heat ranking (code-graph-heat ADR
    /// amendment): repo-relative path → last-commit committer time, folded
    /// order-independently (max) from ONE bounded commit walk, plus the
    /// dirty/untracked set from git status. Probes are debounced like the
    /// extraction fingerprint; the fold re-runs only when `HEAD sha @
    /// dirty-set hash` changes. `None` = not a git repository / unborn HEAD —
    /// the query falls back to mtime ranking honestly. BLOCKING (a commit walk
    /// + a status diff) — request paths call it via `spawn_blocking`.
    pub fn ensure_recency(
        &self,
        root: &std::path::Path,
    ) -> Option<Arc<engine_query::code::CodeRecency>> {
        let now = now_ms();
        if now.saturating_sub(self.recency_probe_ms.load(Ordering::SeqCst))
            < CODE_FRESHNESS_DEBOUNCE_MS
        {
            return self
                .recency_cache
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .as_ref()
                .map(|(_, held)| held.clone());
        }
        self.recency_probe_ms.store(now, Ordering::SeqCst);
        let Ok(sha) = engine_graph::asof::resolve_ref(root, "HEAD") else {
            *self.recency_cache.lock().unwrap_or_else(|e| e.into_inner()) = None;
            return None;
        };
        let dirty =
            ingest_git::worktrees::dirty_paths(root, CODE_DIRTY_PATHS_CAP).unwrap_or_default();
        let key = format!(
            "{sha}@{}",
            engine_model::content_hash(dirty.join("\n").as_bytes())
        );
        {
            let cache = self.recency_cache.lock().unwrap_or_else(|e| e.into_inner());
            if let Some((held_key, held)) = cache.as_ref()
                && *held_key == key
            {
                return Some(held.clone());
            }
        }
        let workspace = ingest_git::workspace::Workspace::discover(root).ok()?;
        let events = ingest_git::log::walk(&workspace, "HEAD", CODE_RECENCY_MAX_COMMITS).ok()?;
        let mut last_commit_ms: std::collections::BTreeMap<String, i64> =
            std::collections::BTreeMap::new();
        for event in &events {
            for path in &event.touched_paths {
                let entry = last_commit_ms.entry(path.clone()).or_insert(event.ts);
                if event.ts > *entry {
                    *entry = event.ts;
                }
            }
        }
        let fresh = Arc::new(engine_query::code::CodeRecency {
            last_commit_ms,
            dirty: dirty.into_iter().collect(),
        });
        *self.recency_cache.lock().unwrap_or_else(|e| e.into_inner()) = Some((key, fresh.clone()));
        Some(fresh)
    }

    pub fn graph_arc(&self) -> Arc<LinkageGraph> {
        self.graph.read().unwrap_or_else(|e| e.into_inner()).clone()
    }

    pub fn stats_snapshot(&self) -> Option<ingest_code::ExtractionStats> {
        self.stats.read().unwrap_or_else(|e| e.into_inner()).clone()
    }

    /// Serve the code graph, re-extracting when the source tree changed.
    /// BLOCKING (tree walk; full parse on a miss) — request paths call it via
    /// `spawn_blocking`. Never errors into a stale lie: an IO failure surfaces
    /// as `Err` and the route degrades honestly.
    pub fn ensure_fresh(&self, root: &std::path::Path) -> Result<Arc<LinkageGraph>, String> {
        let now = now_ms();
        let extracted_once = self
            .fingerprint
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .is_some();
        if extracted_once
            && now.saturating_sub(self.last_probe_ms.load(Ordering::SeqCst))
                < CODE_FRESHNESS_DEBOUNCE_MS
        {
            return Ok(self.graph_arc());
        }
        // One rebuild at a time; a second query waits and then hits the
        // fingerprint fast path below.
        let _guard = self.rebuild_lock.lock().unwrap_or_else(|e| e.into_inner());
        // Debounce re-check under the lock (review L3): a waiter whose holder
        // just rebuilt serves the fresh graph without re-walking the tree.
        if now.saturating_sub(self.last_probe_ms.load(Ordering::SeqCst))
            < CODE_FRESHNESS_DEBOUNCE_MS
            && self
                .fingerprint
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .is_some()
        {
            return Ok(self.graph_arc());
        }
        let caps = ingest_code::WalkCaps::default();
        let outcome =
            ingest_code::walk::walk_source_tree(root, &caps).map_err(|e| e.to_string())?;
        let probe =
            ingest_code::fingerprint::source_tree_fingerprint(&outcome.files, outcome.capped);
        {
            let held = self.fingerprint.lock().unwrap_or_else(|e| e.into_inner());
            if held.as_deref() == Some(probe.as_str()) {
                self.last_probe_ms.store(now, Ordering::SeqCst);
                return Ok(self.graph_arc());
            }
        }
        let data = ingest_code::extract_code_graph(root, &caps).map_err(|e| e.to_string())?;
        let mut graph = LinkageGraph::new();
        for node in data.nodes {
            graph.upsert_node(node);
        }
        for ce in data.edges {
            engine_graph::edges::ingest(
                &mut graph,
                ce.edge,
                engine_graph::EdgeAttrs {
                    multiplicity: ce.multiplicity,
                    ..Default::default()
                },
            )
            .map_err(|e| format!("code edge rejected at the graph boundary: {e}"))?;
        }
        *self.stats.write().unwrap_or_else(|e| e.into_inner()) = Some(data.stats);
        *self.fingerprint.lock().unwrap_or_else(|e| e.into_inner()) = Some(data.fingerprint);
        // Swap happens-before the generation bump (both SeqCst).
        *self.graph.write().unwrap_or_else(|e| e.into_inner()) = Arc::new(graph);
        self.generation.fetch_add(1, Ordering::SeqCst);
        self.last_probe_ms.store(now, Ordering::SeqCst);
        Ok(self.graph_arc())
    }
}
