//! Authenticated, versioned discovery validation (a2a-product-provisioning
//! W01.P02.S13).
//!
//! ADR D5: the desktop gateway publishes an atomically-written, owner-restricted
//! discovery record that carries NO secret. It names the endpoint, process,
//! owner, install identity, generation, release set, protocol, state schema, and
//! a non-secret trusted-handoff reference (the path to the owner-ACL
//! attach-control credential file). A dashboard reads this record and classifies
//! the gateway before it ever attaches:
//!
//! - it rejects a secret-bearing record outright (discovery must never carry a
//!   bearer);
//! - it proves the process is live and the heartbeat fresh;
//! - it checks protocol/state-schema compatibility;
//! - it treats a foreign gateway as immutable, attachable read-only ONLY when a
//!   trusted handoff is present and it is compatible and live (ADR D4).
//!
//! This module does not perform the authenticated service probe itself (that is
//! `control.rs`); it validates the discovery record and classifies the attach
//! decision from it.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::locking::process_is_alive;
use crate::manifest::{RangeBounds, Target};

/// Keys that must never appear in a discovery record. Discovery carries no
/// secret (ADR D5); a record presenting any of these is malformed and rejected
/// rather than read, so a compromised or buggy publisher cannot leak a bearer
/// through the discovery channel.
const FORBIDDEN_SECRET_KEYS: &[&str] = &[
    "service_token",
    "bearer",
    "secret",
    "token",
    "credential",
    "password",
    "attach_token",
    "ownership",
];

/// The release-set reference a discovery record advertises (non-secret).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReleaseSetRef {
    pub name: String,
    pub version: String,
    pub target: Target,
}

/// A parsed, secret-free gateway discovery record.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct GatewayDiscovery {
    /// The loopback endpoint (e.g. `127.0.0.1:8791`).
    pub endpoint: String,
    /// The gateway process id.
    pub pid: u32,
    /// The owner identity that published this record.
    pub owner: String,
    /// The install identity the gateway belongs to.
    pub install_identity: String,
    /// The active generation id.
    pub generation: String,
    /// The release set this gateway serves.
    pub release_set: ReleaseSetRef,
    /// The served gateway API version range.
    pub protocol: RangeBounds,
    /// The packaged state-schema (migration) range.
    pub state_schema: RangeBounds,
    /// The non-secret trusted-handoff reference: the path to the owner-ACL
    /// attach-control credential file. Never the secret itself.
    pub handoff_reference: String,
    /// The last heartbeat, epoch milliseconds.
    pub heartbeat_ms: i64,
}

/// Why a discovery record could not be parsed or was rejected.
#[derive(Debug)]
pub enum DiscoveryError {
    /// The record did not parse as a discovery object.
    Parse(String),
    /// The record carried a forbidden secret-bearing key.
    SecretBearing { key: String },
}

impl std::fmt::Display for DiscoveryError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DiscoveryError::Parse(m) => write!(f, "discovery parse failed: {m}"),
            DiscoveryError::SecretBearing { key } => write!(
                f,
                "discovery record carries forbidden secret key {key:?}; discovery must be secret-free"
            ),
        }
    }
}

impl std::error::Error for DiscoveryError {}

/// The context a classification is made against: our own receipt owner, the
/// current time, the freshness window, and the protocol/state ranges our
/// installed release set supports.
#[derive(Debug, Clone)]
pub struct DiscoveryContext {
    /// Our receipt owner identity.
    pub our_owner: String,
    /// The current wall-clock time (epoch milliseconds).
    pub now_ms: i64,
    /// How recent a heartbeat must be to count as fresh.
    pub freshness_ms: i64,
    /// The gateway API version range our release set supports.
    pub supported_protocol: RangeBounds,
    /// The state-schema range our release set supports.
    pub supported_state_schema: RangeBounds,
}

