//! The axum app skeleton (contract §1, plan W03.P11.S48): loopback-only
//! bind with fail-loud port conflict, `service.json` discovery with bearer
//! token and heartbeat, ungated `/health`, bearer gating everywhere else.
//!
//! Watcher wiring (S48 + audit gates W02P06-302/303): dirty batches drive a
//! **rebuild-at-scope-granularity** — a fresh graph is indexed and swapped
//! behind the lock, never deltas ingested into a live graph (302), so
//! removed mentions prune naturally (303). The old→new diff feeds the ring
//! buffer and the live SSE channel on one monotonic delta clock.

use std::collections::VecDeque;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, RwLock};

use axum::extract::{Request, State};
use axum::http::{HeaderMap, StatusCode};
use axum::middleware::Next;
use axum::response::Response;
use engine_graph::diff::DiffEntry;
use engine_graph::{LinkageGraph, MetaEdge};
use engine_model::ScopeRef;
use tokio::sync::broadcast;

/// One multiplexed stream event (contract §7).
#[derive(Debug, Clone)]
pub struct StreamEvent {
    /// Channel name: graph | fs | git | backends | index.
    pub channel: &'static str,
    /// JSON payload (for `graph`: a §5 diff entry, verbatim shape).
    pub payload: serde_json::Value,
    /// Monotonic sequence (the single delta clock).
    pub seq: u64,
}

pub struct AppState {
    pub root: PathBuf,
    pub scope: ScopeRef,
    /// The live graph; swapped wholesale on rebuild (302 invariant).
    pub graph: RwLock<Arc<LinkageGraph>>,
    pub store: Mutex<engine_store::Store>,
    /// The single monotonic delta clock (contract REDLINE-3).
    pub seq: AtomicU64,
    /// Recent deltas for `since=` resume; bounded.
    pub ring: Mutex<VecDeque<DiffEntry>>,
    pub tx: broadcast::Sender<StreamEvent>,
    pub bearer: String,
    /// Memoized constellation meta-edges per graph generation (audit
    /// W02P05-203).
    pub meta_cache: Mutex<Option<(u64, Arc<Vec<MetaEdge>>)>>,
    pub generation: AtomicU64,
    /// The resident watcher handle; `/status` reports a dead watcher
    /// truthfully instead of claiming residency (DF-4 residual).
    pub watcher: Mutex<Option<engine_graph::watch::WatchHandle>>,
}

pub const RING_CAP: usize = 4096;

impl AppState {
    pub fn graph_arc(&self) -> Arc<LinkageGraph> {
        self.graph.read().expect("graph lock").clone()
    }

