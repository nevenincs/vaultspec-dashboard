//! The `/ops/a2a/{verb}` orchestration control pass-through: the engine forwards
//! a FIXED eight-verb whitelist to the
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
//! - **Actors and tokens are engine-provisioned after admission**: `run-start`
//!   first prepares an authenticated bounded reservation, mints
//!   only its returned worker identities into the dedicated run-lease store,
//!   then commits that reservation. Token values ride only the loopback body and
//!   appear in NO log line.
//!
//! Every forwarded call carries BOTH an output byte ceiling (the loopback
//! transport's `MAX_RAG_BODY` OOM guard) and a wall-clock timeout
//! (`subprocess-calls-carry-cap-and-timeout`), and machine-global discovery is
//! attach-never-own: the engine reaches whatever a2a service is resident, never
//! starts or owns one.

use std::collections::BTreeMap;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::path::PathBuf;
use std::sync::{Arc, LazyLock, Mutex, MutexGuard};
use std::time::Duration;

use axum::Json;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use rag_client::client::{LoopbackTransport, RagError, RagTransport};
use serde_json::{Value, json};

use crate::a2a_run_leases::{LeaseReservation, LeaseToken};
use crate::app::{AppState, ScopeCell, now_ms};
use crate::authoring::actor_tokens::{generate_raw_token, hash_actor_token};
use crate::authoring::actors::{ActorDisplayMetadata, ActorRecordInput};
use crate::authoring::model::{ActorId, ActorKind, ActorRef, CommandKind};

use super::ApiResult;

/// The FIXED eight-verb whitelist: orchestration control, bounded recovery and
/// provider-catalog reads, and one typed interrupt-resume only, with no
/// mutating vault semantics. A verb outside this set is a 403 BEFORE any
/// discovery or round-trip — the whitelist miss never reaches the sibling.
const A2A_WHITELIST: &[&str] = &[
    "run-start",
    "run-status",
    "run-cancel",
    "presets-list",
    "active-runs",
    "provider-catalog",
    "clarification-respond",
];

/// The sibling caps a prepared/preset role set at 64. The dashboard applies the
/// same ceiling before minting so an authenticated but drifted response cannot
/// create unbounded actors or credentials.
///
/// Deliberately an independent bound, not a value read from the sibling: we must
/// limit what we accept without trusting a number the other side supplies. That
/// independence is why "the same ceiling" needs checking rather than assuming —
/// the sibling's `MAX_ROLES_PER_RUN` (a2a `thread/actor_tokens.py`) is gated
/// against this constant BY NAME from its
/// `api/tests/test_engine_edge_bounds_agreement.py`, so lowering this without
/// lowering that turns every over-limit preset into a prepare refusal before any
/// dispatch — no run, and nothing downstream able to observe why.
const MAX_A2A_REQUIRED_ROLES: usize = 64;

/// Heartbeat staleness threshold for the a2a discovery file: the resident
/// gateway refreshes every 15s and a consumer treats a heartbeat older than
/// 120s as a crash (mirrors the a2a `HEARTBEAT_STALE_MS` and rag's own bound).
///
/// That mirroring is now gated by name from the sibling's
/// `api/tests/test_engine_edge_bounds_agreement.py`. Disagreement is silent and
/// blames the wrong side: a shorter threshold here treats a live gateway as
/// crashed and refuses to attach, a longer one attaches to one already gone.
const A2A_HEARTBEAT_STALE_MS: i64 = 120_000;

/// The ungated `/health` liveness budget for the attach-never-own predicate: a
/// short loopback probe against a service we just discovered.
const A2A_HEALTH_TIMEOUT: Duration = Duration::from_millis(1500);

/// Wall-clock budget for a brokered READ verb (run-status, presets-list,
/// active-runs): a fast recovery-snapshot / listing read.
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
const MAX_A2A_FEATURE_CHARS: usize = 128;
const MAX_A2A_TITLE_CHARS: usize = 200;
const MAX_A2A_RUN_ID_CHARS: usize = 128;
const MAX_A2A_SCOPE_CHARS: usize = 4096;

