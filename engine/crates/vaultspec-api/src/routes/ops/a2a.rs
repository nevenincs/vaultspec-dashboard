//! The `/ops/a2a/{verb}` orchestration control pass-through (a2a-orchestration-
//! edge ADR D1/D2): the engine forwards a FIXED six-verb whitelist to the
//! resident vaultspec-a2a gateway and nothing else, wrapping the sibling's
//! response VERBATIM inside the shared tiers envelope. It is the rag ops
//! template retargeted at an HTTP sibling — one namespace, tiers-honest, the
//! sibling envelope byte-for-byte under `data.envelope`.
//!
//! Two decisions govern the shape, both mirroring the shipped rag broker:
//!
//! - **Sibling-down is a degraded 200, not a 5xx** (the rag ops template's
//!   `degradation-is-read-from-tiers`): when machine-global discovery finds no
//!   fresh, healthy a2a service, every verb returns 200 with the `agent` tier
//!   degraded and a null envelope. A 502/504 is reserved for a genuine proxy
//!   fault — the sibling was discovered running but its round-trip crashed
//!   (502) or timed out (504). A business refusal the sibling itself answers
//!   (a 4xx/5xx with a body) forwards VERBATIM at 200 with its `sibling_status`,
//!   exactly as the rag write runner forwards a `status:"failed"` envelope.
//!
//! - **Actors and tokens are engine-provisioned at run-start** (ADR D2): the
//!   brokered `run-start` verb registers one agent actor per pipeline role and
//!   mints a per-role actor token through the EXISTING actor-token surface, then
//!   injects the bundle into the forwarded payload. Token values ride only the
//!   loopback body and appear in NO log line at any level.
//!
//! Every forwarded call carries BOTH an output byte ceiling (the loopback
//! transport's `MAX_RAG_BODY` OOM guard) and a wall-clock timeout
//! (`subprocess-calls-carry-cap-and-timeout`), and machine-global discovery is
//! attach-never-own: the engine reaches whatever a2a service is resident, never
//! starts or owns one.

use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use rag_client::client::{LoopbackTransport, RagError, RagTransport};
use serde_json::{Value, json};

use crate::app::{AppState, ScopeCell, now_ms};
use crate::authoring::actors::{ActorDisplayMetadata, ActorRecordInput};
use crate::authoring::model::{ActorId, ActorKind, ActorRef, CommandKind};

use super::ApiResult;

/// The FIXED six-verb whitelist (ADR D1 + 2026-07-19 amendment): orchestration
/// control and one bounded active-run recovery read only, with no mutating vault
/// semantics. A verb outside this set is a 403 BEFORE any discovery or
/// round-trip — the whitelist miss never reaches the sibling.
const A2A_WHITELIST: &[&str] = &[
    "run-start",
    "run-status",
    "run-cancel",
    "presets-list",
    "service-state",
    "active-runs",
];

/// The canonical pipeline roles the engine provisions an actor + token for at
/// run-start (ADR D2). The supervisor is a DISTINCT actor so the self-approval
/// ban binds per role. Kept as a fixed set: identity authority stays with the
/// engine, never re-derived from a client-named role list.
const A2A_PIPELINE_ROLES: &[&str] = &[
    "researcher",
    "analyst",
    "planner",
    "executor",
    "reviewer",
    "supervisor",
];

/// Heartbeat staleness threshold for the a2a discovery file: the resident
/// gateway refreshes every 15s and a consumer treats a heartbeat older than
/// 120s as a crash (mirrors the a2a `HEARTBEAT_STALE_MS` and rag's own bound).
const A2A_HEARTBEAT_STALE_MS: i64 = 120_000;

/// The ungated `/health` liveness budget for the attach-never-own predicate: a
/// short loopback probe against a service we just discovered.
const A2A_HEALTH_TIMEOUT: Duration = Duration::from_millis(1500);

/// Wall-clock budget for a brokered READ verb (run-status, presets-list,
/// service-state): a fast recovery-snapshot / listing read.
const A2A_READ_BUDGET: Duration = Duration::from_secs(15);

/// Wall-clock budget for a brokered CONTROL verb (run-start, run-cancel):
/// run-start dispatches a worker, which is legitimately slower than a read, so
/// it gets a wider — but still bounded — ceiling. A breach is a 504.
const A2A_CONTROL_BUDGET: Duration = Duration::from_secs(60);

/// Run-scoped actor-token lifetime (resource-bounds: a credential is bounded at
/// creation). Clamped by `MAX_ACTOR_TOKEN_LIFETIME_MS` in the issue path
/// regardless; a generous run window that still expires.
const A2A_RUN_TOKEN_LIFETIME_MS: i64 = 24 * 3_600 * 1_000;

/// The `run-start` message cap, matching the a2a gateway's own 64 KiB
/// `RunStartRequest.message` bound so the engine rejects an oversized prompt at
/// its boundary rather than forwarding a body the sibling will reject.
const MAX_A2A_MESSAGE_BYTES: usize = 65_536;

const MAX_A2A_PRESET_CHARS: usize = 64;
const MAX_A2A_PROFILE_CHARS: usize = 64;
const MAX_A2A_FEATURE_CHARS: usize = 128;
const MAX_A2A_TITLE_CHARS: usize = 200;
const MAX_A2A_RUN_ID_CHARS: usize = 128;
const MAX_A2A_SCOPE_CHARS: usize = 4096;

