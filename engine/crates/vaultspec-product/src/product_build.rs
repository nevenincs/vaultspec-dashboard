//! The product-tree BUILDER (a2a-product-provisioning W04.P08.S64): compose a
//! complete, verified product tree for one target and emit its release-set member
//! manifest.
//!
//! This is the GENERATE side of the release-set contract. The PARSE + VERIFY side
//! is already owned by [`crate::manifest`] (W01.P01.S06); this module never
//! re-implements it. Instead the emitter produces a schema-2.0 member manifest
//! from the composed, exactly-pinned inputs and SELF-VERIFIES it by round-tripping
//! through the production verifier — a manifest this builder emits is proven by
//! the same authority a consumer uses, so drift fails the build rather than
//! shipping. The runtime, protocol, and state-schema pins are derived from the
//! trusted component lock and the verified capsule manifest, never restated by
//! hand, so a candidate can never silently disagree with its pins.

use std::collections::BTreeMap;
use std::path::Path;

use serde::Serialize;

use crate::manifest::{
    CapsuleManifest, ComponentLock, ManifestError, ReleaseSetManifest, Target, sha256_hex,
};

/// The digest algorithm every release-set artifact is bound under.
const DIGEST_ALGORITHM: &str = "sha256";
/// The first complete release-set member schema version.
const SCHEMA_VERSION: &str = "2.0";
/// The maximum number of installed regular files a composed product tree may hold.
const MAX_TREE_FILES: usize = 100_000;
/// The maximum size of any single installed file (bundled runtimes are large).
const MAX_TREE_FILE_BYTES: u64 = 4 * 1024 * 1024 * 1024;

/// Why a product build could not compose a verified member manifest. Bounded and
/// free of any secret (the build handles only public release artifacts).
#[derive(Debug)]
pub enum ProductBuildError {
    /// The emitted manifest failed the production verifier — a builder defect or
    /// a pin drift between the composed inputs and the trusted lock.
    SelfVerify(ManifestError),
    /// The emitted manifest could not be serialized.
    Serialize(String),
    /// A bounded I/O error while scanning the composed tree.
    Io(String),
    /// The composed tree exceeds the fixed installed-file-count ceiling.
    TreeTooLarge,
    /// A single composed file exceeds the fixed per-file byte ceiling.
    FileTooLarge { path: String },
    /// The composed tree contains a non-regular entry (symlink, device, socket);
    /// an installed product tree is regular files only.
    NonRegularEntry { path: String },
}

impl std::fmt::Display for ProductBuildError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::SelfVerify(error) => {
                write!(
                    f,
                    "emitted member manifest failed self-verification: {error}"
                )
            }
            Self::Serialize(detail) => write!(f, "member manifest serialization failed: {detail}"),
            Self::Io(detail) => write!(f, "composed-tree scan io error: {detail}"),
            Self::TreeTooLarge => write!(f, "composed tree exceeds the installed-file ceiling"),
            Self::FileTooLarge { path } => {
                write!(f, "composed file {path} exceeds the per-file byte ceiling")
            }
            Self::NonRegularEntry { path } => {
                write!(f, "composed tree contains a non-regular entry: {path}")
            }
        }
    }
}

impl std::error::Error for ProductBuildError {}

/// Scan every regular file under `tree_root`, returning each app-tree-relative
/// path (forward-slashed), byte size, and lowercase SHA-256 using the crate's
/// canonical hash, sorted by path. Bounded by [`MAX_TREE_FILES`] and
/// [`MAX_TREE_FILE_BYTES`]; a symlink or other non-regular entry is refused
/// because an installed product tree is regular files only.
///
/// This is the composer's evidence source: `file_digests` and the placed-artifact
/// facts a member manifest is emitted from are COMPUTED over what was actually
/// placed on disk, never asserted by the caller.
pub fn scan_composed_tree(tree_root: &Path) -> Result<Vec<ComposedArtifact>, ProductBuildError> {
    let mut out = Vec::new();
    scan_dir(tree_root, tree_root, &mut out)?;
    out.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(out)
}

