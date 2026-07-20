//! Safe public wrappers around the bounded Windows handle operations required
//! by the product installation authority.
//!
//! This crate is deliberately isolated from the engine workspace's
//! `unsafe_code = "forbid"` lint under ADR D9. The crate-level lint remains
//! `deny`; only the private [`os`] module lowers it for the minimal Win32 calls,
//! immediately beside their validity arguments. Consumers receive only owned
//! files and directories, 128-bit identities, exact-handle operations, and
//! bounded process observations.

#![cfg(windows)]

use std::ffi::OsStr;
use std::fs::{File, OpenOptions};
use std::io;
use std::os::windows::ffi::OsStrExt;
use std::os::windows::fs::OpenOptionsExt;
use std::path::Path;

use windows_sys::Win32::Storage::FileSystem::{
    FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE,
};

mod install;
#[allow(
    unsafe_code,
    reason = "ADR D9 confines the minimum audited Win32 FFI to this private module"
)]
mod os;

use install::install_file_state;

const DELETE_ACCESS: u32 = 0x0001_0000;
const GENERIC_READ: u32 = 0x8000_0000;
const GENERIC_WRITE: u32 = 0x4000_0000;
const FILE_FLAG_OPEN_REPARSE_POINT: u32 = 0x0020_0000;
const FILE_FLAG_BACKUP_SEMANTICS: u32 = 0x0200_0000;
const MAX_DIRECTORY_COMPONENT_UTF16_UNITS: usize = 255;

#[derive(Debug, Clone, Copy)]
enum OpenDisposition {
    Existing,
    CreateNew,
    OpenOrCreate,
}

/// A high-resolution Windows `FILE_ID_INFO` identity.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HighResFileId {
    /// Volume serial number returned by Windows.
    pub volume_serial_number: u64,
    /// Full 128-bit file identifier returned by Windows.
    pub file_id: u128,
}

/// A bounded operating-system observation used only when process enumeration
/// cannot identify a process instance.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProcessExistence {
    /// The process exists and has not terminated.
    Exists,
    /// The operating system positively reports no live process at this pid.
    Missing,
    /// Access or another operating-system failure prevents a conclusion.
    Unverifiable,
}

/// Positively probe whether a Windows process exists without exposing a raw
/// handle. Access failures remain [`ProcessExistence::Unverifiable`].
#[must_use]
pub fn probe_process_existence(pid: u32) -> ProcessExistence {
    os::probe_process_existence(pid)
}

/// An owned non-reparse directory handle bound to a full-width identity.
///
/// The handle denies write and delete sharing for its retained lifetime. Child
/// traversal is available only through one validated name component relative
/// to this exact handle; no raw handle or arbitrary child path is exposed.
#[derive(Debug)]
pub struct AuthorityDirectory {
    directory: File,
    identity: HighResFileId,
}

impl AuthorityDirectory {
    /// Bootstrap authority from one existing directory pathname.
    ///
    /// This is the only pathname-based directory constructor. The final link is
    /// opened without reparse traversal and the returned handle itself is
    /// validated before this method succeeds.
    pub fn open_existing(path: &Path) -> io::Result<Self> {
        Self::from_file(os::open_existing_directory(path)?)
    }

    /// Open one existing direct child directory relative to this retained
    /// authority.
    pub fn open_child_directory(&self, name: &OsStr) -> io::Result<Self> {
        let name = validate_child_component(name)?;
        Self::from_file(os::open_child_directory(&self.directory, &name, false)?)
    }

    /// Exclusively create and retain one direct child directory relative to
    /// this authority.
    pub fn create_child_directory(&self, name: &OsStr) -> io::Result<Self> {
        let name = validate_child_component(name)?;
        Self::from_file(os::open_child_directory(&self.directory, &name, true)?)
    }

    /// The copied full-width identity of this exact retained directory.
    #[must_use]
    pub fn identity(&self) -> HighResFileId {
        self.identity
    }

    /// Delete exactly this retained directory if it is empty.
    ///
    /// Success marks the exact handle delete-pending and immediately consumes
    /// and closes it. Failure preserves the still-owned authority alongside the
    /// operating-system error so the caller can remove real children and retry.
    pub fn remove_empty(self) -> Result<(), RemoveEmptyDirectoryError> {
        if let Err(source) = os::mark_delete_on_close(&self.directory) {
            return Err(RemoveEmptyDirectoryError {
                authority: self,
                source,
            });
        }
        drop(self);
        Ok(())
    }

