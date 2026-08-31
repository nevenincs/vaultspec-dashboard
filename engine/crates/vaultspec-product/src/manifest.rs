//! Fail-closed verification of the product release-set boundary.
//!
//! Parsing is deliberately not activation authority. A caller receives a
//! [`VerifiedReleaseSet`] only after the independently trusted member digest,
//! component lock, external four-member cohort, A2A capsule contract, complete
//! installed-file inventory, and bytes beneath one retained unpublished
//! generation have all joined. The verified value keeps that exact generation
//! borrowed and rechecks its final filesystem snapshot before activation.
//!
//! The bounded no-follow double scan is the accepted cooperative installer
//! boundary. On Windows the retained lease prevents generation-root
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
use crate::a2a_contract::COMPONENT_LOCK_PATH;
const MAX_MEMBER_MANIFEST_BYTES: usize = 512 * 1024 * 1024;
const MAX_COMPONENT_LOCK_BYTES: usize = 1024 * 1024;
const MAX_CAPSULE_MANIFEST_BYTES: u64 = 4 * 1024 * 1024;
const MAX_COHORT_BYTES: usize = 64 * 1024;
const MAX_INSTALLED_FILES: usize = 100_000;
const MAX_TREE_FILES: usize = 80_000;
const MAX_DIRECTORIES: usize = 100_000;
/// Total expanded bytes admitted for one release tree — the decompression bound
/// the generation verifier and the archive materializer BOTH enforce. They must
/// agree: an archive whose expansion exceeds this could otherwise be
/// materialized and then fail tree verification. It doubles as the ceiling on
/// any single declared artifact, which by construction cannot exceed the whole
/// tree's budget.
pub(crate) const MAX_EXPANDED_TREE_BYTES: u64 = 8 * 1024 * 1024 * 1024;
const READ_CHUNK: usize = 1024 * 1024;

/// The four product release targets.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub enum Target {
    #[serde(rename = "aarch64-apple-darwin")]
    Aarch64AppleDarwin,
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
            Self::Aarch64UnknownLinuxGnu => "aarch64-unknown-linux-gnu",
            Self::X86_64UnknownLinuxGnu => "x86_64-unknown-linux-gnu",
            Self::X86_64PcWindowsMsvc => "x86_64-pc-windows-msvc",
        }
    }
}