/// The typed request body for `POST /ops/a2a/{verb}`. Every field is optional at
/// the type level and validated/bounded per verb before anything reaches the
/// sibling; `actor_tokens` is deliberately ABSENT — the engine mints and injects
/// them, a client can never supply an identity (ADR D2).
#[derive(serde::Deserialize, Default)]
pub struct A2aVerbBody {
    /// Client-observed active scope used only as a generation fence for
    /// run-start and active-runs. The engine compares it with the SAME ScopeCell
    /// whose root it injects, then drops it; it is never forwarded as authority.
    #[serde(default)]
    pub expected_scope: Option<String>,
    /// The stable run/idempotency id. REQUIRED for run-status and run-cancel
    /// (it is the URL path segment); OPTIONAL for run-start (dispatch-exactly-
    /// once when present). Restricted to a path-safe token so it can never carry
    /// a path separator into `/v1/runs/{run_id}`.
    #[serde(default)]
    pub run_id: Option<String>,
    /// run-start: the team preset id (required for run-start).
    #[serde(default)]
    pub team_preset: Option<String>,
    /// run-start: the opening prompt/message (required, non-empty, capped).
    #[serde(default)]
    pub message: Option<String>,
    /// run-start: the target feature tag for a document-authoring run.
    #[serde(default)]
    pub feature_tag: Option<String>,
    /// run-start: the selected model profile id.
    #[serde(default)]
    pub profile_id: Option<String>,
    /// run-start: an optional human title.
    #[serde(default)]
    pub title: Option<String>,
    /// run-start: the autonomy flag forwarded verbatim.
    #[serde(default)]
    pub autonomous: Option<bool>,
}

/// The a2a discovery record shape (`~/.vaultspec-a2a/service.json`): the R8
/// `ServiceInfo` contract the resident gateway publishes. Only the fields the
/// engine needs to build a transport + classify freshness are read; the
/// `service_token` is the sibling bearer for the loopback call.
#[derive(Debug, Clone, serde::Deserialize)]
struct A2aServiceInfo {
    port: u16,
    #[serde(default)]
    #[allow(dead_code)]
    pid: Option<u32>,
    #[serde(default)]
    last_heartbeat: Option<i64>,
    #[serde(default)]
    service_token: Option<String>,
}

/// The typed outcome of scanning the a2a discovery candidates, mirroring rag's
/// `DiscoveryOutcome`: `Fresh` licenses a round-trip, everything else is a
/// known-down sibling degraded honestly at 200.
#[derive(Debug, Clone)]
enum A2aDiscovery {
    Fresh(A2aServiceInfo),
    /// A present file that is not a live service: stale heartbeat, malformed
    /// record, or absent file. Carried with the truthful reason.
    Down {
        reason: String,
    },
}

/// The machine-global a2a discovery file candidates: the `VAULTSPEC_A2A_HOME`
/// env override FIRST (mirrors the sibling's own `a2a_home` resolution), then
/// the default `~/.vaultspec-a2a/service.json`. a2a is one resident service per
/// machine, so there is no per-scope candidate.
fn a2a_service_json_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(home) = std::env::var_os("VAULTSPEC_A2A_HOME") {
        candidates.push(PathBuf::from(home).join("service.json"));
    }
    let user_home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"));
    if let Some(user_home) = user_home {
        candidates.push(
            PathBuf::from(user_home)
                .join(".vaultspec-a2a")
                .join("service.json"),
        );
    }
    candidates
}

/// Classify the a2a discovery candidates filesystem-only (no `/health` probe):
/// the first readable record with a fresh heartbeat is `Fresh`; a stale
/// heartbeat, an unreadable record, or no file at all is `Down` with a truthful
/// reason. Hermetic over an explicit candidate list for tests.
fn discover_a2a_at(candidates: &[PathBuf]) -> A2aDiscovery {
    let mut malformed: Option<String> = None;
    for path in candidates {
        let Ok(raw) = std::fs::read_to_string(path) else {
            continue;
        };
        match serde_json::from_str::<A2aServiceInfo>(&raw) {
            Ok(info) => {
                if let Some(heartbeat) = info.last_heartbeat {
                    let now = now_ms();
                    if now.saturating_sub(heartbeat) > A2A_HEARTBEAT_STALE_MS {
                        return A2aDiscovery::Down {
                            reason: "a2a gateway heartbeat stale (service crashed or stopped)"
                                .to_string(),
                        };
                    }
                }
                return A2aDiscovery::Fresh(info);
            }
            Err(e) => malformed = Some(format!("a2a service.json unreadable: {e}")),
        }
    }
    A2aDiscovery::Down {
        reason: malformed
            .unwrap_or_else(|| "a2a gateway not running (no service.json discovered)".to_string()),
    }
}

/// Resolve the RESIDENT a2a gateway's endpoint (`port`, bearer) under the
/// attach-never-own predicate, or the truthful "a2a down" reason. Fresh discovery
/// gates a cheap ungated `/health` liveness confirm (ADR D1's `service file +
/// heartbeat freshness + ungated health`); either gate failing is a known-down
/// sibling the caller degrades honestly on, never a 5xx. Shared by the pass-through
/// transport (`ops_a2a`) and the run-stream relay (`a2a_stream`).
pub(super) fn a2a_endpoint() -> Result<(u16, Option<String>), String> {
    a2a_endpoint_from(&a2a_service_json_candidates())
}

/// [`a2a_endpoint`] over an explicit candidate list — hermetic for a real-socket
/// loopback test, avoiding the process-global `VAULTSPEC_A2A_HOME` env under
/// parallel test threads.
fn a2a_endpoint_from(candidates: &[PathBuf]) -> Result<(u16, Option<String>), String> {
    match discover_a2a_at(candidates) {
        A2aDiscovery::Fresh(info) => {
            // Ungated `/health` liveness confirm on the discovered port: a fresh
            // heartbeat says "a service wrote this recently", the 200 answer
            // proves it is actually serving. An unreachable/failing /health is a
            // discovered-but-not-serving sibling — known-down, degraded honestly.
            let probe = LoopbackTransport {
                port: info.port,
                bearer: info.service_token.clone(),
                timeout: A2A_HEALTH_TIMEOUT,
            };
            match probe.get("/health") {
                Ok(_) => Ok((info.port, info.service_token)),
                Err(e) => Err(format!(
                    "a2a gateway discovered but /health unreachable: {e}"
                )),
            }
        }
        A2aDiscovery::Down { reason } => Err(reason),
    }
}

/// Build a bounded loopback transport to a RESIDENT a2a gateway, or the truthful
/// "a2a down" reason (the pass-through's per-verb request/response transport). The
/// returned transport carries the per-verb `budget` as its wall-clock and the
/// discovered bearer.
fn a2a_transport(budget: Duration) -> Result<LoopbackTransport, String> {
    let (port, bearer) = a2a_endpoint()?;
    Ok(LoopbackTransport {
        port,
        bearer,
        timeout: budget,
    })
}

