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

// section-scoped-operations ADR: a doc with two headings so a `SectionEdit`
// draft can target one (`Beta`) without touching the other (`Alpha`).
const SECTION_DOC_PATH: &str = ".vault/plan/e2e-section-plan.md";
const SECTION_BASE_BODY: &str = "---\ntags:\n  - '#plan'\n  - '#e2e'\ndate: '2026-07-04'\n---\n\n# e2e section plan\n\n## Alpha\n\nalpha body\n\n## Beta\n\nbeta body\n";
const SECTION_BETA_SECTION: &str = "## Beta\n\nbeta body\n";
const SECTION_BETA_NEW: &str = "## Beta\n\nBETA REWRITTEN\n";

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

/// The git blob object id of arbitrary bytes (not necessarily a tracked file) —
/// `git hash-object --stdin` computes the SAME blob-hashing scheme
/// [`ingest_struct::reader::blob_oid`] does, so a section selector's
/// `expected_content_hash` can be computed here without a second hashing
/// implementation or a scratch file.
fn git_blob_of(content: &str) -> String {
    use std::io::Write;
    let mut child = std::process::Command::new("git")
        .args(["hash-object", "--stdin"])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .spawn()
        .expect("git hash-object --stdin spawns");
    child
        .stdin
        .take()
        .unwrap()
        .write_all(content.as_bytes())
        .unwrap();
    let out = child.wait_with_output().unwrap();
    assert!(
        out.status.success(),
        "git hash-object --stdin: {}",
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

/// The `worktree_state` sibling for `SectionEdit` tests: a real git worktree +
/// `.vaultspec` workspace seeded with [`SECTION_BASE_BODY`] (two headings)
/// instead of the flat [`BASE_BODY`].
fn section_worktree_state() -> (tempfile::TempDir, Arc<AppState>, String, bool) {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    git(root, &["init", "-b", "main", "."]);
    let doc = root.join(SECTION_DOC_PATH);
    std::fs::create_dir_all(doc.parent().unwrap()).unwrap();
    std::fs::write(&doc, SECTION_BASE_BODY).unwrap();
    let core_ready = scaffold_vaultspec_workspace(root);
    git(root, &["add", "."]);
    git(root, &["commit", "-m", "section fixture"]);
    let base_revision = format!("blob:{}", git_blob(root, SECTION_DOC_PATH));
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

/// The target document ref. `scope` must be the SERVER-AUTHORITATIVE scope
/// token of the served worktree (`engine_model::scope_token`) — the W14.P42a
/// document-scope guard denies a target claiming any other scope.
fn document(scope: &str, base_revision: &str) -> Value {
    json!({
        "kind": "existing",
        "scope": scope,
        "node_id": "doc:e2e-plan",
        "stem": "e2e-plan",
        "path": DOC_PATH,
        "doc_type": "plan",
        "base_revision": base_revision,
    })
}

fn scope_token_of(state: &std::sync::Arc<AppState>) -> String {
    engine_model::scope_token(&state.workspace_root)
}

/// The `document` sibling for the section-edit fixture (`SECTION_DOC_PATH`).
fn section_document(scope: &str, base_revision: &str) -> Value {
    json!({
        "kind": "existing",
        "scope": scope,
        "node_id": "doc:e2e-section-plan",
        "stem": "e2e-section-plan",
        "path": SECTION_DOC_PATH,
        "doc_type": "plan",
        "base_revision": base_revision,
    })
}

/// The `create_body` sibling for a `SectionEdit` draft: the selector
/// (structural anchor + expected content hash) and the new section content,
/// reusing `body` exactly as `replace_body` reuses it for whole-document
/// content.
#[allow(clippy::too_many_arguments)]
fn section_create_body(
    session_id: &str,
    scope: &str,
    changeset: &str,
    idem: &str,
    base_revision: &str,
    heading_path: &[&str],
    expected_content_hash: &str,
    new_content: &str,
) -> Value {
    json!({
        "api_version": "v1",
        "command": "create_proposal",
        "idempotency_key": idem,
        "payload": {
            "session_id": session_id,
            "changeset_id": changeset,
            "summary": "e2e section-edit proposal",
            "operations": [{
                "child_key": "child_1",
                "operation": "section_edit",
                "target": {
                    "document": section_document(scope, base_revision),
                    "base_revision": base_revision,
                    "current_revision": base_revision,
                },
                "draft": {
                    "mode": "section_scoped",
                    "body": new_content,
                    "section_selector": {
                        "heading_path": heading_path,
                        "expected_content_hash": expected_content_hash,
                    },
                },
            }],
        }
    })
}

fn create_body(
    session_id: &str,
    scope: &str,
    changeset: &str,
    idem: &str,
    base_revision: &str,
) -> Value {
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
                    "document": document(scope, base_revision),
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
        Some(create_body(
            &session,
            &scope_token_of(state),
            changeset,
            "idem:create",
            base,
        )),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "create: {body}");
    assert_eq!(body["data"]["status"], "draft", "create outcome: {body}");
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

/// The `create_and_submit` sibling for a `SectionEdit` draft.
#[allow(clippy::too_many_arguments)]
async fn section_create_and_submit(
    state: &Arc<AppState>,
    bearer: &str,
    agent: &str,
    changeset: &str,
    base: &str,
    heading_path: &[&str],
    expected_content_hash: &str,
    new_content: &str,
) -> (String, String, String) {
    let session = create_session(state, bearer, agent).await;
    let (status, body) = send(
        router(state),
        "POST",
        "/authoring/v1/proposals",
        bearer,
        Some(agent),
        Some(section_create_body(
            &session,
            &scope_token_of(state),
            changeset,
            "idem:create",
            base,
            heading_path,
            expected_content_hash,
            new_content,
        )),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "create: {body}");
    assert_eq!(body["data"]["status"], "draft", "create outcome: {body}");
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
            "scope_unused",
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
            "scope_unused",
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
            &scope_token_of(&state),
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
        Some(create_body(
            &session,
            &scope_token_of(&state),
            "changeset_dup",
            "idem:dup",
            &base,
        )),
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
        Some(create_body(
            &session,
            &scope_token_of(&state),
            "changeset_dup",
            "idem:dup",
            &base,
        )),
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

/// W14.P47 (S253/S255): the editor-save path is single-sourced through the
/// ledger over the REAL router — no legacy `/ops/core` dual-write, and
/// direct-changeset is authoritative with NO capability file present (the
/// P47 default flip). Drives the actual `/v1/direct-writes` command, then
/// confirms the resulting changeset is a normal, rollback-eligible ledger
/// entry rather than a side effect only the direct-write side table knows
/// about.
#[tokio::test]
async fn direct_write_route_is_ledger_authoritative_with_no_capability_file() {
    let (dir, state, base, core_ready) = worktree_state();
    let _keep = &dir;
    let bearer = state.bearer.clone();
    let human = issue_token(&state, &bearer, "human:author", "human").await;

    // Direct-write's `ReplaceBody` composes over the document's EXISTING
    // frontmatter (`vault set-body` preserves it) — body-only, like the
    // direct_write.rs unit fixture's `NEW_BODY`, not the frontmatter-carrying
    // `NEW_BODY` this file's create-proposal flow sends.
    const DIRECT_NEW_BODY: &str = "# e2e plan\n\ndirect-saved body\n";

    let (status, body) = send(
        router(&state),
        "POST",
        "/authoring/v1/direct-writes",
        &bearer,
        Some(&human),
        Some(json!({
            "api_version": "v1",
            "command": "direct_write",
            "idempotency_key": "idem:direct:e2e",
            "payload": {
                "ref": DOC_PATH,
                "operation": "replace_body",
                "body": DIRECT_NEW_BODY,
                "expected_blob_hash": base.trim_start_matches("blob:"),
                "summary": "e2e direct save",
            }
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "direct write is enveloped: {body}");

    // The retired dual-run/legacy-authority surface must not resurface on the wire.
    assert!(
        body["data"].get("legacy").is_none(),
        "the retired legacy comparison must not appear on the direct-write outcome: {body}"
    );
    if let Some(record) = body["data"].get("record") {
        assert!(
            record.get("legacy").is_none(),
            "the retired legacy comparison must not appear on the direct-write record: {record}"
        );
    }

    // No capability file was written for this worktree — direct-changeset is
    // authoritative by default (W14.P47), so the save must not be refused.
    assert_ne!(
        body["data"]["status"], "denied",
        "the default capability state must not refuse a human direct save: {body}"
    );

    if core_ready {
        assert_eq!(
            body["data"]["status"], "applied",
            "a real vaultspec workspace must yield an APPLIED direct save: {body}"
        );
        let changeset_id = body["data"]["changeset_id"]
            .as_str()
            .expect("an applied direct save names its changeset")
            .to_string();
        assert!(changeset_id.starts_with("direct:"));

        // The direct save is a NORMAL ledger entry, not a side channel: the review
        // station's own projection route sees it, self-describing as kind=direct
        // with rollback available — exactly what a proposed-and-approved changeset
        // looks like, satisfying "no un-ledgered write path remains".
        let (status, projection) = send(
            router(&state),
            "GET",
            &format!("/authoring/v1/proposals/{}", pct(&changeset_id)),
            &bearer,
            Some(&human),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK, "direct save projects: {projection}");
        assert_eq!(projection["data"]["proposal"]["status"], "applied");
        assert_eq!(projection["data"]["proposal"]["kind"], "direct");
        assert_eq!(
            projection["data"]["proposal"]["rollback"]["available"], true,
            "an applied direct save remains a legal rollback source: {projection}"
        );
    }

    // The capability status itself is served ON by default, with no served
    // legacy/dual-run flags.
    let (status, status_body) = send(
        router(&state),
        "GET",
        "/authoring/status",
        &bearer,
        None,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(status_body["data"]["capabilities"]["direct_write"], true);
    assert!(
        status_body["data"]["capabilities"]
            .get("direct_write_dual_run")
            .is_none()
    );
    assert!(
        status_body["data"]["capabilities"]
            .get("direct_write_authority")
            .is_none()
    );
}

/// section-scoped-operations ADR: the SAME exit-gate flow
/// (`exit_gate_flow_issue_create_submit_approve_apply_rollback`) driven by a
/// `SectionEdit` draft instead of a whole-document `replace_body` — proposing
/// a section-scoped change over the wire, submitting, approving, applying
/// (confirming the spliced whole-document body landed via the real core), and
/// rolling back (confirming the selected preimage was restored into its
/// resolved range).
#[tokio::test]
async fn section_edit_full_lifecycle_propose_submit_approve_apply_rollback() {
    let (dir, state, base, core_ready) = section_worktree_state();
    let _keep = &dir;
    let bearer = state.bearer.clone();
    let beta_hash = git_blob_of(SECTION_BETA_SECTION);

    let agent = issue_token(&state, &bearer, "agent:writer", "agent").await;
    let reviewer = issue_token(&state, &bearer, "human:reviewer", "human").await;

    let (proposal_id, approval_id, reviewed) = section_create_and_submit(
        &state,
        &bearer,
        &agent,
        "changeset_e2e_section",
        &base,
        &["Beta"],
        &beta_hash,
        SECTION_BETA_NEW,
    )
    .await;
    assert!(proposal_id.starts_with("proposal:"));

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
            "payload": {
                "changeset_id": "changeset_e2e_section",
                "approval_id": approval_id
            }
        })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "apply is reachable + enveloped: {body}"
    );
    let child_outcome = body["data"]["child_outcome"]
        .as_str()
        .unwrap_or("<none>")
        .to_string();
    if core_ready {
        assert_eq!(
            child_outcome, "applied",
            "a real vaultspec workspace must yield an APPLIED section-edit receipt: {body}"
        );
        let saved = std::fs::read_to_string(dir.path().join(SECTION_DOC_PATH)).unwrap();
        assert!(
            saved.contains("BETA REWRITTEN") && saved.contains("alpha body"),
            "the spliced whole-document body landed; the untouched Alpha section survives: \
             {saved}"
        );
    }
    let applied = child_outcome == "applied";

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
                "source_changeset_id": "changeset_e2e_section",
                "source_children": [{ "source_child_key": "child_1" }],
                "reason": "restore the selected preimage"
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
            "an applied section-edit source rolls back to a new Rollback changeset: {body}"
        );
        let rollback_id = body["data"]["rollback_changeset_id"]
            .as_str()
            .unwrap()
            .to_string();
        assert!(rollback_id.starts_with("rollback:"));

        let (status, projection) = send(
            router(&state),
            "GET",
            &format!("/authoring/v1/proposals/{}", pct(&rollback_id)),
            &bearer,
            Some(&reviewer),
            None,
        )
        .await;
        assert_eq!(status, StatusCode::OK, "rollback projects: {projection}");
        let review_doc = &projection["data"]["review_documents"][0];
        assert!(
            review_doc["base"]["text"]
                .as_str()
                .is_some_and(|text| text.contains("BETA REWRITTEN") && text.contains("alpha body")),
            "the rollback's base is the post-apply document: {projection}"
        );
        assert!(
            review_doc["proposed"]["text"].as_str().is_some_and(|text| {
                text.contains("beta body")
                    && !text.contains("BETA REWRITTEN")
                    && text.contains("alpha body")
            }),
            "the rollback restores ONLY the selected Beta preimage, leaving Alpha untouched: \
             {projection}"
        );
    } else {
        assert_eq!(
            body["data"]["status"], "unavailable",
            "an unapplied source is honestly not rollback-able (no live core): {body}"
        );
    }
}

/// A `SectionEdit` draft whose selector anchor does not resolve against the
/// current document is refused at PROPOSAL-CREATION time, before any review
/// or apply — never a fuzzy patch.
#[tokio::test]
async fn section_edit_missing_anchor_is_refused_at_proposal_creation() {
    let (dir, state, base, _core_ready) = section_worktree_state();
    let _keep = &dir;
    let bearer = state.bearer.clone();
    let agent = issue_token(&state, &bearer, "agent:writer", "agent").await;
    let session = create_session(&state, &bearer, &agent).await;

    let (status, body) = send(
        router(&state),
        "POST",
        "/authoring/v1/proposals",
        &bearer,
        Some(&agent),
        Some(section_create_body(
            &session,
            &scope_token_of(&state),
            "changeset_section_missing",
            "idem:create",
            &base,
            &["Gamma"],
            "irrelevant",
            "## Gamma\n\nnew content\n",
        )),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "a missing selector anchor is a 422 with typed evidence: {body}"
    );
    assert_eq!(body["error_kind"], "authoring_validation_failed");
    assert!(
        body["error"]
            .as_str()
            .is_some_and(|reason| reason.contains("did not resolve")),
        "{body}"
    );
}

/// A `SectionEdit` draft whose expected content hash mismatches the current
/// section is refused at proposal-creation time, carrying the typed
/// observed-versus-expected evidence.
#[tokio::test]
async fn section_edit_content_hash_mismatch_is_refused_at_proposal_creation() {
    let (dir, state, base, _core_ready) = section_worktree_state();
    let _keep = &dir;
    let bearer = state.bearer.clone();
    let agent = issue_token(&state, &bearer, "agent:writer", "agent").await;
    let session = create_session(&state, &bearer, &agent).await;

    let (status, body) = send(
        router(&state),
        "POST",
        "/authoring/v1/proposals",
        &bearer,
        Some(&agent),
        Some(section_create_body(
            &session,
            &scope_token_of(&state),
            "changeset_section_hash_mismatch",
            "idem:create",
            &base,
            &["Beta"],
            "0000000000000000000000000000000000000000",
            SECTION_BETA_NEW,
        )),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "a content-hash mismatch is a 422 with typed evidence: {body}"
    );
    assert_eq!(body["error_kind"], "authoring_validation_failed");
    assert!(
        body["error"]
            .as_str()
            .is_some_and(|reason| reason.contains("content hash mismatch")),
        "{body}"
    );
}

/// A `SectionEdit` draft whose `heading_path` is ambiguous (a duplicate
/// heading with no disambiguating ancestor path) is refused at
/// proposal-creation time.
#[tokio::test]
async fn section_edit_ambiguous_anchor_is_refused_at_proposal_creation() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    git(root, &["init", "-b", "main", "."]);
    let doc_path = ".vault/plan/e2e-section-ambiguous-plan.md";
    let body = "---\ntags:\n  - '#plan'\n  - '#e2e'\ndate: '2026-07-04'\n---\n\n# e2e ambiguous plan\n\n## One\n\n### Item\n\nfirst\n\n## Two\n\n### Item\n\nsecond\n";
    std::fs::create_dir_all(root.join(doc_path).parent().unwrap()).unwrap();
    std::fs::write(root.join(doc_path), body).unwrap();
    scaffold_vaultspec_workspace(root);
    git(root, &["add", "."]);
    git(root, &["commit", "-m", "ambiguous fixture"]);
    let base = format!("blob:{}", git_blob(root, doc_path));
    let state = app::build_state(root.to_path_buf());
    let bearer = state.bearer.clone();
    let agent = issue_token(&state, &bearer, "agent:writer", "agent").await;
    let session = create_session(&state, &bearer, &agent).await;

    let document = json!({
        "kind": "existing",
        "scope": scope_token_of(&state),
        "node_id": "doc:e2e-section-ambiguous-plan",
        "stem": "e2e-section-ambiguous-plan",
        "path": doc_path,
        "doc_type": "plan",
        "base_revision": base,
    });
    let create = json!({
        "api_version": "v1",
        "command": "create_proposal",
        "idempotency_key": "idem:create",
        "payload": {
            "session_id": session,
            "changeset_id": "changeset_section_ambiguous",
            "summary": "e2e ambiguous section-edit proposal",
            "operations": [{
                "child_key": "child_1",
                "operation": "section_edit",
                "target": {
                    "document": document,
                    "base_revision": base,
                    "current_revision": base,
                },
                "draft": {
                    "mode": "section_scoped",
                    "body": "### Item\n\nrewritten\n",
                    "section_selector": {
                        "heading_path": ["Item"],
                        "expected_content_hash": "irrelevant",
                    },
                },
            }],
        }
    });

    let (status, body) = send(
        router(&state),
        "POST",
        "/authoring/v1/proposals",
        &bearer,
        Some(&agent),
        Some(create),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::UNPROCESSABLE_ENTITY,
        "an ambiguous selector anchor is a 422 with typed evidence: {body}"
    );
    assert_eq!(body["error_kind"], "authoring_validation_failed");
    assert!(
        body["error"]
            .as_str()
            .is_some_and(|reason| reason.contains("ambiguous")),
        "{body}"
    );
}

/// An APPLIED `SectionEdit` whose targeted section no longer resolves at
/// rollback time (a further out-of-band edit landed inside it) surfaces
/// `rollback_available=false` — the honest degradation, never a guessed
/// inverse. Only meaningful when a real core landed the forward apply.
#[tokio::test]
async fn applied_section_edit_rollback_surfaces_unavailable_when_the_section_no_longer_resolves() {
    let (dir, state, base, core_ready) = section_worktree_state();
    let _keep = &dir;
    let bearer = state.bearer.clone();
    let beta_hash = git_blob_of(SECTION_BETA_SECTION);

    let agent = issue_token(&state, &bearer, "agent:writer", "agent").await;
    let reviewer = issue_token(&state, &bearer, "human:reviewer", "human").await;

    let (proposal_id, approval_id, reviewed) = section_create_and_submit(
        &state,
        &bearer,
        &agent,
        "changeset_e2e_section_drift",
        &base,
        &["Beta"],
        &beta_hash,
        SECTION_BETA_NEW,
    )
    .await;

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
            "payload": {
                "changeset_id": "changeset_e2e_section_drift",
                "approval_id": approval_id
            }
        })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "apply is reachable + enveloped: {body}"
    );
    if !core_ready {
        // No live core in this environment: the source never actually applied,
        // so there is nothing to roll back — the same honest degradation the
        // exit-gate test already covers. Skip the section-drift assertion.
        return;
    }
    assert_eq!(body["data"]["child_outcome"], "applied");

    // A FURTHER out-of-band edit lands inside the Beta section after apply —
    // beyond what the forward apply itself produced.
    std::fs::write(
        dir.path().join(SECTION_DOC_PATH),
        "---\ntags:\n  - '#plan'\n  - '#e2e'\ndate: '2026-07-04'\n---\n\n# e2e section plan\n\n## Alpha\n\nalpha body\n\n## Beta\n\nBETA EDITED AGAIN OUT OF BAND\n",
    )
    .unwrap();

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
                "source_changeset_id": "changeset_e2e_section_drift",
                "source_children": [{ "source_child_key": "child_1" }],
                "reason": "restore the selected preimage"
            }
        })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "rollback is reachable + enveloped: {body}"
    );
    assert_eq!(
        body["data"]["status"], "unavailable",
        "the targeted section no longer resolves; rollback degrades honestly: {body}"
    );
    assert!(
        body["data"]["manual_repair"].is_object(),
        "an unavailable rollback still offers the manual-repair hook: {body}"
    );
}