    fn from_file(directory: File) -> io::Result<Self> {
        let identity = os::validated_directory_identity(&directory)?;
        Ok(Self {
            directory,
            identity,
        })
    }

    fn validate_retained(&self) -> io::Result<()> {
        if os::validated_directory_identity(&self.directory)? != self.identity {
            return Err(io::Error::other(
                "retained directory identity changed unexpectedly",
            ));
        }
        Ok(())
    }

    fn validate_named_path(&self, path: &Path) -> io::Result<()> {
        if directory_identity_at_path(path)? != self.identity {
            return Err(io::Error::other(
                "named directory path does not identify the retained directory",
            ));
        }
        Ok(())
    }
}

/// A failed terminal empty-directory cleanup that retains exact authority.
#[derive(Debug)]
pub struct RemoveEmptyDirectoryError {
    authority: AuthorityDirectory,
    source: io::Error,
}

impl RemoveEmptyDirectoryError {
    /// Borrow the still-owned directory authority for diagnostics or identity
    /// comparison.
    #[must_use]
    pub fn authority(&self) -> &AuthorityDirectory {
        &self.authority
    }

    /// Borrow the operating-system cleanup failure.
    #[must_use]
    pub fn error(&self) -> &io::Error {
        &self.source
    }

    /// Recover both the retained authority and operating-system failure.
    #[must_use]
    pub fn into_parts(self) -> (AuthorityDirectory, io::Error) {
        (self.authority, self.source)
    }
}

impl std::fmt::Display for RemoveEmptyDirectoryError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "exact empty-directory cleanup failed: {}", self.source)
    }
}

impl std::error::Error for RemoveEmptyDirectoryError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        Some(&self.source)
    }
}

/// Exact stage at which synchronized installation stopped.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InstallSynchronizedFileStage {
    /// Input paths or names were outside the bounded operation grammar.
    InputValidation,
    /// The retained directory handle no longer passed full validation.
    RetainedDirectoryValidation,
    /// The named directory path did not resolve to the retained directory.
    NamedDirectoryValidation,
    /// The named directory path could not be normalized without changing its
    /// retained identity.
    DirectoryPathCanonicalization,
    /// The existing source could not be opened without creating it.
    SourceOpen,
    /// The newly retained source failed its initial full-state validation.
    SourceInitialValidation,
    /// The exact retained source could not be synchronized.
    SourceSynchronization,
    /// Source state changed or became unsafe after synchronization.
    SourcePostSynchronizeValidation,
    /// The source name did not resolve back to the synchronized object.
    SourceNameValidation,
    /// An existing destination was unsafe, aliased, or could not be inspected.
    DestinationInspection,
    /// Source or destination state changed before the native move.
    OperandPreMoveValidation,
    /// The retained directory failed its immediate pre-move validation.
    RetainedDirectoryPreMoveValidation,
    /// The named directory failed its immediate pre-move validation.
    NamedDirectoryPreMoveValidation,
    /// The full exclusive directory authority could not be recovered after
    /// the native move attempt.
    DirectoryAuthorityRecovery,
    /// `MoveFileExW` returned failure.
    Move,
    /// The retained source changed or became unsafe after a reported move.
    SourcePostMoveValidation,
    /// The destination could not be reopened after a reported move.
    DestinationPostMoveOpen,
    /// The reopened destination did not exactly match the source state.
    DestinationPostMoveValidation,
    /// The old source name was not observably absent after a reported move.
    SourceAbsenceValidation,
    /// The retained directory failed validation after a reported move.
    RetainedDirectoryPostMoveValidation,
    /// The named directory path failed validation after a reported move.
    NamedDirectoryPostMoveValidation,
}

/// What the native namespace operation reported before validation failed.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InstallSynchronizedFileOutcome {
    /// The native move was not invoked.
    BeforeMove,
    /// The native move returned failure. That report does not establish
    /// namespace stasis; callers must inspect the retained authorities and
    /// names before authorizing any recovery mutation.
    MoveReturnedFailure,
    /// The native move returned success, but the installed namespace could not
    /// be completely revalidated.
    MoveReturnedSuccessUnverified,
}

