//! Adversarial repro (Lens A, 2026-06-13): the `declared` tier must reflect
//! ACTUAL core-graph ingestion on EVERY front door (M-D1, M-A3). The shared
//! `query_tiers()` reads `AppState::declared_status`; the `query.rs`
//! `rag_tiers()` helper does NOT — so the 8 query routes that use it
//! (`/map`, `/vault-tree`, `/graph/query` live path, `/filters`, `/nodes/{id}`
//! and its `/neighbors`, `/evidence` success paths) hardcode
//! `declared: {available: true}` even when core was unreachable and the tier
//! genuinely did not ingest. This test contrasts `/status` (honest) against
//! `/vault-tree` (lying) for the SAME state.

use std::sync::Arc;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use serde_json::Value;
use tower::ServiceExt;
use vaultspec_api::app::{self, AppState};
use vaultspec_api::build_router;

fn fixture_state() -> (tempfile::TempDir, Arc<AppState>) {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join(".vault/plan")).unwrap();
    std::fs::write(
        dir.path().join(".vault/plan/2026-06-12-srv-plan.md"),
        "---\ntags:\n  - '#plan'\n  - '#srv'\n---\n\nMentions `src/a.rs`.\n",
    )
    .unwrap();
    // build_state warms + indexes the launch scope's cell eagerly.
    let state = app::build_state(dir.path().to_path_buf());
    (dir, state)
}

async fn get(router: axum::Router, path: &str, token: &str) -> (StatusCode, Value) {
    let response = router
        .oneshot(
            Request::get(path)
                .header("host", "127.0.0.1")
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), 1 << 20)
        .await
        .unwrap();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

async fn post(router: axum::Router, path: &str, token: &str, body: Value) -> (StatusCode, Value) {
    let response = router
        .oneshot(
            Request::post(path)
                .header("host", "127.0.0.1")
                .header("authorization", format!("Bearer {token}"))
                .header("content-type", "application/json")
                .body(Body::from(serde_json::to_vec(&body).unwrap()))
                .unwrap(),
        )
        .await
        .unwrap();
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), 1 << 20)
        .await
        .unwrap();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

fn urlencode(s: &str) -> String {
    s.replace(':', "%3A").replace('/', "%2F")
}

#[tokio::test]
async fn declared_tier_degradation_is_consistent_across_front_doors() {
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let served = state.workspace_root.to_string_lossy().replace('\\', "/");

    // Simulate the real "core unreachable this rebuild" condition on the active
    // scope's cell: the engine records WHY the declared tier could not ingest.
    // This is exactly what `ScopeCell::rebuild_and_swap` writes when
    // `vaultspec-core vault graph` is unavailable (engine-graph index.rs:
    // `declared_unavailable`). The declared status now lives per-scope on the
    // cell (W02.P05).
    *state.active_cell().declared_status.write().unwrap() =
        Some("core graph unavailable: forced for test".to_string());

    let router = build_router(state);

    // /status uses the SHARED `query_tiers()` -> honest: declared degraded.
    let (status, st) = get(router.clone(), "/status", &token).await;
    assert_eq!(status, StatusCode::OK);
    let status_declared = &st["tiers"]["declared"]["available"];
    assert_eq!(
        status_declared,
        &Value::Bool(false),
        "/status honestly degrades the declared tier when core was unreachable: {st}"
    );

    // /vault-tree uses `rag_tiers()` -> should ALSO degrade declared, but
    // does not. M-D1: the declared tier must reflect ACTUAL ingestion on
    // every front door, never hardcoded true.
    let (status, tree) = get(
        router,
        &format!("/vault-tree?scope={}", urlencode(&served)),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let tree_declared = &tree["tiers"]["declared"]["available"];

    // The bug: these two front doors disagree about the SAME tier state.
    assert_eq!(
        tree_declared, status_declared,
        "M-D1/M-A3 VIOLATION: /vault-tree reports declared={tree_declared} while \
         /status reports declared={status_declared} for the SAME unreachable-core \
         state; rag_tiers() ignores declared_status and lies about the declared tier"
    );
}

#[tokio::test]
async fn degrade_paths_keep_the_declared_tier_truthful() {
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    // Core unreachable this rebuild: the declared tier could not ingest. The
    // declared status lives per-scope on the active cell (W02.P05).
    *state.active_cell().declared_status.write().unwrap() =
        Some("core graph unavailable: forced for test".to_string());
    let router = build_router(state);

    // rag is unavailable in the test env, so POST /search takes the rag-down
    // degrade path. That path degrades `semantic` truthfully — and (LENSA-02)
    // must ALSO keep the declared tier truthful, never hardcode it available.
    let (status, body) = post(router, "/search", &token, serde_json::json!({"query": "x"})).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        body["tiers"]["semantic"]["available"],
        Value::Bool(false),
        "the rag-down degrade path degrades semantic: {body}"
    );
    assert_eq!(
        body["tiers"]["declared"]["available"],
        Value::Bool(false),
        "LENSA-02: a degrade path must keep the declared tier truthful when core \
         was unreachable, never hardcode declared:true: {body}"
    );
}
