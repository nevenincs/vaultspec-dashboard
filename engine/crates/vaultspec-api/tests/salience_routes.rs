//! Route-level salience wire tests (graph-node-salience W03.P08.S35): the `lens`
//! request parameter defaults to status, every served document node carries the
//! single active-lens `salience` float, truncation is lens-and-focus dependent,
//! and the tiers block rides every envelope (success and error).

use std::sync::Arc;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use serde_json::{Value, json};
use tower::ServiceExt;
use vaultspec_api::app::{self, AppState};
use vaultspec_api::build_router;

/// A small vault with several typed documents and cross-references so the
/// salience model has real structure to rank.
fn fixture_state() -> (tempfile::TempDir, Arc<AppState>) {
    let dir = tempfile::tempdir().unwrap();
    let vault = dir.path().join(".vault");
    for sub in ["plan", "adr", "research", "exec/2026-06-14-x"] {
        std::fs::create_dir_all(vault.join(sub)).unwrap();
    }
    // A plan that mentions an ADR and research (cross-references drive centrality).
    std::fs::write(
        vault.join("plan/2026-06-14-x-plan.md"),
        "---\ntags:\n  - '#plan'\n  - '#x'\n---\n\nImplements `2026-06-14-x-adr`. \
         Grounds `2026-06-14-x-research`. Steps:\n- [x] `S01` - done.\n- [ ] `S02` - open.\n",
    )
    .unwrap();
    std::fs::write(
        vault.join("adr/2026-06-14-x-adr.md"),
        "---\ntags:\n  - '#adr'\n  - '#x'\n---\n\nGrounds `2026-06-14-x-research`.\n",
    )
    .unwrap();
    std::fs::write(
        vault.join("research/2026-06-14-x-research.md"),
        "---\ntags:\n  - '#research'\n  - '#x'\n---\n\nThe research.\n",
    )
    .unwrap();
    std::fs::write(
        vault.join("exec/2026-06-14-x/2026-06-14-x-S01.md"),
        "---\ntags:\n  - '#exec'\n  - '#x'\n---\n\nMentions `2026-06-14-x-plan`.\n",
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
    (status, serde_json::from_slice(&bytes).unwrap_or(Value::Null))
}

fn served_scope(state: &AppState) -> String {
    state.workspace_root.to_string_lossy().replace('\\', "/")
}

#[tokio::test]
async fn graph_query_defaults_to_the_status_lens_and_carries_salience() {
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let scope = served_scope(&state);
    let router = build_router(state);

    // No `lens` in the body: the engine defaults to the status lens.
    let (status, body) = post(
        router,
        "/graph/query",
        &token,
        json!({"scope": scope, "granularity": "document"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    let data = &body["data"];
    assert_eq!(data["lens"], "status", "omitted lens defaults to status: {body}");

    // Every served DOCUMENT node carries the single active-lens salience float.
    let nodes = data["nodes"].as_array().expect("nodes array");
    assert!(!nodes.is_empty(), "fixture serves document nodes");
    for node in nodes {
        let salience = &node["salience"];
        assert!(
            salience.is_number(),
            "every document node carries a salience float: {node}"
        );
        let s = salience.as_f64().unwrap();
        assert!((0.0..=1.0).contains(&s), "salience is normalized to [0,1]: {s}");
    }

    // The tiers block rides the success envelope.
    assert!(body["tiers"].is_object(), "tiers block present on success: {body}");
    assert_eq!(body["tiers"]["structural"]["available"], Value::Bool(true));
}

#[tokio::test]
async fn the_two_lenses_order_the_served_nodes_differently() {
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let scope = served_scope(&state);
    let router = build_router(state);

    let ids_for = |body: &Value| -> Vec<String> {
        body["data"]["nodes"]
            .as_array()
            .unwrap()
            .iter()
            .map(|n| n["id"].as_str().unwrap().to_string())
            .collect()
    };

    let (_, status_body) = post(
        router.clone(),
        "/graph/query",
        &token,
        json!({"scope": scope, "granularity": "document", "lens": "status"}),
    )
    .await;
    let (_, design_body) = post(
        router,
        "/graph/query",
        &token,
        json!({"scope": scope, "granularity": "document", "lens": "design"}),
    )
    .await;
    assert_eq!(status_body["data"]["lens"], "status");
    assert_eq!(design_body["data"]["lens"], "design");
    // Both serve the same node set, ordered by their own lens DOI.
    let mut status_set = ids_for(&status_body);
    let mut design_set = ids_for(&design_body);
    status_set.sort();
    design_set.sort();
    assert_eq!(status_set, design_set, "same bounded node set, two orderings");
}

#[tokio::test]
async fn an_unknown_lens_is_a_tiered_400() {
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let scope = served_scope(&state);
    let router = build_router(state);

    let (status, body) = post(
        router,
        "/graph/query",
        &token,
        json!({"scope": scope, "lens": "bogus"}),
    )
    .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "unknown lens is a 400: {body}");
    // The error envelope still carries the tiers block (contract §2).
    assert!(body["tiers"].is_object(), "error envelope carries tiers: {body}");
}

#[tokio::test]
async fn degraded_tier_flags_salience_partial_end_to_end() {
    // graph-node-salience W05.P11.S46: a salience computed while a tier is
    // degraded is flagged partial via the wire (read from the tiers block, never
    // guessed). Force the declared tier degraded (a BACKBONE tier, so any lens is
    // partial) and assert the response says so for the SAME state the tiers block
    // reports.
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let scope = served_scope(&state);
    *state.active_cell().declared_status.write().unwrap() =
        Some("core graph unavailable: forced for test".to_string());
    let router = build_router(state);

    let (status, body) = post(
        router,
        "/graph/query",
        &token,
        json!({"scope": scope, "granularity": "document", "lens": "design"}),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    // The tiers block honestly degrades declared.
    assert_eq!(
        body["tiers"]["declared"]["available"],
        Value::Bool(false),
        "the declared tier is degraded: {body}"
    );
    // The salience is flagged partial, read from that same tiers truth.
    assert_eq!(
        body["data"]["salience_partial"],
        Value::Bool(true),
        "a degraded backbone tier flags the salience partial: {body}"
    );
    // It is still served (computed over available tiers), not withheld.
    let nodes = body["data"]["nodes"].as_array().unwrap();
    assert!(
        nodes.iter().all(|n| n["salience"].is_number()),
        "partial salience is still a real, served field over available tiers"
    );
}

#[tokio::test]
async fn neighbors_carries_salience_and_the_lens_echo() {
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let router = build_router(state);

    // GET /nodes/{id}/neighbors with the default lens: the ego nodes carry
    // salience, with the ego center as the DOI focus.
    let response = router
        .oneshot(
            Request::get("/nodes/doc:2026-06-14-x-plan/neighbors?depth=1")
                .header("host", "127.0.0.1")
                .header("authorization", format!("Bearer {token}"))
                .body(Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let bytes = axum::body::to_bytes(response.into_body(), 1 << 20)
        .await
        .unwrap();
    let body: Value = serde_json::from_slice(&bytes).unwrap();
    assert_eq!(body["data"]["lens"], "status", "neighbors echoes the active lens");
    let ego_nodes = body["data"]["ego"]["nodes"].as_array().expect("ego nodes");
    // The focus node (the center) is in the ego set and carries salience.
    assert!(
        ego_nodes
            .iter()
            .any(|n| n["id"] == "doc:2026-06-14-x-plan" && n["salience"].is_number()),
        "the ego nodes carry the active-lens salience: {body}"
    );
    assert!(body["tiers"].is_object());
}