/// Validate a bounded, path-safe run id: non-empty, not flag-shaped, restricted
/// to `[A-Za-z0-9_-]` so it can never carry a path separator, `..`, or shell
/// metacharacter into the `/v1/runs/{run_id}` URL. Length-bounded to the a2a
/// contract's 128-char ceiling.
fn validate_run_id(state: &AppState, run_id: &str) -> Result<String, (StatusCode, Json<Value>)> {
    let ok = !run_id.is_empty()
        && run_id.len() <= MAX_A2A_RUN_ID_CHARS
        && !run_id.starts_with('-')
        && run_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');
    if !ok {
        return Err(super::super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!(
                "`run_id` `{run_id}` must be a non-empty path-safe token \
                 (letters, digits, `-`, `_`; no leading `-`; <= {MAX_A2A_RUN_ID_CHARS} chars)"
            ),
        ));
    }
    Ok(run_id.to_string())
}

/// Validate a bounded free-text field (`title`) capped at `max` chars, rejecting
/// control characters. Optional-value helper: `None` passes through.
fn validate_bounded_text(
    state: &AppState,
    field: &str,
    value: &str,
    max: usize,
) -> Result<String, (StatusCode, Json<Value>)> {
    if value.chars().count() > max || value.chars().any(|c| c.is_control()) {
        return Err(super::super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!("`{field}` must be <= {max} chars with no control characters"),
        ));
    }
    Ok(value.to_string())
}

/// Validate a bounded token field (`team_preset`, `profile_id`, `feature_tag`):
/// non-empty, capped, restricted to the kebab/word/dot/colon grammar the sibling
/// accepts, with no leading `-` (the flag-injection guard).
fn validate_bounded_token(
    state: &AppState,
    field: &str,
    value: &str,
    max: usize,
) -> Result<String, (StatusCode, Json<Value>)> {
    let ok = !value.is_empty()
        && value.chars().count() <= max
        && !value.starts_with('-')
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-' | b'.' | b':'));
    if !ok {
        return Err(super::super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!(
                "`{field}` `{value}` must be a non-empty token \
                 (letters, digits, `_`, `-`, `.`, `:`; no leading `-`; <= {max} chars)"
            ),
        ));
    }
    Ok(value.to_string())
}

/// Fence a scope-sensitive operation against a concurrent workspace switch.
/// The browser may echo the served scope, but it can never choose the forwarded
/// root: equality is checked against the selected cell and only `cell.root` is
/// injected downstream.
fn validate_expected_scope(
    state: &AppState,
    cell: &ScopeCell,
    body: &A2aVerbBody,
    verb: &str,
) -> Result<(), (StatusCode, Json<Value>)> {
    let expected = body.expected_scope.as_deref().ok_or_else(|| {
        super::super::api_error(
            state,
            StatusCode::BAD_REQUEST,
            format!("{verb} requires an `expected_scope` generation fence"),
        )
    })?;
    let expected = validate_bounded_text(state, "expected_scope", expected, MAX_A2A_SCOPE_CHARS)?;
    // The browser receives the route token, not the filesystem's raw spelling.
    // On Windows a cold cell may retain a `\\?\` prefix while `scope_token`
    // deliberately serves the canonical drive-path spelling. Compare like with
    // like; the downstream workspace_root remains the engine-owned real root.
    let actual = crate::routes::scope_token(&cell.root);
    if expected != actual {
        return Err(super::super::api_error(
            state,
            StatusCode::CONFLICT,
            format!("active scope changed before {verb}; retry against the served scope"),
        ));
    }
    Ok(())
}

/// The forwarded HTTP call an engine verb resolves to: the method, the sibling
/// path, an optional JSON body, and the wall-clock budget.
#[derive(Debug)]
struct ForwardedCall {
    method: Method,
    path: String,
    body: Option<Value>,
    budget: Duration,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Method {
    Get,
    Post,
}

/// Percent-encode a query-parameter value: everything outside the unreserved set
/// (`ALPHA / DIGIT / - . _ ~`) is `%`-escaped, so a Windows path (drive colon,
/// backslashes) rides the `workspace_root` query safely.
fn percent_encode(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~') {
            out.push(byte as char);
        } else {
            out.push('%');
            out.push_str(&format!("{byte:02X}"));
        }
    }
    out
}

