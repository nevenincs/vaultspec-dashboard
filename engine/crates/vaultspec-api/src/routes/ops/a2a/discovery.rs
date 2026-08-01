//! Machine-global a2a discovery and endpoint resolution: how the pass-through
//! FINDS the resident gateway, and nothing about what it then forwards.
//!
//! This is the attach-never-own half of the edge. It answers one question —
//! "is there a live a2a gateway, and on what port, with what bearer?" — from the
//! filesystem record the resident gateway publishes, and it answers it
//! honestly: a stale heartbeat, a malformed record, an escaped or
//! non-owner-restricted handoff credential, and an absent file are all `Down`
//! with a truthful reason, never a usable endpoint. Discovery itself is
//! secret-free; the only credential read here is the owner-restricted handoff
//! file the record REFERENCES, and it never reaches a log line.
//!
//! Held apart from the control verbs because it is a self-contained predicate
//! with its own trust rules, consumed by three callers that share nothing else:
//! the pass-through transport, the run-stream relay, and the agent tier.

use std::path::PathBuf;

use rag_client::client::{LoopbackTransport, RagTransport};
use serde_json::Value;
use vaultspec_product::a2a_contract::{
    A2A_HOME_DIR, A2A_HOME_ENV, HANDOFF_CREDENTIAL_FILE, RESIDENT_DISCOVERY_FILE,
};

use super::{A2A_HEALTH_TIMEOUT, A2A_HEARTBEAT_STALE_MS};
use crate::app::now_ms;

/// The a2a discovery record shape (`~/.vaultspec-a2a/service.json`): the R8
/// `ServiceInfo` contract the resident gateway publishes. Discovery itself is
/// secret-free; `handoff_reference` names the sibling bearer file.
#[derive(Clone, serde::Deserialize)]
pub(super) struct A2aServiceInfo {
    pub(super) port: u16,
    #[serde(default)]
    #[allow(dead_code)]
    pub(super) pid: Option<u32>,
    #[serde(default)]
    pub(super) last_heartbeat: Option<i64>,
    #[serde(default)]
    pub(super) handoff_reference: Option<String>,
    #[serde(skip)]
    pub(super) service_token: Option<String>,
}

impl std::fmt::Debug for A2aServiceInfo {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("A2aServiceInfo")
            .field("port", &self.port)
            .field("pid", &self.pid)
            .field("last_heartbeat", &self.last_heartbeat)
            .field("handoff_reference", &self.handoff_reference)
            .field(
                "service_token",
                &self.service_token.as_ref().map(|_| "<redacted>"),
            )
            .finish()
    }
}

/// The typed outcome of scanning the a2a discovery candidates, mirroring rag's
/// `DiscoveryOutcome`: `Fresh` licenses a round-trip, everything else is a
/// known-down sibling degraded honestly at 200.
#[derive(Debug, Clone)]
pub(super) enum A2aDiscovery {
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
pub(super) fn a2a_service_json_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(home) = std::env::var_os(A2A_HOME_ENV) {
        candidates.push(PathBuf::from(home).join(RESIDENT_DISCOVERY_FILE));
    }
    let user_home = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME"));
    if let Some(user_home) = user_home {
        candidates.push(
            PathBuf::from(user_home)
                .join(A2A_HOME_DIR)
                .join(RESIDENT_DISCOVERY_FILE),
        );
    }
    candidates
}

/// Classify the a2a discovery candidates filesystem-only (no `/health` probe):
/// the first readable record with a fresh heartbeat is `Fresh`; a stale
/// heartbeat, an unreadable record, or no file at all is `Down` with a truthful
/// reason. Hermetic over an explicit candidate list for tests.
pub(super) fn discover_a2a_at(candidates: &[PathBuf]) -> A2aDiscovery {
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
    let expected = discovery_path.with_file_name(HANDOFF_CREDENTIAL_FILE);
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

/// DUAL-RESOLVE the resident a2a gateway endpoint: PREFER the product
/// controller's authenticated, versioned
/// discovery (the secret-free `gateway-discovery.json` + the attach-control
/// credential the `LifecyclePlane` resolves), and FALL BACK to the
/// resident `service.json` + owner-restricted handoff path when the product path
/// resolves nothing.
///
/// The product path is the preferred target. The `service.json` fallback keeps the
/// live `/ops/a2a` edge green until the A2A capsule publishes the product
/// discovery format, and retires when it does — it is NOT deleted. A product
/// discovery that is stale, incompatible, or untrusted resolves `Unavailable`
/// (never a usable endpoint) and DEFERS to the fallback rather than displacing a
/// working resident; both down surfaces the fallback's honest reason. Shared by
/// the pass-through transport (`ops_a2a`) and the run-stream relay (`a2a_stream`).
pub(super) fn a2a_endpoint_dual(
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
pub(crate) fn a2a_endpoint(
    plane: &crate::routes::a2a_lifecycle::LifecyclePlane,
) -> Result<(u16, Option<String>), String> {
    a2a_endpoint_dual(plane, &a2a_service_json_candidates())
}

/// [`a2a_endpoint`] over an explicit candidate list — hermetic for a real-socket
/// loopback test, avoiding the process-global `VAULTSPEC_A2A_HOME` env under
/// parallel test threads.
pub(super) fn a2a_endpoint_from(candidates: &[PathBuf]) -> Result<(u16, Option<String>), String> {
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

/// Is a RESIDENT (non-product) a2a gateway discoverable and attachable right now?
/// This is the filesystem half of the pass-through's OWN attach-never-own
/// predicate — a fresh heartbeat plus a readable owner-restricted handoff — and
/// nothing else; no secret escapes (a `Fresh` record's token is dropped here).
///
/// The agent tier rides this so it can never contradict the plane it describes.
/// The transport dual-resolves (product controller discovery first, this resident
/// record as the fallback that keeps the live edge green), so a tier reading only
/// the product lane reports a sibling unavailable in the very response that
/// forwarded that sibling's answer.
///
/// The `/health` confirm is deliberately NOT performed here: the tier is
/// recomputed behind a one-second memo on EVERY response envelope, and a probe
/// against a dead port would stall unrelated reads. A discovered-but-not-serving
/// sibling still degrades honestly — the pass-through performs the confirm at
/// call time and returns its own explicit `agent` degradation, which is
/// authoritative and overrides this baseline.
pub(crate) fn resident_sibling_is_attachable() -> Result<(), String> {
    match discover_a2a_at(&a2a_service_json_candidates()) {
        A2aDiscovery::Fresh(_) => Ok(()),
        A2aDiscovery::Down { reason } => Err(reason),
    }
}
