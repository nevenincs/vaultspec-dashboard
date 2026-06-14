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
use tokio::sync::broadcast;

use crate::registry::ScopeRegistry;

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
    // Token: stable-enough randomness without a rand dependency.
    let bearer = engine_model::content_hash(
        format!("{}:{:?}", std::process::id(), std::time::SystemTime::now()).as_bytes(),
    );
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
