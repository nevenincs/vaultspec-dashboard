//! The product-tree BUILDER: compose a
//! complete, verified product tree for one target and emit its release-set member
//! manifest.
//!
//! This is the GENERATE side of the release-set contract. The PARSE + VERIFY side
//! is already owned by [`crate::manifest`]; this module never
//! re-implements it. Instead the emitter produces a schema-2.0 member manifest
//! from the composed, exactly-pinned inputs and SELF-VERIFIES it by round-tripping
//! through the production verifier — a manifest this builder emits is proven by
//! the same authority a consumer uses, so drift fails the build rather than
//! shipping. The a2a source pin is derived from the trusted component lock, never
//! restated by hand, so a candidate can never silently disagree with its pin.

use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::hex;
use crate::manifest::{
    ComponentLock, ManifestError, ReleaseSetManifest, Target, semantic_path_key,
    validate_portable_path,
};

/// The digest algorithm every release-set artifact is bound under.
const DIGEST_ALGORITHM: &str = "sha256";
/// The first complete release-set member schema version.
const SCHEMA_VERSION: &str = "2.0";
/// The maximum number of installed regular files a composed product tree may hold.
const MAX_TREE_FILES: usize = 100_000;
/// The maximum size of any single installed file (bundled runtimes are large).
const MAX_TREE_FILE_BYTES: u64 = 4 * 1024 * 1024 * 1024;
/// The maximum directory depth a composed tree may nest — the SAME 32-segment
/// ceiling the install verifier's `scan_generation` enforces, so a tree that
/// composes here can never be rejected only at install for depth.
const MAX_TREE_DEPTH: usize = 32;

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
    /// A composed file's name is not a portable install path (the same grammar
    /// the install verifier applies) — a non-portable name caught at build.
    NonPortablePath { detail: String },
    /// A composed file name is not valid UTF-8; it would be silently mangled into
    /// replacement characters, so it is refused outright.
    NonUtf8Name { path: String },
    /// Two composed files collide under the install path's ASCII casefold key —
    /// they would be indistinguishable to a case-insensitive filesystem.
    CasefoldCollision { path: String },
    /// The composed tree nests deeper than the install grammar's segment ceiling.
    TreeTooDeep,
    /// A required per-target runtime pin is absent from the component lock, so the
    /// member cannot bind it — named here rather than emitted as an empty digest.
    MissingRuntimePin { detail: String },
    /// The member's `file_digests` does not describe exactly the scanned tree
    /// (a missing, extra, drifted, or self-listed manifest-path entry).
    FileDigestsMismatch { detail: String },
    /// The built onedir contains a directory holding no regular file. The
    /// generation tree admits no empty directory, so the constraint is reported
    /// against the freeze recipe rather than silently dropped from the tree.
    EmptyDirectory { path: String },
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
            Self::NonPortablePath { detail } => {
                write!(
                    f,
                    "composed file name is not a portable install path: {detail}"
                )
            }
            Self::NonUtf8Name { path } => {
                write!(f, "composed file name is not valid UTF-8: {path}")
            }
            Self::CasefoldCollision { path } => {
                write!(
                    f,
                    "composed file collides under the install casefold key: {path}"
                )
            }
            Self::TreeTooDeep => write!(f, "composed tree nests deeper than 32 segments"),
            Self::MissingRuntimePin { detail } => {
                write!(
                    f,
                    "component lock is missing a required runtime pin: {detail}"
                )
            }
            Self::FileDigestsMismatch { detail } => {
                write!(f, "file_digests does not match the composed tree: {detail}")
            }
            Self::EmptyDirectory { path } => {
                write!(f, "built runtime directory {path} holds no regular file")
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
    let mut keys = BTreeSet::new();
    scan_dir(tree_root, tree_root, 0, &mut out, &mut keys)?;
    out.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(out)
}