/// Copied validated regular-file state captured before a synchronized install.
///
/// This is evidence, not an authority handle and not proof that the old name
/// remained unchanged after the native move attempt.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct InstallFileSnapshot(os::RegularFileState);

impl InstallFileSnapshot {
    /// The copied full-width file identity.
    #[must_use]
    pub fn identity(self) -> HighResFileId {
        self.0.identity
    }

    /// The copied end-of-file length in bytes.
    #[must_use]
    pub fn size(self) -> u64 {
        self.0.size
    }

    /// The copied hard-link count.
    #[must_use]
    pub fn link_count(self) -> u64 {
        self.0.link_count
    }
}

impl From<os::RegularFileState> for InstallFileSnapshot {
    fn from(state: os::RegularFileState) -> Self {
        Self(state)
    }
}

#[derive(Debug)]
enum InstallDirectoryAuthorityState {
    Exclusive(AuthorityDirectory),
    Transition {
        directory: File,
        identity: HighResFileId,
    },
}

/// Exact parent-directory authority retained across a synchronized install.
///
/// The representation is intentionally opaque. During the native move it may
/// be a read-only transition authority that permits same-directory namespace
/// mutation; callers must recover the exclusive authority before authorizing
/// another operation.
#[derive(Debug)]
pub struct InstallDirectoryAuthority(InstallDirectoryAuthorityState);

impl InstallDirectoryAuthority {
    fn from_exclusive(authority: AuthorityDirectory) -> Self {
        Self(InstallDirectoryAuthorityState::Exclusive(authority))
    }

    fn open_transition(path: &Path, expected: HighResFileId) -> io::Result<Self> {
        let directory = open_path_entry(path)?;
        let identity = os::validated_directory_identity(&directory)?;
        if identity != expected {
            return Err(io::Error::other(
                "transition path does not identify the retained directory",
            ));
        }
        Ok(Self(InstallDirectoryAuthorityState::Transition {
            directory,
            identity,
        }))
    }

    fn validate_retained(&self) -> io::Result<()> {
        match &self.0 {
            InstallDirectoryAuthorityState::Exclusive(authority) => authority.validate_retained(),
            InstallDirectoryAuthorityState::Transition {
                directory,
                identity,
            } => {
                if os::validated_directory_identity(directory)? != *identity {
                    return Err(io::Error::other(
                        "retained transition directory identity changed unexpectedly",
                    ));
                }
                Ok(())
            }
        }
    }

    fn validate_named_path(&self, path: &Path) -> io::Result<()> {
        if directory_identity_at_path(path)? != self.identity() {
            return Err(io::Error::other(
                "named directory path does not identify the install directory authority",
            ));
        }
        Ok(())
    }

    /// The copied full-width identity of this exact directory authority.
    #[must_use]
    pub fn identity(&self) -> HighResFileId {
        match &self.0 {
            InstallDirectoryAuthorityState::Exclusive(authority) => authority.identity(),
            InstallDirectoryAuthorityState::Transition { identity, .. } => *identity,
        }
    }

    /// Borrow the full exclusive authority when it is currently available.
    #[must_use]
    pub fn exclusive(&self) -> Option<&AuthorityDirectory> {
        match &self.0 {
            InstallDirectoryAuthorityState::Exclusive(authority) => Some(authority),
            InstallDirectoryAuthorityState::Transition { .. } => None,
        }
    }

    /// Recover the owned exclusive authority without a pathname lookup when it
    /// is already available.
    pub fn into_exclusive(self) -> Result<AuthorityDirectory, Self> {
        match self.0 {
            InstallDirectoryAuthorityState::Exclusive(authority) => Ok(authority),
            state @ InstallDirectoryAuthorityState::Transition { .. } => Err(Self(state)),
        }
    }

