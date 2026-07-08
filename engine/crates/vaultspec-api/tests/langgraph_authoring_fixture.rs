//! End-to-end integration fixture for the P41 agent-tool executor run loop
//! (W12.P41 CHECKPOINT B — the exit gate).
//!
//! Drives the REAL app router over HTTP — through the machine `bearer_gate` and the
//! actor-principal layer, against a real git worktree — no mocks (wire-contract rule:
//! tests exercise the live wire). It exercises the full agent run loop through the
//! wired `POST /authoring/v1/runs/{run_id}/agent-tools/execute` route built in A3b:
//!
//!   1. An agent tool (propose_changeset) WITHOUT a grant SUSPENDS on a
//!      tool-permission interrupt (disposition `awaiting_permission`, a 200 value,
//!      no dispatch, no terminal tool-call record).
//!   2. A human GRANTS via the permission-decision route, and the run's interrupt is
//!      resolved BY ID via the interrupt-resume route — using the `interrupt_id` the
//!      awaiting response surfaced (no internal-derivation coupling).
//!   3. Re-executing the SAME tool_call_id now DISPATCHES; a further replay re-drives
//!      effectively-once (the dispatched command's own idempotency dedups — no
//!      double-apply).
//!   4. request_approval in AUTONOMOUS mode auto-approves + auto-applies and is listed
//!      after-the-fact under the applied-under-policy lane.
//!   5. The load-bearing MATRIX through `/execute`: a ReadOnly tool flows free (records
//!      its permitted tool-call record + returns the prepared read descriptor, no
//!      command executed); a Mutating tool WITHOUT a grant is gated (a value, no
//!      dispatch); a Mutating tool WITH a grant dispatches; a replay of a granted
//!      tool_call_id re-drives without double-apply.
//!
//! LIVE-CORE HONESTY: mirrors `authoring_vertical_slices.rs` — best-effort scaffolds a
//! real `.vaultspec` workspace so an AUTONOMOUS auto-apply's `set-body` WRITE runs for
//! real (asserting `applied`); with no core in the env the auto-apply degrades honestly
//! to a `failed` receipt and the after-the-fact lane still lists the changeset from its
//! recorded system-policy approval marker. Core is NEVER faked.

use std::path::Path;
use std::sync::Arc;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use serde_json::{Value, json};
use tower::ServiceExt;
use vaultspec_api::app::{self, AppState};
use vaultspec_api::build_router;

const ACTOR_TOKEN_HEADER: &str = "x-authoring-actor-token";
const DOC_PATH: &str = ".vault/plan/loop-plan.md";
// A fully VALID vault doc (feature tag + required `date` frontmatter) so a real
// `vault set-body` write accepts it under an AUTONOMOUS auto-apply.
const BASE_BODY: &str =
    "---\ntags:\n  - '#plan'\n  - '#loop'\ndate: '2026-07-08'\n---\n\n# loop plan\n\nbase body\n";
const NEW_BODY: &str = "---\ntags:\n  - '#plan'\n  - '#loop'\ndate: '2026-07-08'\n---\n\n# loop plan\n\nmaterialized body\n";

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

/// The git blob object id of a worktree file — `git hash-object <file>` yields the
/// same sha1 the domain's `ingest_struct::reader::blob_oid` computes, so a client can
/// name a `base_revision` matching exactly what the backend reads.
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

/// Best-effort scaffold a real `.vaultspec` workspace so an autonomous auto-apply's
/// core `set-body` WRITE operates for real. Offline; returns whether one installed.
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
/// `blob:<sha1>` base revision, and whether the workspace was installed.
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

/// Percent-encode a path segment value: `:` and `/` both break single-segment path
/// routing, so both are encoded (a served `interrupt:tool/{hash}` id carries `:` AND
/// `/`).
fn pct(segment: &str) -> String {
    segment.replace(':', "%3A").replace('/', "%2F")
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

/// Mint an actor token over the machine-bearer bootstrap route (registers the actor
/// active). Returns the raw token the client presents on later commands.
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

/// Create a durable authoring session over the wire and return its server-minted id.
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
            "payload": { "scope": "worktree", "title": "loop session" },
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "session create: {body}");
    body["data"]["session_id"]
        .as_str()
        .expect("session create returns the session id")
        .to_string()
}

