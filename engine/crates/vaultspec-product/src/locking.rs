//! The installation transaction lock (a2a-product-provisioning W01.P01.S10).
//!
//! ADR constraint "Lock ordering is global": the controller (and the copied
//! external updater) acquires the installation transaction lock *first*, before
//! any drain, snapshot, migration, or file activation, and holds it through
//! activation or rollback. It is a short-lived operating-system exclusive lock,
//! distinct from the gateway's lifetime-held runtime singleton. **The gateway
//! never acquires or waits on the installation lock** — that separation is what
//! prevents a lifecycle mutation from deadlocking against a running gateway.
//!
//! This module encodes the boundary in the type system: [`InstallLock::acquire`]
//! takes an [`Actor`], and a [`Actor::Gateway`] request is refused before the
//! lock is ever touched — it cannot acquire *or* block on the lock. Only the
//! matching receipt owner may quarantine stale discovery, and only after proving
//! the recorded process dead ([`quarantine_owner_matched_stale`]).

use std::fs::File;
#[cfg(unix)]
use std::fs::OpenOptions;
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};

use fs4::fs_std::FileExt;
use serde::{Deserialize, Serialize};

use crate::paths::ProductPaths;

const CLAIM_VERSION: u8 = 1;
const MAX_OWNER_BYTES: usize = 1_024;
const MAX_CLAIM_BYTES: u64 = 2_048;
const CLAIM_NONCE_BYTES: usize = 32;
const PREPARED_CLAIM_SLOTS: usize = 8;
const MAX_DROP_DIAGNOSTIC_CHARS: usize = 512;

/// Which component is requesting the installation lock. The actor gates the
/// request: only installer/updater authority may hold it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Actor {
    /// The product-owned installer performing first install or a manager-adapter
    /// preflight.
    Installer,
    /// The copied external updater running the ordered update transaction.
    CopiedUpdater,
    /// The A2A gateway. Forbidden from acquiring or waiting on the install lock.
    Gateway,
}

impl Actor {
    fn may_hold_install_lock(self) -> bool {
        matches!(self, Actor::Installer | Actor::CopiedUpdater)
    }
}

/// Why the installation lock could not be acquired.
#[derive(Debug)]
pub enum LockError {
    /// The gateway requested the install lock; it may never acquire or wait on
    /// it. Refused before the lock file is touched.
    GatewayForbidden,
    /// The requested owner cannot be represented safely in the bounded claim.
    InvalidOwner,
    /// An I/O error creating or locking the lock file.
    Io(std::io::Error),
}

impl std::fmt::Display for LockError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LockError::GatewayForbidden => write!(
                f,
                "the gateway may not acquire or wait on the installation transaction lock"
            ),
            LockError::InvalidOwner => write!(
                f,
                "install lock owner must be non-empty, bounded, and contain no control characters"
            ),
            LockError::Io(e) => write!(f, "install lock io error: {e}"),
        }
    }
}

impl std::error::Error for LockError {}

impl From<std::io::Error> for LockError {
    fn from(e: std::io::Error) -> Self {
        LockError::Io(e)
    }
}

/// The lock was held by another live installer/updater process.
#[derive(Debug)]
pub struct LockBusy {
    /// The owner recorded in the lock file, best-effort.
    pub owner: Option<String>,
    /// The pid recorded in the lock file, best-effort.
    pub pid: Option<u32>,
}

#[derive(Debug)]
enum HeldAuthorityFile {
    #[cfg(unix)]
    Unix(File),
    #[cfg(windows)]
    Windows(vaultspec_windows_authority::AuthorityFile),
}

impl HeldAuthorityFile {
    fn file(&self) -> &File {
        match self {
            #[cfg(unix)]
            Self::Unix(file) => file,
            #[cfg(windows)]
            Self::Windows(file) => file.file(),
        }
    }

    fn file_mut(&mut self) -> &mut File {
        match self {
            #[cfg(unix)]
            Self::Unix(file) => file,
            #[cfg(windows)]
            Self::Windows(file) => file.file_mut(),
        }
    }

    fn identity(&self) -> std::io::Result<FilesystemIdentity> {
        match self {
            #[cfg(unix)]
            Self::Unix(file) => {
                use std::os::unix::fs::MetadataExt;
                let metadata = file.metadata()?;
                Ok(FilesystemIdentity::Unix {
                    device: metadata.dev(),
                    inode: metadata.ino(),
                })
            }
            #[cfg(windows)]
            Self::Windows(file) => {
                let identity = file.identity();
                Ok(FilesystemIdentity::WindowsHighRes {
                    volume: identity.volume_serial_number,
                    file_id: identity.file_id,
                })
            }
        }
    }

    #[cfg(windows)]
    fn mark_delete_on_close(&self) -> std::io::Result<()> {
        match self {
            Self::Windows(file) => file.mark_delete_on_close(),
        }
    }
}

/// A held installation lock. Dropping it (or process death) releases the OS
/// lock, so a crash mid-transaction never strands the lock — a recovering
/// updater re-acquires the freed lock and resolves the durable receipt markers.
#[derive(Debug)]
pub struct InstallLockGuard {
    lock_file: Option<HeldAuthorityFile>,
    owner: String,
    parent: ParentAuthority,
    canonical_lock_path: PathBuf,
    lock_identity: FilesystemIdentity,
    claim_path: PathBuf,
    canonical_claim_path: PathBuf,
    claim_file: Option<HeldAuthorityFile>,
    prepared_file: Option<HeldAuthorityFile>,
    prepared_residue: Option<PathBuf>,
    claim_identity: FilesystemIdentity,
    claim_record: ClaimRecord,
    claim_bytes: Vec<u8>,
}

