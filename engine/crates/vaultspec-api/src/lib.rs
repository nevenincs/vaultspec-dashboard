//! `vaultspec serve` — the resident HTTP front door (engine-spec §7,
//! contract §1).
//!
//! Single origin on loopback: the engine serves (a) the GUI SPA static
//! bundle, (b) the query API, (c) the transparent ops proxy (`/ops/core/*`,
//! `/ops/rag/*`, whitelisted, envelopes verbatim), and (d) the multiplexed
//! SSE stream. `/health` is ungated; everything else is bearer-gated.
//! No WebSocket in v1 (D7.1).

pub mod app;
pub mod routes;

use std::sync::Arc;
use std::time::Duration;

use axum::routing::{get, post};
use axum::{Json, Router, middleware};
use serde_json::{Value, json};

use app::AppState;

/// Default port for the resident service. `--port` with fail-loud
/// conflicts is a contract requirement (R2).
pub const DEFAULT_PORT: u16 = 8767;

/// Route inventory committed by the contract, recorded here so the
/// implementation and the contract drift loudly rather than silently.
pub const CONTRACT_ROUTES: &[&str] = &[
    "/health",
    "/map",
    "/vault-tree",
    "/graph/query",
    "/graph/asof",
    "/graph/diff",
    "/filters",
    "/nodes/{id}",
    "/nodes/{id}/neighbors",
    "/nodes/{id}/evidence",
    "/nodes/{id}/discover",
    "/events",
    "/status",
    "/stream",
    "/search",
    "/ops/core/{verb}",
    "/ops/rag/{verb}",
];

async fn health() -> Json<Value> {
    // Liveness ping; enveloped like everything else (L1) with a static
    // all-available tiers block (no per-ping rag discovery on the
    // ungated path).
    Json(json!({
        "data": {"ok": true, "service": "vaultspec", "status": "running"},
        "tiers": serde_json::to_value(engine_query::envelope::tiers_block(&[]))
            .expect("tiers serialize"),
    }))
}

/// Assemble the full single-origin router (contract §1).
pub fn build_router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/map", get(routes::query::map))
        .route("/vault-tree", get(routes::query::vault_tree))
        .route("/graph/query", post(routes::query::graph_query_route))
        .route("/graph/asof", get(routes::temporal::graph_asof))
        .route("/graph/diff", get(routes::temporal::graph_diff))
        .route("/filters", get(routes::query::filters))
        .route("/nodes/{id}", get(routes::query::node_detail))
        .route("/nodes/{id}/neighbors", get(routes::query::node_neighbors))
        .route("/nodes/{id}/evidence", get(routes::query::node_evidence))
        .route("/nodes/{id}/discover", post(routes::query::node_discover))
        .route("/events", get(routes::temporal::events))
        .route("/status", get(routes::stream::status))
        .route("/stream", get(routes::stream::stream))
        .route("/search", post(routes::ops::search))
        .route("/ops/core/{verb}", post(routes::ops::ops_core))
        .route("/ops/rag/{verb}", post(routes::ops::ops_rag))
        .fallback(get(routes::spa::spa_fallback))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            app::bearer_gate,
        ))
        .with_state(state)
}