    /// Recover full exclusive authority through a path that must identify this
    /// exact retained directory while the transition handle remains live.
    pub fn recover(
        self,
        path: &Path,
    ) -> Result<AuthorityDirectory, RecoverInstallDirectoryAuthorityError> {
        match self.0 {
            InstallDirectoryAuthorityState::Exclusive(authority) => {
                if let Err(source) = authority
                    .validate_retained()
                    .and_then(|()| authority.validate_named_path(path))
                {
                    return Err(RecoverInstallDirectoryAuthorityError {
                        authority: Self::from_exclusive(authority),
                        source,
                    });
                }
                Ok(authority)
            }
            InstallDirectoryAuthorityState::Transition {
                directory,
                identity,
            } => {
                let transition = Self(InstallDirectoryAuthorityState::Transition {
                    directory,
                    identity,
                });
                if let Err(source) = transition.validate_retained() {
                    return Err(RecoverInstallDirectoryAuthorityError {
                        authority: transition,
                        source,
                    });
                }
                let authority = match AuthorityDirectory::open_existing(path) {
                    Ok(authority) => authority,
                    Err(source) => {
                        return Err(RecoverInstallDirectoryAuthorityError {
                            authority: transition,
                            source,
                        });
                    }
                };
                if let Err(source) = transition.validate_retained() {
                    return Err(RecoverInstallDirectoryAuthorityError {
                        authority: transition,
                        source,
                    });
                }
                if authority.identity() != identity {
                    return Err(RecoverInstallDirectoryAuthorityError {
                        authority: transition,
                        source: io::Error::other(
                            "recovered path does not identify the transition directory",
                        ),
                    });
                }
                drop(transition);
                Ok(authority)
            }
        }
    }
}

/// Failure to recover full exclusive authority after a synchronized install.
#[derive(Debug)]
pub struct RecoverInstallDirectoryAuthorityError {
    authority: InstallDirectoryAuthority,
    source: io::Error,
}

impl RecoverInstallDirectoryAuthorityError {
    /// Borrow the exact authority that remains available for recovery.
    #[must_use]
    pub fn authority(&self) -> &InstallDirectoryAuthority {
        &self.authority
    }

    /// Borrow the operating-system or identity-validation failure.
    #[must_use]
    pub fn error(&self) -> &io::Error {
        &self.source
    }

    /// Recover the transition authority and the recovery failure.
    #[must_use]
    pub fn into_parts(self) -> (InstallDirectoryAuthority, io::Error) {
        (self.authority, self.source)
    }
}

impl std::fmt::Display for RecoverInstallDirectoryAuthorityError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "exclusive install-directory recovery failed: {}",
            self.source
        )
    }
}

impl std::error::Error for RecoverInstallDirectoryAuthorityError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        Some(&self.source)
    }
}

/// A synchronized-install failure retaining every authority that can safely
/// remain open, plus copied and reacquisition evidence for an old destination
/// that Windows requires the wrapper to close before replacement.
#[derive(Debug)]
pub struct InstallSynchronizedFileError {
    stage: InstallSynchronizedFileStage,
    outcome: InstallSynchronizedFileOutcome,
    directory_authority: InstallDirectoryAuthority,
    source_authority: Option<AuthorityFile>,
    pre_move_destination_snapshot: Option<InstallFileSnapshot>,
    pre_move_destination_authority: Option<AuthorityFile>,
    reacquired_pre_move_destination_authority: Option<AuthorityFile>,
    installed_destination_authority: Option<AuthorityFile>,
    destination_reacquisition_error: Option<io::Error>,
    native_move_error: Option<io::Error>,
    source: io::Error,
}

#[derive(Debug)]
struct RetainedInstalledDestination {
    pre_move_snapshot: Option<InstallFileSnapshot>,
    installed_authority: Option<AuthorityFile>,
}

impl RetainedInstalledDestination {
    fn none(pre_move_snapshot: Option<InstallFileSnapshot>) -> Self {
        Self {
            pre_move_snapshot,
            installed_authority: None,
        }
    }

    fn exact(
        pre_move_snapshot: Option<InstallFileSnapshot>,
        installed_authority: AuthorityFile,
    ) -> Self {
        Self {
            pre_move_snapshot,
            installed_authority: Some(installed_authority),
        }
    }
}

