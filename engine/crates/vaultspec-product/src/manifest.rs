//! Fail-closed verification of the product release-set boundary.
//!
//! Parsing is deliberately not activation authority. A caller receives a
//! [`VerifiedReleaseSet`] only after the independently trusted member digest,
//! component lock, external five-member cohort, A2A capsule contract, complete
//! installed-file inventory, and bytes beneath one retained unpublished
//! generation have all joined. The verified value keeps that exact generation
//! borrowed and rechecks its final filesystem snapshot before activation.
//!
//! The bounded no-follow double scan is the accepted cooperative installer
//! boundary from S06. On Windows the retained lease prevents generation-root
//! substitution; on Unix the retained descriptor and named identity checks
//! detect persistent substitution while the installation guard serializes
//! cooperating product writers. Child reads remain pathname-sensitive and do
//! not claim immunity from a hostile same-account process that ignores the
//! product lock.

use std::collections::{BTreeMap, BTreeSet};
use std::fs::{File, Metadata};
use std::io::Read;
use std::path::{Path, PathBuf};

#[cfg(unix)]
use std::fs::OpenOptions;

use serde::de::{MapAccess, Visitor};
use serde::{Deserialize, Deserializer, Serialize};
use sha2::{Digest, Sha256};

use crate::generation::{GenerationError, UnpublishedGeneration};
use crate::receipt::{Channel, PriorSeatIdentity};

const RELEASE_SCHEMA_VERSION: &str = "2.0";
const CAPSULE_CONTRACT_VERSION: &str = "2.0";
const COHORT_SCHEMA_VERSION: &str = "1.0";
const DIGEST_ALGORITHM: &str = "sha256";
const COMPONENT_LOCK_VERSION: &str = "1.0";
const COMPONENT_LOCK_PATH: &str = "packaging/a2a-component.lock.json";
const COMPONENT_MANIFEST_SCHEMA: &str = "schemas/desktop-capsule-manifest.json";
const MAX_MEMBER_MANIFEST_BYTES: usize = 512 * 1024 * 1024;
const MAX_COMPONENT_LOCK_BYTES: usize = 1024 * 1024;
const MAX_CAPSULE_MANIFEST_BYTES: u64 = 4 * 1024 * 1024;
const MAX_COHORT_BYTES: usize = 64 * 1024;
const MAX_TREE_EVIDENCE_BYTES: u64 = 128 * 1024 * 1024;
const MAX_INSTALLED_FILES: usize = 100_000;
const MAX_TREE_FILES: usize = 80_000;
const MAX_DIRECTORIES: usize = 100_000;
const MAX_EXPANDED_BYTES: u64 = 8 * 1024 * 1024 * 1024;
const READ_CHUNK: usize = 1024 * 1024;

/// The five product release targets.
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
    /// Canonical wire triple.
    #[must_use]
    pub const fn triple(self) -> &'static str {
        match self {
            Self::Aarch64AppleDarwin => "aarch64-apple-darwin",
            Self::X86_64AppleDarwin => "x86_64-apple-darwin",
            Self::Aarch64UnknownLinuxGnu => "aarch64-unknown-linux-gnu",
            Self::X86_64UnknownLinuxGnu => "x86_64-unknown-linux-gnu",
            Self::X86_64PcWindowsMsvc => "x86_64-pc-windows-msvc",
        }
    }
}

const TARGETS: [Target; 5] = [
    Target::Aarch64AppleDarwin,
    Target::X86_64AppleDarwin,
    Target::Aarch64UnknownLinuxGnu,
    Target::X86_64UnknownLinuxGnu,
    Target::X86_64PcWindowsMsvc,
];

/// A concrete release verification failure.
#[derive(Debug)]
pub enum ManifestError {
    Parse(String),
    InputTooLarge {
        field: String,
        limit: u64,
        found: u64,
    },
    InvalidField {
        field: String,
        detail: String,
    },
    FloatingSelector {
        field: String,
        value: String,
    },
    UnpinnedCommit {
        field: String,
        value: String,
    },
    MalformedDigest {
        field: String,
        value: String,
    },
    TargetMismatch {
        expected: Target,
        found: Target,
    },
    DigestDrift {
        field: String,
        expected: String,
        found: String,
    },
    IdentityMismatch {
        detail: String,
    },
    MissingTargetPin {
        field: String,
        target: Target,
    },
    Io {
        path: PathBuf,
        detail: String,
    },
    UnsafeFileType {
        path: PathBuf,
        detail: String,
    },
    MissingFile(String),
    ExtraFile(String),
    GenerationChanged {
        detail: String,
    },
    SizeMismatch {
        path: String,
        expected: u64,
        found: u64,
    },
    GenerationAuthority(GenerationError),
}

impl std::fmt::Display for ManifestError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Parse(message) => write!(f, "manifest parse failed: {message}"),
            Self::InputTooLarge {
                field,
                limit,
                found,
            } => {
                write!(f, "{field} is {found} bytes, above the {limit}-byte bound")
            }
            Self::InvalidField { field, detail } => write!(f, "invalid {field}: {detail}"),
            Self::FloatingSelector { field, value } => {
                write!(f, "floating selector in {field}: {value:?}")
            }
            Self::UnpinnedCommit { field, value } => {
                write!(f, "unpinned commit in {field}: {value:?}")
            }
            Self::MalformedDigest { field, value } => {
                write!(f, "malformed sha256 in {field}: {value:?}")
            }
            Self::TargetMismatch { expected, found } => write!(
                f,
                "target mismatch: expected {}, found {}",
                expected.triple(),
                found.triple()
            ),
            Self::DigestDrift {
                field,
                expected,
                found,
            } => {
                write!(
                    f,
                    "digest drift in {field}: expected {expected:?}, found {found:?}"
                )
            }
            Self::IdentityMismatch { detail } => write!(f, "identity mismatch: {detail}"),
            Self::MissingTargetPin { field, target } => {
                write!(f, "{field} has no pin for {}", target.triple())
            }
            Self::Io { path, detail } => write!(f, "I/O at {}: {detail}", path.display()),
            Self::UnsafeFileType { path, detail } => {
                write!(f, "unsafe file type at {}: {detail}", path.display())
            }
            Self::MissingFile(path) => write!(f, "installed payload is missing {path}"),
            Self::ExtraFile(path) => write!(f, "installed payload has undeclared file {path}"),
            Self::GenerationChanged { detail } => {
                write!(
                    f,
                    "unpublished generation changed during verification: {detail}"
                )
            }
            Self::SizeMismatch {
                path,
                expected,
                found,
            } => {
                write!(
                    f,
                    "size mismatch for {path}: expected {expected}, found {found}"
                )
            }
            Self::GenerationAuthority(error) => {
                write!(f, "unpublished generation authority rejected: {error}")
            }
        }
    }
}

impl std::error::Error for ManifestError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::GenerationAuthority(error) => Some(error),
            _ => None,
        }
    }
}

impl From<GenerationError> for ManifestError {
    fn from(error: GenerationError) -> Self {
        Self::GenerationAuthority(error)
    }
}

/// Result type for manifest verification.
pub type Result<T> = std::result::Result<T, ManifestError>;

fn io_error(path: &Path, error: std::io::Error) -> ManifestError {
    ManifestError::Io {
        path: path.to_path_buf(),
        detail: error.to_string(),
    }
}