impl InstallLockGuard {
    /// The owner id recorded when this lock was acquired.
    #[must_use]
    pub fn owner(&self) -> &str {
        &self.owner
    }

    /// The filesystem identity strength backing this guard.
    #[must_use]
    pub fn identity_strength(&self) -> LockIdentityStrength {
        self.lock_identity.strength()
    }

    /// Verify that this pair of authorities is still the canonical product
    /// installation lock for the supplied path authority.
    ///
    /// Later lifecycle and generation APIs must call this before mutating
    /// product state. Path equality alone is not authority: the lock entry may
    /// have been replaced after acquisition, or a guard from another product
    /// root may have been supplied. This check therefore re-derives the only
    /// permitted lock and claim paths from [`ProductPaths`]. The fixed claim
    /// prevents pathname replacement from splitting authority, while the OS
    /// lock supplies crash-release/liveness. Malformed or foreign claims are
    /// non-authorizing, fail-closed busy states.
    pub fn verify_for_product(&self, paths: &ProductPaths) -> Result<(), LockAuthorityError> {
        #[cfg(unix)]
        if unix_file_identity(&self.parent.directory)? != self.parent.identity
            || !unix_transaction_directory_is_secure(&self.parent.directory)?
        {
            return Err(LockAuthorityError::AuthorityMismatch);
        }
        let expected_parent = parent_authority(&paths.install_lock_path())?;
        if expected_parent.canonical_path != self.parent.canonical_path
            || expected_parent.identity != self.parent.identity
        {
            return Err(LockAuthorityError::AuthorityMismatch);
        }
        let expected = product_authority(paths)?;
        let lock_identity = authority_file_identity(&expected.parent, &expected.lock_path)?;
        let claim = read_claim_snapshot(&expected.parent, &expected.claim_path)?;

        if expected.parent.canonical_path != self.parent.canonical_path
            || expected.parent.identity != self.parent.identity
            || expected.canonical_lock_path != self.canonical_lock_path
            || expected.canonical_claim_path != self.canonical_claim_path
            || lock_identity != self.lock_identity
            || claim.identity != self.claim_identity
            || claim.record != self.claim_record
            || claim.bytes != self.claim_bytes
        {
            return Err(LockAuthorityError::AuthorityMismatch);
        }
        Ok(())
    }

    /// Explicitly retract the exact claim authorities and unlock the operating-
    /// system lock. Lifecycle code should prefer this fallible close at a
    /// transaction boundary so cleanup failure is visible to the caller.
    pub fn release(mut self) -> Result<(), LockReleaseError> {
        self.release_inner()
    }

    fn release_inner(&mut self) -> Result<(), LockReleaseError> {
        let Some(lock_file) = self.lock_file.take() else {
            return Ok(());
        };
        let expected = ClaimSnapshot {
            identity: self.claim_identity,
            record: self.claim_record.clone(),
            bytes: self.claim_bytes.clone(),
        };
        let mut failure = ReleaseFailure::default();

        match retract_exact(
            &self.parent,
            &self.claim_path,
            &expected,
            self.claim_file.as_ref(),
        ) {
            Ok(true) => {}
            Ok(false) => failure.record("fixed claim changed before release", None),
            Err(error) => failure.record("fixed claim cleanup failed", Some(error)),
        }
        if let Some(prepared) = self.prepared_residue.take() {
            match retract_exact(
                &self.parent,
                &prepared,
                &expected,
                self.prepared_file.as_ref(),
            ) {
                Ok(true) => {}
                Ok(false) => failure.record("prepared claim changed before release", None),
                Err(error) => failure.record("prepared claim cleanup failed", Some(error)),
            }
        }
        self.claim_file.take();
        self.prepared_file.take();
        if let Err(error) = FileExt::unlock(lock_file.file()) {
            failure.record("operating-system lock release failed", Some(error));
        }
        drop(lock_file);
        failure.finish()
    }
}

impl Drop for InstallLockGuard {
    fn drop(&mut self) {
        if let Err(error) = self.release_inner() {
            bounded_drop_diagnostic("install-lock cleanup incomplete", &error);
        }
    }
}

/// A bounded report that explicit installation-lock release was incomplete.
#[derive(Debug)]
pub struct LockReleaseError {
    stage: &'static str,
    source: Option<std::io::Error>,
    additional_failures: u8,
}

impl std::fmt::Display for LockReleaseError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}", self.stage)?;
        if let Some(source) = &self.source {
            write!(formatter, ": {source}")?;
        }
        if self.additional_failures > 0 {
            write!(
                formatter,
                " (plus {} additional cleanup failure(s))",
                self.additional_failures
            )?;
        }
        Ok(())
    }
}

impl std::error::Error for LockReleaseError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        self.source
            .as_ref()
            .map(|source| source as &(dyn std::error::Error + 'static))
    }
}

#[derive(Default)]
struct ReleaseFailure {
    first: Option<LockReleaseError>,
}

impl ReleaseFailure {
    fn record(&mut self, stage: &'static str, source: Option<std::io::Error>) {
        if let Some(first) = &mut self.first {
            first.additional_failures = first.additional_failures.saturating_add(1);
        } else {
            self.first = Some(LockReleaseError {
                stage,
                source,
                additional_failures: 0,
            });
        }
    }