/// A provider-issued identifier is opaque to Dashboard and the engine. It may
/// not be used as a URL path, shell argument, or provider/model enum, so the
/// edge preserves its exact printable value while bounding its resource cost.
const MAX_A2A_CATALOG_REFERENCE_CHARS: usize = 512;
const MAX_A2A_CONTROL_ID_CHARS: usize = 128;
const MAX_A2A_CONTROL_VALUE_CHARS: usize = 512;
const MAX_A2A_CONTROLS_PER_SELECTION: usize = 32;
const MAX_A2A_ROLE_OVERRIDES: usize = MAX_A2A_REQUIRED_ROLES;
const MAX_A2A_ROLE_ID_CHARS: usize = 128;
const MAX_A2A_FALLBACKS: usize = 8;

/// The current A2A gateway route for the account- and execution-lane-specific
/// catalog. The response is forwarded verbatim: catalog entries and health are
/// A2A-owned facts, never reclassified or reconstructed at the Rust boundary.
const A2A_PROVIDER_CATALOG_PATH: &str = "/v1/provider-catalog";

/// The `clarification-respond` boundary: the D5 caps, the sibling route, and the
/// answer validation, held apart from the control verbs because it is the one
/// verb whose shape reconciles against a sibling route that has not landed yet.
#[path = "a2a/clarification.rs"]
mod clarification;

/// Machine-global discovery of the resident a2a gateway and the endpoint
/// resolution built on it, held apart from the control verbs because it is a
/// self-contained trust predicate — heartbeat freshness plus an owner-restricted
/// handoff credential — with three callers that otherwise share nothing: this
/// pass-through, the run-stream relay, and the agent tier.
#[path = "a2a/discovery.rs"]
mod discovery;
#[path = "a2a/validate.rs"]
mod validate;
use validate::*;

// Re-exported at the a2a boundary so both external callers keep the paths they
// already use: `ops::resident_sibling_is_attachable` (the agent tier, via
// `ops/mod.rs`) and `ops::a2a::a2a_endpoint` (the run-stream relay).
pub(crate) use discovery::{a2a_endpoint, resident_sibling_is_attachable};
use discovery::{a2a_endpoint_dual, a2a_service_json_candidates};
// Reached only by the test module's `use super::*`.

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

/// A bounded opaque reference into one A2A-served provider catalog revision.
#[derive(serde::Deserialize, serde::Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct CatalogSelectionReference {
    /// The exact A2A-issued selection-reference schema. No serde default: a
    /// browser must send the version it received, and the edge rejects future
    /// versions before they can reach a different producer contract.
    pub schema_version: u8,
    /// Opaque A2A-served provider identity. It is deliberately not an enum: a
    /// provider can appear only after its active lane advertises it.
    pub provider_id: String,
    /// Opaque execution lane identity. A model listed for one lane cannot be
    /// selected through another lane with the same provider label.
    pub execution_mode: String,
    /// The served catalog revision that A2A revalidates before freezing a run.
    pub catalog_revision: String,
    /// Opaque provider-issued entry identity, not a repository model name.
    pub entry_id: String,
    /// Provider-native option ids and values, such as an ACP thought-level or
    /// a Codex reasoning effort. Their vocabulary remains provider-owned.
    #[serde(default)]
    pub controls: BTreeMap<String, String>,
}