// ---------------------------------------------------------------------------
// Independently trusted component lock
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ComponentLock {
    pub lock_version: String,
    pub description: String,
    pub a2a_source: A2aSource,
    pub capsule_contract: CapsuleContract,
    pub base_closure: BaseClosure,
    pub resolution_policy: ResolutionPolicy,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct A2aSource {
    pub repository: String,
    pub commit: String,
    pub release_identity: ReleaseIdentity,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ReleaseIdentity {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CapsuleContract {
    pub manifest_schema: String,
    pub digest_algorithm: String,
    pub targets: Vec<Target>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct BaseClosure {
    pub acp: AcpArtifact,
    pub python: PerTargetArtifact,
    pub node: PerTargetArtifact,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct AcpArtifact {
    pub kind: String,
    pub version: String,
    pub license: String,
    pub source: String,
    pub sha256: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PerTargetArtifact {
    pub kind: String,
    pub version: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub build: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    pub license: String,
    #[serde(deserialize_with = "deserialize_target_map")]
    pub per_target_sha256: BTreeMap<Target, String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ResolutionPolicy {
    pub floating_forbidden: bool,
    pub latest_forbidden: bool,
    pub runtime_resolution_forbidden: bool,
    pub digest_required: bool,
}

fn deserialize_target_map<'de, D>(
    deserializer: D,
) -> std::result::Result<BTreeMap<Target, String>, D::Error>
where
    D: Deserializer<'de>,
{
    struct UniqueTargetMap;
    impl<'de> Visitor<'de> for UniqueTargetMap {
        type Value = BTreeMap<Target, String>;

        fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            formatter.write_str("a unique per-target digest map")
        }

        fn visit_map<A>(self, mut map: A) -> std::result::Result<Self::Value, A::Error>
        where
            A: MapAccess<'de>,
        {
            let mut values = BTreeMap::new();
            while let Some((target, digest)) = map.next_entry::<Target, String>()? {
                if values.insert(target, digest).is_some() {
                    return Err(serde::de::Error::custom("duplicate target digest key"));
                }
                if values.len() > TARGETS.len() {
                    return Err(serde::de::Error::custom("too many target digest keys"));
                }
            }
            Ok(values)
        }
    }
    deserializer.deserialize_map(UniqueTargetMap)
}

impl ComponentLock {
    /// Parse a lock for diagnostics and legacy capsule consumers.
    ///
    /// This does not make the bytes trusted. Full release verification also
    /// requires the caller-supplied expected path and raw-byte digest.
    pub fn parse(raw: &str) -> Result<Self> {
        parse_component_lock(raw.as_bytes())
    }

    fn verify_self(&self) -> Result<()> {
        expect_literal("lock_version", COMPONENT_LOCK_VERSION, &self.lock_version)?;
        require_bounded_text("description", &self.description, 1, 16_384)?;
        expect_literal(
            "a2a_source.repository",
            "vaultspec-a2a",
            &self.a2a_source.repository,
        )?;
        require_commit("a2a_source.commit", &self.a2a_source.commit)?;
        require_identity(
            "a2a_source.release_identity.name",
            &self.a2a_source.release_identity.name,
        )?;
        require_exact_version(
            "a2a_source.release_identity.version",
            &self.a2a_source.release_identity.version,
        )?;
        expect_literal(
            "capsule_contract.manifest_schema",
            COMPONENT_MANIFEST_SCHEMA,
            &self.capsule_contract.manifest_schema,
        )?;
        expect_literal(
            "capsule_contract.digest_algorithm",
            DIGEST_ALGORITHM,
            &self.capsule_contract.digest_algorithm,
        )?;
        require_target_roster("capsule_contract.targets", &self.capsule_contract.targets)?;
        expect_literal(
            "base_closure.acp.kind",
            "acp_adapter",
            &self.base_closure.acp.kind,
        )?;
        expect_literal(
            "base_closure.python.kind",
            "cpython_runtime",
            &self.base_closure.python.kind,
        )?;
        expect_literal(
            "base_closure.node.kind",
            "node_runtime",
            &self.base_closure.node.kind,
        )?;
        require_exact_version("base_closure.acp.version", &self.base_closure.acp.version)?;
        require_exact_version(
            "base_closure.python.version",
            &self.base_closure.python.version,
        )?;
        require_exact_version("base_closure.node.version", &self.base_closure.node.version)?;
        require_bounded_text(
            "base_closure.acp.license",
            &self.base_closure.acp.license,
            1,
            128,
        )?;
        require_bounded_text(
            "base_closure.python.license",
            &self.base_closure.python.license,
            1,
            128,
        )?;
        require_bounded_text(
            "base_closure.node.license",
            &self.base_closure.node.license,
            1,
            128,
        )?;
        require_bounded_text(
            "base_closure.acp.source",
            &self.base_closure.acp.source,
            1,
            4096,
        )?;
        if let Some(build) = &self.base_closure.python.build {
            require_bounded_text("base_closure.python.build", build, 1, 1024)?;
        }
        if let Some(source) = &self.base_closure.python.source {
            require_bounded_text("base_closure.python.source", source, 1, 4096)?;
        }
        if let Some(build) = &self.base_closure.node.build {
            require_bounded_text("base_closure.node.build", build, 1, 1024)?;
        }
        if let Some(source) = &self.base_closure.node.source {
            require_bounded_text("base_closure.node.source", source, 1, 4096)?;
        }
        require_digest("base_closure.acp.sha256", &self.base_closure.acp.sha256)?;
        for (name, artifact) in [
            ("python", &self.base_closure.python),
            ("node", &self.base_closure.node),
        ] {
            if artifact.per_target_sha256.len() != TARGETS.len() {
                return invalid(
                    &format!("base_closure.{name}.per_target_sha256"),
                    "must contain exactly the five supported targets",
                );
            }
            for target in TARGETS {
                let digest = artifact.per_target_sha256.get(&target).ok_or_else(|| {
                    ManifestError::MissingTargetPin {
                        field: format!("base_closure.{name}.per_target_sha256"),
                        target,
                    }
                })?;
                require_digest(
                    &format!("base_closure.{name}.per_target_sha256.{}", target.triple()),
                    digest,
                )?;
            }
        }
        if !self.resolution_policy.floating_forbidden
            || !self.resolution_policy.latest_forbidden
            || !self.resolution_policy.runtime_resolution_forbidden
            || !self.resolution_policy.digest_required
        {
            return invalid(
                "resolution_policy",
                "all four fail-closed policy flags must be true",
            );
        }
        Ok(())
    }

    pub fn python_digest(&self, target: Target) -> Result<&str> {
        target_digest(
            "base_closure.python.per_target_sha256",
            &self.base_closure.python,
            target,
        )
    }

    pub fn node_digest(&self, target: Target) -> Result<&str> {
        target_digest(
            "base_closure.node.per_target_sha256",
            &self.base_closure.node,
            target,
        )
    }
}

fn target_digest<'a>(
    field: &str,
    artifact: &'a PerTargetArtifact,
    target: Target,
) -> Result<&'a str> {
    artifact
        .per_target_sha256
        .get(&target)
        .map(String::as_str)
        .ok_or_else(|| ManifestError::MissingTargetPin {
            field: field.to_string(),
            target,
        })
}

fn parse_component_lock(raw: &[u8]) -> Result<ComponentLock> {
    require_input_bound("component lock", raw.len(), MAX_COMPONENT_LOCK_BYTES as u64)?;
    let lock: ComponentLock =
        serde_json::from_slice(raw).map_err(|error| ManifestError::Parse(error.to_string()))?;
    lock.verify_self()?;
    Ok(lock)
}

// ---------------------------------------------------------------------------
// A2A capsule contract (opaque package internals; explicit boundary facts)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
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

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ComponentEntrypoints {
    pub gateway: LaunchEntrypoint,
    pub standalone_mcp: LaunchEntrypoint,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct LaunchEntrypoint {
    pub kind: String,
    pub console_script: String,
    pub reference: String,
    pub relative_command: Vec<String>,
}

impl LaunchEntrypoint {
    pub fn resolve_program(&self, capsule_root: &Path) -> Result<PathBuf> {
        validate_entrypoint(self, &self.kind)?;
        let mut path = capsule_root.to_path_buf();
        for segment in &self.relative_command {
            path.push(segment);
        }
        Ok(path)
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ComponentIdentity {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ComponentCompatibility {
    pub api_versions: RangeBounds,
    pub migration_range: MigrationRange,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RangeBounds {
    pub minimum: String,
    pub maximum: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct MigrationRange {
    pub base: String,
    pub head: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ComponentAsset {
    pub kind: String,
    pub version: String,
    pub license: String,
    pub digest: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct DependencyLockIdentity {
    pub uv_lock_digest: String,
    pub package_lock_digest: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct RawCapsuleManifest {
    contract_version: String,
    identity: ComponentIdentity,
    target: Target,
    compatibility: ComponentCompatibility,
    consistency_group: ConsistencyGroup,
    entrypoints: ComponentEntrypoints,
    digest_algorithm: String,
    assets: Vec<ComponentAsset>,
    dependency_lock: DependencyLockIdentity,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct ConsistencyGroup {
    stores: Vec<MutableStore>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct MutableStore {
    kind: String,
    derivable: bool,
    schema_authority: String,
    schema_version: String,
}

const KIND_PYTHON: &str = "python-runtime";
const KIND_A2A: &str = "a2a-distribution";
const KIND_NODE: &str = "node-runtime";
const KIND_ACP: &str = "acp-adapter";

impl CapsuleManifest {
    /// Parse and structurally validate capsule boundary facts. This is not
    /// release activation authority; use [`VerifiedReleaseSet::verify`].
    pub fn parse(raw: &str) -> Result<Self> {
        parse_capsule(raw.as_bytes()).map(|(manifest, _)| manifest)
    }

    /// Legacy runtime-boundary join used by lifecycle inspection. This proves
    /// only capsule-to-lock compatibility; it is not a complete release-set or
    /// activation verifier. Receipt-selected start integration must consume
    /// [`VerifiedReleaseSet`] (plan W01.P02.S16 / W02.P04.S164).
    pub fn parse_and_verify(raw: &str, lock: &ComponentLock, expected: Target) -> Result<Self> {
        let (manifest, _) = parse_capsule(raw.as_bytes())?;
        manifest.verify_against_lock(lock, expected)?;
        Ok(manifest)
    }

    pub fn verify_against_lock(&self, lock: &ComponentLock, expected: Target) -> Result<()> {
        if self.target != expected {
            return Err(ManifestError::TargetMismatch {
                expected,
                found: self.target,
            });
        }
        if self.identity.name != lock.a2a_source.release_identity.name
            || self.identity.version != lock.a2a_source.release_identity.version
        {
            return Err(ManifestError::IdentityMismatch {
                detail: "capsule release identity differs from the trusted component lock"
                    .to_string(),
            });
        }
        let python = unique_asset(&self.assets, KIND_PYTHON)?;
        let node = unique_asset(&self.assets, KIND_NODE)?;
        let acp = unique_asset(&self.assets, KIND_ACP)?;
        let a2a = unique_asset(&self.assets, KIND_A2A)?;
        let python_family = version_prefix(&lock.base_closure.python.version, 2)?;
        let node_family = version_prefix(&lock.base_closure.node.version, 1)?;
        expect_literal(
            "assets[python-runtime].version",
            &python_family,
            &python.version,
        )?;
        expect_literal("assets[node-runtime].version", &node_family, &node.version)?;
        expect_literal(
            "assets[acp-adapter].version",
            &lock.base_closure.acp.version,
            &acp.version,
        )?;
        expect_literal(
            "assets[a2a-distribution].version",
            &self.identity.version,
            &a2a.version,
        )?;
        expect_literal(
            "assets[python-runtime].license",
            &lock.base_closure.python.license,
            &python.license,
        )?;
        expect_literal(
            "assets[node-runtime].license",
            &lock.base_closure.node.license,
            &node.license,
        )?;
        expect_literal(
            "assets[acp-adapter].license",
            &lock.base_closure.acp.license,
            &acp.license,
        )?;
        expect_digest(
            "assets[python-runtime].digest",
            lock.python_digest(expected)?,
            &python.digest,
        )?;
        expect_digest(
            "assets[node-runtime].digest",
            lock.node_digest(expected)?,
            &node.digest,
        )?;
        expect_digest(
            "assets[acp-adapter].digest",
            &lock.base_closure.acp.sha256,
            &acp.digest,
        )?;
        Ok(())
    }
}

fn parse_capsule(raw: &[u8]) -> Result<(CapsuleManifest, ConsistencyGroup)> {
    require_input_bound("capsule manifest", raw.len(), MAX_CAPSULE_MANIFEST_BYTES)?;
    let raw_manifest: RawCapsuleManifest =
        serde_json::from_slice(raw).map_err(|error| ManifestError::Parse(error.to_string()))?;
    validate_raw_capsule(&raw_manifest)?;
    let consistency_group = raw_manifest.consistency_group.clone();
    let manifest = CapsuleManifest {
        contract_version: raw_manifest.contract_version,
        identity: raw_manifest.identity,
        target: raw_manifest.target,
        compatibility: raw_manifest.compatibility,
        entrypoints: raw_manifest.entrypoints,
        digest_algorithm: raw_manifest.digest_algorithm,
        assets: raw_manifest.assets,
        dependency_lock: raw_manifest.dependency_lock,
    };
    Ok((manifest, consistency_group))
}

fn validate_raw_capsule(manifest: &RawCapsuleManifest) -> Result<()> {
    expect_literal(
        "capsule.contract_version",
        CAPSULE_CONTRACT_VERSION,
        &manifest.contract_version,
    )?;
    expect_literal(
        "capsule.digest_algorithm",
        DIGEST_ALGORITHM,
        &manifest.digest_algorithm,
    )?;
    require_identity("capsule.identity.name", &manifest.identity.name)?;
    require_exact_version("capsule.identity.version", &manifest.identity.version)?;
    require_gateway_range(
        "capsule.compatibility.api_versions",
        &manifest.compatibility.api_versions,
    )?;
    require_migration(
        "capsule.compatibility.migration_range.base",
        &manifest.compatibility.migration_range.base,
    )?;
    require_migration(
        "capsule.compatibility.migration_range.head",
        &manifest.compatibility.migration_range.head,
    )?;
    expect_literal(
        "capsule.compatibility.migration_range.head",
        "0008",
        &manifest.compatibility.migration_range.head,
    )?;
    validate_consistency_group(
        &manifest.consistency_group,
        &manifest.compatibility.migration_range,
    )?;
    validate_entrypoint(&manifest.entrypoints.gateway, "gateway")?;
    validate_entrypoint(&manifest.entrypoints.standalone_mcp, "standalone-mcp")?;
    if manifest.assets.len() != 4 {
        return invalid("capsule.assets", "must contain exactly four asset kinds");
    }
    let mut kinds = BTreeSet::new();
    for asset in &manifest.assets {
        if !matches!(
            asset.kind.as_str(),
            KIND_PYTHON | KIND_A2A | KIND_NODE | KIND_ACP
        ) {
            return invalid("capsule.assets.kind", "unknown asset kind");
        }
        if !kinds.insert(asset.kind.as_str()) {
            return invalid("capsule.assets.kind", "duplicate asset kind");
        }
        let (minimum_parts, maximum_parts) = match asset.kind.as_str() {
            KIND_NODE => (1, 1),
            KIND_PYTHON => (2, 2),
            _ => (2, 3),
        };
        require_numeric_version(
            &format!("capsule.assets[{}].version", asset.kind),
            &asset.version,
            minimum_parts,
            maximum_parts,
        )?;
        require_bounded_text(
            &format!("capsule.assets[{}].license", asset.kind),
            &asset.license,
            1,
            128,
        )?;
        require_digest(
            &format!("capsule.assets[{}].digest", asset.kind),
            &asset.digest,
        )?;
    }
    if unique_asset(&manifest.assets, KIND_A2A)?.version != manifest.identity.version {
        return invalid(
            "capsule.identity.version",
            "must equal the A2A distribution asset version",
        );
    }
    require_digest(
        "capsule.dependency_lock.uv_lock_digest",
        &manifest.dependency_lock.uv_lock_digest,
    )?;
    require_digest(
        "capsule.dependency_lock.package_lock_digest",
        &manifest.dependency_lock.package_lock_digest,
    )?;
    Ok(())
}

fn validate_consistency_group(group: &ConsistencyGroup, migration: &MigrationRange) -> Result<()> {
    if group.stores.len() != 2 {
        return invalid(
            "capsule.consistency_group.stores",
            "must contain exactly two stores",
        );
    }
    let mut kinds = BTreeSet::new();
    for store in &group.stores {
        if !kinds.insert(store.kind.as_str()) || store.derivable {
            return invalid(
                "capsule.consistency_group.stores",
                "stores must be unique and non-derivable",
            );
        }
        match store.kind.as_str() {
            "primary-database" => {
                expect_literal(
                    "capsule.consistency_group.primary.schema_authority",
                    "alembic-migration-range",
                    &store.schema_authority,
                )?;
                expect_literal(
                    "capsule.consistency_group.primary.schema_version",
                    "0008",
                    &store.schema_version,
                )?;
                expect_literal(
                    "capsule primary schema/migration join",
                    &migration.head,
                    &store.schema_version,
                )?;
            }
            "checkpoint-database" => {
                expect_literal(
                    "capsule.consistency_group.checkpoint.schema_authority",
                    "checkpointer-schema",
                    &store.schema_authority,
                )?;
                expect_literal(
                    "capsule.consistency_group.checkpoint.schema_version",
                    "1.0.0",
                    &store.schema_version,
                )?;
            }
            _ => {
                return invalid(
                    "capsule.consistency_group.stores.kind",
                    "unknown store kind",
                );
            }
        }
    }
    Ok(())
}

fn validate_entrypoint(entry: &LaunchEntrypoint, expected_kind: &str) -> Result<()> {
    expect_literal("capsule.entrypoint.kind", expected_kind, &entry.kind)?;
    require_bounded_text(
        "capsule.entrypoint.console_script",
        &entry.console_script,
        1,
        128,
    )?;
    require_bounded_text("capsule.entrypoint.reference", &entry.reference, 1, 256)?;
    if entry.relative_command.is_empty() || entry.relative_command.len() > 16 {
        return invalid(
            "capsule.entrypoint.relative_command",
            "must contain 1..=16 segments",
        );
    }
    for segment in &entry.relative_command {
        validate_portable_segment("capsule.entrypoint.relative_command", segment, false)?;
    }
    Ok(())
}

fn unique_asset<'a>(assets: &'a [ComponentAsset], kind: &str) -> Result<&'a ComponentAsset> {
    let mut matches = assets.iter().filter(|asset| asset.kind == kind);
    let found = matches
        .next()
        .ok_or_else(|| ManifestError::IdentityMismatch {
            detail: format!("capsule is missing {kind}"),
        })?;
    if matches.next().is_some() {
        return invalid("capsule.assets", &format!("duplicate {kind}"));
    }
    Ok(found)
}

// ---------------------------------------------------------------------------
// Release member and external cohort
// ---------------------------------------------------------------------------

/// Compatibility namespace for callers that need syntax diagnostics. The
/// returned type is explicitly unverified and cannot authorize activation.
#[derive(Debug, Clone, Copy)]
pub struct ReleaseSetManifest;

/// Parsed member bytes without filesystem, trusted-lock, or cohort authority.
#[derive(Debug, Clone)]
pub struct UnverifiedReleaseSetManifest {
    inner: RawReleaseSetManifest,
}

impl ReleaseSetManifest {
    pub fn parse(raw: &str) -> Result<UnverifiedReleaseSetManifest> {
        parse_release(raw.as_bytes()).map(|inner| UnverifiedReleaseSetManifest { inner })
    }

    pub fn parse_and_verify(
        raw: &str,
        lock: &ComponentLock,
    ) -> Result<UnverifiedReleaseSetManifest> {
        let parsed = Self::parse(raw)?;
        parsed.verify_against_lock(lock)?;
        Ok(parsed)
    }
}

impl UnverifiedReleaseSetManifest {
    /// Legacy pin-skew diagnostic only. This does not check installed bytes,
    /// external cohort authority, or independent lock provenance.
    pub fn verify_against_lock(&self, lock: &ComponentLock) -> Result<()> {
        verify_release_lock_joins(&self.inner, lock)
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct RawReleaseSetManifest {
    schema_version: String,
    target: Target,
    digest_algorithm: String,
    cohort: CohortClaim,
    release_manifest: ReleaseManifestFile,
    dashboard: DashboardBuild,
    updater: UpdaterBuild,
    a2a_component: A2aComponentPin,
    runtimes: Runtimes,
    protocol: Protocol,
    state_schema: StateSchema,
    licenses: Vec<LicenseEntry>,
    sbom: Sbom,
    #[serde(deserialize_with = "deserialize_file_digests")]
    file_digests: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct CohortClaim {
    id: String,
    targets: Vec<Target>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct ReleaseManifestFile {
    path: String,
    binding_mode: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct DashboardBuild {
    version: String,
    commit: String,
    path: String,
    size: u64,
    digest: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct UpdaterBuild {
    version: String,
    path: String,
    size: u64,
    digest: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct A2aComponentPin {
    commit: String,
    release_identity: ReleaseIdentity,
    component_lock: EvidenceFile,
    capsule_manifest: EvidenceFile,
    capsule_archive: ArtifactFile,
    tree_evidence: TreeEvidenceFile,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct EvidenceFile {
    path: String,
    digest: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct ArtifactFile {
    path: String,
    size: u64,
    digest: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct TreeEvidenceFile {
    path: String,
    size: u64,
    digest: String,
    tree_digest: String,
    file_count: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct Runtimes {
    cpython: PinnedRuntime,
    node: PinnedRuntime,
    acp: PinnedRuntime,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct PinnedRuntime {
    version: String,
    license: String,
    digest: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct Protocol {
    gateway_api_version_range: RangeBounds,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct StateSchema {
    migration_range: RangeBounds,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct LicenseEntry {
    component: String,
    spdx: String,
    path: String,
    digest: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct Sbom {
    format: String,
    path: String,
    size: u64,
    digest: String,
}

fn deserialize_file_digests<'de, D>(
    deserializer: D,
) -> std::result::Result<BTreeMap<String, String>, D::Error>
where
    D: Deserializer<'de>,
{
    struct UniqueFileMap;
    impl<'de> Visitor<'de> for UniqueFileMap {
        type Value = BTreeMap<String, String>;

        fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            formatter.write_str("a unique bounded installed-file digest map")
        }

        fn visit_map<A>(self, mut map: A) -> std::result::Result<Self::Value, A::Error>
        where
            A: MapAccess<'de>,
        {
            let mut values = BTreeMap::new();
            while let Some((path, digest)) = map.next_entry::<String, String>()? {
                if values.insert(path, digest).is_some() {
                    return Err(serde::de::Error::custom("duplicate installed-file path"));
                }
                if values.len() > MAX_INSTALLED_FILES {
                    return Err(serde::de::Error::custom(
                        "installed-file inventory is too large",
                    ));
                }
            }
            Ok(values)
        }
    }
    deserializer.deserialize_map(UniqueFileMap)
}

fn parse_release(raw: &[u8]) -> Result<RawReleaseSetManifest> {
    require_input_bound(
        "release member manifest",
        raw.len(),
        MAX_MEMBER_MANIFEST_BYTES as u64,
    )?;
    let manifest: RawReleaseSetManifest =
        serde_json::from_slice(raw).map_err(|error| ManifestError::Parse(error.to_string()))?;
    validate_release(&manifest)?;
    Ok(manifest)
}

fn validate_release(manifest: &RawReleaseSetManifest) -> Result<()> {
    expect_literal(
        "schema_version",
        RELEASE_SCHEMA_VERSION,
        &manifest.schema_version,
    )?;
    expect_literal(
        "digest_algorithm",
        DIGEST_ALGORITHM,
        &manifest.digest_algorithm,
    )?;
    require_identity("cohort.id", &manifest.cohort.id)?;
    require_target_roster("cohort.targets", &manifest.cohort.targets)?;
    validate_portable_path("release_manifest.path", &manifest.release_manifest.path)?;
    expect_literal(
        "release_manifest.binding_mode",
        "external-cohort-and-receipt",
        &manifest.release_manifest.binding_mode,
    )?;
    require_exact_version("dashboard.version", &manifest.dashboard.version)?;
    require_commit("dashboard.commit", &manifest.dashboard.commit)?;
    validate_artifact(
        "dashboard",
        &manifest.dashboard.path,
        manifest.dashboard.size,
        &manifest.dashboard.digest,
    )?;
    require_exact_version("updater.version", &manifest.updater.version)?;
    validate_artifact(
        "updater",
        &manifest.updater.path,
        manifest.updater.size,
        &manifest.updater.digest,
    )?;
    require_commit("a2a_component.commit", &manifest.a2a_component.commit)?;
    require_identity(
        "a2a_component.release_identity.name",
        &manifest.a2a_component.release_identity.name,
    )?;
    require_exact_version(
        "a2a_component.release_identity.version",
        &manifest.a2a_component.release_identity.version,
    )?;
    validate_evidence(
        "a2a_component.component_lock",
        &manifest.a2a_component.component_lock,
    )?;
    expect_literal(
        "a2a_component.component_lock.path",
        COMPONENT_LOCK_PATH,
        &manifest.a2a_component.component_lock.path,
    )?;
    validate_evidence(
        "a2a_component.capsule_manifest",
        &manifest.a2a_component.capsule_manifest,
    )?;
    validate_artifact_file(
        "a2a_component.capsule_archive",
        &manifest.a2a_component.capsule_archive,
    )?;
    validate_artifact(
        "a2a_component.tree_evidence",
        &manifest.a2a_component.tree_evidence.path,
        manifest.a2a_component.tree_evidence.size,
        &manifest.a2a_component.tree_evidence.digest,
    )?;
    require_digest(
        "a2a_component.tree_evidence.tree_digest",
        &manifest.a2a_component.tree_evidence.tree_digest,
    )?;
    if manifest.a2a_component.tree_evidence.file_count == 0
        || manifest.a2a_component.tree_evidence.file_count > MAX_TREE_FILES
    {
        return invalid(
            "a2a_component.tree_evidence.file_count",
            "must be 1..=80000",
        );
    }
    for (name, runtime) in [
        ("cpython", &manifest.runtimes.cpython),
        ("node", &manifest.runtimes.node),
        ("acp", &manifest.runtimes.acp),
    ] {
        require_exact_version(&format!("runtimes.{name}.version"), &runtime.version)?;
        require_bounded_text(
            &format!("runtimes.{name}.license"),
            &runtime.license,
            1,
            128,
        )?;
        require_digest(&format!("runtimes.{name}.digest"), &runtime.digest)?;
    }
    require_gateway_range(
        "protocol.gateway_api_version_range",
        &manifest.protocol.gateway_api_version_range,
    )?;
    require_migration(
        "state_schema.migration_range.minimum",
        &manifest.state_schema.migration_range.minimum,
    )?;
    require_migration(
        "state_schema.migration_range.maximum",
        &manifest.state_schema.migration_range.maximum,
    )?;
    expect_literal(
        "state_schema.migration_range.maximum",
        "0008",
        &manifest.state_schema.migration_range.maximum,
    )?;
    if manifest.licenses.is_empty() || manifest.licenses.len() > 4096 {
        return invalid("licenses", "must contain 1..=4096 entries");
    }
    let mut license_rows = BTreeSet::new();
    let mut license_paths = BTreeSet::new();
    for license in &manifest.licenses {
        require_identity("licenses.component", &license.component)?;
        require_bounded_text("licenses.spdx", &license.spdx, 1, 128)?;
        validate_portable_path("licenses.path", &license.path)?;
        require_digest("licenses.digest", &license.digest)?;
        if !license_rows.insert((
            license.component.as_str(),
            license.spdx.as_str(),
            license.path.as_str(),
            license.digest.as_str(),
        )) || !license_paths.insert(semantic_path_key(&license.path))
        {
            return invalid("licenses", "duplicate license evidence or semantic path");
        }
    }
    if !matches!(manifest.sbom.format.as_str(), "spdx" | "cyclonedx") {
        return invalid("sbom.format", "must be spdx or cyclonedx");
    }
    validate_artifact(
        "sbom",
        &manifest.sbom.path,
        manifest.sbom.size,
        &manifest.sbom.digest,
    )?;
    if manifest.file_digests.is_empty() || manifest.file_digests.len() > MAX_INSTALLED_FILES {
        return invalid("file_digests", "must contain 1..=100000 entries");
    }
    let mut semantic_paths = BTreeSet::new();
    for (path, digest) in &manifest.file_digests {
        validate_portable_path("file_digests path", path)?;
        require_digest(&format!("file_digests[{path}]"), digest)?;
        if path == &manifest.release_manifest.path {
            return invalid(
                "file_digests",
                "release_manifest.path is the sole excluded file",
            );
        }
        if !semantic_paths.insert(semantic_path_key(path)) {
            return invalid(
                "file_digests",
                "case-folded or reserved semantic path collision",
            );
        }
    }
    let mut all_references = Vec::with_capacity(8 + manifest.licenses.len());
    all_references.extend([
        manifest.dashboard.path.as_str(),
        manifest.updater.path.as_str(),
        manifest.a2a_component.component_lock.path.as_str(),
        manifest.a2a_component.capsule_manifest.path.as_str(),
        manifest.a2a_component.capsule_archive.path.as_str(),
        manifest.a2a_component.tree_evidence.path.as_str(),
        manifest.sbom.path.as_str(),
    ]);
    all_references.extend(
        manifest
            .licenses
            .iter()
            .map(|license| license.path.as_str()),
    );
    let mut referenced = BTreeSet::new();
    for path in all_references {
        let key = semantic_path_key(path);
        if !referenced.insert(key) {
            return invalid("artifact paths", "two semantic artifacts share one path");
        }
    }
    Ok(())
}

fn validate_evidence(field: &str, evidence: &EvidenceFile) -> Result<()> {
    validate_portable_path(&format!("{field}.path"), &evidence.path)?;
    require_digest(&format!("{field}.digest"), &evidence.digest)
}

fn validate_artifact_file(field: &str, artifact: &ArtifactFile) -> Result<()> {
    validate_artifact(field, &artifact.path, artifact.size, &artifact.digest)
}

fn validate_artifact(field: &str, path: &str, size: u64, digest: &str) -> Result<()> {
    validate_portable_path(&format!("{field}.path"), path)?;
    if size == 0 || size > MAX_EXPANDED_BYTES {
        return invalid(&format!("{field}.size"), "must be 1..=8589934592");
    }
    require_digest(&format!("{field}.digest"), digest)
}

fn verify_release_lock_joins(manifest: &RawReleaseSetManifest, lock: &ComponentLock) -> Result<()> {
    expect_literal(
        "a2a_component.commit",
        &lock.a2a_source.commit,
        &manifest.a2a_component.commit,
    )?;
    if manifest.a2a_component.release_identity != lock.a2a_source.release_identity {
        return Err(ManifestError::IdentityMismatch {
            detail: "release member A2A identity differs from the component lock".to_string(),
        });
    }
    for (name, runtime, locked) in [
        (
            "cpython",
            &manifest.runtimes.cpython,
            &lock.base_closure.python,
        ),
        ("node", &manifest.runtimes.node, &lock.base_closure.node),
    ] {
        expect_literal(
            &format!("runtimes.{name}.version"),
            &locked.version,
            &runtime.version,
        )?;
        expect_literal(
            &format!("runtimes.{name}.license"),
            &locked.license,
            &runtime.license,
        )?;
        let expected = if name == "cpython" {
            lock.python_digest(manifest.target)?
        } else {
            lock.node_digest(manifest.target)?
        };
        expect_digest(
            &format!("runtimes.{name}.digest"),
            expected,
            &runtime.digest,
        )?;
    }
    expect_literal(
        "runtimes.acp.version",
        &lock.base_closure.acp.version,
        &manifest.runtimes.acp.version,
    )?;
    expect_literal(
        "runtimes.acp.license",
        &lock.base_closure.acp.license,
        &manifest.runtimes.acp.license,
    )?;
    expect_digest(
        "runtimes.acp.digest",
        &lock.base_closure.acp.sha256,
        &manifest.runtimes.acp.digest,
    )
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct CohortDescriptor {
    schema_version: String,
    id: String,
    digest_algorithm: String,
    members: Vec<CohortMember>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct CohortMember {
    target: Target,
    member_manifest_digest: String,
}

fn parse_cohort(raw: &[u8]) -> Result<CohortDescriptor> {
    require_input_bound("cohort descriptor", raw.len(), MAX_COHORT_BYTES as u64)?;
    let descriptor: CohortDescriptor =
        serde_json::from_slice(raw).map_err(|error| ManifestError::Parse(error.to_string()))?;
    expect_literal(
        "cohort.schema_version",
        COHORT_SCHEMA_VERSION,
        &descriptor.schema_version,
    )?;
    require_identity("cohort.id", &descriptor.id)?;
    expect_literal(
        "cohort.digest_algorithm",
        DIGEST_ALGORITHM,
        &descriptor.digest_algorithm,
    )?;
    if descriptor.members.len() != TARGETS.len() {
        return invalid("cohort.members", "must contain exactly five members");
    }
    for (index, (member, target)) in descriptor.members.iter().zip(TARGETS).enumerate() {
        if member.target != target {
            return invalid(
                &format!("cohort.members[{index}].target"),
                "members must use canonical five-target order",
            );
        }
        require_digest(
            &format!("cohort.members[{index}].member_manifest_digest"),
            &member.member_manifest_digest,
        )?;
    }
    Ok(descriptor)
}

/// Validate an external cohort descriptor and return the SHA-256 of its exact
/// RFC 8785 JCS UTF-8 representation.
///
/// This computes a candidate descriptor's identity; it does not make that
/// identity trusted. Verification authority must come from an independently
/// supplied expected cohort digest (for example release publication metadata).
#[cfg(test)]
fn cohort_descriptor_digest(raw: &[u8]) -> Result<String> {
    let descriptor = parse_cohort(raw)?;
    Ok(sha256_hex(&canonical_cohort_bytes(&descriptor)))
}

fn canonical_cohort_bytes(descriptor: &CohortDescriptor) -> Vec<u8> {
    // All accepted strings use ASCII-only closed grammars. Therefore sorting
    // object keys lexicographically and emitting the strings without escapes is
    // exactly RFC 8785 JCS for this fixed descriptor (no numbers are present).
    let mut body = format!(
        "{{\"digest_algorithm\":\"sha256\",\"id\":\"{}\",\"members\":[",
        descriptor.id
    );
    for (index, member) in descriptor.members.iter().enumerate() {
        if index != 0 {
            body.push(',');
        }
        body.push_str(&format!(
            "{{\"member_manifest_digest\":\"{}\",\"target\":\"{}\"}}",
            member.member_manifest_digest,
            member.target.triple()
        ));
    }
    body.push_str("],\"schema_version\":\"1.0\"}");
    body.into_bytes()
}

// ---------------------------------------------------------------------------
// Complete installed-byte verification
// ---------------------------------------------------------------------------

/// Opaque, independently established release authority.
///
/// No public raw constructor exists: candidate manifests and descriptors must
/// never manufacture their own expected digests, target, component lock, or
/// installed capsule root. W01.P02.S16/W02.P04.S164 will obtain this value only
/// from receipt-selected, product-owned provenance under the installation lock.
pub struct TrustedReleaseAuthority {
    expected_target: Target,
    expected_member_manifest_digest: String,
    expected_cohort_digest: String,
    trusted_component_lock_bytes: Vec<u8>,
    trusted_component_lock_path: String,
    expected_component_lock_digest: String,
    trusted_capsule_root: String,
}

/// Opaque call-scoped input not carried inside the candidate generation.
///
/// The external cohort bytes remain untrusted until joined to the digest in
/// [`TrustedReleaseAuthority`]. No candidate path, generation identifier, or
/// member-manifest bytes are accepted here.
#[doc(hidden)]
pub struct ReleaseVerificationInput<'a> {
    pub(crate) authority: &'a TrustedReleaseAuthority,
    pub(crate) cohort_descriptor_bytes: &'a [u8],
}

/// Internally supplied transaction facts retained for receipt publication.
///
/// These facts are not derived from candidate bytes. Their closed grammar is
/// validated while the exact unpublished generation and installation guard are
/// borrowed, then S172 must consume the retained values rather than rebuilding
/// them at the publication boundary.
#[doc(hidden)]
pub struct ReceiptActivationContext {
    pub(crate) channel: Channel,
    pub(crate) bootstrap_created_ownership: bool,
    pub(crate) prior_seat: Option<PriorSeatIdentity>,
    pub(crate) consistency_generation: u64,
    pub(crate) created_ms: i64,
}

impl ReceiptActivationContext {
    fn validate(&self) -> Result<()> {
        if self.created_ms <= 0 {
            return invalid("receipt.created_ms", "must be positive");
        }
        if let Some(prior) = &self.prior_seat {
            crate::paths::validate_generation(&prior.generation).map_err(|error| {
                ManifestError::InvalidField {
                    field: "receipt.prior_seat.generation".to_string(),
                    detail: error.to_string(),
                }
            })?;
            require_exact_version(
                "receipt.prior_seat.dashboard_version",
                &prior.dashboard_version,
            )?;
            if prior.pid == Some(0) {
                return invalid("receipt.prior_seat.pid", "must be non-zero when present");
            }
        }
        Ok(())
    }
}

/// Complete immutable and transaction-supplied facts for the S172 receipt.
///
/// The active generation is borrowed from the exact retained token; it is
/// never accepted as a copied caller field.
pub struct VerifiedReceiptFacts<'generation> {
    dashboard_version: String,
    dashboard_commit: String,
    dashboard_digest: String,
    release_set_identity: String,
    release_set_member_digest: String,
    component_lock_digest: String,
    external_five_member_cohort_digest: String,
    target: Target,
    a2a_identity: ReleaseIdentity,
    active_generation: &'generation str,
    channel: Channel,
    bootstrap_created_ownership: bool,
    prior_seat: Option<PriorSeatIdentity>,
    consistency_generation: u64,
    created_ms: i64,
}

impl VerifiedReceiptFacts<'_> {
    #[must_use]
    pub fn dashboard_version(&self) -> &str {
        &self.dashboard_version
    }

    #[must_use]
    pub fn dashboard_commit(&self) -> &str {
        &self.dashboard_commit
    }

    #[must_use]
    pub fn dashboard_digest(&self) -> &str {
        &self.dashboard_digest
    }

    #[must_use]
    pub fn release_set_identity(&self) -> &str {
        &self.release_set_identity
    }

    #[must_use]
    pub fn release_set_member_digest(&self) -> &str {
        &self.release_set_member_digest
    }

    #[must_use]
    pub fn component_lock_digest(&self) -> &str {
        &self.component_lock_digest
    }

    #[must_use]
    pub fn external_five_member_cohort_digest(&self) -> &str {
        &self.external_five_member_cohort_digest
    }

    #[must_use]
    pub const fn target(&self) -> Target {
        self.target
    }

    #[must_use]
    pub fn a2a_identity(&self) -> &ReleaseIdentity {
        &self.a2a_identity
    }

    #[must_use]
    pub fn active_generation(&self) -> &str {
        self.active_generation
    }

    #[must_use]
    pub const fn channel(&self) -> Channel {
        self.channel
    }

    #[must_use]
    pub const fn bootstrap_created_ownership(&self) -> bool {
        self.bootstrap_created_ownership
    }

    #[must_use]
    pub fn prior_seat(&self) -> Option<&PriorSeatIdentity> {
        self.prior_seat.as_ref()
    }

    #[must_use]
    pub const fn consistency_generation(&self) -> u64 {
        self.consistency_generation
    }

    #[must_use]
    pub const fn created_ms(&self) -> i64 {
        self.created_ms
    }
}

/// A complete release verification bound to one retained unpublished generation.
///
/// This value is non-`Clone`, non-serializable, and has no public raw
/// construction path. It retains the exact generation borrow, final complete
/// snapshot, immutable release facts, and validated transaction facts until
/// activation completes.
pub struct VerifiedReleaseSet<'generation, 'product, 'lock> {
    generation: &'generation UnpublishedGeneration<'product, 'lock>,
    receipt_facts: VerifiedReceiptFacts<'generation>,
    member_manifest_path: String,
    final_snapshot: GenerationSnapshot,
    capsule_root: String,
    capsule_manifest: CapsuleManifest,
}

impl<'generation, 'product, 'lock> VerifiedReleaseSet<'generation, 'product, 'lock> {
    /// Verify every trust, byte, authority, and receipt-fact join.
    ///
    /// The member manifest is found only by its externally trusted digest in a
    /// complete first scan. Candidate-declared path data participates only
    /// after those exact bytes have been located and bounded-reread.
    pub fn verify(
        generation: &'generation UnpublishedGeneration<'product, 'lock>,
        input: ReleaseVerificationInput<'_>,
        receipt_context: ReceiptActivationContext,
    ) -> Result<Self> {
        let authority = input.authority;
        generation.validate_retained()?;
        receipt_context.validate()?;
        require_input_bound(
            "component lock",
            authority.trusted_component_lock_bytes.len(),
            MAX_COMPONENT_LOCK_BYTES as u64,
        )?;
        require_input_bound(
            "cohort descriptor",
            input.cohort_descriptor_bytes.len(),
            MAX_COHORT_BYTES as u64,
        )?;
        require_digest(
            "expected_member_manifest_digest",
            &authority.expected_member_manifest_digest,
        )?;
        require_digest("expected_cohort_digest", &authority.expected_cohort_digest)?;
        require_digest(
            "expected_component_lock_digest",
            &authority.expected_component_lock_digest,
        )?;
        expect_literal(
            "trusted_component_lock_path",
            COMPONENT_LOCK_PATH,
            &authority.trusted_component_lock_path,
        )?;
        validate_portable_path("trusted_capsule_root", &authority.trusted_capsule_root)?;

        generation.validate_retained()?;
        let (initial_snapshot, member_manifest_path) = scan_generation_locating_member(
            generation.path(),
            &authority.expected_member_manifest_digest,
        )?;
        let located_member_bytes = read_installed_bounded(
            generation.path(),
            &member_manifest_path,
            MAX_MEMBER_MANIFEST_BYTES as u64,
            observed_file(&initial_snapshot.files, &member_manifest_path)?,
        )?;
        let member_digest = sha256_hex(&located_member_bytes);
        let manifest = parse_release(&located_member_bytes)?;
        expect_literal(
            "release_manifest.path",
            &member_manifest_path,
            &manifest.release_manifest.path,
        )?;
        if manifest.target != authority.expected_target {
            return Err(ManifestError::TargetMismatch {
                expected: authority.expected_target,
                found: manifest.target,
            });
        }

        let component_lock_digest = sha256_hex(&authority.trusted_component_lock_bytes);
        expect_digest(
            "trusted_component_lock_bytes",
            &authority.expected_component_lock_digest,
            &component_lock_digest,
        )?;
        let lock = parse_component_lock(&authority.trusted_component_lock_bytes)?;
        expect_literal(
            "a2a_component.component_lock.path",
            &authority.trusted_component_lock_path,
            &manifest.a2a_component.component_lock.path,
        )?;
        expect_digest(
            "a2a_component.component_lock.digest",
            &component_lock_digest,
            &manifest.a2a_component.component_lock.digest,
        )?;
        verify_release_lock_joins(&manifest, &lock)?;

        let cohort = parse_cohort(input.cohort_descriptor_bytes)?;
        let cohort_digest = sha256_hex(&canonical_cohort_bytes(&cohort));
        expect_digest(
            "cohort descriptor",
            &authority.expected_cohort_digest,
            &cohort_digest,
        )?;
        expect_literal("release cohort id", &cohort.id, &manifest.cohort.id)?;
        let member = cohort
            .members
            .iter()
            .find(|member| member.target == authority.expected_target)
            .ok_or_else(|| ManifestError::InvalidField {
                field: "cohort.members".to_string(),
                detail: format!(
                    "missing canonical member {}",
                    authority.expected_target.triple()
                ),
            })?;
        expect_digest(
            "cohort current member digest",
            &member_digest,
            &member.member_manifest_digest,
        )?;

        let observed = &initial_snapshot.files;
        verify_release_manifest_bytes(
            generation.path(),
            &manifest.release_manifest.path,
            &located_member_bytes,
            observed,
        )?;
        verify_complete_inventory(&manifest, observed)?;
        verify_installed_exact_bytes(
            generation.path(),
            &authority.trusted_component_lock_path,
            &authority.trusted_component_lock_bytes,
            observed_file(observed, &authority.trusted_component_lock_path)?,
        )?;

        verify_artifact_joins(&manifest, observed)?;
        let capsule_bytes = read_installed_bounded(
            generation.path(),
            &manifest.a2a_component.capsule_manifest.path,
            MAX_CAPSULE_MANIFEST_BYTES,
            observed_file(observed, &manifest.a2a_component.capsule_manifest.path)?,
        )?;
        let (capsule, _) = parse_capsule(&capsule_bytes)?;
        capsule.verify_against_lock(&lock, authority.expected_target)?;
        expect_literal(
            "protocol gateway minimum",
            &capsule.compatibility.api_versions.minimum,
            &manifest.protocol.gateway_api_version_range.minimum,
        )?;
        expect_literal(
            "protocol gateway maximum",
            &capsule.compatibility.api_versions.maximum,
            &manifest.protocol.gateway_api_version_range.maximum,
        )?;
        expect_literal(
            "state migration minimum",
            &capsule.compatibility.migration_range.base,
            &manifest.state_schema.migration_range.minimum,
        )?;
        expect_literal(
            "state migration maximum",
            &capsule.compatibility.migration_range.head,
            &manifest.state_schema.migration_range.maximum,
        )?;
        verify_tree_evidence(
            generation.path(),
            &authority.trusted_capsule_root,
            &manifest,
            &capsule,
            observed,
        )?;

        let final_snapshot = scan_generation(
            generation.path(),
            Some(manifest.release_manifest.path.as_str()),
        )?;
        generation.validate_retained()?;
        require_unchanged_snapshot(&initial_snapshot, &final_snapshot)?;

        let ReceiptActivationContext {
            channel,
            bootstrap_created_ownership,
            prior_seat,
            consistency_generation,
            created_ms,
        } = receipt_context;
        Ok(Self {
            generation,
            receipt_facts: VerifiedReceiptFacts {
                dashboard_version: manifest.dashboard.version,
                dashboard_commit: manifest.dashboard.commit,
                dashboard_digest: manifest.dashboard.digest,
                release_set_identity: manifest.cohort.id,
                release_set_member_digest: member_digest,
                component_lock_digest,
                external_five_member_cohort_digest: cohort_digest,
                target: manifest.target,
                a2a_identity: manifest.a2a_component.release_identity,
                active_generation: generation.generation(),
                channel,
                bootstrap_created_ownership,
                prior_seat,
                consistency_generation,
                created_ms,
            },
            member_manifest_path,
            final_snapshot,
            capsule_root: authority.trusted_capsule_root.clone(),
            capsule_manifest: capsule,
        })
    }

    /// Revalidate the exact retained authority and complete final snapshot at
    /// the activation boundary.
    pub fn revalidate_for_activation(&self) -> Result<()> {
        self.generation.validate_retained()?;
        let current = scan_generation(
            self.generation.path(),
            Some(self.member_manifest_path.as_str()),
        )?;
        self.generation.validate_retained()?;
        require_unchanged_snapshot(&self.final_snapshot, &current)
    }

    /// Immutable receipt facts retained under the exact generation borrow.
    #[must_use]
    pub fn receipt_facts(&self) -> &VerifiedReceiptFacts<'generation> {
        &self.receipt_facts
    }

    #[must_use]
    pub const fn target(&self) -> Target {
        self.receipt_facts.target
    }

    #[must_use]
    pub fn release_set_id(&self) -> &str {
        &self.receipt_facts.release_set_identity
    }

    /// Diagnostic identifier borrowed from the exact retained token.
    #[must_use]
    pub fn generation_id(&self) -> &str {
        self.generation.generation()
    }

    #[must_use]
    pub fn member_manifest_digest(&self) -> &str {
        &self.receipt_facts.release_set_member_digest
    }

    #[must_use]
    pub fn component_lock_digest(&self) -> &str {
        &self.receipt_facts.component_lock_digest
    }

    #[must_use]
    pub fn cohort_digest(&self) -> &str {
        &self.receipt_facts.external_five_member_cohort_digest
    }

    #[must_use]
    pub fn dashboard_version(&self) -> &str {
        &self.receipt_facts.dashboard_version
    }

    #[must_use]
    pub fn dashboard_commit(&self) -> &str {
        &self.receipt_facts.dashboard_commit
    }

    #[must_use]
    pub fn dashboard_digest(&self) -> &str {
        &self.receipt_facts.dashboard_digest
    }

    #[must_use]
    pub fn a2a_identity(&self) -> &ReleaseIdentity {
        &self.receipt_facts.a2a_identity
    }

    #[must_use]
    pub fn capsule_root(&self) -> &str {
        &self.capsule_root
    }

    #[must_use]
    pub fn capsule_manifest(&self) -> &CapsuleManifest {
        &self.capsule_manifest
    }
}

#[derive(PartialEq, Eq)]
struct ObservedFile {
    identity: FilesystemIdentity,
    link_count: u64,
    size: u64,
    digest: String,
    normalized_mode: Option<&'static str>,
}

#[derive(PartialEq, Eq)]
struct GenerationSnapshot {
    canonical_root: PathBuf,
    root_identity: RootIdentity,
    directories: BTreeMap<String, ObservedDirectory>,
    files: BTreeMap<String, ObservedFile>,
}

#[derive(PartialEq, Eq)]
struct ObservedDirectory {
    identity: FilesystemIdentity,
    owner: Option<u32>,
    mode: Option<u32>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum RootIdentity {
    #[cfg(unix)]
    Unix { device: u64, inode: u64 },
    #[cfg(windows)]
    Windows {
        volume_serial_number: u64,
        file_id: u128,
    },
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
enum FilesystemIdentity {
    #[cfg(unix)]
    Unix { device: u64, inode: u64 },
    #[cfg(windows)]
    Windows {
        volume_serial_number: u64,
        file_id: u128,
    },
}

fn scan_generation(root: &Path, excluded_manifest: Option<&str>) -> Result<GenerationSnapshot> {
    scan_generation_inner(root, excluded_manifest, None).map(|(snapshot, _)| snapshot)
}

fn scan_generation_locating_member(
    root: &Path,
    expected_digest: &str,
) -> Result<(GenerationSnapshot, String)> {
    let (snapshot, located) = scan_generation_inner(root, None, Some(expected_digest))?;
    let located = located.ok_or_else(|| {
        ManifestError::MissingFile(
            "release member whose digest matches the trusted release metadata".to_string(),
        )
    })?;
    Ok((snapshot, located))
}

fn scan_generation_inner(
    root: &Path,
    excluded_manifest: Option<&str>,
    expected_unique_digest: Option<&str>,
) -> Result<(GenerationSnapshot, Option<String>)> {
    let root_metadata = safe_symlink_metadata(root)?;
    if !root_metadata.is_dir() || metadata_is_link_like(&root_metadata) {
        return Err(ManifestError::UnsafeFileType {
            path: root.to_path_buf(),
            detail: "generation root must be a non-link directory".to_string(),
        });
    }
    require_windows_restricted_acl(root)?;
    let initial_root_identity = root_identity(root, &root_metadata)?;
    let canonical_root = std::fs::canonicalize(root).map_err(|error| io_error(root, error))?;
    let mut pending = vec![(root.to_path_buf(), 0_usize, None::<String>)];
    let mut discovered_directories = 1_usize;
    let mut directories = BTreeMap::new();
    let mut files = BTreeMap::new();
    let mut semantic = BTreeSet::new();
    let mut identities = BTreeSet::new();
    let mut total_bytes = 0_u64;
    let mut payload_files = 0_usize;
    let initial_file_limit =
        MAX_INSTALLED_FILES
            .checked_add(1)
            .ok_or_else(|| ManifestError::InvalidField {
                field: "generation tree".to_string(),
                detail: "installed-file count bound overflow".to_string(),
            })?;
    let file_limit = if excluded_manifest.is_none() {
        initial_file_limit
    } else {
        MAX_INSTALLED_FILES
    };
    let mut located_digest_match = None;
    while let Some((directory, depth, portable_directory)) = pending.pop() {
        if depth > 32 {
            return invalid("generation tree", "directory depth exceeds 32 segments");
        }
        require_windows_restricted_acl(&directory)?;
        if let Some(portable) = portable_directory.as_deref() {
            let current = observe_directory(&directory)?;
            if directories.get(portable) != Some(&current) {
                return Err(ManifestError::GenerationChanged {
                    detail: format!("installed directory {portable} changed before enumeration"),
                });
            }
        }
        let entries = std::fs::read_dir(&directory).map_err(|error| io_error(&directory, error))?;
        for entry in entries {
            let entry = entry.map_err(|error| io_error(&directory, error))?;
            let path = entry.path();
            let metadata = safe_symlink_metadata(&path)?;
            if metadata_is_link_like(&metadata) {
                return Err(ManifestError::UnsafeFileType {
                    path,
                    detail: "symlink or reparse-point traversal is forbidden".to_string(),
                });
            }
            let relative = path
                .strip_prefix(root)
                .map_err(|_| ManifestError::UnsafeFileType {
                    path: path.clone(),
                    detail: "path escaped the generation root".to_string(),
                })?;
            let portable = relative_path_string(relative)?;
            validate_portable_path("installed object", &portable)?;
            if !semantic.insert(semantic_path_key(&portable)) {
                return invalid("installed object", "case-folded semantic path collision");
            }
            let canonical_parent = std::fs::canonicalize(path.parent().unwrap_or(root))
                .map_err(|error| io_error(&path, error))?;
            if !canonical_parent.starts_with(&canonical_root) {
                return Err(ManifestError::UnsafeFileType {
                    path,
                    detail: "canonical parent escaped the generation root".to_string(),
                });
            }
            if metadata.is_dir() {
                if depth >= 32 {
                    return invalid("generation tree", "directory depth exceeds 32 segments");
                }
                if discovered_directories >= MAX_DIRECTORIES {
                    return invalid("generation tree", "too many directories");
                }
                discovered_directories += 1;
                let observed = observe_directory(&path)?;
                directories.insert(portable.clone(), observed);
                pending.push((path, depth + 1, Some(portable)));
                continue;
            }
            if !metadata.is_file() {
                return Err(ManifestError::UnsafeFileType {
                    path,
                    detail: "only regular files and directories are supported".to_string(),
                });
            }
            require_windows_restricted_acl(&path)?;
            total_bytes = total_bytes.checked_add(metadata.len()).ok_or_else(|| {
                ManifestError::InvalidField {
                    field: "generation tree".to_string(),
                    detail: "expanded size overflow".to_string(),
                }
            })?;
            if total_bytes > MAX_EXPANDED_BYTES {
                return invalid("generation tree", "expanded bytes exceed 8 GiB");
            }
            if excluded_manifest != Some(portable.as_str()) {
                payload_files += 1;
                if payload_files > file_limit {
                    return invalid(
                        "generation tree",
                        if excluded_manifest.is_none() {
                            "more than 100001 regular files before member-manifest discovery"
                        } else {
                            "more than 100000 installed payload files"
                        },
                    );
                }
            }
            let observed = hash_regular_file(&path, metadata.len())?;
            if !identities.insert(observed.identity) {
                return Err(ManifestError::UnsafeFileType {
                    path,
                    detail: "two installed paths resolve to the same regular-file identity"
                        .to_string(),
                });
            }
            if expected_unique_digest == Some(observed.digest.as_str())
                && located_digest_match.replace(portable.clone()).is_some()
            {
                return invalid(
                    "release member manifest",
                    "more than one installed file matches the trusted member digest",
                );
            }
            files.insert(portable, observed);
        }
        require_windows_restricted_acl(&directory)?;
        if let Some(portable) = portable_directory.as_deref() {
            let current = observe_directory(&directory)?;
            if directories.get(portable) != Some(&current) {
                return Err(ManifestError::GenerationChanged {
                    detail: format!("installed directory {portable} changed during enumeration"),
                });
            }
        }
    }
    let final_root_metadata = safe_symlink_metadata(root)?;
    if !final_root_metadata.is_dir() || metadata_is_link_like(&final_root_metadata) {
        return Err(ManifestError::GenerationChanged {
            detail: "generation root type changed during scan".to_string(),
        });
    }
    let final_root_identity = root_identity(root, &final_root_metadata)?;
    if initial_root_identity != final_root_identity {
        return Err(ManifestError::GenerationChanged {
            detail: "generation root identity changed during scan".to_string(),
        });
    }
    require_windows_restricted_acl(root)?;
    Ok((
        GenerationSnapshot {
            canonical_root,
            root_identity: initial_root_identity,
            directories,
            files,
        },
        located_digest_match,
    ))
}

fn observe_directory(path: &Path) -> Result<ObservedDirectory> {
    require_windows_restricted_acl(path)?;
    let metadata = safe_symlink_metadata(path)?;
    if !metadata.is_dir() || metadata_is_link_like(&metadata) {
        return Err(ManifestError::UnsafeFileType {
            path: path.to_path_buf(),
            detail: "installed directory is not a non-link directory".to_string(),
        });
    }
    #[cfg(unix)]
    let observation = {
        use std::os::unix::fs::MetadataExt;
        ObservedDirectory {
            identity: FilesystemIdentity::Unix {
                device: metadata.dev(),
                inode: metadata.ino(),
            },
            owner: Some(metadata.uid()),
            mode: Some(metadata.mode() & 0o777),
        }
    };
    #[cfg(windows)]
    let observation = {
        let identity = vaultspec_windows_authority::AuthorityFile::identity_at_path(path)
            .map_err(|error| io_error(path, error))?;
        ObservedDirectory {
            identity: FilesystemIdentity::Windows {
                volume_serial_number: identity.volume_serial_number,
                file_id: identity.file_id,
            },
            owner: None,
            mode: None,
        }
    };
    require_windows_restricted_acl(path)?;
    Ok(observation)
}

fn require_unchanged_snapshot(
    initial: &GenerationSnapshot,
    final_snapshot: &GenerationSnapshot,
) -> Result<()> {
    if initial == final_snapshot {
        Ok(())
    } else {
        Err(ManifestError::GenerationChanged {
            detail: "root identity, canonical root, directory inventory, or installed-file observation changed across verification"
                .to_string(),
        })
    }
}

#[cfg(unix)]
fn root_identity(_path: &Path, metadata: &Metadata) -> Result<RootIdentity> {
    use std::os::unix::fs::MetadataExt;
    Ok(RootIdentity::Unix {
        device: metadata.dev(),
        inode: metadata.ino(),
    })
}

#[cfg(windows)]
fn root_identity(path: &Path, _metadata: &Metadata) -> Result<RootIdentity> {
    let identity = vaultspec_windows_authority::AuthorityFile::identity_at_path(path)
        .map_err(|error| io_error(path, error))?;
    Ok(RootIdentity::Windows {
        volume_serial_number: identity.volume_serial_number,
        file_id: identity.file_id,
    })
}

fn safe_symlink_metadata(path: &Path) -> Result<Metadata> {
    std::fs::symlink_metadata(path).map_err(|error| io_error(path, error))
}

#[cfg(windows)]
fn metadata_is_link_like(metadata: &Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
}

#[cfg(not(windows))]
fn metadata_is_link_like(metadata: &Metadata) -> bool {
    metadata.file_type().is_symlink()
}

#[cfg(not(windows))]
fn require_windows_restricted_acl(_path: &Path) -> Result<()> {
    Ok(())
}

#[cfg(windows)]
fn require_windows_restricted_acl(path: &Path) -> Result<()> {
    use windows_acl::acl::{ACL, AceType};
    use windows_acl::helper::{current_user, name_to_sid, sid_to_string};

    static CURRENT_USER_SID: std::sync::OnceLock<Option<String>> = std::sync::OnceLock::new();
    let restricted = (|| {
        let path = path.to_str()?;
        let user_sid = CURRENT_USER_SID
            .get_or_init(|| {
                let user = current_user()?;
                let sid = name_to_sid(&user, None).ok()?;
                sid_to_string(sid.as_ptr().cast_mut().cast()).ok()
            })
            .as_deref()?;
        let acl = ACL::from_file_path(path, false).ok()?;
        let entries = acl.all().ok()?;
        let allowed = [user_sid, "S-1-5-18", "S-1-5-32-544"];
        let mut user_allowed = false;
        for entry in entries {
            match entry.entry_type {
                AceType::AccessAllow => {
                    if !allowed.contains(&entry.string_sid.as_str()) {
                        return None;
                    }
                    user_allowed |= entry.string_sid == user_sid;
                }
                AceType::AccessDeny => {}
                _ => return None,
            }
        }
        user_allowed.then_some(())
    })()
    .is_some();
    if restricted {
        Ok(())
    } else {
        Err(ManifestError::UnsafeFileType {
            path: path.to_path_buf(),
            detail: "Windows installed object DACL grants or delegates authority outside the current user, LocalSystem, and Administrators"
                .to_string(),
        })
    }
}

#[cfg(unix)]
fn normalized_file_mode(metadata: &Metadata) -> Option<&'static str> {
    use std::os::unix::fs::PermissionsExt;
    Some(if metadata.permissions().mode() & 0o111 == 0 {
        "0644"
    } else {
        "0755"
    })
}

#[cfg(not(unix))]
fn normalized_file_mode(_metadata: &Metadata) -> Option<&'static str> {
    None
}

#[derive(Clone, Copy, PartialEq, Eq)]
struct OpenedFileState {
    identity: FilesystemIdentity,
    link_count: u64,
    size: u64,
    normalized_mode: Option<&'static str>,
}

struct OpenedRegular {
    #[cfg(unix)]
    file: File,
    #[cfg(windows)]
    authority: vaultspec_windows_authority::AuthorityFile,
}

impl OpenedRegular {
    fn file(&self) -> &File {
        #[cfg(unix)]
        {
            &self.file
        }
        #[cfg(windows)]
        {
            self.authority.file()
        }
    }

    fn state(&self, path: &Path) -> Result<OpenedFileState> {
        let metadata = self
            .file()
            .metadata()
            .map_err(|error| io_error(path, error))?;
        if !metadata.is_file() || metadata_is_link_like(&metadata) {
            return Err(ManifestError::UnsafeFileType {
                path: path.to_path_buf(),
                detail: "opened object is not a non-link regular file".to_string(),
            });
        }
        #[cfg(unix)]
        let (identity, link_count) = {
            use std::os::unix::fs::MetadataExt;
            (
                FilesystemIdentity::Unix {
                    device: metadata.dev(),
                    inode: metadata.ino(),
                },
                metadata.nlink(),
            )
        };
        #[cfg(windows)]
        let (identity, link_count) = {
            let identity = self.authority.identity();
            (
                FilesystemIdentity::Windows {
                    volume_serial_number: identity.volume_serial_number,
                    file_id: identity.file_id,
                },
                self.authority
                    .link_count()
                    .map_err(|error| io_error(path, error))?,
            )
        };
        if link_count != 1 {
            return Err(ManifestError::UnsafeFileType {
                path: path.to_path_buf(),
                detail: format!(
                    "installed regular file must have exactly one hard-link name, found {link_count}"
                ),
            });
        }
        Ok(OpenedFileState {
            identity,
            link_count,
            size: metadata.len(),
            normalized_mode: normalized_file_mode(&metadata),
        })
    }
}

fn open_regular_nofollow(path: &Path) -> Result<OpenedRegular> {
    #[cfg(unix)]
    {
        let mut options = OpenOptions::new();
        options.read(true);
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(nix::libc::O_NOFOLLOW);
        let file = options.open(path).map_err(|error| io_error(path, error))?;
        let opened = OpenedRegular { file };
        let _ = opened.state(path)?;
        Ok(opened)
    }
    #[cfg(windows)]
    {
        let authority = vaultspec_windows_authority::AuthorityFile::open_reader(path)
            .map_err(|error| io_error(path, error))?;
        let opened = OpenedRegular { authority };
        let _ = opened.state(path)?;
        Ok(opened)
    }
}

fn hash_regular_file(path: &Path, expected_size: u64) -> Result<ObservedFile> {
    require_windows_restricted_acl(path)?;
    let opened = open_regular_nofollow(path)?;
    let initial_state = opened.state(path)?;
    if initial_state.size != expected_size {
        return Err(ManifestError::GenerationChanged {
            detail: format!(
                "{} size changed between no-follow metadata and same-handle open",
                path.display()
            ),
        });
    }
    let read_limit = expected_size
        .checked_add(1)
        .ok_or_else(|| ManifestError::InputTooLarge {
            field: path.display().to_string(),
            limit: expected_size,
            found: u64::MAX,
        })?;
    let mut reader = opened.file().take(read_limit);
    let mut hasher = Sha256::new();
    let mut buffer = vec![0_u8; READ_CHUNK];
    let mut total = 0_u64;
    loop {
        let count = reader
            .read(&mut buffer)
            .map_err(|error| io_error(path, error))?;
        if count == 0 {
            break;
        }
        total = total
            .checked_add(count as u64)
            .ok_or_else(|| ManifestError::InputTooLarge {
                field: path.display().to_string(),
                limit: expected_size,
                found: u64::MAX,
            })?;
        if total > expected_size || total > MAX_EXPANDED_BYTES {
            return Err(ManifestError::SizeMismatch {
                path: path.display().to_string(),
                expected: expected_size,
                found: total,
            });
        }
        hasher.update(&buffer[..count]);
    }
    if total != expected_size {
        return Err(ManifestError::SizeMismatch {
            path: path.display().to_string(),
            expected: expected_size,
            found: total,
        });
    }
    let final_state = opened.state(path)?;
    require_windows_restricted_acl(path)?;
    if initial_state != final_state {
        return Err(ManifestError::GenerationChanged {
            detail: format!(
                "{} same-handle identity, link count, size, or mode changed during hashing",
                path.display()
            ),
        });
    }
    Ok(ObservedFile {
        identity: final_state.identity,
        link_count: final_state.link_count,
        size: total,
        digest: format!("{:x}", hasher.finalize()),
        normalized_mode: final_state.normalized_mode,
    })
}

fn relative_path_string(path: &Path) -> Result<String> {
    let mut segments = Vec::new();
    for component in path.components() {
        let std::path::Component::Normal(segment) = component else {
            return invalid("installed file", "non-normal filesystem path component");
        };
        let text = segment
            .to_str()
            .ok_or_else(|| ManifestError::InvalidField {
                field: "installed file".to_string(),
                detail: "path is not UTF-8".to_string(),
            })?;
        segments.push(text);
    }
    Ok(segments.join("/"))
}

fn verify_release_manifest_bytes(
    root: &Path,
    relative: &str,
    expected: &[u8],
    observed: &BTreeMap<String, ObservedFile>,
) -> Result<()> {
    verify_installed_exact_bytes(root, relative, expected, observed_file(observed, relative)?)
}

fn verify_installed_exact_bytes(
    root: &Path,
    relative: &str,
    expected: &[u8],
    initial: &ObservedFile,
) -> Result<()> {
    let bytes = read_installed_bounded(root, relative, expected.len() as u64, initial)?;
    if bytes != expected {
        return Err(ManifestError::DigestDrift {
            field: relative.to_string(),
            expected: sha256_hex(expected),
            found: sha256_hex(&bytes),
        });
    }
    Ok(())
}

fn observed_file<'a>(
    observed: &'a BTreeMap<String, ObservedFile>,
    relative: &str,
) -> Result<&'a ObservedFile> {
    observed
        .get(relative)
        .ok_or_else(|| ManifestError::MissingFile(relative.to_string()))
}

fn verify_complete_inventory(
    manifest: &RawReleaseSetManifest,
    observed: &BTreeMap<String, ObservedFile>,
) -> Result<()> {
    for (path, expected) in &manifest.file_digests {
        let file = observed
            .get(path)
            .ok_or_else(|| ManifestError::MissingFile(path.clone()))?;
        expect_digest(&format!("installed file {path}"), expected, &file.digest)?;
    }
    for path in observed.keys() {
        if path != &manifest.release_manifest.path && !manifest.file_digests.contains_key(path) {
            return Err(ManifestError::ExtraFile(path.clone()));
        }
    }
    if !observed.contains_key(&manifest.release_manifest.path) {
        return Err(ManifestError::MissingFile(
            manifest.release_manifest.path.clone(),
        ));
    }
    Ok(())
}

fn verify_artifact_joins(
    manifest: &RawReleaseSetManifest,
    observed: &BTreeMap<String, ObservedFile>,
) -> Result<()> {
    // S06 proves the declared license and SBOM files are present and byte-bound.
    // Semantic coverage/completeness remains release-workflow authority owned by
    // W04.P08.S64/S65; this verifier does not claim to interpret those contents.
    verify_sized_join(
        "dashboard",
        &manifest.dashboard.path,
        manifest.dashboard.size,
        &manifest.dashboard.digest,
        manifest,
        observed,
    )?;
    verify_sized_join(
        "updater",
        &manifest.updater.path,
        manifest.updater.size,
        &manifest.updater.digest,
        manifest,
        observed,
    )?;
    verify_digest_join(
        "component lock",
        &manifest.a2a_component.component_lock.path,
        &manifest.a2a_component.component_lock.digest,
        manifest,
        observed,
    )?;
    verify_digest_join(
        "capsule manifest",
        &manifest.a2a_component.capsule_manifest.path,
        &manifest.a2a_component.capsule_manifest.digest,
        manifest,
        observed,
    )?;
    verify_sized_join(
        "capsule archive",
        &manifest.a2a_component.capsule_archive.path,
        manifest.a2a_component.capsule_archive.size,
        &manifest.a2a_component.capsule_archive.digest,
        manifest,
        observed,
    )?;
    verify_sized_join(
        "tree evidence",
        &manifest.a2a_component.tree_evidence.path,
        manifest.a2a_component.tree_evidence.size,
        &manifest.a2a_component.tree_evidence.digest,
        manifest,
        observed,
    )?;
    verify_sized_join(
        "sbom",
        &manifest.sbom.path,
        manifest.sbom.size,
        &manifest.sbom.digest,
        manifest,
        observed,
    )?;
    for license in &manifest.licenses {
        verify_digest_join(
            "license",
            &license.path,
            &license.digest,
            manifest,
            observed,
        )?;
    }
    Ok(())
}

fn verify_digest_join(
    field: &str,
    path: &str,
    digest: &str,
    manifest: &RawReleaseSetManifest,
    observed: &BTreeMap<String, ObservedFile>,
) -> Result<()> {
    let inventory = manifest
        .file_digests
        .get(path)
        .ok_or_else(|| ManifestError::MissingFile(path.to_string()))?;
    expect_digest(&format!("{field} inventory join"), digest, inventory)?;
    let actual = observed
        .get(path)
        .ok_or_else(|| ManifestError::MissingFile(path.to_string()))?;
    expect_digest(&format!("{field} installed bytes"), digest, &actual.digest)
}

fn verify_sized_join(
    field: &str,
    path: &str,
    size: u64,
    digest: &str,
    manifest: &RawReleaseSetManifest,
    observed: &BTreeMap<String, ObservedFile>,
) -> Result<()> {
    verify_digest_join(field, path, digest, manifest, observed)?;
    let actual = &observed[path];
    if actual.size != size {
        return Err(ManifestError::SizeMismatch {
            path: path.to_string(),
            expected: size,
            found: actual.size,
        });
    }
    Ok(())
}

fn read_installed_bounded(
    root: &Path,
    relative: &str,
    limit: u64,
    initial: &ObservedFile,
) -> Result<Vec<u8>> {
    let path = root.join(relative.replace('/', std::path::MAIN_SEPARATOR_STR));
    require_windows_restricted_acl(&path)?;
    let metadata = safe_symlink_metadata(&path)?;
    if metadata.len() > limit {
        return Err(ManifestError::InputTooLarge {
            field: relative.to_string(),
            limit,
            found: metadata.len(),
        });
    }
    let opened = open_regular_nofollow(&path)?;
    let initial_state = opened.state(&path)?;
    if initial_state.size != metadata.len() {
        return Err(ManifestError::GenerationChanged {
            detail: format!(
                "{relative} size changed between no-follow metadata and same-handle open"
            ),
        });
    }
    if initial_state.size > limit {
        return Err(ManifestError::InputTooLarge {
            field: relative.to_string(),
            limit,
            found: initial_state.size,
        });
    }
    let read_limit = limit
        .checked_add(1)
        .ok_or_else(|| ManifestError::InputTooLarge {
            field: relative.to_string(),
            limit,
            found: u64::MAX,
        })?;
    let capacity = usize::try_from(initial_state.size.min(limit)).map_err(|_| {
        ManifestError::InputTooLarge {
            field: relative.to_string(),
            limit,
            found: initial_state.size,
        }
    })?;
    let mut bytes = Vec::with_capacity(capacity);
    opened
        .file()
        .take(read_limit)
        .read_to_end(&mut bytes)
        .map_err(|error| io_error(&path, error))?;
    if bytes.len() as u64 > limit {
        return Err(ManifestError::InputTooLarge {
            field: relative.to_string(),
            limit,
            found: bytes.len() as u64,
        });
    }
    let final_state = opened.state(&path)?;
    require_windows_restricted_acl(&path)?;
    if initial_state != final_state {
        return Err(ManifestError::GenerationChanged {
            detail: format!(
                "{relative} same-handle identity, link count, size, or mode changed during bounded reread"
            ),
        });
    }
    let reread = ObservedFile {
        identity: final_state.identity,
        link_count: final_state.link_count,
        size: bytes.len() as u64,
        digest: sha256_hex(&bytes),
        normalized_mode: final_state.normalized_mode,
    };
    if &reread != initial {
        return Err(ManifestError::GenerationChanged {
            detail: format!("{relative} identity changed between scan and bounded reread"),
        });
    }
    Ok(bytes)
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct InstalledTreeInventory {
    inventory_version: String,
    metadata: InventoryMetadata,
    components: Vec<InventoryComponent>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct InventoryMetadata {
    timestamp: String,
    component: InventoryApplication,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct InventoryApplication {
    #[serde(rename = "type")]
    kind: String,
    name: String,
    version: String,
    properties: Vec<InventoryProperty>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct InventoryComponent {
    #[serde(rename = "type")]
    kind: String,
    name: String,
    hashes: Vec<InventoryHash>,
    properties: Vec<InventoryProperty>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct InventoryHash {
    alg: String,
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct InventoryProperty {
    name: String,
    value: String,
}

#[derive(Debug, Serialize)]
struct TreeDigestRecord<'a> {
    mode: &'a str,
    path: &'a str,
    sha256: &'a str,
    size: &'a str,
}

#[derive(Debug)]
struct ValidatedTreeRecord {
    path: String,
    mode: String,
    size: u64,
    size_text: String,
    digest: String,
}

fn verify_tree_evidence(
    root: &Path,
    trusted_capsule_root: &str,
    release: &RawReleaseSetManifest,
    capsule: &CapsuleManifest,
    observed: &BTreeMap<String, ObservedFile>,
) -> Result<()> {
    let evidence = read_installed_bounded(
        root,
        &release.a2a_component.tree_evidence.path,
        MAX_TREE_EVIDENCE_BYTES,
        observed_file(observed, &release.a2a_component.tree_evidence.path)?,
    )?;
    let inventory: InstalledTreeInventory = serde_json::from_slice(&evidence)
        .map_err(|error| ManifestError::Parse(error.to_string()))?;
    let parsed_value: serde_json::Value = serde_json::from_slice(&evidence)
        .map_err(|error| ManifestError::Parse(error.to_string()))?;
    let mut canonical_evidence = serde_json::to_vec(&parsed_value)
        .map_err(|error| ManifestError::Parse(error.to_string()))?;
    canonical_evidence.push(b'\n');
    if canonical_evidence != evidence {
        return invalid(
            "a2a_component.tree_evidence",
            "inventory bytes are not compact sorted-key UTF-8 JSON plus one LF",
        );
    }
    expect_literal(
        "tree_evidence.inventory_version",
        "vaultspec-installed-tree-v1",
        &inventory.inventory_version,
    )?;
    require_bounded_text(
        "tree_evidence.metadata.timestamp",
        &inventory.metadata.timestamp,
        1,
        64,
    )?;
    expect_literal(
        "tree_evidence.metadata.component.type",
        "application",
        &inventory.metadata.component.kind,
    )?;
    expect_literal(
        "tree_evidence.metadata.component.name",
        &capsule.identity.name,
        &inventory.metadata.component.name,
    )?;
    expect_literal(
        "tree_evidence.metadata.component.version",
        &capsule.identity.version,
        &inventory.metadata.component.version,
    )?;
    let metadata_properties = property_map(
        "tree_evidence.metadata.component.properties",
        &inventory.metadata.component.properties,
        2,
    )?;
    expect_literal(
        "tree_evidence metadata target",
        capsule.target.triple(),
        required_property(&metadata_properties, "vaultspec:target")?,
    )?;
    expect_digest(
        "tree_evidence metadata component manifest",
        &release.a2a_component.capsule_manifest.digest,
        required_property(&metadata_properties, "vaultspec:component-manifest-sha256")?,
    )?;

    if inventory.components.is_empty() || inventory.components.len() > MAX_TREE_FILES {
        return invalid("tree_evidence.components", "must contain 1..=80000 files");
    }
    if inventory.components.len() != release.a2a_component.tree_evidence.file_count {
        return invalid(
            "tree_evidence.file_count",
            "does not match inventory components",
        );
    }
    let mut records = Vec::with_capacity(inventory.components.len());
    let mut semantic = BTreeSet::new();
    let mut installed_tree_paths = BTreeSet::new();
    for component in &inventory.components {
        expect_literal("tree_evidence.components.type", "file", &component.kind)?;
        validate_portable_path("tree_evidence.components.name", &component.name)?;
        if !semantic.insert(semantic_path_key(&component.name)) {
            return invalid("tree_evidence.components", "duplicate semantic path");
        }
        if component.hashes.len() != 1 {
            return invalid(
                "tree_evidence.components.hashes",
                "must contain exactly one SHA-256 hash",
            );
        }
        expect_literal(
            "tree_evidence.components.hashes.alg",
            "SHA-256",
            &component.hashes[0].alg,
        )?;
        require_digest(
            "tree_evidence.components.hashes.content",
            &component.hashes[0].content,
        )?;
        let properties = property_map(
            "tree_evidence.components.properties",
            &component.properties,
            2,
        )?;
        let mode = required_property(&properties, "vaultspec:file-mode")?;
        if !matches!(mode, "0644" | "0755") {
            return invalid("tree_evidence.components.mode", "must be 0644 or 0755");
        }
        let size_text = required_property(&properties, "vaultspec:file-size")?;
        if size_text.is_empty()
            || (size_text.len() > 1 && size_text.starts_with('0'))
            || !size_text.bytes().all(|byte| byte.is_ascii_digit())
        {
            return invalid(
                "tree_evidence.components.size",
                "must be canonical unsigned decimal",
            );
        }
        let size = size_text
            .parse::<u64>()
            .map_err(|_| ManifestError::InvalidField {
                field: "tree_evidence.components.size".to_string(),
                detail: "size is outside u64".to_string(),
            })?;
        if size > 2 * 1024 * 1024 * 1024 {
            return invalid("tree_evidence.components.size", "member exceeds 2 GiB");
        }
        let installed_path = format!("{trusted_capsule_root}/{}", component.name);
        validate_portable_path("tree_evidence installed path", &installed_path)?;
        let actual = observed
            .get(&installed_path)
            .ok_or_else(|| ManifestError::MissingFile(installed_path.clone()))?;
        if actual.size != size {
            return Err(ManifestError::SizeMismatch {
                path: installed_path,
                expected: size,
                found: actual.size,
            });
        }
        expect_digest(
            &format!("tree evidence installed file {}", component.name),
            &component.hashes[0].content,
            &actual.digest,
        )?;
        if let Some(actual_mode) = actual.normalized_mode {
            expect_literal(
                &format!("tree evidence installed mode {}", component.name),
                mode,
                actual_mode,
            )?;
        }
        installed_tree_paths.insert(installed_path);
        records.push(ValidatedTreeRecord {
            path: component.name.clone(),
            mode: mode.to_string(),
            size,
            size_text: size_text.to_string(),
            digest: component.hashes[0].content.clone(),
        });
    }
    let tree_prefix = format!("{trusted_capsule_root}/");
    for installed_path in observed
        .keys()
        .filter(|path| path.starts_with(&tree_prefix))
    {
        if !installed_tree_paths.contains(installed_path) {
            return Err(ManifestError::ExtraFile(format!(
                "{installed_path} is absent from A2A installed-tree evidence"
            )));
        }
    }
    verify_entrypoint_tree_record(
        "gateway",
        &capsule.entrypoints.gateway,
        trusted_capsule_root,
        &records,
        observed,
    )?;
    verify_entrypoint_tree_record(
        "standalone-mcp",
        &capsule.entrypoints.standalone_mcp,
        trusted_capsule_root,
        &records,
        observed,
    )?;
    records.sort_by(|left, right| left.path.cmp(&right.path));
    let expanded = records.iter().try_fold(0_u64, |total, record| {
        total
            .checked_add(record.size)
            .ok_or_else(|| ManifestError::InvalidField {
                field: "tree_evidence.components".to_string(),
                detail: "expanded size overflow".to_string(),
            })
    })?;
    if expanded > MAX_EXPANDED_BYTES {
        return invalid("tree_evidence.components", "expanded tree exceeds 8 GiB");
    }
    let computed = tree_digest(&records)?;
    expect_digest(
        "a2a_component.tree_evidence.tree_digest",
        &release.a2a_component.tree_evidence.tree_digest,
        &computed,
    )
}

fn verify_entrypoint_tree_record(
    field: &str,
    entrypoint: &LaunchEntrypoint,
    trusted_capsule_root: &str,
    records: &[ValidatedTreeRecord],
    observed: &BTreeMap<String, ObservedFile>,
) -> Result<()> {
    let relative = entrypoint.relative_command.join("/");
    // The A2A producer permits bounded Unicode path segments, while the
    // committed S04 release inventory is deliberately ASCII. S13/S64 release
    // composition must reject an otherwise valid Unicode capsule; S06 keeps
    // that mismatch fail-closed rather than silently widening S04.
    validate_portable_path(&format!("capsule.entrypoints.{field}"), &relative)?;
    let record = records
        .iter()
        .find(|record| record.path == relative)
        .ok_or_else(|| {
            ManifestError::MissingFile(format!(
                "{field} entrypoint {relative} is absent from A2A tree evidence"
            ))
        })?;
    expect_literal(
        &format!("capsule.entrypoints.{field} mode"),
        "0755",
        &record.mode,
    )?;
    let installed = format!("{trusted_capsule_root}/{relative}");
    let actual = observed_file(observed, &installed)?;
    if let Some(mode) = actual.normalized_mode {
        expect_literal(
            &format!("capsule.entrypoints.{field} installed mode"),
            "0755",
            mode,
        )?;
    }
    Ok(())
}

fn property_map<'a>(
    field: &str,
    properties: &'a [InventoryProperty],
    expected: usize,
) -> Result<BTreeMap<&'a str, &'a str>> {
    if properties.len() != expected {
        return invalid(
            field,
            &format!("must contain exactly {expected} properties"),
        );
    }
    let mut values = BTreeMap::new();
    for property in properties {
        require_bounded_text(field, &property.name, 1, 128)?;
        require_bounded_text(field, &property.value, 1, 4096)?;
        if values
            .insert(property.name.as_str(), property.value.as_str())
            .is_some()
        {
            return invalid(field, "duplicate property name");
        }
    }
    Ok(values)
}

fn required_property<'a>(properties: &'a BTreeMap<&str, &str>, name: &str) -> Result<&'a str> {
    properties
        .get(name)
        .copied()
        .ok_or_else(|| ManifestError::InvalidField {
            field: "tree_evidence.properties".to_string(),
            detail: format!("missing {name}"),
        })
}

fn tree_digest(records: &[ValidatedTreeRecord]) -> Result<String> {
    let canonical: Vec<TreeDigestRecord<'_>> = records
        .iter()
        .map(|record| TreeDigestRecord {
            mode: &record.mode,
            path: &record.path,
            sha256: &record.digest,
            size: &record.size_text,
        })
        .collect();
    // This exactly matches A2A `deterministic_tree_digest`: validated records
    // sorted by path, lexicographic object keys, compact UTF-8 JSON, one LF.
    // S04's schema prose names canonical evidence but should later codify this
    // preimage mechanically; this consumer follows the current producer.
    let mut bytes =
        serde_json::to_vec(&canonical).map_err(|error| ManifestError::Parse(error.to_string()))?;
    bytes.push(b'\n');
    Ok(sha256_hex(&bytes))
}

// ---------------------------------------------------------------------------
// Closed scalar and path validators
// ---------------------------------------------------------------------------

fn require_input_bound(field: &str, found: usize, limit: u64) -> Result<()> {
    if found as u64 > limit {
        Err(ManifestError::InputTooLarge {
            field: field.to_string(),
            limit,
            found: found as u64,
        })
    } else {
        Ok(())
    }
}

fn invalid<T>(field: &str, detail: &str) -> Result<T> {
    Err(ManifestError::InvalidField {
        field: field.to_string(),
        detail: detail.to_string(),
    })
}

fn expect_literal(field: &str, expected: &str, found: &str) -> Result<()> {
    if expected == found {
        Ok(())
    } else {
        Err(ManifestError::IdentityMismatch {
            detail: format!("{field}: expected {expected:?}, found {found:?}"),
        })
    }
}

fn expect_digest(field: &str, expected: &str, found: &str) -> Result<()> {
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

fn require_digest(field: &str, value: &str) -> Result<()> {
    if value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        Ok(())
    } else {
        Err(ManifestError::MalformedDigest {
            field: field.to_string(),
            value: value.to_string(),
        })
    }
}

fn require_commit(field: &str, value: &str) -> Result<()> {
    if value.len() == 40
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        Ok(())
    } else {
        Err(ManifestError::UnpinnedCommit {
            field: field.to_string(),
            value: value.to_string(),
        })
    }
}

fn require_exact_version(field: &str, value: &str) -> Result<()> {
    require_numeric_version(field, value, 2, 3)
}

fn require_numeric_version(
    field: &str,
    value: &str,
    minimum_parts: usize,
    maximum_parts: usize,
) -> Result<()> {
    if value.len() > 128 {
        return invalid(field, "version exceeds 128 bytes");
    }
    let parts: Vec<&str> = value.split('.').collect();
    if !(minimum_parts..=maximum_parts).contains(&parts.len())
        || parts
            .iter()
            .any(|part| part.is_empty() || !part.bytes().all(|byte| byte.is_ascii_digit()))
    {
        return Err(ManifestError::FloatingSelector {
            field: field.to_string(),
            value: value.to_string(),
        });
    }
    Ok(())
}

fn version_prefix(value: &str, parts: usize) -> Result<String> {
    require_exact_version("trusted runtime version", value)?;
    let components: Vec<&str> = value.split('.').collect();
    if components.len() < parts {
        return invalid(
            "trusted runtime version",
            "not enough numeric version components",
        );
    }
    Ok(components[..parts].join("."))
}

fn require_identity(field: &str, value: &str) -> Result<()> {
    let bytes = value.as_bytes();
    let valid = !bytes.is_empty()
        && bytes.len() <= 128
        && bytes[0].is_ascii_alphanumeric()
        && bytes[bytes.len() - 1].is_ascii_alphanumeric()
        && bytes
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'));
    if valid {
        Ok(())
    } else {
        invalid(
            field,
            "must match the bounded non-path identity-token grammar",
        )
    }
}

fn require_bounded_text(field: &str, value: &str, minimum: usize, maximum: usize) -> Result<()> {
    let length = value.len();
    if length < minimum
        || length > maximum
        || value
            .chars()
            .any(|character| character == '\0' || character.is_control())
    {
        invalid(
            field,
            &format!("must be {minimum}..={maximum} UTF-8 bytes without controls"),
        )
    } else {
        Ok(())
    }
}

fn require_target_roster(field: &str, targets: &[Target]) -> Result<()> {
    if targets == TARGETS {
        Ok(())
    } else {
        invalid(field, "must equal the canonical ordered five-target roster")
    }
}

fn require_gateway_range(field: &str, range: &RangeBounds) -> Result<()> {
    if range.minimum == "v1" && range.maximum == "v1" {
        Ok(())
    } else {
        invalid(field, "only the closed v1..v1 gateway range is supported")
    }
}

fn require_migration(field: &str, value: &str) -> Result<()> {
    let lower = value.to_ascii_lowercase();
    if value.is_empty()
        || value.len() > 64
        || matches!(lower.as_str(), "head" | "heads" | "base" | "latest" | "x")
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b'-'))
        || !value.as_bytes()[0].is_ascii_alphanumeric()
    {
        return Err(ManifestError::FloatingSelector {
            field: field.to_string(),
            value: value.to_string(),
        });
    }
    Ok(())
}

fn validate_portable_path(field: &str, path: &str) -> Result<()> {
    if path.is_empty() || path.len() > 4096 || path.contains('\\') || path.contains(':') {
        return invalid(field, "path must be a bounded relative slash path");
    }
    let segments: Vec<&str> = path.split('/').collect();
    if segments.is_empty() || segments.len() > 32 {
        return invalid(field, "path must contain 1..=32 segments");
    }
    for segment in segments {
        validate_portable_segment(field, segment, true)?;
    }
    Ok(())
}

fn validate_portable_segment(field: &str, segment: &str, ascii_release_path: bool) -> Result<()> {
    let invalid_character = if ascii_release_path {
        segment.bytes().any(|byte| {
            !(byte.is_ascii_alphanumeric() || matches!(byte, b'@' | b'_' | b'+' | b'.' | b'-'))
        })
    } else {
        segment.chars().any(|character| {
            character.is_control()
                || matches!(
                    character,
                    '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
                )
        })
    };
    if segment.is_empty()
        || segment.len() > 128
        || matches!(segment, "." | "..")
        || segment.ends_with('.')
        || segment.ends_with(' ')
        || invalid_character
        || is_windows_reserved(segment)
    {
        return invalid(field, &format!("unsafe portable path segment {segment:?}"));
    }
    Ok(())
}

fn is_windows_reserved(segment: &str) -> bool {
    let stem = segment
        .split('.')
        .next()
        .unwrap_or(segment)
        .to_ascii_lowercase();
    if matches!(
        stem.as_str(),
        "con" | "conin$" | "conout$" | "prn" | "aux" | "nul"
    ) {
        return true;
    }
    let mut characters = stem.chars();
    let prefix: String = characters.by_ref().take(3).collect();
    let suffix: String = characters.collect();
    matches!(prefix.as_str(), "com" | "lpt")
        && matches!(
            suffix.as_str(),
            "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "¹" | "²" | "³"
        )
}

fn semantic_path_key(path: &str) -> String {
    path.to_ascii_lowercase()
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generation::{DiscardOutcome, LockedProduct};
    use crate::locking::{Actor, InstallLock, InstallLockGuard};
    use crate::paths::ProductPaths;

    const LOCK_BYTES: &[u8] = include_bytes!("../../../../packaging/a2a-component.lock.json");
    const TARGET: Target = Target::X86_64PcWindowsMsvc;

    struct Fixture {
        paths: ProductPaths,
        guard: InstallLockGuard,
        payloads: Vec<(String, Vec<u8>)>,
        entrypoint_mode: String,
        member: Vec<u8>,
        descriptor: Vec<u8>,
        member_digest: String,
        cohort_digest: String,
        lock_digest: String,
        _temp: tempfile::TempDir,
    }

    impl Fixture {
        fn new() -> Self {
            Self::with_entrypoint_mode("0755")
        }

        fn with_entrypoint_mode(entrypoint_mode: &str) -> Self {
            let temp = tempfile::tempdir().expect("real temporary product home");
            let paths = ProductPaths::under_app_home(temp.path());
            paths.ensure().unwrap();
            for path in [
                paths.root().to_path_buf(),
                paths.generations_dir(),
                paths.app_home(),
            ] {
                restrict_test_directory(&path);
            }
            let guard = InstallLock::new(paths.install_lock_path())
                .acquire(Actor::Installer, "manifest-verification")
                .unwrap()
                .unwrap();
            let lock = ComponentLock::parse(std::str::from_utf8(LOCK_BYTES).unwrap()).unwrap();
            let dashboard = b"dashboard-binary".to_vec();
            let updater = b"external-updater".to_vec();
            let archive = b"real-capsule-archive".to_vec();
            let license = b"MIT license evidence".to_vec();
            let sbom = b"{\"bomFormat\":\"CycloneDX\"}\n".to_vec();
            let tree_file = b"capsule-runtime-file".to_vec();
            let gateway_file = b"gateway-entrypoint".to_vec();
            let standalone_file = b"standalone-mcp-entrypoint".to_vec();
            let capsule_value = serde_json::json!({
                "contract_version": "2.0",
                "identity": {"name": lock.a2a_source.release_identity.name, "version": lock.a2a_source.release_identity.version},
                "target": TARGET.triple(),
                "compatibility": {
                    "api_versions": {"minimum": "v1", "maximum": "v1"},
                    "migration_range": {"base": "0001", "head": "0008"}
                },
                "consistency_group": {"stores": [
                    {"kind": "primary-database", "derivable": false, "schema_authority": "alembic-migration-range", "schema_version": "0008"},
                    {"kind": "checkpoint-database", "derivable": false, "schema_authority": "checkpointer-schema", "schema_version": "1.0.0"}
                ]},
                "entrypoints": {
                    "gateway": {"kind": "gateway", "console_script": "vaultspec-a2a", "reference": "vaultspec_a2a.cli:main", "relative_command": ["bin", "vaultspec-a2a"]},
                    "standalone_mcp": {"kind": "standalone-mcp", "console_script": "vaultspec-a2a-mcp", "reference": "vaultspec_a2a.mcp:main", "relative_command": ["bin", "vaultspec-a2a-mcp"]}
                },
                "digest_algorithm": "sha256",
                "assets": [
                    {"kind": "python-runtime", "version": "3.13", "license": lock.base_closure.python.license, "digest": lock.python_digest(TARGET).unwrap()},
                    {"kind": "a2a-distribution", "version": lock.a2a_source.release_identity.version, "license": "MIT", "digest": "1".repeat(64)},
                    {"kind": "node-runtime", "version": "22", "license": lock.base_closure.node.license, "digest": lock.node_digest(TARGET).unwrap()},
                    {"kind": "acp-adapter", "version": lock.base_closure.acp.version, "license": lock.base_closure.acp.license, "digest": lock.base_closure.acp.sha256}
                ],
                "dependency_lock": {"uv_lock_digest": "2".repeat(64), "package_lock_digest": "3".repeat(64)}
            });
            let capsule = serde_json::to_vec(&capsule_value).unwrap();
            let capsule_digest = sha256_hex(&capsule);
            let mut tree_records = vec![
                ValidatedTreeRecord {
                    path: "bin/vaultspec-a2a".to_string(),
                    mode: entrypoint_mode.to_string(),
                    size: gateway_file.len() as u64,
                    size_text: gateway_file.len().to_string(),
                    digest: sha256_hex(&gateway_file),
                },
                ValidatedTreeRecord {
                    path: "bin/vaultspec-a2a-mcp".to_string(),
                    mode: entrypoint_mode.to_string(),
                    size: standalone_file.len() as u64,
                    size_text: standalone_file.len().to_string(),
                    digest: sha256_hex(&standalone_file),
                },
                ValidatedTreeRecord {
                    path: "runtime/tool".to_string(),
                    mode: "0644".to_string(),
                    size: tree_file.len() as u64,
                    size_text: tree_file.len().to_string(),
                    digest: sha256_hex(&tree_file),
                },
            ];
            tree_records.sort_by(|left, right| left.path.cmp(&right.path));
            let tree_digest_value = tree_digest(&tree_records).unwrap();
            let tree_value = serde_json::json!({
                "inventory_version": "vaultspec-installed-tree-v1",
                "metadata": {
                    "timestamp": "2026-07-19T00:00:00Z",
                    "component": {
                        "type": "application",
                        "name": "vaultspec-a2a",
                        "version": "0.1.0",
                        "properties": [
                            {"name": "vaultspec:target", "value": TARGET.triple()},
                            {"name": "vaultspec:component-manifest-sha256", "value": capsule_digest}
                        ]
                    }
                },
                "components": [
                    {
                        "type": "file",
                        "name": "bin/vaultspec-a2a",
                        "hashes": [{"alg": "SHA-256", "content": sha256_hex(&gateway_file)}],
                        "properties": [
                            {"name": "vaultspec:file-mode", "value": entrypoint_mode},
                            {"name": "vaultspec:file-size", "value": gateway_file.len().to_string()}
                        ]
                    },
                    {
                        "type": "file",
                        "name": "bin/vaultspec-a2a-mcp",
                        "hashes": [{"alg": "SHA-256", "content": sha256_hex(&standalone_file)}],
                        "properties": [
                            {"name": "vaultspec:file-mode", "value": entrypoint_mode},
                            {"name": "vaultspec:file-size", "value": standalone_file.len().to_string()}
                        ]
                    },
                    {
                        "type": "file",
                        "name": "runtime/tool",
                        "hashes": [{"alg": "SHA-256", "content": sha256_hex(&tree_file)}],
                        "properties": [
                            {"name": "vaultspec:file-mode", "value": "0644"},
                            {"name": "vaultspec:file-size", "value": tree_file.len().to_string()}
                        ]
                    }
                ]
            });
            let mut tree = serde_json::to_vec(&tree_value).unwrap();
            tree.push(b'\n');
            let payloads: Vec<(String, Vec<u8>)> = vec![
                (COMPONENT_LOCK_PATH.to_string(), LOCK_BYTES.to_vec()),
                ("bin/dashboard.exe".to_string(), dashboard),
                ("bin/updater.exe".to_string(), updater),
                ("a2a/component-manifest.json".to_string(), capsule),
                ("a2a/capsule.zip".to_string(), archive),
                ("a2a/capsule/bin/vaultspec-a2a".to_string(), gateway_file),
                (
                    "a2a/capsule/bin/vaultspec-a2a-mcp".to_string(),
                    standalone_file,
                ),
                ("a2a/capsule/runtime/tool".to_string(), tree_file),
                ("a2a/tree.json".to_string(), tree),
                ("licenses/a2a.txt".to_string(), license),
                ("sbom.cdx.json".to_string(), sbom),
            ];
            let mut digests = serde_json::Map::new();
            let mut sizes = BTreeMap::new();
            for (path, bytes) in &payloads {
                digests.insert(path.clone(), serde_json::Value::String(sha256_hex(bytes)));
                sizes.insert(path.clone(), bytes.len() as u64);
            }
            let lock_digest = sha256_hex(LOCK_BYTES);
            let release = serde_json::json!({
                "schema_version": "2.0",
                "target": TARGET.triple(),
                "digest_algorithm": "sha256",
                "cohort": {"id": "release-2026.07.19", "targets": TARGETS.map(Target::triple)},
                "release_manifest": {"path": "release.json", "binding_mode": "external-cohort-and-receipt"},
                "dashboard": {"version": "0.1.4", "commit": "a".repeat(40), "path": "bin/dashboard.exe", "size": sizes["bin/dashboard.exe"], "digest": digests["bin/dashboard.exe"]},
                "updater": {"version": "0.1.4", "path": "bin/updater.exe", "size": sizes["bin/updater.exe"], "digest": digests["bin/updater.exe"]},
                "a2a_component": {
                    "commit": lock.a2a_source.commit,
                    "release_identity": lock.a2a_source.release_identity,
                    "component_lock": {"path": COMPONENT_LOCK_PATH, "digest": lock_digest},
                    "capsule_manifest": {"path": "a2a/component-manifest.json", "digest": digests["a2a/component-manifest.json"]},
                    "capsule_archive": {"path": "a2a/capsule.zip", "size": sizes["a2a/capsule.zip"], "digest": digests["a2a/capsule.zip"]},
                    "tree_evidence": {"path": "a2a/tree.json", "size": sizes["a2a/tree.json"], "digest": digests["a2a/tree.json"], "tree_digest": tree_digest_value, "file_count": 3}
                },
                "runtimes": {
                    "cpython": {"version": lock.base_closure.python.version, "license": lock.base_closure.python.license, "digest": lock.python_digest(TARGET).unwrap()},
                    "node": {"version": lock.base_closure.node.version, "license": lock.base_closure.node.license, "digest": lock.node_digest(TARGET).unwrap()},
                    "acp": {"version": lock.base_closure.acp.version, "license": lock.base_closure.acp.license, "digest": lock.base_closure.acp.sha256}
                },
                "protocol": {"gateway_api_version_range": {"minimum": "v1", "maximum": "v1"}},
                "state_schema": {"migration_range": {"minimum": "0001", "maximum": "0008"}},
                "licenses": [{"component": "vaultspec-a2a", "spdx": "MIT", "path": "licenses/a2a.txt", "digest": digests["licenses/a2a.txt"]}],
                "sbom": {"format": "cyclonedx", "path": "sbom.cdx.json", "size": sizes["sbom.cdx.json"], "digest": digests["sbom.cdx.json"]},
                "file_digests": serde_json::Value::Object(digests)
            });
            let member = serde_json::to_vec(&release).unwrap();
            let member_digest = sha256_hex(&member);
            let descriptor = cohort_bytes(&member_digest);
            let cohort_digest = cohort_descriptor_digest(&descriptor).unwrap();
            Self {
                paths,
                guard,
                payloads,
                entrypoint_mode: entrypoint_mode.to_string(),
                member,
                descriptor,
                member_digest,
                cohort_digest,
                lock_digest,
                _temp: temp,
            }
        }

        fn populate(&self, root: &Path) {
            for (path, bytes) in &self.payloads {
                write_file(root, path, bytes);
            }
            write_file(root, "release.json", &self.member);
            set_mode(
                &root.join("a2a/capsule/bin/vaultspec-a2a"),
                &self.entrypoint_mode,
            );
            set_mode(
                &root.join("a2a/capsule/bin/vaultspec-a2a-mcp"),
                &self.entrypoint_mode,
            );
        }

        fn with_generation<R>(
            &self,
            action: impl FnOnce(&UnpublishedGeneration<'_, '_>) -> R,
        ) -> R {
            let mut product = LockedProduct::bind(self.paths.clone(), &self.guard).unwrap();
            let generation = product.create_unpublished("generation-1").unwrap();
            self.populate(generation.path());
            action(&generation)
        }

        fn with_owned_generation<R>(
            &self,
            action: impl FnOnce(UnpublishedGeneration<'_, '_>) -> R,
        ) -> R {
            let mut product = LockedProduct::bind(self.paths.clone(), &self.guard).unwrap();
            let generation = product.create_unpublished("generation-1").unwrap();
            self.populate(generation.path());
            action(generation)
        }

        fn verify<'generation, 'product, 'lock>(
            &self,
            generation: &'generation UnpublishedGeneration<'product, 'lock>,
        ) -> Result<VerifiedReleaseSet<'generation, 'product, 'lock>> {
            self.verify_with(
                generation,
                self.member_digest.clone(),
                valid_receipt_context(),
            )
        }

        fn verify_with<'generation, 'product, 'lock>(
            &self,
            generation: &'generation UnpublishedGeneration<'product, 'lock>,
            expected_member_manifest_digest: String,
            receipt_context: ReceiptActivationContext,
        ) -> Result<VerifiedReleaseSet<'generation, 'product, 'lock>> {
            let authority = TrustedReleaseAuthority {
                expected_target: TARGET,
                expected_member_manifest_digest,
                expected_cohort_digest: self.cohort_digest.clone(),
                trusted_component_lock_bytes: LOCK_BYTES.to_vec(),
                trusted_component_lock_path: COMPONENT_LOCK_PATH.to_string(),
                expected_component_lock_digest: self.lock_digest.clone(),
                trusted_capsule_root: "a2a/capsule".to_string(),
            };
            VerifiedReleaseSet::verify(
                generation,
                ReleaseVerificationInput {
                    authority: &authority,
                    cohort_descriptor_bytes: &self.descriptor,
                },
                receipt_context,
            )
        }

        fn verify_result(&self) -> Result<()> {
            self.with_generation(|generation| self.verify(generation).map(|_| ()))
        }

        fn payload(&self, path: &str) -> &[u8] {
            self.payloads
                .iter()
                .find_map(|(candidate, bytes)| (candidate == path).then_some(bytes.as_slice()))
                .unwrap()
        }

        fn mutate_member(&mut self, mutate: impl FnOnce(&mut serde_json::Value)) {
            let mut value: serde_json::Value = serde_json::from_slice(&self.member).unwrap();
            mutate(&mut value);
            self.member = serde_json::to_vec(&value).unwrap();
            self.member_digest = sha256_hex(&self.member);
            self.descriptor = cohort_bytes(&self.member_digest);
            self.cohort_digest = cohort_descriptor_digest(&self.descriptor).unwrap();
        }
    }

    fn valid_receipt_context() -> ReceiptActivationContext {
        ReceiptActivationContext {
            channel: Channel::SelfInstall,
            bootstrap_created_ownership: true,
            prior_seat: Some(PriorSeatIdentity {
                generation: "generation-prior".to_string(),
                dashboard_version: "0.1.3".to_string(),
                pid: Some(42),
            }),
            consistency_generation: 7,
            created_ms: 1_721_344_500_000,
        }
    }

    fn restrict_test_directory(path: &Path) {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700)).unwrap();
        }
        #[cfg(windows)]
        {
            let whoami = std::process::Command::new("whoami.exe").output().unwrap();
            assert!(whoami.status.success());
            let user = String::from_utf8(whoami.stdout).unwrap();
            let user_grant = format!("{}:(OI)(CI)F", user.trim());
            let output = std::process::Command::new("icacls.exe")
                .arg(path)
                .args(["/remove:g", "*S-1-5-32-545"])
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "icacls peer removal failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );
            let output = std::process::Command::new("icacls.exe")
                .arg(path)
                .args([
                    "/inheritance:r",
                    "/grant:r",
                    &user_grant,
                    "/grant",
                    "*S-1-5-18:(OI)(CI)F",
                    "/grant",
                    "*S-1-5-32-544:(OI)(CI)F",
                ])
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "icacls restriction failed: {}",
                String::from_utf8_lossy(&output.stderr)
            );
        }
    }

    #[cfg(windows)]
    fn permit_test_peer(path: &Path) {
        let output = std::process::Command::new("icacls.exe")
            .arg(path)
            .args(["/grant", "*S-1-5-32-545:RX"])
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "icacls peer grant failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    #[cfg(windows)]
    fn remove_test_peer(path: &Path) {
        let output = std::process::Command::new("icacls.exe")
            .arg(path)
            .args(["/remove:g", "*S-1-5-32-545"])
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "icacls peer removal failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    fn write_file(root: &Path, relative: &str, bytes: &[u8]) {
        let path = root.join(relative.replace('/', std::path::MAIN_SEPARATOR_STR));
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, bytes).unwrap();
    }

    fn clear_generation_contents(root: &Path) {
        for entry in std::fs::read_dir(root).unwrap() {
            let path = entry.unwrap().path();
            if path.is_dir() {
                clear_generation_contents(&path);
                std::fs::remove_dir(path).unwrap();
            } else {
                std::fs::remove_file(path).unwrap();
            }
        }
    }

    #[cfg(unix)]
    fn set_mode(path: &Path, mode: &str) {
        use std::os::unix::fs::PermissionsExt;
        let bits = if mode == "0755" { 0o755 } else { 0o644 };
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(bits)).unwrap();
    }

    #[cfg(not(unix))]
    fn set_mode(_path: &Path, _mode: &str) {}

    fn cohort_bytes(member_digest: &str) -> Vec<u8> {
        let digests = ["4", "5", "6", "7"];
        let mut members = Vec::new();
        for (index, target) in TARGETS.into_iter().enumerate() {
            let digest = if target == TARGET {
                member_digest.to_string()
            } else {
                digests[index].repeat(64)
            };
            members.push(serde_json::json!({
                "target": target.triple(),
                "member_manifest_digest": digest
            }));
        }
        serde_json::to_vec(&serde_json::json!({
            "schema_version": "1.0",
            "id": "release-2026.07.19",
            "digest_algorithm": "sha256",
            "members": members
        }))
        .unwrap()
    }

    #[test]
    fn complete_real_generation_constructs_verified_authority() {
        let fixture = Fixture::new();
        fixture.with_generation(|generation| {
            let verified = fixture
                .verify(generation)
                .expect("complete generation verifies");
            assert_eq!(verified.target(), TARGET);
            assert_eq!(verified.release_set_id(), "release-2026.07.19");
            assert_eq!(verified.generation_id(), generation.generation());
            assert_eq!(verified.member_manifest_digest(), fixture.member_digest);
            assert_eq!(verified.component_lock_digest(), fixture.lock_digest);
            assert_eq!(verified.cohort_digest(), fixture.cohort_digest);
            assert_eq!(verified.dashboard_version(), "0.1.4");
            assert_eq!(verified.dashboard_commit(), "a".repeat(40));
            assert_eq!(
                verified.dashboard_digest(),
                sha256_hex(fixture.payload("bin/dashboard.exe"))
            );
            assert_eq!(verified.capsule_manifest().contract_version, "2.0");
            let facts = verified.receipt_facts();
            assert_eq!(facts.dashboard_version(), "0.1.4");
            assert_eq!(facts.dashboard_commit(), "a".repeat(40));
            assert_eq!(facts.dashboard_digest(), verified.dashboard_digest());
            assert_eq!(facts.release_set_identity(), "release-2026.07.19");
            assert_eq!(facts.release_set_member_digest(), fixture.member_digest);
            assert_eq!(facts.component_lock_digest(), fixture.lock_digest);
            assert_eq!(
                facts.external_five_member_cohort_digest(),
                fixture.cohort_digest
            );
            assert_eq!(facts.target(), TARGET);
            assert_eq!(facts.a2a_identity(), verified.a2a_identity());
            assert_eq!(facts.active_generation(), generation.generation());
            assert_eq!(facts.channel(), Channel::SelfInstall);
            assert!(facts.bootstrap_created_ownership());
            assert_eq!(facts.prior_seat().unwrap().generation, "generation-prior");
            assert_eq!(facts.consistency_generation(), 7);
            assert_eq!(facts.created_ms(), 1_721_344_500_000);
        });
    }

    #[test]
    fn missing_extra_and_same_size_wrong_bytes_are_rejected() {
        let fixture = Fixture::new();
        fixture.with_generation(|generation| {
            std::fs::remove_file(generation.path().join("bin/dashboard.exe")).unwrap();
            assert!(matches!(
                fixture.verify(generation),
                Err(ManifestError::MissingFile(_)) | Err(ManifestError::Io { .. })
            ));
        });

        let fixture = Fixture::new();
        fixture.with_generation(|generation| {
            write_file(generation.path(), "undeclared.bin", b"extra");
            assert!(matches!(
                fixture.verify(generation),
                Err(ManifestError::ExtraFile(_))
            ));
        });

        let mut fixture = Fixture::new();
        let unrecorded_tree_file = b"declared release file but absent A2A tree evidence";
        fixture.mutate_member(|member| {
            member["file_digests"]["a2a/capsule/unrecorded"] =
                serde_json::json!(sha256_hex(unrecorded_tree_file));
        });
        fixture.with_generation(|generation| {
            write_file(
                generation.path(),
                "a2a/capsule/unrecorded",
                unrecorded_tree_file,
            );
            assert!(matches!(
                fixture.verify(generation),
                Err(ManifestError::ExtraFile(_))
            ));
        });

        let fixture = Fixture::new();
        fixture.with_generation(|generation| {
            write_file(generation.path(), "bin/dashboard.exe", b"xxxxxxxxxxxxxxxx");
            assert!(matches!(
                fixture.verify(generation),
                Err(ManifestError::DigestDrift { .. })
            ));
        });
    }

    #[test]
    fn symlink_payload_is_rejected_before_hashing() {
        let fixture = Fixture::new();
        fixture.with_generation(|generation| {
            let link = generation.path().join("bin/dashboard.exe");
            std::fs::remove_file(&link).unwrap();
            let target = generation.path().join("bin/updater.exe");
            #[cfg(unix)]
            std::os::unix::fs::symlink(&target, &link).unwrap();
            #[cfg(windows)]
            std::os::windows::fs::symlink_file(&target, &link).unwrap();
            assert!(matches!(
                fixture.verify(generation),
                Err(ManifestError::UnsafeFileType { .. })
            ));
        });
    }

    #[test]
    fn both_entrypoints_require_real_tree_evidence_and_executable_mode() {
        let fixture = Fixture::new();
        fixture.with_generation(|generation| {
            std::fs::remove_file(generation.path().join("a2a/capsule/bin/vaultspec-a2a")).unwrap();
            assert!(fixture.verify(generation).is_err());
        });

        let fixture = Fixture::new();
        fixture.with_generation(|generation| {
            std::fs::remove_file(generation.path().join("a2a/capsule/bin/vaultspec-a2a-mcp"))
                .unwrap();
            assert!(fixture.verify(generation).is_err());
        });

        let fixture = Fixture::with_entrypoint_mode("0644");
        assert!(matches!(
            fixture.verify_result(),
            Err(ManifestError::IdentityMismatch { .. })
        ));
    }

    #[test]
    fn bounded_reread_and_final_snapshot_detect_real_file_drift() {
        let fixture = Fixture::new();
        fixture.with_generation(|generation| {
            let initial = scan_generation(generation.path(), Some("release.json")).unwrap();
            let relative = "a2a/component-manifest.json";
            let path = generation.path().join(relative);
            let original = std::fs::read(&path).unwrap();
            let replacement = vec![b'x'; original.len()];
            std::fs::write(&path, replacement).unwrap();
            assert!(matches!(
                read_installed_bounded(
                    generation.path(),
                    relative,
                    MAX_CAPSULE_MANIFEST_BYTES,
                    observed_file(&initial.files, relative).unwrap(),
                ),
                Err(ManifestError::GenerationChanged { .. })
            ));
            let final_snapshot = scan_generation(generation.path(), Some("release.json")).unwrap();
            assert!(matches!(
                require_unchanged_snapshot(&initial, &final_snapshot),
                Err(ManifestError::GenerationChanged { .. })
            ));
        });

        let fixture = Fixture::new();
        fixture.with_generation(|generation| {
            let initial = scan_generation(generation.path(), Some("release.json")).unwrap();
            let relative = "a2a/component-manifest.json";
            let initial_file = observed_file(&initial.files, relative).unwrap();
            let path = generation.path().join(relative);
            let mut append = std::fs::OpenOptions::new().append(true).open(path).unwrap();
            use std::io::Write;
            append.write_all(b"growth").unwrap();
            assert!(matches!(
                read_installed_bounded(
                    generation.path(),
                    relative,
                    initial_file.size,
                    initial_file,
                ),
                Err(ManifestError::InputTooLarge { .. })
            ));
        });
    }

    #[test]
    fn trusted_digest_uniquely_locates_member_and_rejects_declared_path_mismatch() {
        let fixture = Fixture::new();
        fixture.with_generation(|generation| {
            assert!(matches!(
                fixture.verify_with(generation, "f".repeat(64), valid_receipt_context()),
                Err(ManifestError::MissingFile(_))
            ));
        });

        let fixture = Fixture::new();
        fixture.with_generation(|generation| {
            write_file(generation.path(), "release-copy.json", &fixture.member);
            assert!(matches!(
                fixture.verify(generation),
                Err(ManifestError::InvalidField { field, .. })
                    if field == "release member manifest"
            ));
        });

        let mut fixture = Fixture::new();
        fixture.mutate_member(|member| {
            member["release_manifest"]["path"] = serde_json::json!("different.json");
        });
        assert!(matches!(
            fixture.verify_result(),
            Err(ManifestError::IdentityMismatch { .. })
        ));
    }

    #[test]
    fn invalid_receipt_context_is_rejected_before_release_authority() {
        let fixture = Fixture::new();
        fixture.with_generation(|generation| {
            let mut nonpositive_time = valid_receipt_context();
            nonpositive_time.created_ms = 0;
            assert!(matches!(
                fixture.verify_with(
                    generation,
                    fixture.member_digest.clone(),
                    nonpositive_time
                ),
                Err(ManifestError::InvalidField { field, .. }) if field == "receipt.created_ms"
            ));

            let mut zero_pid = valid_receipt_context();
            zero_pid.prior_seat.as_mut().unwrap().pid = Some(0);
            assert!(matches!(
                fixture.verify_with(generation, fixture.member_digest.clone(), zero_pid),
                Err(ManifestError::InvalidField { field, .. }) if field == "receipt.prior_seat.pid"
            ));

            let mut bad_generation = valid_receipt_context();
            bad_generation.prior_seat.as_mut().unwrap().generation = "not valid".to_string();
            assert!(matches!(
                fixture.verify_with(
                    generation,
                    fixture.member_digest.clone(),
                    bad_generation
                ),
                Err(ManifestError::InvalidField { field, .. })
                    if field == "receipt.prior_seat.generation"
            ));

            let mut bad_version = valid_receipt_context();
            bad_version.prior_seat.as_mut().unwrap().dashboard_version = "latest".to_string();
            assert!(matches!(
                fixture.verify_with(generation, fixture.member_digest.clone(), bad_version),
                Err(ManifestError::FloatingSelector { field, .. })
                    if field == "receipt.prior_seat.dashboard_version"
            ));
        });
    }

    #[test]
    fn hard_link_aliases_are_rejected_from_same_handle_observations() {
        let fixture = Fixture::new();
        fixture.with_generation(|generation| {
            let dashboard = generation.path().join("bin/dashboard.exe");
            let external_alias = fixture.paths.root().join("external-dashboard-alias");
            match std::fs::hard_link(&dashboard, &external_alias) {
                Ok(()) => assert!(matches!(
                    fixture.verify(generation),
                    Err(ManifestError::UnsafeFileType { .. })
                )),
                #[cfg(windows)]
                Err(error) => assert!(matches!(error.raw_os_error(), Some(5 | 32))),
                #[cfg(unix)]
                Err(error) => panic!("real external hard link failed: {error}"),
            }
        });

        let fixture = Fixture::new();
        fixture.with_generation(|generation| {
            let dashboard = generation.path().join("bin/dashboard.exe");
            let in_tree_alias = generation.path().join("bin/dashboard-alias.exe");
            match std::fs::hard_link(dashboard, in_tree_alias) {
                Ok(()) => assert!(matches!(
                    fixture.verify(generation),
                    Err(ManifestError::UnsafeFileType { .. })
                )),
                #[cfg(windows)]
                Err(error) => assert!(matches!(error.raw_os_error(), Some(5 | 32))),
                #[cfg(unix)]
                Err(error) => panic!("real in-tree hard link failed: {error}"),
            }
        });
    }

    #[test]
    fn activation_revalidation_rejects_payload_manifest_and_same_byte_identity_drift() {
        let fixture = Fixture::new();
        fixture.with_generation(|generation| {
            let verified = fixture.verify(generation).unwrap();
            write_file(generation.path(), "bin/dashboard.exe", b"xxxxxxxxxxxxxxxx");
            assert!(matches!(
                verified.revalidate_for_activation(),
                Err(ManifestError::GenerationChanged { .. })
            ));
        });

        let fixture = Fixture::new();
        fixture.with_generation(|generation| {
            let verified = fixture.verify(generation).unwrap();
            let release = generation.path().join("release.json");
            let mut bytes = std::fs::read(&release).unwrap();
            bytes.push(b'\n');
            std::fs::write(release, bytes).unwrap();
            assert!(matches!(
                verified.revalidate_for_activation(),
                Err(ManifestError::GenerationChanged { .. })
            ));
        });

        let fixture = Fixture::new();
        fixture.with_generation(|generation| {
            let verified = fixture.verify(generation).unwrap();
            let path = generation.path().join("bin/dashboard.exe");
            let old = generation.path().join("bin/dashboard.old");
            let bytes = std::fs::read(&path).unwrap();
            std::fs::rename(&path, &old).unwrap();
            std::fs::write(&path, &bytes).unwrap();
            set_mode(&path, "0644");
            std::fs::remove_file(old).unwrap();
            assert!(matches!(
                verified.revalidate_for_activation(),
                Err(ManifestError::GenerationChanged { .. })
            ));
        });
    }

    #[test]
    fn retained_generation_substitution_is_detected_or_denied_by_platform_authority() {
        let fixture = Fixture::new();
        fixture.with_generation(|generation| {
            let verified = fixture.verify(generation).unwrap();
            assert_eq!(verified.generation_id(), generation.generation());
            let path = generation.path().to_path_buf();
            let moved = fixture.paths.generations_dir().join("generation-1-moved");
            #[cfg(unix)]
            {
                std::fs::rename(&path, &moved).unwrap();
                std::fs::create_dir(&path).unwrap();
                restrict_test_directory(&path);
                assert!(matches!(
                    verified.revalidate_for_activation(),
                    Err(ManifestError::GenerationAuthority(_))
                ));
            }
            #[cfg(windows)]
            {
                assert!(std::fs::rename(&path, &moved).is_err());
                clear_generation_contents(&path);
                assert!(std::fs::remove_dir(&path).is_err());
            }
        });
    }

    #[test]
    fn permission_and_child_acl_drift_fail_closed() {
        let fixture = Fixture::new();
        fixture.with_generation(|generation| {
            let verified = fixture.verify(generation).unwrap();
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                std::fs::set_permissions(generation.path(), std::fs::Permissions::from_mode(0o770))
                    .unwrap();
                assert!(matches!(
                    verified.revalidate_for_activation(),
                    Err(ManifestError::GenerationAuthority(_))
                ));
                restrict_test_directory(generation.path());
            }
            #[cfg(windows)]
            {
                let payload = generation.path().join("bin/dashboard.exe");
                permit_test_peer(&payload);
                assert!(matches!(
                    verified.revalidate_for_activation(),
                    Err(ManifestError::UnsafeFileType { .. })
                ));
                remove_test_peer(&payload);
            }
        });
    }

    #[test]
    fn empty_directory_inventory_is_identity_bound_and_semantically_closed() {
        let fixture = Fixture::new();
        fixture.with_generation(|generation| {
            let empty = generation.path().join("empty-state");
            std::fs::create_dir(&empty).unwrap();
            let verified = fixture.verify(generation).unwrap();
            std::fs::remove_dir(&empty).unwrap();
            std::fs::create_dir(&empty).unwrap();
            assert!(matches!(
                verified.revalidate_for_activation(),
                Err(ManifestError::GenerationChanged { .. })
            ));
        });

        let fixture = Fixture::new();
        fixture.with_generation(|generation| {
            let verified = fixture.verify(generation).unwrap();
            std::fs::create_dir(generation.path().join("new-empty-state")).unwrap();
            assert!(matches!(
                verified.revalidate_for_activation(),
                Err(ManifestError::GenerationChanged { .. })
            ));
        });

        let fixture = Fixture::new();
        fixture.with_generation(|generation| {
            std::fs::create_dir(generation.path().join("unsafe name")).unwrap();
            assert!(matches!(
                fixture.verify(generation),
                Err(ManifestError::InvalidField { .. })
            ));
        });

        #[cfg(unix)]
        {
            let fixture = Fixture::new();
            fixture.with_generation(|generation| {
                std::fs::create_dir(generation.path().join("CaseEmpty")).unwrap();
                std::fs::create_dir(generation.path().join("caseempty")).unwrap();
                assert!(matches!(
                    fixture.verify(generation),
                    Err(ManifestError::InvalidField { .. })
                ));
            });
        }

        #[cfg(windows)]
        {
            let fixture = Fixture::new();
            fixture.with_generation(|generation| {
                let empty = generation.path().join("empty-peer-state");
                std::fs::create_dir(&empty).unwrap();
                permit_test_peer(&empty);
                assert!(matches!(
                    fixture.verify(generation),
                    Err(ManifestError::UnsafeFileType { .. })
                ));
                remove_test_peer(&empty);
            });
        }
    }

    #[test]
    fn verified_borrow_release_allows_real_exact_empty_discard() {
        let fixture = Fixture::new();
        fixture.with_owned_generation(|generation| {
            let verified = fixture.verify(&generation).unwrap();
            assert_eq!(verified.generation_id(), generation.generation());
            drop(verified);
            clear_generation_contents(generation.path());
            assert!(matches!(
                generation.discard(),
                DiscardOutcome::Removed { generation } if generation == "generation-1"
            ));
        });
    }

    #[test]
    fn independent_known_vectors_pin_jcs_and_a2a_tree_preimages() {
        const COHORT_VECTOR: &str = r#"{
            "members":[
                {"target":"aarch64-apple-darwin","member_manifest_digest":"0000000000000000000000000000000000000000000000000000000000000000"},
                {"target":"x86_64-apple-darwin","member_manifest_digest":"1111111111111111111111111111111111111111111111111111111111111111"},
                {"target":"aarch64-unknown-linux-gnu","member_manifest_digest":"2222222222222222222222222222222222222222222222222222222222222222"},
                {"target":"x86_64-unknown-linux-gnu","member_manifest_digest":"3333333333333333333333333333333333333333333333333333333333333333"},
                {"target":"x86_64-pc-windows-msvc","member_manifest_digest":"4444444444444444444444444444444444444444444444444444444444444444"}
            ],
            "id":"release-vector",
            "schema_version":"1.0",
            "digest_algorithm":"sha256"
        }"#;
        assert_eq!(
            cohort_descriptor_digest(COHORT_VECTOR.as_bytes()).unwrap(),
            "7ee09a8a08f555f52d50ad0cf711794fc8b7e780c422a89d9ab918831a0de358"
        );
        let records = vec![
            ValidatedTreeRecord {
                path: "bin/a".to_string(),
                mode: "0755".to_string(),
                size: 1,
                size_text: "1".to_string(),
                digest: "a".repeat(64),
            },
            ValidatedTreeRecord {
                path: "lib/b".to_string(),
                mode: "0644".to_string(),
                size: 2,
                size_text: "2".to_string(),
                digest: "b".repeat(64),
            },
        ];
        assert_eq!(
            tree_digest(&records).unwrap(),
            "aad0f7ef91424f0e2b4d40e4ecf96253cbda7b1679da3c7978d92cfc44a47b70"
        );
    }

    #[test]
    fn cohort_order_duplicate_and_member_mismatch_are_rejected() {
        let mut fixture = Fixture::new();
        let mut descriptor: serde_json::Value =
            serde_json::from_slice(&fixture.descriptor).unwrap();
        descriptor["members"].as_array_mut().unwrap().swap(0, 1);
        fixture.descriptor = serde_json::to_vec(&descriptor).unwrap();
        assert!(fixture.verify_result().is_err());

        let mut fixture = Fixture::new();
        let mut descriptor: serde_json::Value =
            serde_json::from_slice(&fixture.descriptor).unwrap();
        descriptor["members"][1]["target"] = descriptor["members"][0]["target"].clone();
        fixture.descriptor = serde_json::to_vec(&descriptor).unwrap();
        assert!(fixture.verify_result().is_err());

        let mut fixture = Fixture::new();
        let mut descriptor: serde_json::Value =
            serde_json::from_slice(&fixture.descriptor).unwrap();
        descriptor["members"][4]["member_manifest_digest"] = serde_json::json!("9".repeat(64));
        fixture.descriptor = serde_json::to_vec(&descriptor).unwrap();
        fixture.cohort_digest = cohort_descriptor_digest(&fixture.descriptor).unwrap();
        assert!(matches!(
            fixture.verify_result(),
            Err(ManifestError::DigestDrift { .. })
        ));
    }

    #[test]
    fn candidate_cannot_self_authorize_component_lock_or_alias_paths() {
        let mut fixture = Fixture::new();
        fixture.mutate_member(|member| {
            member["a2a_component"]["component_lock"]["digest"] = serde_json::json!("0".repeat(64));
        });
        assert!(matches!(
            fixture.verify_result(),
            Err(ManifestError::DigestDrift { .. })
        ));

        let mut fixture = Fixture::new();
        fixture.mutate_member(|member| {
            member["dashboard"]["path"] = serde_json::json!("bin/../dashboard.exe");
        });
        assert!(matches!(
            fixture.verify_result(),
            Err(ManifestError::InvalidField { .. })
        ));
    }

    #[test]
    fn updater_sbom_license_archive_and_tree_joins_are_not_advisory() {
        for pointer in [
            "/updater/digest",
            "/sbom/digest",
            "/licenses/0/digest",
            "/a2a_component/capsule_archive/digest",
            "/a2a_component/tree_evidence/tree_digest",
        ] {
            let mut fixture = Fixture::new();
            fixture.mutate_member(|member| {
                *member.pointer_mut(pointer).unwrap() = serde_json::json!("0".repeat(64));
            });
            assert!(
                fixture.verify_result().is_err(),
                "{pointer} drift must reject"
            );
        }
    }

    #[test]
    fn closed_versions_assets_and_positive_artifact_sizes_fail_closed() {
        let mut fixture = Fixture::new();
        fixture.mutate_member(|member| member["schema_version"] = serde_json::json!("1.0"));
        assert!(fixture.verify_result().is_err());

        let mut fixture = Fixture::new();
        fixture.mutate_member(|member| member["dashboard"]["size"] = serde_json::json!(0));
        assert!(fixture.verify_result().is_err());

        let fixture = Fixture::new();
        let mut capsule: serde_json::Value =
            serde_json::from_slice(fixture.payload("a2a/component-manifest.json")).unwrap();
        let duplicate = capsule["assets"][0].clone();
        capsule["assets"].as_array_mut().unwrap().push(duplicate);
        assert!(CapsuleManifest::parse(&serde_json::to_string(&capsule).unwrap()).is_err());

        let fixture = Fixture::new();
        let mut capsule: serde_json::Value =
            serde_json::from_slice(fixture.payload("a2a/component-manifest.json")).unwrap();
        capsule["compatibility"]["migration_range"]["head"] = serde_json::json!("0009");
        capsule["consistency_group"]["stores"][0]["schema_version"] = serde_json::json!("0009");
        assert!(CapsuleManifest::parse(&serde_json::to_string(&capsule).unwrap()).is_err());
    }
}
