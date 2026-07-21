//! The external five-member cohort descriptor + digest (a2a-product-provisioning
//! W04.P08.S166).
//!
//! After all five per-target member manifests exist, the release aggregates
//! exactly one VERIFIED member for each of the five unique target triples,
//! enforces the common identity every member must share (cohort id, A2A commit,
//! component-lock join, release schema, protocol, and state-schema), and emits the
//! external CohortDescriptor. The cohort digest is SHA-256 of that descriptor's
//! RFC 8785 JSON Canonicalization Scheme (JCS) serialization — the canonical
//! preimage is produced by `serde_jcs`, NEVER hand-rolled. The descriptor is
//! EXTERNAL to every member (a member's `cohort.id` matches it, but the digest is
//! never embedded back), so hashing the five raw member documents is non-circular.

use serde::Serialize;
use serde_json::Value;

use crate::hex;
use crate::manifest::{ComponentLock, ManifestError, ReleaseSetManifest, Target};

/// The five release targets in canonical `TargetTriple` enum order — the closed,
/// exact cohort roster.
const COHORT_ROSTER: [Target; 5] = [
    Target::Aarch64AppleDarwin,
    Target::X86_64AppleDarwin,
    Target::Aarch64UnknownLinuxGnu,
    Target::X86_64UnknownLinuxGnu,
    Target::X86_64PcWindowsMsvc,
];

/// Why the cohort could not be aggregated. Bounded and secret-free.
#[derive(Debug)]
pub enum CohortError {
    /// A member manifest failed the production verifier.
    Member {
        target: Target,
        error: ManifestError,
    },
    /// A member's declared target does not match the roster slot it was supplied
    /// for, or the roster is not exactly the five unique targets.
    Roster { detail: String },
    /// The five members do not share the identity a cohort requires (id, A2A
    /// commit, component-lock join, release schema, protocol, or state schema).
    Identity { detail: String },
    /// The descriptor could not be canonicalized (JCS) or serialized.
    Serialize(String),
}

impl std::fmt::Display for CohortError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Member { target, error } => {
                write!(
                    f,
                    "cohort member {} failed verification: {error}",
                    target.triple()
                )
            }
            Self::Roster { detail } => write!(f, "cohort roster is invalid: {detail}"),
            Self::Identity { detail } => write!(f, "cohort members disagree on identity: {detail}"),
            Self::Serialize(detail) => {
                write!(f, "cohort descriptor serialization failed: {detail}")
            }
        }
    }
}

impl std::error::Error for CohortError {}

/// The emitted external cohort authority.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CohortEmission {
    /// The RFC 8785 JCS serialization of the descriptor — the exact digest
    /// preimage (UTF-8, no BOM, no trailing bytes).
    pub descriptor_jcs: Vec<u8>,
    /// SHA-256 of `descriptor_jcs` — the receipt-bound cohort digest.
    pub cohort_digest: String,
}

