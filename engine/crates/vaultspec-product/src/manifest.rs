//! Manifest parse and verification (a2a-product-provisioning W01.P01.S06).
//!
//! The dashboard owns three pinning documents and treats the A2A capsule as an
//! opaque, versioned artifact (ADR constraint: "opaque to dashboard business
//! logic"):
//!
//! - the **component lock** (`packaging/a2a-component.lock.json`) — the
//!   dashboard's authoritative pin of the exact A2A source commit, release
//!   identity, and every base-closure digest;
//! - the **capsule manifest** — the A2A-emitted
//!   `schemas/desktop-capsule-manifest.json` document the producer ships beside
//!   each target capsule, the entire boundary the dashboard reads about a
//!   generation;
//! - the **release-set manifest** — the dashboard-owned document that binds one
//!   target's dashboard build to the pinned A2A component and runtime inputs.
//!
//! Verification is fail-closed. A floating identity (`latest`, a range operator,
//! a wildcard), a target mismatch, an unpinned selector, or a digest that drifts
//! from the lock is a hard rejection, never a tolerated read. Nothing here
//! interprets the capsule's internal Python layout; it reads only the declared
//! contract fields.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// The five accepted desktop release targets, as Rust-style triples. Mirrors the
/// `TargetTriple` enum shared by the component lock, the capsule manifest, and
/// the release-set schema; a value outside this closed set fails to deserialize.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum Target {
    #[serde(rename = "aarch64-apple-darwin")]
    Aarch64AppleDarwin,
    #[serde(rename = "x86_64-apple-darwin")]
    X86_64AppleDarwin,
    #[serde(rename = "aarch64-unknown-linux-gnu")]
    Aarch64UnknownLinuxGnu,
    #[serde(rename = "x86_64-unknown-linux-gnu")]
    X86_64UnknownLinuxGnu,
    #[serde(rename = "x86_64-pc-windows-msvc")]
    X86_64PcWindowsMsvc,
}

impl Target {
    /// The canonical triple string, matching the wire representation.
    #[must_use]
    pub fn triple(self) -> &'static str {
        match self {
            Target::Aarch64AppleDarwin => "aarch64-apple-darwin",
            Target::X86_64AppleDarwin => "x86_64-apple-darwin",
            Target::Aarch64UnknownLinuxGnu => "aarch64-unknown-linux-gnu",
            Target::X86_64UnknownLinuxGnu => "x86_64-unknown-linux-gnu",
            Target::X86_64PcWindowsMsvc => "x86_64-pc-windows-msvc",
        }
    }
}

/// Every way a manifest can fail parse or verification. Each variant names the
/// concrete rejection so a caller (and a test) can assert the exact reason
/// rather than a generic failure.
#[derive(Debug)]
pub enum ManifestError {
    /// The document did not parse as the expected shape.
    Parse(String),
    /// A version, commit, or selector was floating (`latest`, a range operator,
    /// a wildcard) where an exact pin is required.
    FloatingSelector { field: String, value: String },
    /// A commit was not a full 40-hex git sha.
    UnpinnedCommit { field: String, value: String },
    /// A digest was not a lowercase 64-hex SHA-256 string.
    MalformedDigest { field: String, value: String },
    /// The capsule or release set is for a different target than expected.
    TargetMismatch { expected: Target, found: Target },
    /// A digest, commit, or identity disagreed with the component lock's pin.
    DigestDrift {
        field: String,
        expected: String,
        found: String,
    },
    /// A cross-field identity invariant was violated (e.g. the capsule identity
    /// version must equal its bundled A2A distribution asset version).
    IdentityMismatch { detail: String },
    /// The lock did not pin a per-target digest for the requested target.
    MissingTargetPin { field: String, target: Target },
}

