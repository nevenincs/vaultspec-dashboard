//! Release-engineering seam for producing metadata verified by this crate.
//!
//! The caller supplies externally managed signing-key paths and an already
//! signed root.  This module never generates, stores, or blesses production
//! keys and does not turn its input root into product trust authority.

use super::{
    COHORT_TARGET_NAME, DistributionTarget, MAX_ARCHIVE_BYTES, MAX_COHORT_BYTES, MAX_RELEASE_BYTES,
    TARGETS, hex_lower, portable_relative_path, valid_digest,
};
use base64::Engine as _;
use futures_util::TryStreamExt as _;
use jiff::Timestamp;
use serde::{Deserialize, Serialize};
use sha2::{Digest as _, Sha256};
use std::fs::OpenOptions;
use std::io::{Read as _, Write as _};
use std::num::NonZeroU64;
use std::path::{Path, PathBuf};
use thiserror::Error;
use tough::editor::RepositoryEditor;
use tough::key_source::{KeySource, LocalKeySource};
use tough::{
    ExpirationEnforcement, FilesystemTransport, IntoVec as _, Limits, RepositoryLoader, TargetName,
};
use url::Url;

const MAX_ROOT_HISTORY: usize = 32;

#[derive(Debug, Clone, Serialize, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ReleaseCohort {
    pub schema_version: String,
    pub release_identity: String,
    pub component_lock: ComponentLock,
    pub dashboard: ReleaseMetadata,
    pub updater: ReleaseMetadata,
    pub capsule: CapsuleMetadata,
    pub protocol: CompatibilityRange,
    pub state: CompatibilityRange,
    pub licenses: FileReference,
    pub sbom: FileReference,
    pub members: Vec<ReleaseMember>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ComponentLock {
    pub bytes_base64: String,
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ReleaseMetadata {
    pub version: String,
    pub commit: String,
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CapsuleMetadata {
    pub root: String,
    pub manifest_path: String,
    pub contract_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CompatibilityRange {
    pub minimum: u32,
    pub maximum: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct FileReference {
    pub path: String,
    pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ReleaseMember {
    pub target: DistributionTarget,
    pub archive: String,
    pub archive_length: u64,
    pub archive_sha256: String,
    pub member_manifest_sha256: String,
}

/// Paths to role keys held outside the repository and product artifacts.
#[derive(Debug)]
pub struct RoleSigningKeys {
    pub targets: PathBuf,
    pub snapshot: PathBuf,
    pub timestamp: PathBuf,
}

/// One bounded repository-publication operation.
#[derive(Debug)]
pub struct PublicationRequest {
    /// Complete ordered root history beginning at version one.
    pub root_history: Vec<PathBuf>,
    pub source_targets: PathBuf,
    pub output_metadata: PathBuf,
    pub output_targets: PathBuf,
    pub signing_keys: RoleSigningKeys,
    pub targets_version: NonZeroU64,
    pub snapshot_version: NonZeroU64,
    pub timestamp_version: NonZeroU64,
    pub targets_expires: Timestamp,
    pub snapshot_expires: Timestamp,
    pub timestamp_expires: Timestamp,
    pub cohort: ReleaseCohort,
}

/// Observed completion of a caller-designated two-directory repository copy.
///
/// This value is status, not distribution authority. The metadata and target
/// directories are verified together immediately before return, but their two
/// pathnames are not one atomic publication unit and can change after return.
#[derive(Debug, Copy, Clone, Eq, PartialEq)]
#[must_use = "publication status is not durable distribution authority"]
pub struct UnsealedPublication {
    pub root_version: NonZeroU64,
}

#[derive(Debug, Error)]
pub enum PublicationError {
    #[error("Windows owner-private publication staging is not provisioned")]
    WindowsPrivateStagingNotProvisioned,
    #[error("publication input violates the six-member release contract")]
    InvalidRelease,
    #[error("publication filesystem operation failed")]
    Filesystem(#[source] std::io::Error),
    #[error("TUF metadata publication failed")]
    Tuf(#[source] Box<tough::error::Error>),
    #[error("canonical cohort serialization failed")]
    Canonical(#[source] serde_json::Error),
}

impl From<tough::error::Error> for PublicationError {
    fn from(error: tough::error::Error) -> Self {
        Self::Tuf(Box::new(error))
    }
}

/// Produce signed metadata and consistent-snapshot target files.
///
/// This is a metadata-builder/signer-facing seam, not an authorization seam:
/// the signed root and private role keys remain caller-managed inputs.
pub async fn write_release_repository(
    request: PublicationRequest,
) -> Result<UnsealedPublication, PublicationError> {
    let staging = create_private_publication_staging()?;
    write_release_repository_inner(request, staging).await
}

#[cfg(test)]
pub(crate) async fn write_test_repository(
    request: PublicationRequest,
) -> Result<UnsealedPublication, PublicationError> {
    #[cfg(unix)]
    let staging = create_private_publication_staging()?;
    #[cfg(windows)]
    let staging = tempfile::Builder::new()
        .prefix("vaultspec-test-release-publication-")
        .tempdir()
        .map_err(PublicationError::Filesystem)?;
    write_release_repository_inner(request, staging).await
}

async fn write_release_repository_inner(
    request: PublicationRequest,
    staging: tempfile::TempDir,
) -> Result<UnsealedPublication, PublicationError> {
    validate_publication_fields(&request)?;
    let input = staging.path().join("input");
    let repository = staging.path().join("repository");
    let private_metadata = repository.join("metadata");
    let private_targets = repository.join("targets");
    create_private_staging_directory(&input)?;
    create_private_staging_directory(&repository)?;
    create_private_staging_directory(&private_metadata)?;
    create_private_staging_directory(&private_targets)?;

    let roots = stage_root_history(&request.root_history, &input)?;
    let cohort_bytes = serde_jcs::to_vec(&request.cohort).map_err(PublicationError::Canonical)?;
    if cohort_bytes.len() as u64 > MAX_COHORT_BYTES {
        return Err(PublicationError::InvalidRelease);
    }
    stage_publication_targets(&request, &input, &cohort_bytes)?;

    let target_paths = std::iter::once(input.join(COHORT_TARGET_NAME))
        .chain(TARGETS.iter().map(|(name, _)| input.join(name)))
        .collect::<Vec<_>>();
    let mut editor = RepositoryEditor::new(&roots.latest_path)
        .await
        .map_err(PublicationError::from)?;
    editor
        .targets_version(request.targets_version)
        .map_err(PublicationError::from)?;
    editor
        .targets_expires(request.targets_expires)
        .map_err(PublicationError::from)?;
    editor.snapshot_version(request.snapshot_version);
    editor.snapshot_expires(request.snapshot_expires);
    editor.timestamp_version(request.timestamp_version);
    editor.timestamp_expires(request.timestamp_expires);
    editor
        .add_target_paths(target_paths)
        .await
        .map_err(PublicationError::from)?;

    precreate_metadata_files(&private_metadata, &request, roots.latest_version)?;
    let keys: Vec<Box<dyn KeySource>> = vec![
        Box::new(LocalKeySource {
            path: request.signing_keys.targets,
        }),
        Box::new(LocalKeySource {
            path: request.signing_keys.snapshot,
        }),
        Box::new(LocalKeySource {
            path: request.signing_keys.timestamp,
        }),
    ];
    let signed = editor.sign(&keys).await.map_err(PublicationError::from)?;
    signed
        .write(&private_metadata)
        .await
        .map_err(PublicationError::from)?;
    copy_root_history(&input, &private_metadata, roots.latest_version)?;
    copy_staged_targets(&input, &private_targets, &cohort_bytes, &request.cohort)?;
    verify_repository_at_paths(
        &roots.initial_bytes,
        &private_metadata,
        &private_targets,
        roots.latest_version,
        &request.cohort,
    )
    .await?;
    publish_unsealed_repository(
        &private_metadata,
        &private_targets,
        &request.output_metadata,
        &request.output_targets,
    )?;
    verify_repository_at_paths(
        &roots.initial_bytes,
        &request.output_metadata,
        &request.output_targets,
        roots.latest_version,
        &request.cohort,
    )
    .await?;
    Ok(UnsealedPublication {
        root_version: roots.latest_version,
    })
}

fn validate_publication_fields(request: &PublicationRequest) -> Result<(), PublicationError> {
    if request.root_history.is_empty()
        || request.root_history.len() > MAX_ROOT_HISTORY
        || !request.source_targets.is_dir()
        || request.output_metadata == request.output_targets
        || request.output_metadata.starts_with(&request.output_targets)
        || request.output_targets.starts_with(&request.output_metadata)
        || request.output_metadata.starts_with(&request.source_targets)
        || request.output_targets.starts_with(&request.source_targets)
        || request.source_targets.starts_with(&request.output_metadata)
        || request.source_targets.starts_with(&request.output_targets)
        || request.cohort.schema_version != "1.0"
        || request.cohort.release_identity.is_empty()
        || request.cohort.release_identity.len() > 128
        || request.cohort.component_lock.bytes_base64.len() > 1_400_000
        || request.cohort.dashboard.version.len() > 128
        || request.cohort.dashboard.commit.len() > 128
        || request.cohort.updater.version.len() > 128
        || request.cohort.updater.commit.len() > 128
        || request.cohort.capsule.root.len() > 4096
        || request.cohort.capsule.manifest_path.len() > 4096
        || request.cohort.capsule.contract_version.len() > 128
        || request.cohort.licenses.path.len() > 4096
        || request.cohort.sbom.path.len() > 4096
        || request.cohort.members.len() != TARGETS.len()
        || !valid_digest(&request.cohort.component_lock.sha256)
        || !valid_digest(&request.cohort.dashboard.sha256)
        || !valid_digest(&request.cohort.updater.sha256)
        || !valid_digest(&request.cohort.licenses.sha256)
        || !valid_digest(&request.cohort.sbom.sha256)
        || !portable_relative_path(&request.cohort.capsule.root)
        || !portable_relative_path(&request.cohort.capsule.manifest_path)
        || !portable_relative_path(&request.cohort.licenses.path)
        || !portable_relative_path(&request.cohort.sbom.path)
        || request.cohort.protocol.minimum > request.cohort.protocol.maximum
        || request.cohort.state.minimum > request.cohort.state.maximum
    {
        return Err(PublicationError::InvalidRelease);
    }

    let component_lock = base64::engine::general_purpose::STANDARD
        .decode(&request.cohort.component_lock.bytes_base64)
        .map_err(|_| PublicationError::InvalidRelease)?;
    if component_lock.len() > 1024 * 1024
        || hex_lower(&Sha256::digest(&component_lock)) != request.cohort.component_lock.sha256
    {
        return Err(PublicationError::InvalidRelease);
    }

    for ((name, target), member) in TARGETS.iter().zip(&request.cohort.members) {
        if member.target != *target
            || member.archive != *name
            || member.archive_length > MAX_ARCHIVE_BYTES
            || !valid_digest(&member.archive_sha256)
            || !valid_digest(&member.member_manifest_sha256)
        {
            return Err(PublicationError::InvalidRelease);
        }
    }
    validate_source_directory(&request.source_targets)
}

struct StagedRootHistory {
    initial_bytes: Vec<u8>,
    latest_path: PathBuf,
    latest_version: NonZeroU64,
}

fn stage_root_history(
    history: &[PathBuf],
    staging: &Path,
) -> Result<StagedRootHistory, PublicationError> {
    let mut previous: Option<tough::schema::Signed<tough::schema::Root>> = None;
    let mut initial_bytes = None;
    let mut latest_path = None;
    let mut latest_version = None;
    for (index, path) in history.iter().enumerate() {
        let bytes = bounded_publication_read(path, 256 * 1024)?;
        let root: tough::schema::Signed<tough::schema::Root> =
            serde_json::from_slice(&bytes).map_err(PublicationError::Canonical)?;
        let version = root.signed.version;
        let expected = u64::try_from(index)
            .ok()
            .and_then(|index| index.checked_add(1))
            .ok_or(PublicationError::InvalidRelease)?;
        if version.get() != expected
            || !root.signed.consistent_snapshot
            || root.signed.verify_role(&root).is_err()
            || previous
                .as_ref()
                .is_some_and(|trusted| trusted.signed.verify_role(&root).is_err())
        {
            return Err(PublicationError::InvalidRelease);
        }
        let staged_path = staging.join(format!("{version}.root.json"));
        write_staged_file(&staged_path, &bytes)?;
        if index == 0 {
            initial_bytes = Some(bytes);
        }
        latest_path = Some(staged_path);
        latest_version = Some(version);
        previous = Some(root);
    }
    Ok(StagedRootHistory {
        initial_bytes: initial_bytes.ok_or(PublicationError::InvalidRelease)?,
        latest_path: latest_path.ok_or(PublicationError::InvalidRelease)?,
        latest_version: latest_version.ok_or(PublicationError::InvalidRelease)?,
    })
}

fn stage_publication_targets(
    request: &PublicationRequest,
    staging: &Path,
    cohort_bytes: &[u8],
) -> Result<(), PublicationError> {
    write_staged_file(&staging.join(COHORT_TARGET_NAME), cohort_bytes)?;
    let mut total = cohort_bytes.len() as u64;
    for ((name, _), member) in TARGETS.iter().zip(&request.cohort.members) {
        let path = request.source_targets.join(name);
        let named = path
            .symlink_metadata()
            .map_err(PublicationError::Filesystem)?;
        if !named.is_file() || named.file_type().is_symlink() || named.len() > MAX_ARCHIVE_BYTES {
            return Err(PublicationError::InvalidRelease);
        }
        let mut source = std::fs::File::open(&path).map_err(PublicationError::Filesystem)?;
        let retained = source.metadata().map_err(PublicationError::Filesystem)?;
        if !retained.is_file() || retained.len() > MAX_ARCHIVE_BYTES {
            return Err(PublicationError::InvalidRelease);
        }
        let mut staged = create_private_staging_file(&staging.join(name))?;
        let mut hasher = Sha256::new();
        let mut buffer = [0_u8; 64 * 1024];
        let mut observed = 0_u64;
        loop {
            let read = source
                .read(&mut buffer)
                .map_err(PublicationError::Filesystem)?;
            if read == 0 {
                break;
            }
            observed = observed
                .checked_add(read as u64)
                .ok_or(PublicationError::InvalidRelease)?;
            if observed > member.archive_length || observed > MAX_ARCHIVE_BYTES {
                return Err(PublicationError::InvalidRelease);
            }
            hasher.update(&buffer[..read]);
            staged
                .write_all(&buffer[..read])
                .map_err(PublicationError::Filesystem)?;
        }
        if observed != member.archive_length
            || hex_lower(&hasher.finalize()) != member.archive_sha256
        {
            return Err(PublicationError::InvalidRelease);
        }
        staged.sync_all().map_err(PublicationError::Filesystem)?;
        total = total
            .checked_add(observed)
            .ok_or(PublicationError::InvalidRelease)?;
        if total > MAX_RELEASE_BYTES {
            return Err(PublicationError::InvalidRelease);
        }
    }
    Ok(())
}

fn write_staged_file(path: &Path, bytes: &[u8]) -> Result<(), PublicationError> {
    let mut file = create_private_staging_file(path)?;
    file.write_all(bytes)
        .and_then(|()| file.sync_all())
        .map_err(PublicationError::Filesystem)
}

#[cfg(unix)]
fn create_private_publication_staging() -> Result<tempfile::TempDir, PublicationError> {
    let staging = tempfile::Builder::new()
        .prefix("vaultspec-release-publication-")
        .tempdir()
        .map_err(PublicationError::Filesystem)?;
    validate_private_directory(staging.path(), true)?;
    Ok(staging)
}

#[cfg(windows)]
fn create_private_publication_staging() -> Result<tempfile::TempDir, PublicationError> {
    Err(PublicationError::WindowsPrivateStagingNotProvisioned)
}

fn create_private_staging_directory(path: &Path) -> Result<(), PublicationError> {
    std::fs::create_dir(path).map_err(PublicationError::Filesystem)?;
    #[cfg(unix)]
    validate_private_directory(path, true)?;
    Ok(())
}

#[cfg(unix)]
fn validate_private_directory(path: &Path, set_mode: bool) -> Result<(), PublicationError> {
    use std::os::unix::fs::{MetadataExt as _, PermissionsExt as _};

    let named = path
        .symlink_metadata()
        .map_err(PublicationError::Filesystem)?;
    let retained = std::fs::File::open(path).map_err(PublicationError::Filesystem)?;
    if set_mode {
        retained
            .set_permissions(std::fs::Permissions::from_mode(0o700))
            .map_err(PublicationError::Filesystem)?;
    }
    let metadata = retained.metadata().map_err(PublicationError::Filesystem)?;
    if !named.is_dir()
        || named.file_type().is_symlink()
        || named.dev() != metadata.dev()
        || named.ino() != metadata.ino()
        || metadata.uid() != nix::unistd::Uid::effective().as_raw()
        || metadata.permissions().mode() & 0o777 != 0o700
    {
        return Err(PublicationError::InvalidRelease);
    }
    Ok(())
}

fn create_private_staging_file(path: &Path) -> Result<std::fs::File, PublicationError> {
    let mut options = OpenOptions::new();
    options.read(true).write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt as _;
        options.mode(0o600);
    }
    let file = options.open(path).map_err(PublicationError::Filesystem)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::{MetadataExt as _, PermissionsExt as _};
        let named = path
            .symlink_metadata()
            .map_err(PublicationError::Filesystem)?;
        let retained = file.metadata().map_err(PublicationError::Filesystem)?;
        if !named.is_file()
            || named.file_type().is_symlink()
            || named.dev() != retained.dev()
            || named.ino() != retained.ino()
            || retained.nlink() != 1
            || retained.uid() != nix::unistd::Uid::effective().as_raw()
            || retained.permissions().mode() & 0o777 != 0o600
        {
            return Err(PublicationError::InvalidRelease);
        }
    }
    Ok(file)
}

fn precreate_metadata_files(
    directory: &Path,
    request: &PublicationRequest,
    root_version: NonZeroU64,
) -> Result<(), PublicationError> {
    for name in [
        format!("{root_version}.root.json"),
        format!("{}.targets.json", request.targets_version),
        format!("{}.snapshot.json", request.snapshot_version),
        "timestamp.json".to_owned(),
    ] {
        drop(create_private_staging_file(&directory.join(name))?);
    }
    Ok(())
}

fn copy_root_history(
    input: &Path,
    metadata: &Path,
    latest_version: NonZeroU64,
) -> Result<(), PublicationError> {
    for version in 1..=latest_version.get() {
        let name = format!("{version}.root.json");
        let destination = metadata.join(&name);
        if version != latest_version.get() {
            drop(create_private_staging_file(&destination)?);
        }
        copy_into_precreated(&input.join(name), &destination, 256 * 1024)?;
    }
    Ok(())
}

fn copy_staged_targets(
    input: &Path,
    output: &Path,
    cohort_bytes: &[u8],
    cohort: &ReleaseCohort,
) -> Result<(), PublicationError> {
    let cohort_digest = hex_lower(&Sha256::digest(cohort_bytes));
    let cohort_name = format!("{cohort_digest}.{COHORT_TARGET_NAME}");
    let cohort_destination = output.join(cohort_name);
    drop(create_private_staging_file(&cohort_destination)?);
    copy_into_precreated(
        &input.join(COHORT_TARGET_NAME),
        &cohort_destination,
        MAX_COHORT_BYTES,
    )?;
    for member in &cohort.members {
        let name = format!("{}.{}", member.archive_sha256, member.archive);
        let destination = output.join(name);
        drop(create_private_staging_file(&destination)?);
        copy_into_precreated(
            &input.join(&member.archive),
            &destination,
            MAX_ARCHIVE_BYTES,
        )?;
    }
    Ok(())
}

fn copy_into_precreated(
    source: &Path,
    destination: &Path,
    maximum: u64,
) -> Result<(), PublicationError> {
    let mut source = std::fs::File::open(source).map_err(PublicationError::Filesystem)?;
    let mut destination = OpenOptions::new()
        .write(true)
        .truncate(true)
        .open(destination)
        .map_err(PublicationError::Filesystem)?;
    let mut buffer = [0_u8; 64 * 1024];
    let mut observed = 0_u64;
    loop {
        let read = source
            .read(&mut buffer)
            .map_err(PublicationError::Filesystem)?;
        if read == 0 {
            break;
        }
        observed = observed
            .checked_add(read as u64)
            .ok_or(PublicationError::InvalidRelease)?;
        if observed > maximum {
            return Err(PublicationError::InvalidRelease);
        }
        destination
            .write_all(&buffer[..read])
            .map_err(PublicationError::Filesystem)?;
    }
    destination.sync_all().map_err(PublicationError::Filesystem)
}

async fn verify_repository_at_paths(
    initial_root: &[u8],
    metadata: &Path,
    targets: &Path,
    latest_root_version: NonZeroU64,
    expected_cohort: &ReleaseCohort,
) -> Result<(), PublicationError> {
    let metadata_url =
        Url::from_directory_path(metadata).map_err(|()| PublicationError::InvalidRelease)?;
    let targets_url =
        Url::from_directory_path(targets).map_err(|()| PublicationError::InvalidRelease)?;
    let repository = RepositoryLoader::new(&initial_root, metadata_url, targets_url)
        .transport(FilesystemTransport)
        .limits(Limits {
            max_root_size: 256 * 1024,
            max_targets_size: 256 * 1024,
            max_timestamp_size: 64 * 1024,
            max_snapshot_size: 64 * 1024,
            max_root_updates: 32,
        })
        .expiration_enforcement(ExpirationEnforcement::Safe)
        .load()
        .await
        .map_err(PublicationError::from)?;
    if repository.root().signed.version != latest_root_version
        || repository.all_targets().count() != TARGETS.len() + 1
    {
        return Err(PublicationError::InvalidRelease);
    }
    let cohort_name =
        TargetName::new(COHORT_TARGET_NAME).map_err(|_| PublicationError::InvalidRelease)?;
    let cohort_bytes = repository
        .read_target(&cohort_name)
        .await
        .map_err(PublicationError::from)?
        .ok_or(PublicationError::InvalidRelease)?
        .into_vec()
        .await
        .map_err(PublicationError::from)?;
    let observed_cohort: ReleaseCohort =
        serde_json::from_slice(&cohort_bytes).map_err(PublicationError::Canonical)?;
    if &observed_cohort != expected_cohort
        || serde_jcs::to_vec(&observed_cohort).map_err(PublicationError::Canonical)? != cohort_bytes
    {
        return Err(PublicationError::InvalidRelease);
    }
    for member in &expected_cohort.members {
        let name =
            TargetName::new(&member.archive).map_err(|_| PublicationError::InvalidRelease)?;
        let mut stream = repository
            .read_target(&name)
            .await
            .map_err(PublicationError::from)?
            .ok_or(PublicationError::InvalidRelease)?;
        let mut hasher = Sha256::new();
        let mut observed = 0_u64;
        while let Some(chunk) = stream.try_next().await.map_err(PublicationError::from)? {
            observed = observed
                .checked_add(chunk.len() as u64)
                .ok_or(PublicationError::InvalidRelease)?;
            if observed > member.archive_length || observed > MAX_ARCHIVE_BYTES {
                return Err(PublicationError::InvalidRelease);
            }
            hasher.update(&chunk);
        }
        if observed != member.archive_length
            || hex_lower(&hasher.finalize()) != member.archive_sha256
        {
            return Err(PublicationError::InvalidRelease);
        }
    }
    Ok(())
}

fn publish_unsealed_repository(
    private_metadata: &Path,
    private_targets: &Path,
    output_metadata: &Path,
    output_targets: &Path,
) -> Result<(), PublicationError> {
    create_unsealed_output_directory(output_metadata)?;
    create_unsealed_output_directory(output_targets)?;
    copy_directory_exact(
        private_metadata,
        output_metadata,
        MAX_ROOT_HISTORY + 3,
        256 * 1024,
    )?;
    copy_directory_exact(
        private_targets,
        output_targets,
        TARGETS.len() + 1,
        MAX_ARCHIVE_BYTES,
    )?;
    Ok(())
}

fn create_unsealed_output_directory(path: &Path) -> Result<(), PublicationError> {
    match path.symlink_metadata() {
        Ok(_) => return Err(PublicationError::InvalidRelease),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(PublicationError::Filesystem(error)),
    }
    let parent = path.parent().ok_or(PublicationError::InvalidRelease)?;
    std::fs::create_dir_all(parent).map_err(PublicationError::Filesystem)?;
    std::fs::create_dir(path).map_err(PublicationError::Filesystem)?;
    #[cfg(unix)]
    validate_private_directory(path, true)?;
    Ok(())
}

fn copy_directory_exact(
    source: &Path,
    destination: &Path,
    maximum_entries: usize,
    maximum_file_bytes: u64,
) -> Result<(), PublicationError> {
    let mut entries = 0_usize;
    for entry in std::fs::read_dir(source).map_err(PublicationError::Filesystem)? {
        let entry = entry.map_err(PublicationError::Filesystem)?;
        entries += 1;
        if entries > maximum_entries {
            return Err(PublicationError::InvalidRelease);
        }
        let name = entry.file_name();
        let metadata = entry
            .path()
            .symlink_metadata()
            .map_err(PublicationError::Filesystem)?;
        if !metadata.is_file() || metadata.file_type().is_symlink() {
            return Err(PublicationError::InvalidRelease);
        }
        let output = destination.join(name);
        drop(create_private_staging_file(&output)?);
        copy_into_precreated(&entry.path(), &output, maximum_file_bytes)?;
    }
    if entries == 0 {
        return Err(PublicationError::InvalidRelease);
    }
    Ok(())
}

fn validate_source_directory(path: &Path) -> Result<(), PublicationError> {
    let mut entries = 0_usize;
    let mut seen = Vec::with_capacity(TARGETS.len());
    for entry in std::fs::read_dir(path).map_err(PublicationError::Filesystem)? {
        let entry = entry.map_err(PublicationError::Filesystem)?;
        entries += 1;
        if entries > TARGETS.len() {
            return Err(PublicationError::InvalidRelease);
        }
        let name = entry
            .file_name()
            .into_string()
            .map_err(|_| PublicationError::InvalidRelease)?;
        let metadata = entry.metadata().map_err(PublicationError::Filesystem)?;
        if !metadata.is_file()
            || entry
                .path()
                .symlink_metadata()
                .map_err(PublicationError::Filesystem)?
                .file_type()
                .is_symlink()
            || !TARGETS.iter().any(|(expected, _)| *expected == name)
            || seen.contains(&name)
        {
            return Err(PublicationError::InvalidRelease);
        }
        seen.push(name);
    }
    if entries != TARGETS.len() {
        return Err(PublicationError::InvalidRelease);
    }
    Ok(())
}

fn bounded_publication_read(path: &Path, maximum: u64) -> Result<Vec<u8>, PublicationError> {
    let metadata = path
        .symlink_metadata()
        .map_err(PublicationError::Filesystem)?;
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > maximum {
        return Err(PublicationError::InvalidRelease);
    }
    let mut file = std::fs::File::open(path).map_err(PublicationError::Filesystem)?;
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    std::io::Read::by_ref(&mut file)
        .take(maximum + 1)
        .read_to_end(&mut bytes)
        .map_err(PublicationError::Filesystem)?;
    if bytes.len() as u64 != metadata.len() || bytes.len() as u64 > maximum {
        return Err(PublicationError::InvalidRelease);
    }
    Ok(bytes)
}
