//! Route-level wire tests for the HTTP search path (rag-integration-hardening
//! D1/D2): `/search` now rides the resident rag service over the bounded
//! `rag-client` loopback transport instead of a per-query CLI spawn. These tests
//! exercise the full router boundary WITHOUT a live rag, so they assert exactly
//! the behavior that does not depend on rag being present: every user-controlled
//! argument is bounded to a tiers-carrying 400 BEFORE discovery, and a valid
//! query always returns a tiers-carrying 200 whose `results` is an array — search
//! is a degradable surface, never a hard 5xx. The rag-down tier-parity path lives
//! in `declared_tier_parity.rs`; the annotation and shape-miss contracts are pure
//! functions covered in the `ops.rs` test module; the live success chain is the
//! rag-gated test (P04).

use std::sync::Arc;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use serde_json::{Value, json};
use tower::ServiceExt;
use vaultspec_api::app::{self, AppState};
use vaultspec_api::build_router;

fn fixture_state() -> (tempfile::TempDir, Arc<AppState>) {
    let dir = tempfile::tempdir().unwrap();
    let vault = dir.path().join(".vault/plan");
    std::fs::create_dir_all(&vault).unwrap();
    std::fs::write(
        vault.join("2026-06-12-srv-plan.md"),
        "---\ntags:\n  - '#plan'\n  - '#srv'\n---\n\nMentions `src/a.rs`.\n",
    )
    .unwrap();
    let state = app::build_state(dir.path().to_path_buf());
    (dir, state)
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

/// A request-bound rejection must be a tiers-carrying 400 raised BEFORE any rag
/// contact — the API is a public boundary and must reject unbounded external
/// callers regardless of whether rag is running.
async fn assert_tiered_400(body: Value) {
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let router = build_router(state);
    let (status, envelope) = post(router, "/search", &token, body).await;
    assert_eq!(
        status,
        StatusCode::BAD_REQUEST,
        "an out-of-bounds search argument is a 400: {envelope}"
    );
    assert!(
        envelope["tiers"].is_object(),
        "the error envelope still carries the tiers block (contract §2): {envelope}"
    );
}

#[tokio::test]
async fn an_empty_query_is_a_tiered_400() {
    assert_tiered_400(json!({"query": "   "})).await;
}

#[tokio::test]
async fn an_overlong_query_is_a_tiered_400() {
    // The query ceiling is 512 chars; 513 must be rejected before rag is reached.
    assert_tiered_400(json!({"query": "x".repeat(513)})).await;
}

#[tokio::test]
async fn an_unknown_target_is_a_tiered_400() {
    // The engine target vocabulary is {vault, code}; anything else is rejected
    // before it can be mapped to rag's type.
    assert_tiered_400(json!({"query": "graph", "type": "sideways"})).await;
}

#[tokio::test]
async fn max_results_over_the_ceiling_is_a_tiered_400() {
    // The result ceiling is 50; a caller asking for more is rejected before the
    // top_k reaches rag.
    assert_tiered_400(json!({"query": "graph", "max_results": 9999})).await;
}

#[tokio::test]
async fn search_is_a_degradable_surface_always_tiered_200_with_a_results_array() {
    // A VALID query always returns a tiers-carrying 200 whose `results` is an
    // array — whether rag is absent (empty results + degraded semantic tier) or
    // present (hits + available semantic tier). Search is never a hard 5xx, and
    // the client always reads its state from the tiers block. This holds
    // regardless of the ambient rag state on the test machine.
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let router = build_router(state);

    let (status, body) = post(router, "/search", &token, json!({"query": "graph"})).await;
    assert_eq!(
        status,
        StatusCode::OK,
        "a valid search never hard-fails: {body}"
    );
    assert!(
        body["tiers"]["semantic"].is_object(),
        "the semantic tier rides every search envelope: {body}"
    );
    assert!(
        body["data"]["results"].is_array(),
        "results is always an array, never absent or a scalar: {body}"
    );
}
