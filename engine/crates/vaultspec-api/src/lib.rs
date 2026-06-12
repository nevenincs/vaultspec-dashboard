//! `vaultspec serve` — the resident HTTP front door (engine-spec §7,
//! contract §1).
//!
//! Single origin on loopback: the engine serves (a) the GUI SPA static
//! bundle, (b) the query API, (c) the transparent ops proxy (`/ops/core/*`,
//! `/ops/rag/*`, whitelisted, envelopes verbatim), and (d) the multiplexed
//! SSE stream. `/health` is ungated; everything else is bearer-gated.
//! No WebSocket in v1 (D7.1).

use axum::{Json, Router, routing::get};
use serde_json::{Value, json};

/// Default port for the resident service. Final value is an implementation
/// detail; `--port` with fail-loud conflicts is a contract requirement (R2).
pub const DEFAULT_PORT: u16 = 8767;

/// Route inventory committed by the contract, recorded here so the skeleton
/// and the contract drift loudly rather than silently.
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
    Json(json!({
        "ok": true,
        "service": "vaultspec",
        "status": "foundation-scaffold",
    }))
}

async fn status() -> Json<Value> {
    let report = engine_query::QueryCore::new().status();
    Json(json!({
        "ok": true,
        "nodes": report.node_count,
        "edges": report.edge_count,
        "degradations": report.degradations,
        // Per-response tier degradation block (contract §2) — truthful from
        // day one: nothing is implemented yet.
        "tiers": {
            "declared":   { "available": false, "reason": "not yet implemented" },
            "structural": { "available": false, "reason": "not yet implemented" },
            "temporal":   { "available": false, "reason": "not yet implemented" },
            "semantic":   { "available": false, "reason": "not yet implemented" },
        },
    }))
}

/// Build the axum router skeleton. Only `/health` and `/status` answer in
/// the foundation scaffold; the remaining contract families land with the
/// engine implementation.
pub fn build_router() -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/status", get(status))
}

/// Run the resident service on loopback. Binds 127.0.0.1 only (contract §1)
/// and fails loud on port conflict (R2).
pub async fn serve(port: u16) -> std::io::Result<()> {
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    println!("vaultspec serve: listening on http://{addr} (foundation scaffold)");
    axum::serve(listener, build_router())
        .await
        .map_err(std::io::Error::other)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn health_route_answers() {
        use axum::body::Body;
        use axum::http::{Request, StatusCode};
        use tower::ServiceExt;

        let router = build_router();
        let response = router
            .oneshot(Request::get("/health").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
    }

    #[test]
    fn contract_route_inventory_is_complete() {
        // The ops proxy, search, stream, and graph families must all be
        // present in the committed inventory (contract §3–§8).
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
