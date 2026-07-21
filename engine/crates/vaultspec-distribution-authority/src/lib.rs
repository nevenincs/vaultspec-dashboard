//! Fail-closed distribution authority for the vaultspec six-member release cohort.
//!
//! Verification is deliberately offline: repository metadata and targets are
//! read only through `tough`'s filesystem transport.  The production entrypoint
//! has no caller-supplied root-of-trust seam.  Until release engineering embeds
//! the separately approved root metadata, it returns a typed refusal.

mod materialization;
mod product_scope;
mod publication;

use materialization::StagedArchive;
pub use materialization::{MaterializationSource, VerifiedArchiveReader};
use product_scope::{ProcessVerificationLease, ProductRootScope};
pub use publication::{
    CapsuleMetadata, CompatibilityRange, ComponentLock, FileReference, PublicationError,
    PublicationRequest, ReleaseCohort, ReleaseMember, ReleaseMetadata, RoleSigningKeys,
    UnsealedPublication, write_release_repository,
};

use base64::Engine as _;
use cap_std::fs::{Dir, OpenOptions as CapOpenOptions};
use fs4::fs_std::FileExt as _;
use futures_util::TryStreamExt as _;
use serde::{Deserialize, Serialize};
use sha2::{Digest as _, Sha256};
use std::collections::BTreeMap;
use std::fmt;
use std::fs::File;
use std::io::{Read, Write as _};
use std::path::{Path, PathBuf};

use std::time::Duration;
use thiserror::Error;
use tokio::io::{AsyncReadExt as _, AsyncSeekExt as _, AsyncWriteExt as _};
use tough::{
    ExpirationEnforcement, FilesystemTransport, IntoVec as _, Limits, RepositoryLoader, TargetName,
};
use url::Url;

/// The only primary release target that is not a platform archive.
pub const COHORT_TARGET_NAME: &str = "cohort.v1.json";
/// Maximum accepted canonical cohort-record size.
pub const MAX_COHORT_BYTES: u64 = 256 * 1024;
/// Maximum accepted size of one platform archive.
pub const MAX_ARCHIVE_BYTES: u64 = 2 * 1024 * 1024 * 1024;
/// Maximum accepted aggregate size of the six primary targets.
pub const MAX_RELEASE_BYTES: u64 = 8 * 1024 * 1024 * 1024;

const MAX_METADATA_ENTRIES: usize = 40;
const MAX_METADATA_BYTES: u64 = 2 * 1024 * 1024;
const VERIFICATION_TIMEOUT: Duration = Duration::from_secs(60);
const LIVE_DATASTORE: &str = "distribution-trust";
const NEXT_DATASTORE: &str = "distribution-trust.next";
const PREVIOUS_DATASTORE: &str = "distribution-trust.previous";
const VERIFIED_STAGING: &str = "distribution-verified";
const VERIFICATION_LOCK: &str = "distribution-verification.lock";

// Release engineering replaces this value only after the separately approved
// root-key ceremony.  An empty value is an intentional, typed production gate.
const EMBEDDED_PRODUCTION_ROOT: &[u8] = b"";

const TARGETS: [(&str, DistributionTarget); 5] = [
    (
        "archive.aarch64-apple-darwin",
        DistributionTarget::Aarch64AppleDarwin,
    ),
    (
        "archive.x86_64-apple-darwin",
        DistributionTarget::X86_64AppleDarwin,
    ),
    (
        "archive.aarch64-unknown-linux-gnu",
        DistributionTarget::Aarch64UnknownLinuxGnu,
    ),
    (
        "archive.x86_64-unknown-linux-gnu",
        DistributionTarget::X86_64UnknownLinuxGnu,
    ),
    (
        "archive.x86_64-pc-windows-msvc",
        DistributionTarget::X86_64PcWindowsMsvc,
    ),
];

/// Supported release members.  The set is intentionally closed.
#[derive(Debug, Copy, Clone, Eq, PartialEq, Ord, PartialOrd, Serialize, Deserialize)]
pub enum DistributionTarget {
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

impl DistributionTarget {
    /// Parse an exact supported Rust target triple.
    pub fn parse(value: &str) -> Result<Self, VerificationError> {
        TARGETS
            .iter()
            .find_map(|(_, target)| (target.as_str() == value).then_some(*target))
            .ok_or(VerificationError::UnsupportedTarget)
    }

    /// Return the exact target triple.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Aarch64AppleDarwin => "aarch64-apple-darwin",
            Self::X86_64AppleDarwin => "x86_64-apple-darwin",
            Self::Aarch64UnknownLinuxGnu => "aarch64-unknown-linux-gnu",
            Self::X86_64UnknownLinuxGnu => "x86_64-unknown-linux-gnu",
            Self::X86_64PcWindowsMsvc => "x86_64-pc-windows-msvc",
        }
    }

    /// Return the fixed TUF target name for this archive.
    pub fn archive_name(self) -> &'static str {
        TARGETS
            .iter()
            .find_map(|(name, target)| (*target == self).then_some(*name))
            .expect("closed target enum has a fixed archive name")
    }
}

/// Filesystem-only inputs to production verification.
#[derive(Debug)]
pub struct VerificationRequest {
    bundle_directory: PathBuf,
    target: DistributionTarget,
    product_scope: ProductRootScope,
    product_root_path: PathBuf,
}

impl VerificationRequest {
    /// Derive the fixed rollback-authority location below a product-owned root.
    pub fn for_product_root(
        bundle_directory: impl Into<PathBuf>,
        product_root: &Path,
        target: DistributionTarget,
    ) -> Result<Self, VerificationError> {
        let product_scope = ProductRootScope::retain(product_root)?;
        Ok(Self {
            bundle_directory: bundle_directory.into(),
            target,
            product_scope,
            product_root_path: product_root.to_owned(),
        })
    }
}

/// Safe status returned after consuming verified authority.
#[derive(Debug, Eq, PartialEq)]
pub struct VerifiedReleaseStatus {
    pub release_identity: String,
    pub target: DistributionTarget,
}