fn scan_dir(
    root: &Path,
    dir: &Path,
    depth: usize,
    out: &mut Vec<ComposedArtifact>,
    keys: &mut BTreeSet<String>,
) -> Result<(), ProductBuildError> {
    if depth > MAX_TREE_DEPTH {
        return Err(ProductBuildError::TreeTooDeep);
    }
    let entries = std::fs::read_dir(dir).map_err(|error| io("read_dir", dir, &error))?;
    for entry in entries {
        let entry = entry.map_err(|error| io("read_dir entry under", dir, &error))?;
        let path = entry.path();
        let metadata = std::fs::symlink_metadata(&path)
            .map_err(|error| io("symlink_metadata", &path, &error))?;
        let file_type = metadata.file_type();
        if file_type.is_dir() {
            scan_dir(root, &path, depth + 1, out, keys)?;
        } else if file_type.is_file() {
            if out.len() >= MAX_TREE_FILES {
                return Err(ProductBuildError::TreeTooLarge);
            }
            // UTF-8 refusal FIRST, so a mangled replacement-char key never exists.
            let relative = portable_relative(root, &path)?;
            // Apply the SAME install path grammar the verifier applies (portable
            // segments, no backslash/colon, 1..=32 segments) — build catches drift.
            validate_portable_path("composed tree", &relative).map_err(|error| {
                ProductBuildError::NonPortablePath {
                    detail: error.to_string(),
                }
            })?;
            // Reject an ASCII-casefold collision: two names a case-insensitive
            // filesystem cannot distinguish at install.
            if !keys.insert(semantic_path_key(&relative)) {
                return Err(ProductBuildError::CasefoldCollision { path: relative });
            }
            if metadata.len() > MAX_TREE_FILE_BYTES {
                return Err(ProductBuildError::FileTooLarge { path: relative });
            }
            let bytes = std::fs::read(&path).map_err(|error| io("read", &path, &error))?;
            out.push(ComposedArtifact {
                path: relative,
                size: metadata.len(),
                digest: hex::sha256(&bytes),
            });
        } else {
            return Err(ProductBuildError::NonRegularEntry {
                path: lossy_relative(root, &path),
            });
        }
    }
    Ok(())
}

/// The forward-slashed app-tree-relative path of `path` under `root`, refusing any
/// non-UTF-8 component OUTRIGHT (before a lossy conversion could mint a mangled
/// replacement-character key).
fn portable_relative(root: &Path, path: &Path) -> Result<String, ProductBuildError> {
    let relative = path.strip_prefix(root).unwrap_or(path);
    let mut segments = Vec::new();
    for component in relative.components() {
        let segment =
            component
                .as_os_str()
                .to_str()
                .ok_or_else(|| ProductBuildError::NonUtf8Name {
                    path: relative.to_string_lossy().into_owned(),
                })?;
        segments.push(segment);
    }
    Ok(segments.join("/"))
}

