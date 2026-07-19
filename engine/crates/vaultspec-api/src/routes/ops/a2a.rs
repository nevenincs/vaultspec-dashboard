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

use std::hash::{DefaultHasher, Hash, Hasher};
use std::path::PathBuf;
use std::sync::{Arc, LazyLock, Mutex, MutexGuard};
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

/// Fixed-size serialization stripes for brokered run starts. A stable `run_id`
/// always maps to one stripe, so concurrent retries cannot both pass the status
/// preflight and mint separate token bundles. The array is allocation-invariant:
/// unlike a per-run map it cannot accumulate completed-run keys indefinitely.
const A2A_RUN_START_LOCK_STRIPES: usize = 64;
static A2A_RUN_START_LOCKS: LazyLock<[Mutex<()>; A2A_RUN_START_LOCK_STRIPES]> =
    LazyLock::new(|| std::array::from_fn(|_| Mutex::new(())));

fn lock_run_start(run_id: &str) -> MutexGuard<'static, ()> {
    let mut hasher = DefaultHasher::new();
    run_id.hash(&mut hasher);
    let stripe = (hasher.finish() as usize) % A2A_RUN_START_LOCK_STRIPES;
    A2A_RUN_START_LOCKS[stripe]
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

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
    /// The stable run/idempotency id. REQUIRED for run-status, run-cancel, and
    /// brokered run-start (dispatch-exactly-once plus token-lifecycle identity).
    /// Restricted to a path-safe token so it can never carry
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
/// `ServiceInfo` contract the resident gateway publishes. Discovery itself is
/// secret-free; `handoff_reference` names the sibling bearer file.
#[derive(Debug, Clone, serde::Deserialize)]
struct A2aServiceInfo {
    port: u16,
    #[serde(default)]
    #[allow(dead_code)]
    pid: Option<u32>,
    #[serde(default)]
    last_heartbeat: Option<i64>,
    #[serde(default)]
    handoff_reference: Option<String>,
    #[serde(skip)]
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
        if serde_json::from_str::<Value>(&raw)
            .ok()
            .and_then(|value| value.get("service_token").cloned())
            .is_some()
        {
            return A2aDiscovery::Down {
                reason: "a2a service.json illegally contains a raw credential".to_string(),
            };
        }
        match serde_json::from_str::<A2aServiceInfo>(&raw) {
            Ok(mut info) => {
                if let Some(heartbeat) = info.last_heartbeat {
                    let now = now_ms();
                    if now.saturating_sub(heartbeat) > A2A_HEARTBEAT_STALE_MS {
                        return A2aDiscovery::Down {
                            reason: "a2a gateway heartbeat stale (service crashed or stopped)"
                                .to_string(),
                        };
                    }
                }
                info.service_token = match info.handoff_reference.as_deref() {
                    Some(reference) => match read_a2a_handoff(path, reference) {
                        Ok(token) => Some(token),
                        Err(reason) => return A2aDiscovery::Down { reason },
                    },
                    None => None,
                };
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

fn read_a2a_handoff(discovery_path: &std::path::Path, reference: &str) -> Result<String, String> {
    let expected = discovery_path.with_file_name("service.token");
    let expected = expected
        .canonicalize()
        .map_err(|_| "a2a handoff credential is absent".to_string())?;
    let candidate = PathBuf::from(reference)
        .canonicalize()
        .map_err(|_| "a2a handoff credential is unreadable".to_string())?;
    if candidate != expected {
        return Err("a2a handoff reference escaped its discovery directory".to_string());
    }
    let metadata = std::fs::symlink_metadata(&candidate)
        .map_err(|_| "a2a handoff credential metadata is unreadable".to_string())?;
    if !metadata.file_type().is_file() || metadata.file_type().is_symlink() {
        return Err("a2a handoff credential is not a regular file".to_string());
    }
    if !vaultspec_product::discovery::handoff_is_owner_restricted(&candidate) {
        return Err("a2a handoff credential is not owner-restricted".to_string());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let discovery_metadata = std::fs::metadata(discovery_path)
            .map_err(|_| "a2a discovery owner is unreadable".to_string())?;
        if metadata.uid() != discovery_metadata.uid() {
            return Err("a2a handoff credential is not owner-restricted".to_string());
        }
    }
    let token = std::fs::read_to_string(candidate)
        .map_err(|_| "a2a handoff credential is unreadable".to_string())?;
    let token = token.trim().to_string();
    if token.is_empty() {
        return Err("a2a handoff credential is empty".to_string());
    }
    Ok(token)
}

/// DUAL-RESOLVE the resident a2a gateway endpoint (a2a-product-provisioning
/// W02.P04.S30): PREFER the product controller's authenticated, versioned
/// discovery (the secret-free `gateway-discovery.json` + the attach-control
/// credential the `LifecyclePlane` resolves under ADR D5), and FALL BACK to the
/// resident `service.json` + owner-restricted handoff path when the product path
/// resolves nothing.
///
/// The product path is the ADR-D5 target. The `service.json` fallback keeps the
/// live `/ops/a2a` edge green until the A2A capsule publishes the product
/// discovery format, and retires when it does — it is NOT deleted. A product
/// discovery that is stale, incompatible, or untrusted resolves `Unavailable`
/// (never a usable endpoint) and DEFERS to the fallback rather than displacing a
/// working resident; both down surfaces the fallback's honest reason. Shared by
/// the pass-through transport (`ops_a2a`) and the run-stream relay (`a2a_stream`).
fn a2a_endpoint_dual(
    plane: &crate::routes::a2a_lifecycle::LifecyclePlane,
    candidates: &[PathBuf],
) -> Result<(u16, Option<String>), String> {
    if let crate::routes::a2a_lifecycle::ResolvedGateway::Available(ep) = plane.resolve_gateway()
        && let Some(port) = ep.port()
    {
        return Ok((port, Some(ep.attach_token)));
    }
    a2a_endpoint_from(candidates)
}

/// [`a2a_endpoint_dual`] over the machine-global `service.json` candidates — the
/// production fallback list. Used by the run-stream relay (`a2a_stream`), which
/// holds the seated `LifecyclePlane` but not an explicit candidate list.
pub(super) fn a2a_endpoint(
    plane: &crate::routes::a2a_lifecycle::LifecyclePlane,
) -> Result<(u16, Option<String>), String> {
    a2a_endpoint_dual(plane, &a2a_service_json_candidates())
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
            // Dashboard starts MUST carry a client-stable id. This is both A2A's
            // dispatch-exactly-once key and the engine's actor-token lifecycle
            // key; accepting an anonymous start would make a transport retry
            // indistinguishable from a new run and necessarily mint again.
            let run_id = body.run_id.as_deref().ok_or_else(|| {
                super::super::api_error(
                    state,
                    StatusCode::BAD_REQUEST,
                    "run-start requires a stable `run_id` idempotency key".to_string(),
                )
            })?;
            obj.insert("run_id".to_string(), json!(validate_run_id(state, run_id)?));
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
struct ProvisionedActorTokenBundle {
    wire: Value,
    /// Hashes of exactly the rows issued or rotated by THIS attempt. Cleanup uses
    /// hashes so no raw token has to leave the short-lived wire bundle.
    issued_hashes: Vec<String>,
}

fn provision_actor_token_bundle(
    state: &AppState,
    run_id: &str,
) -> Result<ProvisionedActorTokenBundle, (StatusCode, Json<Value>)> {
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
                let mut issued_hashes = Vec::with_capacity(A2A_PIPELINE_ROLES.len());
                for (role, actor) in &role_actors {
                    let display = ActorDisplayMetadata::new(actor.id.as_str(), None);
                    uow.actors().put_record(ActorRecordInput::active(
                        actor.clone(),
                        display,
                        now,
                    ))?;
                    let issuance_key = format!("a2a-run-start:v1:{run_id}:{role}");
                    let issued = uow.actor_tokens().issue_for_purpose(
                        actor,
                        &issued_by,
                        now,
                        A2A_RUN_TOKEN_LIFETIME_MS,
                        &issuance_key,
                    )?;
                    issued_hashes.push(issued.record.token_hash);
                    tokens.insert((*role).to_string(), Value::String(issued.raw_token));
                }
                Ok((tokens, issued_hashes))
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

    Ok(ProvisionedActorTokenBundle {
        wire: json!({ "tokens": Value::Object(tokens.0), "engine_bearer": Value::Null }),
        issued_hashes: tokens.1,
    })
}

/// Revoke and immediately reclaim exactly the rows created/rotated for a failed
/// run-start attempt. The caller supplies hashes only; no raw credential is
/// retained, logged, or reconstructed.
fn revoke_failed_actor_token_bundle(state: &AppState, token_hashes: &[String]) -> Result<(), ()> {
    let now = now_ms();
    state
        .with_authoring_store(|store| {
            store.with_unit_of_work(CommandKind::CreateSession, |uow| {
                let tokens = uow.actor_tokens();
                tokens.revoke_hashes(token_hashes, now)?;
                tokens.prune_reclaimable(now)?;
                Ok(())
            })
        })
        .map_err(|_| ())
}

enum BrokeredRoundTrip {
    /// Discovery or health proved the sibling known-down before any credential
    /// issuance. The async handler maps this to the dedicated degraded tier.
    Down(String),
    /// The sibling call completed (success, business refusal, or transport
    /// fault). Existing response mapping remains the single wire authority.
    Answer(Result<String, RagError>),
    /// A token-store operation failed. Details can include database internals,
    /// so only this stage-safe classification crosses the blocking boundary.
    TokenStoreFailure(&'static str),
}

fn perform_forwarded_call(
    transport: &LoopbackTransport,
    method: Method,
    path: &str,
    body: Option<&Value>,
) -> Result<String, RagError> {
    match method {
        Method::Get => transport.get(path),
        Method::Post => {
            // Serialized only at the final socket boundary and never logged: a
            // run-start body may carry six raw actor tokens.
            let serialized = body
                .map(Value::to_string)
                .unwrap_or_else(|| "{}".to_string());
            transport.post_json(path, &serialized)
        }
    }
}

/// Execute the COMPLETE synchronous broker chain on a blocking thread:
/// discovery-file reads, `/health`, run-id preflight, SQLite token lifecycle,
/// and the forwarded HTTP call. For run-start, one fixed serialization stripe
/// covers preflight through dispatch so concurrent retries cannot both mint.
fn execute_broker_call(
    state: &AppState,
    mut call: ForwardedCall,
    run_start_id: Option<&str>,
    discovery_candidates: &[PathBuf],
) -> BrokeredRoundTrip {
    let _run_guard = run_start_id.map(lock_run_start);

    // DUAL-RESOLVE (S30): prefer the product controller's authenticated discovery,
    // fall back to the resident service.json + handoff so the live edge stays green.
    let transport = match a2a_endpoint_dual(&state.a2a_lifecycle, discovery_candidates) {
        Ok((port, bearer)) => LoopbackTransport {
            port,
            bearer,
            timeout: call.budget,
        },
        Err(reason) => return BrokeredRoundTrip::Down(reason),
    };

    let Some(run_id) = run_start_id else {
        return BrokeredRoundTrip::Answer(perform_forwarded_call(
            &transport,
            call.method,
            &call.path,
            call.body.as_ref(),
        ));
    };

    // A2A's stable-id contract returns an existing run before consulting actor
    // tokens. Preflight that authoritative fact first. A found run is replayed by
    // POSTing the original request WITHOUT a bundle, preserving A2A's native
    // RunStartResponse shape while proving no fresh credential was minted.
    let preflight = LoopbackTransport {
        port: transport.port,
        bearer: transport.bearer.clone(),
        timeout: A2A_READ_BUDGET,
    };
    match preflight.get(&format!("/v1/runs/{run_id}")) {
        Ok(_) => {
            if let Some(body) = call.body.as_mut().and_then(Value::as_object_mut) {
                body.remove("actor_tokens");
            }
            return BrokeredRoundTrip::Answer(perform_forwarded_call(
                &transport,
                call.method,
                &call.path,
                call.body.as_ref(),
            ));
        }
        Err(RagError::Http { status: 404, .. }) => {}
        Err(other) => return BrokeredRoundTrip::Answer(Err(other)),
    }

    // Confirmed absent under the per-run serialization stripe: this is the only
    // path licensed to create/rotate the six purpose-keyed token rows.
    let provisioned = match provision_actor_token_bundle(state, run_id) {
        Ok(bundle) => bundle,
        Err(_) => return BrokeredRoundTrip::TokenStoreFailure("provision"),
    };
    if let Some(body) = call.body.as_mut().and_then(Value::as_object_mut) {
        body.insert("actor_tokens".to_string(), provisioned.wire);
    }

    let result = perform_forwarded_call(&transport, call.method, &call.path, call.body.as_ref());
    match result {
        Ok(raw) => BrokeredRoundTrip::Answer(Ok(raw)),
        // The sibling answered with an explicit refusal. No response-loss
        // ambiguity remains, so the just-issued bundle is unused and reclaimable.
        Err(error @ RagError::Http { .. }) => {
            if revoke_failed_actor_token_bundle(state, &provisioned.issued_hashes).is_err() {
                BrokeredRoundTrip::TokenStoreFailure("clean up refused")
            } else {
                BrokeredRoundTrip::Answer(Err(error))
            }
        }
        // A connection/protocol failure may mean the sibling accepted and
        // dispatched, then its response was lost. Re-read under the SAME run-id
        // stripe before deciding credential fate. Found means the tokens may be
        // live: retain them and make one safe idempotent POST without a bundle to
        // recover the native RunStartResponse. A 404 is still ambiguous because
        // the original request may not yet have reached its durable reservation;
        // retry the exact same id/token bundle and retain its bounded rows. The
        // sibling's pre-dispatch primary-key reservation makes that race safe.
        // An unavailable confirmation likewise retains the expiring rows.
        Err(original_error) => match preflight.get(&format!("/v1/runs/{run_id}")) {
            Ok(_) => {
                if let Some(body) = call.body.as_mut().and_then(Value::as_object_mut) {
                    body.remove("actor_tokens");
                }
                BrokeredRoundTrip::Answer(perform_forwarded_call(
                    &transport,
                    call.method,
                    &call.path,
                    call.body.as_ref(),
                ))
            }
            Err(RagError::Http { status: 404, .. }) => BrokeredRoundTrip::Answer(
                perform_forwarded_call(&transport, call.method, &call.path, call.body.as_ref()),
            ),
            Err(_) => BrokeredRoundTrip::Answer(Err(original_error)),
        },
    }
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
    let call = build_forwarded_call(&state, &verb, &cell, &body)?;
    let run_start_id = (verb == "run-start").then(|| {
        body.run_id
            .clone()
            .expect("validated run-start carries run_id")
    });

    // RCR-001: the COMPLETE synchronous chain runs on Tokio's blocking pool —
    // not only the final HTTP verb, but discovery-file reads, `/health`, status
    // preflight, and SQLite credential lifecycle as well. The closure owns every
    // value it needs; the body is never logged or formatted outside the socket
    // call because run-start may carry raw actor tokens after provisioning.
    let execution_state = Arc::clone(&state);
    let candidates = a2a_service_json_candidates();
    let outcome = super::rag_offload(&state, move || {
        execute_broker_call(&execution_state, call, run_start_id.as_deref(), &candidates)
    })
    .await?;

    let result = match outcome {
        BrokeredRoundTrip::Down(reason) => {
            // Degrade a DEDICATED `agent` tier, never `semantic`: an a2a outage
            // must not tell the client that search is down. The four canonical
            // tiers stay honest; only the orchestration plane reports unavailable.
            return Ok(super::super::envelope(
                json!({ "envelope": Value::Null }),
                super::super::degraded_tiers_for(&cell, "agent", reason.as_str()),
                None,
            ));
        }
        BrokeredRoundTrip::TokenStoreFailure(stage) => {
            return Err(super::super::api_error(
                &state,
                StatusCode::BAD_GATEWAY,
                format!("failed to {stage} run-start actor tokens"),
            ));
        }
        BrokeredRoundTrip::Answer(result) => result,
    };

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
#[path = "a2a_tests.rs"]
mod tests;