/// Capability proving that TUF and cohort verification both completed.
///
/// This type intentionally implements neither `Clone` nor `Serialize`.  Its
/// private fields prevent callers from constructing or decomposing authority.
pub struct VerifiedDistributionRelease {
    target: DistributionTarget,
    cohort: ReleaseCohort,
    component_lock: Vec<u8>,
    canonical_cohort: Vec<u8>,
    selected_archive: StagedArchive,
    product_scope: ProductRootScope,
    _verification_lock: VerificationLock,
}

#[derive(Debug)]
struct VerificationLock {
    _process: ProcessVerificationLease,
    _file: File,
}

struct AttemptDatastore {
    _temporary: tempfile::TempDir,
    directory: Dir,
}

impl AttemptDatastore {
    fn path(&self) -> &Path {
        self._temporary.path()
    }
}

impl fmt::Debug for VerifiedDistributionRelease {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("VerifiedDistributionRelease")
            .field("target", &self.target)
            .field("release_identity", &self.cohort.release_identity)
            .finish_non_exhaustive()
    }
}

impl VerifiedDistributionRelease {
    pub fn target(&self) -> DistributionTarget {
        self.target
    }

    pub fn release_identity(&self) -> &str {
        &self.cohort.release_identity
    }

    pub fn component_lock(&self) -> &[u8] {
        &self.component_lock
    }

    pub fn canonical_cohort(&self) -> &[u8] {
        &self.canonical_cohort
    }

    pub fn capsule_root(&self) -> &str {
        &self.cohort.capsule.root
    }

    pub fn selected_member(&self) -> &ReleaseMember {
        self.cohort
            .members
            .iter()
            .find(|member| member.target == self.target)
            .expect("verified cohort contains every closed target")
    }

    /// Prove this authority was verified against the same retained product root.
    pub fn verify_for_product_root(&self, product_root: &Path) -> Result<(), VerificationError> {
        if self.product_scope.matches(product_root) {
            Ok(())
        } else {
            Err(VerificationError::ProductRootMismatch)
        }
    }

    /// Consume the authority token and disclose status-only information.
    pub fn into_status(self) -> VerifiedReleaseStatus {
        VerifiedReleaseStatus {
            release_identity: self.cohort.release_identity,
            target: self.target,
        }
    }
}