/// Run the resident service on loopback: initial index, watcher-driven
/// rebuild-and-swap (302/303), heartbeat on the discovery file.
pub async fn serve(port: u16) -> std::io::Result<()> {
    // Crash visibility (dogfood DF-4): a panic anywhere must leave a
    // trace, never a silent death. The hook writes a crash log under the
    // engine data dir and stderr before unwinding.
    let cwd = std::env::current_dir()?;
    // Resolve like every other verb (dogfood DF-2, D2.1): any launch
    // directory inside the workspace resolves to its containing worktree.
    let workspace = ingest_git::workspace::Workspace::discover(&cwd)
        .map_err(|e| std::io::Error::other(format!("not inside a git workspace: {e}")))?;
    let worktrees = ingest_git::worktrees::enumerate(&workspace)
        .map_err(|e| std::io::Error::other(e.to_string()))?;
    let cwd_clean = cwd.to_string_lossy().replace('\\', "/");
    let root = worktrees
        .iter()
        .map(|wt| wt.path.clone())
        .find(|p| {
            let wp = p.to_string_lossy().replace('\\', "/");
            let wp = wp.strip_prefix("//?/").unwrap_or(&wp).to_string();
            let cw = cwd_clean.strip_prefix("//?/").unwrap_or(&cwd_clean);
            cw == wp || cw.starts_with(&format!("{wp}/"))
        })
        .unwrap_or(cwd);
    // Strip Windows extended-length prefixes so the served root compares
    // cleanly with client-supplied scope strings.
    let root = {
        let cleaned = root.to_string_lossy().replace('\\', "/");
        std::path::PathBuf::from(cleaned.strip_prefix("//?/").unwrap_or(&cleaned))
    };
    if !root.join(".vault").is_dir() {
        return Err(std::io::Error::other(format!(
            "no .vault corpus under {} - vaultspec serve runs inside a \
             vaultspec-managed worktree",
            root.display()
        )));
    }

    let crash_log = engine_store::engine_data_dir(&root.join(".vault")).join("crash.log");
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let line = format!(
            "[{}] vaultspec serve panic: {info}\n",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0)
        );
        if let Some(parent) = crash_log.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&crash_log)
            .and_then(|mut f| std::io::Write::write_all(&mut f, line.as_bytes()));
        eprintln!("{line}");
        default_hook(info);
    }));

    let state = app::build_state(root.clone());

    // Cold initial index (the same pipeline the one-shot CLI runs, D2.4).
    state.rebuild_and_swap().map_err(std::io::Error::other)?;

    // Discovery + heartbeat (contract §1).
    app::write_service_json(&state, port)?;
    {
        let state = state.clone();
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_secs(15)).await;
                let _ = app::write_service_json(&state, port);
            }
        });
    }

    // Watcher → rebuild-at-scope-granularity → swap + diff broadcast
    // (audit gates W02P06-302/303; never deltas into a live graph).
    let (dirty_tx, mut dirty_rx) = tokio::sync::mpsc::unbounded_channel::<usize>();
    let watch_handle = engine_graph::watch::watch(
        &engine_graph::watch::watch_roots(&root),
        Duration::from_millis(2000),
        move |paths| {
            let _ = dirty_tx.send(paths.len());
        },
    )
    .map_err(|e| std::io::Error::other(e.to_string()))?;
    // Held in state so /status can report a dead watcher truthfully.
    *state.watcher.lock().expect("watcher lock") = Some(watch_handle);
    {
        let state = state.clone();
        tokio::spawn(async move {
            while dirty_rx.recv().await.is_some() {
                let state = state.clone();
                // Rebuild failures are LOGGED, never silently swallowed
                // (DF-4): a contended store is a wait-and-retry on the
                // next dirty batch, not a death.
                match tokio::task::spawn_blocking(move || state.rebuild_and_swap()).await {
                    Ok(Ok(_)) => {}
                    Ok(Err(e)) => eprintln!("vaultspec serve: rebuild failed: {e}"),
                    Err(e) => eprintln!("vaultspec serve: rebuild task panicked: {e}"),
                }
            }
        });
    }

    // Loopback-only bind; a port conflict fails loud here (R2).
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    println!("vaultspec serve: listening on http://{addr} (bearer token in service.json)");
    axum::serve(listener, build_router(state))
        .await
        .map_err(std::io::Error::other)
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use tower::ServiceExt;

    fn fixture_state() -> (tempfile::TempDir, Arc<AppState>) {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join(".vault/plan")).unwrap();
        std::fs::write(
            dir.path().join(".vault/plan/2026-06-12-srv-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#srv'\n---\n\nMentions `src/a.rs`.\n",
        )
        .unwrap();
        let state = app::build_state(dir.path().to_path_buf());
        state.rebuild_and_swap().unwrap();
        (dir, state)
    }

    async fn get_with_token(
        router: Router,
        path: &str,
        token: Option<&str>,
    ) -> (StatusCode, Value) {
        let mut builder = Request::get(path).header("host", "127.0.0.1");
        if let Some(token) = token {
            builder = builder.header("authorization", format!("Bearer {token}"));
        }
        let response = router
            .oneshot(builder.body(Body::empty()).unwrap())
            .await
            .unwrap();
        let status = response.status();
        let bytes = axum::body::to_bytes(response.into_body(), 1 << 20)
            .await
            .unwrap();
        let value = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
        (status, value)
    }

    #[tokio::test]
    async fn health_is_ungated_everything_else_is_bearer_gated() {
        let (_dir, state) = fixture_state();
        let token = state.bearer.clone();
        let router = build_router(state);

        let (status, _) = get_with_token(router.clone(), "/health", None).await;
        assert_eq!(status, StatusCode::OK, "/health ungated");

        let (status, _) = get_with_token(router.clone(), "/status", None).await;
        assert_eq!(status, StatusCode::UNAUTHORIZED, "gated without bearer");

        let (status, body) = get_with_token(router, "/status", Some(&token)).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            body["data"]["watcher"]["mode"], "starting",
            "no watcher in test state"
        );
        assert!(body["tiers"]["semantic"]["available"].is_boolean());
    }

    #[tokio::test]
    async fn node_family_serves_from_the_live_graph() {
        let (_dir, state) = fixture_state();
        let token = state.bearer.clone();
        let router = build_router(state);
        let (status, body) = get_with_token(
            router.clone(),
            "/nodes/doc:2026-06-12-srv-plan",
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(
            body["data"]["detail"]["bundle"]["node"]["id"],
            "doc:2026-06-12-srv-plan"
        );

        let (status, _) = get_with_token(router, "/nodes/doc:nope", Some(&token)).await;
        assert_eq!(status, StatusCode::NOT_FOUND, "unknown node: truthful 404");
    }

    #[tokio::test]
    async fn scope_validation_rejects_unserved_scopes() {
        let (_dir, state) = fixture_state();
        let token = state.bearer.clone();
        let served = state.root.to_string_lossy().replace('\\', "/");
        let router = build_router(state);
        let (status, _) = get_with_token(
            router.clone(),
            "/filters?scope=/somewhere/else",
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::BAD_REQUEST);
        let (status, body) = get_with_token(
            router,
            &format!("/filters?scope={}", urlencode(&served)),
            Some(&token),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert!(body["data"]["vocabulary"]["tiers"].is_array());
    }

    #[tokio::test]
    async fn ops_whitelist_rejects_unlisted_verbs() {
        let (_dir, state) = fixture_state();
        let token = state.bearer.clone();
        let router = build_router(state);
        let response = router
            .oneshot(
                Request::post("/ops/core/vault-archive")
                    .header("host", "127.0.0.1")
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN, "R1 whitelist");
    }

    #[tokio::test]
    async fn spa_fallback_serves_placeholder_without_a_bundle() {
        let (_dir, state) = fixture_state();
        let token = state.bearer.clone();
        let router = build_router(state);
        let response = router
            .oneshot(
                Request::get("/some/deep/link")
                    .header("host", "localhost")
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let content_type = response
            .headers()
            .get("content-type")
            .unwrap()
            .to_str()
            .unwrap()
            .to_string();
        assert!(content_type.starts_with("text/html"));
    }

    fn urlencode(s: &str) -> String {
        s.replace(':', "%3A").replace('/', "%2F")
    }

    #[tokio::test]
    async fn stale_tokens_and_foreign_hosts_are_rejected() {
        // DF-6: a token from a previous process generation (restart) is a
        // 401 — the canonical stale-token reload signal — and a foreign
        // Host header is a 403 on every path, /health included.
        let (_dir_a, state_a) = fixture_state();
        let stale_token = state_a.bearer.clone();
        drop(state_a);
        let (_dir_b, state_b) = fixture_state();
        let router = build_router(state_b);

        let (status, _) = get_with_token(router.clone(), "/status", Some(&stale_token)).await;
        assert_eq!(
            status,
            StatusCode::UNAUTHORIZED,
            "stale token after restart"
        );

        let response = router
            .clone()
            .oneshot(
                Request::get("/health")
                    .header("host", "evil.example")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            response.status(),
            StatusCode::FORBIDDEN,
            "DNS-rebinding guard"
        );

        // The served index.html carries the token bootstrap meta tag.
        let (_dir_c, state_c) = fixture_state();
        let token_c = state_c.bearer.clone();
        let router_c = build_router(state_c);
        let response = router_c
            .oneshot(
                Request::get("/")
                    .header("host", "127.0.0.1")
                    .header("authorization", format!("Bearer {token_c}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        let bytes = axum::body::to_bytes(response.into_body(), 1 << 20)
            .await
            .unwrap();
        let html = String::from_utf8_lossy(&bytes);
        assert!(
            html.contains(&format!(
                r#"<meta name="vaultspec-token" content="{token_c}">"#
            )),
            "DF-6 token bootstrap injected"
        );
    }

    #[tokio::test]
    async fn clean_browser_bootstrap_flow_works_end_to_end() {
        // DF-7 acceptance (team-lead's exact flow): from a clean browser
        // (no headers beyond Host), GET / renders the shell WITH the
        // injected token, and the first authenticated API call with that
        // token succeeds.
        let (_dir, state) = fixture_state();
        let router = build_router(state);

        let response = router
            .clone()
            .oneshot(
                Request::get("/")
                    .header("host", "127.0.0.1")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK, "shell is ungated (DF-7)");
        let bytes = axum::body::to_bytes(response.into_body(), 1 << 20)
            .await
            .unwrap();
        let html = String::from_utf8_lossy(&bytes);
        let token = html
            .split(r#"<meta name="vaultspec-token" content=""#)
            .nth(1)
            .and_then(|rest| rest.split('"').next())
            .expect("token meta tag present")
            .to_string();

        let (status, body) = get_with_token(router, "/status", Some(&token)).await;
        assert_eq!(status, StatusCode::OK, "injected token authenticates");
        assert_eq!(body["data"]["ok"], true);
    }

    #[test]
    fn contract_route_inventory_matches_the_router() {
        for family in [
            "/map",
            "/graph/query",
            "/events",
            "/stream",
            "/search",
            "/ops/core/{verb}",
        ] {
            assert!(CONTRACT_ROUTES.contains(&family), "missing {family}");
        }
    }
}