/// A lossy relative path for a diagnostic only (a refused non-regular entry).
fn lossy_relative(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
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

/// One evidence document (the component lock) by path + digest.
#[derive(Debug, Clone)]
pub struct EvidenceArtifact {
    pub path: String,
    pub digest: String,
}

/// The bundled runtime as placed: which subtree it is, which file in it launches,
/// and how many regular files the composer placed there.
#[derive(Debug, Clone)]
pub struct BundledRuntimeEvidence {
    pub root: String,
    pub entrypoint: String,
    pub file_count: usize,
}

/// The pinned A2A component evidence composed into the tree.
#[derive(Debug, Clone)]
pub struct A2aComponentEvidence {
    pub component_lock: EvidenceArtifact,
    pub runtime: BundledRuntimeEvidence,
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
/// a2a source pin is derived from the trusted lock, not carried here.
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

/// Build the `file_digests` map from a scanned composed tree, EXCLUDING the release
/// manifest's own path — the schema's sole exclusion, since its bytes cannot digest
/// themselves (they are bound by external cohort/receipt authority instead).
#[must_use]
pub fn file_digests_from_scan(
    scanned: &[ComposedArtifact],
    release_manifest_path: &str,
) -> BTreeMap<String, String> {
    scanned
        .iter()
        .filter(|artifact| artifact.path != release_manifest_path)
        .map(|artifact| (artifact.path.clone(), artifact.digest.clone()))
        .collect()
}

/// Verify a composed member's `file_digests` describes EXACTLY the scanned tree
/// minus `release_manifest_path`: every installed file present with the observed
/// digest, no missing entry, no extra entry, and the manifest's own path never
/// self-listed. This is the build-time proof that the emitted manifest faithfully
/// describes the placed tree — the same complete-inventory law the manifest
/// verifier enforces at install, checked here before shipping.
pub fn verify_member_covers_tree(
    member: &ComposedMember,
    scanned: &[ComposedArtifact],
) -> Result<(), ProductBuildError> {
    check_file_digests_cover_tree(&member.file_digests, scanned, &member.release_manifest_path)
}

/// Verify an INSTALLED product tree matches its own `release.json` — the light,
/// bounded placement-integrity check the product-owned installer runs: installers
/// install AND verify the tree, a step distinct from the DACL-gated
/// runtime receipt establishment.
///
/// Reads the manifest from `manifest_relative` inside `tree_root`, proves it is
/// structurally valid + component-lock-pinned through the SAME manifest authority a
/// consumer trusts (`parse_and_verify`, no re-implementation), scans the installed
/// tree with the hardened scan, and proves the declared `file_digests` describe
/// EXACTLY the placed tree via the SAME coverage check the build-time
/// [`verify_member_covers_tree`] uses — so a build that composed and an install
/// that verifies agree by construction. This is placement INTEGRITY (the download
/// or copy was not truncated, corrupted, or tampered); it carries no
/// `TrustedReleaseAuthority` — the deeper TUF/receipt trust is established at build
/// and at runtime first-run provisioning, not here.
pub fn verify_installed_tree(
    tree_root: &Path,
    manifest_relative: &str,
    lock: &ComponentLock,
) -> Result<(), ProductBuildError> {
    let manifest_source = tree_root.join(manifest_relative);
    let raw = std::fs::read_to_string(&manifest_source)
        .map_err(|error| io("read", &manifest_source, &error))?;
    let manifest =
        ReleaseSetManifest::parse_and_verify(&raw, lock).map_err(ProductBuildError::SelfVerify)?;
    let scanned = scan_composed_tree(tree_root)?;
    check_file_digests_cover_tree(
        manifest.file_digests(),
        &scanned,
        manifest.release_manifest_path(),
    )
}

/// The shared complete-inventory check: `file_digests` describes EXACTLY the
/// scanned tree minus `manifest_path` (every file present with the observed
/// digest, no missing entry, no extra entry, the manifest's own path never
/// self-listed). Used by BOTH the build-time composer and the install-time
/// integrity check, so the two can never disagree.
fn check_file_digests_cover_tree(
    file_digests: &BTreeMap<String, String>,
    scanned: &[ComposedArtifact],
    manifest_path: &str,
) -> Result<(), ProductBuildError> {
    if file_digests.contains_key(manifest_path) {
        return Err(ProductBuildError::FileDigestsMismatch {
            detail: format!(
                "the release manifest path {manifest_path} must not appear in file_digests"
            ),
        });
    }
    let expected = file_digests_from_scan(scanned, manifest_path);
    for (path, digest) in &expected {
        match file_digests.get(path) {
            Some(declared) if declared == digest => {}
            Some(_) => {
                return Err(ProductBuildError::FileDigestsMismatch {
                    detail: format!("file_digests digest for {path} differs from the placed file"),
                });
            }
            None => {
                return Err(ProductBuildError::FileDigestsMismatch {
                    detail: format!("file_digests is missing the installed file {path}"),
                });
            }
        }
    }
    for path in file_digests.keys() {
        if !expected.contains_key(path) {
            return Err(ProductBuildError::FileDigestsMismatch {
                detail: format!("file_digests lists {path}, which is not in the tree"),
            });
        }
    }
    Ok(())
}

/// One pre-built source artifact and its fixed app-tree-relative destination.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SourceArtifact {
    pub source: std::path::PathBuf,
    pub dest_relative: String,
}

/// A third-party license source with its destination and SPDX identity.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LicenseSource {
    pub source: std::path::PathBuf,
    pub dest_relative: String,
    pub component: String,
    pub spdx: String,
}