#[derive(Debug, Error)]
pub enum VerificationError {
    #[error("production distribution root is not provisioned")]
    ProductionRootNotProvisioned,
    #[error("unsupported distribution target")]
    UnsupportedTarget,
    #[error("distribution verification timed out")]
    Timeout,
    #[error("invalid bounded repository layout")]
    InvalidRepositoryLayout,
    #[error("repository metadata or target verification failed")]
    Tuf(#[source] Box<tough::error::Error>),
    #[error("release cohort is missing or unreadable")]
    CohortUnavailable,
    #[error("release cohort is not canonical RFC 8785 JSON")]
    NonCanonicalCohort,
    #[error("release cohort violates the six-member contract")]
    InvalidCohort,
    #[error("persistent distribution datastore is unavailable")]
    DatastoreUnavailable,
    #[error("persistent distribution datastore is partial, malformed, or unbounded")]
    InvalidDatastoreState,
    #[error("verified distribution authority belongs to a different product root")]
    ProductRootMismatch,
    #[error("verified archive staging is unavailable")]
    StagingUnavailable,
    #[error("Windows rollback-authority ACL verification is not provisioned")]
    WindowsDatastoreAuthorityNotProvisioned,
    #[error("another distribution verification owns the product rollback authority")]
    VerificationInProgress,
}

impl From<tough::error::Error> for VerificationError {
    fn from(error: tough::error::Error) -> Self {
        Self::Tuf(Box::new(error))
    }
}

enum InitialDatastore {
    Empty,
    Complete { root_bytes: Vec<u8> },
}

/// Verify a release exclusively from the embedded production root authority.
pub async fn verify_distribution(
    request: VerificationRequest,
) -> Result<VerifiedDistributionRelease, VerificationError> {
    if EMBEDDED_PRODUCTION_ROOT.is_empty() {
        return Err(VerificationError::ProductionRootNotProvisioned);
    }
    production_platform_gate()?;
    verify_with_root(EMBEDDED_PRODUCTION_ROOT, request).await
}

/// Verify a release from a CALLER-supplied TUF root, for out-of-crate acceptance
/// tests only (S11 Stage 1). Gated behind the `unsealed-verify` feature, which
/// is enabled exclusively under `vaultspec-product`'s dev-dependencies and
/// proven off in production via [`UNSEALED_VERIFY_ENABLED`].
///
/// Distribution-trust D3 constrains the PRODUCTION entrypoint
/// ([`verify_distribution`]); this seam leaves it unchanged and performs the
/// identical bounded verification against `root_bytes` instead of the embedded
/// (empty-until-ceremony) production root.
#[cfg(feature = "unsealed-verify")]
pub async fn verify_distribution_with_unsealed_root(
    root_bytes: &[u8],
    request: VerificationRequest,
) -> Result<VerifiedDistributionRelease, VerificationError> {
    verify_with_root(root_bytes, request).await
}

#[cfg(windows)]
fn production_platform_gate() -> Result<(), VerificationError> {
    Err(VerificationError::WindowsDatastoreAuthorityNotProvisioned)
}

#[cfg(not(windows))]
fn production_platform_gate() -> Result<(), VerificationError> {
    Ok(())
}

async fn verify_with_root(
    root: &[u8],
    request: VerificationRequest,
) -> Result<VerifiedDistributionRelease, VerificationError> {
    tokio::time::timeout(
        VERIFICATION_TIMEOUT,
        verify_with_root_bounded(root, request),
    )
    .await
    .map_err(|_| VerificationError::Timeout)?
}

async fn verify_with_root_bounded(
    root: &[u8],
    request: VerificationRequest,
) -> Result<VerifiedDistributionRelease, VerificationError> {
    if root.is_empty() || root.len() as u64 > 256 * 1024 {
        return Err(VerificationError::InvalidRepositoryLayout);
    }

    let metadata = request.bundle_directory.join("metadata");
    let targets = request.bundle_directory.join("targets");
    inspect_directory(&metadata, MAX_METADATA_ENTRIES, MAX_METADATA_BYTES, None)?;
    inspect_directory(&targets, 2, MAX_ARCHIVE_BYTES + MAX_COHORT_BYTES, Some(2))?;
    request
        .product_scope
        .ensure_named(&request.product_root_path)?;
    let verification_lock = acquire_cap_verification_lock(&request.product_scope)?;
    #[cfg(test)]
    eprintln!("distribution verification: capability lock acquired");
    request
        .product_scope
        .ensure_named(&request.product_root_path)?;
    recover_cap_datastore_layout(&request.product_scope.authority)?;
    #[cfg(test)]
    eprintln!("distribution verification: datastore layout recovered");
    request
        .product_scope
        .ensure_named(&request.product_root_path)?;
    let _ = ensure_cap_directory(&request.product_scope.authority, LIVE_DATASTORE)?;
    #[cfg(test)]
    eprintln!("distribution verification: live datastore opened");
    request
        .product_scope
        .ensure_named(&request.product_root_path)?;
    let initial_datastore =
        classify_cap_datastore(&request.product_scope.authority, LIVE_DATASTORE)?
            .ok_or(VerificationError::InvalidDatastoreState)?;
    request
        .product_scope
        .ensure_named(&request.product_root_path)?;
    let attempt_datastore =
        prepare_attempt_datastore(&request.product_scope.authority, &initial_datastore)?;
    let staging_directory = prepare_cap_staging(&request.product_scope.authority)?;
    #[cfg(test)]
    eprintln!("distribution verification: attempt and staging prepared");
    request
        .product_scope
        .ensure_named(&request.product_root_path)?;
    let trusted_root = match initial_datastore {
        InitialDatastore::Empty => root.to_vec(),
        InitialDatastore::Complete { root_bytes } => root_bytes,
    };

    let metadata_url = Url::from_directory_path(&metadata)
        .map_err(|()| VerificationError::InvalidRepositoryLayout)?;
    let targets_url = Url::from_directory_path(&targets)
        .map_err(|()| VerificationError::InvalidRepositoryLayout)?;
    request
        .product_scope
        .ensure_named(&request.product_root_path)?;
    let repository = RepositoryLoader::new(&trusted_root, metadata_url, targets_url)
        .transport(FilesystemTransport)
        .limits(Limits {
            max_root_size: 256 * 1024,
            max_targets_size: 256 * 1024,
            max_timestamp_size: 64 * 1024,
            max_snapshot_size: 64 * 1024,
            max_root_updates: 32,
        })
        .datastore(attempt_datastore.path())
        .expiration_enforcement(ExpirationEnforcement::Safe)
        .load()
        .await
        .map_err(VerificationError::from)?;
    #[cfg(test)]
    eprintln!("distribution verification: tough load complete");
    request
        .product_scope
        .ensure_named(&request.product_root_path)?;

    let has_delegations = repository
        .targets()
        .signed
        .delegations
        .as_ref()
        .is_some_and(|delegations| !delegations.keys.is_empty() || !delegations.roles.is_empty());
    if !repository.root().signed.consistent_snapshot
        || has_delegations
        || repository.all_targets().count() != 6
    {
        return Err(VerificationError::InvalidRepositoryLayout);
    }

    let expected_names = std::iter::once(COHORT_TARGET_NAME)
        .chain(TARGETS.iter().map(|(name, _)| *name))
        .collect::<Vec<_>>();
    let actual = repository
        .all_targets()
        .map(|(name, target)| (name.raw().to_owned(), target))
        .collect::<BTreeMap<_, _>>();
    if actual.len() != expected_names.len()
        || expected_names
            .iter()
            .any(|name| !actual.contains_key(*name))
    {
        return Err(VerificationError::InvalidRepositoryLayout);
    }

    let mut total = 0_u64;
    for name in &expected_names {
        let length = actual[*name].length;
        total = total
            .checked_add(length)
            .ok_or(VerificationError::InvalidRepositoryLayout)?;
        let limit = if *name == COHORT_TARGET_NAME {
            MAX_COHORT_BYTES
        } else {
            MAX_ARCHIVE_BYTES
        };
        if length > limit || total > MAX_RELEASE_BYTES {
            return Err(VerificationError::InvalidRepositoryLayout);
        }
    }

    let cohort_name = TargetName::new(COHORT_TARGET_NAME)
        .map_err(|_| VerificationError::InvalidRepositoryLayout)?;
    let cohort_bytes = repository
        .read_target(&cohort_name)
        .await
        .map_err(VerificationError::from)?
        .ok_or(VerificationError::CohortUnavailable)?
        .into_vec()
        .await
        .map_err(VerificationError::from)?
        .to_vec();
    if cohort_bytes.len() as u64 > MAX_COHORT_BYTES {
        return Err(VerificationError::InvalidRepositoryLayout);
    }
    let cohort: ReleaseCohort =
        serde_json::from_slice(&cohort_bytes).map_err(|_| VerificationError::InvalidCohort)?;
    let canonical = serde_jcs::to_vec(&cohort).map_err(|_| VerificationError::InvalidCohort)?;
    if canonical != cohort_bytes {
        return Err(VerificationError::NonCanonicalCohort);
    }
    let component_lock = validate_cohort(&cohort, &actual)?;

    // The install bundle contains only the selected archive.  Fully consuming
    // its stream makes tough validate length and digest before authority exists.
    let selected_name = TargetName::new(request.target.archive_name())
        .map_err(|_| VerificationError::InvalidRepositoryLayout)?;
    let mut stream = repository
        .read_target(&selected_name)
        .await
        .map_err(VerificationError::from)?
        .ok_or(VerificationError::InvalidRepositoryLayout)?;
    request
        .product_scope
        .ensure_named(&request.product_root_path)?;
    let selected_metadata = actual[request.target.archive_name()];
    let selected_archive_file = create_anonymous_staging_file(&staging_directory)?;
    let mut selected_archive_file = tokio::fs::File::from_std(selected_archive_file);
    while let Some(chunk) = stream.try_next().await.map_err(VerificationError::from)? {
        selected_archive_file
            .write_all(&chunk)
            .await
            .map_err(|_| VerificationError::StagingUnavailable)?;
    }
    selected_archive_file
        .sync_all()
        .await
        .map_err(|_| VerificationError::StagingUnavailable)?;
    validate_staged_bytes_async(
        &mut selected_archive_file,
        selected_metadata.length,
        selected_metadata.hashes.sha256.as_ref(),
    )
    .await?;
    let selected_archive_file = selected_archive_file.into_std().await;
    let mut selected_archive = StagedArchive {
        file: selected_archive_file,
        expected_length: selected_metadata.length,
        expected_digest: selected_metadata.hashes.sha256.as_ref().to_vec(),
    };
    #[cfg(test)]
    eprintln!("distribution verification: archive anonymized");
    selected_archive.revalidate().await?;
    #[cfg(test)]
    eprintln!("distribution verification: anonymous archive revalidated");
    request
        .product_scope
        .ensure_named(&request.product_root_path)?;
    #[cfg(test)]
    eprintln!("distribution verification: product root rejoined before finalize");
    finalize_cap_datastore(&attempt_datastore.directory)?;
    #[cfg(test)]
    eprintln!("distribution verification: attempt datastore finalized");
    request
        .product_scope
        .ensure_named(&request.product_root_path)?;
    publish_cap_datastore(
        &request.product_scope.authority,
        &attempt_datastore.directory,
    )?;
    #[cfg(test)]
    eprintln!("distribution verification: live datastore published");
    request
        .product_scope
        .ensure_named(&request.product_root_path)?;

    Ok(VerifiedDistributionRelease {
        target: request.target,
        cohort,
        component_lock,
        canonical_cohort: canonical,
        selected_archive,
        product_scope: request.product_scope,
        _verification_lock: verification_lock,
    })
}

fn validate_cohort(
    cohort: &ReleaseCohort,
    targets: &BTreeMap<String, &tough::schema::Target>,
) -> Result<Vec<u8>, VerificationError> {
    if cohort.schema_version != "1.0"
        || cohort.release_identity.is_empty()
        || cohort.release_identity.len() > 128
        || cohort.members.len() != TARGETS.len()
        || !valid_digest(&cohort.component_lock.sha256)
        || !valid_digest(&cohort.dashboard.sha256)
        || !valid_digest(&cohort.updater.sha256)
        || !valid_digest(&cohort.licenses.sha256)
        || !valid_digest(&cohort.sbom.sha256)
        || cohort.protocol.minimum > cohort.protocol.maximum
        || cohort.state.minimum > cohort.state.maximum
        || !portable_relative_path(&cohort.capsule.root)
        || !portable_relative_path(&cohort.capsule.manifest_path)
        || !portable_relative_path(&cohort.licenses.path)
        || !portable_relative_path(&cohort.sbom.path)
    {
        return Err(VerificationError::InvalidCohort);
    }
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(&cohort.component_lock.bytes_base64)
        .map_err(|_| VerificationError::InvalidCohort)?;
    if decoded.len() > 1024 * 1024 || digest_hex(&decoded) != cohort.component_lock.sha256 {
        return Err(VerificationError::InvalidCohort);
    }
    for ((expected_name, expected_target), member) in TARGETS.iter().zip(&cohort.members) {
        let tuf = targets
            .get(*expected_name)
            .ok_or(VerificationError::InvalidCohort)?;
        if member.target != *expected_target
            || member.archive != *expected_name
            || member.archive_length != tuf.length
            || !valid_digest(&member.archive_sha256)
            || !valid_digest(&member.member_manifest_sha256)
            || member.archive_sha256.as_bytes() != hex_lower(tuf.hashes.sha256.as_ref()).as_bytes()
        {
            return Err(VerificationError::InvalidCohort);
        }
    }
    Ok(decoded)
}

fn inspect_directory(
    path: &Path,
    maximum_entries: usize,
    maximum_bytes: u64,
    exact_entries: Option<usize>,
) -> Result<(), VerificationError> {
    let metadata =
        std::fs::symlink_metadata(path).map_err(|_| VerificationError::InvalidRepositoryLayout)?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err(VerificationError::InvalidRepositoryLayout);
    }
    let mut entries = 0_usize;
    let mut bytes = 0_u64;
    for entry in std::fs::read_dir(path).map_err(|_| VerificationError::InvalidRepositoryLayout)? {
        let entry = entry.map_err(|_| VerificationError::InvalidRepositoryLayout)?;
        let metadata = entry
            .path()
            .symlink_metadata()
            .map_err(|_| VerificationError::InvalidRepositoryLayout)?;
        if !metadata.is_file() || metadata.file_type().is_symlink() {
            return Err(VerificationError::InvalidRepositoryLayout);
        }
        entries += 1;
        bytes = bytes
            .checked_add(metadata.len())
            .ok_or(VerificationError::InvalidRepositoryLayout)?;
        if entries > maximum_entries || bytes > maximum_bytes {
            return Err(VerificationError::InvalidRepositoryLayout);
        }
    }
    if exact_entries.is_some_and(|expected| entries != expected) {
        return Err(VerificationError::InvalidRepositoryLayout);
    }
    Ok(())
}