/// Owned components of a synchronized-install failure.
#[derive(Debug)]
pub struct InstallSynchronizedFileErrorParts {
    /// Exact stage at which installation stopped.
    pub stage: InstallSynchronizedFileStage,
    /// Native namespace outcome observed before the failure.
    pub outcome: InstallSynchronizedFileOutcome,
    /// Exact retained parent-directory authority.
    pub directory_authority: InstallDirectoryAuthority,
    /// Exact synchronized source authority, when acquired.
    pub source_authority: Option<AuthorityFile>,
    /// Copied old-destination state, when one existed.
    pub pre_move_destination_snapshot: Option<InstallFileSnapshot>,
    /// Exact old-destination authority retained when failure occurred before
    /// the native move.
    pub pre_move_destination_authority: Option<AuthorityFile>,
    /// Exact old destination reacquired after a failed native move.
    pub reacquired_pre_move_destination_authority: Option<AuthorityFile>,
    /// Exact installed destination observed after native success.
    pub installed_destination_authority: Option<AuthorityFile>,
    /// Failure to reacquire or re-prove the old destination.
    pub destination_reacquisition_error: Option<io::Error>,
    /// Native move failure retained when parent recovery superseded it.
    pub native_move_error: Option<io::Error>,
    /// Primary validation, recovery, or native-operation failure.
    pub error: io::Error,
}

impl InstallSynchronizedFileError {
    fn refused(
        directory_authority: InstallDirectoryAuthority,
        stage: InstallSynchronizedFileStage,
        source: io::Error,
    ) -> Box<Self> {
        Box::new(Self {
            stage,
            outcome: InstallSynchronizedFileOutcome::BeforeMove,
            directory_authority,
            source_authority: None,
            pre_move_destination_snapshot: None,
            pre_move_destination_authority: None,
            reacquired_pre_move_destination_authority: None,
            installed_destination_authority: None,
            destination_reacquisition_error: None,
            native_move_error: None,
            source,
        })
    }

    fn retained(
        directory_authority: InstallDirectoryAuthority,
        stage: InstallSynchronizedFileStage,
        outcome: InstallSynchronizedFileOutcome,
        source_authority: AuthorityFile,
        pre_move_destination_authority: Option<AuthorityFile>,
        installed_destination_authority: Option<AuthorityFile>,
        source: io::Error,
    ) -> Box<Self> {
        let pre_move_destination_snapshot = pre_move_destination_authority
            .as_ref()
            .and_then(|authority| install_file_state(authority).ok())
            .map(InstallFileSnapshot::from);
        Box::new(Self {
            stage,
            outcome,
            directory_authority,
            source_authority: Some(source_authority),
            pre_move_destination_snapshot,
            pre_move_destination_authority,
            reacquired_pre_move_destination_authority: None,
            installed_destination_authority,
            destination_reacquisition_error: None,
            native_move_error: None,
            source,
        })
    }

    fn retained_with_snapshot(
        directory_authority: InstallDirectoryAuthority,
        stage: InstallSynchronizedFileStage,
        outcome: InstallSynchronizedFileOutcome,
        source_authority: AuthorityFile,
        destination: RetainedInstalledDestination,
        source: io::Error,
    ) -> Box<Self> {
        Box::new(Self {
            stage,
            outcome,
            directory_authority,
            source_authority: Some(source_authority),
            pre_move_destination_snapshot: destination.pre_move_snapshot,
            pre_move_destination_authority: None,
            reacquired_pre_move_destination_authority: None,
            installed_destination_authority: destination.installed_authority,
            destination_reacquisition_error: None,
            native_move_error: None,
            source,
        })
    }

    fn recovery(
        directory_authority: InstallDirectoryAuthority,
        outcome: InstallSynchronizedFileOutcome,
        source_authority: AuthorityFile,
        pre_move_destination_snapshot: Option<InstallFileSnapshot>,
        native_move_error: Option<io::Error>,
        source: io::Error,
    ) -> Box<Self> {
        Box::new(Self {
            stage: InstallSynchronizedFileStage::DirectoryAuthorityRecovery,
            outcome,
            directory_authority,
            source_authority: Some(source_authority),
            pre_move_destination_snapshot,
            pre_move_destination_authority: None,
            reacquired_pre_move_destination_authority: None,
            installed_destination_authority: None,
            destination_reacquisition_error: None,
            native_move_error,
            source,
        })
    }