/// The bundled a2a runtime source: the frozen PyInstaller onedir the release
/// pipeline built at the pinned commit, its fixed app-tree destination directory,
/// and the launchable entrypoint inside it (named relative to the onedir root, as
/// the freeze recipe emits it).
///
/// This is a DIRECTORY source, not an archive: the composer places its files as
/// ordinary regular files and scans them for installed-byte evidence like every
/// other placed file. Nothing is extracted at install, and the runtime carries no
/// manifest, archive, or evidence document of its own.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RuntimeSource {
    pub source_dir: std::path::PathBuf,
    pub dest_relative: String,
    pub entrypoint_relative: String,
}

/// The complete set of pre-built inputs one target's product tree is composed
/// from. The binaries, the built onedir, and the component lock are all produced
/// upstream (the dashboard/updater builds and the pipeline's freeze step); the
/// composer places them, computes the installed-byte evidence, and emits the
/// manifest.
#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BuildSources {
    pub target: Target,
    pub cohort_id: String,
    pub cohort_targets: Vec<Target>,
    pub release_manifest_path: String,
    pub dashboard_version: String,
    pub dashboard_commit: String,
    pub dashboard: SourceArtifact,
    pub updater_version: String,
    pub updater: SourceArtifact,
    pub a2a_runtime: RuntimeSource,
    pub component_lock: SourceArtifact,
    pub licenses: Vec<LicenseSource>,
    pub sbom: SourceArtifact,
    pub sbom_format: String,
}

/// Compose the complete product tree for one target under `generation_root`, emit
/// and self-verify its release-set member manifest, write it as
/// `release_manifest_path`, and prove the manifest covers exactly the placed tree.
///
/// This build: PLACE every pre-built input at its fixed app-tree
/// destination, SCAN the placed tree for real installed-byte evidence, ASSEMBLE
/// the member facts from that evidence (never from caller assertions), EMIT +
/// self-verify the manifest through the manifest verifier, and finally prove the
/// written manifest describes exactly the tree. The generation-layout is produced
/// directly (the installer later places it and the generation-writer adopts it);
/// the bundled runtime is placed as a directory of ordinary regular files, never
/// as an archive and never extracted at install. Returns the emitted manifest
/// bytes.
pub fn compose_product_tree(
    generation_root: &Path,
    sources: &BuildSources,
    lock: &ComponentLock,
) -> Result<String, ProductBuildError> {
    // PLACE every input at its fixed destination.
    let placements = [
        &sources.dashboard,
        &sources.updater,
        &sources.component_lock,
        &sources.sbom,
    ];
    for artifact in placements {
        place(generation_root, &artifact.source, &artifact.dest_relative)?;
    }
    for license in &sources.licenses {
        place(generation_root, &license.source, &license.dest_relative)?;
    }
    let runtime_files = place_runtime(generation_root, &sources.a2a_runtime)?;

    // SCAN the placed tree (before the manifest is written) for installed bytes.
    let scanned = scan_composed_tree(generation_root)?;
    let by_path = |relative: &str| -> Result<ComposedArtifact, ProductBuildError> {
        scanned
            .iter()
            .find(|artifact| artifact.path == relative)
            .cloned()
            .ok_or_else(|| ProductBuildError::FileDigestsMismatch {
                detail: format!("expected placed file {relative} is absent from the composed tree"),
            })
    };

    // ASSEMBLE the member facts from the scanned evidence.
    let member = ComposedMember {
        target: sources.target,
        cohort_id: sources.cohort_id.clone(),
        cohort_targets: sources.cohort_targets.clone(),
        release_manifest_path: sources.release_manifest_path.clone(),
        dashboard: DashboardArtifact {
            version: sources.dashboard_version.clone(),
            commit: sources.dashboard_commit.clone(),
            artifact: by_path(&sources.dashboard.dest_relative)?,
        },
        updater_version: sources.updater_version.clone(),
        updater: by_path(&sources.updater.dest_relative)?,
        a2a_component: A2aComponentEvidence {
            component_lock: evidence(&by_path(&sources.component_lock.dest_relative)?),
            runtime: BundledRuntimeEvidence {
                root: sources.a2a_runtime.dest_relative.clone(),
                // Proven placed by the scan, not asserted: an entrypoint the freeze
                // recipe did not emit fails here rather than at first launch.
                entrypoint: by_path(&runtime_entrypoint_path(&sources.a2a_runtime))?.path,
                file_count: runtime_files,
            },
        },
        licenses: sources
            .licenses
            .iter()
            .map(|license| {
                Ok(LicenseArtifact {
                    component: license.component.clone(),
                    spdx: license.spdx.clone(),
                    path: license.dest_relative.clone(),
                    digest: by_path(&license.dest_relative)?.digest,
                })
            })
            .collect::<Result<Vec<_>, ProductBuildError>>()?,
        sbom: SbomArtifact {
            format: sources.sbom_format.clone(),
            artifact: by_path(&sources.sbom.dest_relative)?,
        },
        file_digests: file_digests_from_scan(&scanned, &sources.release_manifest_path),
    };

    // EMIT + self-verify, then write the manifest into the tree.
    let raw = emit_member_manifest(&member, lock)?;
    let manifest_path = generation_root.join(&sources.release_manifest_path);
    if let Some(parent) = manifest_path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| io("create_dir_all", parent, &error))?;
    }
    std::fs::write(&manifest_path, raw.as_bytes())
        .map_err(|error| io("write", &manifest_path, &error))?;

    // PROVE the written manifest describes exactly the final tree (now including
    // the manifest itself, which the completeness law excludes by its own path).
    let final_scan = scan_composed_tree(generation_root)?;
    verify_member_covers_tree(&member, &final_scan)?;
    Ok(raw)
}

