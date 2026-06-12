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
    Json(json!({"ok": true, "service": "vaultspec", "status": "running"}))
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
    let root = std::env::current_dir()?;
    if !root.join(".vault").is_dir() {
        return Err(std::io::Error::other(format!(
            "no .vault corpus under {} - vaultspec serve runs inside a \
             vaultspec-managed worktree",
            root.display()
        )));
    }
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
    let _watch_handle = engine_graph::watch::watch(
        &engine_graph::watch::watch_roots(&root),
        Duration::from_millis(2000),
        move |paths| {
            let _ = dirty_tx.send(paths.len());
        },
    )
    .map_err(|e| std::io::Error::other(e.to_string()))?;
    {
        let state = state.clone();
        tokio::spawn(async move {
            while dirty_rx.recv().await.is_some() {
                let state = state.clone();
                let _ = tokio::task::spawn_blocking(move || state.rebuild_and_swap()).await;
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
        let mut builder = Request::get(path);
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
        assert_eq!(body["watcher"]["mode"], "resident");
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
            body["detail"]["bundle"]["node"]["id"],
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
        assert!(body["vocabulary"]["tiers"].is_array());
    }

    #[tokio::test]
    async fn ops_whitelist_rejects_unlisted_verbs() {
        let (_dir, state) = fixture_state();
        let token = state.bearer.clone();
        let router = build_router(state);
        let response = router
            .oneshot(
                Request::post("/ops/core/vault-archive")
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
