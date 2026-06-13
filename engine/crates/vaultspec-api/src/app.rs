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
    /// Recent deltas for `since=` resume; bounded. Stored as
    /// `(seq, payload)` so BOTH granularity species (document + the
    /// feature/meta-edge projection) ride one resume buffer on the single
    /// clock (constellation-live-delta ADR / S50): `since=` replays across
    /// both, application is per-granularity client-side.
    pub ring: Mutex<VecDeque<(u64, serde_json::Value)>>,
    pub tx: broadcast::Sender<StreamEvent>,
    pub bearer: String,
    /// Memoized constellation meta-edges per graph generation (audit
    /// W02P05-203).
    pub meta_cache: Mutex<Option<(u64, Arc<Vec<MetaEdge>>)>>,
    pub generation: AtomicU64,
    /// The resident watcher handle; `/status` reports a dead watcher
    /// truthfully instead of claiming residency (DF-4 residual).
    pub watcher: Mutex<Option<engine_graph::watch::WatchHandle>>,
    /// Declared-tier ingestion status from the last rebuild: `None` when
    /// core's graph was ingested, `Some(reason)` when core was unreachable.
    /// The tiers block reads this so `declared` degrades TRUTHFULLY instead
    /// of claiming a tier the index could not build.
    pub declared_status: RwLock<Option<String>>,
}

pub const RING_CAP: usize = 4096;

impl AppState {
    pub fn graph_arc(&self) -> Arc<LinkageGraph> {
        // Poison recovery (robustness H2): a panic while another guard was held
        // poisons the lock. Paired with the CatchPanicLayer, we recover the
        // inner value instead of re-panicking, so one transient panic cannot
        // cascade into a permanent total outage on every subsequent request.
        self.graph
            .read()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
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
    pub fn rebuild_and_swap(&self) -> Result<usize, String> {
        let store = self.store.lock().map_err(|_| "store lock".to_string())?;
        let (fresh, stats) =
            engine_graph::index::index_worktree(&self.root, &self.scope, &store, now_ms())
                .map_err(|e| e.to_string())?;
        drop(store);
        // Record the declared-tier ingestion result so the tiers block can
        // degrade truthfully when core was unreachable this rebuild.
        if let Ok(mut status) = self.declared_status.write() {
            *status = stats.declared_unavailable;
        }
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
                None => eprintln!(
                    "vaultspec serve: dropping feature delta with no seq: {entry}"
                ),
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
    // and attach the truthful tiers block.
    let original = String::from_utf8_lossy(&bytes);
    let message = if original.trim().is_empty() {
        status.canonical_reason().unwrap_or("error").to_string()
    } else {
        original.into_owned()
    };
    let envelope =
        serde_json::json!({ "error": message, "tiers": crate::routes::query_tiers(&state) });
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
    // The cache is pure, deletable, fully re-derivable (D8.1): a corrupt or
    // unopenable `engine.sqlite3` (e.g. a stale WAL after a hard kill) must
    // not take the service down at boot — self-heal by recreating it. Only a
    // schema-version mismatch (intentionally fail-loud, D5.1) or a
    // recreate-also-failed condition still aborts.
    let store = engine_store::Store::open_or_heal(&root.join(".vault"))
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
        declared_status: RwLock::new(None),
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
        let seqs: Vec<u64> = ring.iter().map(|(seq, _)| *seq).collect();
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