/// An I/O failure that names WHAT it was operating on.
///
/// `std::io::Error`'s Display carries only the errno text — "No such file or
/// directory (os error 2)" — with no path. Every I/O site in this file used to
/// discard the context, so a build that died on a missing declared input could
/// not say WHICH input, and all fourteen sites became candidates. That was not
/// hypothetical: the first four-target release build failed here, and the
/// offending path had to be identified by elimination against the build spec
/// rather than simply read out of the error.
fn io(operation: &str, path: &Path, error: &std::io::Error) -> ProductBuildError {
    ProductBuildError::Io(format!("{operation} {}: {error}", path.display()))
}

/// Copy one source file to `root/dest_relative`, creating parent directories.
fn place(root: &Path, source: &Path, dest_relative: &str) -> Result<(), ProductBuildError> {
    let dest = root.join(dest_relative);
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|error| io("create_dir_all", parent, &error))?;
    }
    // Names the SOURCE: a missing declared input is the failure this reports.
    std::fs::copy(source, &dest).map_err(|error| io("copy", source, &error))?;
    Ok(())
}

/// The app-tree-relative path of the bundled runtime's entrypoint.
fn runtime_entrypoint_path(runtime: &RuntimeSource) -> String {
    format!("{}/{}", runtime.dest_relative, runtime.entrypoint_relative)
}

/// Place the built onedir as a directory of ordinary regular files under
/// `root/dest_relative`, returning how many regular files were placed.
///
/// The generation tree admits regular files only, and every non-root directory
/// must be an ancestor of at least one regular file. Both constraints flow UPSTREAM
/// to the freeze recipe rather than downstream into a verifier exception, so a
/// symlink, reparse object, or empty directory in the built onedir is REFUSED here
/// — in the pipeline that produced it, where it is diagnosable — instead of being
/// silently dereferenced by a following copy or silently dropped from the tree.
fn place_runtime(root: &Path, runtime: &RuntimeSource) -> Result<usize, ProductBuildError> {
    let mut placed = 0_usize;
    place_runtime_dir(
        &runtime.source_dir,
        &root.join(&runtime.dest_relative),
        &runtime.dest_relative,
        &mut placed,
    )?;
    if placed == 0 {
        return Err(ProductBuildError::EmptyDirectory {
            path: runtime.dest_relative.clone(),
        });
    }
    Ok(placed)
}