/// Start a prompt turn on a session and return the server-minted run id — the run the
/// `/execute` route gates tool calls against.
async fn start_run(
    state: &Arc<AppState>,
    bearer: &str,
    actor_token: &str,
    session: &str,
) -> String {
    let (status, body) = send(
        router(state),
        "POST",
        &format!("/authoring/v1/sessions/{session}/turns"),
        bearer,
        Some(actor_token),
        Some(json!({
            "api_version": "v1",
            "command": "start_prompt_turn",
            "idempotency_key": "idem:turn:start",
            "payload": { "prompt": "draft the loop plan" },
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "start run: {body}");
    body["data"]["run_id"]
        .as_str()
        .expect("start_prompt_turn returns the run id")
        .to_string()
}

/// Set the worktree scope's operation mode (a human/system-only policy write).
async fn set_mode(state: &Arc<AppState>, bearer: &str, human_token: &str, mode: &str) {
    let (status, body) = send(
        router(state),
        "POST",
        "/authoring/v1/mode",
        bearer,
        Some(human_token),
        Some(json!({
            "api_version": "v1",
            "command": "set_operation_mode",
            "idempotency_key": format!("idem:mode:{mode}"),
            "payload": { "mode": mode },
        })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "set mode {mode}: {body}");
    assert_eq!(body["data"]["mode"], mode, "mode is now {mode}: {body}");
}

fn document(base_revision: &str) -> Value {
    json!({
        "kind": "existing",
        "scope": "worktree",
        "node_id": "doc:loop-plan",
        "stem": "loop-plan",
        "path": DOC_PATH,
        "doc_type": "plan",
        "base_revision": base_revision,
    })
}

/// The `/execute` envelope wrapping one semantic `AgentToolCall`. The envelope
/// `command` field is ignored by the route (the actor + tool come from the principal
/// and the tool name), but rides the shared `CommandEnvelope` wire wrapper.
fn execute_body(envelope_command: &str, tool_call_id: &str, tool: &str, input: Value) -> Value {
    json!({
        "api_version": "v1",
        "command": envelope_command,
        "idempotency_key": format!("idem:execute:{tool_call_id}"),
        "payload": {
            "tool_call_id": tool_call_id,
            "name": tool,
            "idempotency_key": format!("idem:tool:{tool_call_id}"),
            "input": input,
        },
    })
}

/// A `propose_changeset` / create tool input: the domain `CreateProposalRequest`
/// fields flattened alongside the `operation: create` discriminant the tool expects.
fn propose_create_input(session: &str, changeset: &str, base_revision: &str) -> Value {
    json!({
        "operation": "create",
        "session_id": session,
        "changeset_id": changeset,
        "summary": "agent-drafted loop proposal",
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
    })
}

async fn execute(
    state: &Arc<AppState>,
    bearer: &str,
    actor_token: &str,
    run_id: &str,
    body: Value,
) -> (StatusCode, Value) {
    send(
        router(state),
        "POST",
        &format!("/authoring/v1/runs/{run_id}/agent-tools/execute"),
        bearer,
        Some(actor_token),
        Some(body),
    )
    .await
}

/// Grant a queued tool-permission request as a human reviewer (P22-R1: never the
/// requester, never an agent).
async fn grant_permission(
    state: &Arc<AppState>,
    bearer: &str,
    reviewer_token: &str,
    tool_call_id: &str,
) -> (StatusCode, Value) {
    send(
        router(state),
        "POST",
        &format!("/authoring/v1/agent-tools/{tool_call_id}/permission-decision"),
        bearer,
        Some(reviewer_token),
        Some(json!({
            "api_version": "v1",
            "command": "request_tool_permission",
            "idempotency_key": format!("idem:decide:{tool_call_id}"),
            "payload": { "decision": "approve", "comment": "granted" },
        })),
    )
    .await
}

#[tokio::test]
async fn agent_run_loop_suspends_grants_resumes_and_redrives_effectively_once() {
    let (dir, state, base, _core_ready) = worktree_state();
    let _keep = &dir;
    let bearer = state.bearer.clone();

    let agent = issue_token(&state, &bearer, "agent:writer", "agent").await;
    let reviewer = issue_token(&state, &bearer, "human:reviewer", "human").await;
    let session = create_session(&state, &bearer, &agent).await;
    let run_id = start_run(&state, &bearer, &agent, &session).await;

    let tool_call_id = "call_loop_propose";
    let body = execute_body(
        "create_proposal",
        tool_call_id,
        "propose_changeset",
        propose_create_input(&session, "changeset_loop", &base),
    );

    // 1. SUSPEND — a mutating tool without a grant opens a Pending permission and
    //    suspends on an interrupt: a 200 value, NO dispatch, NO terminal record.
    let (status, suspended) = execute(&state, &bearer, &agent, &run_id, body.clone()).await;
    assert_eq!(
        status,
        StatusCode::OK,
        "a suspension is a 200 value: {suspended}"
    );
    assert_eq!(suspended["data"]["disposition"], "awaiting_permission");
    assert_eq!(suspended["data"]["eligibility"]["allowed"], false);
    assert_eq!(
        suspended["data"]["result"],
        Value::Null,
        "nothing dispatched"
    );
    assert!(
        suspended["data"]["tool_call_record"].is_null(),
        "an awaiting call is not yet a terminal tool-call record: {suspended}"
    );
    assert!(
        suspended["tiers"]["semantic"]["available"].is_boolean(),
        "the suspension rides the tiers envelope"
    );
    // The awaiting response SURFACES the raised interrupt id (F1 fix): a wire client
    // resumes-by-id directly from the response, no internal-derivation coupling.
    let interrupt_id = suspended["data"]["interrupt_id"]
        .as_str()
        .expect("the awaiting response surfaces the raised interrupt id")
        .to_string();

    // 2a. GRANT — a distinct human reviewer approves the queued request.
    let (status, decision) = grant_permission(&state, &bearer, &reviewer, tool_call_id).await;
    assert_eq!(status, StatusCode::OK, "grant: {decision}");
    assert_eq!(decision["data"]["status"], "granted");
    assert_eq!(decision["data"]["allowed"], true);

    // 2b. RESUME-BY-ID — resolve the run's interrupt using the id the awaiting response
    //     served (no recompute of any internal derivation).
    let (status, resumed) = send(
        router(&state),
        "POST",
        &format!("/authoring/v1/interrupts/{}/resume", pct(&interrupt_id)),
        &bearer,
        Some(&reviewer),
        Some(json!({
            "api_version": "v1",
            "command": "resume_run",
            "idempotency_key": "idem:resume:loop",
            "payload": { "decision": { "approved": true } },
        })),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "resume-by-id resolves the raised interrupt: {resumed}"
    );
    assert_eq!(resumed["data"]["status"], "resumed");
    assert_eq!(resumed["data"]["replayed"], false);
    assert_eq!(resumed["data"]["interrupt"]["resume_state"], "resolved");
    assert_eq!(
        resumed["data"]["interrupt"]["tool_call_id"], tool_call_id,
        "the resolved interrupt gates this exact tool call: {resumed}"
    );

    // 3a. RE-DRIVE — re-executing the SAME tool_call_id now dispatches the mapped
    //     create_proposal command: a fresh terminal record, the draft is opened.
    let (status, first) = execute(&state, &bearer, &agent, &run_id, body.clone()).await;
    assert_eq!(status, StatusCode::OK, "{first}");
    assert_eq!(first["data"]["disposition"], "dispatched");
    assert_eq!(first["data"]["replayed"], false);
    assert_eq!(first["data"]["command"], "create_proposal");
    assert_eq!(first["data"]["result"]["status"], "draft");
    assert_eq!(first["data"]["result"]["changeset_id"], "changeset_loop");
    assert_eq!(first["data"]["tool_call_record"]["permitted"], true);
    let draft_revision = first["data"]["result"]["changeset_revision"]
        .as_str()
        .expect("the dispatched create returns the draft revision")
        .to_string();

    // 3b. EFFECTIVELY-ONCE — a retry of the same tool_call_id RE-DRIVES (the executor's
    //     own `replayed` flag flips true) while the dispatched command's OWN
    //     idempotency key — deterministically derived from tool_call_id — dedups the
    //     completed create, so the draft is never opened twice (no double-apply).
    let (status, second) = execute(&state, &bearer, &agent, &run_id, body).await;
    assert_eq!(status, StatusCode::OK, "{second}");
    assert_eq!(second["data"]["disposition"], "dispatched");
    assert_eq!(
        second["data"]["replayed"], true,
        "the executor re-drives: {second}"
    );
    assert_eq!(
        second["data"]["result"]["changeset_revision"], draft_revision,
        "the re-drive dedups to the SAME draft revision (no double-create): {second}"
    );

    // No double-apply proven at the corpus: the changeset appears exactly once.
    let (status, list) = send(
        router(&state),
        "GET",
        "/authoring/v1/proposals",
        &bearer,
        None,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "list: {list}");
    let matches = list["data"]["items"]
        .as_array()
        .expect("items array")
        .iter()
        .filter(|item| item["changeset_id"] == "changeset_loop")
        .count();
    assert_eq!(
        matches, 1,
        "the re-driven tool call created the changeset exactly once: {list}"
    );
}

#[tokio::test]
async fn autonomous_request_approval_auto_approves_applies_and_lists_after_the_fact() {
    let (dir, state, base, core_ready) = worktree_state();
    let _keep = &dir;
    let bearer = state.bearer.clone();

    let agent = issue_token(&state, &bearer, "agent:writer", "agent").await;
    let human = issue_token(&state, &bearer, "human:reviewer", "human").await;

    // Autonomous mode: a Mutating tool auto-permits (its proposal still rides the full
    // changeset approval matrix), so the agent's tool calls dispatch without a human
    // tool-gate — and submit auto-approves + auto-applies under system authority.
    set_mode(&state, &bearer, &human, "autonomous").await;

    let session = create_session(&state, &bearer, &agent).await;
    let run_id = start_run(&state, &bearer, &agent, &session).await;
    let changeset = "changeset_auto";

    // Draft the proposal via the propose tool — auto-permitted under autonomous, so it
    // dispatches immediately (no suspend).
    let (status, created) = execute(
        &state,
        &bearer,
        &agent,
        &run_id,
        execute_body(
            "create_proposal",
            "call_auto_propose",
            "propose_changeset",
            propose_create_input(&session, changeset, &base),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "autonomous propose: {created}");
    assert_eq!(created["data"]["disposition"], "dispatched");
    assert_eq!(created["data"]["result"]["status"], "draft");
    let draft_revision = created["data"]["result"]["changeset_revision"]
        .as_str()
        .expect("draft revision")
        .to_string();

    // request_approval — auto-permitted, dispatches the submit composite which
    // auto-approves (system reviewer) and auto-applies under autonomous policy.
    let (status, approved) = execute(
        &state,
        &bearer,
        &agent,
        &run_id,
        execute_body(
            "submit_for_review",
            "call_auto_approval",
            "request_approval",
            json!({
                "changeset_id": changeset,
                "expected_revision": draft_revision,
                "summary": "ready under autonomous policy",
            }),
        ),
    )
    .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "autonomous request_approval: {approved}"
    );
    assert_eq!(approved["data"]["disposition"], "dispatched");
    assert_eq!(approved["data"]["command"], "submit_for_review");
    assert_eq!(approved["data"]["result"]["status"], "submitted");
    assert_eq!(
        approved["data"]["result"]["mode"]["auto_approval"]["status"], "approved",
        "autonomous mode auto-approves under system authority: {approved}"
    );
    assert_eq!(
        approved["data"]["result"]["mode"]["auto_approval"]["approval"]["decision"]["reviewer"]["kind"],
        "system",
        "the auto-approval is recorded under the system actor: {approved}"
    );
    assert!(
        approved["data"]["result"]["mode"]["auto_apply"].is_object(),
        "autonomous mode attempts an auto-apply: {approved}"
    );

    // Listed AFTER-THE-FACT: the applied-under-policy lane surfaces the changeset from
    // its recorded system-policy approval marker (present regardless of core).
    let (status, list) = send(
        router(&state),
        "GET",
        "/authoring/v1/proposals",
        &bearer,
        None,
        None,
    )
    .await;
    assert_eq!(status, StatusCode::OK, "list: {list}");
    let after_fact = &list["data"]["applied_under_policy"]["items"][0];
    assert_eq!(
        after_fact["proposal"]["changeset_id"], changeset,
        "the auto-approved changeset is listed after-the-fact: {list}"
    );
    assert_eq!(after_fact["mode"], "autonomous");
    assert_eq!(after_fact["system_actor"]["kind"], "system");

    // LIVE-CORE HONESTY: only a real core makes the auto-apply WRITE land — assert the
    // applied receipt + status then; otherwise it degrades honestly.
    if core_ready {
        assert_eq!(
            approved["data"]["result"]["mode"]["auto_apply"]["receipt"]["state"], "applied",
            "a real vaultspec workspace applies the auto-apply write: {approved}"
        );
        assert_eq!(
            after_fact["proposal"]["status"], "applied",
            "the after-the-fact row reports the applied changeset: {list}"
        );
        let materialized = std::fs::read_to_string(dir.path().join(DOC_PATH)).unwrap();
        assert!(
            materialized.contains("materialized body"),
            "the auto-apply materialized the body edit: {materialized}"
        );
    }
}

#[tokio::test]
async fn execute_matrix_readonly_free_mutating_gated_granted_dispatches_replay_no_double_apply() {
    let (dir, state, _base, _core_ready) = worktree_state();
    let _keep = &dir;
    let bearer = state.bearer.clone();

    let agent = issue_token(&state, &bearer, "agent:writer", "agent").await;
    let reviewer = issue_token(&state, &bearer, "human:reviewer", "human").await;
    let session = create_session(&state, &bearer, &agent).await;
    let run_id = start_run(&state, &bearer, &agent, &session).await;

    // MATRIX ROW 1 — a ReadOnly tool flows FREE: no permission gate, records its
    // permitted tool-call record, and returns the PREPARED read descriptor. No command
    // is executed (the caller pulls the read itself through the dedicated read routes).
    let (status, read) = execute(
        &state,
        &bearer,
        &agent,
        &run_id,
        execute_body(
            "read_context",
            "call_matrix_read",
            "read_context",
            json!({ "target": "session", "session_id": session }),
        ),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "read tool: {read}");
    assert_eq!(read["data"]["disposition"], "dispatched");
    assert_eq!(read["data"]["eligibility"]["allowed"], true);
    assert_eq!(
        read["data"]["result"]["kind"], "read_context",
        "the prepared read descriptor is served, not a command outcome: {read}"
    );
    assert_eq!(
        read["data"]["result"]["input"]["target"], "session",
        "the descriptor carries the resolved read target: {read}"
    );
    assert_eq!(
        read["data"]["tool_call_record"]["permitted"], true,
        "the read tool's permitted tool-call record was recorded by the gate: {read}"
    );

    // MATRIX ROW 2 — a Mutating tool WITHOUT a grant is GATED (a value, no dispatch).
    let cancel_input = json!({
        "target": "run",
        "run_id": run_id,
        "reason": "matrix cancel",
    });
    let cancel_tool = "call_matrix_cancel";
    let cancel_body = execute_body("cancel_run", cancel_tool, "cancel", cancel_input);
    let (status, gated) = execute(&state, &bearer, &agent, &run_id, cancel_body.clone()).await;
    assert_eq!(
        status,
        StatusCode::OK,
        "gated mutating tool is a 200 value: {gated}"
    );
    assert_eq!(gated["data"]["disposition"], "awaiting_permission");
    assert_eq!(gated["data"]["eligibility"]["allowed"], false);
    assert_eq!(
        gated["data"]["result"],
        Value::Null,
        "no dispatch while gated"
    );
    assert!(
        gated["data"]["interrupt_id"].as_str().is_some(),
        "the gated response surfaces the raised interrupt id (F1): {gated}"
    );

    // MATRIX ROW 3 — grant, then the SAME tool dispatches.
    let (status, decision) = grant_permission(&state, &bearer, &reviewer, cancel_tool).await;
    assert_eq!(status, StatusCode::OK, "grant: {decision}");
    assert_eq!(decision["data"]["status"], "granted");

    let (status, dispatched) = execute(&state, &bearer, &agent, &run_id, cancel_body.clone()).await;
    assert_eq!(status, StatusCode::OK, "{dispatched}");
    assert_eq!(dispatched["data"]["disposition"], "dispatched");
    assert_eq!(dispatched["data"]["replayed"], false);
    assert_eq!(dispatched["data"]["command"], "cancel_run");
    assert_eq!(
        dispatched["data"]["result"]["status"], "cancelled",
        "the granted cancel tool cancels the run: {dispatched}"
    );

    // MATRIX ROW 4 — a replay of the granted tool_call_id RE-DRIVES effectively-once:
    // the executor replays while the dispatched command's tool_call_id-derived
    // idempotency key dedups, so the run is never double-cancelled (no double-apply).
    let (status, replay) = execute(&state, &bearer, &agent, &run_id, cancel_body).await;
    assert_eq!(status, StatusCode::OK, "{replay}");
    assert_eq!(replay["data"]["disposition"], "dispatched");
    assert_eq!(
        replay["data"]["replayed"], true,
        "the executor re-drives: {replay}"
    );
    assert_eq!(
        replay["data"]["result"]["status"], "cancelled",
        "the re-drive dedups to the same terminal cancellation (no double-apply): {replay}"
    );
}
