//! End-to-end vertical slices for the mounted authoring backend (W03.P39.S192/S193).
//!
//! Drives the REAL app router over HTTP — through the machine `bearer_gate` and the
//! actor-principal layer, against a real git worktree — no mocks (engine-read-and-
//! infer; real services in integration tests). Covers the exit-gate flow (issue →
//! create → submit → approve → apply → rollback) plus the denial / idempotency /
//! principal matrix.
//!
//! LIVE-CORE HONESTY (R1 (c)): the exit-gate test SCAFFOLDS a real `.vaultspec`
//! workspace (`vaultspec-core install`, an offline local deploy) so the apply's
//! `set-body` WRITE runs against a real vaultspec-core — the deepest integration (the
//! set-body arg contract vs a real workspace) that unit tests never exercise. When
//! the workspace installs (an operable core), the applied receipt is REQUIRED
//! (child_outcome=applied + rollback=generated); with NO core in the env it degrades
//! HONESTLY to a failed receipt + unavailable rollback. Core is NEVER faked. The
//! infra-fault → 503 and validation-fault → 422 mappings are covered by the `http.rs`
//! unit tests (not cleanly wire-triggerable without contriving a corrupt store).

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
// R1 (c): a fully VALID vault doc (feature tag + required `date` frontmatter) so the
// real `vault set-body` write accepts it — an invalid doc is refused ("date is
// required"), which is why an unscaffolded run degrades to a failed receipt.
const BASE_BODY: &str =
    "---\ntags:\n  - '#plan'\n  - '#e2e'\ndate: '2026-07-04'\n---\n\n# e2e plan\n\nbase body\n";
const NEW_BODY: &str = "---\ntags:\n  - '#plan'\n  - '#e2e'\ndate: '2026-07-04'\n---\n\n# e2e plan\n\nmaterialized body\n";

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

/// Scaffold a real `.vaultspec` workspace in the worktree so the apply's core
/// `set-body` WRITE operates against a real vaultspec-core workspace (R1 (c) — the
/// deepest integration, otherwise never e2e-tested). Best-effort + offline (a local
/// framework deploy): returns whether a workspace was installed. When it is NOT (no
/// core in the env), the e2e degrades honestly to a failed receipt — never faked.
fn scaffold_vaultspec_workspace(root: &Path) -> bool {
    let attempts: [&[&str]; 2] = [
        &[
            "uv",
            "run",
            "--no-sync",
            "vaultspec-core",
            "install",
            "--target",
            ".",
        ],
        &["vaultspec-core", "install", "--target", "."],
    ];
    for args in attempts {
        let installed = std::process::Command::new(args[0])
            .args(&args[1..])
            .current_dir(root)
            .output()
            .map(|out| out.status.success())
            .unwrap_or(false);
        if installed && root.join(".vaultspec").is_dir() {
            return true;
        }
    }
    root.join(".vaultspec").is_dir()
}