fn acquire_cap_verification_lock(
    product_scope: &ProductRootScope,
) -> Result<VerificationLock, VerificationError> {
    let process = ProcessVerificationLease::acquire(product_scope.process_key())?;
    let root = &product_scope.authority;
    if let Ok(metadata) = root.symlink_metadata(VERIFICATION_LOCK)
        && (!metadata.is_file() || metadata.file_type().is_symlink())
    {
        return Err(VerificationError::DatastoreUnavailable);
    }
    let mut options = CapOpenOptions::new();
    options.read(true).write(true).create(true);
    let file = root
        .open_with(VERIFICATION_LOCK, &options)
        .map_err(|_| VerificationError::DatastoreUnavailable)?
        .into_std();
    let retained = file
        .metadata()
        .map_err(|_| VerificationError::DatastoreUnavailable)?;
    let named = root
        .symlink_metadata(VERIFICATION_LOCK)
        .map_err(|_| VerificationError::DatastoreUnavailable)?;
    if !named.is_file() || named.file_type().is_symlink() || retained.len() != named.len() {
        return Err(VerificationError::DatastoreUnavailable);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::{MetadataExt as _, PermissionsExt as _};
        let named_file = root
            .open(VERIFICATION_LOCK)
            .map_err(|_| VerificationError::DatastoreUnavailable)?
            .into_std();
        let named_std = named_file
            .metadata()
            .map_err(|_| VerificationError::DatastoreUnavailable)?;
        if retained.dev() != named_std.dev()
            || retained.ino() != named_std.ino()
            || retained.nlink() != 1
            || retained.uid() != nix::unistd::Uid::effective().as_raw()
        {
            return Err(VerificationError::DatastoreUnavailable);
        }
        file.set_permissions(std::fs::Permissions::from_mode(0o600))
            .map_err(|_| VerificationError::DatastoreUnavailable)?;
    }
    match file.try_lock_exclusive() {
        Ok(true) => {}
        Ok(false) => return Err(VerificationError::VerificationInProgress),
        Err(_) => return Err(VerificationError::DatastoreUnavailable),
    }
    Ok(VerificationLock {
        _process: process,
        _file: file,
    })
}