/// The typed request body for `POST /ops/a2a/{verb}`. Every field is optional at
/// the type level and validated/bounded per verb before anything reaches the
/// sibling; `actor_tokens` is deliberately ABSENT — the engine mints and injects
/// them, a client can never supply an identity.
#[derive(serde::Deserialize, Default)]
#[serde(deny_unknown_fields)]
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
    /// run-start: the required whole-team selection A2A served from the active
    /// provider catalog. The engine bounds its shape; A2A validates current
    /// membership and freezes the exact provider-issued values.
    #[serde(default)]
    pub selection: Option<CatalogSelectionReference>,
    /// run-start: expert, per-role replacements for the whole-team selection.
    /// Role keys are only bounded here; A2A verifies that each belongs to the
    /// selected preset before accepting it.
    #[serde(default)]
    pub overrides: Option<BTreeMap<String, CatalogSelectionReference>>,
    /// run-start: explicit served fallback choices. The edge keeps fallback
    /// order; A2A validates each current catalog reference and freezes it.
    #[serde(default)]
    pub fallbacks: Option<Vec<CatalogSelectionReference>>,
    /// run-start: an optional human title.
    #[serde(default)]
    pub title: Option<String>,
    /// run-start: the autonomy flag forwarded verbatim.
    #[serde(default)]
    pub autonomous: Option<bool>,
    /// clarification-respond: the id of the pending clarification these answers
    /// resolve (required). Path-safe like `run_id` — it is interpolated into the
    /// sibling URL.
    #[serde(default)]
    pub request_id: Option<String>,
    /// clarification-respond: the answers keyed by question id (required, one to
    /// four entries, each a bounded string). Nothing here is authoritative: the
    /// parked node decides whether an answer satisfies its question, whether
    /// every required question was answered, and whether an option id exists.
    #[serde(default)]
    pub answers: Option<serde_json::Map<String, Value>>,
    /// clarification-respond: the CONTINUATION alternative — a new prompt that
    /// resumes the parked run instead of answering its questions. The sibling's
    /// respond route accepts exactly one of `answers`, `prompt`, or `decline`;
    /// the engine forwards whichever the client sent and refuses anything other
    /// than exactly one, so the exactly-one-of rule is enforced before any
    /// round-trip rather than being discovered as a sibling refusal.
    #[serde(default)]
    pub prompt: Option<String>,
    /// clarification-respond: the DECLINE alternative — a payload-free refusal
    /// that resumes the parked run with no answer given, distinct from a cancel
    /// (the run continues on its own judgement). Only the literal `true` is
    /// admitted, mirroring the sibling schema: `decline: false` is a client
    /// saying "not declining" while supplying no other outcome.
    #[serde(default)]
    pub decline: Option<bool>,
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
        "provider-catalog" => {
            // Catalog enumeration can depend on the active workspace (for ACP
            // project setup) but that root remains engine-owned. A2A owns the
            // returned provider records, health evidence, freshness, and opaque
            // entry/control values; the edge forwards that response verbatim.
            let root = crate::routes::scope_token(&cell.root);
            Ok(ForwardedCall {
                method: Method::Get,
                path: format!(
                    "{A2A_PROVIDER_CATALOG_PATH}?workspace_root={}",
                    percent_encode(&root)
                ),
                body: None,
                budget: A2A_READ_BUDGET,
            })
        }
        "active-runs" => {
            // Reload-recovery of the live team-run binding: which
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
        // The typed resume of a run parked on a clarification interrupt: the
        // run and request address one parked node and the answers ride keyed by
        // question id, all bounded at this boundary (agent-flow D5(c)).
        "clarification-respond" => clarification::build_call(state, body),
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

            validate_run_catalog_selection(state, body)?;

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
            if let Some(selection) = body.selection.as_ref() {
                obj.insert("selection".to_string(), json!(selection));
            }
            if let Some(overrides) = body.overrides.as_ref() {
                obj.insert("overrides".to_string(), json!(overrides));
            }
            if let Some(fallbacks) = body.fallbacks.as_ref() {
                obj.insert("fallbacks".to_string(), json!(fallbacks));
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

/// The admitted sibling reservation and its bounded required-role set.
struct PreparedRun {
    reservation_id: String,
    gateway_lease_id: String,
    required_roles: Vec<String>,
}

/// Build the prepare-stage body from engine-owned fields and ask the
/// authenticated sibling to reserve capacity before any credential exists.
fn prepare_run(
    transport: &LoopbackTransport,
    call: &ForwardedCall,
) -> Result<PreparedRun, RagError> {
    let original = call.body.as_ref().ok_or(RagError::Protocol)?;
    let mut prepare = original.clone();
    let prepare_obj = prepare.as_object_mut().ok_or(RagError::Protocol)?;
    prepare_obj.insert("stage".to_string(), json!("prepare"));
    prepare_obj.remove("message");
    prepare_obj.remove("actor_tokens");
    prepare_obj.remove("reservation_id");
    let raw = transport.post_json("/v1/runs", &prepare.to_string())?;
    let response: Value = serde_json::from_str(&raw).map_err(|_| RagError::Protocol)?;
    if response.get("api_version").and_then(Value::as_str) != Some("v1")
        || response.get("stage").and_then(Value::as_str) != Some("prepared")
        || response.get("worker_state").and_then(Value::as_str) != Some("ready")
        || response.get("provider_eligibility").and_then(Value::as_str) != Some("eligible")
        || response.get("run_admission").and_then(Value::as_str) != Some("ready")
    {
        return Err(RagError::Protocol);
    }
    let reservation_id = response
        .get("reservation_id")
        .and_then(Value::as_str)
        .filter(|value| bounded_token_is_valid(value, MAX_A2A_RUN_ID_CHARS))
        .ok_or(RagError::Protocol)?
        .to_string();
    let gateway_lease_id = response
        .get("lease_id")
        .and_then(Value::as_str)
        .filter(|value| bounded_token_is_valid(value, MAX_A2A_RUN_ID_CHARS))
        .ok_or(RagError::Protocol)?
        .to_string();
    let roles = response
        .get("required_roles")
        .and_then(Value::as_array)
        .ok_or(RagError::Protocol)?;
    if roles.is_empty() || roles.len() > MAX_A2A_REQUIRED_ROLES {
        return Err(RagError::Protocol);
    }
    let mut unique = std::collections::HashSet::with_capacity(roles.len());
    let mut required_roles = Vec::with_capacity(roles.len());
    for role in roles {
        let role = role.as_str().ok_or(RagError::Protocol)?;
        let valid_agent_id = role.len() <= 63
            && role
                .bytes()
                .next()
                .is_some_and(|byte| byte.is_ascii_alphabetic() || byte == b'_')
            && role
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-');
        if !valid_agent_id || !unique.insert(role.to_string()) {
            return Err(RagError::Protocol);
        }
        required_roles.push(role.to_string());
    }
    Ok(PreparedRun {
        reservation_id,
        gateway_lease_id,
        required_roles,
    })
}

/// Mint one run-scoped raw token per prepare-returned role and durably reserve
/// only its hash in the dedicated lease repository before commit.
struct ProvisionedActorTokenBundle {
    wire: Value,
    lease_id: String,
}

fn provision_actor_token_bundle(
    state: &AppState,
    prepared: &PreparedRun,
    run_id: &str,
) -> Result<ProvisionedActorTokenBundle, (StatusCode, Json<Value>)> {
    let now = now_ms();
    let lease_id = format!("engine-lease-{}", generate_raw_token());
    let bundle_id = format!("engine-bundle-{}", generate_raw_token());
    let mut wire_tokens = serde_json::Map::new();
    let mut lease_tokens = Vec::with_capacity(prepared.required_roles.len());
    let mut actors = Vec::with_capacity(prepared.required_roles.len());
    for role in &prepared.required_roles {
        let id = ActorId::new(format!("agent:{role}")).map_err(|e| {
            super::super::api_error(
                state,
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("invalid pipeline role id: {e}"),
            )
        })?;
        let actor = ActorRef {
            id,
            kind: ActorKind::Agent,
            delegated_by: None,
        };
        let raw_token = generate_raw_token();
        actors.push((role.clone(), actor.clone()));
        lease_tokens.push(LeaseToken {
            role: role.clone(),
            token_hash: hash_actor_token(&raw_token),
            actor,
        });
        wire_tokens.insert(role.clone(), Value::String(raw_token));
    }
    state
        .a2a_run_leases
        .reserve(
            &LeaseReservation {
                lease_id: lease_id.clone(),
                reservation_id: prepared.reservation_id.clone(),
                bundle_id,
                run_id: Some(run_id.to_string()),
                tokens: lease_tokens,
                expiry_ms: now + A2A_RUN_TOKEN_LIFETIME_MS,
            },
            now,
        )
        .map_err(|_| {
            super::super::api_error(
                state,
                StatusCode::BAD_GATEWAY,
                "failed to provision run-start actor tokens".to_string(),
            )
        })?;

    // The authoring authorization floor requires a durable active actor record,
    // not merely a resolvable token hash. Register every prepare-authorized role
    // in one authoring transaction. If registration fails, revoke the just-
    // reserved hash bundle before any raw token can leave this process.
    if state
        .with_authoring_store(|store| {
            store.with_unit_of_work(CommandKind::CreateSession, |uow| {
                for (role, actor) in &actors {
                    if uow.actors().record(actor)?.is_some() {
                        // An existing stale actor is an explicit authorization
                        // boundary. Never reactivate it as a provisioning side
                        // effect; only already-active identities may be reused.
                        uow.actors().ensure_active(actor)?;
                    } else {
                        uow.actors().put_record(ActorRecordInput::active(
                            actor.clone(),
                            ActorDisplayMetadata::new(role, Some("A2A run role".to_string())),
                            now,
                        ))?;
                    }
                }
                Ok(())
            })
        })
        .is_err()
    {
        let _ = state.a2a_run_leases.revoke_lease(&lease_id, now_ms());
        return Err(super::super::api_error(
            state,
            StatusCode::BAD_GATEWAY,
            "failed to register run-start actors".to_string(),
        ));
    }

    // Bind and activate the exact gateway lease BEFORE the commit can dispatch.
    // Raw tokens have not left this stack yet, so this closes the terminal-
    // callback race without exposing a usable credential for an absent run.
    match state.a2a_run_leases.commit(
        &lease_id,
        run_id,
        None,
        &prepared.gateway_lease_id,
        now_ms(),
    ) {
        Ok(true) => {}
        _ => {
            let _ = state.a2a_run_leases.revoke_lease(&lease_id, now_ms());
            return Err(super::super::api_error(
                state,
                StatusCode::BAD_GATEWAY,
                "failed to bind run-start actor tokens".to_string(),
            ));
        }
    }

    Ok(ProvisionedActorTokenBundle {
        // Forward the machine bearer. This slot used to be null on the premise
        // that "the worker self-resolves it" from the engine's discovery
        // record — and that premise holds only for a LEGACY record carrying an
        // inline `service_token`, which is what a dev serve happens to publish.
        // A versioned desktop record is secret-free by design, so on the
        // shipped product the worker resolves nothing and every authoring
        // submission fails closed with no credential. a2a's own contract names
        // this field "the machine bearer minted at engine boot, forwarded so a
        // worker's authoring bridge can reach the engine", so the dispatcher is
        // the intended producer; its own acceptance harness supplies the field
        // because the real dispatcher is absent there.
        //
        // This grants a2a nothing it cannot already reach: the same secret is
        // what a legacy record hands any reader, and the bearer travels only
        // over loopback to a gateway this engine just admitted a run to.
        wire: json!({
            "tokens": Value::Object(wire_tokens),
            "engine_bearer": Value::String(state.bearer.clone()),
        }),
        lease_id,
    })
}

fn revoke_failed_actor_token_bundle(state: &AppState, lease_id: &str) -> Result<(), ()> {
    state
        .a2a_run_leases
        .revoke_lease(lease_id, now_ms())
        .map(|_| ())
        .map_err(|_| ())
}

fn release_prepared_run(
    transport: &LoopbackTransport,
    call: &ForwardedCall,
    reservation_id: &str,
) -> Result<(), RagError> {
    let mut body = call.body.clone().ok_or(RagError::Protocol)?;
    let obj = body.as_object_mut().ok_or(RagError::Protocol)?;
    obj.insert("stage".to_string(), json!("release"));
    obj.insert("reservation_id".to_string(), json!(reservation_id));
    obj.remove("message");
    obj.remove("actor_tokens");
    let raw = transport.post_json("/v1/runs", &body.to_string())?;
    let response: Value = serde_json::from_str(&raw).map_err(|_| RagError::Protocol)?;
    if response.get("api_version").and_then(Value::as_str) != Some("v1")
        || response.get("stage").and_then(Value::as_str) != Some("released")
        || response.get("reservation_id").and_then(Value::as_str) != Some(reservation_id)
        || !response.get("released").is_some_and(Value::is_boolean)
    {
        return Err(RagError::Protocol);
    }
    Ok(())
}

fn release_prepared_run_with_retry(
    transport: &LoopbackTransport,
    call: &ForwardedCall,
    reservation_id: &str,
) -> Result<(), RagError> {
    release_prepared_run(transport, call, reservation_id)
        .or_else(|_| release_prepared_run(transport, call, reservation_id))
}

fn reconcile_local_lease_from_status(
    state: &AppState,
    expected_run_id: &str,
    raw: &str,
) -> Result<(), ()> {
    let response: Value = serde_json::from_str(raw).map_err(|_| ())?;
    if response.get("api_version").and_then(Value::as_str) != Some("v1")
        || response.get("run_id").and_then(Value::as_str) != Some(expected_run_id)
    {
        return Err(());
    }
    let Some(gateway_lease_id) = response.get("lease_id").and_then(Value::as_str) else {
        return Ok(());
    };
    let Some(reservation_id) = response.get("reservation_id").and_then(Value::as_str) else {
        // Legacy committed runs persisted only the non-secret lease id. They
        // remain viewable, but cannot drive exact reserved-row repair.
        return Ok(());
    };
    if !bounded_token_is_valid(gateway_lease_id, MAX_A2A_RUN_ID_CHARS) {
        return Err(());
    }
    state
        .a2a_run_leases
        .commit_reserved_run(expected_run_id, reservation_id, gateway_lease_id, now_ms())
        .map(|_| ())
        .map_err(|_| ())
}

fn commit_local_lease(
    state: &AppState,
    local_lease_id: &str,
    expected_reservation_id: &str,
    expected_gateway_lease_id: &str,
    expected_run_id: &str,
    raw: &str,
) -> Result<(), ()> {
    let response: Value = serde_json::from_str(raw).map_err(|_| ())?;
    if response.get("api_version").and_then(Value::as_str) != Some("v1")
        || response.get("stage").and_then(Value::as_str) != Some("committed")
    {
        return Err(());
    }
    let run_id = response.get("run_id").and_then(Value::as_str).ok_or(())?;
    let gateway_lease_id = response.get("lease_id").and_then(Value::as_str).ok_or(())?;
    let status = response.get("status").and_then(Value::as_str).ok_or(())?;
    if run_id != expected_run_id
        || !bounded_token_is_valid(run_id, MAX_A2A_RUN_ID_CHARS)
        || !bounded_token_is_valid(gateway_lease_id, MAX_A2A_RUN_ID_CHARS)
        || gateway_lease_id != expected_gateway_lease_id
        || status.is_empty()
        || status.len() > 64
    {
        return Err(());
    }
    let committed = state
        .a2a_run_leases
        .binding_matches(
            local_lease_id,
            run_id,
            expected_reservation_id,
            gateway_lease_id,
        )
        .map_err(|_| ())?;
    committed.then_some(()).ok_or(())
}

fn confirm_local_lease_from_status(
    state: &AppState,
    local_lease_id: &str,
    prepared: &PreparedRun,
    expected_run_id: &str,
    raw: &str,
) -> Result<(), ()> {
    let response: Value = serde_json::from_str(raw).map_err(|_| ())?;
    if response.get("api_version").and_then(Value::as_str) != Some("v1")
        || response.get("run_id").and_then(Value::as_str) != Some(expected_run_id)
        || response.get("reservation_id").and_then(Value::as_str)
            != Some(prepared.reservation_id.as_str())
        || response.get("lease_id").and_then(Value::as_str)
            != Some(prepared.gateway_lease_id.as_str())
    {
        return Err(());
    }
    state
        .a2a_run_leases
        .binding_matches(
            local_lease_id,
            expected_run_id,
            &prepared.reservation_id,
            &prepared.gateway_lease_id,
        )
        .map_err(|_| ())?
        .then_some(())
        .ok_or(())
}

fn authoritative_committed_status(
    transport: &LoopbackTransport,
    state: &AppState,
    local_lease_id: &str,
    prepared: &PreparedRun,
    run_id: &str,
) -> Result<Option<String>, RagError> {
    match transport.get(&format!("/v1/runs/{run_id}")) {
        Ok(raw) => {
            confirm_local_lease_from_status(state, local_lease_id, prepared, run_id, &raw)
                .map_err(|_| RagError::Protocol)?;
            Ok(Some(raw))
        }
        Err(RagError::Http { status: 404, .. }) => Ok(None),
        Err(error) => Err(error),
    }
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

    // DUAL-RESOLVE: prefer the product controller's authenticated discovery,
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
    // tokens. A found run is already authoritative; return its bounded status
    // snapshot without preparing capacity or minting again.
    let preflight = LoopbackTransport {
        port: transport.port,
        bearer: transport.bearer.clone(),
        timeout: A2A_READ_BUDGET,
    };
    match preflight.get(&format!("/v1/runs/{run_id}")) {
        Ok(raw) => {
            if reconcile_local_lease_from_status(state, run_id, &raw).is_err() {
                return BrokeredRoundTrip::TokenStoreFailure("reconcile existing run");
            }
            return BrokeredRoundTrip::Answer(Ok(raw));
        }
        Err(RagError::Http { status: 404, .. }) => {}
        Err(other) => return BrokeredRoundTrip::Answer(Err(other)),
    }

    // Confirmed absent under the per-run serialization stripe: reserve bounded
    // downstream admission first. The authenticated prepare response is the
    // only authority for which worker identities receive run credentials.
    let prepared = match prepare_run(&preflight, &call) {
        Ok(prepared) => prepared,
        Err(error) => return BrokeredRoundTrip::Answer(Err(error)),
    };
    let provisioned = match provision_actor_token_bundle(state, &prepared, run_id) {
        Ok(bundle) => bundle,
        Err(_) => {
            let _ = release_prepared_run_with_retry(&transport, &call, &prepared.reservation_id);
            return BrokeredRoundTrip::TokenStoreFailure("provision");
        }
    };
    let local_lease_id = provisioned.lease_id.clone();
    if let Some(body) = call.body.as_mut().and_then(Value::as_object_mut) {
        body.insert("stage".to_string(), json!("commit"));
        body.insert("reservation_id".to_string(), json!(prepared.reservation_id));
        body.insert("actor_tokens".to_string(), provisioned.wire);
    }

    let result = perform_forwarded_call(&transport, call.method, &call.path, call.body.as_ref());
    match result {
        Ok(raw) => {
            if commit_local_lease(
                state,
                &local_lease_id,
                &prepared.reservation_id,
                &prepared.gateway_lease_id,
                run_id,
                &raw,
            )
            .is_ok()
            {
                return BrokeredRoundTrip::Answer(Ok(raw));
            }
            match authoritative_committed_status(
                &preflight,
                state,
                &local_lease_id,
                &prepared,
                run_id,
            ) {
                Ok(Some(status)) => BrokeredRoundTrip::Answer(Ok(status)),
                Ok(None) => {
                    let _ = release_prepared_run_with_retry(
                        &transport,
                        &call,
                        &prepared.reservation_id,
                    );
                    let _ = revoke_failed_actor_token_bundle(state, &local_lease_id);
                    BrokeredRoundTrip::TokenStoreFailure("verify commit")
                }
                // The remote outcome is still unknown. Preserve the bound,
                // expiring lease so a remotely durable run keeps working and a
                // later run-status read can reconcile it.
                Err(_) => BrokeredRoundTrip::TokenStoreFailure("verify commit"),
            }
        }
        // Even an HTTP refusal can follow a durable remote write (for example a
        // post-commit 5xx). Confirm absence authoritatively before reclaiming.
        Err(error @ RagError::Http { .. }) => {
            match authoritative_committed_status(
                &preflight,
                state,
                &local_lease_id,
                &prepared,
                run_id,
            ) {
                Ok(Some(status)) => BrokeredRoundTrip::Answer(Ok(status)),
                Ok(None) => {
                    let released = release_prepared_run_with_retry(
                        &transport,
                        &call,
                        &prepared.reservation_id,
                    );
                    if revoke_failed_actor_token_bundle(state, &local_lease_id).is_err()
                        || released.is_err()
                    {
                        BrokeredRoundTrip::TokenStoreFailure("clean up refused")
                    } else {
                        BrokeredRoundTrip::Answer(Err(error))
                    }
                }
                // Outcome unknown: keep the exact bounded lease for later
                // run-status reconciliation instead of stranding a live run.
                Err(_) => BrokeredRoundTrip::Answer(Err(error)),
            }
        }
        // A connection/protocol failure may mean commit was accepted and only
        // its acknowledgement was lost. Retry the EXACT same reservation,
        // run-id, and bundle once. The sibling's commit replay first reads the
        // durable run and returns its persisted gateway lease id, while a commit
        // that never arrived consumes the still-active reservation now.
        Err(original_error) => {
            let retry =
                perform_forwarded_call(&transport, call.method, &call.path, call.body.as_ref());
            if let Ok(raw) = &retry
                && commit_local_lease(
                    state,
                    &local_lease_id,
                    &prepared.reservation_id,
                    &prepared.gateway_lease_id,
                    run_id,
                    raw,
                )
                .is_ok()
            {
                return BrokeredRoundTrip::Answer(Ok(raw.clone()));
            }

            match authoritative_committed_status(
                &preflight,
                state,
                &local_lease_id,
                &prepared,
                run_id,
            ) {
                Ok(Some(status)) => BrokeredRoundTrip::Answer(Ok(status)),
                Ok(None) => {
                    let _ = release_prepared_run_with_retry(
                        &transport,
                        &call,
                        &prepared.reservation_id,
                    );
                    let _ = revoke_failed_actor_token_bundle(state, &local_lease_id);
                    match retry {
                        Err(error @ RagError::Http { .. }) => BrokeredRoundTrip::Answer(Err(error)),
                        Ok(_) => BrokeredRoundTrip::TokenStoreFailure("recover commit"),
                        Err(_) => BrokeredRoundTrip::Answer(Err(original_error)),
                    }
                }
                // Both commit attempts and the authoritative read are
                // inconclusive. Keep the exact bound lease until expiry/retry;
                // revoking here would strand a run whose ACK alone was lost.
                Err(_) => match retry {
                    Ok(_) => BrokeredRoundTrip::TokenStoreFailure("recover commit"),
                    Err(_) => BrokeredRoundTrip::Answer(Err(original_error)),
                },
            }
        }
    }
}

/// Map a loopback transport error to the engine response: a business refusal
/// the sibling ANSWERED (any non-2xx with a body)
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

/// `POST /ops/a2a/{verb}` — the whitelisted a2a orchestration control pass-through.
/// A verb outside the eight-verb whitelist is a 403 before any
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
    ops_a2a_with_candidates(
        state,
        verb,
        body.map(|Json(body)| body).unwrap_or_default(),
        a2a_service_json_candidates(),
    )
    .await
}

/// Execute the public handler with an explicit discovery list. Production passes
/// the machine-global candidates; direct loopback tests supply a private
/// discovery record so they exercise the full handler without mutating process
/// environment variables shared by parallel tests.
async fn ops_a2a_with_candidates(
    state: Arc<AppState>,
    verb: String,
    body: A2aVerbBody,
    candidates: Vec<PathBuf>,
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

    // Validate + build the forwarded call at the engine boundary (a bad arg is a
    // tiers-carrying 400 that never reaches the sibling).
    let call = build_forwarded_call(&state, &verb, &cell, &body)?;
    let run_start_id = (verb == "run-start").then(|| {
        body.run_id
            .clone()
            .expect("validated run-start carries run_id")
    });

    // The COMPLETE synchronous chain runs on Tokio's blocking pool —
    // not only the final HTTP verb, but discovery-file reads, `/health`, status
    // preflight, and SQLite credential lifecycle as well. The closure owns every
    // value it needs; the body is never logged or formatted outside the socket
    // call because run-start may carry raw actor tokens after provisioning.
    let execution_state = Arc::clone(&state);
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
#[path = "a2a_tests/mod.rs"]
mod tests;
