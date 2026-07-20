use std::ffi::OsStr;
use std::io;
use std::path::Path;

use super::{
    AuthorityDirectory, AuthorityFile, InstallDirectoryAuthority, InstallFileSnapshot,
    InstallSynchronizedFileError, InstallSynchronizedFileOutcome, InstallSynchronizedFileStage,
    RetainedInstalledDestination, open_path_entry, os, validate_child_component,
};

impl AuthorityDirectory {
    /// Install one fully synchronized existing file at another direct child
    /// name of this exact retained directory.
    ///
    /// This is the sole safe wrapper around the D9 write-through move. It
    /// supplies no receipt policy or mutation authorization. `directory_path`
    /// is required only because `MoveFileExW` is path-based and must resolve to
    /// this retained directory before and after the operation. Source and
    /// destination are bounded single components, so a cross-directory move
    /// cannot be expressed. The exclusive parent authority is consumed so a
    /// move-compatible exact transition can overlap the native call; success
    /// returns the recovered exclusive parent with the strict installed file.
    ///
    /// The wrapper detects observed path substitution through exact pre/post
    /// identity checks, but it cannot exclude a hostile same-user namespace
    /// race or a same-size write through a hostile same-user handle acquired
    /// during the move-compatible transition window. Product code
    /// must close and exactly reread the installed bytes under its retained
    /// authorities. `MOVEFILE_WRITE_THROUGH` also remains subject to real local
    /// NTFS power-loss certification; process termination is not that proof.
    pub fn install_synchronized_file(
        self,
        directory_path: &Path,
        source_name: &OsStr,
        destination_name: &OsStr,
    ) -> Result<(AuthorityDirectory, AuthorityFile), Box<InstallSynchronizedFileError>> {
        if !directory_path.is_absolute() {
            return Err(InstallSynchronizedFileError::refused(
                InstallDirectoryAuthority::from_exclusive(self),
                InstallSynchronizedFileStage::InputValidation,
                io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "synchronized installation requires an absolute directory path",
                ),
            ));
        }
        let source_component = match validate_child_component(source_name) {
            Ok(component) => component,
            Err(error) => {
                return Err(InstallSynchronizedFileError::refused(
                    InstallDirectoryAuthority::from_exclusive(self),
                    InstallSynchronizedFileStage::InputValidation,
                    error,
                ));
            }
        };
        let destination_component = match validate_child_component(destination_name) {
            Ok(component) => component,
            Err(error) => {
                return Err(InstallSynchronizedFileError::refused(
                    InstallDirectoryAuthority::from_exclusive(self),
                    InstallSynchronizedFileStage::InputValidation,
                    error,
                ));
            }
        };
        if source_component == destination_component {
            return Err(InstallSynchronizedFileError::refused(
                InstallDirectoryAuthority::from_exclusive(self),
                InstallSynchronizedFileStage::InputValidation,
                io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "source and destination names must be distinct",
                ),
            ));
        }
        if let Err(error) = self.validate_retained() {
            return Err(InstallSynchronizedFileError::refused(
                InstallDirectoryAuthority::from_exclusive(self),
                InstallSynchronizedFileStage::RetainedDirectoryValidation,
                error,
            ));
        }
        if let Err(error) = self.validate_named_path(directory_path) {
            return Err(InstallSynchronizedFileError::refused(
                InstallDirectoryAuthority::from_exclusive(self),
                InstallSynchronizedFileStage::NamedDirectoryValidation,
                error,
            ));
        }

        let canonical_directory = match std::fs::canonicalize(directory_path) {
            Ok(path) => path,
            Err(error) => {
                return Err(InstallSynchronizedFileError::refused(
                    InstallDirectoryAuthority::from_exclusive(self),
                    InstallSynchronizedFileStage::DirectoryPathCanonicalization,
                    error,
                ));
            }
        };
        if let Err(error) = self.validate_named_path(&canonical_directory) {
            return Err(InstallSynchronizedFileError::refused(
                InstallDirectoryAuthority::from_exclusive(self),
                InstallSynchronizedFileStage::DirectoryPathCanonicalization,
                error,
            ));
        }
        let source_path = canonical_directory.join(source_name);
        let destination_path = canonical_directory.join(destination_name);
        if source_path.parent() != Some(canonical_directory.as_path())
            || destination_path.parent() != Some(canonical_directory.as_path())
        {
            return Err(InstallSynchronizedFileError::refused(
                InstallDirectoryAuthority::from_exclusive(self),
                InstallSynchronizedFileStage::InputValidation,
                io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "installation operands must remain direct children of the retained directory",
                ),
            ));
        }
        if let Err(error) = os::validate_move_path(&source_path) {
            return Err(InstallSynchronizedFileError::refused(
                InstallDirectoryAuthority::from_exclusive(self),
                InstallSynchronizedFileStage::InputValidation,
                error,
            ));
        }
        if let Err(error) = os::validate_move_path(&destination_path) {
            return Err(InstallSynchronizedFileError::refused(
                InstallDirectoryAuthority::from_exclusive(self),
                InstallSynchronizedFileStage::InputValidation,
                error,
            ));
        }

        let synchronizer = match AuthorityFile::open_install_source(&source_path) {
            Ok(authority) => authority,
            Err(error) => {
                return Err(InstallSynchronizedFileError::refused(
                    InstallDirectoryAuthority::from_exclusive(self),
                    InstallSynchronizedFileStage::SourceOpen,
                    error,
                ));
            }
        };
        let initial = match install_file_state(&synchronizer) {
            Ok(state) => state,
            Err(error) => {
                return Err(InstallSynchronizedFileError::retained(
                    InstallDirectoryAuthority::from_exclusive(self),
                    InstallSynchronizedFileStage::SourceInitialValidation,
                    InstallSynchronizedFileOutcome::BeforeMove,
                    synchronizer,
                    None,
                    None,
                    error,
                ));
            }
        };
        if let Err(error) = synchronizer.file.sync_all() {
            return Err(InstallSynchronizedFileError::retained(
                InstallDirectoryAuthority::from_exclusive(self),
                InstallSynchronizedFileStage::SourceSynchronization,
                InstallSynchronizedFileOutcome::BeforeMove,
                synchronizer,
                None,
                None,
                error,
            ));
        }
        let synchronized = match install_file_state(&synchronizer) {
            Ok(state) => state,
            Err(error) => {
                return Err(InstallSynchronizedFileError::retained(
                    InstallDirectoryAuthority::from_exclusive(self),
                    InstallSynchronizedFileStage::SourcePostSynchronizeValidation,
                    InstallSynchronizedFileOutcome::BeforeMove,
                    synchronizer,
                    None,
                    None,
                    error,
                ));
            }
        };
        if synchronized != initial {
            return Err(InstallSynchronizedFileError::retained(
                InstallDirectoryAuthority::from_exclusive(self),
                InstallSynchronizedFileStage::SourcePostSynchronizeValidation,
                InstallSynchronizedFileOutcome::BeforeMove,
                synchronizer,
                None,
                None,
                io::Error::other("source state changed while it was synchronized"),
            ));
        }

        let source = match AuthorityFile::open_reader(&source_path) {
            Ok(authority) => authority,
            Err(error) => {
                return Err(InstallSynchronizedFileError::retained(
                    InstallDirectoryAuthority::from_exclusive(self),
                    InstallSynchronizedFileStage::SourceNameValidation,
                    InstallSynchronizedFileOutcome::BeforeMove,
                    synchronizer,
                    None,
                    None,
                    error,
                ));
            }
        };
        let transition_source_state = match install_file_state(&source) {
            Ok(state) => state,
            Err(error) => {
                return Err(InstallSynchronizedFileError::retained(
                    InstallDirectoryAuthority::from_exclusive(self),
                    InstallSynchronizedFileStage::SourceNameValidation,
                    InstallSynchronizedFileOutcome::BeforeMove,
                    synchronizer,
                    None,
                    None,
                    error,
                ));
            }
        };
        if transition_source_state != initial {
            return Err(InstallSynchronizedFileError::retained(
                InstallDirectoryAuthority::from_exclusive(self),
                InstallSynchronizedFileStage::SourceNameValidation,
                InstallSynchronizedFileOutcome::BeforeMove,
                synchronizer,
                None,
                None,
                io::Error::other("source name no longer identifies the synchronized file"),
            ));
        }
        drop(synchronizer);

        let (destination_before, destination_before_state) =
            match AuthorityFile::open_install_destination(&destination_path) {
                Ok(inspector) => {
                    let state = match install_file_state(&inspector) {
                        Ok(state) => state,
                        Err(error) => {
                            return Err(InstallSynchronizedFileError::retained(
                                InstallDirectoryAuthority::from_exclusive(self),
                                InstallSynchronizedFileStage::DestinationInspection,
                                InstallSynchronizedFileOutcome::BeforeMove,
                                source,
                                Some(inspector),
                                None,
                                error,
                            ));
                        }
                    };
                    if state.identity == initial.identity {
                        return Err(InstallSynchronizedFileError::retained(
                            InstallDirectoryAuthority::from_exclusive(self),
                            InstallSynchronizedFileStage::DestinationInspection,
                            InstallSynchronizedFileOutcome::BeforeMove,
                            source,
                            Some(inspector),
                            None,
                            io::Error::new(
                                io::ErrorKind::InvalidInput,
                                "source and destination identify the same file",
                            ),
                        ));
                    }
                    (Some(inspector), Some(state))
                }
                Err(error) if error.kind() == io::ErrorKind::NotFound => (None, None),
                Err(error) => {
                    return Err(InstallSynchronizedFileError::retained(
                        InstallDirectoryAuthority::from_exclusive(self),
                        InstallSynchronizedFileStage::DestinationInspection,
                        InstallSynchronizedFileOutcome::BeforeMove,
                        source,
                        None,
                        None,
                        error,
                    ));
                }
            };
        let destination_snapshot = destination_before_state.map(InstallFileSnapshot::from);

        let source_pre_move = match install_file_state(&source) {
            Ok(state) => state,
            Err(error) => {
                return Err(InstallSynchronizedFileError::retained(
                    InstallDirectoryAuthority::from_exclusive(self),
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
                InstallDirectoryAuthority::from_exclusive(self),
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
                        InstallDirectoryAuthority::from_exclusive(self),
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
                    InstallDirectoryAuthority::from_exclusive(self),
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
                    InstallDirectoryAuthority::from_exclusive(self),
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
                    InstallDirectoryAuthority::from_exclusive(self),
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
                InstallDirectoryAuthority::from_exclusive(self),
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
                        InstallDirectoryAuthority::from_exclusive(self),
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
                        InstallDirectoryAuthority::from_exclusive(self),
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
                    InstallDirectoryAuthority::from_exclusive(self),
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
                        InstallDirectoryAuthority::from_exclusive(self),
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
                        InstallDirectoryAuthority::from_exclusive(self),
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
                InstallDirectoryAuthority::from_exclusive(self),
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
                InstallDirectoryAuthority::from_exclusive(self),
                InstallSynchronizedFileStage::NamedDirectoryPreMoveValidation,
                InstallSynchronizedFileOutcome::BeforeMove,
                source,
                destination_before,
                None,
                error,
            ));
        }
        let directory_transition =
            match InstallDirectoryAuthority::open_transition(&canonical_directory, self.identity) {
                Ok(authority) => authority,
                Err(error) => {
                    return Err(InstallSynchronizedFileError::retained(
                        InstallDirectoryAuthority::from_exclusive(self),
                        InstallSynchronizedFileStage::NamedDirectoryPreMoveValidation,
                        InstallSynchronizedFileOutcome::BeforeMove,
                        source,
                        destination_before,
                        None,
                        error,
                    ));
                }
            };
        drop(self);
        if let Err(error) = directory_transition.validate_retained() {
            return Err(InstallSynchronizedFileError::retained(
                directory_transition,
                InstallSynchronizedFileStage::RetainedDirectoryPreMoveValidation,
                InstallSynchronizedFileOutcome::BeforeMove,
                source,
                destination_before,
                None,
                error,
            ));
        }
        if let Err(error) = directory_transition
            .validate_named_path(directory_path)
            .and_then(|()| directory_transition.validate_named_path(&canonical_directory))
        {
            return Err(InstallSynchronizedFileError::retained(
                directory_transition,
                InstallSynchronizedFileStage::NamedDirectoryPreMoveValidation,
                InstallSynchronizedFileOutcome::BeforeMove,
                source,
                destination_before,
                None,
                error,
            ));
        }
        if let Err(error) = validate_install_operands_and_names(
            &source,
            initial,
            destination_before.as_ref(),
            destination_before_state,
            &source_path,
            &destination_path,
        ) {
            return Err(InstallSynchronizedFileError::retained(
                directory_transition,
                InstallSynchronizedFileStage::OperandPreMoveValidation,
                InstallSynchronizedFileOutcome::BeforeMove,
                source,
                destination_before,
                None,
                error,
            ));
        }
        drop(destination_before);

        let move_result = os::move_file_replace_write_through(&source_path, &destination_path);
        let move_outcome = if move_result.is_ok() {
            InstallSynchronizedFileOutcome::MoveReturnedSuccessUnverified
        } else {
            InstallSynchronizedFileOutcome::MoveReturnedFailure
        };
        let directory = match directory_transition.recover(&canonical_directory) {
            Ok(authority) => authority,
            Err(recovery) => {
                let (directory_authority, recovery_error) = recovery.into_parts();
                return Err(InstallSynchronizedFileError::recovery(
                    directory_authority,
                    move_outcome,
                    source,
                    destination_snapshot,
                    move_result.err(),
                    recovery_error,
                ));
            }
        };
        if let Err(error) = move_result {
            let (reacquired_destination, destination_reacquisition_error) =
                reacquire_pre_move_destination(&destination_path, destination_snapshot);
            return Err(InstallSynchronizedFileError::move_failure(
                InstallDirectoryAuthority::from_exclusive(directory),
                source,
                destination_snapshot,
                reacquired_destination,
                destination_reacquisition_error,
                error,
            ));
        }

        let moved = match install_file_state(&source) {
            Ok(state) => state,
            Err(error) => {
                return Err(InstallSynchronizedFileError::retained_with_snapshot(
                    InstallDirectoryAuthority::from_exclusive(directory),
                    InstallSynchronizedFileStage::SourcePostMoveValidation,
                    InstallSynchronizedFileOutcome::MoveReturnedSuccessUnverified,
                    source,
                    RetainedInstalledDestination::none(destination_snapshot),
                    error,
                ));
            }
        };
        if moved != initial {
            return Err(InstallSynchronizedFileError::retained_with_snapshot(
                InstallDirectoryAuthority::from_exclusive(directory),
                InstallSynchronizedFileStage::SourcePostMoveValidation,
                InstallSynchronizedFileOutcome::MoveReturnedSuccessUnverified,
                source,
                RetainedInstalledDestination::none(destination_snapshot),
                io::Error::other("source state changed across write-through installation"),
            ));
        }

        let destination = match AuthorityFile::open_reader(&destination_path) {
            Ok(authority) => authority,
            Err(error) => {
                return Err(InstallSynchronizedFileError::retained_with_snapshot(
                    InstallDirectoryAuthority::from_exclusive(directory),
                    InstallSynchronizedFileStage::DestinationPostMoveOpen,
                    InstallSynchronizedFileOutcome::MoveReturnedSuccessUnverified,
                    source,
                    RetainedInstalledDestination::none(destination_snapshot),
                    error,
                ));
            }
        };
        let destination_state = match install_file_state(&destination) {
            Ok(state) => state,
            Err(error) => {
                return Err(InstallSynchronizedFileError::retained_with_snapshot(
                    InstallDirectoryAuthority::from_exclusive(directory),
                    InstallSynchronizedFileStage::DestinationPostMoveValidation,
                    InstallSynchronizedFileOutcome::MoveReturnedSuccessUnverified,
                    source,
                    RetainedInstalledDestination::exact(destination_snapshot, destination),
                    error,
                ));
            }
        };
        if destination_state != initial {
            return Err(InstallSynchronizedFileError::retained_with_snapshot(
                InstallDirectoryAuthority::from_exclusive(directory),
                InstallSynchronizedFileStage::DestinationPostMoveValidation,
                InstallSynchronizedFileOutcome::MoveReturnedSuccessUnverified,
                source,
                RetainedInstalledDestination::exact(destination_snapshot, destination),
                io::Error::other("destination does not identify the synchronized source file"),
            ));
        }
        let installed = match AuthorityFile::open_install_destination(&destination_path) {
            Ok(authority) => authority,
            Err(error) => {
                return Err(InstallSynchronizedFileError::retained_with_snapshot(
                    InstallDirectoryAuthority::from_exclusive(directory),
                    InstallSynchronizedFileStage::DestinationPostMoveOpen,
                    InstallSynchronizedFileOutcome::MoveReturnedSuccessUnverified,
                    source,
                    RetainedInstalledDestination::exact(destination_snapshot, destination),
                    error,
                ));
            }
        };
        let installed_state = match install_file_state(&installed) {
            Ok(state) => state,
            Err(error) => {
                return Err(InstallSynchronizedFileError::retained_with_snapshot(
                    InstallDirectoryAuthority::from_exclusive(directory),
                    InstallSynchronizedFileStage::DestinationPostMoveValidation,
                    InstallSynchronizedFileOutcome::MoveReturnedSuccessUnverified,
                    source,
                    RetainedInstalledDestination::exact(destination_snapshot, installed),
                    error,
                ));
            }
        };
        if installed_state != initial {
            return Err(InstallSynchronizedFileError::retained_with_snapshot(
                InstallDirectoryAuthority::from_exclusive(directory),
                InstallSynchronizedFileStage::DestinationPostMoveValidation,
                InstallSynchronizedFileOutcome::MoveReturnedSuccessUnverified,
                source,
                RetainedInstalledDestination::exact(destination_snapshot, installed),
                io::Error::other(
                    "strict installed authority does not match the synchronized source",
                ),
            ));
        }
        drop(destination);
        let destination = installed;

        match open_path_entry(&source_path) {
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Ok(_) => {
                return Err(InstallSynchronizedFileError::retained_with_snapshot(
                    InstallDirectoryAuthority::from_exclusive(directory),
                    InstallSynchronizedFileStage::SourceAbsenceValidation,
                    InstallSynchronizedFileOutcome::MoveReturnedSuccessUnverified,
                    source,
                    RetainedInstalledDestination::exact(destination_snapshot, destination),
                    io::Error::other("source name still exists after installation"),
                ));
            }
            Err(error) => {
                return Err(InstallSynchronizedFileError::retained_with_snapshot(
                    InstallDirectoryAuthority::from_exclusive(directory),
                    InstallSynchronizedFileStage::SourceAbsenceValidation,
                    InstallSynchronizedFileOutcome::MoveReturnedSuccessUnverified,
                    source,
                    RetainedInstalledDestination::exact(destination_snapshot, destination),
                    error,
                ));
            }
        }
        if let Err(error) = directory.validate_retained() {
            return Err(InstallSynchronizedFileError::retained_with_snapshot(
                InstallDirectoryAuthority::from_exclusive(directory),
                InstallSynchronizedFileStage::RetainedDirectoryPostMoveValidation,
                InstallSynchronizedFileOutcome::MoveReturnedSuccessUnverified,
                source,
                RetainedInstalledDestination::exact(destination_snapshot, destination),
                error,
            ));
        }
        if let Err(error) = directory
            .validate_named_path(directory_path)
            .and_then(|()| directory.validate_named_path(&canonical_directory))
        {
            return Err(InstallSynchronizedFileError::retained_with_snapshot(
                InstallDirectoryAuthority::from_exclusive(directory),
                InstallSynchronizedFileStage::NamedDirectoryPostMoveValidation,
                InstallSynchronizedFileOutcome::MoveReturnedSuccessUnverified,
                source,
                RetainedInstalledDestination::exact(destination_snapshot, destination),
                error,
            ));
        }

        drop(source);
        Ok((directory, destination))
    }
}