/// Resolve a whitelisted verb to its forwarded a2a call, validating and bounding
/// every user-controlled argument at the engine boundary FIRST (a bad value is a
/// tiers-carrying 400 that never reaches the sibling). The `run-start` body is
/// built here WITHOUT the actor-token bundle; the handler injects it after
/// provisioning so token values never flow through this pure step.
fn build_forwarded_call(
    state: &AppState,
    verb: &str,
    cell: &ScopeCell,
    body: &A2aVerbBody,
) -> Result<ForwardedCall, (StatusCode, Json<Value>)> {
    match verb {
        "service-state" => Ok(ForwardedCall {
            method: Method::Get,
            path: "/v1/service".to_string(),
            body: None,
            budget: A2A_READ_BUDGET,
        }),
        "presets-list" => {
            // The workspace_root is the ENGINE-controlled active scope root, never
            // a client field, so the caller can never point preset discovery at an
            // arbitrary path (mirrors the rag reindex `project_root` discipline).
            let root = crate::routes::scope_token(&cell.root);
            Ok(ForwardedCall {
                method: Method::Get,
                path: format!("/v1/presets?workspace_root={}", percent_encode(&root)),
                body: None,
                budget: A2A_READ_BUDGET,
            })
        }
        "active-runs" => {
            // Reload-recovery of the live team-run binding (a2a-edge D3/D5): which
            // runs are still non-terminal for THIS workspace, so a reloaded panel
            // can re-bind its transcript to a run it lost the client-side handle
            // to. `workspace_root` is the ENGINE-controlled active scope root, never
            // a client field (mirrors presets-list), and `state` is pinned to
            // `active` so the verb can only ever list live runs — an identity-only
            // projection the a2a gateway bounds (`ActiveRunsResponse`, capped).
            validate_expected_scope(state, cell, body, "active-runs")?;
            let root = cell.root.to_string_lossy();
            let mut path = format!(
                "/v1/runs?state=active&workspace_root={}",
                percent_encode(&root)
            );
            if let Some(feature_tag) = body.feature_tag.as_deref() {
                let feature_tag = validate_bounded_token(
                    state,
                    "feature_tag",
                    feature_tag,
                    MAX_A2A_FEATURE_CHARS,
                )?;
                path.push_str("&feature_tag=");
                path.push_str(&percent_encode(&feature_tag));
            }
            // Two rows distinguish a unique binding from ambiguity. The sibling
            // retains its own harder response and scan caps behind this narrower
            // dashboard-specific bound.
            path.push_str("&limit=2");
            Ok(ForwardedCall {
                method: Method::Get,
                path,
                body: None,
                budget: A2A_READ_BUDGET,
            })
        }
        "run-status" => {
            let run_id = body.run_id.as_deref().ok_or_else(|| {
                super::super::api_error(
                    state,
                    StatusCode::BAD_REQUEST,
                    "run-status requires a `run_id`".to_string(),
                )
            })?;
            let run_id = validate_run_id(state, run_id)?;
            Ok(ForwardedCall {
                method: Method::Get,
                path: format!("/v1/runs/{run_id}"),
                body: None,
                budget: A2A_READ_BUDGET,
            })
        }
        "run-cancel" => {
            let run_id = body.run_id.as_deref().ok_or_else(|| {
                super::super::api_error(
                    state,
                    StatusCode::BAD_REQUEST,
                    "run-cancel requires a `run_id`".to_string(),
                )
            })?;
            let run_id = validate_run_id(state, run_id)?;
            Ok(ForwardedCall {
                method: Method::Post,
                path: format!("/v1/runs/{run_id}/cancel"),
                body: Some(json!({})),
                budget: A2A_CONTROL_BUDGET,
            })
        }
        "run-start" => {
            validate_expected_scope(state, cell, body, "run-start")?;
            let team_preset = body.team_preset.as_deref().ok_or_else(|| {
                super::super::api_error(
                    state,
                    StatusCode::BAD_REQUEST,
                    "run-start requires a `team_preset`".to_string(),
                )
            })?;
            let team_preset =
                validate_bounded_token(state, "team_preset", team_preset, MAX_A2A_PRESET_CHARS)?;

            let message = body.message.as_deref().unwrap_or_default();
            if message.trim().is_empty() {
                return Err(super::super::api_error(
                    state,
                    StatusCode::BAD_REQUEST,
                    "run-start requires a non-empty `message`".to_string(),
                ));
            }
            if message.len() > MAX_A2A_MESSAGE_BYTES {
                return Err(super::super::api_error(
                    state,
                    StatusCode::BAD_REQUEST,
                    format!("run-start `message` exceeds the {MAX_A2A_MESSAGE_BYTES}-byte ceiling"),
                ));
            }

            let mut forwarded = json!({
                "team_preset": team_preset,
                "message": message,
                // Workspace provenance is engine-owned and durable in a2a run
                // metadata. It is the selector the bounded active-runs read
                // matches after reload; no browser-supplied metadata is accepted.
                "metadata": {
                    "workspace_root": crate::routes::scope_token(&cell.root),
                },
            });
            let obj = forwarded.as_object_mut().expect("object literal");
            if let Some(feature_tag) = body.feature_tag.as_deref() {
                obj.insert(
                    "feature_tag".to_string(),
                    json!(validate_bounded_token(
                        state,
                        "feature_tag",
                        feature_tag,
                        MAX_A2A_FEATURE_CHARS
                    )?),
                );
            }
            if let Some(profile_id) = body.profile_id.as_deref() {
                obj.insert(
                    "profile_id".to_string(),
                    json!(validate_bounded_token(
                        state,
                        "profile_id",
                        profile_id,
                        MAX_A2A_PROFILE_CHARS
                    )?),
                );
            }
            if let Some(title) = body.title.as_deref() {
                obj.insert(
                    "title".to_string(),
                    json!(validate_bounded_text(
                        state,
                        "title",
                        title,
                        MAX_A2A_TITLE_CHARS
                    )?),
                );
            }
            if let Some(run_id) = body.run_id.as_deref() {
                obj.insert("run_id".to_string(), json!(validate_run_id(state, run_id)?));
            }
            if let Some(autonomous) = body.autonomous {
                obj.insert("autonomous".to_string(), json!(autonomous));
            }
            Ok(ForwardedCall {
                method: Method::Post,
                path: "/v1/runs".to_string(),
                body: Some(forwarded),
                budget: A2A_CONTROL_BUDGET,
            })
        }
        _ => Err(super::super::api_error(
            state,
            StatusCode::FORBIDDEN,
            format!("verb `{verb}` is not whitelisted (a2a control plane)"),
        )),
    }
}