/// Aggregate exactly one verified member per target into the external cohort
/// descriptor and emit its JCS preimage + digest.
///
/// Each `(target, raw member manifest)` is verified through the S06 authority
/// against `lock`; the five must form the exact roster and share one cohort id,
/// A2A commit, component-lock join, release schema, protocol, and state schema. A
/// member cannot self-authorize its lock — the join is checked against the same
/// independently trusted `lock`.
pub fn emit_cohort_descriptor(
    members: &[(Target, String)],
    lock: &ComponentLock,
) -> Result<CohortEmission, CohortError> {
    if members.len() != COHORT_ROSTER.len() {
        return Err(CohortError::Roster {
            detail: format!(
                "expected {} members, got {}",
                COHORT_ROSTER.len(),
                members.len()
            ),
        });
    }

    // Verify each member and index it by its declared target.
    let mut by_target: Vec<Option<(String, Value)>> = vec![None; COHORT_ROSTER.len()];
    let mut shared: Option<Identity> = None;
    for (target, raw) in members {
        ReleaseSetManifest::parse_and_verify(raw, lock).map_err(|error| CohortError::Member {
            target: *target,
            error,
        })?;
        let value: Value =
            serde_json::from_str(raw).map_err(|error| CohortError::Serialize(error.to_string()))?;
        let identity = Identity::extract(&value)?;
        if identity.target != target.triple() {
            return Err(CohortError::Roster {
                detail: format!(
                    "member supplied for {} declares target {}",
                    target.triple(),
                    identity.target
                ),
            });
        }
        // Enforce the common cross-member identity.
        match &shared {
            None => shared = Some(identity.shared()),
            Some(first) => {
                if let Some(field) = first.differs_from(&identity) {
                    return Err(CohortError::Identity {
                        detail: format!("members disagree on {field}"),
                    });
                }
            }
        }
        let slot = COHORT_ROSTER
            .iter()
            .position(|t| t == target)
            .ok_or_else(|| CohortError::Roster {
                detail: format!("target {} is not in the closed roster", target.triple()),
            })?;
        if by_target[slot].is_some() {
            return Err(CohortError::Roster {
                detail: format!("duplicate member for {}", target.triple()),
            });
        }
        by_target[slot] = Some((hex::sha256(raw.as_bytes()), value));
    }

    let shared = shared.expect("five members verified above");
    // Members array in canonical roster order.
    let mut cohort_members = Vec::with_capacity(COHORT_ROSTER.len());
    for (index, target) in COHORT_ROSTER.iter().enumerate() {
        let (digest, _) = by_target[index]
            .as_ref()
            .ok_or_else(|| CohortError::Roster {
                detail: format!("no member for {}", target.triple()),
            })?;
        cohort_members.push(CohortMemberOut {
            target: target.triple().to_owned(),
            member_manifest_digest: digest.clone(),
        });
    }

    let descriptor = CohortDescriptor {
        schema_version: "1.0",
        id: shared.id,
        digest_algorithm: "sha256",
        members: cohort_members,
    };
    // The digest preimage is EXACTLY the JCS bytes — canonicalized by serde_jcs,
    // never hand-rolled.
    let descriptor_jcs = serde_jcs::to_vec(&descriptor)
        .map_err(|error| CohortError::Serialize(error.to_string()))?;
    let cohort_digest = hex::sha256(&descriptor_jcs);
    Ok(CohortEmission {
        descriptor_jcs,
        cohort_digest,
    })
}

/// The identity fields all five members must share.
struct Identity {
    id: String,
    target: String,
    a2a_commit: String,
    component_lock_digest: String,
    schema_version: String,
    protocol: String,
    state_schema: String,
}

impl Identity {
    fn extract(value: &Value) -> Result<Self, CohortError> {
        let get = |path: &[&str]| -> Result<String, CohortError> {
            let mut cursor = value;
            for key in path {
                cursor = cursor.get(key).ok_or_else(|| CohortError::Identity {
                    detail: format!("member manifest missing {}", path.join(".")),
                })?;
            }
            match cursor {
                Value::String(s) => Ok(s.clone()),
                other => Ok(other.to_string()),
            }
        };
        Ok(Self {
            id: get(&["cohort", "id"])?,
            target: get(&["target"])?,
            a2a_commit: get(&["a2a_component", "commit"])?,
            component_lock_digest: get(&["a2a_component", "component_lock", "digest"])?,
            schema_version: get(&["schema_version"])?,
            protocol: value["protocol"].to_string(),
            state_schema: value["state_schema"].to_string(),
        })
    }

    fn shared(self) -> Self {
        self
    }

    /// The first identity field that differs from `other`, if any (target is
    /// per-member and intentionally excluded).
    fn differs_from(&self, other: &Identity) -> Option<&'static str> {
        if self.id != other.id {
            Some("cohort id")
        } else if self.a2a_commit != other.a2a_commit {
            Some("A2A commit")
        } else if self.component_lock_digest != other.component_lock_digest {
            Some("component-lock digest")
        } else if self.schema_version != other.schema_version {
            Some("schema version")
        } else if self.protocol != other.protocol {
            Some("protocol range")
        } else if self.state_schema != other.state_schema {
            Some("state-schema range")
        } else {
            None
        }
    }
}

#[derive(Serialize)]
struct CohortDescriptor {
    schema_version: &'static str,
    id: String,
    digest_algorithm: &'static str,
    members: Vec<CohortMemberOut>,
}

#[derive(Serialize)]
struct CohortMemberOut {
    target: String,
    member_manifest_digest: String,
}