impl std::fmt::Display for ManifestError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ManifestError::Parse(m) => write!(f, "manifest parse failed: {m}"),
            ManifestError::FloatingSelector { field, value } => {
                write!(
                    f,
                    "floating selector in {field}: {value:?} is not an exact pin"
                )
            }
            ManifestError::UnpinnedCommit { field, value } => {
                write!(
                    f,
                    "unpinned commit in {field}: {value:?} is not a 40-hex sha"
                )
            }
            ManifestError::MalformedDigest { field, value } => {
                write!(
                    f,
                    "malformed digest in {field}: {value:?} is not a 64-hex sha256"
                )
            }
            ManifestError::TargetMismatch { expected, found } => write!(
                f,
                "target mismatch: expected {}, found {}",
                expected.triple(),
                found.triple()
            ),
            ManifestError::DigestDrift {
                field,
                expected,
                found,
            } => write!(
                f,
                "digest drift in {field}: locked {expected:?} but manifest declared {found:?}"
            ),
            ManifestError::IdentityMismatch { detail } => {
                write!(f, "identity invariant violated: {detail}")
            }
            ManifestError::MissingTargetPin { field, target } => {
                write!(
                    f,
                    "component lock has no {field} pin for target {}",
                    target.triple()
                )
            }
        }
    }
}

impl std::error::Error for ManifestError {}

/// A `Result` specialized to [`ManifestError`].
pub type Result<T> = std::result::Result<T, ManifestError>;

// ---------------------------------------------------------------------------
// Component lock (`packaging/a2a-component.lock.json`)
// ---------------------------------------------------------------------------