/// Why a foreign or stale gateway is immutable / not attachable.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ImmutableReason {
    /// The recorded process is dead or the heartbeat is stale.
    DeadOrStale,
    /// No trusted handoff reference is readable, so attachment must be refused.
    NoTrustedHandoff,
    /// The protocol or state-schema range does not overlap ours.
    Incompatible,
}

/// The attach/ownership classification of a discovered gateway.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Verdict {
    /// Ours, live, fresh, and compatible — the owned gateway.
    OwnedLive,
    /// Ours but dead or stale — a quarantine candidate under the install lock
    /// (subject to the owner-matched proof-of-death in `locking`).
    OwnedStale,
    /// A foreign gateway that is live, fresh, compatible, and offers a trusted
    /// handoff: attachable READ-ONLY (never mutable — ADR D4).
    ForeignAttachable,
    /// A foreign (or unusable) gateway that must be left immutable.
    ForeignImmutable { reason: ImmutableReason },
}

impl GatewayDiscovery {
    /// Parse a discovery record, rejecting any secret-bearing field first. The
    /// raw JSON is scanned for forbidden keys BEFORE structural parse, so a
    /// record that smuggles a bearer is refused even if it also parses.
    pub fn parse(raw: &str) -> std::result::Result<Self, DiscoveryError> {
        let value: serde_json::Value =
            serde_json::from_str(raw).map_err(|e| DiscoveryError::Parse(e.to_string()))?;
        if let Some(obj) = value.as_object() {
            for key in obj.keys() {
                let lowered = key.to_ascii_lowercase();
                if FORBIDDEN_SECRET_KEYS.iter().any(|f| lowered == *f) {
                    return Err(DiscoveryError::SecretBearing { key: key.clone() });
                }
            }
        }
        serde_json::from_value(value).map_err(|e| DiscoveryError::Parse(e.to_string()))
    }

    /// Whether the heartbeat is fresh relative to the context's window. A future
    /// heartbeat (clock skew) is treated as fresh, not rejected.
    #[must_use]
    pub fn is_fresh(&self, ctx: &DiscoveryContext) -> bool {
        ctx.now_ms.saturating_sub(self.heartbeat_ms) <= ctx.freshness_ms
    }

    /// Whether this gateway's protocol and state-schema ranges overlap ours.
    #[must_use]
    pub fn is_compatible(&self, ctx: &DiscoveryContext) -> bool {
        ranges_overlap(&self.protocol, &ctx.supported_protocol)
            && ranges_overlap(&self.state_schema, &ctx.supported_state_schema)
    }

    /// Whether a trusted handoff is present: the referenced attach-control
    /// credential file exists and is readable by us (a foreign dashboard without
    /// owner-ACL access cannot read it, and so must refuse attachment).
    #[must_use]
    pub fn has_trusted_handoff(&self) -> bool {
        let path = Path::new(&self.handoff_reference);
        handoff_is_owner_restricted(path) && std::fs::File::open(path).is_ok()
    }

    /// Classify the attach/ownership decision for this discovered gateway. Live
    /// process identity, freshness, compatibility, owner match, and the trusted
    /// handoff together decide the verdict. A foreign gateway is never mutable;
    /// it is at most attachable read-only.
    #[must_use]
    pub fn classify(&self, ctx: &DiscoveryContext) -> Verdict {
        let ours = self.owner == ctx.our_owner;
        let alive = process_is_alive(self.pid) && self.is_fresh(ctx);
        if ours {
            if !alive {
                return Verdict::OwnedStale;
            }
            if !self.is_compatible(ctx) {
                return Verdict::ForeignImmutable {
                    reason: ImmutableReason::Incompatible,
                };
            }
            return Verdict::OwnedLive;
        }
        // Foreign: immutable in every case; attachable read-only only when live,
        // fresh, compatible, and offering a trusted handoff.
        if !alive {
            return Verdict::ForeignImmutable {
                reason: ImmutableReason::DeadOrStale,
            };
        }
        if !self.is_compatible(ctx) {
            return Verdict::ForeignImmutable {
                reason: ImmutableReason::Incompatible,
            };
        }
        if !self.has_trusted_handoff() {
            return Verdict::ForeignImmutable {
                reason: ImmutableReason::NoTrustedHandoff,
            };
        }
        Verdict::ForeignAttachable
    }
}