    fn finish(self) -> Result<(), LockReleaseError> {
        self.first.map_or(Ok(()), Err)
    }
}

/// The installation transaction lock at a fixed product-owned path.
#[derive(Debug, Clone)]
pub struct InstallLock {
    path: PathBuf,
}

impl InstallLock {
    /// Bind the lock to its product-owned path (typically
    /// `ProductPaths::install_lock_path`).
    #[must_use]
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into() }
    }

    /// Try to acquire the lock without blocking. `Ok(Ok(guard))` on success;
    /// `Ok(Err(LockBusy))` when another live installer/updater holds it;
    /// `Err(GatewayForbidden)` when the actor is the gateway; `Err(Io)` on real
    /// I/O failure. The non-blocking try is the fail-loud default — an installer
    /// that finds the lock busy reports it rather than queueing behind an update.
    pub fn acquire(
        &self,
        actor: Actor,
        owner: &str,
    ) -> std::result::Result<std::result::Result<InstallLockGuard, LockBusy>, LockError> {
        if !actor.may_hold_install_lock() {
            return Err(LockError::GatewayForbidden);
        }
        if !valid_owner(owner) {
            return Err(LockError::InvalidOwner);
        }
        let parent = parent_authority(&self.path)?;
        let claim_path = claim_path(&self.path)?;
        let mut claim = match acquire_claim(&parent, &claim_path, owner)? {
            Ok(claim) => claim,
            Err(busy) => return Ok(Err(busy)),
        };

        if !parent.matches_current() {
            claim.retract(&parent).map_err(|error| {
                LockError::Io(std::io::Error::other(format!(
                    "transaction parent changed and claim cleanup failed: {error}"
                )))
            })?;
            return Err(LockError::Io(std::io::Error::other(
                "transaction parent changed during claim publication",
            )));
        }

        let (lock_file, canonical_lock_path, lock_identity) = match acquire_os_lock(
            &parent, &self.path,
        ) {
            Ok(Ok(authority)) => authority,
            Ok(Err(())) => {
                claim.retract(&parent).map_err(|error| {
                    LockError::Io(std::io::Error::other(format!(
                        "OS lock was busy and claim cleanup failed: {error}"
                    )))
                })?;
                return Ok(Err(busy_diagnostics(&parent, &claim_path)));
            }
            Err(error) => {
                if let Err(cleanup) = claim.retract(&parent) {
                    return Err(LockError::Io(std::io::Error::other(format!(
                        "OS lock acquisition failed ({error}) and claim cleanup failed: {cleanup}"
                    ))));
                }
                return Err(LockError::Io(error));
            }
        };
        if !parent.matches_current() {
            let cleanup = claim.retract(&parent);
            let _ = FileExt::unlock(lock_file.file());
            cleanup.map_err(|error| {
                LockError::Io(std::io::Error::other(format!(
                    "transaction parent changed after OS lock acquisition and claim cleanup failed: {error}"
                )))
            })?;
            return Err(LockError::Io(std::io::Error::other(
                "transaction parent changed during OS lock acquisition",
            )));
        }

        Ok(Ok(InstallLockGuard {
            lock_file: Some(lock_file),
            owner: owner.to_string(),
            parent,
            canonical_lock_path,
            lock_identity,
            claim_path,
            canonical_claim_path: claim.canonical_path,
            claim_file: claim.file.take(),
            prepared_file: claim.prepared_file.take(),
            prepared_residue: claim.prepared_residue.take(),
            claim_identity: claim.snapshot.identity,
            claim_record: claim.snapshot.record.clone(),
            claim_bytes: claim.snapshot.bytes.clone(),
        }))
    }
}

/// The supported identity mechanism retained by a lock guard.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LockIdentityStrength {
    /// Device and inode from no-follow Unix metadata.
    UnixInode,
    /// Windows `FILE_ID_INFO`: 64-bit volume plus 128-bit file id.
    WindowsHighRes128,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FilesystemIdentity {
    #[cfg(unix)]
    Unix { device: u64, inode: u64 },
    #[cfg(windows)]
    WindowsHighRes { volume: u64, file_id: u128 },
}

