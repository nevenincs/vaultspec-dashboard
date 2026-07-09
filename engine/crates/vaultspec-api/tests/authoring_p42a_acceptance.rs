//! W14.P42a S263 — consolidated cross-engine acceptance, realizing the Increment-5
//! demo (plan S250) through the ACTUALLY-WIRED stack over the live HTTP router.
//!
//! Drives the REAL app router (machine `bearer_gate` + actor-principal layer) against a
//! real git worktree — no mocks — exercising the six wired engines TOGETHER: the
//! authorization floor (S257), advisory leases + apply fencing (S258), conflict
//! detection serve + apply preflight gate (S259), explicit rebase (S260), and the
//! review-station claim/queue/provenance (S261). Compaction (S262) rides the prompt-turn
//! boundary and is proven in `session.rs`.
//!
//! LIVE-WIRE CONSTRAINTS (flagged — see the per-test notes):
//! - No core is scaffolded: the apply's set-body write degrades to a FAILED receipt, but
//!   a receipt is recorded regardless of core presence, so `data.receipt` present == the
//!   apply PROCEEDED past the preflight fence/conflict gate, and a `denied` value (no
//!   receipt) == the gate refused it. That distinction is exactly what these tests assert;
//!   the applied-receipt leg is covered by `authoring_vertical_slices`.
//! - A `Conflicted` head is not deterministically wire-reachable post-S259 (the conflict
//!   preflight denies a stale-base apply BEFORE it can fail-to-Conflicted), so the
//!   rebase-POSITIVE `Conflicted -> Draft` path is unit-covered (S260, store-seeded); the
//!   wire test here asserts the rebase route's live wiring + deterministic gating.
//! - The floor's 403 `authoring_authorization_denied` is not externally wire-reachable
//!   (token issuance registers the base actor active and rejects a delegated record), so
//!   it is unit-covered (S257 coverage guard); the wire test here asserts the reachable
//!   redacted refusals (unknown token; cross-workspace scope denial).

use std::path::Path;
use std::sync::Arc;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use serde_json::{Value, json};
use tower::ServiceExt;
use vaultspec_api::app::{self, AppState};
use vaultspec_api::build_router;

const ACTOR_TOKEN_HEADER: &str = "x-authoring-actor-token";
const BASE_BODY: &str =
    "---\ntags:\n  - '#plan'\n  - '#acc'\ndate: '2026-07-04'\n---\n\n# acc plan\n\nbase body\n";
const NEW_BODY: &str = "---\ntags:\n  - '#plan'\n  - '#acc'\ndate: '2026-07-04'\n---\n\n# acc plan\n\nmaterialized body\n";
const EDITED_BODY: &str = "---\ntags:\n  - '#plan'\n  - '#acc'\ndate: '2026-07-04'\n---\n\n# acc plan\n\nedited out of band\n";

/// A target document identity in the fixture worktree.
struct Doc {
    node_id: &'static str,
    stem: &'static str,
    path: &'static str,
}

const DOC1: Doc = Doc {
    node_id: "doc:acc-plan",
    stem: "acc-plan",
    path: ".vault/plan/acc-plan.md",
};
const DOC2: Doc = Doc {
    node_id: "doc:acc-plan-two",
    stem: "acc-plan-two",
    path: ".vault/plan/acc-plan-two.md",
};

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