const TARGETS: [Target; 4] = [
    Target::Aarch64AppleDarwin,
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
    pub freeze_recipe: FreezeRecipe,
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

/// The in-repo freeze recipe the release pipeline invokes at the pinned commit to
/// produce the bundled runtime: the build entry it runs and the PyInstaller spec
/// that entry consumes. Both are repository-relative paths in the pinned source,
/// so the recipe's identity is pinned alongside the commit rather than restated
/// by the pipeline.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct FreezeRecipe {
    pub build_entry: String,
    pub spec: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ResolutionPolicy {
    pub floating_forbidden: bool,
    pub latest_forbidden: bool,
    pub runtime_resolution_forbidden: bool,
    pub digest_required: bool,
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
        // The recipe paths are repository-relative locations in the pinned source,
        // not literals this verifier owns: pinning them here would make the
        // consumer, rather than the lock, the authority over where the recipe
        // lives. They are proven to be portable relative paths and nothing more.
        validate_portable_path("freeze_recipe.build_entry", &self.freeze_recipe.build_entry)?;
        validate_portable_path("freeze_recipe.spec", &self.freeze_recipe.spec)?;
        if self.freeze_recipe.build_entry == self.freeze_recipe.spec {
            return invalid(
                "freeze_recipe",
                "the build entry and the PyInstaller spec must be distinct files",
            );
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

    /// Runtime-boundary join used by lifecycle inspection. This proves only
    /// target and release identity against the lock's source pin; it is not a
    /// complete release-set or activation verifier. Receipt-selected start
    /// integration must consume [`VerifiedReleaseSet`].
    pub fn parse_and_verify(raw: &str, lock: &ComponentLock, expected: Target) -> Result<Self> {
        let (manifest, _) = parse_capsule(raw.as_bytes())?;
        manifest.verify_against_lock(lock, expected)?;
        Ok(manifest)
    }

    /// Join the declared boundary facts to the lock's source pin.
    ///
    /// The lock pins a2a SOURCE — a repository, a commit, a release identity, and
    /// the freeze recipe — so target and release identity are the whole of what a
    /// declaration can be joined to it. The per-component closure joins (a
    /// separately-pinned CPython, Node, and ACP adapter, each with its own version,
    /// license, and per-target digest) retired with the base closure itself: the
    /// interpreter now lives INSIDE the bundled runtime, and every one of its files
    /// is digest-covered by the member manifest at composition time instead.
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
        let a2a = unique_asset(&self.assets, KIND_A2A)?;
        expect_literal(
            "assets[a2a-distribution].version",
            &self.identity.version,
            &a2a.version,
        )
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

    /// The declared installed-file digests (path -> lowercase SHA-256), covering
    /// every immutable installed file except the manifest's own path. Exposed for
    /// the build-time composer and the install-time placement-integrity check to
    /// compare the declared inventory against the real placed tree.
    pub(crate) fn file_digests(&self) -> &BTreeMap<String, String> {
        &self.inner.file_digests
    }

    /// The manifest's own app-tree-relative path — the sole file excluded from
    /// `file_digests`.
    pub(crate) fn release_manifest_path(&self) -> &str {
        &self.inner.release_manifest.path
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
    /// Absent when the product tree carries no bundled a2a runtime. Absence is
    /// the ONLY encoding of "no runtime": present, the pin is whole — a lock
    /// join and a runtime whose `file_count` floor is 1 — so an empty or zeroed
    /// block cannot be parsed into existence.
    #[serde(default)]
    a2a_component: Option<A2aComponentPin>,
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
    runtime: BundledRuntime,
}

/// The bundled a2a runtime as the member manifest declares it: the frozen onedir
/// directory placed beside the dashboard executable.
///
/// The onedir carries no manifest, archive, or evidence document of its own — its
/// files are ordinary admitted release files, so `file_digests` already binds
/// every byte. What is declared here is what `file_digests` alone cannot say: WHICH
/// subtree is the runtime, WHICH file in it is the launchable entrypoint, and how
/// many files the composer placed there, so a truncated or empty onedir is a
/// verification failure rather than a smaller inventory that still verifies.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct BundledRuntime {
    root: String,
    entrypoint: String,
    file_count: usize,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
struct EvidenceFile {
    path: String,
    digest: String,
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
    // Optional, never weakened: a member that DECLARES a bundled runtime is held
    // to exactly the checks it always was. Only its absence is now expressible.
    if let Some(a2a) = &manifest.a2a_component {
        require_commit("a2a_component.commit", &a2a.commit)?;
        require_identity(
            "a2a_component.release_identity.name",
            &a2a.release_identity.name,
        )?;
        require_exact_version(
            "a2a_component.release_identity.version",
            &a2a.release_identity.version,
        )?;
        validate_evidence("a2a_component.component_lock", &a2a.component_lock)?;
        expect_literal(
            "a2a_component.component_lock.path",
            COMPONENT_LOCK_PATH,
            &a2a.component_lock.path,
        )?;
        validate_bundled_runtime("a2a_component.runtime", &a2a.runtime)?;
    }
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
        manifest.sbom.path.as_str(),
    ]);
    // The component lock is a reference only where a bundled runtime declares
    // it. With no runtime the lock is not in the tree, so admitting its path
    // into the reference set would reserve a path nothing occupies.
    if let Some(a2a) = &manifest.a2a_component {
        all_references.push(a2a.component_lock.path.as_str());
    }
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

/// Structurally validate the declared bundled-runtime subtree: a portable root
/// directory, an entrypoint that is a portable path INSIDE that root (never a
/// sibling and never the root itself), and a placed-file count within the tree
/// ceiling. The join to the installed bytes is the verifier's job; this is the
/// shape check that makes that join well-formed.
fn validate_bundled_runtime(field: &str, runtime: &BundledRuntime) -> Result<()> {
    validate_portable_path(&format!("{field}.root"), &runtime.root)?;
    validate_portable_path(&format!("{field}.entrypoint"), &runtime.entrypoint)?;
    let prefix = format!("{}/", runtime.root);
    if !runtime.entrypoint.starts_with(&prefix) || runtime.entrypoint.len() == prefix.len() {
        return invalid(
            &format!("{field}.entrypoint"),
            "must name a file inside the bundled-runtime root",
        );
    }
    if runtime.file_count == 0 || runtime.file_count > MAX_TREE_FILES {
        return invalid(&format!("{field}.file_count"), "must be 1..=80000");
    }
    Ok(())
}

fn validate_artifact(field: &str, path: &str, size: u64, digest: &str) -> Result<()> {
    validate_portable_path(&format!("{field}.path"), path)?;
    if size == 0 || size > MAX_EXPANDED_TREE_BYTES {
        return invalid(&format!("{field}.size"), "must be 1..=8589934592");
    }
    require_digest(&format!("{field}.digest"), digest)
}

/// Join a member's declared a2a source pin to independently trusted lock bytes.
///
/// A member that declares no bundled runtime states no source pin, so there is
/// nothing to join and the check is vacuously satisfied. This is what lets the
/// installed-tree verification of an a2a-less product succeed under the lock the
/// CLI embeds: the lock still governs every member that DOES pin a source, and
/// a member that pins one is held to exactly the same equality it always was.
fn verify_release_lock_joins(manifest: &RawReleaseSetManifest, lock: &ComponentLock) -> Result<()> {
    let Some(a2a) = &manifest.a2a_component else {
        return Ok(());
    };
    expect_literal("a2a_component.commit", &lock.a2a_source.commit, &a2a.commit)?;
    if a2a.release_identity != lock.a2a_source.release_identity {
        return Err(ManifestError::IdentityMismatch {
            detail: "release member A2A identity differs from the component lock".to_string(),
        });
    }
    Ok(())
}

/// Opaque, independently established release authority.
///
/// No public raw constructor exists: candidate manifests and descriptors must
/// never manufacture their own expected digests, target, component lock, or
/// installed capsule root. Receipt-selected start integration will obtain
/// this value only from receipt-selected, product-owned provenance under the
/// installation lock.
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

mod activation;
pub(crate) use activation::{BootstrapOwnership, ReceiptActivationContext, VerifiedReceiptFacts};

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
}

impl std::fmt::Debug for VerifiedReleaseSet<'_, '_, '_> {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("VerifiedReleaseSet")
            .finish_non_exhaustive()
    }
}

#[path = "manifest/active.rs"]
pub(crate) mod active;
pub(crate) use active::{
    ActiveReleaseExpectation, VerifiedActiveGeneration, verify_active_generation,
};

#[path = "manifest/update_seam.rs"]
pub(crate) mod update_seam;
pub(crate) use update_seam::{UpdateReleaseFacts, preflight_inventory, verify_update_release};

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
    scan_generation, scan_generation_locating_member, verify_artifact_joins,
    verify_bundled_runtime, verify_complete_inventory, verify_installed_exact_bytes,
    verify_release_manifest_bytes,
};
// The archive materializer applies the same portable-path grammar and casefold
// key to archive entry names that the generation verifier applies to installed
// objects, so the two boundaries can never disagree.
pub(crate) use verification::{
    semantic_path_key, validate_portable_path, validate_portable_segment,
};

#[cfg(test)]
#[path = "manifest/tests.rs"]
pub(crate) mod tests;