impl FilesystemIdentity {
    fn strength(self) -> LockIdentityStrength {
        match self {
            #[cfg(unix)]
            Self::Unix { .. } => LockIdentityStrength::UnixInode,
            #[cfg(windows)]
            Self::WindowsHighRes { .. } => LockIdentityStrength::WindowsHighRes128,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct ClaimRecord {
    version: u8,
    owner: String,
    pid: u32,
    process_start_time: u64,
    nonce: String,
}

impl ClaimRecord {
    fn new(owner: &str) -> std::io::Result<Self> {
        let pid = std::process::id();
        let process_start_time = process_start_time(pid)
            .ok_or_else(|| std::io::Error::other("cannot inspect current process identity"))?;
        let mut nonce = [0_u8; CLAIM_NONCE_BYTES];
        getrandom::fill(&mut nonce).map_err(|error| {
            std::io::Error::other(format!("claim nonce generation failed: {error}"))
        })?;
        Ok(Self {
            version: CLAIM_VERSION,
            owner: owner.to_string(),
            pid,
            process_start_time,
            nonce: hex_encode(&nonce),
        })
    }

    fn validate(&self) -> std::io::Result<()> {
        if self.version != CLAIM_VERSION
            || !valid_owner(&self.owner)
            || self.pid == 0
            || self.process_start_time == 0
            || self.nonce.len() != CLAIM_NONCE_BYTES * 2
            || !self
                .nonce
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        {
            return Err(std::io::Error::other("invalid installation claim record"));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ClaimSnapshot {
    identity: FilesystemIdentity,
    record: ClaimRecord,
    bytes: Vec<u8>,
}

#[derive(Debug)]
struct ClaimAuthority {
    canonical_path: PathBuf,
    file: Option<HeldAuthorityFile>,
    prepared_file: Option<HeldAuthorityFile>,
    prepared_residue: Option<PathBuf>,
    snapshot: ClaimSnapshot,
    path: PathBuf,
}

impl ClaimAuthority {
    fn retract(&mut self, parent: &ParentAuthority) -> Result<(), LockReleaseError> {
        let mut failure = ReleaseFailure::default();
        match retract_exact(parent, &self.path, &self.snapshot, self.file.as_ref()) {
            Ok(true) => {}
            Ok(false) => failure.record("fixed claim changed before rollback", None),
            Err(error) => failure.record("fixed claim rollback failed", Some(error)),
        }
        if let Some(prepared) = self.prepared_residue.take() {
            match retract_exact(
                parent,
                &prepared,
                &self.snapshot,
                self.prepared_file.as_ref(),
            ) {
                Ok(true) => {}
                Ok(false) => failure.record("prepared claim changed before rollback", None),
                Err(error) => failure.record("prepared claim rollback failed", Some(error)),
            }
        }
        self.file.take();
        self.prepared_file.take();
        failure.finish()
    }
}

#[derive(Debug)]
struct ParentAuthority {
    path: PathBuf,
    canonical_path: PathBuf,
    identity: FilesystemIdentity,
    #[cfg(unix)]
    directory: File,
}

impl ParentAuthority {
    fn matches_current(&self) -> bool {
        #[cfg(unix)]
        if unix_file_identity(&self.directory).ok() != Some(self.identity)
            || unix_transaction_directory_is_secure(&self.directory).ok() != Some(true)
        {
            return false;
        }
        directory_identity(&self.path).is_ok_and(|identity| identity == self.identity)
            && std::fs::canonicalize(&self.path)
                .is_ok_and(|canonical| canonical == self.canonical_path)
    }
}

#[derive(Debug)]
struct ProductAuthority {
    parent: ParentAuthority,
    lock_path: PathBuf,
    canonical_lock_path: PathBuf,
    claim_path: PathBuf,
    canonical_claim_path: PathBuf,
}

fn product_authority(paths: &ProductPaths) -> std::io::Result<ProductAuthority> {
    let root = paths.root();
    safe_directory_metadata(root)?;
    let canonical_root = std::fs::canonicalize(root)?;
    let parent = parent_authority(&paths.install_lock_path())?;
    if parent.canonical_path.parent() != Some(canonical_root.as_path()) {
        return Err(std::io::Error::other(
            "transaction directory escaped the product root",
        ));
    }
    let lock_path = paths.install_lock_path();
    let claim_path = claim_path(&lock_path)?;
    Ok(ProductAuthority {
        canonical_lock_path: canonical_authority_path(&parent, &lock_path)?,
        canonical_claim_path: canonical_authority_path(&parent, &claim_path)?,
        parent,
        lock_path,
        claim_path,
    })
}

fn parent_authority(lock_path: &Path) -> std::io::Result<ParentAuthority> {
    let parent = lock_path
        .parent()
        .ok_or_else(|| std::io::Error::other("install lock has no transaction parent"))?;
    safe_directory_metadata(parent)?;
    if let Some(product_root) = parent.parent() {
        safe_directory_metadata(product_root)?;
    }
    #[cfg(unix)]
    let directory = open_and_secure_unix_transaction_directory(parent)?;
    #[cfg(unix)]
    let identity = unix_file_identity(&directory)?;
    #[cfg(windows)]
    let identity = directory_identity(parent)?;
    if directory_identity(parent)? != identity {
        return Err(std::io::Error::other(
            "transaction directory changed while retaining its authority handle",
        ));
    }
    Ok(ParentAuthority {
        path: parent.to_path_buf(),
        canonical_path: std::fs::canonicalize(parent)?,
        identity,
        #[cfg(unix)]
        directory,
    })
}

#[cfg(unix)]
fn open_and_secure_unix_transaction_directory(path: &Path) -> std::io::Result<File> {
    use std::os::unix::fs::{MetadataExt, OpenOptionsExt, PermissionsExt};

    let mut options = OpenOptions::new();
    options
        .read(true)
        .custom_flags(nix::libc::O_CLOEXEC | nix::libc::O_DIRECTORY | nix::libc::O_NOFOLLOW);
    let directory = options.open(path)?;
    let metadata = directory.metadata()?;
    if !metadata.is_dir() || metadata.uid() != nix::unistd::Uid::effective().as_raw() {
        return Err(std::io::Error::other(
            "transaction directory must be owned by the current Unix user",
        ));
    }
    if metadata.mode() & 0o777 != 0o700 {
        directory.set_permissions(std::fs::Permissions::from_mode(0o700))?;
    }
    let secured = directory.metadata()?;
    if secured.uid() != nix::unistd::Uid::effective().as_raw() || secured.mode() & 0o777 != 0o700 {
        return Err(std::io::Error::other(
            "transaction directory must remain current-owner private (0700)",
        ));
    }
    Ok(directory)
}

#[cfg(unix)]
fn unix_transaction_directory_is_secure(directory: &File) -> std::io::Result<bool> {
    use std::os::unix::fs::MetadataExt;

    let metadata = directory.metadata()?;
    Ok(metadata.is_dir()
        && metadata.uid() == nix::unistd::Uid::effective().as_raw()
        && metadata.mode() & 0o777 == 0o700)
}

#[cfg(unix)]
fn unix_file_identity(file: &File) -> std::io::Result<FilesystemIdentity> {
    use std::os::unix::fs::MetadataExt;

    let metadata = file.metadata()?;
    Ok(FilesystemIdentity::Unix {
        device: metadata.dev(),
        inode: metadata.ino(),
    })
}

fn claim_path(lock_path: &Path) -> std::io::Result<PathBuf> {
    let name = lock_path
        .file_name()
        .ok_or_else(|| std::io::Error::other("install lock has no file name"))?;
    let mut claim_name = name.to_os_string();
    claim_name.push(".owner");
    Ok(lock_path.with_file_name(claim_name))
}

fn prepared_claim_path(claim_path: &Path, slot: usize) -> std::io::Result<PathBuf> {
    let name = claim_path
        .file_name()
        .ok_or_else(|| std::io::Error::other("install claim has no file name"))?;
    let mut prepared_name = name.to_os_string();
    prepared_name.push(format!(".prepare.{slot}"));
    Ok(claim_path.with_file_name(prepared_name))
}

#[cfg(unix)]
fn authority_name<'a>(
    parent: &ParentAuthority,
    path: &'a Path,
) -> std::io::Result<&'a std::ffi::OsStr> {
    if path.parent() != Some(parent.path.as_path()) {
        return Err(std::io::Error::other(
            "installation authority entry escaped its retained transaction directory",
        ));
    }
    path.file_name()
        .ok_or_else(|| std::io::Error::other("installation authority entry has no file name"))
}

fn canonical_authority_path(parent: &ParentAuthority, path: &Path) -> std::io::Result<PathBuf> {
    #[cfg(unix)]
    {
        Ok(parent.canonical_path.join(authority_name(parent, path)?))
    }
    #[cfg(windows)]
    {
        let _ = parent;
        std::fs::canonicalize(path)
    }
}

fn link_authority_file(
    parent: &ParentAuthority,
    source: &Path,
    destination: &Path,
) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        rustix::fs::linkat(
            &parent.directory,
            authority_name(parent, source)?,
            &parent.directory,
            authority_name(parent, destination)?,
            rustix::fs::AtFlags::empty(),
        )?;
        Ok(())
    }
    #[cfg(windows)]
    {
        let _ = parent;
        std::fs::hard_link(source, destination)
    }
}

#[cfg(unix)]
fn unlink_authority_file(parent: &ParentAuthority, path: &Path) -> std::io::Result<()> {
    rustix::fs::unlinkat(
        &parent.directory,
        authority_name(parent, path)?,
        rustix::fs::AtFlags::empty(),
    )?;
    Ok(())
}

fn authority_file_identity(
    parent: &ParentAuthority,
    path: &Path,
) -> std::io::Result<FilesystemIdentity> {
    #[cfg(unix)]
    {
        let stat = unix_authority_stat(parent, path)?;
        Ok(FilesystemIdentity::Unix {
            device: stat.st_dev as u64,
            inode: stat.st_ino as u64,
        })
    }
    #[cfg(windows)]
    {
        let _ = parent;
        regular_file_identity(path)
    }
}

fn authority_file_size(parent: &ParentAuthority, path: &Path) -> std::io::Result<u64> {
    #[cfg(unix)]
    {
        let stat = unix_authority_stat(parent, path)?;
        u64::try_from(stat.st_size)
            .map_err(|_| std::io::Error::other("installation authority size is negative"))
    }
    #[cfg(windows)]
    {
        let _ = parent;
        Ok(safe_regular_metadata(path)?.len())
    }
}

#[cfg(unix)]
fn unix_authority_stat(parent: &ParentAuthority, path: &Path) -> std::io::Result<rustix::fs::Stat> {
    let stat = rustix::fs::statat(
        &parent.directory,
        authority_name(parent, path)?,
        rustix::fs::AtFlags::SYMLINK_NOFOLLOW,
    )?;
    if rustix::fs::FileType::from_raw_mode(stat.st_mode) != rustix::fs::FileType::RegularFile {
        return Err(std::io::Error::other(
            "installation authority entry must be a regular non-alias file",
        ));
    }
    Ok(stat)
}

#[path = "locking/claim.rs"]
mod claim;
#[cfg(unix)]
use claim::open_unix_authority_file;
use claim::{acquire_claim, bounded_drop_diagnostic, open_claim_authority, open_snapshot_reader};

fn acquire_os_lock(
    parent: &ParentAuthority,
    path: &Path,
) -> std::io::Result<Result<(HeldAuthorityFile, PathBuf, FilesystemIdentity), ()>> {
    reject_unsafe_existing_file(parent, path)?;
    let before = authority_file_identity(parent, path).ok();
    #[cfg(windows)]
    let file = vaultspec_windows_authority::AuthorityFile::open_lock(path)
        .map(HeldAuthorityFile::Windows)?;
    #[cfg(unix)]
    let file = HeldAuthorityFile::Unix(open_unix_authority_file(
        parent,
        path,
        rustix::fs::OFlags::CREATE
            | rustix::fs::OFlags::RDWR
            | rustix::fs::OFlags::CLOEXEC
            | rustix::fs::OFlags::NOFOLLOW,
        rustix::fs::Mode::RUSR | rustix::fs::Mode::WUSR,
    )?);
    if !FileExt::try_lock_exclusive(file.file())? {
        return Ok(Err(()));
    }
    let identity = file.identity()?;
    if identity != authority_file_identity(parent, path)? {
        return Err(std::io::Error::other(
            "open install lock handle does not match its path",
        ));
    }
    if before.is_some_and(|before| before != identity) {
        return Err(std::io::Error::other(
            "install lock entry changed while being opened",
        ));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let metadata = file.file().metadata()?;
        if identity
            != (FilesystemIdentity::Unix {
                device: metadata.dev(),
                inode: metadata.ino(),
            })
        {
            return Err(std::io::Error::other(
                "open install lock handle does not match its path",
            ));
        }
    }
    let after = authority_file_identity(parent, path)?;
    if identity != after {
        return Err(std::io::Error::other(
            "install lock entry changed after acquisition",
        ));
    }
    Ok(Ok((
        file,
        canonical_authority_path(parent, path)?,
        identity,
    )))
}

fn busy_diagnostics(parent: &ParentAuthority, path: &Path) -> LockBusy {
    match inspect_claim(parent, path) {
        ClaimInspection::Valid(snapshot) => LockBusy {
            owner: Some(snapshot.record.owner),
            pid: Some(snapshot.record.pid),
        },
        ClaimInspection::Missing | ClaimInspection::Blocked => LockBusy {
            owner: None,
            pid: None,
        },
    }
}

enum ClaimInspection {
    Missing,
    Valid(ClaimSnapshot),
    Blocked,
}

fn inspect_claim(parent: &ParentAuthority, path: &Path) -> ClaimInspection {
    match authority_file_identity(parent, path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => ClaimInspection::Missing,
        Err(_) => ClaimInspection::Blocked,
        Ok(_) => read_claim_snapshot(parent, path)
            .map(ClaimInspection::Valid)
            .unwrap_or(ClaimInspection::Blocked),
    }
}

fn read_claim_snapshot(parent: &ParentAuthority, path: &Path) -> std::io::Result<ClaimSnapshot> {
    if authority_file_size(parent, path)? > MAX_CLAIM_BYTES {
        return Err(std::io::Error::other(
            "installation claim exceeds byte bound",
        ));
    }
    let before = authority_file_identity(parent, path)?;
    let mut file = open_snapshot_reader(parent, path)?;
    let bytes = read_bounded(file.file_mut())?;
    let after = authority_file_identity(parent, path)?;
    if before != after || file.identity()? != before {
        return Err(std::io::Error::other(
            "installation claim changed while being read",
        ));
    }
    let record: ClaimRecord = serde_json::from_slice(&bytes)
        .map_err(|error| std::io::Error::other(format!("invalid installation claim: {error}")))?;
    record.validate()?;
    Ok(ClaimSnapshot {
        identity: before,
        record,
        bytes,
    })
}

fn read_bounded(file: &mut File) -> std::io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    file.take(MAX_CLAIM_BYTES + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_CLAIM_BYTES {
        return Err(std::io::Error::other(
            "installation claim exceeds byte bound",
        ));
    }
    Ok(bytes)
}

fn recover_stale_claim(
    parent: &ParentAuthority,
    path: &Path,
    expected: &ClaimSnapshot,
) -> std::io::Result<bool> {
    let mut file = match open_claim_authority(parent, path) {
        Ok(file) => file,
        Err(_) => return Ok(false),
    };
    if file.identity()? != expected.identity {
        return Ok(false);
    }
    let opened_bytes = read_bounded(file.file_mut())?;
    file.file_mut().seek(SeekFrom::Start(0))?;
    if opened_bytes != expected.bytes || read_claim_snapshot(parent, path)? != *expected {
        return Ok(false);
    }
    retract_exact(parent, path, expected, Some(&file))
}

fn remove_created_exact(
    parent: &ParentAuthority,
    path: &Path,
    authority: &HeldAuthorityFile,
) -> std::io::Result<bool> {
    #[cfg(windows)]
    {
        let _ = (parent, path);
        // The prepared entry was created new and this retained handle is the
        // object to retract. Handle disposition cannot delete a replacement at
        // the same pathname even if another same-user process renamed it.
        authority.mark_delete_on_close()?;
        Ok(true)
    }
    #[cfg(unix)]
    {
        let expected = authority.identity()?;
        if authority_file_identity(parent, path).ok() != Some(expected) {
            return Ok(false);
        }
        // The retained directory/file identities and owner-private directory
        // exclude other users and accidental replacement. Unix still has an
        // identity-check-to-unlink gap against a deliberately hostile process
        // running under the same uid; this API claims only cooperative same-uid
        // product-process safety and fails closed when it observes replacement.
        unlink_authority_file(parent, path)?;
        Ok(true)
    }
}

fn retract_exact(
    parent: &ParentAuthority,
    path: &Path,
    expected: &ClaimSnapshot,
    authority: Option<&HeldAuthorityFile>,
) -> std::io::Result<bool> {
    if authority.is_some_and(|file| file.identity().ok() != Some(expected.identity)) {
        return Ok(false);
    }
    let current = match read_claim_snapshot(parent, path) {
        Ok(current) => current,
        Err(_) => return Ok(false),
    };
    if current != *expected || authority_file_identity(parent, path)? != expected.identity {
        return Ok(false);
    }

    #[cfg(windows)]
    {
        let Some(authority) = authority else {
            return Ok(false);
        };
        // No path-based delete is permitted on Windows. Fixed claims retain a
        // no-delete-share handle, so this verified name cannot be replaced
        // between the snapshot and marking this exact object delete-pending.
        // Prepared claims may still be renamed, but marking the retained object
        // can never delete a replacement at the original pathname.
        authority.mark_delete_on_close()?;
        Ok(true)
    }
    #[cfg(unix)]
    {
        // Unix has no stable safe-Rust unlink-by-open-file API. The retained
        // identities, 0700 current-owner directory, no-follow opens, and
        // immediate identity check make this exact for cooperating product
        // processes and exclude other users. They do not defeat a malicious
        // same-uid process racing this final check and unlink; no stronger
        // same-user hostile-race claim is made here.
        unlink_authority_file(parent, path)?;
        Ok(true)
    }
}

fn valid_owner(owner: &str) -> bool {
    !owner.trim().is_empty()
        && owner.len() <= MAX_OWNER_BYTES
        && !owner.chars().any(char::is_control)
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut encoded = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        encoded.push(char::from(HEX[usize::from(byte >> 4)]));
        encoded.push(char::from(HEX[usize::from(byte & 0x0f)]));
    }
    encoded
}

fn process_start_time(pid: u32) -> Option<u64> {
    use sysinfo::{Pid, ProcessesToUpdate, System};
    let mut system = System::new();
    let target = Pid::from_u32(pid);
    // `sysinfo` returns either the refreshed entry or absence, without exposing
    // why an entry was absent. Authority-bearing callers therefore join absence
    // to a separate OS existence probe before treating it as death. Current-
    // process claim creation fails closed if no start time is returned.
    system.refresh_processes(ProcessesToUpdate::Some(&[target]), true);
    system.process(target).map(sysinfo::Process::start_time)
}

/// The conservative result of joining a recorded pid/start-time pair to the
/// current operating-system process table.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProcessInstanceLiveness {
    /// The pid exists with the same observed start second. Because `sysinfo`
    /// reports seconds resolution, equality is conservatively kept live.
    LiveSameInstance,
    /// Enumeration positively found another start time, or an OS existence
    /// probe positively found no live process at the pid.
    DeadOrDifferentInstance,
    /// Enumeration and the OS probe could not establish either conclusion.
    Unverifiable,
}