fn ensure_cap_directory(root: &Dir, name: &str) -> Result<Dir, VerificationError> {
    let created = match root.create_dir(name) {
        Ok(()) => true,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => false,
        Err(_) => return Err(VerificationError::DatastoreUnavailable),
    };
    #[cfg(windows)]
    let _ = created;
    let directory = open_cap_directory_exact(root, name)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::{MetadataExt as _, PermissionsExt as _};
        let file = directory
            .try_clone()
            .map_err(|_| VerificationError::DatastoreUnavailable)?
            .into_std_file();
        let metadata = file
            .metadata()
            .map_err(|_| VerificationError::DatastoreUnavailable)?;
        if metadata.uid() != nix::unistd::Uid::effective().as_raw() {
            return Err(VerificationError::DatastoreUnavailable);
        }
        if created {
            file.set_permissions(std::fs::Permissions::from_mode(0o700))
                .map_err(|_| VerificationError::DatastoreUnavailable)?;
            file.sync_all()
                .map_err(|_| VerificationError::DatastoreUnavailable)?;
            sync_cap_directory(root)?;
        } else if metadata.permissions().mode() & 0o777 != 0o700 {
            return Err(VerificationError::DatastoreUnavailable);
        }
    }
    Ok(directory)
}

fn open_cap_directory_exact(root: &Dir, name: &str) -> Result<Dir, VerificationError> {
    let named = root
        .symlink_metadata(name)
        .map_err(|_| VerificationError::DatastoreUnavailable)?;
    if !named.is_dir() || named.file_type().is_symlink() {
        return Err(VerificationError::DatastoreUnavailable);
    }
    let directory = root
        .open_dir(name)
        .map_err(|_| VerificationError::DatastoreUnavailable)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt as _;

        let retained = directory
            .try_clone()
            .map_err(|_| VerificationError::DatastoreUnavailable)?
            .into_std_file()
            .metadata()
            .map_err(|_| VerificationError::DatastoreUnavailable)?;
        let current = root
            .open_dir(name)
            .map_err(|_| VerificationError::DatastoreUnavailable)?
            .into_std_file()
            .metadata()
            .map_err(|_| VerificationError::DatastoreUnavailable)?;
        if retained.dev() != current.dev()
            || retained.ino() != current.ino()
            || retained.uid() != nix::unistd::Uid::effective().as_raw()
        {
            return Err(VerificationError::DatastoreUnavailable);
        }
    }
    Ok(directory)
}

fn classify_cap_datastore(
    root: &Dir,
    name: &str,
) -> Result<Option<InitialDatastore>, VerificationError> {
    match root.symlink_metadata(name) {
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(VerificationError::InvalidDatastoreState),
    }
    let directory = open_cap_directory_exact(root, name)
        .map_err(|_| VerificationError::InvalidDatastoreState)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::{MetadataExt as _, PermissionsExt as _};
        let metadata = directory
            .try_clone()
            .map_err(|_| VerificationError::InvalidDatastoreState)?
            .into_std_file()
            .metadata()
            .map_err(|_| VerificationError::InvalidDatastoreState)?;
        if metadata.uid() != nix::unistd::Uid::effective().as_raw()
            || metadata.permissions().mode() & 0o777 != 0o700
        {
            return Err(VerificationError::InvalidDatastoreState);
        }
    }
    classify_datastore_directory(&directory).map(Some)
}

fn classify_datastore_directory(directory: &Dir) -> Result<InitialDatastore, VerificationError> {
    let mut seen = Vec::with_capacity(DATASTORE_FILES.len());
    let mut entries = directory
        .entries()
        .map_err(|_| VerificationError::InvalidDatastoreState)?;
    for _ in 0..=DATASTORE_FILES.len() {
        let Some(entry) = entries.next() else { break };
        let entry = entry.map_err(|_| VerificationError::InvalidDatastoreState)?;
        if seen.len() == DATASTORE_FILES.len() {
            return Err(VerificationError::InvalidDatastoreState);
        }
        let name = entry.file_name();
        let name = name
            .to_str()
            .ok_or(VerificationError::InvalidDatastoreState)?;
        if !DATASTORE_FILES.iter().any(|(allowed, _)| *allowed == name)
            || seen.iter().any(|seen_name| seen_name == name)
        {
            return Err(VerificationError::InvalidDatastoreState);
        }
        seen.push(name.to_owned());
    }
    if seen.is_empty() {
        return Ok(InitialDatastore::Empty);
    }
    if seen.len() != DATASTORE_FILES.len() {
        return Err(VerificationError::InvalidDatastoreState);
    }
    let root_bytes = bounded_cap_read(directory, "root.json", 256 * 1024)?;
    serde_json::from_slice::<tough::schema::Signed<tough::schema::Root>>(&root_bytes)
        .map_err(|_| VerificationError::InvalidDatastoreState)?;
    let timestamp = bounded_cap_read(directory, "timestamp.json", 64 * 1024)?;
    serde_json::from_slice::<tough::schema::Signed<tough::schema::Timestamp>>(&timestamp)
        .map_err(|_| VerificationError::InvalidDatastoreState)?;
    let snapshot = bounded_cap_read(directory, "snapshot.json", 64 * 1024)?;
    serde_json::from_slice::<tough::schema::Signed<tough::schema::Snapshot>>(&snapshot)
        .map_err(|_| VerificationError::InvalidDatastoreState)?;
    let targets = bounded_cap_read(directory, "targets.json", 256 * 1024)?;
    serde_json::from_slice::<tough::schema::Signed<tough::schema::Targets>>(&targets)
        .map_err(|_| VerificationError::InvalidDatastoreState)?;
    let latest = bounded_cap_read(directory, "latest_known_time.json", 128)?;
    serde_json::from_slice::<jiff::Timestamp>(&latest)
        .map_err(|_| VerificationError::InvalidDatastoreState)?;
    Ok(InitialDatastore::Complete { root_bytes })
}