fn place_runtime_dir(
    source: &Path,
    dest: &Path,
    relative: &str,
    placed: &mut usize,
) -> Result<(), ProductBuildError> {
    std::fs::create_dir_all(dest).map_err(|error| io("create_dir_all", dest, &error))?;
    let entries = std::fs::read_dir(source).map_err(|error| io("read_dir", source, &error))?;
    let mut seen = false;
    for entry in entries {
        let entry = entry.map_err(|error| io("read_dir entry under", source, &error))?;
        let path = entry.path();
        let metadata = std::fs::symlink_metadata(&path)
            .map_err(|error| io("symlink_metadata", &path, &error))?;
        let name = entry
            .file_name()
            .to_str()
            .ok_or_else(|| ProductBuildError::NonUtf8Name {
                path: entry.file_name().to_string_lossy().into_owned(),
            })?
            .to_owned();
        let child_relative = format!("{relative}/{name}");
        seen = true;
        if metadata.file_type().is_dir() {
            place_runtime_dir(&path, &dest.join(&name), &child_relative, placed)?;
        } else if metadata.file_type().is_file() {
            std::fs::copy(&path, dest.join(&name)).map_err(|error| io("copy", &path, &error))?;
            *placed += 1;
        } else {
            return Err(ProductBuildError::NonRegularEntry {
                path: child_relative,
            });
        }
    }
    if !seen {
        return Err(ProductBuildError::EmptyDirectory {
            path: relative.to_owned(),
        });
    }
    Ok(())
}

fn evidence(artifact: &ComposedArtifact) -> EvidenceArtifact {
    EvidenceArtifact {
        path: artifact.path.clone(),
        digest: artifact.digest.clone(),
    }
}

/// Emit a schema-2.0 release-set member manifest from the composed facts, deriving
/// the source pin from the trusted `lock`, then SELF-VERIFY the emitted bytes
/// through the production verifier.
///
/// The returned string is the canonical member-manifest JSON, proven valid against
/// the same lock a consumer trusts. An emit that disagrees with the pin — or a
/// builder defect — fails here rather than shipping.
pub fn emit_member_manifest(
    member: &ComposedMember,
    lock: &ComponentLock,
) -> Result<String, ProductBuildError> {
    let manifest = build_member(member, lock);
    let raw = serde_json::to_string(&manifest)
        .map_err(|error| ProductBuildError::Serialize(error.to_string()))?;
    // Prove the emitted bytes verify under the production authority (pin-skew,
    // floating selectors, target mismatch, self-authorizing lock all rejected).
    ReleaseSetManifest::parse_and_verify(&raw, lock).map_err(ProductBuildError::SelfVerify)?;
    Ok(raw)
}

fn build_member(member: &ComposedMember, lock: &ComponentLock) -> Member {
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
            runtime: BundledRuntimeOut {
                root: member.a2a_component.runtime.root.clone(),
                entrypoint: member.a2a_component.runtime.entrypoint.clone(),
                file_count: member.a2a_component.runtime.file_count,
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
    runtime: BundledRuntimeOut,
}

#[derive(Serialize)]
struct BundledRuntimeOut {
    root: String,
    entrypoint: String,
    file_count: usize,
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

// The only test here exercises Windows-specific non-UTF-8 name handling, so the
// whole module is Windows-gated; on other platforms it would be an empty module
// with an unused `super::*` import.
#[cfg(all(test, windows))]
mod tests {
    use super::*;

    /// `portable_relative` refuses a non-UTF-8 name OUTRIGHT, so a mangled
    /// replacement-character key can never enter the scan even transiently. On
    /// Windows an unpaired surrogate is a valid OS name but not UTF-8 — the exact
    /// case `to_string_lossy` would have silently corrupted.
    #[test]
    fn portable_relative_refuses_a_non_utf8_component() {
        use std::os::windows::ffi::OsStringExt as _;

        let bad = std::ffi::OsString::from_wide(&[0xD800]);
        let root = Path::new("root");
        let path = root.join(&bad);
        let refused = portable_relative(root, &path);
        assert!(
            matches!(refused, Err(ProductBuildError::NonUtf8Name { .. })),
            "a non-UTF-8 component must be refused before any lossy conversion"
        );
    }
}