pub(super) fn install_file_state(authority: &AuthorityFile) -> io::Result<os::RegularFileState> {
    let state = authority.validated_state()?;
    if state.link_count != 1 {
        return Err(io::Error::other(format!(
            "synchronized installation requires exactly one hard-link name, found {}",
            state.link_count
        )));
    }
    Ok(state)
}

fn validate_install_operands_and_names(
    source: &AuthorityFile,
    expected_source: os::RegularFileState,
    destination: Option<&AuthorityFile>,
    expected_destination: Option<os::RegularFileState>,
    source_path: &Path,
    destination_path: &Path,
) -> io::Result<()> {
    if install_file_state(source)? != expected_source {
        return Err(io::Error::other(
            "source state changed before write-through installation",
        ));
    }
    let named_source = AuthorityFile::open_reader(source_path)?;
    if install_file_state(&named_source)? != expected_source {
        return Err(io::Error::other(
            "source name changed before write-through installation",
        ));
    }

    match (destination, expected_destination) {
        (Some(destination), Some(expected)) => {
            if install_file_state(destination)? != expected {
                return Err(io::Error::other(
                    "destination state changed before write-through installation",
                ));
            }
            let named_destination = AuthorityFile::open_reader(destination_path)?;
            if install_file_state(&named_destination)? != expected {
                return Err(io::Error::other(
                    "destination name changed before write-through installation",
                ));
            }
        }
        (None, None) => match open_path_entry(destination_path) {
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Ok(_) => {
                return Err(io::Error::other(
                    "destination appeared before write-through installation",
                ));
            }
            Err(error) => return Err(error),
        },
        _ => {
            return Err(io::Error::other(
                "destination authority and expected state disagree",
            ));
        }
    }
    Ok(())
}

fn reacquire_pre_move_destination(
    destination_path: &Path,
    snapshot: Option<InstallFileSnapshot>,
) -> (Option<AuthorityFile>, Option<io::Error>) {
    match snapshot {
        Some(expected) => {
            let authority = match AuthorityFile::open_install_destination(destination_path) {
                Ok(authority) => authority,
                Err(error) => return (None, Some(error)),
            };
            match install_file_state(&authority) {
                Ok(state) if InstallFileSnapshot::from(state) == expected => {
                    (Some(authority), None)
                }
                Ok(_) => (
                    None,
                    Some(io::Error::other(
                        "destination reacquisition did not match the pre-move snapshot",
                    )),
                ),
                Err(error) => (None, Some(error)),
            }
        }
        None => match open_path_entry(destination_path) {
            Err(error) if error.kind() == io::ErrorKind::NotFound => (None, None),
            Ok(_) => (
                None,
                Some(io::Error::other(
                    "previously absent destination appeared after failed move",
                )),
            ),
            Err(error) => (None, Some(error)),
        },
    }
}