    fn move_failure(
        directory_authority: InstallDirectoryAuthority,
        source_authority: AuthorityFile,
        pre_move_destination_snapshot: Option<InstallFileSnapshot>,
        reacquired_pre_move_destination_authority: Option<AuthorityFile>,
        destination_reacquisition_error: Option<io::Error>,
        source: io::Error,
    ) -> Box<Self> {
        Box::new(Self {
            stage: InstallSynchronizedFileStage::Move,
            outcome: InstallSynchronizedFileOutcome::MoveReturnedFailure,
            directory_authority,
            source_authority: Some(source_authority),
            pre_move_destination_snapshot,
            pre_move_destination_authority: None,
            reacquired_pre_move_destination_authority,
            installed_destination_authority: None,
            destination_reacquisition_error,
            native_move_error: None,
            source,
        })
    }

    /// Exact validation or native-operation stage that failed.
    #[must_use]
    pub fn stage(&self) -> InstallSynchronizedFileStage {
        self.stage
    }

    /// Native namespace outcome observed before the failure was returned.
    #[must_use]
    pub fn outcome(&self) -> InstallSynchronizedFileOutcome {
        self.outcome
    }

    /// Borrow the exact parent-directory authority retained by this outcome.
    #[must_use]
    pub fn directory_authority(&self) -> &InstallDirectoryAuthority {
        &self.directory_authority
    }

    /// Borrow the exact synchronized source authority when it was acquired.
    #[must_use]
    pub fn source_authority(&self) -> Option<&AuthorityFile> {
        self.source_authority.as_ref()
    }

    /// Copied validated destination state observed before the move, when one
    /// existed. This evidence does not establish namespace stasis.
    #[must_use]
    pub fn pre_move_destination_snapshot(&self) -> Option<InstallFileSnapshot> {
        self.pre_move_destination_snapshot
    }

    /// Borrow the exact destination when failure occurred before the move and
    /// its strict inspection handle could remain open.
    #[must_use]
    pub fn pre_move_destination_authority(&self) -> Option<&AuthorityFile> {
        self.pre_move_destination_authority.as_ref()
    }

    /// Borrow the old destination only when it was reacquired by name after a
    /// failed native move and exactly matched the pre-move snapshot.
    #[must_use]
    pub fn reacquired_pre_move_destination_authority(&self) -> Option<&AuthorityFile> {
        self.reacquired_pre_move_destination_authority.as_ref()
    }

    /// Borrow the exact installed destination observed after a reported move.
    #[must_use]
    pub fn installed_destination_authority(&self) -> Option<&AuthorityFile> {
        self.installed_destination_authority.as_ref()
    }

    /// Borrow the native move error when directory recovery superseded it as
    /// the primary failure.
    #[must_use]
    pub fn native_move_error(&self) -> Option<&io::Error> {
        self.native_move_error.as_ref()
    }

    /// Borrow the failure to reacquire or re-prove the old destination after a
    /// failed native move. Its presence means namespace stasis is unverified.
    #[must_use]
    pub fn destination_reacquisition_error(&self) -> Option<&io::Error> {
        self.destination_reacquisition_error.as_ref()
    }

    /// Borrow the underlying validation or operating-system failure.
    #[must_use]
    pub fn error(&self) -> &io::Error {
        &self.source
    }

    /// Recover the complete typed outcome, retained authorities, and failure.
    #[must_use]
    pub fn into_parts(self: Box<Self>) -> InstallSynchronizedFileErrorParts {
        InstallSynchronizedFileErrorParts {
            stage: self.stage,
            outcome: self.outcome,
            directory_authority: self.directory_authority,
            source_authority: self.source_authority,
            pre_move_destination_snapshot: self.pre_move_destination_snapshot,
            pre_move_destination_authority: self.pre_move_destination_authority,
            reacquired_pre_move_destination_authority: self
                .reacquired_pre_move_destination_authority,
            installed_destination_authority: self.installed_destination_authority,
            destination_reacquisition_error: self.destination_reacquisition_error,
            native_move_error: self.native_move_error,
            error: self.source,
        }
    }
}

impl std::fmt::Display for InstallSynchronizedFileError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "synchronized file installation failed at {:?} after {:?}: {}",
            self.stage, self.outcome, self.source
        )
    }
}

impl std::error::Error for InstallSynchronizedFileError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        Some(&self.source)
    }
}

