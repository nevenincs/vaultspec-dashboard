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

#[allow(
    unsafe_code,
    reason = "ADR D9 confines the minimum audited Win32 FFI to this private module"
)]
mod os;

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

    /// Install one fully synchronized existing file at another direct child
    /// name of this exact retained directory.
    ///
    /// This is the sole safe wrapper around the D9 write-through move. It
    /// supplies no receipt policy or mutation authorization. `directory_path`
    /// is required only because `MoveFileExW` is path-based and must resolve to
    /// this retained directory before and after the operation. Source and
    /// destination are bounded single components, so a cross-directory move
    /// cannot be expressed.
    ///
    /// The wrapper detects observed path substitution through exact pre/post
    /// identity checks, but it cannot exclude a hostile same-user namespace
    /// race or a same-size write through a pre-existing handle. Product code
    /// must close and exactly reread the installed bytes under its retained
    /// authorities. `MOVEFILE_WRITE_THROUGH` also remains subject to real local
    /// NTFS power-loss certification; process termination is not that proof.
    pub fn install_synchronized_file(
        &self,
        directory_path: &Path,
        source_name: &OsStr,
        destination_name: &OsStr,
    ) -> Result<AuthorityFile, InstallSynchronizedFileError> {
        if !directory_path.is_absolute() {
            return Err(InstallSynchronizedFileError::refused(
                InstallSynchronizedFileStage::InputValidation,
                io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "synchronized installation requires an absolute directory path",
                ),
            ));
        }
        let source_component = validate_child_component(source_name).map_err(|error| {
            InstallSynchronizedFileError::refused(
                InstallSynchronizedFileStage::InputValidation,
                error,
            )
        })?;
        let destination_component =
            validate_child_component(destination_name).map_err(|error| {
                InstallSynchronizedFileError::refused(
                    InstallSynchronizedFileStage::InputValidation,
                    error,
                )
            })?;
        if source_component == destination_component {
            return Err(InstallSynchronizedFileError::refused(
                InstallSynchronizedFileStage::InputValidation,
                io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "source and destination names must be distinct",
                ),
            ));
        }
        self.validate_retained().map_err(|error| {
            InstallSynchronizedFileError::refused(
                InstallSynchronizedFileStage::RetainedDirectoryValidation,
                error,
            )
        })?;
        self.validate_named_path(directory_path).map_err(|error| {
            InstallSynchronizedFileError::refused(
                InstallSynchronizedFileStage::NamedDirectoryValidation,
                error,
            )
        })?;

        let canonical_directory = std::fs::canonicalize(directory_path).map_err(|error| {
            InstallSynchronizedFileError::refused(
                InstallSynchronizedFileStage::DirectoryPathCanonicalization,
                error,
            )
        })?;
        self.validate_named_path(&canonical_directory)
            .map_err(|error| {
                InstallSynchronizedFileError::refused(
                    InstallSynchronizedFileStage::DirectoryPathCanonicalization,
                    error,
                )
            })?;
        let source_path = canonical_directory.join(source_name);
        let destination_path = canonical_directory.join(destination_name);
        if source_path.parent() != Some(canonical_directory.as_path())
            || destination_path.parent() != Some(canonical_directory.as_path())
        {
            return Err(InstallSynchronizedFileError::refused(
                InstallSynchronizedFileStage::InputValidation,
                io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "installation operands must remain direct children of the retained directory",
                ),
            ));
        }
        os::validate_move_path(&source_path).map_err(|error| {
            InstallSynchronizedFileError::refused(
                InstallSynchronizedFileStage::InputValidation,
                error,
            )
        })?;
        os::validate_move_path(&destination_path).map_err(|error| {
            InstallSynchronizedFileError::refused(
                InstallSynchronizedFileStage::InputValidation,
                error,
            )
        })?;

        let source = AuthorityFile::open_install_source(&source_path).map_err(|error| {
            InstallSynchronizedFileError::refused(InstallSynchronizedFileStage::SourceOpen, error)
        })?;
        let initial = match install_file_state(&source) {
            Ok(state) => state,
            Err(error) => {
                return Err(InstallSynchronizedFileError::retained(
                    InstallSynchronizedFileStage::SourceInitialValidation,
                    InstallSynchronizedFileOutcome::BeforeMove,
                    source,
                    None,
                    None,
                    error,
                ));
            }
        };
        if let Err(error) = source.file.sync_all() {
            return Err(InstallSynchronizedFileError::retained(
                InstallSynchronizedFileStage::SourceSynchronization,
                InstallSynchronizedFileOutcome::BeforeMove,
                source,
                None,
                None,
                error,
            ));
        }
        let synchronized = match install_file_state(&source) {
            Ok(state) => state,
            Err(error) => {
                return Err(InstallSynchronizedFileError::retained(
                    InstallSynchronizedFileStage::SourcePostSynchronizeValidation,
                    InstallSynchronizedFileOutcome::BeforeMove,
                    source,
                    None,
                    None,
                    error,
                ));
            }
        };
        if synchronized != initial {
            return Err(InstallSynchronizedFileError::retained(
                InstallSynchronizedFileStage::SourcePostSynchronizeValidation,
                InstallSynchronizedFileOutcome::BeforeMove,
                source,
                None,
                None,
                io::Error::other("source state changed while it was synchronized"),
            ));
        }

        let named_source = match AuthorityFile::open_reader(&source_path) {
            Ok(authority) => authority,
            Err(error) => {
                return Err(InstallSynchronizedFileError::retained(
                    InstallSynchronizedFileStage::SourceNameValidation,
                    InstallSynchronizedFileOutcome::BeforeMove,
                    source,
                    None,
                    None,
                    error,
                ));
            }
        };
        let named_source_state = match install_file_state(&named_source) {
            Ok(state) => state,
            Err(error) => {
                return Err(InstallSynchronizedFileError::retained(
                    InstallSynchronizedFileStage::SourceNameValidation,
                    InstallSynchronizedFileOutcome::BeforeMove,
                    source,
                    None,
                    None,
                    error,
                ));
            }
        };
        if named_source_state != initial {
            return Err(InstallSynchronizedFileError::retained(
                InstallSynchronizedFileStage::SourceNameValidation,
                InstallSynchronizedFileOutcome::BeforeMove,
                source,
                None,
                None,
                io::Error::other("source name no longer identifies the synchronized file"),
            ));
        }
        drop(named_source);

        let (destination_before, destination_before_state) =
            match AuthorityFile::open_install_destination(&destination_path) {
                Ok(authority) => {
                    let state = match install_file_state(&authority) {
                        Ok(state) => state,
                        Err(error) => {
                            return Err(InstallSynchronizedFileError::retained(
                                InstallSynchronizedFileStage::DestinationInspection,
                                InstallSynchronizedFileOutcome::BeforeMove,
                                source,
                                Some(authority),
                                None,
                                error,
                            ));
                        }
                    };
                    if state.identity == initial.identity {
                        return Err(InstallSynchronizedFileError::retained(
                            InstallSynchronizedFileStage::DestinationInspection,
                            InstallSynchronizedFileOutcome::BeforeMove,
                            source,
                            Some(authority),
                            None,
                            io::Error::new(
                                io::ErrorKind::InvalidInput,
                                "source and destination identify the same file",
                            ),
                        ));
                    }
                    (Some(authority), Some(state))
                }
                Err(error) if error.kind() == io::ErrorKind::NotFound => (None, None),
                Err(error) => {
                    return Err(InstallSynchronizedFileError::retained(
                        InstallSynchronizedFileStage::DestinationInspection,
                        InstallSynchronizedFileOutcome::BeforeMove,
                        source,
                        None,
                        None,
                        error,
                    ));
                }
            };

        let source_pre_move = match install_file_state(&source) {
            Ok(state) => state,
            Err(error) => {
                return Err(InstallSynchronizedFileError::retained(
                    InstallSynchronizedFileStage::OperandPreMoveValidation,
                    InstallSynchronizedFileOutcome::BeforeMove,
                    source,
                    destination_before,
                    None,
                    error,
                ));
            }
        };
        if source_pre_move != initial {
            return Err(InstallSynchronizedFileError::retained(
                InstallSynchronizedFileStage::OperandPreMoveValidation,
                InstallSynchronizedFileOutcome::BeforeMove,
                source,
                destination_before,
                None,
                io::Error::other("source state changed before write-through installation"),
            ));
        }
        if let (Some(authority), Some(expected)) =
            (destination_before.as_ref(), destination_before_state)
        {
            let observed = match install_file_state(authority) {
                Ok(state) => state,
                Err(error) => {
                    return Err(InstallSynchronizedFileError::retained(
                        InstallSynchronizedFileStage::OperandPreMoveValidation,
                        InstallSynchronizedFileOutcome::BeforeMove,
                        source,
                        destination_before,
                        None,
                        error,
                    ));
                }
            };
            if observed != expected {
                return Err(InstallSynchronizedFileError::retained(
                    InstallSynchronizedFileStage::OperandPreMoveValidation,
                    InstallSynchronizedFileOutcome::BeforeMove,
                    source,
                    destination_before,
                    None,
                    io::Error::other("destination state changed before installation"),
                ));
            }
        }
        let named_source_pre_move = match AuthorityFile::open_reader(&source_path) {
            Ok(authority) => authority,
            Err(error) => {
                return Err(InstallSynchronizedFileError::retained(
                    InstallSynchronizedFileStage::OperandPreMoveValidation,
                    InstallSynchronizedFileOutcome::BeforeMove,
                    source,
                    destination_before,
                    None,
                    error,
                ));
            }
        };
        let named_source_pre_move_state = match install_file_state(&named_source_pre_move) {
            Ok(state) => state,
            Err(error) => {
                return Err(InstallSynchronizedFileError::retained(
                    InstallSynchronizedFileStage::OperandPreMoveValidation,
                    InstallSynchronizedFileOutcome::BeforeMove,
                    source,
                    destination_before,
                    None,
                    error,
                ));
            }
        };
        if named_source_pre_move_state != initial {
            return Err(InstallSynchronizedFileError::retained(
                InstallSynchronizedFileStage::OperandPreMoveValidation,
                InstallSynchronizedFileOutcome::BeforeMove,
                source,
                destination_before,
                None,
                io::Error::other("source name changed before installation"),
            ));
        }
        drop(named_source_pre_move);
        if let Some(expected) = destination_before_state {
            let named_destination = match AuthorityFile::open_reader(&destination_path) {
                Ok(authority) => authority,
                Err(error) => {
                    return Err(InstallSynchronizedFileError::retained(
                        InstallSynchronizedFileStage::OperandPreMoveValidation,
                        InstallSynchronizedFileOutcome::BeforeMove,
                        source,
                        destination_before,
                        None,
                        error,
                    ));
                }
            };
            let named_destination_state = match install_file_state(&named_destination) {
                Ok(state) => state,
                Err(error) => {
                    return Err(InstallSynchronizedFileError::retained(
                        InstallSynchronizedFileStage::OperandPreMoveValidation,
                        InstallSynchronizedFileOutcome::BeforeMove,
                        source,
                        destination_before,
                        None,
                        error,
                    ));
                }
            };
            if named_destination_state != expected {
                return Err(InstallSynchronizedFileError::retained(
                    InstallSynchronizedFileStage::OperandPreMoveValidation,
                    InstallSynchronizedFileOutcome::BeforeMove,
                    source,
                    destination_before,
                    None,
                    io::Error::other("destination name changed before installation"),
                ));
            }
        } else {
            match open_path_entry(&destination_path) {
                Err(error) if error.kind() == io::ErrorKind::NotFound => {}
                Ok(_) => {
                    return Err(InstallSynchronizedFileError::retained(
                        InstallSynchronizedFileStage::OperandPreMoveValidation,
                        InstallSynchronizedFileOutcome::BeforeMove,
                        source,
                        destination_before,
                        None,
                        io::Error::other("destination appeared before installation"),
                    ));
                }
                Err(error) => {
                    return Err(InstallSynchronizedFileError::retained(
                        InstallSynchronizedFileStage::OperandPreMoveValidation,
                        InstallSynchronizedFileOutcome::BeforeMove,
                        source,
                        destination_before,
                        None,
                        error,
                    ));
                }
            }
        }
        if let Err(error) = self.validate_retained() {
            return Err(InstallSynchronizedFileError::retained(
                InstallSynchronizedFileStage::RetainedDirectoryPreMoveValidation,
                InstallSynchronizedFileOutcome::BeforeMove,
                source,
                destination_before,
                None,
                error,
            ));
        }
        if let Err(error) = self
            .validate_named_path(directory_path)
            .and_then(|()| self.validate_named_path(&canonical_directory))
        {
            return Err(InstallSynchronizedFileError::retained(
                InstallSynchronizedFileStage::NamedDirectoryPreMoveValidation,
                InstallSynchronizedFileOutcome::BeforeMove,
                source,
                destination_before,
                None,
                error,
            ));
        }
        if let Err(error) = os::move_file_replace_write_through(&source_path, &destination_path) {
            return Err(InstallSynchronizedFileError::retained(
                InstallSynchronizedFileStage::Move,
                InstallSynchronizedFileOutcome::MoveReturnedFailure,
                source,
                destination_before,
                None,
                error,
            ));
        }

        let moved = match install_file_state(&source) {
            Ok(state) => state,
            Err(error) => {
                return Err(InstallSynchronizedFileError::retained(
                    InstallSynchronizedFileStage::SourcePostMoveValidation,
                    InstallSynchronizedFileOutcome::MoveReturnedSuccessUnverified,
                    source,
                    destination_before,
                    None,
                    error,
                ));
            }
        };
        if moved != initial {
            return Err(InstallSynchronizedFileError::retained(
                InstallSynchronizedFileStage::SourcePostMoveValidation,
                InstallSynchronizedFileOutcome::MoveReturnedSuccessUnverified,
                source,
                destination_before,
                None,
                io::Error::other("source state changed across write-through installation"),
            ));
        }

        let destination = match AuthorityFile::open_reader(&destination_path) {
            Ok(authority) => authority,
            Err(error) => {
                return Err(InstallSynchronizedFileError::retained(
                    InstallSynchronizedFileStage::DestinationPostMoveOpen,
                    InstallSynchronizedFileOutcome::MoveReturnedSuccessUnverified,
                    source,
                    destination_before,
                    None,
                    error,
                ));
            }
        };
        let destination_state = match install_file_state(&destination) {
            Ok(state) => state,
            Err(error) => {
                return Err(InstallSynchronizedFileError::retained(
                    InstallSynchronizedFileStage::DestinationPostMoveValidation,
                    InstallSynchronizedFileOutcome::MoveReturnedSuccessUnverified,
                    source,
                    destination_before,
                    Some(destination),
                    error,
                ));
            }
        };
        if destination_state != initial {
            return Err(InstallSynchronizedFileError::retained(
                InstallSynchronizedFileStage::DestinationPostMoveValidation,
                InstallSynchronizedFileOutcome::MoveReturnedSuccessUnverified,
                source,
                destination_before,
                Some(destination),
                io::Error::other("destination does not identify the synchronized source file"),
            ));
        }

        match open_path_entry(&source_path) {
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Ok(_) => {
                return Err(InstallSynchronizedFileError::retained(
                    InstallSynchronizedFileStage::SourceAbsenceValidation,
                    InstallSynchronizedFileOutcome::MoveReturnedSuccessUnverified,
                    source,
                    destination_before,
                    Some(destination),
                    io::Error::other("source name still exists after installation"),
                ));
            }
            Err(error) => {
                return Err(InstallSynchronizedFileError::retained(
                    InstallSynchronizedFileStage::SourceAbsenceValidation,
                    InstallSynchronizedFileOutcome::MoveReturnedSuccessUnverified,
                    source,
                    destination_before,
                    Some(destination),
                    error,
                ));
            }
        }
        if let Err(error) = self.validate_retained() {
            return Err(InstallSynchronizedFileError::retained(
                InstallSynchronizedFileStage::RetainedDirectoryPostMoveValidation,
                InstallSynchronizedFileOutcome::MoveReturnedSuccessUnverified,
                source,
                destination_before,
                Some(destination),
                error,
            ));
        }
        if let Err(error) = self
            .validate_named_path(directory_path)
            .and_then(|()| self.validate_named_path(&canonical_directory))
        {
            return Err(InstallSynchronizedFileError::retained(
                InstallSynchronizedFileStage::NamedDirectoryPostMoveValidation,
                InstallSynchronizedFileOutcome::MoveReturnedSuccessUnverified,
                source,
                destination_before,
                Some(destination),
                error,
            ));
        }

        drop(source);
        drop(destination_before);
        Ok(destination)
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