/// A real git worktree with a `.vault` corpus + the target plan doc, plus a real
/// `.vaultspec` workspace when a core is available. Returns the state, the doc's
/// `blob:<sha1>` base revision, and whether the workspace was installed (the applied
/// leg runs for real ONLY then; otherwise the e2e degrades honestly).
fn worktree_state() -> (tempfile::TempDir, Arc<AppState>, String, bool) {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    git(root, &["init", "-b", "main", "."]);
    let doc = root.join(DOC_PATH);
    std::fs::create_dir_all(doc.parent().unwrap()).unwrap();
    std::fs::write(&doc, BASE_BODY).unwrap();
    let core_ready = scaffold_vaultspec_workspace(root);
    git(root, &["add", "."]);
    git(root, &["commit", "-m", "fixture"]);
    let base_revision = format!("blob:{}", git_blob(root, DOC_PATH));
    let state = app::build_state(root.to_path_buf());
    (dir, state, base_revision, core_ready)
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

/// Create a durable authoring session over the wire and return its
/// server-minted id. The session registry (W10-W12) made sessions
/// first-class: a proposal's `session_id` must name an EXISTING session, so
/// every create-capable flow opens one first — exactly what a real client
/// does.
async fn create_session(state: &Arc<AppState>, bearer: &str, actor_token: &str) -> String {
    let (status, body) = send(
        router(state),
        "POST",
        "/authoring/v1/sessions",
        bearer,
        Some(actor_token),
        Some(json!({
            "api_version": "v1",
            "command": "create_session",
            "idempotency_key": "idem:session:create",
            "payload": { "scope": "worktree", "title": "e2e session" },
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "session create: {body}");
    body["data"]["session_id"]
        .as_str()
        .expect("session create returns the session id")
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

fn create_body(session_id: &str, changeset: &str, idem: &str, base_revision: &str) -> Value {
    json!({
        "api_version": "v1",
        "command": "create_proposal",
        "idempotency_key": idem,
        "payload": {
            "session_id": session_id,
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
    let session = create_session(state, bearer, agent).await;
    let (status, body) = send(
        router(state),
        "POST",
        "/authoring/v1/proposals",
        bearer,
        Some(agent),
        Some(create_body(&session, changeset, "idem:create", base)),
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
    let (dir, state, base, core_ready) = worktree_state();
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
            "payload": { "changeset_id": "changeset_e2e", "approval_id": approval_id }
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
    let child_outcome = body["data"]["child_outcome"]
        .as_str()
        .unwrap_or("<none>")
        .to_string();
    eprintln!(
        "[e2e] core_ready(workspace installed)={core_ready}; apply child_outcome={child_outcome}"
    );
    // R1 (c): when a REAL .vaultspec workspace was installed (an operable core
    // scaffolded it), the apply's set-body WRITE must land for real — assert the
    // applied receipt. Otherwise (no core in the env) the e2e degrades honestly.
    if core_ready {
        assert_eq!(
            child_outcome, "applied",
            "a real vaultspec workspace must yield an APPLIED receipt (R1 (c) drives \
             the real set-body write): {body}"
        );
    }
    let applied = child_outcome == "applied";

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
                "source_children": [{ "source_child_key": "child_1" }],
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
    let (dir, state, base, _core_ready) = worktree_state();
    let _keep = &dir;
    let bearer = state.bearer.clone();

    // A command with NO actor token → 401 (missing principal), never a 404.
    let (status, body) = send(
        router(&state),
        "POST",
        "/authoring/v1/proposals",
        &bearer,
        None,
        Some(create_body(
            "session_unused",
            "changeset_noauth",
            "idem:x",
            &base,
        )),
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
        Some(create_body(
            "session_unused",
            "changeset_badauth",
            "idem:x",
            &base,
        )),
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
    let (dir, state, base, _core_ready) = worktree_state();
    let _keep = &dir;
    let bearer = state.bearer.clone();
    let agent = issue_token(&state, &bearer, "agent:writer", "agent").await;
    let session = create_session(&state, &bearer, &agent).await;

    let (status, _) = send(
        router(&state),
        "POST",
        "/authoring/v1/proposals",
        &bearer,
        Some(&agent),
        Some(create_body(
            &session,
            "changeset_stale",
            "idem:create",
            &base,
        )),
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
    let (dir, state, base, _core_ready) = worktree_state();
    let _keep = &dir;
    let bearer = state.bearer.clone();
    let agent = issue_token(&state, &bearer, "agent:writer", "agent").await;
    let session = create_session(&state, &bearer, &agent).await;

    let (status, first) = send(
        router(&state),
        "POST",
        "/authoring/v1/proposals",
        &bearer,
        Some(&agent),
        Some(create_body(&session, "changeset_dup", "idem:dup", &base)),
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
        Some(create_body(&session, "changeset_dup", "idem:dup", &base)),
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
    let (dir, state, base, _core_ready) = worktree_state();
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
    let (dir, state, base, _core_ready) = worktree_state();
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
            "payload": { "changeset_id": "changeset_unapproved", "approval_id": approval_id }
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