fn validate_child_component(name: &OsStr) -> io::Result<Vec<u16>> {
    let encoded: Vec<u16> = name.encode_wide().collect();
    let is_dot = encoded.as_slice() == [u16::from(b'.')];
    let is_dot_dot = encoded.as_slice() == [u16::from(b'.'), u16::from(b'.')];
    let contains_reserved = encoded.iter().any(|unit| {
        matches!(
            *unit,
            0x0000
                ..=0x001f
                    | 0x0022
                    | 0x002a
                    | 0x002f
                    | 0x003a
                    | 0x003c
                    | 0x003e
                    | 0x003f
                    | 0x005c
                    | 0x007c
        )
    });
    let has_forbidden_ending = encoded
        .last()
        .is_some_and(|unit| *unit == u16::from(b'.') || *unit == u16::from(b' '));
    if encoded.is_empty()
        || encoded.len() > MAX_DIRECTORY_COMPONENT_UTF16_UNITS
        || is_dot
        || is_dot_dot
        || contains_reserved
        || has_forbidden_ending
        || is_reserved_dos_basename(&encoded)
    {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "child must be one bounded non-prefix UTF-16 component",
        ));
    }
    Ok(encoded)
}

fn is_reserved_dos_basename(encoded: &[u16]) -> bool {
    let extension = encoded
        .iter()
        .position(|unit| *unit == u16::from(b'.'))
        .unwrap_or(encoded.len());
    let base = &encoded[..extension];
    let base = &base[..base
        .iter()
        .rposition(|unit| *unit != u16::from(b' ') && *unit != u16::from(b'.'))
        .map_or(0, |index| index + 1)];
    let mut upper = [0_u16; 4];
    if base.len() > upper.len() {
        return false;
    }
    for (index, unit) in base.iter().enumerate() {
        upper[index] = match *unit {
            unit if (u16::from(b'a')..=u16::from(b'z')).contains(&unit) => {
                unit - u16::from(b'a' - b'A')
            }
            unit => unit,
        };
    }
    matches!(
        &upper[..base.len()],
        [0x0043, 0x004f, 0x004e]
            | [0x0050, 0x0052, 0x004e]
            | [0x0041, 0x0055, 0x0058]
            | [0x004e, 0x0055, 0x004c]
    ) || (base.len() == 4
        && matches!(
            &upper[..3],
            [0x0043, 0x004f, 0x004d] | [0x004c, 0x0050, 0x0054]
        )
        && matches!(upper[3], 0x0031..=0x0039 | 0x00b9 | 0x00b2 | 0x00b3))
}

fn directory_identity_at_path(path: &Path) -> io::Result<HighResFileId> {
    let directory = open_path_entry(path)?;
    os::validated_directory_identity(&directory)
}

fn open_path_entry(path: &Path) -> io::Result<File> {
    open(path, OpenDisposition::Existing, 0, true, true)
}

/// An owned regular-file handle bound to a high-resolution identity.
#[derive(Debug)]
pub struct AuthorityFile {
    file: File,
    identity: HighResFileId,
}

impl AuthorityFile {
    /// Open an existing regular non-reparse file for reading and exact-handle
    /// deletion. The handle denies write and delete sharing, so its content and
    /// named entry cannot be mutated, renamed, or replaced while retained.
    pub fn open_claim(path: &Path) -> io::Result<Self> {
        let file = open(
            path,
            OpenDisposition::Existing,
            GENERIC_READ | DELETE_ACCESS,
            false,
            false,
        )?;
        Self::from_file(file)
    }

    /// Open an existing claim with delete access while continuing to share
    /// delete operations. This is only a publication/recovery transition
    /// handle; callers replace it with [`Self::open_claim`] before authorizing
    /// a transaction.
    pub fn open_claim_shared_delete(path: &Path) -> io::Result<Self> {
        let file = open(
            path,
            OpenDisposition::Existing,
            GENERIC_READ | DELETE_ACCESS,
            true,
            true,
        )?;
        Self::from_file(file)
    }

    /// Create a new prepared claim with read/write/delete access. Delete
    /// sharing remains enabled until the fixed hard link is established and
    /// opened through [`Self::open_claim`].
    pub fn create_prepared(path: &Path) -> io::Result<Self> {
        let file = open(
            path,
            OpenDisposition::CreateNew,
            GENERIC_READ | GENERIC_WRITE | DELETE_ACCESS,
            true,
            true,
        )?;
        Self::from_file(file)
    }