fn bounded_cap_read(
    directory: &Dir,
    name: &str,
    maximum: u64,
) -> Result<Vec<u8>, VerificationError> {
    let named = directory
        .symlink_metadata(name)
        .map_err(|_| VerificationError::InvalidDatastoreState)?;
    if !named.is_file() || named.file_type().is_symlink() || named.len() > maximum {
        return Err(VerificationError::InvalidDatastoreState);
    }
    let file = directory
        .open(name)
        .map_err(|_| VerificationError::InvalidDatastoreState)?
        .into_std();
    let retained = file
        .metadata()
        .map_err(|_| VerificationError::InvalidDatastoreState)?;
    if retained.len() != named.len() || retained.len() > maximum {
        return Err(VerificationError::InvalidDatastoreState);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::{MetadataExt as _, PermissionsExt as _};
        let current = directory
            .open(name)
            .map_err(|_| VerificationError::InvalidDatastoreState)?
            .into_std()
            .metadata()
            .map_err(|_| VerificationError::InvalidDatastoreState)?;
        if retained.dev() != current.dev()
            || retained.ino() != current.ino()
            || retained.nlink() != 1
            || retained.uid() != nix::unistd::Uid::effective().as_raw()
            || retained.permissions().mode() & 0o777 != 0o600
        {
            return Err(VerificationError::InvalidDatastoreState);
        }
    }
    let mut bytes = Vec::with_capacity(retained.len() as usize);
    file.take(maximum + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| VerificationError::InvalidDatastoreState)?;
    if bytes.len() as u64 != retained.len() || bytes.len() as u64 > maximum {
        return Err(VerificationError::InvalidDatastoreState);
    }
    Ok(bytes)
}

fn cap_entry_exists(root: &Dir, name: &str) -> Result<bool, VerificationError> {
    match root.symlink_metadata(name) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => Ok(true),
        Ok(_) => Err(VerificationError::InvalidDatastoreState),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(_) => Err(VerificationError::InvalidDatastoreState),
    }
}

fn recover_cap_datastore_layout(root: &Dir) -> Result<(), VerificationError> {
    let live = classify_cap_datastore(root, LIVE_DATASTORE)?;
    if live.is_some() {
        if cap_entry_exists(root, NEXT_DATASTORE)? {
            remove_cap_store_residue(root, NEXT_DATASTORE)?;
        }
        if cap_entry_exists(root, PREVIOUS_DATASTORE)? {
            remove_cap_store_residue(root, PREVIOUS_DATASTORE)?;
        }
        sync_cap_directory(root)?;
        return Ok(());
    }
    if cap_entry_exists(root, PREVIOUS_DATASTORE)? {
        let _ = classify_cap_datastore(root, PREVIOUS_DATASTORE)?
            .ok_or(VerificationError::InvalidDatastoreState)?;
        if cap_entry_exists(root, NEXT_DATASTORE)? {
            remove_cap_store_residue(root, NEXT_DATASTORE)?;
        }
        root.rename(PREVIOUS_DATASTORE, root, LIVE_DATASTORE)
            .map_err(|_| VerificationError::InvalidDatastoreState)?;
        sync_cap_directory(root)?;
        return Ok(());
    }
    if cap_entry_exists(root, NEXT_DATASTORE)? {
        match classify_cap_datastore(root, NEXT_DATASTORE) {
            Ok(Some(InitialDatastore::Complete { .. })) => {
                root.rename(NEXT_DATASTORE, root, LIVE_DATASTORE)
                    .map_err(|_| VerificationError::InvalidDatastoreState)?;
                sync_cap_directory(root)?;
            }
            _ => remove_cap_store_residue(root, NEXT_DATASTORE)?,
        }
    }
    Ok(())
}

fn remove_cap_store_residue(root: &Dir, name: &str) -> Result<(), VerificationError> {
    let directory = root
        .open_dir(name)
        .map_err(|_| VerificationError::InvalidDatastoreState)?;
    let mut names = Vec::with_capacity(DATASTORE_FILES.len());
    let mut entries = directory
        .entries()
        .map_err(|_| VerificationError::InvalidDatastoreState)?;
    for _ in 0..=DATASTORE_FILES.len() {
        let Some(entry) = entries.next() else { break };
        let entry = entry.map_err(|_| VerificationError::InvalidDatastoreState)?;
        if names.len() == DATASTORE_FILES.len() {
            return Err(VerificationError::InvalidDatastoreState);
        }
        let child = entry.file_name();
        let child = child
            .to_str()
            .ok_or(VerificationError::InvalidDatastoreState)?;
        let maximum = DATASTORE_FILES
            .iter()
            .find_map(|(allowed, maximum)| (*allowed == child).then_some(*maximum))
            .ok_or(VerificationError::InvalidDatastoreState)?;
        let metadata = directory
            .symlink_metadata(child)
            .map_err(|_| VerificationError::InvalidDatastoreState)?;
        if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > maximum {
            return Err(VerificationError::InvalidDatastoreState);
        }
        names.push(child.to_owned());
    }
    drop(entries);
    for child in names {
        directory
            .remove_file(child)
            .map_err(|_| VerificationError::InvalidDatastoreState)?;
    }
    sync_cap_directory(&directory)?;
    drop(directory);
    root.remove_dir(name)
        .map_err(|_| VerificationError::InvalidDatastoreState)
}

#[cfg(unix)]
fn sync_cap_directory(directory: &Dir) -> Result<(), VerificationError> {
    directory
        .try_clone()
        .map_err(|_| VerificationError::DatastoreUnavailable)?
        .into_std_file()
        .sync_all()
        .map_err(|_| VerificationError::DatastoreUnavailable)
}