/// Provision one agent actor + a per-role actor token for every canonical
/// pipeline role (ADR D2) through the EXISTING actor-token surface, and build the
/// `ActorTokenBundle` the run-start payload carries. Register-or-require each
/// actor active so its later authoring commands resolve a live principal
/// (mirrors the `issue_actor_token` handler), then mint its token. The
/// `engine_bearer` is left absent: the worker resolves the machine bearer from
/// the engine discovery file, so no bearer secret flows through this path.
///
/// The returned `Value` carries RAW token values and MUST NOT be logged; it is
/// injected straight into the forwarded body and dropped.
fn provision_actor_token_bundle(state: &AppState) -> Result<Value, (StatusCode, Json<Value>)> {
    let now = now_ms();
    let issued_by = ActorId::new("system:bootstrap").expect("issuance principal id is valid");

    // Build the per-role actor refs BEFORE the store transaction so an id
    // construction fault maps to a typed error rather than colliding with the
    // store's error type inside the unit-of-work closure. The ids are
    // constant-derived and valid, but a failure is surfaced honestly, never
    // panicked.
    let mut role_actors: Vec<(&'static str, ActorRef)> =
        Vec::with_capacity(A2A_PIPELINE_ROLES.len());
    for role in A2A_PIPELINE_ROLES {
        let id = ActorId::new(format!("agent:{role}")).map_err(|e| {
            super::super::api_error(
                state,
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("invalid pipeline role id: {e}"),
            )
        })?;
        role_actors.push((
            role,
            ActorRef {
                id,
                kind: ActorKind::Agent,
                delegated_by: None,
            },
        ));
    }

    let tokens = state
        .with_authoring_store(|store| {
            store.with_unit_of_work(CommandKind::CreateSession, |uow| {
                let mut tokens = serde_json::Map::new();
                for (role, actor) in &role_actors {
                    let display = ActorDisplayMetadata::new(actor.id.as_str(), None);
                    uow.actors().put_record(ActorRecordInput::active(
                        actor.clone(),
                        display,
                        now,
                    ))?;
                    let issued = uow.actor_tokens().issue(
                        actor,
                        &issued_by,
                        now,
                        A2A_RUN_TOKEN_LIFETIME_MS,
                    )?;
                    tokens.insert((*role).to_string(), Value::String(issued.raw_token));
                }
                Ok(tokens)
            })
        })
        .map_err(|_| {
            // The error is a store fault, not a token value — safe to surface. The
            // message is deliberately generic and NEVER embeds a token.
            super::super::api_error(
                state,
                StatusCode::BAD_GATEWAY,
                "failed to provision run-start actor tokens".to_string(),
            )
        })?;

    Ok(json!({ "tokens": Value::Object(tokens), "engine_bearer": Value::Null }))
}

/// Map a loopback transport error to the engine response (ADR D1 sibling-down
/// ruling): a business refusal the sibling ANSWERED (any non-2xx with a body)
/// forwards VERBATIM at 200 with its `sibling_status`; a genuine proxy fault —
/// the sibling was discovered running but the round-trip crashed or timed out —
/// is a 502/504. A read timeout surfaces as an `Io` error whose kind is
/// `TimedOut`/`WouldBlock`; every other transport fault is a crash (502).
fn map_transport_error(
    state: &AppState,
    cell: &ScopeCell,
    error: RagError,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    match error {
        // The sibling answered with a non-2xx: a business refusal (422 ineligible,
        // 409 conflict, 404 not found, or its own 5xx). Forward the body VERBATIM
        // with the sibling status so the client branches on it; tiers stay healthy
        // because the sibling IS up (it answered).
        RagError::Http { status, body } => {
            let envelope = serde_json::from_str::<Value>(&body).unwrap_or(Value::String(body));
            Ok(super::super::envelope(
                json!({ "envelope": envelope, "sibling_status": status }),
                super::super::query_tiers(cell),
                None,
            ))
        }
        // A read timeout after the sibling was discovered running: a genuine proxy
        // timeout, 504 (matches the rag runner's timeout mapping).
        RagError::Io(io)
            if matches!(
                io.kind(),
                std::io::ErrorKind::TimedOut | std::io::ErrorKind::WouldBlock
            ) =>
        {
            Err(super::super::api_error(
                state,
                StatusCode::GATEWAY_TIMEOUT,
                format!("a2a gateway timed out: {io}"),
            ))
        }
        // Any other transport fault (connection refused mid-flight, malformed
        // response): the sibling crashed between discovery and the call — 502.
        RagError::Io(io) => Err(super::super::api_error(
            state,
            StatusCode::BAD_GATEWAY,
            format!("a2a gateway round-trip failed: {io}"),
        )),
        RagError::Protocol => Err(super::super::api_error(
            state,
            StatusCode::BAD_GATEWAY,
            "a2a gateway returned a malformed HTTP response".to_string(),
        )),
        RagError::ServiceJson(e) => Err(super::super::api_error(
            state,
            StatusCode::BAD_GATEWAY,
            format!("a2a gateway response unreadable: {e}"),
        )),
    }
}

/// `POST /ops/a2a/{verb}` — the whitelisted a2a orchestration control pass-through
/// (ADR D1/D2). A verb outside the six-verb whitelist is a 403 before any
/// discovery. A known-down sibling degrades the `agent` tier at 200; a genuine
/// proxy crash/timeout is 502/504; a sibling answer (2xx or a business refusal)
/// forwards VERBATIM under `data.envelope`. run-start provisions per-role actor
/// tokens and injects them into the forwarded payload; token values are never
/// logged.
pub async fn ops_a2a(
    State(state): State<Arc<AppState>>,
    Path(verb): Path<String>,
    body: Option<Json<A2aVerbBody>>,
) -> ApiResult {
    // Whitelist miss: 403 with the tiers block BEFORE any discovery or round-trip.
    if !A2A_WHITELIST.contains(&verb.as_str()) {
        return Err(super::super::api_error(
            &state,
            StatusCode::FORBIDDEN,
            format!("verb `{verb}` is not whitelisted (a2a control plane)"),
        ));
    }
    let cell = state.active_cell();
    let body = body.map(|Json(b)| b).unwrap_or_default();

    // Validate + build the forwarded call at the engine boundary (a bad arg is a
    // tiers-carrying 400 that never reaches the sibling).
    let mut call = build_forwarded_call(&state, &verb, &cell, &body)?;

    // run-start provisioning moment (ADR D2): mint per-role actor tokens and
    // inject the bundle into the forwarded body. Done AFTER arg validation so a
    // malformed request never triggers token minting.
    if verb == "run-start" {
        let bundle = provision_actor_token_bundle(&state)?;
        if let Some(obj) = call.body.as_mut().and_then(Value::as_object_mut) {
            obj.insert("actor_tokens".to_string(), bundle);
        }
    }

    // Attach-never-own discovery: build a transport to the resident gateway, or
    // degrade honestly at 200 when it is known-down.
    let transport = match a2a_transport(call.budget) {
        Ok(t) => t,
        Err(reason) => {
            // Degrade a DEDICATED `agent` tier, never `semantic`: an a2a outage
            // must not tell the client that search is down. The four canonical
            // tiers stay honest; only the orchestration plane reports unavailable.
            return Ok(super::super::envelope(
                json!({ "envelope": Value::Null }),
                super::super::degraded_tiers_for(&cell, "agent", reason.as_str()),
                None,
            ));
        }
    };

    // Offload the blocking loopback round-trip onto the blocking pool (RCR-001):
    // the closure OWNS the transport + serialized body, so a slow/stalled a2a
    // call cannot pin an async worker. The forwarded body is serialized here and
    // never logged (it may carry actor tokens for run-start).
    let ForwardedCall {
        method,
        path,
        body: forwarded_body,
        ..
    } = call;
    let forwarded_body = forwarded_body.map(|b| b.to_string());
    let result = super::rag_offload(&state, move || match method {
        Method::Get => transport.get(&path),
        Method::Post => transport.post_json(&path, forwarded_body.as_deref().unwrap_or("{}")),
    })
    .await?;

    match result {
        Ok(raw) => {
            // The sibling answered 2xx: forward its envelope VERBATIM under
            // `data.envelope`. Non-JSON output is wrapped, never reshaped.
            let envelope = match serde_json::from_str::<Value>(&raw) {
                Ok(value) => value,
                Err(_) => Value::String(raw),
            };
            Ok(super::super::envelope(
                json!({ "envelope": envelope }),
                super::super::query_tiers(&cell),
                None,
            ))
        }
        Err(e) => map_transport_error(&state, &cell, e),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_state() -> (tempfile::TempDir, Arc<AppState>) {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(dir.path().join(".vault/plan")).unwrap();
        let state = crate::app::build_state(dir.path().to_path_buf());
        (dir, state)
    }

    #[tokio::test]
    async fn an_unknown_verb_403s_before_any_discovery() {
        let (_dir, state) = test_state();
        let err = ops_a2a(State(state), Path("run-nuke".to_string()), None)
            .await
            .unwrap_err();
        assert_eq!(err.0, StatusCode::FORBIDDEN);
        assert!(err.1.0["error"].as_str().unwrap().contains("run-nuke"));
        assert!(
            err.1.0["tiers"]["semantic"]["available"].is_boolean(),
            "the 403 carries the tiers block"
        );
    }

    #[test]
    fn run_id_guard_accepts_path_safe_and_rejects_everything_else() {
        let (_dir, state) = test_state();
        assert_eq!(
            validate_run_id(&state, "run_abc-123").unwrap(),
            "run_abc-123"
        );
        for bad in [
            "",
            "-flag",
            "../escape",
            "run/../../etc",
            "run id",
            "run;rm",
            "a".repeat(MAX_A2A_RUN_ID_CHARS + 1).as_str(),
        ] {
            assert!(
                validate_run_id(&state, bad).is_err(),
                "`{bad}` must be rejected"
            );
        }
    }

    #[test]
    fn token_guard_rejects_flag_injection_and_overlength() {
        let (_dir, state) = test_state();
        assert!(validate_bounded_token(&state, "team_preset", "vaultspec-authoring", 64).is_ok());
        assert!(validate_bounded_token(&state, "team_preset", "team.default:v1", 64).is_ok());
        for bad in ["", "-x", "--force", "has space", "semi;colon"] {
            assert!(
                validate_bounded_token(&state, "team_preset", bad, 64).is_err(),
                "`{bad}` must be rejected"
            );
        }
        assert!(validate_bounded_token(&state, "team_preset", &"a".repeat(65), 64).is_err());
    }

    #[test]
    fn scope_fence_accepts_the_same_canonical_token_the_routes_serve() {
        let (_dir, state) = test_state();
        let cell = state.active_cell();
        let served = crate::routes::scope_token(&cell.root);
        validate_expected_scope(
            &state,
            &cell,
            &A2aVerbBody {
                expected_scope: Some(served),
                ..Default::default()
            },
            "active-runs",
        )
        .expect("the served route token is the generation fence token");

        #[cfg(windows)]
        assert_eq!(
            crate::routes::scope_token(std::path::Path::new(
                r"\\?\Y:\code\vaultspec-dashboard-worktrees\cold"
            )),
            "Y:/code/vaultspec-dashboard-worktrees/cold"
        );
    }

    #[test]
    fn build_forwarded_call_maps_read_verbs_to_the_right_paths() {
        let (_dir, state) = test_state();
        let cell = state.active_cell();
        let expected_scope = crate::routes::scope_token(&cell.root);

        let service =
            build_forwarded_call(&state, "service-state", &cell, &A2aVerbBody::default()).unwrap();
        assert_eq!(service.path, "/v1/service");
        assert!(service.body.is_none());

        // presets-list carries the engine-controlled workspace_root, percent-encoded.
        let presets =
            build_forwarded_call(&state, "presets-list", &cell, &A2aVerbBody::default()).unwrap();
        assert!(presets.path.starts_with("/v1/presets?workspace_root="));
        assert!(
            !presets.path.contains('\\') && !presets.path.contains(' '),
            "the workspace_root path is percent-encoded: {}",
            presets.path
        );

        // active-runs pins state=active and carries the engine-controlled
        // workspace_root (percent-encoded); it is a bounded read, never a client
        // field. It requires no run_id.
        let active = build_forwarded_call(
            &state,
            "active-runs",
            &cell,
            &A2aVerbBody {
                expected_scope: Some(expected_scope.clone()),
                feature_tag: Some("a2a-orchestration-edge".to_string()),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(
            active
                .path
                .starts_with("/v1/runs?state=active&workspace_root=")
        );
        assert!(active.path.contains("&feature_tag=a2a-orchestration-edge"));
        assert!(active.path.ends_with("&limit=2"));
        assert!(active.body.is_none());
        assert_eq!(active.budget, A2A_READ_BUDGET);
        assert!(
            !active.path.contains('\\') && !active.path.contains(' '),
            "the workspace_root path is percent-encoded: {}",
            active.path
        );
        assert_eq!(
            build_forwarded_call(
                &state,
                "active-runs",
                &cell,
                &A2aVerbBody {
                    expected_scope: Some(expected_scope.clone()),
                    feature_tag: Some("bad feature".to_string()),
                    ..Default::default()
                }
            )
            .unwrap_err()
            .0,
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            build_forwarded_call(
                &state,
                "active-runs",
                &cell,
                &A2aVerbBody {
                    expected_scope: Some("X:/a-different-workspace".to_string()),
                    ..Default::default()
                }
            )
            .unwrap_err()
            .0,
            StatusCode::CONFLICT
        );

        // run-status requires a run_id and forms the run URL.
        let status = build_forwarded_call(
            &state,
            "run-status",
            &cell,
            &A2aVerbBody {
                run_id: Some("run-7".to_string()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(status.path, "/v1/runs/run-7");

        // run-status without a run_id is a 400.
        assert_eq!(
            build_forwarded_call(&state, "run-status", &cell, &A2aVerbBody::default())
                .unwrap_err()
                .0,
            StatusCode::BAD_REQUEST
        );
    }

    #[test]
    fn build_run_start_validates_and_omits_actor_tokens() {
        let (_dir, state) = test_state();
        let cell = state.active_cell();
        let expected_scope = crate::routes::scope_token(&cell.root);

        // A valid run-start body: the forwarded payload carries the preset +
        // message + optional fields but NEVER an actor_tokens field (the handler
        // injects it after provisioning).
        let call = build_forwarded_call(
            &state,
            "run-start",
            &cell,
            &A2aVerbBody {
                expected_scope: Some(expected_scope.clone()),
                team_preset: Some("vaultspec-authoring".to_string()),
                message: Some("Research the edge".to_string()),
                feature_tag: Some("a2a-orchestration-edge".to_string()),
                profile_id: Some("team-defaults".to_string()),
                autonomous: Some(true),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(matches!(call.method, Method::Post));
        assert_eq!(call.path, "/v1/runs");
        let body = call.body.unwrap();
        assert_eq!(body["team_preset"], "vaultspec-authoring");
        assert_eq!(body["message"], "Research the edge");
        assert_eq!(body["feature_tag"], "a2a-orchestration-edge");
        assert_eq!(body["autonomous"], true);
        assert_eq!(body["metadata"]["workspace_root"], expected_scope);
        assert!(body.get("expected_scope").is_none());
        assert!(
            body.get("actor_tokens").is_none(),
            "the pure build step never carries actor tokens"
        );

        // A missing preset, empty message, and oversized message are each a 400.
        assert!(
            build_forwarded_call(
                &state,
                "run-start",
                &cell,
                &A2aVerbBody {
                    expected_scope: Some(expected_scope.clone()),
                    message: Some("x".to_string()),
                    ..Default::default()
                }
            )
            .is_err()
        );
        assert!(
            build_forwarded_call(
                &state,
                "run-start",
                &cell,
                &A2aVerbBody {
                    expected_scope: Some(expected_scope.clone()),
                    team_preset: Some("p".to_string()),
                    message: Some("   ".to_string()),
                    ..Default::default()
                }
            )
            .is_err()
        );
        assert!(
            build_forwarded_call(
                &state,
                "run-start",
                &cell,
                &A2aVerbBody {
                    expected_scope: Some(expected_scope),
                    team_preset: Some("p".to_string()),
                    message: Some("x".repeat(MAX_A2A_MESSAGE_BYTES + 1)),
                    ..Default::default()
                }
            )
            .is_err()
        );
    }

    #[test]
    fn provisioned_bundle_covers_every_role_with_distinct_tokens_and_no_bearer() {
        let (_dir, state) = test_state();
        let bundle = provision_actor_token_bundle(&state).unwrap();

        // engine_bearer is absent (null): the worker self-resolves it.
        assert_eq!(bundle["engine_bearer"], Value::Null);

        let tokens = bundle["tokens"].as_object().unwrap();
        assert_eq!(
            tokens.len(),
            A2A_PIPELINE_ROLES.len(),
            "one token per canonical pipeline role"
        );
        let mut seen = std::collections::HashSet::new();
        for role in A2A_PIPELINE_ROLES {
            let token = tokens[*role].as_str().expect("role token is a string");
            assert!(!token.is_empty(), "role `{role}` has a non-empty token");
            assert!(
                seen.insert(token.to_string()),
                "role `{role}` token must be distinct (roles never share a token)"
            );
        }
    }

    #[test]
    fn discovery_classifies_absent_stale_and_fresh() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("service.json");

        // Absent: no file.
        assert!(matches!(
            discover_a2a_at(std::slice::from_ref(&path)),
            A2aDiscovery::Down { .. }
        ));

        // Stale heartbeat (1970): a crashed/stopped service, degraded.
        std::fs::write(&path, r#"{"port": 8080, "last_heartbeat": 1000}"#).unwrap();
        assert!(matches!(
            discover_a2a_at(std::slice::from_ref(&path)),
            A2aDiscovery::Down { ref reason } if reason.contains("stale")
        ));

        // Fresh heartbeat: a live service.
        let now = now_ms();
        std::fs::write(
            &path,
            format!(
                r#"{{"port": 8080, "last_heartbeat": {now}, "pid": 4242, "service_token": "tok"}}"#
            ),
        )
        .unwrap();
        match discover_a2a_at(std::slice::from_ref(&path)) {
            A2aDiscovery::Fresh(info) => {
                assert_eq!(info.port, 8080);
                assert_eq!(info.service_token.as_deref(), Some("tok"));
            }
            other => panic!("expected Fresh, got {other:?}"),
        }
    }

    #[test]
    fn percent_encode_escapes_path_separators_and_drive_colon() {
        assert_eq!(percent_encode("Y:\\code\\proj"), "Y%3A%5Ccode%5Cproj");
        assert_eq!(percent_encode("plain-name_1.2~"), "plain-name_1.2~");
        assert_eq!(percent_encode("a b"), "a%20b");
    }

    #[test]
    fn http_business_refusal_forwards_verbatim_with_sibling_status() {
        // ADR D1: a 4xx the sibling ANSWERS is a business refusal forwarded
        // verbatim at 200 with its sibling_status — the sibling is up, tiers stay
        // healthy. This is the a2a analog of the rag write runner's exit-1
        // status:"failed" forward.
        let (_dir, state) = test_state();
        let cell = state.active_cell();
        let refusal = RagError::Http {
            status: 422,
            body: r#"{"detail": "preset ineligible"}"#.to_string(),
        };
        let Json(body) = map_transport_error(&state, &cell, refusal).expect("a refusal is a 200");
        assert_eq!(body["data"]["sibling_status"], 422);
        assert_eq!(body["data"]["envelope"]["detail"], "preset ineligible");
        assert!(body["tiers"]["semantic"]["available"].is_boolean());
    }

    #[test]
    fn live_loopback_discovers_health_then_round_trips_active_runs() {
        // A real TcpListener stands in for the resident a2a gateway: a real
        // service.json, a real ungated /health 200, and a real HTTP round-trip
        // through the loopback transport. This is a LIVE loopback (the rag-client
        // socket-test precedent), not a stub of engine code — it exercises the real
        // discovery predicate, the real attach gate, and the real transport. It
        // does NOT stand up the Python gateway (that live contract test lives in
        // the vaultspec-a2a repo's own test_gateway_live.py; see the report).
        use std::io::{Read, Write};
        use std::net::TcpListener;

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        // The gateway answers two Connection: close requests — the /health probe,
        // then the verb — each on its own accepted connection.
        let (request_tx, request_rx) = std::sync::mpsc::channel();
        let server = std::thread::spawn(move || {
            let health = r#"{"status": "ok", "checks": {}}"#;
            let verb = r#"{"api_version":"v1","state":"active","runs":[{"run_id":"run-7","status":"running","feature_tag":"a2a-orchestration-edge"}],"truncated":false}"#;
            for (index, body) in [health, verb].into_iter().enumerate() {
                let (mut stream, _) = listener.accept().unwrap();
                let mut buf = [0u8; 2048];
                let read = stream.read(&mut buf).unwrap();
                if index == 1 {
                    let request = String::from_utf8_lossy(&buf[..read]);
                    request_tx
                        .send(request.lines().next().unwrap_or_default().to_string())
                        .unwrap();
                }
                write!(
                    stream,
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                )
                .unwrap();
            }
        });

        // A fresh discovery record pointing at the real listener.
        let dir = tempfile::tempdir().unwrap();
        let service_json = dir.path().join("service.json");
        let now = now_ms();
        std::fs::write(
            &service_json,
            format!(r#"{{"port": {port}, "last_heartbeat": {now}, "pid": 4242}}"#),
        )
        .unwrap();

        // Discovery + the ungated /health gate resolve a live endpoint.
        let (endpoint_port, bearer) = a2a_endpoint_from(std::slice::from_ref(&service_json))
            .expect("a fresh, healthy gateway resolves an endpoint");
        assert_eq!(endpoint_port, port);
        let transport = LoopbackTransport {
            port: endpoint_port,
            bearer,
            timeout: A2A_READ_BUDGET,
        };
        // Resolve the production mapping and make the real bounded discovery
        // round-trip. The sibling envelope is preserved without reshaping.
        let (_state_dir, state) = test_state();
        let cell = state.active_cell();
        let expected_scope = crate::routes::scope_token(&cell.root);
        let call = build_forwarded_call(
            &state,
            "active-runs",
            &cell,
            &A2aVerbBody {
                expected_scope: Some(expected_scope),
                feature_tag: Some("a2a-orchestration-edge".to_string()),
                ..Default::default()
            },
        )
        .unwrap();
        let raw = transport.get(&call.path).expect("verb round-trips");
        let envelope: Value = serde_json::from_str(&raw).unwrap();
        assert_eq!(envelope["api_version"], "v1");
        assert_eq!(envelope["state"], "active");
        assert_eq!(envelope["runs"][0]["run_id"], "run-7");
        assert_eq!(envelope["truncated"], false);

        let request_line = request_rx.recv().unwrap();
        assert!(request_line.starts_with("GET /v1/runs?state=active&workspace_root="));
        assert!(request_line.contains("&feature_tag=a2a-orchestration-edge"));
        assert!(request_line.contains("&limit=2 HTTP/1.1"));

        server.join().unwrap();
    }

    #[test]
    fn a_stale_gateway_never_probes_health_and_reports_down() {
        // A stale discovery record is known-down BEFORE any /health probe — the
        // transport resolve returns the truthful reason the handler degrades on.
        let dir = tempfile::tempdir().unwrap();
        let service_json = dir.path().join("service.json");
        // Heartbeat from 1970 → stale. The port is unbound; a health probe would
        // hang/refuse, so proving we never reach it also proves the fast gate.
        std::fs::write(&service_json, r#"{"port": 9, "last_heartbeat": 1000}"#).unwrap();
        match a2a_endpoint_from(std::slice::from_ref(&service_json)) {
            Ok(_) => panic!("a stale gateway must be known-down, not a live endpoint"),
            Err(reason) => assert!(reason.contains("stale"), "reason: {reason}"),
        }
    }

    #[test]
    fn a_timeout_is_504_and_a_crash_is_502() {
        let (_dir, state) = test_state();
        let cell = state.active_cell();

        let timeout = RagError::Io(std::io::Error::from(std::io::ErrorKind::TimedOut));
        assert_eq!(
            map_transport_error(&state, &cell, timeout).unwrap_err().0,
            StatusCode::GATEWAY_TIMEOUT
        );

        let crash = RagError::Io(std::io::Error::from(std::io::ErrorKind::ConnectionRefused));
        assert_eq!(
            map_transport_error(&state, &cell, crash).unwrap_err().0,
            StatusCode::BAD_GATEWAY
        );

        assert_eq!(
            map_transport_error(&state, &cell, RagError::Protocol)
                .unwrap_err()
                .0,
            StatusCode::BAD_GATEWAY
        );
    }
}
