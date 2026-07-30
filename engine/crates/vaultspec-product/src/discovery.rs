//! Authenticated, versioned discovery validation.
//!
//! The desktop gateway publishes an atomically-written, owner-restricted
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
//!   trusted handoff is present and it is compatible and live.
//!
//! This module does not perform the authenticated service probe itself (that is
//! `control.rs`); it validates the discovery record and classifies the attach
//! decision from it.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::locking::process_is_alive;
use crate::manifest::{RangeBounds, Target};

/// Keys that must never appear in a discovery record. Discovery carries no
/// secret; a record presenting any of these is malformed and rejected
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
    /// Ours, live, and fresh, but declaring protocol/state-schema ranges that
    /// do not overlap the ones we support. Ownership is a fact about the
    /// process, not about the ranges: this gateway still verifies our
    /// receipt-bound ownership capability, so the operations that EXIT this
    /// state (stop, restart, update, rollback) stay available, while the
    /// versioned run surface is never attached.
    OwnedIncompatible,
    /// A foreign gateway that is live, fresh, compatible, and offers a trusted
    /// handoff: attachable READ-ONLY (never mutable).
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
            // Ours never classifies as Foreign: an incompatible range fences
            // the versioned run surface, not the ownership we hold over the
            // process, so the verdict keeps the owned identity.
            if !self.is_compatible(ctx) {
                return Verdict::OwnedIncompatible;
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
        use vaultspec_windows_authority::{AuthorityFile, current_user_sid, private_policy};

        // Fail closed on every step, as the whole predicate does: an undetermined
        // principal is "cannot prove restricted", never "does not match".
        let Ok(user_sid) = current_user_sid() else {
            return false;
        };
        // Read the DACL through an exact retained regular-file read handle (the
        // handoff was confirmed a regular non-symlink above) and apply the looser
        // no-outside-principal predicate over the single snapshot.
        let Ok(reader) = AuthorityFile::open_reader(path) else {
            return false;
        };
        let Ok(snapshot) = reader.dacl_snapshot() else {
            return false;
        };
        return private_policy::validate_no_outside_principal(&snapshot, &user_sid).is_ok();
    }

    #[allow(unreachable_code)]
    false
}

/// Whether two inclusive string-bounded ranges overlap (a ⊇ b when
/// a.min ≤ b.max and b.min ≤ a.max), ordered by [`version_cmp`].
///
/// The bounds are NOT compared lexically: the desktop gateway API tag (`v1`,
/// `v2`, …) and the zero-padded state-schema ids invert under lexical ordering
/// the moment they reach two digits — `"v2" > "v10"` and `"9999" > "10000"` —
/// which would silently turn a genuinely compatible range into an empty
/// interval and classify a usable gateway as incompatible.
fn ranges_overlap(a: &RangeBounds, b: &RangeBounds) -> bool {
    version_cmp(&a.minimum, &b.maximum) != std::cmp::Ordering::Greater
        && version_cmp(&b.minimum, &a.maximum) != std::cmp::Ordering::Greater
}

/// Order two version-shaped identifiers numerically over their digit runs and
/// lexically over everything else, so `v2 < v10` and `0999 < 10000` while
/// `v1 == v1` and `0001 < 0009` keep their existing meaning.
///
/// Digit runs are compared by magnitude WITHOUT parsing (leading zeros stripped,
/// then length, then digits), so an absurdly long run in a hostile record
/// neither overflows nor allocates.
fn version_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    use std::cmp::Ordering;

    let (a, b) = (a.as_bytes(), b.as_bytes());
    let (mut i, mut j) = (0usize, 0usize);
    loop {
        match (a.get(i), b.get(j)) {
            (None, None) => return Ordering::Equal,
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
            (Some(x), Some(y)) if x.is_ascii_digit() && y.is_ascii_digit() => {
                let ai = digit_run(a, i);
                let bj = digit_run(b, j);
                match digit_run_cmp(&a[i..ai], &b[j..bj]) {
                    Ordering::Equal => {
                        i = ai;
                        j = bj;
                    }
                    other => return other,
                }
            }
            (Some(x), Some(y)) => match x.cmp(y) {
                Ordering::Equal => {
                    i += 1;
                    j += 1;
                }
                other => return other,
            },
        }
    }
}

/// The end index of the ASCII-digit run starting at `from`.
fn digit_run(bytes: &[u8], from: usize) -> usize {
    let mut end = from;
    while bytes.get(end).is_some_and(u8::is_ascii_digit) {
        end += 1;
    }
    end
}

