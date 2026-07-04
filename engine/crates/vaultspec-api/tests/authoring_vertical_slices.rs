//! End-to-end vertical slices for the mounted authoring backend (W03.P39.S192/S193).
//!
//! Drives the REAL app router over HTTP — through the machine `bearer_gate` and the
//! actor-principal layer, against a real git worktree — no mocks (engine-read-and-
//! infer; real services in integration tests). Covers the exit-gate flow (issue →
//! create → submit → approve → apply → rollback) plus the denial / idempotency /
//! principal matrix.
//!
//! LIVE-CORE HONESTY: the apply leg drives the real `vaultspec-core` via
//! `CoreAdapter::detect()`. This test does NOT fake core — the apply route is driven
//! for real and the receipt is inspected: `child_outcome == "applied"` means a live
//! core was present, otherwise `"failed"` (core unavailable). Both are honest
//! enveloped outcomes; the full applied-write path is additionally covered by the
//! `apply.rs` domain tests (fake adapter). The infra-fault → 503 mapping and the
//! validation-fault → 422 mapping are covered by the `http.rs` unit tests (they are
//! not cleanly wire-triggerable without contriving a corrupt store mid-flight).

use std::path::Path;
use std::sync::Arc;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use serde_json::{Value, json};
use tower::ServiceExt;
use vaultspec_api::app::{self, AppState};
use vaultspec_api::build_router;

const ACTOR_TOKEN_HEADER: &str = "x-authoring-actor-token";
const DOC_PATH: &str = ".vault/plan/e2e-plan.md";
const BASE_BODY: &str = "---\ntags:\n  - '#plan'\n---\n\n# e2e plan\n\nbase body\n";
const NEW_BODY: &str = "---\ntags:\n  - '#plan'\n---\n\n# e2e plan\n\nmaterialized body\n";

