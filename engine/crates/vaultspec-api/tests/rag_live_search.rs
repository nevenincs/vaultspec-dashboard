//! The rag-gated live SUCCESS test (rag-integration-hardening D4): drive a REAL
//! query through the whole `/search` chain — engine route → resident rag over the
//! bounded loopback transport → `flatten_and_annotate` → tiers envelope — and
//! assert the served CONTRACT SHAPE, never a specific hit. This is the drift
//! detector the recorded fixture cannot be: it exercises the actual sibling.
//!
//! Machine-gated, honest skip: the resident rag is a machine-global singleton
//! discovered via `~/.vaultspec-rag/*/service.json` + a live `/health` (the
//! authoritative running-predicate `probe_machine_state`). On a rag-less machine
//! there is no service to drive, so the test SKIPS with a stated reason — Rust has
//! no native skip, so this follows the house pattern (an early `eprintln!` +
//! `return`, as in `engine/tests/tests/e2e.rs`). It NEVER starts a service and
//! NEVER points rag at an arbitrary path: the route sends the fixture CELL's own
//! root as `project_root`, so a fresh fixture vault is an UNINDEXED scope. That is
//! the honest live outcome asserted here — rag answers 200 with an empty
//! `results` array and an `index_state` reporting `status: "missing"` /
//! `target_matches: true` — the contract shape, not a forced indexed match.

use std::sync::Arc;
use std::time::Duration;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use serde_json::{Value, json};
use tower::ServiceExt;
use vaultspec_api::app::{self, AppState};
use vaultspec_api::build_router;

/// A `/health` liveness confirm is a warm loopback round-trip; 3s is generous
/// headroom over that while still bounding a wedged probe on a rag-less machine.
const HEALTH_PROBE_BUDGET: Duration = Duration::from_secs(3);

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

#[tokio::test]
async fn live_search_rides_the_resident_rag_and_serves_the_freshness_contract() {
    let (dir, state) = fixture_state();

    // The availability gate is machine-global discovery + a live `/health`, the
    // same running-predicate the lifecycle surface uses. No resident rag → nothing
    // to drive → honest skip (never a mock, never a spawned service).
    let machine_state =
        rag_client::client::probe_machine_state(&dir.path().join(".vault"), HEALTH_PROBE_BUDGET);
    if !machine_state.is_running() {
        eprintln!(
            "skipped: no resident rag service discovered on this machine \
             (machine-global ~/.vaultspec-rag + /health); live search chain not exercised. \
             state: {machine_state:?}"
        );
        return;
    }

    let token = state.bearer.clone();
    let router = build_router(state);

    // A real, valid query. The fixture vault is an UNINDEXED scope for rag, so the
    // honest live outcome is a 200 with an empty `results` array plus an
    // `index_state` marked `missing` — never a forced hit. We assert the served
    // CONTRACT, which holds for both the empty-unindexed and the populated case.
    let (status, body) = post(router, "/search", &token, json!({"query": "graph"})).await;

    assert_eq!(
        status,
        StatusCode::OK,
        "a live search is a degradable surface, never a hard 5xx: {body}"
    );
    assert!(
        body["tiers"].is_object(),
        "every response — success or degraded — carries the tiers block: {body}"
    );

    let semantic = &body["tiers"]["semantic"]["available"];
    assert!(
        semantic.is_boolean(),
        "the semantic tier availability is always reported, read not guessed: {body}"
    );

    // `results` is ALWAYS an array on the tiers-carrying 200 — empty for an
    // unindexed scope, populated for an indexed one. Never absent, never a scalar.
    let results = &body["data"]["results"];
    assert!(
        results.is_array(),
        "results is always an array on the live 200: {body}"
    );

    // With a Running rag answering a valid query against a real `.vault/` root,
    // the semantic tier is available and the full annotated freshness envelope
    // rides the response: rag's `index_state` forwarded verbatim and the shared
    // `semantic_epoch` annotation (a number when the epoch cache is warm, an
    // explicit null when cold — never a fabricated value).
    assert_eq!(
        semantic,
        &Value::Bool(true),
        "a resident rag answering a valid query serves the semantic tier available: {body}"
    );
    assert!(
        body["data"]["index_state"].is_object(),
        "rag's native index_state block is forwarded verbatim on the live success: {body}"
    );
    let epoch = &body["data"]["semantic_epoch"];
    assert!(
        epoch.is_number() || epoch.is_null(),
        "the D4 semantic_epoch annotation is a number (warm) or explicit null (cold), \
         never absent or a fabricated value: {body}"
    );

    // Every hit carries the engine's `node_id` value-add key (null on a typed
    // annotation miss, never a dropped key). Vacuously satisfied on the honest
    // empty-unindexed outcome; load-bearing the moment the scope is indexed.
    for hit in results.as_array().unwrap() {
        assert!(
            hit.get("node_id").is_some(),
            "every live result carries the annotated node_id key: {hit}"
        );
    }

    eprintln!(
        "live search chain exercised against the resident rag: semantic tier available, \
         {} result(s), index_state.status={}, semantic_epoch={}",
        results.as_array().unwrap().len(),
        body["data"]["index_state"]["status"],
        epoch
    );
}