#[cfg(all(windows, test))]
fn sync_cap_directory(_directory: &Dir) -> Result<(), VerificationError> {
    Ok(())
}

#[cfg(all(windows, not(test)))]
fn sync_cap_directory(_directory: &Dir) -> Result<(), VerificationError> {
    Err(VerificationError::WindowsDatastoreAuthorityNotProvisioned)
}

fn prepare_attempt_datastore(
    root: &Dir,
    initial: &InitialDatastore,
) -> Result<AttemptDatastore, VerificationError> {
    let attempt = tempfile::Builder::new()
        .prefix("vaultspec-tuf-attempt-")
        .tempdir()
        .map_err(|_| VerificationError::DatastoreUnavailable)?;
    let directory = Dir::open_ambient_dir(attempt.path(), cap_std::ambient_authority())
        .map_err(|_| VerificationError::DatastoreUnavailable)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::{MetadataExt as _, PermissionsExt as _};
        let retained = directory
            .try_clone()
            .map_err(|_| VerificationError::DatastoreUnavailable)?
            .into_std_file();
        let metadata = retained
            .metadata()
            .map_err(|_| VerificationError::DatastoreUnavailable)?;
        if metadata.uid() != nix::unistd::Uid::effective().as_raw() {
            return Err(VerificationError::DatastoreUnavailable);
        }
        retained
            .set_permissions(std::fs::Permissions::from_mode(0o700))
            .map_err(|_| VerificationError::DatastoreUnavailable)?;
        retained
            .sync_all()
            .map_err(|_| VerificationError::DatastoreUnavailable)?;
    }
    if matches!(initial, InitialDatastore::Complete { .. }) {
        let live = root
            .open_dir(LIVE_DATASTORE)
            .map_err(|_| VerificationError::InvalidDatastoreState)?;
        for (name, maximum) in DATASTORE_FILES {
            let bytes = bounded_cap_read(&live, name, maximum)?;
            let mut file = create_cap_file(&directory, name, 0o600)?;
            file.write_all(&bytes)
                .map_err(|_| VerificationError::InvalidDatastoreState)?;
            file.sync_all()
                .map_err(|_| VerificationError::InvalidDatastoreState)?;
        }
        sync_cap_directory(&directory)?;
    }
    Ok(AttemptDatastore {
        _temporary: attempt,
        directory,
    })
}

fn publish_cap_datastore(root: &Dir, attempt: &Dir) -> Result<(), VerificationError> {
    if !matches!(
        classify_datastore_directory(attempt)?,
        InitialDatastore::Complete { .. }
    ) || cap_entry_exists(root, NEXT_DATASTORE)?
        || cap_entry_exists(root, PREVIOUS_DATASTORE)?
    {
        return Err(VerificationError::InvalidDatastoreState);
    }
    #[cfg(test)]
    eprintln!("distribution publish: attempt classified and no residue");
    let next = ensure_cap_directory(root, NEXT_DATASTORE)?;
    for (name, maximum) in DATASTORE_FILES {
        let bytes = bounded_cap_read(attempt, name, maximum)?;
        let mut file = create_cap_file(&next, name, 0o600)?;
        file.write_all(&bytes)
            .map_err(|_| VerificationError::InvalidDatastoreState)?;
        file.sync_all()
            .map_err(|_| VerificationError::InvalidDatastoreState)?;
    }
    #[cfg(test)]
    eprintln!("distribution publish: next files copied");
    sync_cap_directory(&next)?;
    if !matches!(
        classify_cap_datastore(root, NEXT_DATASTORE)?,
        Some(InitialDatastore::Complete { .. })
    ) {
        return Err(VerificationError::InvalidDatastoreState);
    }
    #[cfg(test)]
    eprintln!("distribution publish: next classified");
    drop(next);
    if cap_entry_exists(root, LIVE_DATASTORE)? {
        root.rename(LIVE_DATASTORE, root, PREVIOUS_DATASTORE)
            .map_err(|_| VerificationError::InvalidDatastoreState)?;
        sync_cap_directory(root)?;
    }
    #[cfg(test)]
    eprintln!("distribution publish: live moved aside");
    root.rename(NEXT_DATASTORE, root, LIVE_DATASTORE)
        .map_err(|_| VerificationError::InvalidDatastoreState)?;
    sync_cap_directory(root)?;
    #[cfg(test)]
    eprintln!("distribution publish: next promoted");
    if cap_entry_exists(root, PREVIOUS_DATASTORE)? {
        remove_cap_store_residue(root, PREVIOUS_DATASTORE)?;
        sync_cap_directory(root)?;
    }
    #[cfg(test)]
    eprintln!("distribution publish: previous removed");
    if !matches!(
        classify_cap_datastore(root, LIVE_DATASTORE)?,
        Some(InitialDatastore::Complete { .. })
    ) {
        return Err(VerificationError::InvalidDatastoreState);
    }
    Ok(())
}

fn create_cap_file(
    directory: &Dir,
    name: &str,
    _unix_mode: u32,
) -> Result<File, VerificationError> {
    let mut options = CapOpenOptions::new();
    options.read(true).write(true).create_new(true);
    #[cfg(unix)]
    {
        use cap_std::fs::OpenOptionsExt as _;
        options.mode(_unix_mode);
    }
    let file = directory
        .open_with(name, &options)
        .map_err(|_| VerificationError::InvalidDatastoreState)?
        .into_std();
    #[cfg(unix)]
    {
        use std::os::unix::fs::{MetadataExt as _, PermissionsExt as _};
        let metadata = file
            .metadata()
            .map_err(|_| VerificationError::InvalidDatastoreState)?;
        if metadata.uid() != nix::unistd::Uid::effective().as_raw()
            || metadata.nlink() != 1
            || metadata.permissions().mode() & 0o777 != _unix_mode
        {
            return Err(VerificationError::InvalidDatastoreState);
        }
    }
    Ok(file)
}

const DATASTORE_FILES: [(&str, u64); 5] = [
    ("root.json", 256 * 1024),
    ("timestamp.json", 64 * 1024),
    ("snapshot.json", 64 * 1024),
    ("targets.json", 256 * 1024),
    ("latest_known_time.json", 128),
];