/// Compare two ASCII-digit runs by numeric magnitude, allocation- and
/// overflow-free.
fn digit_run_cmp(a: &[u8], b: &[u8]) -> std::cmp::Ordering {
    let a = &a[a.iter().take_while(|d| **d == b'0').count()..];
    let b = &b[b.iter().take_while(|d| **d == b'0').count()..];
    a.len().cmp(&b.len()).then_with(|| a.cmp(b))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn restrict_test_handoff(path: &Path) {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600)).unwrap();
        }
        #[cfg(windows)]
        {
            let whoami = std::process::Command::new("whoami.exe").output().unwrap();
            let user = String::from_utf8(whoami.stdout).unwrap();
            let grant = format!("{}:F", user.trim());
            let status = std::process::Command::new("icacls.exe")
                .arg(path)
                .args([
                    "/inheritance:r",
                    "/grant:r",
                    &grant,
                    "*S-1-5-18:F",
                    "*S-1-5-32-544:F",
                ])
                .status()
                .unwrap();
            assert!(status.success());
        }
    }

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
        let handoff = dir.path().join("attach.cred");
        std::fs::write(&handoff, "not-read-here").unwrap();
        restrict_test_handoff(&handoff);
        let mut v = record();
        v["owner"] = serde_json::json!("seat-b");
        v["handoff_reference"] = serde_json::json!(handoff.to_string_lossy());
        let d = GatewayDiscovery::parse(&v.to_string()).unwrap();
        assert_eq!(d.classify(&ctx(1_500)), Verdict::ForeignAttachable);
    }

    #[test]
    fn version_bounds_order_numerically_not_lexically() {
        use std::cmp::Ordering;
        // The guard: every one of these is INVERTED under lexical ordering, which
        // is what silently turned a compatible range into an empty interval.
        assert_eq!(version_cmp("v2", "v10"), Ordering::Less);
        assert_eq!(version_cmp("v10", "v2"), Ordering::Greater);
        assert_eq!(version_cmp("9999", "10000"), Ordering::Less);
        assert_eq!(version_cmp("0999", "1000"), Ordering::Less);
        // …while the single-digit and equal cases keep their existing meaning.
        assert_eq!(version_cmp("v1", "v1"), Ordering::Equal);
        assert_eq!(version_cmp("v1", "v2"), Ordering::Less);
        assert_eq!(version_cmp("0001", "0009"), Ordering::Less);
        assert_eq!(version_cmp("0009", "0009"), Ordering::Equal);
        // Leading zeros do not change magnitude; the non-digit prefix still leads.
        assert_eq!(version_cmp("v007", "v7"), Ordering::Equal);
        assert_eq!(version_cmp("a2", "b1"), Ordering::Less);
    }

    #[test]
    fn a_two_digit_protocol_window_still_accepts_a_gateway_inside_it() {
        // A release supporting v2..v10 must accept a v2 gateway. Lexically
        // "v2" > "v10", so the supported window read as an EMPTY interval and a
        // perfectly compatible gateway classified Incompatible.
        let mut v = record();
        v["protocol"] = serde_json::json!({ "minimum": "v2", "maximum": "v2" });
        v["state_schema"] = serde_json::json!({ "minimum": "9999", "maximum": "9999" });
        let d = GatewayDiscovery::parse(&v.to_string()).unwrap();
        let mut context = ctx(1_500);
        context.supported_protocol = RangeBounds {
            minimum: "v2".to_string(),
            maximum: "v10".to_string(),
        };
        context.supported_state_schema = RangeBounds {
            minimum: "0001".to_string(),
            maximum: "10000".to_string(),
        };
        assert_eq!(d.classify(&context), Verdict::OwnedLive);
    }

    #[test]
    fn a_gateway_outside_a_two_digit_window_is_still_refused() {
        // The counterpart proof: numeric ordering must not turn the overlap test
        // into a tautology — a v11 gateway is outside a v2..v10 window.
        let mut v = record();
        v["protocol"] = serde_json::json!({ "minimum": "v11", "maximum": "v11" });
        let d = GatewayDiscovery::parse(&v.to_string()).unwrap();
        let mut context = ctx(1_500);
        context.supported_protocol = RangeBounds {
            minimum: "v2".to_string(),
            maximum: "v10".to_string(),
        };
        // The record is OURS, so the out-of-window refusal keeps the owned
        // identity rather than forfeiting it to a Foreign verdict.
        assert_eq!(d.classify(&context), Verdict::OwnedIncompatible);
    }

    #[test]
    fn incompatible_protocol_is_refused() {
        // Ours + live + fresh + disjoint ranges: the owned identity is kept and
        // the incompatibility is its own verdict.
        let mut v = record();
        v["protocol"] = serde_json::json!({ "minimum": "v2", "maximum": "v2" });
        let d = GatewayDiscovery::parse(&v.to_string()).unwrap();
        assert_eq!(d.classify(&ctx(1_500)), Verdict::OwnedIncompatible);

        // A FOREIGN incompatible gateway still classifies foreign-immutable.
        let mut foreign = record();
        foreign["owner"] = serde_json::json!("seat-b");
        foreign["protocol"] = serde_json::json!({ "minimum": "v2", "maximum": "v2" });
        let d = GatewayDiscovery::parse(&foreign.to_string()).unwrap();
        assert_eq!(
            d.classify(&ctx(1_500)),
            Verdict::ForeignImmutable {
                reason: ImmutableReason::Incompatible
            }
        );
    }

    #[test]
    fn an_owned_record_never_classifies_as_foreign() {
        // Ownership is a fact about the process; no combination of liveness,
        // freshness, or range compatibility may map OUR OWN record onto a
        // Foreign verdict.
        for (heartbeat, protocol_min) in [
            (1_000_i64, "v1"), // live + fresh + compatible
            (1_000, "v2"),     // live + fresh + incompatible
            (-100_000, "v1"),  // stale + compatible
            (-100_000, "v2"),  // stale + incompatible
        ] {
            let mut v = record();
            v["heartbeat_ms"] = serde_json::json!(heartbeat);
            v["protocol"] = serde_json::json!({ "minimum": protocol_min, "maximum": protocol_min });
            let d = GatewayDiscovery::parse(&v.to_string()).unwrap();
            let verdict = d.classify(&ctx(1_500));
            assert!(
                !matches!(
                    verdict,
                    Verdict::ForeignAttachable | Verdict::ForeignImmutable { .. }
                ),
                "an owned record must never classify foreign: {verdict:?}"
            );
        }
    }
}
