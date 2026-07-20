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

use crate::channels::InstallProvenanceAuthority;
use crate::generation::{GenerationError, UnpublishedGeneration};
use crate::receipt::{Channel, PriorSeatIdentity};

const RELEASE_SCHEMA_VERSION: &str = "2.0";
const CAPSULE_CONTRACT_VERSION: &str = "2.0";
#[allow(
    dead_code,
    reason = "used only by the sealed verifier, which has no production adapter authority yet"
)]
const COHORT_SCHEMA_VERSION: &str = "1.0";
const DIGEST_ALGORITHM: &str = "sha256";
const COMPONENT_LOCK_VERSION: &str = "1.0";
const COMPONENT_LOCK_PATH: &str = "packaging/a2a-component.lock.json";
const COMPONENT_MANIFEST_SCHEMA: &str = "schemas/desktop-capsule-manifest.json";
const MAX_MEMBER_MANIFEST_BYTES: usize = 512 * 1024 * 1024;
const MAX_COMPONENT_LOCK_BYTES: usize = 1024 * 1024;
const MAX_CAPSULE_MANIFEST_BYTES: u64 = 4 * 1024 * 1024;
const MAX_COHORT_BYTES: usize = 64 * 1024;
#[allow(
    dead_code,
    reason = "used only by the sealed verifier, which has no production adapter authority yet"
)]
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

mod errors;

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

/// Opaque, independently established release authority.
///
/// No public raw constructor exists: candidate manifests and descriptors must
/// never manufacture their own expected digests, target, component lock, or
/// installed capsule root. W01.P02.S16/W02.P04.S164 will obtain this value only
/// from receipt-selected, product-owned provenance under the installation lock.
#[allow(
    dead_code,
    reason = "compile-time sealed substrate awaits a production adapter authority"
)]
struct TrustedReleaseAuthority {
    expected_target: Target,
    expected_member_manifest_digest: String,
    expected_cohort_digest: String,
    receipt_external_cohort_digest: String,
    trusted_component_lock_bytes: Vec<u8>,
    trusted_component_lock_path: String,
    expected_component_lock_digest: String,
    trusted_capsule_root: String,
    _adapter: InstallProvenanceAuthority,
}

/// Opaque call-scoped input not carried inside the candidate generation.
///
/// The external cohort bytes remain untrusted until joined to the digest in
/// [`TrustedReleaseAuthority`]. No candidate path, generation identifier, or
/// member-manifest bytes are accepted here.
#[doc(hidden)]
#[allow(
    dead_code,
    reason = "compile-time sealed substrate awaits a production adapter authority"
)]
struct ReleaseVerificationInput<'a> {
    authority: &'a TrustedReleaseAuthority,
    cohort_descriptor_bytes: &'a [u8],
}

/// Internally supplied transaction facts retained for receipt publication.
///
/// These facts are not derived from candidate bytes. Their closed grammar is
/// validated while the exact unpublished generation and installation guard are
/// borrowed, then S172 must consume the retained values rather than rebuilding
/// them at the publication boundary.
#[doc(hidden)]
#[allow(
    dead_code,
    reason = "compile-time sealed substrate awaits a production adapter authority"
)]
struct ReceiptActivationContext {
    channel: Channel,
    bootstrap_created_ownership: bool,
    prior_seat: Option<PriorSeatIdentity>,
    consistency_generation: u64,
    created_ms: i64,
}

/// Complete immutable and transaction-supplied facts for the S172 receipt.
///
/// The active generation text is copied only from the exact retained token
/// during verification; it is never accepted as a caller field.
#[allow(
    dead_code,
    reason = "compile-time sealed substrate awaits a production adapter authority"
)]
pub(crate) struct VerifiedReceiptFacts {
    dashboard_version: String,
    dashboard_commit: String,
    dashboard_digest: String,
    release_set_identity: String,
    release_set_member_digest: String,
    component_lock_digest: String,
    external_five_member_cohort_digest: String,
    target: Target,
    a2a_identity: ReleaseIdentity,
    active_generation: String,
    channel: Channel,
    bootstrap_created_ownership: bool,
    prior_seat: Option<PriorSeatIdentity>,
    consistency_generation: u64,
    created_ms: i64,
}

/// A complete release verification bound to one retained unpublished generation.
///
/// This value is non-`Clone`, non-serializable, and has no public raw
/// construction path. It retains the exact generation borrow, final complete
/// snapshot, immutable release facts, and validated transaction facts until
/// activation completes.
#[allow(
    dead_code,
    reason = "compile-time sealed substrate awaits a production adapter authority"
)]
pub(crate) struct VerifiedReleaseSet<'generation, 'product, 'lock> {
    generation: &'generation mut UnpublishedGeneration<'product, 'lock>,
    receipt_facts: VerifiedReceiptFacts,
    member_manifest_path: String,
    final_snapshot: GenerationSnapshot,
    capsule_root: String,
    capsule_manifest: CapsuleManifest,
}

impl std::fmt::Debug for VerifiedReleaseSet<'_, '_, '_> {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("VerifiedReleaseSet")
            .finish_non_exhaustive()
    }
}

mod authority;
#[cfg(test)]
use authority::cohort_descriptor_digest;

#[path = "manifest/verification.rs"]
mod verification;
use verification::{
    GenerationSnapshot, expect_digest, expect_literal, invalid, observed_file,
    read_installed_bounded, require_bounded_text, require_commit, require_digest,
    require_exact_version, require_gateway_range, require_identity, require_input_bound,
    require_migration, require_numeric_version, require_target_roster, require_unchanged_snapshot,
    scan_generation, scan_generation_locating_member, semantic_path_key, sha256_hex,
    validate_portable_path, validate_portable_segment, verify_artifact_joins,
    verify_complete_inventory, verify_installed_exact_bytes, verify_release_manifest_bytes,
    verify_tree_evidence, version_prefix,
};
#[cfg(test)]
use verification::{ValidatedTreeRecord, tree_digest};

#[cfg(test)]
#[path = "manifest/tests.rs"]
pub(crate) mod tests;