fn finalize_cap_datastore(directory: &Dir) -> Result<(), VerificationError> {
    for (name, _) in DATASTORE_FILES {
        let named = directory
            .symlink_metadata(name)
            .map_err(|_| VerificationError::InvalidDatastoreState)?;
        if !named.is_file() || named.file_type().is_symlink() {
            return Err(VerificationError::InvalidDatastoreState);
        }
        let mut options = CapOpenOptions::new();
        options.read(true).write(true);
        let file = directory
            .open_with(name, &options)
            .map_err(|_| VerificationError::InvalidDatastoreState)?
            .into_std();
        #[cfg(unix)]
        {
            use std::os::unix::fs::{MetadataExt as _, PermissionsExt as _};
            let retained = file
                .metadata()
                .map_err(|_| VerificationError::InvalidDatastoreState)?;
            let current = directory
                .open(name)
                .map_err(|_| VerificationError::InvalidDatastoreState)?
                .into_std()
                .metadata()
                .map_err(|_| VerificationError::InvalidDatastoreState)?;
            if retained.dev() != current.dev()
                || retained.ino() != current.ino()
                || retained.nlink() != 1
                || retained.uid() != nix::unistd::Uid::effective().as_raw()
            {
                return Err(VerificationError::InvalidDatastoreState);
            }
            file.set_permissions(std::fs::Permissions::from_mode(0o600))
                .map_err(|_| VerificationError::InvalidDatastoreState)?;
        }
        file.sync_all()
            .map_err(|_| VerificationError::InvalidDatastoreState)?;
    }
    sync_cap_directory(directory)?;
    if !matches!(
        classify_datastore_directory(directory)?,
        InitialDatastore::Complete { .. }
    ) {
        return Err(VerificationError::InvalidDatastoreState);
    }
    Ok(())
}

fn prepare_cap_staging(root: &Dir) -> Result<Dir, VerificationError> {
    let directory = ensure_cap_directory(root, VERIFIED_STAGING)?;
    let mut entries = directory
        .entries()
        .map_err(|_| VerificationError::StagingUnavailable)?;
    if entries
        .next()
        .transpose()
        .map_err(|_| VerificationError::StagingUnavailable)?
        .is_some()
    {
        return Err(VerificationError::StagingUnavailable);
    }
    drop(entries);
    Ok(directory)
}

async fn validate_staged_bytes_async(
    file: &mut tokio::fs::File,
    expected_length: u64,
    expected_digest: &[u8],
) -> Result<(), VerificationError> {
    file.rewind()
        .await
        .map_err(|_| VerificationError::StagingUnavailable)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    let mut observed = 0_u64;
    loop {
        let read = file
            .read(&mut buffer)
            .await
            .map_err(|_| VerificationError::StagingUnavailable)?;
        if read == 0 {
            break;
        }
        observed = observed
            .checked_add(read as u64)
            .ok_or(VerificationError::StagingUnavailable)?;
        if observed > expected_length || observed > MAX_ARCHIVE_BYTES {
            return Err(VerificationError::StagingUnavailable);
        }
        hasher.update(&buffer[..read]);
    }
    if observed != expected_length || hasher.finalize().as_slice() != expected_digest {
        return Err(VerificationError::StagingUnavailable);
    }
    file.rewind()
        .await
        .map_err(|_| VerificationError::StagingUnavailable)?;
    Ok(())
}

fn create_anonymous_staging_file(directory: &Dir) -> Result<File, VerificationError> {
    let mut options = CapOpenOptions::new();
    options.read(true).write(true).create_new(true);
    #[cfg(unix)]
    {
        use cap_std::fs::OpenOptionsExt as _;
        options.mode(0);
    }
    let file = directory
        .open_with("selected.archive", &options)
        .map(cap_std::fs::File::into_std)
        .map_err(|_| VerificationError::StagingUnavailable)?;
    let named = directory
        .symlink_metadata("selected.archive")
        .map_err(|_| VerificationError::StagingUnavailable)?;
    if !named.is_file() || named.file_type().is_symlink() || named.len() != 0 {
        return Err(VerificationError::StagingUnavailable);
    }
    #[cfg(unix)]
    {
        use cap_std::fs::MetadataExt as _;
        use std::os::unix::fs::MetadataExt as _;
        let retained = file
            .metadata()
            .map_err(|_| VerificationError::StagingUnavailable)?;
        if retained.dev() != named.dev()
            || retained.ino() != named.ino()
            || retained.nlink() != 1
            || retained.uid() != nix::unistd::Uid::effective().as_raw()
            || named.mode() & 0o777 != 0
        {
            return Err(VerificationError::StagingUnavailable);
        }
    }
    directory
        .remove_file("selected.archive")
        .map_err(|_| VerificationError::StagingUnavailable)?;
    sync_cap_directory(directory)?;
    if directory.symlink_metadata("selected.archive").is_ok() {
        return Err(VerificationError::StagingUnavailable);
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt as _;
        if file
            .metadata()
            .map_err(|_| VerificationError::StagingUnavailable)?
            .nlink()
            != 0
        {
            return Err(VerificationError::StagingUnavailable);
        }
    }
    Ok(file)
}

fn valid_digest(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn digest_hex(bytes: &[u8]) -> String {
    hex_lower(&Sha256::digest(bytes))
}

fn hex_lower(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut value = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        value.push(char::from(HEX[usize::from(byte >> 4)]));
        value.push(char::from(HEX[usize::from(byte & 0x0f)]));
    }
    value
}

fn portable_relative_path(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 256
        && !value.starts_with('/')
        && !value.starts_with('\\')
        && !value.contains('\\')
        && !value.contains(':')
        && !value
            .chars()
            .any(|character| character.is_control() || "<>\"|?*".contains(character))
        && value.split('/').all(portable_component)
}

fn portable_component(segment: &str) -> bool {
    if segment.is_empty()
        || segment == "."
        || segment == ".."
        || segment.len() > 255
        || segment.ends_with(['.', ' '])
    {
        return false;
    }
    let stem = segment
        .split_once('.')
        .map_or(segment, |(stem, _)| stem)
        .to_ascii_uppercase();
    !matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        && !(stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && matches!(stem.as_bytes()[3], b'1'..=b'9'))
}

#[cfg(test)]
mod tests;