/// Verify that a local handoff file grants no ordinary peer account access.
///
/// Unix uses the owner-bit contract. Windows accepts allow ACEs only for the
/// current account, LocalSystem, and the built-in Administrators group. This is
/// deliberately stricter than mere readability: a shared custom app-home must
/// not silently turn a bearer into machine-wide ambient authority.
#[must_use]
pub fn handoff_is_owner_restricted(path: &Path) -> bool {
    let Ok(metadata) = std::fs::symlink_metadata(path) else {
        return false;
    };
    if !metadata.file_type().is_file() || metadata.file_type().is_symlink() {
        return false;
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        return metadata.permissions().mode() & 0o077 == 0;
    }

    #[cfg(windows)]
    {
        use windows_acl::acl::{ACL, AceType};
        use windows_acl::helper::{current_user, name_to_sid, sid_to_string};

        let Some(path) = path.to_str() else {
            return false;
        };
        let Some(user) = current_user() else {
            return false;
        };
        let Ok(user_sid) = name_to_sid(&user, None) else {
            return false;
        };
        let Ok(user_sid) = sid_to_string(user_sid.as_ptr().cast_mut().cast()) else {
            return false;
        };
        let Ok(acl) = ACL::from_file_path(path, false) else {
            return false;
        };
        let Ok(entries) = acl.all() else {
            return false;
        };
        let allowed = [user_sid.as_str(), "S-1-5-18", "S-1-5-32-544"];
        let mut user_allowed = false;
        for entry in entries {
            match entry.entry_type {
                AceType::AccessAllow => {
                    if !allowed.contains(&entry.string_sid.as_str()) {
                        return false;
                    }
                    user_allowed |= entry.string_sid == user_sid;
                }
                AceType::AccessDeny => {}
                _ => return false,
            }
        }
        return user_allowed;
    }

    #[allow(unreachable_code)]
    false
}

/// Apply the local owner-only handoff policy to an existing regular file.
///
/// This is also the canonical setup seam for components that publish product
/// handoffs: readers and writers therefore share one platform policy.
pub fn restrict_handoff_to_current_user(path: &Path) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))?;
    }

    #[cfg(windows)]
    {
        use std::io::{Error, ErrorKind};
        use std::process::Command;
        use windows_acl::helper::{current_user, name_to_sid, sid_to_string};

        let user = current_user().ok_or_else(|| {
            Error::new(
                ErrorKind::PermissionDenied,
                "current Windows user is unknown",
            )
        })?;
        let raw_sid =
            name_to_sid(&user, None).map_err(|code| Error::from_raw_os_error(code as i32))?;
        let sid = sid_to_string(raw_sid.as_ptr().cast_mut().cast())
            .map_err(|code| Error::from_raw_os_error(code as i32))?;
        let status = Command::new("icacls.exe")
            .arg(path)
            .args([
                "/inheritance:r",
                "/grant:r",
                &format!("*{sid}:F"),
                "*S-1-5-18:F",
                "*S-1-5-32-544:F",
            ])
            .status()?;
        if !status.success() {
            return Err(Error::new(
                ErrorKind::PermissionDenied,
                "failed to apply owner-only Windows handoff ACL",
            ));
        }
    }

    Ok(())
}