fn scan_dir(
    root: &Path,
    dir: &Path,
    out: &mut Vec<ComposedArtifact>,
) -> Result<(), ProductBuildError> {
    let entries =
        std::fs::read_dir(dir).map_err(|error| ProductBuildError::Io(error.to_string()))?;
    for entry in entries {
        let entry = entry.map_err(|error| ProductBuildError::Io(error.to_string()))?;
        let path = entry.path();
        let metadata = std::fs::symlink_metadata(&path)
            .map_err(|error| ProductBuildError::Io(error.to_string()))?;
        let file_type = metadata.file_type();
        if file_type.is_dir() {
            scan_dir(root, &path, out)?;
        } else if file_type.is_file() {
            if out.len() >= MAX_TREE_FILES {
                return Err(ProductBuildError::TreeTooLarge);
            }
            if metadata.len() > MAX_TREE_FILE_BYTES {
                return Err(ProductBuildError::FileTooLarge {
                    path: relative_path(root, &path),
                });
            }
            let bytes =
                std::fs::read(&path).map_err(|error| ProductBuildError::Io(error.to_string()))?;
            out.push(ComposedArtifact {
                path: relative_path(root, &path),
                size: metadata.len(),
                digest: sha256_hex(&bytes),
            });
        } else {
            return Err(ProductBuildError::NonRegularEntry {
                path: relative_path(root, &path),
            });
        }
    }
    Ok(())
}

/// The forward-slashed app-tree-relative path of `path` under `root`.
fn relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

/// A regular file placed in the composed tree, by app-tree-relative path, byte
/// length, and lowercase SHA-256 digest.
#[derive(Debug, Clone)]
pub struct ComposedArtifact {
    pub path: String,
    pub size: u64,
    pub digest: String,
}

/// The dashboard binary the tree is composed around (carries its own commit).
#[derive(Debug, Clone)]
pub struct DashboardArtifact {
    pub version: String,
    pub commit: String,
    pub artifact: ComposedArtifact,
}

/// One evidence document (component lock or capsule manifest) by path + digest.
#[derive(Debug, Clone)]
pub struct EvidenceArtifact {
    pub path: String,
    pub digest: String,
}

/// The extracted-capsule tree evidence: the archive of the extracted tree plus
/// its whole-tree digest and file count.
#[derive(Debug, Clone)]
pub struct TreeEvidenceArtifact {
    pub artifact: ComposedArtifact,
    pub tree_digest: String,
    pub file_count: usize,
}

/// The pinned A2A capsule evidence composed into the tree.
#[derive(Debug, Clone)]
pub struct A2aComponentEvidence {
    pub component_lock: EvidenceArtifact,
    pub capsule_manifest: EvidenceArtifact,
    pub capsule_archive: ComposedArtifact,
    pub tree_evidence: TreeEvidenceArtifact,
}

/// One third-party license file bound in the tree.
#[derive(Debug, Clone)]
pub struct LicenseArtifact {
    pub component: String,
    pub spdx: String,
    pub path: String,
    pub digest: String,
}

/// The software bill of materials bound in the tree.
#[derive(Debug, Clone)]
pub struct SbomArtifact {
    pub format: String,
    pub artifact: ComposedArtifact,
}

/// The complete, composed facts one release-set member manifest is emitted from.
/// The caller (the tree composer) supplies the real placed-artifact facts; the
/// runtime/protocol/state-schema pins are derived from the trusted lock and the
/// verified capsule, not carried here.
#[derive(Debug, Clone)]
pub struct ComposedMember {
    pub target: Target,
    pub cohort_id: String,
    pub cohort_targets: Vec<Target>,
    pub release_manifest_path: String,
    pub dashboard: DashboardArtifact,
    pub updater_version: String,
    pub updater: ComposedArtifact,
    pub a2a_component: A2aComponentEvidence,
    pub licenses: Vec<LicenseArtifact>,
    pub sbom: SbomArtifact,
    /// Every immutable installed regular file except `release_manifest_path`, by
    /// path → digest (the verifier rejects the manifest's own path here).
    pub file_digests: BTreeMap<String, String>,
}