/// Observe one recorded process instance. Recovery authority is granted only
/// for [`ProcessInstanceLiveness::DeadOrDifferentInstance`]; callers must keep
/// both other states busy/alive.
#[must_use]
pub fn process_instance_liveness(pid: u32, start_time: u64) -> ProcessInstanceLiveness {
    if pid == 0 || start_time == 0 {
        return ProcessInstanceLiveness::Unverifiable;
    }
    classify_process_instance_observation(pid, start_time, process_start_time(pid))
}

fn classify_process_instance_observation(
    pid: u32,
    recorded_start_time: u64,
    observed_start_time: Option<u64>,
) -> ProcessInstanceLiveness {
    if let Some(current) = observed_start_time.filter(|current| *current != 0) {
        return if current == recorded_start_time {
            ProcessInstanceLiveness::LiveSameInstance
        } else {
            ProcessInstanceLiveness::DeadOrDifferentInstance
        };
    }
    match os_process_existence(pid) {
        OsProcessExistence::Missing => ProcessInstanceLiveness::DeadOrDifferentInstance,
        OsProcessExistence::Exists | OsProcessExistence::Unverifiable => {
            ProcessInstanceLiveness::Unverifiable
        }
    }
}

fn pid_liveness(pid: u32) -> ProcessInstanceLiveness {
    if pid == 0 {
        return ProcessInstanceLiveness::Unverifiable;
    }
    if process_start_time(pid).is_some() {
        return ProcessInstanceLiveness::LiveSameInstance;
    }
    match os_process_existence(pid) {
        OsProcessExistence::Missing => ProcessInstanceLiveness::DeadOrDifferentInstance,
        OsProcessExistence::Exists | OsProcessExistence::Unverifiable => {
            ProcessInstanceLiveness::Unverifiable
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OsProcessExistence {
    Exists,
    Missing,
    Unverifiable,
}

#[cfg(unix)]
fn os_process_existence(pid: u32) -> OsProcessExistence {
    let Ok(raw_pid) = i32::try_from(pid) else {
        return OsProcessExistence::Unverifiable;
    };
    if raw_pid <= 0 {
        return OsProcessExistence::Unverifiable;
    }
    match nix::sys::signal::kill(nix::unistd::Pid::from_raw(raw_pid), None) {
        Ok(()) => OsProcessExistence::Exists,
        Err(nix::errno::Errno::ESRCH) => OsProcessExistence::Missing,
        Err(nix::errno::Errno::EPERM) => OsProcessExistence::Exists,
        Err(_) => OsProcessExistence::Unverifiable,
    }
}

#[cfg(windows)]
fn os_process_existence(pid: u32) -> OsProcessExistence {
    match vaultspec_windows_authority::probe_process_existence(pid) {
        vaultspec_windows_authority::ProcessExistence::Exists => OsProcessExistence::Exists,
        vaultspec_windows_authority::ProcessExistence::Missing => OsProcessExistence::Missing,
        vaultspec_windows_authority::ProcessExistence::Unverifiable => {
            OsProcessExistence::Unverifiable
        }
    }
}

fn reject_unsafe_existing_file(parent: &ParentAuthority, path: &Path) -> std::io::Result<()> {
    match authority_file_identity(parent, path) {
        Ok(_) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

#[cfg(windows)]
fn safe_regular_metadata(path: &Path) -> std::io::Result<std::fs::Metadata> {
    let metadata = std::fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || !metadata.is_file() || is_windows_reparse(&metadata) {
        return Err(std::io::Error::other(
            "installation authority file must be a regular non-alias entry",
        ));
    }
    Ok(metadata)
}

fn safe_directory_metadata(path: &Path) -> std::io::Result<std::fs::Metadata> {
    let metadata = std::fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() || is_windows_reparse(&metadata) {
        return Err(std::io::Error::other(
            "installation authority directory must be a non-alias directory",
        ));
    }
    Ok(metadata)
}

#[cfg(windows)]
fn is_windows_reparse(metadata: &std::fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
}

#[cfg(not(windows))]
fn is_windows_reparse(_metadata: &std::fs::Metadata) -> bool {
    false
}

#[cfg(windows)]
fn regular_file_identity(path: &Path) -> std::io::Result<FilesystemIdentity> {
    let metadata = safe_regular_metadata(path)?;
    filesystem_identity(path, &metadata)
}

fn directory_identity(path: &Path) -> std::io::Result<FilesystemIdentity> {
    let metadata = safe_directory_metadata(path)?;
    filesystem_identity(path, &metadata)
}

fn filesystem_identity(
    path: &Path,
    metadata: &std::fs::Metadata,
) -> std::io::Result<FilesystemIdentity> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        let _ = path;
        Ok(FilesystemIdentity::Unix {
            device: metadata.dev(),
            inode: metadata.ino(),
        })
    }
    #[cfg(windows)]
    {
        let _ = metadata;
        let identity = vaultspec_windows_authority::AuthorityFile::identity_at_path(path)?;
        Ok(FilesystemIdentity::WindowsHighRes {
            volume: identity.volume_serial_number,
            file_id: identity.file_id,
        })
    }
}

/// Why a held guard does not authorize mutation of the expected product tree.
#[derive(Debug)]
pub enum LockAuthorityError {
    /// The expected lock path could not be resolved or inspected safely.
    Io(std::io::Error),
    /// The canonical path or filesystem identity does not match the held lock.
    AuthorityMismatch,
}

impl std::fmt::Display for LockAuthorityError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LockAuthorityError::Io(error) => {
                write!(f, "cannot validate canonical product install lock: {error}")
            }
            LockAuthorityError::AuthorityMismatch => write!(
                f,
                "held guard is not the canonical product installation transaction lock"
            ),
        }
    }
}