/// A synchronized-install failure with every acquired exact authority retained.
#[derive(Debug)]
pub struct InstallSynchronizedFileError {
    stage: InstallSynchronizedFileStage,
    outcome: InstallSynchronizedFileOutcome,
    source_authority: Option<AuthorityFile>,
    pre_move_destination_authority: Option<AuthorityFile>,
    installed_destination_authority: Option<AuthorityFile>,
    source: io::Error,
}

impl InstallSynchronizedFileError {
    fn refused(stage: InstallSynchronizedFileStage, source: io::Error) -> Self {
        Self {
            stage,
            outcome: InstallSynchronizedFileOutcome::BeforeMove,
            source_authority: None,
            pre_move_destination_authority: None,
            installed_destination_authority: None,
            source,
        }
    }

    fn retained(
        stage: InstallSynchronizedFileStage,
        outcome: InstallSynchronizedFileOutcome,
        source_authority: AuthorityFile,
        pre_move_destination_authority: Option<AuthorityFile>,
        installed_destination_authority: Option<AuthorityFile>,
        source: io::Error,
    ) -> Self {
        Self {
            stage,
            outcome,
            source_authority: Some(source_authority),
            pre_move_destination_authority,
            installed_destination_authority,
            source,
        }
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

    /// Borrow the exact synchronized source authority when it was acquired.
    #[must_use]
    pub fn source_authority(&self) -> Option<&AuthorityFile> {
        self.source_authority.as_ref()
    }

    /// Borrow the exact destination observed before the move, when one existed.
    #[must_use]
    pub fn pre_move_destination_authority(&self) -> Option<&AuthorityFile> {
        self.pre_move_destination_authority.as_ref()
    }

    /// Borrow the exact installed destination observed after a reported move.
    #[must_use]
    pub fn installed_destination_authority(&self) -> Option<&AuthorityFile> {
        self.installed_destination_authority.as_ref()
    }

    /// Borrow the underlying validation or operating-system failure.
    #[must_use]
    pub fn error(&self) -> &io::Error {
        &self.source
    }

    /// Recover the complete typed outcome, retained authorities, and failure.
    #[must_use]
    pub fn into_parts(
        self,
    ) -> (
        InstallSynchronizedFileStage,
        InstallSynchronizedFileOutcome,
        Option<AuthorityFile>,
        Option<AuthorityFile>,
        Option<AuthorityFile>,
        io::Error,
    ) {
        (
            self.stage,
            self.outcome,
            self.source_authority,
            self.pre_move_destination_authority,
            self.installed_destination_authority,
            self.source,
        )
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

fn install_file_state(authority: &AuthorityFile) -> io::Result<os::RegularFileState> {
    let state = authority.validated_state()?;
    if state.link_count != 1 {
        return Err(io::Error::other(format!(
            "synchronized installation requires exactly one hard-link name, found {}",
            state.link_count
        )));
    }
    Ok(state)
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
            true,
        )?;
        Self::from_file(file)
    }

    fn open_install_destination(path: &Path) -> io::Result<Self> {
        let file = open(path, OpenDisposition::Existing, GENERIC_READ, false, true)?;
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
mod tests {
    use super::*;
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use std::os::windows::fs::{symlink_dir, symlink_file};

    fn create_directory(path: &Path) {
        std::fs::create_dir(path).unwrap();
    }

    fn assert_invalid_component(authority: &AuthorityDirectory, name: &OsStr) {
        assert_eq!(
            authority.open_child_directory(name).unwrap_err().kind(),
            io::ErrorKind::InvalidInput,
            "open unexpectedly accepted {name:?}"
        );
        assert_eq!(
            authority.create_child_directory(name).unwrap_err().kind(),
            io::ErrorKind::InvalidInput,
            "create unexpectedly accepted {name:?}"
        );
    }

    fn open_directory_for_generic_write(path: &Path) -> io::Result<File> {
        let mut options = OpenOptions::new();
        options
            .access_mode(
                GENERIC_WRITE | windows_sys::Win32::Storage::FileSystem::FILE_WRITE_ATTRIBUTES,
            )
            .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
            .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_BACKUP_SEMANTICS);
        options.open(path)
    }

    #[test]
    fn retained_file_reports_real_hard_link_count() {
        let directory = tempfile::tempdir().unwrap();
        let file_path = directory.path().join("authority-file");
        let alias_path = directory.path().join("authority-alias");
        std::fs::write(&file_path, b"authority").unwrap();
        let authority = AuthorityFile::open_reader(&file_path).unwrap();

        assert_eq!(authority.link_count().unwrap(), 1);
        std::fs::hard_link(&file_path, &alias_path).unwrap();
        assert_eq!(authority.link_count().unwrap(), 2);
        std::fs::remove_file(&alias_path).unwrap();
        assert_eq!(authority.link_count().unwrap(), 1);
        drop(authority);
        std::fs::remove_file(file_path).unwrap();
    }

    #[test]
    fn retained_directory_identity_is_stable_distinct_and_full_width() {
        let temp = tempfile::tempdir().unwrap();
        let first_path = temp.path().join("first");
        let second_path = temp.path().join("second");
        create_directory(&first_path);
        create_directory(&second_path);

        let first = AuthorityDirectory::open_existing(&first_path).unwrap();
        let first_identity = first.identity();
        let second = AuthorityDirectory::open_existing(&second_path).unwrap();
        let second_identity = second.identity();
        assert_ne!(first_identity, second_identity);
        assert_ne!(first_identity.volume_serial_number, 0);
        assert_ne!(first_identity.file_id, 0);
        drop(first);
        assert_eq!(
            AuthorityDirectory::open_existing(&first_path)
                .unwrap()
                .identity(),
            first_identity
        );
    }

    #[test]
    fn file_root_reparse_root_and_reparse_child_are_rejected() {
        let temp = tempfile::tempdir().unwrap();
        let file_path = temp.path().join("plain-file");
        std::fs::write(&file_path, b"not a directory").unwrap();
        assert!(AuthorityDirectory::open_existing(&file_path).is_err());

        let target = temp.path().join("target");
        let root_link = temp.path().join("root-link");
        create_directory(&target);
        symlink_dir(&target, &root_link).unwrap();
        assert!(AuthorityDirectory::open_existing(&root_link).is_err());

        let parent_path = temp.path().join("parent");
        let child_target = temp.path().join("child-target");
        create_directory(&parent_path);
        create_directory(&child_target);
        symlink_dir(&child_target, parent_path.join("linked-child")).unwrap();
        let parent = AuthorityDirectory::open_existing(&parent_path).unwrap();
        assert!(
            parent
                .open_child_directory(OsStr::new("linked-child"))
                .is_err()
        );
    }

    #[test]
    fn component_grammar_rejects_every_reserved_shape_and_accepts_unicode() {
        let temp = tempfile::tempdir().unwrap();
        let parent_path = temp.path().join("parent");
        create_directory(&parent_path);
        let parent = AuthorityDirectory::open_existing(&parent_path).unwrap();

        let mut invalid = vec![
            OsString::new(),
            OsString::from("."),
            OsString::from(".."),
            OsString::from("/"),
            OsString::from("\\"),
            OsString::from("a/b"),
            OsString::from("a\\b"),
            OsString::from("a:b"),
            OsString::from("C:\\absolute"),
            OsString::from("\\\\server\\share"),
            OsString::from("\\?\\C:\\absolute"),
            OsString::from("bad<name"),
            OsString::from("bad>name"),
            OsString::from("bad\"name"),
            OsString::from("bad|name"),
            OsString::from("bad?name"),
            OsString::from("bad*name"),
            OsString::from("trailing."),
            OsString::from("trailing "),
            OsString::from("CON"),
            OsString::from("prn.txt"),
            OsString::from("Aux"),
            OsString::from("NUL.bin"),
            OsString::from("COM1"),
            OsString::from("com9.log"),
            OsString::from("COM¹"),
            OsString::from("cOm².TxT"),
            OsString::from("LPT1"),
            OsString::from("lpt9.txt"),
            OsString::from("LPT³"),
            OsString::from("lPt¹.log"),
            OsString::from("x".repeat(MAX_DIRECTORY_COMPONENT_UTF16_UNITS + 1)),
            OsString::from_wide(&[0]),
            OsString::from_wide(&[1]),
            OsString::from_wide(&[0x1f]),
        ];
        for name in invalid.drain(..) {
            assert_invalid_component(&parent, &name);
        }

        for name in [
            OsStr::new("資料-🦀"),
            OsStr::new("COM0"),
            OsStr::new("COM⁴"),
            OsStr::new("LPT10"),
        ] {
            let created = parent.create_child_directory(name).unwrap();
            let identity = created.identity();
            drop(created);
            let reopened = parent.open_child_directory(name).unwrap();
            assert_eq!(reopened.identity(), identity);
            reopened.remove_empty().unwrap();
        }
    }

    #[test]
    fn exclusive_create_and_file_directory_collisions_are_honest() {
        let temp = tempfile::tempdir().unwrap();
        let parent_path = temp.path().join("parent");
        create_directory(&parent_path);
        create_directory(&parent_path.join("existing-directory"));
        std::fs::write(parent_path.join("existing-file"), b"file").unwrap();
        let parent = AuthorityDirectory::open_existing(&parent_path).unwrap();

        let created = parent
            .create_child_directory(OsStr::new("new-directory"))
            .unwrap();
        drop(created);
        assert_eq!(
            parent
                .create_child_directory(OsStr::new("new-directory"))
                .unwrap_err()
                .kind(),
            io::ErrorKind::AlreadyExists
        );
        assert_eq!(
            parent
                .create_child_directory(OsStr::new("existing-directory"))
                .unwrap_err()
                .kind(),
            io::ErrorKind::AlreadyExists
        );
        assert_eq!(
            parent
                .create_child_directory(OsStr::new("existing-file"))
                .unwrap_err()
                .kind(),
            io::ErrorKind::AlreadyExists
        );
        assert_eq!(
            parent
                .open_child_directory(OsStr::new("existing-file"))
                .unwrap_err()
                .raw_os_error(),
            Some(267)
        );
    }

    #[test]
    fn relative_children_disambiguate_parents_and_missing_is_not_found() {
        let temp = tempfile::tempdir().unwrap();
        let first_path = temp.path().join("first");
        let second_path = temp.path().join("second");
        create_directory(&first_path);
        create_directory(&second_path);
        let first = AuthorityDirectory::open_existing(&first_path).unwrap();
        let second = AuthorityDirectory::open_existing(&second_path).unwrap();

        let first_child = first
            .create_child_directory(OsStr::new("same-name"))
            .unwrap();
        let second_child = second
            .create_child_directory(OsStr::new("same-name"))
            .unwrap();
        assert_ne!(first_child.identity(), second_child.identity());
        assert_eq!(
            first
                .open_child_directory(OsStr::new("missing"))
                .unwrap_err()
                .kind(),
            io::ErrorKind::NotFound
        );
    }

    #[test]
    fn retained_directory_denies_rename_delete_and_ancestor_substitution_until_drop() {
        let temp = tempfile::tempdir().unwrap();
        let ancestor = temp.path().join("ancestor");
        let root = ancestor.join("root");
        let moved_ancestor = temp.path().join("moved-ancestor");
        let moved_root = ancestor.join("moved-root");
        create_directory(&ancestor);
        create_directory(&root);
        let authority = AuthorityDirectory::open_existing(&root).unwrap();

        assert!(open_directory_for_generic_write(&root).is_err());
        assert!(std::fs::rename(&root, &moved_root).is_err());
        assert!(std::fs::remove_dir(&root).is_err());
        assert!(std::fs::rename(&ancestor, &moved_ancestor).is_err());

        drop(authority);
        drop(open_directory_for_generic_write(&root).unwrap());
        std::fs::rename(&ancestor, &moved_ancestor).unwrap();
        std::fs::rename(&moved_ancestor, &ancestor).unwrap();
        std::fs::rename(&root, &moved_root).unwrap();
        std::fs::remove_dir(&moved_root).unwrap();
        std::fs::remove_dir(&ancestor).unwrap();
    }

    #[test]
    fn exact_empty_cleanup_consumes_only_the_retained_directory() {
        let temp = tempfile::tempdir().unwrap();
        let target = temp.path().join("target");
        let sentinel = temp.path().join("sentinel");
        create_directory(&target);
        create_directory(&sentinel);
        let sentinel_file = sentinel.join("keep");
        std::fs::write(&sentinel_file, b"untouched").unwrap();

        AuthorityDirectory::open_existing(&target)
            .unwrap()
            .remove_empty()
            .unwrap();
        assert!(!target.exists());
        assert_eq!(std::fs::read(sentinel_file).unwrap(), b"untouched");
    }

    #[test]
    fn nonempty_cleanup_returns_retained_authority_and_retries_after_real_removal() {
        let temp = tempfile::tempdir().unwrap();
        let target = temp.path().join("target");
        create_directory(&target);
        let child = target.join("child");
        std::fs::write(&child, b"real child").unwrap();
        let authority = AuthorityDirectory::open_existing(&target).unwrap();
        let identity = authority.identity();

        let failure = authority.remove_empty().unwrap_err();
        assert_eq!(failure.authority().identity(), identity);
        assert_eq!(failure.error().raw_os_error(), Some(145));
        assert!(std::error::Error::source(&failure).is_some());
        assert!(std::fs::rename(&target, temp.path().join("replacement")).is_err());

        std::fs::remove_file(child).unwrap();
        let (authority, source) = failure.into_parts();
        assert_eq!(source.raw_os_error(), Some(145));
        authority.remove_empty().unwrap();
        assert!(!target.exists());
    }

    #[test]
    fn synchronized_install_moves_exact_existing_source_to_absent_destination() {
        let temp = tempfile::tempdir().unwrap();
        let source_path = temp.path().join("journal.init");
        let destination_path = temp.path().join("active-receipts.v1");
        let bytes = b"complete fixed journal image";
        std::fs::write(&source_path, bytes).unwrap();
        let source = AuthorityFile::open_reader(&source_path).unwrap();
        let source_state = install_file_state(&source).unwrap();
        drop(source);
        let directory = AuthorityDirectory::open_existing(temp.path()).unwrap();

        let installed = directory
            .install_synchronized_file(
                temp.path(),
                OsStr::new("journal.init"),
                OsStr::new("active-receipts.v1"),
            )
            .unwrap();

        assert_eq!(install_file_state(&installed).unwrap(), source_state);
        assert_eq!(installed.identity(), source_state.identity);
        assert_eq!(installed.link_count().unwrap(), 1);
        assert_eq!(source_state.size, bytes.len() as u64);
        assert!(!source_path.try_exists().unwrap());
        assert_eq!(std::fs::read(destination_path).unwrap(), bytes);
    }

    #[test]
    fn synchronized_install_replaces_one_safe_existing_destination() {
        let temp = tempfile::tempdir().unwrap();
        let source_path = temp.path().join("journal.init");
        let destination_path = temp.path().join("active-receipts.v1");
        std::fs::write(&source_path, b"new complete journal").unwrap();
        std::fs::write(&destination_path, b"old complete journal").unwrap();
        let source = AuthorityFile::open_reader(&source_path).unwrap();
        let source_state = install_file_state(&source).unwrap();
        drop(source);
        let old_destination = AuthorityFile::open_reader(&destination_path).unwrap();
        let old_identity = old_destination.identity();
        drop(old_destination);
        let directory = AuthorityDirectory::open_existing(temp.path()).unwrap();

        let installed = directory
            .install_synchronized_file(
                temp.path(),
                OsStr::new("journal.init"),
                OsStr::new("active-receipts.v1"),
            )
            .unwrap();

        assert_eq!(install_file_state(&installed).unwrap(), source_state);
        assert_ne!(installed.identity(), old_identity);
        assert!(!source_path.try_exists().unwrap());
        assert_eq!(
            std::fs::read(destination_path).unwrap(),
            b"new complete journal"
        );
    }

    #[test]
    fn missing_install_source_is_never_created() {
        let temp = tempfile::tempdir().unwrap();
        let source_path = temp.path().join("missing.init");
        let destination_path = temp.path().join("active-receipts.v1");
        let directory = AuthorityDirectory::open_existing(temp.path()).unwrap();

        let error = directory
            .install_synchronized_file(
                temp.path(),
                OsStr::new("missing.init"),
                OsStr::new("active-receipts.v1"),
            )
            .unwrap_err();

        assert_eq!(error.stage(), InstallSynchronizedFileStage::SourceOpen);
        assert_eq!(error.outcome(), InstallSynchronizedFileOutcome::BeforeMove);
        assert_eq!(error.error().kind(), io::ErrorKind::NotFound);
        assert!(error.source_authority().is_none());
        assert!(!source_path.try_exists().unwrap());
        assert!(!destination_path.try_exists().unwrap());
    }

    #[test]
    fn install_rejects_relative_wrong_cross_directory_and_equal_inputs() {
        let first = tempfile::tempdir().unwrap();
        let second = tempfile::tempdir().unwrap();
        std::fs::write(first.path().join("source"), b"source").unwrap();
        let directory = AuthorityDirectory::open_existing(first.path()).unwrap();

        for (path, source, destination, expected_stage) in [
            (
                Path::new("."),
                OsStr::new("source"),
                OsStr::new("destination"),
                InstallSynchronizedFileStage::InputValidation,
            ),
            (
                second.path(),
                OsStr::new("source"),
                OsStr::new("destination"),
                InstallSynchronizedFileStage::NamedDirectoryValidation,
            ),
            (
                first.path(),
                OsStr::new("source\\nested"),
                OsStr::new("destination"),
                InstallSynchronizedFileStage::InputValidation,
            ),
            (
                first.path(),
                OsStr::new("source"),
                OsStr::new("source"),
                InstallSynchronizedFileStage::InputValidation,
            ),
        ] {
            let error = directory
                .install_synchronized_file(path, source, destination)
                .unwrap_err();
            assert_eq!(error.stage(), expected_stage);
            assert_eq!(error.outcome(), InstallSynchronizedFileOutcome::BeforeMove);
        }
        assert_eq!(
            std::fs::read(first.path().join("source")).unwrap(),
            b"source"
        );
    }

    #[test]
    fn install_rejects_directory_and_reparse_operands() {
        let temp = tempfile::tempdir().unwrap();
        let source_directory = temp.path().join("source-directory");
        let destination_directory = temp.path().join("destination-directory");
        let reparse_target = temp.path().join("reparse-target");
        let source_reparse = temp.path().join("source-reparse");
        let destination_reparse = temp.path().join("destination-reparse");
        create_directory(&source_directory);
        create_directory(&destination_directory);
        std::fs::write(&reparse_target, b"target").unwrap();
        symlink_file(&reparse_target, &source_reparse).unwrap();
        symlink_file(&reparse_target, &destination_reparse).unwrap();
        std::fs::write(temp.path().join("source-for-directory"), b"source").unwrap();
        std::fs::write(temp.path().join("source-for-reparse"), b"source").unwrap();
        let directory = AuthorityDirectory::open_existing(temp.path()).unwrap();

        let source_directory_error = directory
            .install_synchronized_file(
                temp.path(),
                OsStr::new("source-directory"),
                OsStr::new("unused-destination"),
            )
            .unwrap_err();
        assert_eq!(
            source_directory_error.stage(),
            InstallSynchronizedFileStage::SourceOpen
        );
        let destination_directory_error = directory
            .install_synchronized_file(
                temp.path(),
                OsStr::new("source-for-directory"),
                OsStr::new("destination-directory"),
            )
            .unwrap_err();
        assert_eq!(
            destination_directory_error.stage(),
            InstallSynchronizedFileStage::DestinationInspection
        );
        let source_reparse_error = directory
            .install_synchronized_file(
                temp.path(),
                OsStr::new("source-reparse"),
                OsStr::new("unused-reparse-destination"),
            )
            .unwrap_err();
        assert_eq!(
            source_reparse_error.stage(),
            InstallSynchronizedFileStage::SourceOpen
        );
        let destination_reparse_error = directory
            .install_synchronized_file(
                temp.path(),
                OsStr::new("source-for-reparse"),
                OsStr::new("destination-reparse"),
            )
            .unwrap_err();
        assert_eq!(
            destination_reparse_error.stage(),
            InstallSynchronizedFileStage::DestinationInspection
        );
    }

    #[test]
    fn install_rejects_preexisting_source_and_destination_hard_links() {
        let temp = tempfile::tempdir().unwrap();
        let source_path = temp.path().join("source");
        let source_alias = temp.path().join("source-alias");
        std::fs::write(&source_path, b"source").unwrap();
        std::fs::hard_link(&source_path, &source_alias).unwrap();
        let destination_source = temp.path().join("destination-source");
        let destination_path = temp.path().join("destination");
        let destination_alias = temp.path().join("destination-alias");
        std::fs::write(&destination_source, b"replacement").unwrap();
        std::fs::write(&destination_path, b"destination").unwrap();
        std::fs::hard_link(&destination_path, &destination_alias).unwrap();
        let directory = AuthorityDirectory::open_existing(temp.path()).unwrap();

        let source_error = directory
            .install_synchronized_file(temp.path(), OsStr::new("source"), OsStr::new("unused"))
            .unwrap_err();
        assert_eq!(
            source_error.stage(),
            InstallSynchronizedFileStage::SourceInitialValidation
        );
        assert_eq!(
            source_error
                .source_authority()
                .unwrap()
                .link_count()
                .unwrap(),
            2
        );
        drop(source_error);

        let destination_error = directory
            .install_synchronized_file(
                temp.path(),
                OsStr::new("destination-source"),
                OsStr::new("destination"),
            )
            .unwrap_err();
        assert_eq!(
            destination_error.stage(),
            InstallSynchronizedFileStage::DestinationInspection
        );
        assert_eq!(
            destination_error
                .pre_move_destination_authority()
                .unwrap()
                .link_count()
                .unwrap(),
            2
        );
        assert_eq!(std::fs::read(destination_path).unwrap(), b"destination");
    }

    #[test]
    fn install_rejects_case_alias_of_the_source_name() {
        let temp = tempfile::tempdir().unwrap();
        std::fs::write(temp.path().join("journal.init"), b"source").unwrap();
        let directory = AuthorityDirectory::open_existing(temp.path()).unwrap();

        let error = directory
            .install_synchronized_file(
                temp.path(),
                OsStr::new("journal.init"),
                OsStr::new("JOURNAL.INIT"),
            )
            .unwrap_err();

        assert_eq!(
            error.stage(),
            InstallSynchronizedFileStage::DestinationInspection
        );
        assert_eq!(error.outcome(), InstallSynchronizedFileOutcome::BeforeMove);
        assert!(error.source_authority().is_some());
        assert_eq!(
            std::fs::read(temp.path().join("journal.init")).unwrap(),
            b"source"
        );
    }

    #[test]
    fn move_failure_retains_exact_source_and_pre_move_destination_authorities() {
        let temp = tempfile::tempdir().unwrap();
        let source_path = temp.path().join("source");
        let destination_path = temp.path().join("destination");
        std::fs::write(&source_path, b"source bytes").unwrap();
        std::fs::write(&destination_path, b"destination bytes").unwrap();
        let source = AuthorityFile::open_reader(&source_path).unwrap();
        let source_identity = source.identity();
        drop(source);
        let mut blocker_options = OpenOptions::new();
        blocker_options
            .read(true)
            .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
            .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT);
        let blocker = blocker_options.open(&destination_path).unwrap();
        let directory = AuthorityDirectory::open_existing(temp.path()).unwrap();

        let failure = directory
            .install_synchronized_file(temp.path(), OsStr::new("source"), OsStr::new("destination"))
            .unwrap_err();

        assert_eq!(failure.stage(), InstallSynchronizedFileStage::Move);
        assert_eq!(
            failure.outcome(),
            InstallSynchronizedFileOutcome::MoveReturnedFailure
        );
        assert_eq!(failure.error().raw_os_error(), Some(32));
        assert_eq!(
            failure.source_authority().unwrap().identity(),
            source_identity
        );
        assert!(failure.pre_move_destination_authority().is_some());
        assert!(failure.installed_destination_authority().is_none());
        let (stage, outcome, source, pre_move_destination, installed, error) = failure.into_parts();
        assert_eq!(stage, InstallSynchronizedFileStage::Move);
        assert_eq!(outcome, InstallSynchronizedFileOutcome::MoveReturnedFailure);
        assert_eq!(source.unwrap().identity(), source_identity);
        assert!(pre_move_destination.is_some());
        assert!(installed.is_none());
        assert_eq!(error.raw_os_error(), Some(32));
        drop(pre_move_destination);
        drop(blocker);
        assert_eq!(std::fs::read(source_path).unwrap(), b"source bytes");
        assert_eq!(
            std::fs::read(destination_path).unwrap(),
            b"destination bytes"
        );
    }

    #[test]
    fn canonical_long_parent_path_uses_the_same_exact_directory() {
        let temp = tempfile::tempdir().unwrap();
        let mut parent = temp.path().join("long-parent");
        for index in 0..14 {
            parent.push(format!("bounded-segment-{index:02}"));
        }
        std::fs::create_dir_all(&parent).unwrap();
        assert!(parent.as_os_str().encode_wide().count() > 260);
        std::fs::write(parent.join("source"), b"long path source").unwrap();
        let directory = AuthorityDirectory::open_existing(&parent).unwrap();
        let dotted_parent = parent.join(".");

        let installed = directory
            .install_synchronized_file(
                &dotted_parent,
                OsStr::new("source"),
                OsStr::new("destination"),
            )
            .unwrap();

        assert_eq!(installed.link_count().unwrap(), 1);
        assert!(!parent.join("source").try_exists().unwrap());
        assert_eq!(
            std::fs::read(parent.join("destination")).unwrap(),
            b"long path source"
        );
    }

    #[test]
    fn delete_pending_file_fails_full_retained_state_validation() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("delete-pending");
        let authority = AuthorityFile::create_prepared(&path).unwrap();
        authority.mark_delete_on_close().unwrap();

        assert!(authority.validated_state().is_err());
        drop(authority);
        assert!(!path.try_exists().unwrap());
    }

    #[test]
    fn unmapped_native_status_preserves_the_hex_status() {
        let error = os::ntstatus_to_io_error(0xDEAD_BEEF_u32 as i32);
        assert!(error.raw_os_error().is_none());
        assert!(error.to_string().contains("0xDEADBEEF"));
    }
}