fn git(dir: &Path, args: &[&str]) {
    let output = std::process::Command::new("git")
        .current_dir(dir)
        .args(args)
        .env("GIT_AUTHOR_NAME", "f")
        .env("GIT_AUTHOR_EMAIL", "f@t")
        .env("GIT_COMMITTER_NAME", "f")
        .env("GIT_COMMITTER_EMAIL", "f@t")
        .output()
        .expect("git runs");
    assert!(
        output.status.success(),
        "git {args:?}: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

/// The git blob object id of a worktree file (`gix` Sha1 blob hash == the domain's
/// `ingest_struct::reader::blob_oid`), so the client can name a `base_revision` that
/// matches exactly what the backend reads.
fn git_blob(root: &Path, rel: &str) -> String {
    let out = std::process::Command::new("git")
        .current_dir(root)
        .args(["hash-object", rel])
        .output()
        .expect("git hash-object runs");
    assert!(
        out.status.success(),
        "git hash-object: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

/// A real git worktree with a `.vault` corpus + the target plan doc. Returns the
/// state and the doc's `blob:<sha1>` base revision.
fn worktree_state() -> (tempfile::TempDir, Arc<AppState>, String) {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    git(root, &["init", "-b", "main", "."]);
    let doc = root.join(DOC_PATH);
    std::fs::create_dir_all(doc.parent().unwrap()).unwrap();
    std::fs::write(&doc, BASE_BODY).unwrap();
    git(root, &["add", "."]);
    git(root, &["commit", "-m", "fixture"]);
    let base_revision = format!("blob:{}", git_blob(root, DOC_PATH));
    let state = app::build_state(root.to_path_buf());
    (dir, state, base_revision)
}

fn router(state: &Arc<AppState>) -> axum::Router {
    build_router(state.clone())
}

fn pct(segment: &str) -> String {
    segment.replace(':', "%3A")
}

/// Drive one request through the real router. `actor_token` sets the per-principal
/// `x-authoring-actor-token`; the machine `bearer` is always sent.
async fn send(
    router: axum::Router,
    method: &str,
    path: &str,
    bearer: &str,
    actor_token: Option<&str>,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let mut builder = Request::builder()
        .method(method)
        .uri(path)
        .header("host", "127.0.0.1")
        .header("authorization", format!("Bearer {bearer}"));
    if let Some(token) = actor_token {
        builder = builder.header(ACTOR_TOKEN_HEADER, token);
    }
    let request = match body {
        Some(value) => builder
            .header("content-type", "application/json")
            .body(Body::from(value.to_string()))
            .unwrap(),
        None => builder.body(Body::empty()).unwrap(),
    };
    let response = router.oneshot(request).await.unwrap();
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), 1 << 20)
        .await
        .unwrap();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

/// Mint an actor token over the machine-bearer bootstrap route (which also registers
/// the actor active). Returns the raw token the client presents on later commands.
async fn issue_token(state: &Arc<AppState>, bearer: &str, actor_id: &str, kind: &str) -> String {
    let (status, body) = send(
        router(state),
        "POST",
        "/authoring/v1/actor-tokens",
        bearer,
        None,
        Some(json!({ "actor": { "id": actor_id, "kind": kind } })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "token issuance: {body}");
    body["data"]["raw_token"]
        .as_str()
        .expect("issuance returns the raw token once")
        .to_string()
}

fn document(base_revision: &str) -> Value {
    json!({
        "kind": "existing",
        "scope": "worktree",
        "node_id": "doc:e2e-plan",
        "stem": "e2e-plan",
        "path": DOC_PATH,
        "doc_type": "plan",
        "base_revision": base_revision,
    })
}

fn create_body(changeset: &str, idem: &str, base_revision: &str) -> Value {
    json!({
        "api_version": "v1",
        "command": "create_proposal",
        "idempotency_key": idem,
        "payload": {
            "session_id": "session_e2e",
            "changeset_id": changeset,
            "summary": "e2e proposal",
            "operations": [{
                "child_key": "child_1",
                "operation": "replace_body",
                "target": {
                    "document": document(base_revision),
                    "base_revision": base_revision,
                    "current_revision": base_revision,
                },
                "draft": { "mode": "whole_document", "body": NEW_BODY },
            }],
        }
    })
}

fn submit_body(idem: &str, expected_revision: &str) -> Value {
    json!({
        "api_version": "v1",
        "command": "submit_for_review",
        "idempotency_key": idem,
        "payload": { "expected_revision": expected_revision, "summary": "submit e2e" }
    })
}

fn decision_body(proposal_id: &str, approval_id: &str, reviewed_revision: &str) -> Value {
    json!({
        "api_version": "v1",
        "command": "approve",
        "idempotency_key": "idem:decision",
        "payload": {
            "proposal_id": proposal_id,
            "approval_id": approval_id,
            "decision": "approve",
            "reviewed_revision": reviewed_revision,
            "comment": "lgtm",
        }
    })
}

/// Create → submit as `agent`, returning (changeset_id, proposal_id, approval_id,
/// reviewed_revision) for the review/apply legs.
async fn create_and_submit(
    state: &Arc<AppState>,
    bearer: &str,
    agent: &str,
    changeset: &str,
    base: &str,
) -> (String, String, String) {
    let (status, body) = send(
        router(state),
        "POST",
        "/authoring/v1/proposals",
        bearer,
        Some(agent),
        Some(create_body(changeset, "idem:create", base)),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "create: {body}");
    assert_eq!(body["data"]["status"], "draft");
    let revision = body["data"]["changeset_revision"]
        .as_str()
        .expect("create returns the draft revision")
        .to_string();

    let (status, body) = send(
        router(state),
        "POST",
        &format!("/authoring/v1/proposals/{changeset}/submit"),
        bearer,
        Some(agent),
        Some(submit_body("idem:submit", &revision)),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "submit: {body}");
    assert_eq!(body["data"]["status"], "submitted");
    (
        body["data"]["proposal_id"].as_str().unwrap().to_string(),
        body["data"]["approval"]["approval_id"]
            .as_str()
            .unwrap()
            .to_string(),
        body["data"]["reviewed_revision"]
            .as_str()
            .unwrap()
            .to_string(),
    )
}

#[tokio::test]
async fn exit_gate_flow_issue_create_submit_approve_apply_rollback() {
    let (dir, state, base) = worktree_state();
    let _keep = &dir;
    let bearer = state.bearer.clone();

    // 1. Issue tokens: the proposing agent + a DISTINCT human reviewer/applier.
    let agent = issue_token(&state, &bearer, "agent:writer", "agent").await;
    let reviewer = issue_token(&state, &bearer, "human:reviewer", "human").await;

    // 2–3. Create → submit (composes validate + opens the approval server-side).
    let (proposal_id, approval_id, reviewed) =
        create_and_submit(&state, &bearer, &agent, "changeset_e2e", &base).await;
    assert!(proposal_id.starts_with("proposal:"));

    // 4. Approve under the DISTINCT reviewer.
    let (status, body) = send(
        router(&state),
        "POST",
        &format!("/authoring/v1/reviews/{}/decisions", pct(&approval_id)),
        &bearer,
        Some(&reviewer),
        Some(decision_body(&proposal_id, &approval_id, &reviewed)),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "approve: {body}");
    assert_eq!(body["data"]["status"], "decided");
    assert_eq!(body["data"]["approval"]["decision"]["decision"], "approve");

    // 5. Apply (the reviewer, NOT the origin agent). Drives the real core adapter.
    let (status, body) = send(
        router(&state),
        "POST",
        "/authoring/v1/apply-requests",
        &bearer,
        Some(&reviewer),
        Some(json!({
            "api_version": "v1",
            "command": "request_apply",
            "idempotency_key": "idem:apply",
            "payload": { "changeset_id": "changeset_e2e", "approval_id": approval_id, "targets": [] }
        })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "apply is reachable + enveloped: {body}"
    );
    assert!(
        body["tiers"]["semantic"]["available"].is_boolean(),
        "apply rides the tiers envelope"
    );
    assert!(
        body["data"]["receipt"].is_object(),
        "apply records a receipt envelope regardless of core presence: {body}"
    );
    let applied = body["data"]["child_outcome"] == "applied";
    eprintln!(
        "[e2e] apply leg drove a {} vaultspec-core (child_outcome={})",
        if applied { "LIVE" } else { "ABSENT" },
        body["data"]["child_outcome"]
    );

    // 6. Rollback the source. It GENERATES only when the source actually APPLIED
    //    (a live core); with no core the source is `failed`, so rollback is honestly
    //    unavailable — both are correct enveloped outcomes.
    let (status, body) = send(
        router(&state),
        "POST",
        "/authoring/v1/rollback-proposals",
        &bearer,
        Some(&reviewer),
        Some(json!({
            "api_version": "v1",
            "command": "create_rollback",
            "idempotency_key": "idem:rollback",
            "payload": {
                "source_changeset_id": "changeset_e2e",
                "source_children": [{
                    "source_child_key": "child_1",
                    "target": {
                        "document": document(&base),
                        "base_revision": base,
                        "current_revision": base,
                    }
                }],
                "reason": "restore the reviewed preimage"
            }
        })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "rollback is reachable + enveloped: {body}"
    );
    if applied {
        assert_eq!(
            body["data"]["status"], "generated",
            "an applied source rolls back to a new Rollback changeset: {body}"
        );
        assert!(
            body["data"]["rollback_changeset_id"]
                .as_str()
                .unwrap()
                .starts_with("rollback:")
        );
    } else {
        assert_eq!(
            body["data"]["status"], "unavailable",
            "an unapplied source is honestly not rollback-able (no live core): {body}"
        );
    }
}

#[tokio::test]
async fn principal_denials_missing_and_unknown_are_401() {
    let (dir, state, base) = worktree_state();
    let _keep = &dir;
    let bearer = state.bearer.clone();

    // A command with NO actor token → 401 (missing principal), never a 404.
    let (status, body) = send(
        router(&state),
        "POST",
        "/authoring/v1/proposals",
        &bearer,
        None,
        Some(create_body("changeset_noauth", "idem:x", &base)),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::UNAUTHORIZED,
        "no actor token → 401: {body}"
    );

    // Force the store open (issue one token), then an UNKNOWN token → 401.
    let _ = issue_token(&state, &bearer, "agent:writer", "agent").await;
    let (status, body) = send(
        router(&state),
        "POST",
        "/authoring/v1/proposals",
        &bearer,
        Some("deadbeefdeadbeef"),
        Some(create_body("changeset_badauth", "idem:x", &base)),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::UNAUTHORIZED,
        "unknown token → 401: {body}"
    );
}

#[tokio::test]
async fn a_stale_expected_revision_is_a_409() {
    let (dir, state, base) = worktree_state();
    let _keep = &dir;
    let bearer = state.bearer.clone();
    let agent = issue_token(&state, &bearer, "agent:writer", "agent").await;

    let (status, _) = send(
        router(&state),
        "POST",
        "/authoring/v1/proposals",
        &bearer,
        Some(&agent),
        Some(create_body("changeset_stale", "idem:create", &base)),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    // Submit with a valid-but-wrong revision fence → optimistic-concurrency conflict.
    let (status, body) = send(
        router(&state),
        "POST",
        "/authoring/v1/proposals/changeset_stale/submit",
        &bearer,
        Some(&agent),
        Some(submit_body(
            "idem:submit",
            "blob:0000000000000000000000000000000000000000",
        )),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::CONFLICT,
        "stale expected_revision → 409: {body}"
    );
    assert_eq!(body["error_kind"], "authoring_stale_revision");
}

#[tokio::test]
async fn an_idempotent_create_replays_the_same_receipt() {
    let (dir, state, base) = worktree_state();
    let _keep = &dir;
    let bearer = state.bearer.clone();
    let agent = issue_token(&state, &bearer, "agent:writer", "agent").await;

    let (status, first) = send(
        router(&state),
        "POST",
        "/authoring/v1/proposals",
        &bearer,
        Some(&agent),
        Some(create_body("changeset_dup", "idem:dup", &base)),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{first}");

    // Same actor + idempotency key + request → the recorded outcome replays.
    let (status, second) = send(
        router(&state),
        "POST",
        "/authoring/v1/proposals",
        &bearer,
        Some(&agent),
        Some(create_body("changeset_dup", "idem:dup", &base)),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{second}");
    assert_eq!(
        first["data"]["changeset_revision"], second["data"]["changeset_revision"],
        "an idempotent replay returns the same receipt: {second}"
    );
}

#[tokio::test]
async fn an_agent_cannot_self_approve_over_the_wire() {
    let (dir, state, base) = worktree_state();
    let _keep = &dir;
    let bearer = state.bearer.clone();
    let agent = issue_token(&state, &bearer, "agent:writer", "agent").await;

    let (proposal_id, approval_id, reviewed) =
        create_and_submit(&state, &bearer, &agent, "changeset_selfapprove", &base).await;

    // The PROPOSING agent tries to approve its OWN proposal → 200 DENIAL (a value on
    // the success envelope), never a 4xx fault.
    let (status, body) = send(
        router(&state),
        "POST",
        &format!("/authoring/v1/reviews/{}/decisions", pct(&approval_id)),
        &bearer,
        Some(&agent),
        Some(decision_body(&proposal_id, &approval_id, &reviewed)),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "self-approval is a 200 denial: {body}"
    );
    assert_eq!(body["data"]["status"], "denied");
    assert!(
        body["data"]["reason"]
            .as_str()
            .is_some_and(|reason| reason.contains("its own proposal")),
        "the ban names the self-approval: {body}"
    );
}

#[tokio::test]
async fn applying_an_unapproved_changeset_is_a_200_denial() {
    let (dir, state, base) = worktree_state();
    let _keep = &dir;
    let bearer = state.bearer.clone();
    let agent = issue_token(&state, &bearer, "agent:writer", "agent").await;
    let reviewer = issue_token(&state, &bearer, "human:reviewer", "human").await;

    // Create → submit (NeedsReview) but do NOT approve; then apply.
    let (_proposal_id, approval_id, _reviewed) =
        create_and_submit(&state, &bearer, &agent, "changeset_unapproved", &base).await;

    let (status, body) = send(
        router(&state),
        "POST",
        "/authoring/v1/apply-requests",
        &bearer,
        Some(&reviewer),
        Some(json!({
            "api_version": "v1",
            "command": "request_apply",
            "idempotency_key": "idem:apply",
            "payload": { "changeset_id": "changeset_unapproved", "approval_id": approval_id, "targets": [] }
        })),
    )
    .await;
    // The preflight denies (not approved) BEFORE any core invoke → a 200 denial.
    assert_eq!(
        status,
        StatusCode::OK,
        "an ineligible apply is a 200 denial: {body}"
    );
    assert_eq!(body["data"]["status"], "denied");
    assert!(
        body["data"]["reason"].is_string(),
        "the denial carries the domain reason: {body}"
    );
}