/// The dashboard-owned component lock: the authoritative pin of the A2A source
/// commit, release identity, and every base-closure artifact digest.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ComponentLock {
    pub lock_version: String,
    #[serde(default)]
    pub description: String,
    pub a2a_source: A2aSource,
    pub capsule_contract: CapsuleContract,
    pub base_closure: BaseClosure,
    pub resolution_policy: ResolutionPolicy,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct A2aSource {
    pub repository: String,
    pub commit: String,
    pub release_identity: ReleaseIdentity,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
pub struct ReleaseIdentity {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CapsuleContract {
    pub manifest_schema: String,
    pub digest_algorithm: String,
    pub targets: Vec<Target>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct BaseClosure {
    pub acp: AcpArtifact,
    pub python: PerTargetArtifact,
    pub node: PerTargetArtifact,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct AcpArtifact {
    pub kind: String,
    pub version: String,
    pub license: String,
    pub source: String,
    pub sha256: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PerTargetArtifact {
    pub kind: String,
    pub version: String,
    #[serde(default)]
    pub build: Option<String>,
    #[serde(default)]
    pub source: Option<String>,
    pub license: String,
    pub per_target_sha256: BTreeMap<Target, String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ResolutionPolicy {
    pub floating_forbidden: bool,
    pub latest_forbidden: bool,
    pub runtime_resolution_forbidden: bool,
    pub digest_required: bool,
}

impl ComponentLock {
    /// Parse and self-verify a component lock document. Rejects a floating source
    /// commit, a floating runtime version, any malformed digest, and a
    /// per-target digest table missing one of the contract's declared targets.
    pub fn parse(raw: &str) -> Result<Self> {
        let lock: ComponentLock =
            serde_json::from_str(raw).map_err(|e| ManifestError::Parse(e.to_string()))?;
        lock.verify_self()?;
        Ok(lock)
    }

    fn verify_self(&self) -> Result<()> {
        require_commit("a2a_source.commit", &self.a2a_source.commit)?;
        require_exact_version(
            "a2a_source.release_identity.version",
            &self.a2a_source.release_identity.version,
        )?;
        require_exact_version("base_closure.acp.version", &self.base_closure.acp.version)?;
        require_digest("base_closure.acp.sha256", &self.base_closure.acp.sha256)?;
        for (label, artifact) in [
            ("python", &self.base_closure.python),
            ("node", &self.base_closure.node),
        ] {
            require_exact_version(&format!("base_closure.{label}.version"), &artifact.version)?;
            for target in &self.capsule_contract.targets {
                let digest = artifact.per_target_sha256.get(target).ok_or_else(|| {
                    ManifestError::MissingTargetPin {
                        field: format!("base_closure.{label}.per_target_sha256"),
                        target: *target,
                    }
                })?;
                require_digest(
                    &format!("base_closure.{label}.per_target_sha256.{}", target.triple()),
                    digest,
                )?;
            }
        }
        Ok(())
    }

    /// The per-target CPython digest pinned by this lock.
    pub fn python_digest(&self, target: Target) -> Result<&str> {
        self.base_closure
            .python
            .per_target_sha256
            .get(&target)
            .map(String::as_str)
            .ok_or(ManifestError::MissingTargetPin {
                field: "base_closure.python.per_target_sha256".to_string(),
                target,
            })
    }

    /// The per-target Node.js digest pinned by this lock.
    pub fn node_digest(&self, target: Target) -> Result<&str> {
        self.base_closure
            .node
            .per_target_sha256
            .get(&target)
            .map(String::as_str)
            .ok_or(ManifestError::MissingTargetPin {
                field: "base_closure.node.per_target_sha256".to_string(),
                target,
            })
    }
}

// ---------------------------------------------------------------------------
// Capsule manifest (A2A-emitted `schemas/desktop-capsule-manifest.json`)
// ---------------------------------------------------------------------------

/// The A2A-emitted desktop capsule manifest — the whole boundary the dashboard
/// reads about one A2A generation. Deserialized structurally; the dashboard does
/// not interpret the capsule's Python module layout.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CapsuleManifest {
    pub contract_version: String,
    pub identity: ComponentIdentity,
    pub target: Target,
    pub compatibility: ComponentCompatibility,
    pub entrypoints: ComponentEntrypoints,
    pub digest_algorithm: String,
    pub assets: Vec<ComponentAsset>,
    pub dependency_lock: DependencyLockIdentity,
}

/// The dashboard-owned gateway launch and the caller-owned standalone MCP launch
/// declared by the capsule. The dashboard lifecycle owns only the gateway; the
/// standalone MCP is inspectable but never launched or adopted (ADR D4).
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ComponentEntrypoints {
    pub gateway: LaunchEntrypoint,
    pub standalone_mcp: LaunchEntrypoint,
}

/// One capsule launch surface: a console-script name, an entry-point object
/// reference, and the bounded argv path segments relative to the capsule root.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct LaunchEntrypoint {
    /// The launch-surface discriminator (`gateway` or `standalone-mcp`).
    pub kind: String,
    pub console_script: String,
    pub reference: String,
    /// Portable, non-rooted capsule path segments forming the launch command.
    pub relative_command: Vec<String>,
}

impl LaunchEntrypoint {
    /// Resolve the launch program path under a capsule root, validating every
    /// segment so a malformed or malicious manifest cannot escape the capsule.
    /// Rejects an empty command, `.`/`..` components, and any segment carrying a
    /// path separator — this is the one place a manifest-supplied path reaches
    /// the filesystem, and it never trusts it blindly.
    pub fn resolve_program(&self, capsule_root: &std::path::Path) -> Result<std::path::PathBuf> {
        if self.relative_command.is_empty() {
            return Err(ManifestError::IdentityMismatch {
                detail: format!("{} entrypoint has an empty relative_command", self.kind),
            });
        }
        let mut path = capsule_root.to_path_buf();
        for segment in &self.relative_command {
            let ok = !segment.is_empty()
                && segment != "."
                && segment != ".."
                && !segment.contains('/')
                && !segment.contains('\\');
            if !ok {
                return Err(ManifestError::IdentityMismatch {
                    detail: format!(
                        "{} entrypoint segment {segment:?} is not a portable capsule path segment",
                        self.kind
                    ),
                });
            }
            path.push(segment);
        }
        Ok(path)
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ComponentIdentity {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ComponentCompatibility {
    pub api_versions: RangeBounds,
    pub migration_range: MigrationRange,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
pub struct RangeBounds {
    pub minimum: String,
    pub maximum: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct MigrationRange {
    pub base: String,
    pub head: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ComponentAsset {
    pub kind: String,
    pub version: String,
    pub license: String,
    pub digest: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct DependencyLockIdentity {
    pub uv_lock_digest: String,
    pub package_lock_digest: String,
}

/// The capsule asset kinds, matching the producer's `ComponentAssetKind` enum.
const KIND_PYTHON: &str = "python-runtime";
const KIND_A2A: &str = "a2a-distribution";
const KIND_NODE: &str = "node-runtime";
const KIND_ACP: &str = "acp-adapter";

impl CapsuleManifest {
    /// Parse and structurally self-verify a capsule manifest. Rejects malformed
    /// digests and the producer's cross-field identity invariant (the manifest
    /// identity version must equal its bundled A2A distribution asset version).
    pub fn parse(raw: &str) -> Result<Self> {
        let manifest: CapsuleManifest =
            serde_json::from_str(raw).map_err(|e| ManifestError::Parse(e.to_string()))?;
        manifest.verify_self()?;
        Ok(manifest)
    }

    /// Parse AND verify against the component lock in one call. A lifecycle
    /// consumer must never hold a capsule that parsed but was not joined to the
    /// lock's pins; this helper closes that gap so `parse` can't be used
    /// standalone by accident (P01 review deferred-hardening item).
    pub fn parse_and_verify(raw: &str, lock: &ComponentLock, expected: Target) -> Result<Self> {
        let manifest = Self::parse(raw)?;
        manifest.verify_against_lock(lock, expected)?;
        Ok(manifest)
    }

    fn asset(&self, kind: &str) -> Result<&ComponentAsset> {
        self.assets
            .iter()
            .find(|a| a.kind == kind)
            .ok_or_else(|| ManifestError::IdentityMismatch {
                detail: format!("capsule manifest is missing a {kind} asset"),
            })
    }

    fn verify_self(&self) -> Result<()> {
        for asset in &self.assets {
            require_digest(&format!("assets[{}].digest", asset.kind), &asset.digest)?;
        }
        // Producer invariant: identity.version == a2a-distribution asset version.
        let a2a = self.asset(KIND_A2A)?;
        if a2a.version != self.identity.version {
            return Err(ManifestError::IdentityMismatch {
                detail: format!(
                    "identity.version {:?} != a2a-distribution asset version {:?}",
                    self.identity.version, a2a.version
                ),
            });
        }
        Ok(())
    }

    /// Verify this capsule manifest against the dashboard's component lock for a
    /// declared target. This is the producer-consumer join: the capsule the A2A
    /// repository emitted must carry exactly the target, runtime versions, and
    /// digests the dashboard pinned. Any drift is a hard rejection.
    pub fn verify_against_lock(&self, lock: &ComponentLock, expected: Target) -> Result<()> {
        if self.target != expected {
            return Err(ManifestError::TargetMismatch {
                expected,
                found: self.target,
            });
        }
        // A2A distribution version is the lock's pinned release identity version.
        if self.identity.version != lock.a2a_source.release_identity.version {
            return Err(ManifestError::DigestDrift {
                field: "identity.version".to_string(),
                expected: lock.a2a_source.release_identity.version.clone(),
                found: self.identity.version.clone(),
            });
        }
        // ACP adapter: exact version and digest match the lock.
        let acp = self.asset(KIND_ACP)?;
        expect_eq(
            "assets[acp-adapter].version",
            &lock.base_closure.acp.version,
            &acp.version,
        )?;
        expect_eq(
            "assets[acp-adapter].digest",
            &lock.base_closure.acp.sha256,
            &acp.digest,
        )?;
        // CPython and Node: per-target digest must match the lock's pin.
        let python = self.asset(KIND_PYTHON)?;
        expect_eq(
            "assets[python-runtime].digest",
            lock.python_digest(expected)?,
            &python.digest,
        )?;
        let node = self.asset(KIND_NODE)?;
        expect_eq(
            "assets[node-runtime].digest",
            lock.node_digest(expected)?,
            &node.digest,
        )?;
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Release-set manifest (dashboard-owned, one per target)
// ---------------------------------------------------------------------------

/// The dashboard-owned complete release-set manifest for one target. Binds the
/// dashboard build to the pinned A2A component, the base-closure runtimes, the
/// protocol/state-schema ranges, the license set, and the SBOM.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ReleaseSetManifest {
    pub schema_version: String,
    pub target: Target,
    pub digest_algorithm: String,
    pub dashboard: DashboardBuild,
    pub a2a_component: A2aComponentPin,
    pub runtimes: Runtimes,
    pub protocol: Protocol,
    pub state_schema: StateSchema,
    pub licenses: Vec<LicenseEntry>,
    pub sbom: Sbom,
    #[serde(default)]
    pub file_digests: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct DashboardBuild {
    pub version: String,
    pub commit: String,
    pub digest: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct A2aComponentPin {
    pub commit: String,
    pub release_identity: ReleaseIdentity,
    pub component_lock: String,
    pub capsule_manifest: String,
    pub capsule_digest: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Runtimes {
    pub cpython: PinnedRuntime,
    pub node: PinnedRuntime,
    pub acp: PinnedRuntime,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PinnedRuntime {
    pub version: String,
    pub license: String,
    pub digest: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Protocol {
    pub gateway_api_version_range: RangeBounds,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct StateSchema {
    pub migration_range: RangeBounds,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct LicenseEntry {
    pub component: String,
    pub spdx: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Sbom {
    pub format: String,
    pub path: String,
    pub digest: String,
}

impl ReleaseSetManifest {
    /// Parse and self-verify a release-set manifest. Rejects a floating dashboard
    /// or A2A commit, floating runtime versions, malformed digests, and floating
    /// `latest` selectors anywhere in the pinned inputs.
    pub fn parse(raw: &str) -> Result<Self> {
        let manifest: ReleaseSetManifest =
            serde_json::from_str(raw).map_err(|e| ManifestError::Parse(e.to_string()))?;
        manifest.verify_self()?;
        Ok(manifest)
    }

    /// Parse AND verify against the component lock in one call, so a consumer
    /// cannot hold a release set that parsed but was never joined to the lock's
    /// pins (P01 review deferred-hardening item).
    pub fn parse_and_verify(raw: &str, lock: &ComponentLock) -> Result<Self> {
        let manifest = Self::parse(raw)?;
        manifest.verify_against_lock(lock)?;
        Ok(manifest)
    }

    fn verify_self(&self) -> Result<()> {
        require_commit("dashboard.commit", &self.dashboard.commit)?;
        require_exact_version("dashboard.version", &self.dashboard.version)?;
        require_digest("dashboard.digest", &self.dashboard.digest)?;
        require_commit("a2a_component.commit", &self.a2a_component.commit)?;
        require_exact_version(
            "a2a_component.release_identity.version",
            &self.a2a_component.release_identity.version,
        )?;
        require_digest(
            "a2a_component.capsule_digest",
            &self.a2a_component.capsule_digest,
        )?;
        for (label, rt) in [
            ("cpython", &self.runtimes.cpython),
            ("node", &self.runtimes.node),
            ("acp", &self.runtimes.acp),
        ] {
            require_exact_version(&format!("runtimes.{label}.version"), &rt.version)?;
            require_digest(&format!("runtimes.{label}.digest"), &rt.digest)?;
        }
        require_digest("sbom.digest", &self.sbom.digest)?;
        for (path, digest) in &self.file_digests {
            require_digest(&format!("file_digests[{path}]"), digest)?;
        }
        Ok(())
    }

    /// Verify this release set against the component lock: the A2A commit,
    /// release identity, and every runtime digest must equal the lock's pins for
    /// this target. This is the "release-set skew" rejection.
    pub fn verify_against_lock(&self, lock: &ComponentLock) -> Result<()> {
        expect_eq(
            "a2a_component.commit",
            &lock.a2a_source.commit,
            &self.a2a_component.commit,
        )?;
        if self.a2a_component.release_identity != lock.a2a_source.release_identity {
            return Err(ManifestError::IdentityMismatch {
                detail: format!(
                    "release-set A2A identity {:?} != locked identity {:?}",
                    self.a2a_component.release_identity, lock.a2a_source.release_identity
                ),
            });
        }
        expect_eq(
            "runtimes.acp.version",
            &lock.base_closure.acp.version,
            &self.runtimes.acp.version,
        )?;
        expect_eq(
            "runtimes.acp.digest",
            &lock.base_closure.acp.sha256,
            &self.runtimes.acp.digest,
        )?;
        expect_eq(
            "runtimes.cpython.digest",
            lock.python_digest(self.target)?,
            &self.runtimes.cpython.digest,
        )?;
        expect_eq(
            "runtimes.node.digest",
            lock.node_digest(self.target)?,
            &self.runtimes.node.digest,
        )?;
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Field validators
// ---------------------------------------------------------------------------

/// Reject a floating or non-exact version selector. An exact version is
/// `MAJOR.MINOR[.PATCH]` of digits only — no range operator (`^ ~ > < = ,`), no
/// wildcard (`*` / `x`), and never the literal `latest`.
fn require_exact_version(field: &str, value: &str) -> Result<()> {
    let lowered = value.to_ascii_lowercase();
    if lowered == "latest" || lowered.contains('*') || lowered.split('.').any(|p| p == "x") {
        return Err(ManifestError::FloatingSelector {
            field: field.to_string(),
            value: value.to_string(),
        });
    }
    if value
        .chars()
        .any(|c| matches!(c, '^' | '~' | '>' | '<' | '=' | ',' | ' '))
    {
        return Err(ManifestError::FloatingSelector {
            field: field.to_string(),
            value: value.to_string(),
        });
    }
    let mut parts = value.split('.');
    let ok = matches!((parts.next(), parts.next()), (Some(a), Some(b)) if is_numeric(a) && is_numeric(b))
        && parts.clone().all(is_numeric);
    if !ok {
        return Err(ManifestError::FloatingSelector {
            field: field.to_string(),
            value: value.to_string(),
        });
    }
    Ok(())
}

fn is_numeric(s: &str) -> bool {
    !s.is_empty() && s.bytes().all(|b| b.is_ascii_digit())
}

/// Reject a commit that is not a full 40-hex git sha (a branch, tag, short sha,
/// or floating ref cannot pin a build).
fn require_commit(field: &str, value: &str) -> Result<()> {
    if value.len() == 40
        && value
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
    {
        Ok(())
    } else {
        Err(ManifestError::UnpinnedCommit {
            field: field.to_string(),
            value: value.to_string(),
        })
    }
}

/// Reject a digest that is not a lowercase 64-hex SHA-256 string.
fn require_digest(field: &str, value: &str) -> Result<()> {
    if value.len() == 64
        && value
            .bytes()
            .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase())
    {
        Ok(())
    } else {
        Err(ManifestError::MalformedDigest {
            field: field.to_string(),
            value: value.to_string(),
        })
    }
}

/// Reject a value that drifts from the locked pin.
fn expect_eq(field: &str, expected: &str, found: &str) -> Result<()> {
    if expected == found {
        Ok(())
    } else {
        Err(ManifestError::DigestDrift {
            field: field.to_string(),
            expected: expected.to_string(),
            found: found.to_string(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const LOCK: &str = include_str!("../../../../packaging/a2a-component.lock.json");

    #[test]
    fn real_component_lock_parses_and_self_verifies() {
        let lock = ComponentLock::parse(LOCK).expect("committed lock verifies");
        assert_eq!(lock.a2a_source.commit.len(), 40);
        assert!(lock.python_digest(Target::X86_64PcWindowsMsvc).is_ok());
    }

    #[test]
    fn floating_version_is_rejected() {
        assert!(require_exact_version("v", "1.2.3").is_ok());
        assert!(require_exact_version("v", "0.59.0").is_ok());
        for bad in ["latest", "^1.2", "~1.2", "1.*", "1.x", ">=1.0", "1"] {
            assert!(
                matches!(
                    require_exact_version("v", bad),
                    Err(ManifestError::FloatingSelector { .. })
                ),
                "{bad:?} must be rejected as floating"
            );
        }
    }

    #[test]
    fn unpinned_commit_and_bad_digest_rejected() {
        assert!(matches!(
            require_commit("c", "main"),
            Err(ManifestError::UnpinnedCommit { .. })
        ));
        assert!(matches!(
            require_digest("d", "NOTHEX"),
            Err(ManifestError::MalformedDigest { .. })
        ));
    }
}