/// Emit a schema-2.0 release-set member manifest from the composed facts, deriving
/// the runtime/protocol/state-schema pins from the trusted `lock` and verified
/// `capsule`, then SELF-VERIFY the emitted bytes through the production verifier.
///
/// The returned string is the canonical member-manifest JSON, proven valid against
/// the same lock a consumer trusts. An emit that disagrees with the pins — or a
/// builder defect — fails here rather than shipping.
pub fn emit_member_manifest(
    member: &ComposedMember,
    lock: &ComponentLock,
    capsule: &CapsuleManifest,
) -> Result<String, ProductBuildError> {
    let manifest = build_member(member, lock, capsule);
    let raw = serde_json::to_string(&manifest)
        .map_err(|error| ProductBuildError::Serialize(error.to_string()))?;
    // Prove the emitted bytes verify under the production authority (pin-skew,
    // floating selectors, target mismatch, self-authorizing lock all rejected).
    ReleaseSetManifest::parse_and_verify(&raw, lock).map_err(ProductBuildError::SelfVerify)?;
    Ok(raw)
}

fn build_member(
    member: &ComposedMember,
    lock: &ComponentLock,
    capsule: &CapsuleManifest,
) -> Member {
    Member {
        schema_version: SCHEMA_VERSION,
        target: member.target.triple().to_owned(),
        digest_algorithm: DIGEST_ALGORITHM,
        cohort: Cohort {
            id: member.cohort_id.clone(),
            targets: member
                .cohort_targets
                .iter()
                .map(|target| target.triple().to_owned())
                .collect(),
        },
        release_manifest: ReleaseManifestRef {
            path: member.release_manifest_path.clone(),
            binding_mode: "external-cohort-and-receipt",
        },
        dashboard: DashboardOut {
            version: member.dashboard.version.clone(),
            commit: member.dashboard.commit.clone(),
            path: member.dashboard.artifact.path.clone(),
            size: member.dashboard.artifact.size,
            digest: member.dashboard.artifact.digest.clone(),
        },
        updater: UpdaterOut {
            version: member.updater_version.clone(),
            path: member.updater.path.clone(),
            size: member.updater.size,
            digest: member.updater.digest.clone(),
        },
        a2a_component: A2aComponentOut {
            commit: lock.a2a_source.commit.clone(),
            release_identity: ReleaseIdentityOut {
                name: lock.a2a_source.release_identity.name.clone(),
                version: lock.a2a_source.release_identity.version.clone(),
            },
            component_lock: EvidenceOut {
                path: member.a2a_component.component_lock.path.clone(),
                digest: member.a2a_component.component_lock.digest.clone(),
            },
            capsule_manifest: EvidenceOut {
                path: member.a2a_component.capsule_manifest.path.clone(),
                digest: member.a2a_component.capsule_manifest.digest.clone(),
            },
            capsule_archive: ArtifactOut {
                path: member.a2a_component.capsule_archive.path.clone(),
                size: member.a2a_component.capsule_archive.size,
                digest: member.a2a_component.capsule_archive.digest.clone(),
            },
            tree_evidence: TreeEvidenceOut {
                path: member.a2a_component.tree_evidence.artifact.path.clone(),
                size: member.a2a_component.tree_evidence.artifact.size,
                digest: member.a2a_component.tree_evidence.artifact.digest.clone(),
                tree_digest: member.a2a_component.tree_evidence.tree_digest.clone(),
                file_count: member.a2a_component.tree_evidence.file_count,
            },
        },
        runtimes: RuntimesOut {
            cpython: runtime_from_lock(
                &lock.base_closure.python.version,
                &lock.base_closure.python.license,
                digest_or_empty(lock.python_digest(member.target)),
            ),
            node: runtime_from_lock(
                &lock.base_closure.node.version,
                &lock.base_closure.node.license,
                digest_or_empty(lock.node_digest(member.target)),
            ),
            acp: runtime_from_lock(
                &lock.base_closure.acp.version,
                &lock.base_closure.acp.license,
                &lock.base_closure.acp.sha256,
            ),
        },
        protocol: ProtocolOut {
            gateway_api_version_range: RangeOut {
                minimum: capsule.compatibility.api_versions.minimum.clone(),
                maximum: capsule.compatibility.api_versions.maximum.clone(),
            },
        },
        state_schema: StateSchemaOut {
            migration_range: RangeOut {
                minimum: capsule.compatibility.migration_range.base.clone(),
                maximum: capsule.compatibility.migration_range.head.clone(),
            },
        },
        licenses: member
            .licenses
            .iter()
            .map(|license| LicenseOut {
                component: license.component.clone(),
                spdx: license.spdx.clone(),
                path: license.path.clone(),
                digest: license.digest.clone(),
            })
            .collect(),
        sbom: SbomOut {
            format: member.sbom.format.clone(),
            path: member.sbom.artifact.path.clone(),
            size: member.sbom.artifact.size,
            digest: member.sbom.artifact.digest.clone(),
        },
        file_digests: member.file_digests.clone(),
    }
}

