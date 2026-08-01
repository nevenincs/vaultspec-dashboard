//! Feature-coverage wire conformance:
//! `/features?scope=&feature=` serves one feature group's pipeline coverage
//! (present types + newest stems, missing types, eligibility, next step) and
//! `/features?scope=` serves the compact all-features roster — both through the
//! shared envelope with the tiers block, scope-bound like `/filters`. Driven
//! end-to-end through the real router against a real vault worktree, no mocks.

use std::sync::Arc;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use serde_json::Value;
use tower::ServiceExt;
use vaultspec_api::app::{self, AppState};
use vaultspec_api::build_router;

/// A small vault: feature `alpha` has research + adr (adr eligible, plan next),
/// feature `beta` has research only (adr next). Nothing else.
fn fixture_state() -> (tempfile::TempDir, Arc<AppState>) {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    std::fs::create_dir_all(root.join(".vault/research")).unwrap();
    std::fs::create_dir_all(root.join(".vault/adr")).unwrap();
    let doc = |sub: &str, stem: &str, dir_tag: &str, feature: &str| {
        std::fs::write(
            root.join(".vault").join(sub).join(format!("{stem}.md")),
            format!("---\ntags:\n  - '#{dir_tag}'\n  - '#{feature}'\n---\n\nBody.\n"),
        )
        .unwrap();
    };
    doc("research", "2026-07-10-alpha-research", "research", "alpha");
    doc("research", "2026-07-14-alpha-research", "research", "alpha");
    doc("adr", "2026-07-14-alpha-adr", "adr", "alpha");
    doc("research", "2026-07-14-beta-research", "research", "beta");
    let state = app::build_state(root.to_path_buf());
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

fn served_scope(state: &AppState) -> String {
    state.workspace_root.to_string_lossy().replace('\\', "/")
}

fn type_of<'a>(coverage: &'a Value, doc_type: &str) -> &'a Value {
    coverage["types"]
        .as_array()
        .expect("types array")
        .iter()
        .find(|t| t["doc_type"] == doc_type)
        .expect("pipeline type in coverage")
}