    /// Open or create the OS lock file. Delete sharing is denied so the path
    /// remains bound to this exact handle for the guard lifetime.
    pub fn open_lock(path: &Path) -> io::Result<Self> {
        let file = open(
            path,
            OpenDisposition::OpenOrCreate,
            GENERIC_READ | GENERIC_WRITE,
            true,
            false,
        )?;
        Self::from_file(file)
    }

    /// Open an existing file or directory without delete access to obtain its
    /// exact no-follow high-resolution identity.
    pub fn identity_at_path(path: &Path) -> io::Result<HighResFileId> {
        let file = open(path, OpenDisposition::Existing, 0, true, true)?;
        let metadata = file.metadata()?;
        if metadata.is_file() {
            return os::validated_regular_file_state(&file).map(|state| state.identity);
        }
        if metadata.is_dir() {
            return os::validated_directory_identity(&file);
        }
        Err(io::Error::other(
            "Windows authority path is not a regular non-reparse file or directory",
        ))
    }

    /// Open a regular non-reparse file for bounded reads while allowing an
    /// existing delete-capable authority handle to remain open.
    pub fn open_reader(path: &Path) -> io::Result<Self> {
        let file = open(path, OpenDisposition::Existing, GENERIC_READ, true, true)?;
        Self::from_file(file)
    }

    /// The retained handle identity.
    #[must_use]
    pub fn identity(&self) -> HighResFileId {
        self.identity
    }

    /// Number of hard-link names currently bound to this exact retained file.
    ///
    /// The observation is queried from the retained handle, not a pathname, so
    /// callers can reject aliased authority without racing a later name lookup.
    pub fn link_count(&self) -> io::Result<u64> {
        os::link_count(&self.file)
    }

    /// Borrow the retained standard file for locking or bounded I/O.
    #[must_use]
    pub fn file(&self) -> &File {
        &self.file
    }

    /// Mutably borrow the retained standard file for bounded I/O.
    #[must_use]
    pub fn file_mut(&mut self) -> &mut File {
        &mut self.file
    }

    /// Mark this exact retained handle's entry for deletion when the handle is
    /// closed. No pathname lookup occurs.
    pub fn mark_delete_on_close(&self) -> io::Result<()> {
        os::mark_delete_on_close(&self.file)
    }

    fn from_file(file: File) -> io::Result<Self> {
        let identity = os::validated_regular_file_state(&file)?.identity;
        Ok(Self { file, identity })
    }

    fn open_install_source(path: &Path) -> io::Result<Self> {
        let file = open(
            path,
            OpenDisposition::Existing,
            GENERIC_READ | GENERIC_WRITE,
            false,
            false,
        )?;
        Self::from_file(file)
    }

    fn open_install_destination(path: &Path) -> io::Result<Self> {
        let file = open(path, OpenDisposition::Existing, GENERIC_READ, false, false)?;
        Self::from_file(file)
    }

    fn validated_state(&self) -> io::Result<os::RegularFileState> {
        let state = os::validated_regular_file_state(&self.file)?;
        if state.identity != self.identity {
            return Err(io::Error::other(
                "retained file identity changed unexpectedly",
            ));
        }
        Ok(state)
    }
}

fn open(
    path: &Path,
    disposition: OpenDisposition,
    access: u32,
    share_write: bool,
    share_delete: bool,
) -> io::Result<File> {
    let mut options = OpenOptions::new();
    options
        .read(access & GENERIC_READ != 0)
        .write(access & GENERIC_WRITE != 0);
    options
        .access_mode(access)
        .share_mode(
            FILE_SHARE_READ
                | if share_write { FILE_SHARE_WRITE } else { 0 }
                | if share_delete { FILE_SHARE_DELETE } else { 0 },
        )
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_BACKUP_SEMANTICS);
    match disposition {
        OpenDisposition::Existing => {}
        OpenDisposition::CreateNew => {
            options.create_new(true);
        }
        OpenDisposition::OpenOrCreate => {
            options.create(true);
        }
    }
    options.open(path)
}

#[cfg(test)]
mod tests;