fn git_blob(root: &Path, rel: &str) -> String {
    let out = std::process::Command::new("git")
        .current_dir(root)
        .args(["hash-object", rel])
        .output()
        .expect("git hash-object runs");
    assert!(out.status.success());
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

/// A real git worktree with two committed plan docs. No core is scaffolded (module note).
fn worktree_state() -> (tempfile::TempDir, Arc<AppState>) {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    git(root, &["init", "-b", "main", "."]);
    for doc in [&DOC1, &DOC2] {
        let p = root.join(doc.path);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(&p, BASE_BODY).unwrap();
    }
    git(root, &["add", "."]);
    git(root, &["commit", "-m", "fixture"]);
    let state = app::build_state(root.to_path_buf());
    (dir, state)
}

fn base_of(root: &Path, doc: &Doc) -> String {
    format!("blob:{}", git_blob(root, doc.path))
}

fn router(state: &Arc<AppState>) -> axum::Router {
    build_router(state.clone())
}

fn pct(segment: &str) -> String {
    segment.replace(':', "%3A")
}

fn scope_token_of(state: &Arc<AppState>) -> String {
    engine_model::scope_token(&state.workspace_root)
}

async fn send(
    state: &Arc<AppState>,
    method: &str,
    path: &str,
    actor_token: Option<&str>,
    body: Option<Value>,
) -> (StatusCode, Value) {
    let bearer = state.bearer.clone();
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
    let response = router(state).oneshot(request).await.unwrap();
    let status = response.status();
    let bytes = axum::body::to_bytes(response.into_body(), 1 << 20)
        .await
        .unwrap();
    (
        status,
        serde_json::from_slice(&bytes).unwrap_or(Value::Null),
    )
}

/// Mint an actor token over the bootstrap route (which also registers the actor active).
async fn issue_token(state: &Arc<AppState>, actor_id: &str, kind: &str) -> String {
    let (status, body) = send(
        state,
        "POST",
        "/authoring/v1/actor-tokens",
        None,
        Some(json!({ "actor": { "id": actor_id, "kind": kind } })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED, "token issuance: {body}");
    body["data"]["raw_token"].as_str().unwrap().to_string()
}

async fn create_session(state: &Arc<AppState>, actor_token: &str, idem: &str) -> String {
    let (status, body) = send(
        state,
        "POST",
        "/authoring/v1/sessions",
        Some(actor_token),
        Some(json!({
            "api_version": "v1",
            "command": "create_session",
            "idempotency_key": idem,
            "payload": { "scope": "worktree", "title": "acceptance session" },
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "session create: {body}");
    body["data"]["session_id"].as_str().unwrap().to_string()
}

fn document(scope: &str, doc: &Doc, base: &str) -> Value {
    json!({
        "kind": "existing",
        "scope": scope,
        "node_id": doc.node_id,
        "stem": doc.stem,
        "path": doc.path,
        "doc_type": "plan",
        "base_revision": base,
    })
}

fn create_body(
    session_id: &str,
    scope: &str,
    doc: &Doc,
    changeset: &str,
    idem: &str,
    base: &str,
) -> Value {
    json!({
        "api_version": "v1",
        "command": "create_proposal",
        "idempotency_key": idem,
        "payload": {
            "session_id": session_id,
            "changeset_id": changeset,
            "summary": "acceptance proposal",
            "operations": [{
                "child_key": "child_1",
                "operation": "replace_body",
                "target": {
                    "document": document(scope, doc, base),
                    "base_revision": base,
                    "current_revision": base,
                },
                "draft": { "mode": "whole_document", "body": NEW_BODY },
            }],
        }
    })
}

/// Create → submit a changeset over the live wire (leaves it NeedsReview with an opened
/// approval). Returns (proposal_id, approval_id, reviewed_revision).
async fn create_submit(
    state: &Arc<AppState>,
    agent: &str,
    doc: &Doc,
    changeset: &str,
    base: &str,
) -> (String, String, String) {
    let session = create_session(state, agent, &format!("idem:session:{changeset}")).await;
    let (status, body) = send(
        state,
        "POST",
        "/authoring/v1/proposals",
        Some(agent),
        Some(create_body(
            &session,
            &scope_token_of(state),
            doc,
            changeset,
            &format!("idem:create:{changeset}"),
            base,
        )),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "create: {body}");
    assert_eq!(body["data"]["status"], "draft", "{body}");
    let revision = body["data"]["changeset_revision"]
        .as_str()
        .unwrap()
        .to_string();

    let (status, body) = send(
        state,
        "POST",
        &format!("/authoring/v1/proposals/{changeset}/submit"),
        Some(agent),
        Some(json!({
            "api_version": "v1",
            "command": "submit_for_review",
            "idempotency_key": format!("idem:submit:{changeset}"),
            "payload": { "expected_revision": revision, "summary": "submit acc" },
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "submit: {body}");
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

/// Create → submit → approve; returns the approval id. `agent` proposes; the DISTINCT
/// `reviewer` approves (the self-approval ban).
async fn create_submit_approve(
    state: &Arc<AppState>,
    agent: &str,
    reviewer: &str,
    doc: &Doc,
    changeset: &str,
    base: &str,
) -> String {
    let (proposal_id, approval_id, reviewed) =
        create_submit(state, agent, doc, changeset, base).await;
    let (status, body) = send(
        state,
        "POST",
        &format!("/authoring/v1/reviews/{}/decisions", pct(&approval_id)),
        Some(reviewer),
        Some(json!({
            "api_version": "v1",
            "command": "approve",
            "idempotency_key": format!("idem:approve:{changeset}"),
            "payload": {
                "proposal_id": proposal_id,
                "approval_id": approval_id,
                "decision": "approve",
                "reviewed_revision": reviewed,
                "comment": "lgtm",
            }
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "approve: {body}");
    assert_eq!(body["data"]["status"], "decided", "{body}");
    approval_id
}

/// Acquire an advisory lease on `doc`; returns the observable fencing token.
async fn acquire_lease(
    state: &Arc<AppState>,
    holder: &str,
    doc: &Doc,
    base: &str,
    idem: &str,
) -> i64 {
    let (status, body) = send(
        state,
        "POST",
        "/authoring/v1/leases",
        Some(holder),
        Some(json!({
            "api_version": "v1",
            "command": "acquire_lease",
            "idempotency_key": idem,
            "payload": {
                "target": document(&scope_token_of(state), doc, base),
                "purpose": "whole_document",
                "ttl_ms": 900000,
            }
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "acquire lease: {body}");
    assert_eq!(body["data"]["status"], "allowed", "{body}");
    body["data"]["lease"]["fencing_token"]
        .as_i64()
        .expect("a fresh lease issues an observable fencing token")
}

/// Apply a changeset, optionally presenting a fencing token.
async fn apply(
    state: &Arc<AppState>,
    applier: &str,
    changeset: &str,
    approval_id: &str,
    fencing_token: Option<i64>,
    idem: &str,
) -> Value {
    let mut payload = json!({ "changeset_id": changeset, "approval_id": approval_id });
    if let Some(token) = fencing_token {
        payload["fencing_token"] = json!(token);
    }
    let (status, body) = send(
        state,
        "POST",
        "/authoring/v1/apply-requests",
        Some(applier),
        Some(json!({
            "api_version": "v1",
            "command": "request_apply",
            "idempotency_key": idem,
            "payload": payload,
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "apply is enveloped: {body}");
    body
}

// =================================================================================
// Scenario 1 (S250): two concurrent writers + lease coordination visible + fencing.
// =================================================================================

#[tokio::test]
async fn demo_two_writers_lease_coordination_visible_and_fencing() {
    let (dir, state) = worktree_state();
    let base1 = base_of(dir.path(), &DOC1);
    let base2 = base_of(dir.path(), &DOC2);
    let agent = issue_token(&state, "agent:writer", "agent").await;
    let reviewer = issue_token(&state, "human:reviewer", "human").await;

    // Two concurrent writers on DOC1: the agent proposes a changeset (approved by the
    // reviewer), and the agent holds a live lease whose fencing token is OBSERVABLE in the
    // acquire response (lease coordination visible).
    let approval1 =
        create_submit_approve(&state, &agent, &reviewer, &DOC1, "changeset_fence", &base1).await;
    let token = acquire_lease(&state, &agent, &DOC1, &base1, "idem:lease:1").await;
    assert!(token >= 1, "the fencing token is a monotonic counter");

    // A STALE token is fenced OUT at the apply preflight — a denial value, no receipt.
    let stale = apply(
        &state,
        &reviewer,
        "changeset_fence",
        &approval1,
        Some(token + 5),
        "idem:apply:stale",
    )
    .await;
    assert_eq!(
        stale["data"]["status"], "denied",
        "a stale token is fenced: {stale}"
    );
    assert!(
        stale["data"]["receipt"].as_object().is_none(),
        "a fenced apply never reaches the core (no receipt): {stale}"
    );
    assert!(
        stale["data"]["reason"]
            .as_str()
            .is_some_and(|r| r.contains("fencing token") || r.contains("lease")),
        "the denial names the advisory fence: {stale}"
    );

    // The CURRENT token PROCEEDS past the fence to the core (records a receipt).
    let current = apply(
        &state,
        &reviewer,
        "changeset_fence",
        &approval1,
        Some(token),
        "idem:apply:current",
    )
    .await;
    assert!(
        current["data"]["receipt"].as_object().is_some(),
        "the current token clears the fence and reaches the core: {current}"
    );

    // On a SEPARATE document under its own live lease, an ABSENT token PROCEEDS (S258-R1
    // advisory semantics: no token == non-participant, the revision check remains the floor).
    let approval2 =
        create_submit_approve(&state, &agent, &reviewer, &DOC2, "changeset_absent", &base2).await;
    let _token2 = acquire_lease(&state, &agent, &DOC2, &base2, "idem:lease:2").await;
    let absent = apply(
        &state,
        &reviewer,
        "changeset_absent",
        &approval2,
        None,
        "idem:apply:absent",
    )
    .await;
    assert!(
        absent["data"]["receipt"].as_object().is_some(),
        "an absent token proceeds under a live lease (advisory): {absent}"
    );
}

// =================================================================================
// Scenario 2 (S250): a stale proposal conflicts deterministically; apply refused.
// =================================================================================

#[tokio::test]
async fn demo_stale_proposal_conflicts_deterministically_and_apply_refused() {
    let (dir, state) = worktree_state();
    let base = base_of(dir.path(), &DOC1);
    let agent = issue_token(&state, "agent:writer", "agent").await;
    let reviewer = issue_token(&state, "human:reviewer", "human").await;
    let approval = create_submit_approve(
        &state,
        &agent,
        &reviewer,
        &DOC1,
        "changeset_conflict",
        &base,
    )
    .await;

    // An out-of-band edit stales the proposal's recorded base.
    std::fs::write(dir.path().join(DOC1.path), EDITED_BODY).unwrap();

    // The conflict route serves the base-staleness finding — DETERMINISTICALLY.
    let conflict_path = "/authoring/v1/proposals/changeset_conflict/conflicts";
    let (status, first) = send(&state, "GET", conflict_path, None, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        first["data"]["has_conflict"], true,
        "a stale base is a served conflict: {first}"
    );
    let kind = first["data"]["findings"][0]["kind"]
        .as_str()
        .unwrap_or_default();
    assert!(
        kind == "stale_base_revision" || kind == "stale_whole_document_draft",
        "the finding names the stale base: {first}"
    );
    let (_status, second) = send(&state, "GET", conflict_path, None, None).await;
    assert_eq!(
        first["data"], second["data"],
        "same inputs -> same conflict report (deterministic)"
    );

    // The apply preflight consults the same detector and REFUSES as a value — no receipt.
    let refused = apply(
        &state,
        &reviewer,
        "changeset_conflict",
        &approval,
        None,
        "idem:apply:conflict",
    )
    .await;
    assert_eq!(
        refused["data"]["status"], "denied",
        "a stale-base apply is refused: {refused}"
    );
    assert!(
        refused["data"]["receipt"].as_object().is_none(),
        "a conflict-refused apply never reaches the core: {refused}"
    );
    // No lease/token bypasses the revision check: the refusal stands with a token too.
    let refused_with_token = apply(
        &state,
        &reviewer,
        "changeset_conflict",
        &approval,
        Some(1),
        "idem:apply:conflict:t",
    )
    .await;
    assert_eq!(
        refused_with_token["data"]["status"], "denied",
        "no lease/token bypasses the conflict gate: {refused_with_token}"
    );
}

// =================================================================================
// Scenario 3 (S250): explicit rebase route — live wiring + deterministic gating.
// (The positive Conflicted -> Draft path is unit-covered; see the module note.)
// =================================================================================

#[tokio::test]
async fn demo_explicit_rebase_route_is_wired_and_deterministically_gates() {
    let (dir, state) = worktree_state();
    let base = base_of(dir.path(), &DOC1);
    let agent = issue_token(&state, "agent:writer", "agent").await;
    // create -> submit leaves a NeedsReview head; `reviewed` is that head revision.
    let (_proposal, _approval, head) =
        create_submit(&state, &agent, &DOC1, "changeset_rebase", &base).await;

    let rebase_body = |idem: &str| {
        json!({
            "api_version": "v1",
            "command": "rebase",
            "idempotency_key": idem,
            "payload": {
                "changeset_id": "changeset_rebase",
                "expected_revision": head,
                "summary": "rebase onto current base",
            }
        })
    };
    let rebase_path = "/authoring/v1/proposals/changeset_rebase/rebase";

    let (status, body) = send(
        &state,
        "POST",
        rebase_path,
        Some(&agent),
        Some(rebase_body("idem:rebase:1")),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "the rebase route is wired + floor-authorized: {body}"
    );
    assert_eq!(
        body["data"]["status"], "denied",
        "a non-conflicted head is a deterministic denial value: {body}"
    );

    // Deterministic: the SAME inputs produce the SAME gate (a replay or a fresh equal
    // outcome — either way the head never advances).
    let (status2, body2) = send(
        &state,
        "POST",
        rebase_path,
        Some(&agent),
        Some(rebase_body("idem:rebase:2")),
    )
    .await;
    assert_eq!(status2, StatusCode::OK);
    assert_eq!(
        body2["data"]["status"], "denied",
        "same inputs -> same gate: {body2}"
    );
}

// =================================================================================
// Scenario 4 (S250): an unauthorized actor is refused with a REDACTED error.
// (The floor's 403 is unit-covered; the reachable wire refusals are asserted here.)
// =================================================================================

#[tokio::test]
async fn demo_unauthorized_actor_refused_with_a_redacted_error() {
    let (dir, state) = worktree_state();
    let base = base_of(dir.path(), &DOC1);
    let agent = issue_token(&state, "agent:writer", "agent").await;
    let session = create_session(&state, &agent, "idem:session:authz").await;

    // (a) An UNKNOWN actor token on a mutating route → a redacted 401 that echoes neither
    //     the presented token nor any document path.
    let bogus = "deadbeefdeadbeefdeadbeefdeadbeef";
    let (status, body) = send(
        &state,
        "POST",
        "/authoring/v1/proposals",
        Some(bogus),
        Some(create_body(
            &session,
            &scope_token_of(&state),
            &DOC1,
            "changeset_authz",
            "idem:create:authz",
            &base,
        )),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::UNAUTHORIZED,
        "an unknown principal is refused: {body}"
    );
    assert_eq!(body["error_kind"], "authoring_actor_token_unknown");
    let rendered = body.to_string();
    assert!(
        !rendered.contains(bogus),
        "the refusal must not echo the token: {body}"
    );
    assert!(
        !rendered.contains(DOC1.path),
        "the refusal must not echo a document path: {body}"
    );

    // (b) A REGISTERED actor whose target claims a DIFFERENT workspace is refused by the
    //     document-scope guard as a redacted denial VALUE — never echoing the foreign scope.
    let foreign_scope = "/some/other/worktree";
    let (status, body) = send(
        &state,
        "POST",
        "/authoring/v1/proposals",
        Some(&agent),
        Some(create_body(
            &session,
            foreign_scope,
            &DOC1,
            "changeset_scope",
            "idem:create:scope",
            &base,
        )),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "a scope refusal is a denial value: {body}"
    );
    assert_eq!(body["data"]["status"], "denied");
    let reason = body["data"]["reason"].as_str().unwrap_or_default();
    assert!(
        reason.contains("scope"),
        "the denial names the scope fence: {body}"
    );
    assert!(
        !reason.contains(foreign_scope),
        "the redacted denial must not echo the foreign scope: {body}"
    );
}

// =================================================================================
// Cross-engine extra: a claimed review item surfaces in the queue; provenance served
// bounded + REDACTED.
// =================================================================================

#[tokio::test]
async fn demo_claimed_item_surfaces_in_queue_and_provenance_is_redacted() {
    let (dir, state) = worktree_state();
    let base = base_of(dir.path(), &DOC1);
    let agent = issue_token(&state, "agent:writer", "agent").await;
    let reviewer = issue_token(&state, "human:reviewer", "human").await;

    // Create → submit leaves a NeedsReview item with an opened approval.
    let _ = create_submit(&state, &agent, &DOC1, "changeset_queue", &base).await;

    // A distinct human reviewer CLAIMS the item.
    let (status, body) = send(
        &state,
        "POST",
        "/authoring/v1/review-claims",
        Some(&reviewer),
        Some(json!({
            "api_version": "v1",
            "command": "claim_review",
            "idempotency_key": "idem:claim:queue",
            "payload": { "changeset_id": "changeset_queue" },
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "claim: {body}");
    assert_eq!(body["data"]["status"], "allowed");
    assert_eq!(body["data"]["claim"]["state"], "held");

    // The review queue serves the item with the composed CLAIMED four-state.
    let (status, body) = send(&state, "GET", "/authoring/v1/review-queue", None, None).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let items = body["data"]["items"].as_array().expect("items array");
    let claimed = items
        .iter()
        .find(|item| item["proposal"]["changeset_id"] == "changeset_queue")
        .unwrap_or_else(|| panic!("the claimed item is queued: {body}"));
    assert_eq!(
        claimed["station_state"], "claimed",
        "a held claim composes the `claimed` four-state: {body}"
    );

    // Provenance is served bounded + REDACTED: material refs carry fingerprints only.
    let (status, body) = send(
        &state,
        "GET",
        "/authoring/v1/proposals/changeset_queue/provenance",
        None,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["data"]["changeset_id"], "changeset_queue");
    let entries = body["data"]["entries"].as_array().expect("entries array");
    assert!(
        !entries.is_empty(),
        "the trail has revision entries: {body}"
    );
    for entry in entries {
        for material in entry["materials"].as_array().expect("materials array") {
            assert!(
                material["content_hash"].is_string(),
                "fingerprint present: {material}"
            );
            assert!(
                material["byte_len"].is_number(),
                "byte length present: {material}"
            );
        }
    }
    assert!(
        !body
            .to_string()
            .to_lowercase()
            .contains("materialized body"),
        "provenance must not leak a raw document body: {body}"
    );
}