/// Whether two inclusive string-bounded ranges overlap. Ranges are compared
/// lexically on their bounds; the desktop gateway API (`v1`) and Alembic
/// revision ids compare correctly under lexical ordering for the overlap test
/// (a ⊇ b when a.min ≤ b.max and b.min ≤ a.max).
fn ranges_overlap(a: &RangeBounds, b: &RangeBounds) -> bool {
    a.minimum <= b.maximum && b.minimum <= a.maximum
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record() -> serde_json::Value {
        serde_json::json!({
            "endpoint": "127.0.0.1:8791",
            "pid": std::process::id(),
            "owner": "seat-a",
            "install_identity": "install-1",
            "generation": "gen-0",
            "release_set": { "name": "vaultspec-a2a", "version": "0.1.0", "target": "x86_64-pc-windows-msvc" },
            "protocol": { "minimum": "v1", "maximum": "v1" },
            "state_schema": { "minimum": "0001", "maximum": "0009" },
            "handoff_reference": "",
            "heartbeat_ms": 1_000
        })
    }

    fn ctx(now_ms: i64) -> DiscoveryContext {
        DiscoveryContext {
            our_owner: "seat-a".to_string(),
            now_ms,
            freshness_ms: 30_000,
            supported_protocol: RangeBounds {
                minimum: "v1".to_string(),
                maximum: "v1".to_string(),
            },
            supported_state_schema: RangeBounds {
                minimum: "0001".to_string(),
                maximum: "0009".to_string(),
            },
        }
    }

    #[test]
    fn secret_bearing_discovery_is_rejected() {
        let mut v = record();
        v["service_token"] = serde_json::json!("feedface");
        let err = GatewayDiscovery::parse(&v.to_string()).unwrap_err();
        assert!(matches!(err, DiscoveryError::SecretBearing { .. }));
    }

    #[test]
    fn owned_live_when_ours_fresh_and_compatible() {
        // The record names our own live pid and a fresh heartbeat.
        let mut v = record();
        v["heartbeat_ms"] = serde_json::json!(1_000);
        let d = GatewayDiscovery::parse(&v.to_string()).unwrap();
        assert_eq!(d.classify(&ctx(1_500)), Verdict::OwnedLive);
    }

    #[test]
    fn stale_heartbeat_makes_our_gateway_a_quarantine_candidate() {
        let d = GatewayDiscovery::parse(&record().to_string()).unwrap();
        // now far beyond the freshness window -> stale even though pid is live.
        assert_eq!(d.classify(&ctx(10_000_000)), Verdict::OwnedStale);
    }

    #[test]
    fn foreign_live_without_handoff_is_immutable() {
        let mut v = record();
        v["owner"] = serde_json::json!("seat-b");
        v["handoff_reference"] = serde_json::json!("");
        let d = GatewayDiscovery::parse(&v.to_string()).unwrap();
        assert_eq!(
            d.classify(&ctx(1_500)),
            Verdict::ForeignImmutable {
                reason: ImmutableReason::NoTrustedHandoff
            }
        );
    }

    #[test]
    fn foreign_live_with_trusted_handoff_is_attachable_readonly() {
        let dir = tempfile::tempdir().unwrap();
        let handoff = dir.path().join("attach-control.cred");
        std::fs::write(&handoff, "not-read-here").unwrap();
        restrict_handoff_to_current_user(&handoff).unwrap();
        let mut v = record();
        v["owner"] = serde_json::json!("seat-b");
        v["handoff_reference"] = serde_json::json!(handoff.to_string_lossy());
        let d = GatewayDiscovery::parse(&v.to_string()).unwrap();
        assert_eq!(d.classify(&ctx(1_500)), Verdict::ForeignAttachable);
    }

    #[test]
    fn incompatible_protocol_is_refused() {
        let mut v = record();
        v["protocol"] = serde_json::json!({ "minimum": "v2", "maximum": "v2" });
        let d = GatewayDiscovery::parse(&v.to_string()).unwrap();
        assert_eq!(
            d.classify(&ctx(1_500)),
            Verdict::ForeignImmutable {
                reason: ImmutableReason::Incompatible
            }
        );
    }
}