#[tokio::test]
async fn features_serves_one_feature_coverage_through_the_shared_envelope() {
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let scope = served_scope(&state);
    let router = build_router(state);

    let (status, body) = get(
        router,
        &format!("/features?scope={scope}&feature=alpha"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(body["tiers"].is_object(), "tiers block rides the response");
    let coverage = &body["data"]["coverage"];
    assert_eq!(coverage["feature"], "alpha");

    // research is present with the NEWEST stem (by date prefix) and a count of 2.
    let research = type_of(coverage, "research");
    assert_eq!(research["present"], true);
    assert_eq!(research["count"], 2);
    assert_eq!(research["newest_stem"], "2026-07-14-alpha-research");

    // adr is present (count 1) and, being present, plan is now eligible.
    assert_eq!(type_of(coverage, "adr")["present"], true);
    assert_eq!(type_of(coverage, "plan")["eligible"], true);
    assert_eq!(type_of(coverage, "plan")["present"], false);

    // exec is reported for coverage but never eligible from this surface.
    let exec = type_of(coverage, "exec");
    assert_eq!(exec["present"], false);
    assert_eq!(exec["eligible"], false);
    assert_eq!(exec["note"], "plan-derived");

    // The advised next step is `plan`; missing types are the rest.
    assert_eq!(coverage["next_step"], "plan");
    let missing: Vec<&str> = coverage["missing"]
        .as_array()
        .unwrap()
        .iter()
        .map(|v| v.as_str().unwrap())
        .collect();
    assert_eq!(missing, vec!["reference", "plan", "exec", "audit"]);
}

#[tokio::test]
async fn features_without_a_feature_serves_the_roster() {
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let scope = served_scope(&state);
    let router = build_router(state);

    let (status, body) = get(router, &format!("/features?scope={scope}"), &token).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(body["tiers"].is_object());
    let roster = body["data"]["roster"].as_array().expect("roster array");

    let alpha = roster.iter().find(|e| e["feature"] == "alpha").unwrap();
    assert_eq!(alpha["doc_count"], 3, "2 research + 1 adr");
    assert_eq!(alpha["types_present"], 2, "research + adr");
    assert_eq!(alpha["next_step"], "plan");

    let beta = roster.iter().find(|e| e["feature"] == "beta").unwrap();
    assert_eq!(beta["doc_count"], 1);
    assert_eq!(beta["types_present"], 1);
    assert_eq!(beta["next_step"], "adr");
}

/// A vault whose features exercise the served roster metadata: `many` has two
/// ADRs a span apart plus two plans (one finished, one part-done), `solo` has a
/// single ADR and a single untouched plan, `bare` has research only.
fn metadata_fixture_state() -> (tempfile::TempDir, Arc<AppState>) {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    for sub in ["research", "adr", "plan"] {
        std::fs::create_dir_all(root.join(".vault").join(sub)).unwrap();
    }
    let write = |sub: &str, stem: &str, front: &str, body: &str| {
        std::fs::write(
            root.join(".vault").join(sub).join(format!("{stem}.md")),
            format!("---\n{front}---\n\n{body}"),
        )
        .unwrap();
    };
    let adr = |stem: &str, feature: &str, date: &str| {
        write(
            "adr",
            stem,
            &format!("tags:\n  - '#adr'\n  - '#{feature}'\ndate: '{date}'\n"),
            "# `f` adr: `t` | (**status:** `accepted`)\n\nbody\n",
        )
    };
    let plan = |stem: &str, feature: &str, steps: &str| {
        write(
            "plan",
            stem,
            &format!("tags:\n  - '#plan'\n  - '#{feature}'\ntier: L1\n"),
            steps,
        )
    };
    adr("2026-03-02-many-adr", "many", "2026-03-02");
    adr("2026-07-20-many-adr", "many", "2026-07-20");
    plan(
        "2026-07-21-many-plan",
        "many",
        "- [x] `S01` - done.\n- [x] `S02` - done.\n",
    );
    plan(
        "2026-07-22-many-plan",
        "many",
        "- [x] `S01` - done.\n- [ ] `S02` - open.\n",
    );
    adr("2026-05-05-solo-adr", "solo", "2026-05-05");
    plan(
        "2026-05-06-solo-plan",
        "solo",
        "- [ ] `S01` - open.\n- [ ] `S02` - open.\n",
    );
    write(
        "research",
        "2026-07-14-bare-research",
        "tags:\n  - '#research'\n  - '#bare'\n",
        "Body.\n",
    );
    let state = app::build_state(root.to_path_buf());
    (dir, state)
}

#[tokio::test]
async fn the_roster_serves_type_counts_plan_state_and_adr_dates_per_feature() {
    // The three metadata fields ride the roster end-to-end through the real
    // router over a real vault: per-type composition counted over the full
    // corpus, the plan-state rollup, and the binding-ADR date span.
    let (_dir, state) = metadata_fixture_state();
    let token = state.bearer.clone();
    let scope = served_scope(&state);
    let router = build_router(state);

    let (status, body) = get(router, &format!("/features?scope={scope}"), &token).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let roster = body["data"]["roster"].as_array().expect("roster array");
    let entry = |feature: &str| {
        roster
            .iter()
            .find(|e| e["feature"] == feature)
            .unwrap_or_else(|| panic!("{feature} in roster: {body}"))
            .clone()
    };

    // `many`: composition counted per type, the span across BOTH ADRs, and a
    // rollup of `in-progress` — one plan is finished but another is not.
    let many = entry("many");
    assert_eq!(
        many["type_counts"],
        serde_json::json!({"adr": 2, "plan": 2})
    );
    assert_eq!(many["doc_count"], 4);
    assert_eq!(many["adr_dates"]["first"], "2026-03-02");
    assert_eq!(many["adr_dates"]["last"], "2026-07-20");
    assert_eq!(many["plan_state"], "in-progress");

    // `solo`: one ADR collapses the span; its only plan has nothing checked.
    let solo = entry("solo");
    assert_eq!(solo["adr_dates"]["first"], "2026-05-05");
    assert_eq!(solo["adr_dates"]["last"], "2026-05-05");
    assert_eq!(solo["plan_state"], "not-started");

    // `bare`: no plan and no ADR, so neither key is on the wire at all —
    // honest absence, never a zero or a guessed status.
    let bare = entry("bare");
    assert_eq!(bare["type_counts"], serde_json::json!({"research": 1}));
    assert!(bare.get("plan_state").is_none(), "{bare}");
    assert!(bare.get("adr_dates").is_none(), "{bare}");

    // The fields are additive: everything the roster served before is unchanged.
    assert_eq!(bare["doc_count"], 1);
    assert_eq!(bare["types_present"], 1);
    assert_eq!(bare["next_step"], "adr");
}

#[tokio::test]
async fn features_for_an_unknown_feature_is_all_missing_never_a_404() {
    // Starting a brand-new feature in the panel reads as all-missing coverage —
    // the "start a new feature" state — not an error.
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let scope = served_scope(&state);
    let router = build_router(state);

    let (status, body) = get(
        router,
        &format!("/features?scope={scope}&feature=brand-new"),
        &token,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let coverage = &body["data"]["coverage"];
    assert_eq!(coverage["feature"], "brand-new");
    assert!(
        coverage["types"]
            .as_array()
            .unwrap()
            .iter()
            .all(|t| t["present"] == false)
    );
    assert_eq!(coverage["next_step"], "research");
    assert_eq!(type_of(coverage, "adr")["eligible"], false);
    assert_eq!(
        type_of(coverage, "adr")["note"],
        "requires-research-or-reference"
    );
}

#[tokio::test]
async fn features_on_an_unknown_scope_400s_with_the_tiers_block() {
    // Scope-bound like `/filters`: an unknown scope 400s honestly, tiers attached.
    let (_dir, state) = fixture_state();
    let token = state.bearer.clone();
    let router = build_router(state);

    let (status, body) = get(router, "/features?scope=/no/such/scope", &token).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
    assert!(
        body["tiers"].is_object(),
        "the error envelope still carries tiers"
    );
}