impl std::error::Error for LockAuthorityError {}

impl From<std::io::Error> for LockAuthorityError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

/// Stale product state recorded by a prior generation (from discovery or a
/// receipt): the owner that wrote it and the process id it named.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StaleState {
    /// The owner id recorded with the stale state.
    pub owner: String,
    /// The process id the stale state named.
    pub pid: u32,
}

/// Why an owner-matched stale-state quarantine was refused.
#[derive(Debug, PartialEq, Eq)]
pub enum QuarantineRefusal {
    /// The stale state belongs to a different owner. A live foreign or
    /// unverifiable resident stays immutable (ADR D4).
    ForeignOwner,
    /// The recorded process is still alive; it must be proven dead first.
    ProcessLive,
    /// Process inspection could not positively prove the recorded pid dead.
    ProcessUnverifiable,
}

impl std::fmt::Display for QuarantineRefusal {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            QuarantineRefusal::ForeignOwner => {
                write!(
                    f,
                    "stale state is owned by a different install; refusing to quarantine"
                )
            }
            QuarantineRefusal::ProcessLive => {
                write!(
                    f,
                    "recorded process is still alive; cannot quarantine live state"
                )
            }
            QuarantineRefusal::ProcessUnverifiable => write!(
                f,
                "recorded process state is unverifiable; refusing stale-state quarantine"
            ),
        }
    }
}