fn runtime_from_lock(version: &str, license: &str, digest: &str) -> RuntimeOut {
    RuntimeOut {
        version: version.to_owned(),
        license: license.to_owned(),
        digest: digest.to_owned(),
    }
}

fn digest_or_empty(digest: crate::manifest::Result<&str>) -> &str {
    digest.unwrap_or("")
}

#[derive(Serialize)]
struct Member {
    schema_version: &'static str,
    target: String,
    digest_algorithm: &'static str,
    cohort: Cohort,
    release_manifest: ReleaseManifestRef,
    dashboard: DashboardOut,
    updater: UpdaterOut,
    a2a_component: A2aComponentOut,
    runtimes: RuntimesOut,
    protocol: ProtocolOut,
    state_schema: StateSchemaOut,
    licenses: Vec<LicenseOut>,
    sbom: SbomOut,
    file_digests: BTreeMap<String, String>,
}

#[derive(Serialize)]
struct Cohort {
    id: String,
    targets: Vec<String>,
}

#[derive(Serialize)]
struct ReleaseManifestRef {
    path: String,
    binding_mode: &'static str,
}

#[derive(Serialize)]
struct DashboardOut {
    version: String,
    commit: String,
    path: String,
    size: u64,
    digest: String,
}

#[derive(Serialize)]
struct UpdaterOut {
    version: String,
    path: String,
    size: u64,
    digest: String,
}

#[derive(Serialize)]
struct A2aComponentOut {
    commit: String,
    release_identity: ReleaseIdentityOut,
    component_lock: EvidenceOut,
    capsule_manifest: EvidenceOut,
    capsule_archive: ArtifactOut,
    tree_evidence: TreeEvidenceOut,
}

#[derive(Serialize)]
struct ReleaseIdentityOut {
    name: String,
    version: String,
}

#[derive(Serialize)]
struct EvidenceOut {
    path: String,
    digest: String,
}

#[derive(Serialize)]
struct ArtifactOut {
    path: String,
    size: u64,
    digest: String,
}

#[derive(Serialize)]
struct TreeEvidenceOut {
    path: String,
    size: u64,
    digest: String,
    tree_digest: String,
    file_count: usize,
}

#[derive(Serialize)]
struct RuntimesOut {
    cpython: RuntimeOut,
    node: RuntimeOut,
    acp: RuntimeOut,
}

#[derive(Serialize)]
struct RuntimeOut {
    version: String,
    license: String,
    digest: String,
}

#[derive(Serialize)]
struct ProtocolOut {
    gateway_api_version_range: RangeOut,
}

#[derive(Serialize)]
struct StateSchemaOut {
    migration_range: RangeOut,
}

#[derive(Serialize)]
struct RangeOut {
    minimum: String,
    maximum: String,
}

#[derive(Serialize)]
struct LicenseOut {
    component: String,
    spdx: String,
    path: String,
    digest: String,
}

#[derive(Serialize)]
struct SbomOut {
    format: String,
    path: String,
    size: u64,
    digest: String,
}