    /// Meta-edges, memoized per generation (W02P05-203): the constellation
    /// hot path pays one aggregation per rebuild, not per request.
    pub fn meta_edges(&self) -> Arc<Vec<MetaEdge>> {
        let generation = self.generation.load(Ordering::SeqCst);
        let mut cache = self.meta_cache.lock().expect("meta cache lock");
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
    pub fn rebuild_and_swap(&self) -> Result<usize, String> {
        let store = self.store.lock().map_err(|_| "store lock".to_string())?;
        let (fresh, _stats) =
            engine_graph::index::index_worktree(&self.root, &self.scope, &store, now_ms())
                .map_err(|e| e.to_string())?;
        drop(store);
        Ok(self.commit_graph(fresh))
    }

    /// THE single commit path for a new graph (audit N3+N4): one function
    /// owns the ordering — (1) diff against the outgoing graph and advance
    /// the shared delta clock, (2) append to the ring and broadcast, (3)
    /// swap the graph, (4) bump the generation (invalidating projections).
    /// Steps 1–2 happen under the ring lock so concurrent committers
    /// serialize; the clock is only ever advanced here.
    pub fn commit_graph(&self, fresh: LinkageGraph) -> usize {
        let old = self.graph_arc();
        let t = now_ms();

        // Ring lock taken FIRST: it is the commit-section mutex.
        let mut ring = self.ring.lock().expect("ring lock");
        let seq_start = self.seq.load(Ordering::SeqCst);
        let log = engine_graph::diff::diff(&old, &fresh, t, seq_start);
        let emitted = log.entries.len();
        if emitted > 0 {
            self.seq.store(log.last_seq + 1, Ordering::SeqCst);
            for entry in &log.entries {
                if ring.len() == RING_CAP {
                    ring.pop_front();
                }
                ring.push_back(entry.clone());
                let _ = self.tx.send(StreamEvent {
                    channel: "graph",
                    payload: serde_json::to_value(entry).expect("entry serializes"),
                    seq: entry.seq,
                });
            }
        }
        *self.graph.write().expect("graph lock") = Arc::new(fresh);
        self.generation.fetch_add(1, Ordering::SeqCst);
        drop(ring);
        emitted
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

/// Constant-time byte comparison (audit low rider): the bearer check must
/// not leak prefix length through timing, loopback or not.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// Write the discovery file (rag's pattern, contract §1).
pub fn write_service_json(state: &AppState, port: u16) -> std::io::Result<PathBuf> {
    let dir = engine_store::engine_data_dir(&state.root.join(".vault"));
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

/// Build the application state for a workspace root.
pub fn build_state(root: PathBuf) -> Arc<AppState> {
    let scope = ScopeRef::Worktree {
        path: root.to_string_lossy().replace('\\', "/"),
    };
    let store = engine_store::Store::open(&root.join(".vault"))
        .unwrap_or_else(|e| panic!("engine store unavailable: {e}"));
    let (tx, _) = broadcast::channel(1024);
    // Token: stable-enough randomness without a rand dependency.
    let bearer = engine_model::content_hash(
        format!("{}:{:?}", std::process::id(), std::time::SystemTime::now()).as_bytes(),
    );
    Arc::new(AppState {
        root,
        scope,
        graph: RwLock::new(Arc::new(LinkageGraph::new())),
        store: Mutex::new(store),
        seq: AtomicU64::new(0),
        ring: Mutex::new(VecDeque::new()),
        tx,
        bearer,
        meta_cache: Mutex::new(None),
        generation: AtomicU64::new(0),
        watcher: Mutex::new(None),
    })
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
        // the stale edge, and the old→new diff must carry the removal.
        let (dir, state) = fixture_state();
        let first = state.rebuild_and_swap().unwrap();
        assert!(first > 0, "initial build emits adds");
        let edges_before = state.graph_arc().edge_count();
        assert_eq!(edges_before, 2, "path + wiki mention");

        // Edit: the path mention disappears.
        std::fs::write(
            dir.path().join(".vault/plan/2026-06-12-w-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#w'\n---\n\nOnly [[2026-06-12-w-adr]] remains.\n",
        )
        .unwrap();
        let emitted = state.rebuild_and_swap().unwrap();
        assert!(emitted > 0, "edit emits deltas");
        assert_eq!(
            state.graph_arc().edge_count(),
            1,
            "stale edge pruned: live graph converges to the cold rebuild"
        );

        // The clock is monotonic across rebuilds and the ring holds both
        // batches in order.
        let ring = state.ring.lock().unwrap();
        let seqs: Vec<u64> = ring.iter().map(|e| e.seq).collect();
        assert!(seqs.windows(2).all(|w| w[1] > w[0]));
    }

    #[test]
    fn meta_edges_are_memoized_per_generation() {
        let (_dir, state) = fixture_state();
        state.rebuild_and_swap().unwrap();
        let a = state.meta_edges();
        let b = state.meta_edges();
        assert!(Arc::ptr_eq(&a, &b), "same generation: cached (W02P05-203)");
        let _ = state.rebuild_and_swap();
        let c = state.meta_edges();
        // New generation recomputes (pointer may differ even if equal).
        assert_eq!(*a, *c, "content equal across no-op rebuild");
    }
}