impl std::error::Error for QuarantineRefusal {}

/// Decide whether the current owner may quarantine stale state. Permits the
/// quarantine only when the stale state's owner matches *and* the recorded
/// process is proven dead — the two conditions the ADR requires under the
/// installation transaction lock. Must be called while holding the lock.
pub fn quarantine_owner_matched_stale(
    current_owner: &str,
    stale: &StaleState,
) -> std::result::Result<(), QuarantineRefusal> {
    if stale.owner != current_owner {
        return Err(QuarantineRefusal::ForeignOwner);
    }
    match pid_liveness(stale.pid) {
        ProcessInstanceLiveness::LiveSameInstance => {
            return Err(QuarantineRefusal::ProcessLive);
        }
        ProcessInstanceLiveness::Unverifiable => {
            return Err(QuarantineRefusal::ProcessUnverifiable);
        }
        ProcessInstanceLiveness::DeadOrDifferentInstance => {}
    }
    Ok(())
}

/// Conservative convenience observation for non-authorizing polling paths.
/// Unverifiable processes are reported alive; authority-bearing recovery uses
/// [`process_instance_liveness`] or `pid_liveness` directly.
#[must_use]
pub fn process_is_alive(pid: u32) -> bool {
    !matches!(
        pid_liveness(pid),
        ProcessInstanceLiveness::DeadOrDifferentInstance
    )
}

#[cfg(test)]
#[path = "locking/tests.rs"]
mod tests;
