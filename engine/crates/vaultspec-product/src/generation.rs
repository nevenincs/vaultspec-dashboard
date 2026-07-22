//! Retained unpublished-generation authority.
//! (a2a-product-provisioning W01.P01.S169).
//!
//! Generation mutation is available only through a [`LockedProduct`] bound to
//! the exact installation guard. The product root is the sole pathname
//! bootstrap; generation and app-home authority are retained as direct
//! children of that root. A created final-name generation remains inert until
//! the fixed active-receipt journal selects it in a later activation step.
//! Creation takes a unique mutable loan of the locked product, and the returned
//! token retains that loan. This permits only one transaction candidate lease
//! at a time and makes another create impossible while a candidate or poisoned
//! diagnostic authority is live. On Unix, same-euid product writers are
//! serialized by the installation guard; descriptor-relative operations do not
//! claim protection against a malicious non-cooperating process with that same
//! account authority. Because POSIX has no atomic directory-create-and-open
//! primitive, failure between `mkdirat` and retained authority establishment
//! leaves one bounded inert residue. Copied metadata and later pathname
//! observations authorize no cleanup; the outcome remains indeterminate.

use std::ffi::OsStr;
use std::path::{Path, PathBuf};

use crate::{
    locking::{InstallLockGuard, LockAuthorityError},
    paths::{PathError, ProductPaths},
    receipt::{ActiveReceiptReadState, read_active_receipt_journal},
};

/// Maximum number of generation directories not selected by the settled
/// active receipt. Creation at the bound is refused; no directory is guessed
/// safe to evict.
pub const MAX_ABANDONED_GENERATIONS: usize = 8;

/// Product filesystem authority bound to one verified installation guard.
///
/// This type is intentionally non-`Clone`. Its root, generations parent, and
/// app-home handles remain retained for the complete authority lifetime.
#[derive(Debug)]
pub struct LockedProduct<'lock> {
    paths: ProductPaths,
    guard: &'lock InstallLockGuard,
    root: DirectoryAuthority,
    generations: DirectoryAuthority,
    #[cfg(unix)]
    app_home: DirectoryAuthority,
    #[cfg(windows)]
    app_home: AppHomeAuthority,
}

/// Windows app-home authority is never discarded while a locked product is
/// live. The private `InCall` state exists only while one synchronous S171
/// installation call owns the exact directory handle; every return path
/// replaces it with either exclusive or transition authority.
#[cfg(windows)]
#[derive(Debug)]
enum AppHomeAuthority {
    Exclusive(DirectoryAuthority),
    Transition(vaultspec_windows_authority::InstallDirectoryAuthority),
    InCall,
}

/// Retained S171 failure evidence. File authorities remain live until receipt
/// publication either reconciles under restored exclusivity or explicitly
/// retries recovery from an indeterminate directory transition.
#[cfg(windows)]
#[derive(Debug)]
pub(crate) struct AppHomeInstallFailure {
    pub(crate) stage: vaultspec_windows_authority::InstallSynchronizedFileStage,
    pub(crate) outcome: vaultspec_windows_authority::InstallSynchronizedFileOutcome,
    pub(crate) source_authority: Option<vaultspec_windows_authority::AuthorityFile>,
    pub(crate) pre_move_destination_snapshot:
        Option<vaultspec_windows_authority::InstallFileSnapshot>,
    pub(crate) pre_move_destination_authority: Option<vaultspec_windows_authority::AuthorityFile>,
    pub(crate) reacquired_pre_move_destination_authority:
        Option<vaultspec_windows_authority::AuthorityFile>,
    pub(crate) installed_destination_authority: Option<vaultspec_windows_authority::AuthorityFile>,
    pub(crate) destination_reacquisition_error: Option<std::io::Error>,
    pub(crate) native_move_error: Option<std::io::Error>,
    pub(crate) error: std::io::Error,
    pub(crate) directory_recovery_error: Option<std::io::Error>,
}

/// Copied/owned S171 diagnostics retained after exact file leases are released
/// so common journal reconciliation can reopen the destination.
#[cfg(windows)]
#[derive(Debug)]
pub(crate) struct AppHomeInstallDiagnostic {
    pub(crate) stage: vaultspec_windows_authority::InstallSynchronizedFileStage,
    pub(crate) outcome: vaultspec_windows_authority::InstallSynchronizedFileOutcome,
    pub(crate) pre_move_destination_snapshot:
        Option<vaultspec_windows_authority::InstallFileSnapshot>,
    pub(crate) source_authority_was_retained: bool,
    pub(crate) pre_move_destination_authority_was_retained: bool,
    pub(crate) reacquired_pre_move_destination_authority_was_retained: bool,
    pub(crate) installed_destination_authority_was_retained: bool,
    pub(crate) destination_reacquisition_error: Option<std::io::Error>,
    pub(crate) native_move_error: Option<std::io::Error>,
    pub(crate) error: std::io::Error,
    pub(crate) directory_recovery_error: Option<std::io::Error>,
}

#[cfg(windows)]
impl AppHomeInstallDiagnostic {
    pub(crate) fn summary(&self) -> String {
        format!(
            "S171 {:?}/{:?}, destination_snapshot={}, source={}, old={}, reacquired_old={}, installed={}, destination_reacquisition_error={}, native_move_error={}, directory_recovery_error={}, error={}",
            self.stage,
            self.outcome,
            self.pre_move_destination_snapshot.is_some(),
            self.source_authority_was_retained,
            self.pre_move_destination_authority_was_retained,
            self.reacquired_pre_move_destination_authority_was_retained,
            self.installed_destination_authority_was_retained,
            self.destination_reacquisition_error.is_some(),
            self.native_move_error.is_some(),
            self.directory_recovery_error.is_some(),
            self.error,
        )
    }
}

#[cfg(windows)]
impl AppHomeInstallFailure {
    pub(crate) fn evidence_summary(&self) -> String {
        format!(
            "source={}, old={}, reacquired_old={}, installed={}, destination_reacquisition_error={}, native_move_error={}, directory_recovery_error={}",
            self.source_authority.is_some(),
            self.pre_move_destination_authority.is_some(),
            self.reacquired_pre_move_destination_authority.is_some(),
            self.installed_destination_authority.is_some(),
            self.destination_reacquisition_error.is_some(),
            self.native_move_error.is_some(),
            self.directory_recovery_error.is_some(),
        )
    }

    pub(crate) fn release_file_leases(self) -> AppHomeInstallDiagnostic {
        AppHomeInstallDiagnostic {
            stage: self.stage,
            outcome: self.outcome,
            pre_move_destination_snapshot: self.pre_move_destination_snapshot,
            source_authority_was_retained: self.source_authority.is_some(),
            pre_move_destination_authority_was_retained: self
                .pre_move_destination_authority
                .is_some(),
            reacquired_pre_move_destination_authority_was_retained: self
                .reacquired_pre_move_destination_authority
                .is_some(),
            installed_destination_authority_was_retained: self
                .installed_destination_authority
                .is_some(),
            destination_reacquisition_error: self.destination_reacquisition_error,
            native_move_error: self.native_move_error,
            error: self.error,
            directory_recovery_error: self.directory_recovery_error,
        }
    }
}

/// Result of moving the exact retained app-home authority through S171.
#[cfg(windows)]
#[derive(Debug)]
pub(crate) enum AppHomeInstallOutcome {
    Installed(vaultspec_windows_authority::AuthorityFile),
    Reconcile(AppHomeInstallFailure),
    Indeterminate(AppHomeInstallFailure),
}

impl<'lock> LockedProduct<'lock> {
    /// Bind the product tree to the exact current installation guard.
    ///
    /// The guard is verified both before the sole pathname bootstrap and after
    /// the retained child relationships have been established.
    pub fn bind(
        paths: ProductPaths,
        guard: &'lock InstallLockGuard,
    ) -> Result<Self, GenerationError> {
        guard.verify_for_product(&paths)?;
        let root = DirectoryAuthority::open_root(paths.root())
            .map_err(|error| bind_io("root bootstrap", error))?;
        let generations = root
            .open_child(OsStr::new("generations"))
            .map_err(|error| bind_io("generations relative open", error))?;
        let app_home = root
            .open_child(OsStr::new("app-home"))
            .map_err(|error| bind_io("app-home relative open", error))?;
        #[cfg(windows)]
        let app_home = AppHomeAuthority::Exclusive(app_home);
        let product = Self {
            paths,
            guard,
            root,
            generations,
            app_home,
        };
        product.validate_relationships()?;
        product.guard.verify_for_product(&product.paths)?;
        Ok(product)
    }

    /// Exclusively create and retain one owner-private final generation name.
    ///
    /// Only a settled journal receipt selects an active generation. An absent
    /// journal selects none, while recovery-required or malformed state blocks
    /// creation. The retained journal remains live through enumeration and the
    /// final relative create.
    pub fn create_unpublished<'product>(
        &'product mut self,
        generation: &str,
    ) -> Result<UnpublishedGeneration<'product, 'lock>, CreateUnpublishedError<'product, 'lock>>
    {
        let path = self
            .paths
            .generation_dir(generation)
            .map_err(GenerationError::from)?;
        self.validate_relationships()?;

        let receipt = read_active_receipt_journal(&self.paths, self.guard)
            .map_err(|error| GenerationError::ActiveReceiptAuthority(error.to_string()))?;
        let active = match receipt
            .state()
            .map_err(|error| GenerationError::ActiveReceiptAuthority(error.to_string()))?
        {
            ActiveReceiptReadState::Absent => None,
            ActiveReceiptReadState::Settled(receipt) => Some(receipt.active_generation()),
            ActiveReceiptReadState::RecoveryRequired(_) => {
                return Err(GenerationError::ReceiptRecoveryRequired.into());
            }
        };
        if active == Some(generation) {
            return Err(GenerationError::SelectedByActiveReceipt(generation.to_string()).into());
        }
        self.require_capacity(active)?;
        #[cfg(unix)]
        let authority = match self.generations.create_child(OsStr::new(generation), &path) {
            Ok(UnixChildCreation::Retained(authority)) => authority,
            Ok(UnixChildCreation::Unretained(created)) => {
                return Err(self.finalize_unretained_creation(generation, path, created));
            }
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                return Err(GenerationError::AlreadyExists(generation.to_string()).into());
            }
            Err(error) => return Err(GenerationError::Io(error).into()),
        };
        #[cfg(windows)]
        let authority = match self.generations.create_child(OsStr::new(generation), &path) {
            Ok(authority) => authority,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                return Err(GenerationError::AlreadyExists(generation.to_string()).into());
            }
            Err(error) => return Err(GenerationError::Io(error).into()),
        };
        let identity = authority.identity();
        #[cfg(windows)]
        let authority = RootAuthority::Exclusive(authority);
        let unpublished = UnpublishedGeneration {
            product: self,
            generation: generation.to_string(),
            path,
            identity,
            authority,
        };
        if let Err(error) = unpublished.validate_retained() {
            return Err(unpublished.creation_failed(error));
        }
        Ok(unpublished)
    }

    #[cfg(unix)]
    fn finalize_unretained_creation<'product>(
        &'product mut self,
        generation: &str,
        path: PathBuf,
        created: UnixUnretainedCreation,
    ) -> CreateUnpublishedError<'product, 'lock> {
        CreateUnpublishedError::Indeterminate(Box::new(IndeterminateGenerationCreation {
            _product: self,
            generation: generation.to_string(),
            path,
            error: GenerationError::IndeterminateCreation {
                creation: created.creation.to_string(),
                cleanup:
                    "cleanup refused because exact retained child authority was never established"
                        .to_string(),
            },
        }))
    }

    fn validate_relationships(&self) -> Result<(), GenerationError> {
        self.root.validate_parent(self.paths.root())?;
        self.generations
            .validate_parent(&self.paths.generations_dir())?;
        #[cfg(unix)]
        self.app_home.validate_parent(&self.paths.app_home())?;
        #[cfg(windows)]
        match &self.app_home {
            AppHomeAuthority::Exclusive(authority) => {
                authority.validate_parent(&self.paths.app_home())?;
            }
            AppHomeAuthority::Transition(_) | AppHomeAuthority::InCall => {
                return Err(GenerationError::AppHomeAuthorityTransition);
            }
        }

        #[cfg(unix)]
        {
            let root = DirectoryAuthority::open_root(self.paths.root())?;
            let generations = self.root.open_child(OsStr::new("generations"))?;
            let app_home = self.root.open_child(OsStr::new("app-home"))?;
            if root.identity() != self.root.identity()
                || generations.identity() != self.generations.identity()
                || app_home.identity() != self.app_home.identity()
            {
                return Err(GenerationError::ParentIdentityChanged);
            }
        }
        // On Windows S168's FILE_SHARE_READ-only leases deny rename, deletion,
        // generic-write/reparse mutation opens, and a second authority open of
        // these exact directories. Their initial relative opens are therefore
        // the continuing name/identity relationship; the DACL is separately
        // rechecked by named-path validation.
        Ok(())
    }

    fn require_capacity(&self, active: Option<&str>) -> Result<(), GenerationError> {
        if let Some(active) = active {
            let _ = self.paths.generation_dir(active)?;
        }

        let mut nonactive = 0usize;
        let mut active_count = 0usize;
        self.for_each_generation(|name, authority| {
            let path = self.paths.generation_dir(name)?;
            authority.validate_created(&self.generations, OsStr::new(name), &path)?;
            if active == Some(name) {
                active_count = active_count.saturating_add(1);
            } else {
                nonactive = nonactive.saturating_add(1);
                if nonactive >= MAX_ABANDONED_GENERATIONS {
                    return Err(GenerationError::AbandonedGenerationLimit {
                        limit: MAX_ABANDONED_GENERATIONS,
                    });
                }
            }
            Ok(())
        })?;

        if let Some(active) = active
            && active_count != 1
        {
            return Err(GenerationError::ActiveGenerationMissing(active.to_string()));
        }
        Ok(())
    }

    #[cfg(unix)]
    fn for_each_generation(
        &self,
        mut visit: impl FnMut(&str, &DirectoryAuthority) -> Result<(), GenerationError>,
    ) -> Result<(), GenerationError> {
        use std::os::unix::ffi::OsStrExt;

        let mut entries = rustix::fs::Dir::read_from(self.generations.fd())?;
        for entry in &mut entries {
            let entry = entry?;
            let bytes = entry.file_name().to_bytes();
            if bytes == b"." || bytes == b".." {
                continue;
            }
            let name = OsStr::from_bytes(bytes);
            let Some(name) = name.to_str() else {
                return Err(GenerationError::UnsafeFilesystemObject(
                    self.paths.generations_dir().join(name),
                ));
            };
            let path = self.paths.generation_dir(name)?;
            let authority = self
                .generations
                .open_child(OsStr::new(name))
                .map_err(|error| {
                    if error.kind() == std::io::ErrorKind::NotFound {
                        GenerationError::IdentityChanged(name.to_string())
                    } else {
                        GenerationError::UnsafeFilesystemObject(path)
                    }
                })?;
            visit(name, &authority)?;
        }
        Ok(())
    }

    #[cfg(windows)]
    fn for_each_generation(
        &self,
        mut visit: impl FnMut(&str, &DirectoryAuthority) -> Result<(), GenerationError>,
    ) -> Result<(), GenerationError> {
        for entry in std::fs::read_dir(self.paths.generations_dir())? {
            let entry = entry?;
            let name = entry.file_name();
            let Some(name) = name.to_str() else {
                return Err(GenerationError::UnsafeFilesystemObject(entry.path()));
            };
            let path = self.paths.generation_dir(name)?;
            let authority = self
                .generations
                .open_child(OsStr::new(name))
                .map_err(|error| {
                    if error.kind() == std::io::ErrorKind::NotFound {
                        GenerationError::IdentityChanged(name.to_string())
                    } else {
                        GenerationError::UnsafeFilesystemObject(path)
                    }
                })?;
            visit(name, &authority)?;
        }
        Ok(())
    }
}

#[cfg(unix)]
fn wrap_root(authority: DirectoryAuthority) -> RootAuthority {
    authority
}

#[cfg(windows)]
fn wrap_root(authority: DirectoryAuthority) -> RootAuthority {
    RootAuthority::Exclusive(authority)
}

fn bind_io(stage: &'static str, error: std::io::Error) -> GenerationError {
    GenerationError::Io(std::io::Error::new(
        error.kind(),
        format!("{stage}: {error}"),
    ))
}

#[cfg(unix)]
fn creation_stage(stage: &'static str, error: impl std::fmt::Display) -> GenerationError {
    GenerationError::CreationStage {
        stage,
        error: error.to_string(),
    }
}

/// A retained final-name generation which has not been selected by a receipt.
///
/// The token borrows its exact [`LockedProduct`] and is intentionally
/// non-`Clone`. The retained directory authority and identity are opaque.
#[derive(Debug)]
pub struct UnpublishedGeneration<'product, 'lock> {
    product: &'product mut LockedProduct<'lock>,
    generation: String,
    path: PathBuf,
    identity: DirectoryIdentity,
    authority: RootAuthority,
}

/// Unix root authority stays the plain retained descriptor: the write-shared
/// Windows materialization window has no Unix analogue because descriptor-
/// relative writes coexist with the retained root descriptor.
#[cfg(unix)]
type RootAuthority = DirectoryAuthority;

/// Windows generation-root authority. During the crate-private archive
/// materialization window the exclusive deny-write lease is released and the
/// writer holds the write-shared, delete-denied materialization lease on the
/// SAME verified identity (archive-materialization D4); every general product
/// operation on the token fails typed until `end_materialization` restores and
/// revalidates exclusivity.
#[cfg(windows)]
#[derive(Debug)]
enum RootAuthority {
    Exclusive(DirectoryAuthority),
    Materializing,
}

impl<'product, 'lock> UnpublishedGeneration<'product, 'lock> {
    /// The validated generation identifier.
    #[must_use]
    pub fn generation(&self) -> &str {
        &self.generation
    }

    /// The product-derived destination path used to populate this retained
    /// directory. This is not an authority handle.
    #[must_use]
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Revalidate the complete retained product/name/permission join.
    ///
    /// This crate-private seam lets S170 verify before and after its bounded
    /// filesystem walk and lets S172 preserve the exact authority through
    /// publication. It exposes no handle or copied identity.
    pub(crate) fn validate_retained(&self) -> Result<(), GenerationError> {
        let expected = self.product_paths().generation_dir(&self.generation)?;
        if expected != self.path {
            return Err(GenerationError::IdentityChanged(self.generation.clone()));
        }
        self.product.validate_relationships()?;
        self.install_guard()
            .verify_for_product(self.product_paths())?;

        #[cfg(unix)]
        {
            let current = self
                .product
                .generations
                .open_child(OsStr::new(&self.generation))
                .map_err(|_| GenerationError::IdentityChanged(self.generation.clone()))?;
            if current.identity() != self.identity {
                return Err(GenerationError::IdentityChanged(self.generation.clone()));
            }
        }
        #[cfg(unix)]
        return self.authority.validate_created(
            &self.product.generations,
            OsStr::new(&self.generation),
            &self.path,
        );
        #[cfg(windows)]
        match &self.authority {
            RootAuthority::Exclusive(authority) => authority.validate_created(
                &self.product.generations,
                OsStr::new(&self.generation),
                &self.path,
            ),
            // During the materialization window the writer's lease pins the
            // identity; named-path DACL policy is still rechecked here.
            RootAuthority::Materializing => {
                if windows_directory_dacl_is_restricted(&self.path) {
                    Ok(())
                } else {
                    Err(GenerationError::UnsafeFilesystemObject(self.path.clone()))
                }
            }
        }
    }

    /// Product-derived paths joined to this exact retained generation.
    #[must_use]
    pub(crate) fn product_paths(&self) -> &ProductPaths {
        &self.product.paths
    }

    /// Installation guard joined to this exact retained generation.
    #[must_use]
    pub(crate) fn install_guard(&self) -> &InstallLockGuard {
        self.product.guard
    }

    /// Synchronize the exact retained app-home directory after a Unix
    /// same-directory journal installation.
    #[cfg(unix)]
    pub(crate) fn synchronize_app_home(&self) -> Result<(), GenerationError> {
        self.validate_retained()?;
        rustix::fs::fsync(&self.product.app_home.directory)?;
        self.validate_retained()
    }

    /// Create one fixed owner-private initialization file relative to the exact
    /// retained Unix app-home directory.
    #[cfg(unix)]
    pub(crate) fn create_activation_init_file(
        &self,
        name: &OsStr,
    ) -> Result<std::fs::File, GenerationError> {
        self.validate_retained()?;
        let file = rustix::fs::openat(
            &self.product.app_home.directory,
            name,
            rustix::fs::OFlags::CREATE
                | rustix::fs::OFlags::EXCL
                | rustix::fs::OFlags::RDWR
                | rustix::fs::OFlags::NOFOLLOW
                | rustix::fs::OFlags::CLOEXEC,
            rustix::fs::Mode::RUSR | rustix::fs::Mode::WUSR,
        )?;
        self.validate_retained()?;
        Ok(std::fs::File::from(file))
    }

    /// Rename one fixed initialization entry to the active journal name inside
    /// the exact retained Unix app-home directory.
    #[cfg(unix)]
    pub(crate) fn install_activation_init_file(
        &self,
        source_name: &OsStr,
        destination_name: &OsStr,
    ) -> Result<(), GenerationError> {
        self.validate_retained()?;
        match rustix::fs::statat(
            &self.product.app_home.directory,
            destination_name,
            rustix::fs::AtFlags::SYMLINK_NOFOLLOW,
        ) {
            Err(error) if error == rustix::io::Errno::NOENT => {}
            Ok(_) => {
                return Err(GenerationError::UnsafeFilesystemObject(
                    self.product.paths.app_home().join(destination_name),
                ));
            }
            Err(error) => return Err(GenerationError::Io(error.into())),
        }
        rustix::fs::renameat(
            &self.product.app_home.directory,
            source_name,
            &self.product.app_home.directory,
            destination_name,
        )?;
        rustix::fs::fsync(&self.product.app_home.directory)?;
        self.validate_retained()
    }

    /// Move the exact retained Windows app-home authority through the S171
    /// synchronized-file installation primitive.
    ///
    /// Every return path restores either full exclusive authority or the exact
    /// transition authority needed for a later typed recovery attempt.
    #[cfg(windows)]
    pub(crate) fn install_synchronized_app_home_file(
        &mut self,
        source_name: &OsStr,
        destination_name: &OsStr,
    ) -> AppHomeInstallOutcome {
        let directory_path = self.product.paths.app_home();
        let authority = std::mem::replace(&mut self.product.app_home, AppHomeAuthority::InCall);
        let AppHomeAuthority::Exclusive(authority) = authority else {
            self.product.app_home = authority;
            return AppHomeInstallOutcome::Indeterminate(AppHomeInstallFailure {
                stage: vaultspec_windows_authority::InstallSynchronizedFileStage::RetainedDirectoryValidation,
                outcome: vaultspec_windows_authority::InstallSynchronizedFileOutcome::BeforeMove,
                source_authority: None,
                pre_move_destination_snapshot: None,
                pre_move_destination_authority: None,
                reacquired_pre_move_destination_authority: None,
                installed_destination_authority: None,
                destination_reacquisition_error: None,
                native_move_error: None,
                error: std::io::Error::other(
                    "app-home does not retain exclusive installation authority",
                ),
                directory_recovery_error: None,
            });
        };
        let DirectoryAuthority {
            directory,
            identity: expected_identity,
        } = authority;
        debug_assert_eq!(directory.identity(), expected_identity);
        match directory.install_synchronized_file(&directory_path, source_name, destination_name) {
            Ok((directory, installed)) => {
                self.product.app_home =
                    AppHomeAuthority::Exclusive(DirectoryAuthority::from_retained(directory));
                AppHomeInstallOutcome::Installed(installed)
            }
            Err(failure) => {
                let parts = failure.into_parts();
                let vaultspec_windows_authority::InstallSynchronizedFileErrorParts {
                    stage,
                    outcome,
                    directory_authority,
                    source_authority,
                    pre_move_destination_snapshot,
                    pre_move_destination_authority,
                    reacquired_pre_move_destination_authority,
                    installed_destination_authority,
                    destination_reacquisition_error,
                    native_move_error,
                    error,
                } = parts;
                let recovered = match directory_authority.into_exclusive() {
                    Ok(directory) => Ok(directory),
                    Err(transition) => transition.recover(&directory_path),
                };
                match recovered {
                    Ok(directory) => {
                        self.product.app_home = AppHomeAuthority::Exclusive(
                            DirectoryAuthority::from_retained(directory),
                        );
                        AppHomeInstallOutcome::Reconcile(AppHomeInstallFailure {
                            stage,
                            outcome,
                            source_authority,
                            pre_move_destination_snapshot,
                            pre_move_destination_authority,
                            reacquired_pre_move_destination_authority,
                            installed_destination_authority,
                            destination_reacquisition_error,
                            native_move_error,
                            error,
                            directory_recovery_error: None,
                        })
                    }
                    Err(recovery) => {
                        let (transition, directory_recovery_error) = recovery.into_parts();
                        self.product.app_home = AppHomeAuthority::Transition(transition);
                        AppHomeInstallOutcome::Indeterminate(AppHomeInstallFailure {
                            stage,
                            outcome,
                            source_authority,
                            pre_move_destination_snapshot,
                            pre_move_destination_authority,
                            reacquired_pre_move_destination_authority,
                            installed_destination_authority,
                            destination_reacquisition_error,
                            native_move_error,
                            error,
                            directory_recovery_error: Some(directory_recovery_error),
                        })
                    }
                }
            }
        }
    }

    /// Retry recovery of an exact Windows app-home transition authority.
    #[cfg(windows)]
    pub(crate) fn recover_app_home_authority(&mut self) -> Result<(), GenerationError> {
        let directory_path = self.product.paths.app_home();
        let authority = std::mem::replace(&mut self.product.app_home, AppHomeAuthority::InCall);
        match authority {
            AppHomeAuthority::Exclusive(authority) => {
                self.product.app_home = AppHomeAuthority::Exclusive(authority);
                self.validate_retained()
            }
            AppHomeAuthority::Transition(transition) => match transition.recover(&directory_path) {
                Ok(directory) => {
                    self.product.app_home =
                        AppHomeAuthority::Exclusive(DirectoryAuthority::from_retained(directory));
                    self.validate_retained()
                }
                Err(recovery) => {
                    let (transition, error) = recovery.into_parts();
                    self.product.app_home = AppHomeAuthority::Transition(transition);
                    Err(GenerationError::Io(error))
                }
            },
            AppHomeAuthority::InCall => {
                self.product.app_home = AppHomeAuthority::InCall;
                Err(GenerationError::AppHomeAuthorityTransition)
            }
        }
    }

    fn creation_failed(
        self,
        validation: GenerationError,
    ) -> CreateUnpublishedError<'product, 'lock> {
        let UnpublishedGeneration {
            product,
            generation,
            path,
            identity,
            authority,
        } = self;
        #[cfg(windows)]
        let authority = match authority {
            RootAuthority::Exclusive(authority) => authority,
            RootAuthority::Materializing => {
                return CreateUnpublishedError::Retained(Box::new(PoisonedGeneration {
                    unpublished: UnpublishedGeneration {
                        product,
                        generation,
                        path,
                        identity,
                        authority: RootAuthority::Materializing,
                    },
                    error: GenerationError::RootAuthorityMaterializing,
                }));
            }
        };
        match authority.remove_empty(&product.generations, OsStr::new(&generation)) {
            Ok(()) => CreateUnpublishedError::Refused(validation),
            Err(failure) => {
                let (authority, cleanup) = *failure;
                CreateUnpublishedError::Retained(Box::new(PoisonedGeneration {
                    unpublished: UnpublishedGeneration {
                        product,
                        generation,
                        path,
                        identity,
                        authority: wrap_root(authority),
                    },
                    error: GenerationError::CreationValidation {
                        validation: validation.to_string(),
                        cleanup: cleanup.to_string(),
                    },
                }))
            }
        }
    }

    /// Delete exactly this retained generation if it is still unpublished and
    /// empty, or return a diagnostic token which continues to retain it.
    pub fn discard(self) -> DiscardOutcome<'product, 'lock> {
        let receipt = match read_active_receipt_journal(&self.product.paths, self.product.guard) {
            Ok(receipt) => receipt,
            Err(error) => {
                return self.retained(GenerationError::ActiveReceiptAuthority(error.to_string()));
            }
        };
        let active = match receipt.state() {
            Ok(ActiveReceiptReadState::Absent) => None,
            Ok(ActiveReceiptReadState::Settled(receipt)) => Some(receipt.active_generation()),
            Ok(ActiveReceiptReadState::RecoveryRequired(_)) => {
                return self.retained(GenerationError::ReceiptRecoveryRequired);
            }
            Err(error) => {
                return self.retained(GenerationError::ActiveReceiptAuthority(error.to_string()));
            }
        };
        if active == Some(self.generation.as_str()) {
            let generation = self.generation.clone();
            return self.retained(GenerationError::SelectedByActiveReceipt(generation));
        }

        if let Err(error) = self.validate_retained() {
            return self.retained(error);
        }

        let UnpublishedGeneration {
            product,
            generation,
            path,
            identity,
            authority,
        } = self;
        #[cfg(windows)]
        let authority = match authority {
            RootAuthority::Exclusive(authority) => authority,
            RootAuthority::Materializing => {
                return DiscardOutcome::Retained(Box::new(PoisonedGeneration {
                    unpublished: UnpublishedGeneration {
                        product,
                        generation,
                        path,
                        identity,
                        authority: RootAuthority::Materializing,
                    },
                    error: GenerationError::RootAuthorityMaterializing,
                }));
            }
        };
        match authority.remove_empty(&product.generations, OsStr::new(&generation)) {
            Ok(()) => DiscardOutcome::Removed { generation },
            Err(failure) => {
                let (authority, error) = *failure;
                DiscardOutcome::Retained(Box::new(PoisonedGeneration {
                    unpublished: UnpublishedGeneration {
                        product,
                        generation,
                        path,
                        identity,
                        authority: wrap_root(authority),
                    },
                    error,
                }))
            }
        }
    }

    fn retained(self, error: GenerationError) -> DiscardOutcome<'product, 'lock> {
        DiscardOutcome::Retained(Box::new(PoisonedGeneration {
            unpublished: self,
            error,
        }))
    }
}

/// Terminal result of an identity-safe bounded discard.
#[derive(Debug)]
pub enum DiscardOutcome<'product, 'lock> {
    /// The exact empty retained directory was removed and its authority
    /// consumed.
    Removed {
        /// Identifier of the consumed generation authority.
        generation: String,
    },
    /// Cleanup failed closed and the exact generation remains retained.
    Retained(Box<PoisonedGeneration<'product, 'lock>>),
}

/// Diagnostic-only authority retained after creation or discard fails closed.
///
/// This type exposes no recovery, activation, raw handle, or conversion API.
#[derive(Debug)]
pub struct PoisonedGeneration<'product, 'lock> {
    unpublished: UnpublishedGeneration<'product, 'lock>,
    error: GenerationError,
}

impl PoisonedGeneration<'_, '_> {
    /// The retained generation identifier.
    #[must_use]
    pub fn generation(&self) -> &str {
        self.unpublished.generation()
    }

    /// The product-derived diagnostic path, not an authority handle.
    #[must_use]
    pub fn path(&self) -> &Path {
        self.unpublished.path()
    }

    /// Why the consuming operation failed closed.
    #[must_use]
    pub fn error(&self) -> &GenerationError {
        &self.error
    }
}

/// Diagnostic state for a Unix creation whose final name may remain but whose
/// exact directory authority could not be established.
///
/// The token retains the complete locked product, including the generations
/// parent authority, and its unique mutable loan. It deliberately exposes no
/// retry, cleanup, publication, recovery, or raw-authority conversion.
#[derive(Debug)]
pub struct IndeterminateGenerationCreation<'product, 'lock> {
    _product: &'product mut LockedProduct<'lock>,
    generation: String,
    path: PathBuf,
    error: GenerationError,
}

impl IndeterminateGenerationCreation<'_, '_> {
    /// The generation identifier whose final-name state is indeterminate.
    #[must_use]
    pub fn generation(&self) -> &str {
        &self.generation
    }

    /// The product-derived diagnostic path, not an authority handle.
    #[must_use]
    pub fn path(&self) -> &Path {
        &self.path
    }

    /// The creation failure and the reason cleanup was not authorized.
    #[must_use]
    pub fn error(&self) -> &GenerationError {
        &self.error
    }
}

/// Terminal failure to create an unpublished generation.
///
/// Failures before filesystem creation, and failures whose created residue was
/// removed, are [`Self::Refused`]. After an exact child authority exists,
/// failed cleanup returns [`Self::Retained`] with that authority and the unique
/// mutable product loan. On Unix, failure before exact child authority exists
/// permits no cleanup through copied metadata or a later pathname observation.
/// [`Self::Indeterminate`] preserves product and parent authority without
/// claiming authority over the possibly remaining final name.
#[derive(Debug)]
pub enum CreateUnpublishedError<'product, 'lock> {
    /// Creation was refused with no final-name residue known to remain.
    Refused(GenerationError),
    /// Post-create validation failed while exact child authority remains live.
    Retained(Box<PoisonedGeneration<'product, 'lock>>),
    /// Unix creation may have left a final name without exact child authority.
    Indeterminate(Box<IndeterminateGenerationCreation<'product, 'lock>>),
}

impl std::fmt::Display for CreateUnpublishedError<'_, '_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Refused(error) => write!(f, "unpublished generation creation refused: {error}"),
            Self::Retained(poisoned) => write!(
                f,
                "unpublished generation creation failed with retained authority: {}",
                poisoned.error()
            ),
            Self::Indeterminate(created) => write!(
                f,
                "unpublished generation creation left indeterminate final-name state: {}",
                created.error()
            ),
        }
    }
}

impl std::error::Error for CreateUnpublishedError<'_, '_> {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Refused(error) => Some(error),
            Self::Retained(poisoned) => Some(poisoned.error()),
            Self::Indeterminate(created) => Some(created.error()),
        }
    }
}

impl<'product, 'lock> From<GenerationError> for CreateUnpublishedError<'product, 'lock> {
    fn from(error: GenerationError) -> Self {
        Self::Refused(error)
    }
}

#[cfg(unix)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct DirectoryIdentity {
    device: u64,
    inode: u64,
}

#[cfg(unix)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct UnixCreatedName {
    identity: DirectoryIdentity,
    is_directory: bool,
    owner: u32,
    mode: u32,
}

#[cfg(unix)]
#[derive(Debug)]
struct UnixUnretainedCreation {
    creation: GenerationError,
}

#[cfg(unix)]
#[derive(Debug)]
enum UnixChildCreation {
    Retained(DirectoryAuthority),
    Unretained(UnixUnretainedCreation),
}

#[cfg(windows)]
type DirectoryIdentity = vaultspec_windows_authority::HighResFileId;

#[cfg(unix)]
#[derive(Debug)]
struct DirectoryAuthority {
    directory: rustix::fd::OwnedFd,
    identity: DirectoryIdentity,
}

#[cfg(unix)]
impl DirectoryAuthority {
    fn open_root(path: &Path) -> std::io::Result<Self> {
        let directory = rustix::fs::openat(
            rustix::fs::CWD,
            path,
            rustix::fs::OFlags::RDONLY
                | rustix::fs::OFlags::DIRECTORY
                | rustix::fs::OFlags::NOFOLLOW
                | rustix::fs::OFlags::CLOEXEC,
            rustix::fs::Mode::empty(),
        )?;
        Self::from_directory(directory)
    }

    fn open_child(&self, name: &OsStr) -> std::io::Result<Self> {
        let directory = rustix::fs::openat(
            &self.directory,
            name,
            rustix::fs::OFlags::RDONLY
                | rustix::fs::OFlags::DIRECTORY
                | rustix::fs::OFlags::NOFOLLOW
                | rustix::fs::OFlags::CLOEXEC,
            rustix::fs::Mode::empty(),
        )?;
        Self::from_directory(directory)
    }

    fn create_child(&self, name: &OsStr, path: &Path) -> std::io::Result<UnixChildCreation> {
        rustix::fs::mkdirat(
            &self.directory,
            name,
            rustix::fs::Mode::RUSR | rustix::fs::Mode::WUSR | rustix::fs::Mode::XUSR,
        )?;
        let created_name = match self.inspect_created_name(name) {
            Ok(created_name) => created_name,
            Err(error) => {
                return Ok(UnixChildCreation::Unretained(UnixUnretainedCreation {
                    creation: error,
                }));
            }
        };
        if !created_name.is_directory
            || created_name.owner != nix::unistd::Uid::effective().as_raw()
            || created_name.mode != 0o700
        {
            return Ok(UnixChildCreation::Unretained(UnixUnretainedCreation {
                creation: creation_stage(
                    "post-mkdir no-follow snapshot establishment",
                    format!(
                        "created filesystem object is not an owner-private directory at {path:?}"
                    ),
                ),
            }));
        }
        match self.open_child(name) {
            Ok(authority) => match authority.current_snapshot() {
                Ok(opened) if opened == created_name => Ok(UnixChildCreation::Retained(authority)),
                Ok(_) => Ok(UnixChildCreation::Unretained(UnixUnretainedCreation {
                    creation: creation_stage(
                        "post-mkdir no-follow open/fstat",
                        "opened directory snapshot differs from the captured created name",
                    ),
                })),
                Err(error) => Ok(UnixChildCreation::Unretained(UnixUnretainedCreation {
                    creation: creation_stage("post-mkdir retained-fd fstat", error),
                })),
            },
            Err(error) => Ok(UnixChildCreation::Unretained(UnixUnretainedCreation {
                creation: creation_stage("post-mkdir no-follow open", error),
            })),
        }
    }

    fn inspect_created_name(&self, name: &OsStr) -> Result<UnixCreatedName, GenerationError> {
        let stat = rustix::fs::statat(&self.directory, name, rustix::fs::AtFlags::SYMLINK_NOFOLLOW)
            .map_err(|error| {
                creation_stage("post-mkdir no-follow snapshot establishment", error)
            })?;
        Ok(UnixCreatedName {
            identity: DirectoryIdentity {
                device: stat.st_dev as u64,
                inode: stat.st_ino as u64,
            },
            is_directory: rustix::fs::FileType::from_raw_mode(stat.st_mode)
                == rustix::fs::FileType::Directory,
            owner: stat.st_uid,
            mode: stat.st_mode & 0o777,
        })
    }

    fn from_directory(directory: rustix::fd::OwnedFd) -> std::io::Result<Self> {
        let stat = rustix::fs::fstat(&directory)?;
        if rustix::fs::FileType::from_raw_mode(stat.st_mode) != rustix::fs::FileType::Directory {
            return Err(std::io::Error::other(
                "generation authority handle is not a directory",
            ));
        }
        Ok(Self {
            identity: DirectoryIdentity {
                device: stat.st_dev as u64,
                inode: stat.st_ino as u64,
            },
            directory,
        })
    }

    fn current_snapshot(&self) -> std::io::Result<UnixCreatedName> {
        let stat = rustix::fs::fstat(&self.directory)?;
        Ok(UnixCreatedName {
            identity: DirectoryIdentity {
                device: stat.st_dev as u64,
                inode: stat.st_ino as u64,
            },
            is_directory: rustix::fs::FileType::from_raw_mode(stat.st_mode)
                == rustix::fs::FileType::Directory,
            owner: stat.st_uid,
            mode: stat.st_mode & 0o777,
        })
    }

    fn fd(&self) -> &rustix::fd::OwnedFd {
        &self.directory
    }

    fn identity(&self) -> DirectoryIdentity {
        self.identity
    }

    fn validate_parent(&self, path: &Path) -> Result<(), GenerationError> {
        let stat = rustix::fs::fstat(&self.directory)?;
        if rustix::fs::FileType::from_raw_mode(stat.st_mode) != rustix::fs::FileType::Directory
            || self.identity
                != (DirectoryIdentity {
                    device: stat.st_dev as u64,
                    inode: stat.st_ino as u64,
                })
        {
            return Err(GenerationError::ParentIdentityChanged);
        }
        if stat.st_uid != nix::unistd::Uid::effective().as_raw() || stat.st_mode & 0o022 != 0 {
            return Err(GenerationError::UnsafeFilesystemObject(path.to_path_buf()));
        }
        Ok(())
    }

    fn validate_created(
        &self,
        parent: &Self,
        name: &OsStr,
        path: &Path,
    ) -> Result<(), GenerationError> {
        let held = rustix::fs::fstat(&self.directory)?;
        let named = rustix::fs::statat(
            &parent.directory,
            name,
            rustix::fs::AtFlags::SYMLINK_NOFOLLOW,
        )?;
        let held_identity = DirectoryIdentity {
            device: held.st_dev as u64,
            inode: held.st_ino as u64,
        };
        let named_identity = DirectoryIdentity {
            device: named.st_dev as u64,
            inode: named.st_ino as u64,
        };
        if rustix::fs::FileType::from_raw_mode(held.st_mode) != rustix::fs::FileType::Directory
            || rustix::fs::FileType::from_raw_mode(named.st_mode) != rustix::fs::FileType::Directory
            || held_identity != self.identity
            || named_identity != self.identity
        {
            return Err(GenerationError::IdentityChanged(
                name.to_string_lossy().into_owned(),
            ));
        }
        if held.st_uid != nix::unistd::Uid::effective().as_raw()
            || named.st_uid != nix::unistd::Uid::effective().as_raw()
            || held.st_mode & 0o777 != 0o700
            || named.st_mode & 0o777 != 0o700
        {
            return Err(GenerationError::UnsafeFilesystemObject(path.to_path_buf()));
        }
        Ok(())
    }

    fn remove_empty(self, parent: &Self, name: &OsStr) -> Result<(), Box<(Self, GenerationError)>> {
        let named = match rustix::fs::statat(
            &parent.directory,
            name,
            rustix::fs::AtFlags::SYMLINK_NOFOLLOW,
        ) {
            Ok(named) => named,
            Err(error) => return Err(Box::new((self, GenerationError::Io(error.into())))),
        };
        let named_identity = DirectoryIdentity {
            device: named.st_dev as u64,
            inode: named.st_ino as u64,
        };
        if rustix::fs::FileType::from_raw_mode(named.st_mode) != rustix::fs::FileType::Directory
            || named_identity != self.identity
        {
            return Err(Box::new((
                self,
                GenerationError::IdentityChanged(name.to_string_lossy().into_owned()),
            )));
        }
        match rustix::fs::unlinkat(&parent.directory, name, rustix::fs::AtFlags::REMOVEDIR) {
            Ok(()) => Ok(()),
            Err(error) => Err(Box::new((self, GenerationError::Io(error.into())))),
        }
    }
}

#[cfg(windows)]
#[derive(Debug)]
struct DirectoryAuthority {
    directory: vaultspec_windows_authority::AuthorityDirectory,
    identity: DirectoryIdentity,
}

#[cfg(windows)]
impl DirectoryAuthority {
    fn open_root(path: &Path) -> std::io::Result<Self> {
        Self::from_directory(
            vaultspec_windows_authority::AuthorityDirectory::open_existing_root(path)?,
        )
    }

    fn open_child(&self, name: &OsStr) -> std::io::Result<Self> {
        Self::from_directory(self.directory.open_child_directory(name)?)
    }

    fn create_child(&self, name: &OsStr, _path: &Path) -> std::io::Result<Self> {
        Self::from_directory(self.directory.create_child_directory(name)?)
    }

    fn from_directory(
        directory: vaultspec_windows_authority::AuthorityDirectory,
    ) -> std::io::Result<Self> {
        let identity = directory.identity();
        Ok(Self {
            directory,
            identity,
        })
    }

    fn from_retained(directory: vaultspec_windows_authority::AuthorityDirectory) -> Self {
        let identity = directory.identity();
        Self {
            directory,
            identity,
        }
    }

    fn identity(&self) -> DirectoryIdentity {
        self.identity
    }

    fn validate_parent(&self, path: &Path) -> Result<(), GenerationError> {
        if !windows_directory_dacl_is_restricted(path) {
            return Err(GenerationError::UnsafeFilesystemObject(path.to_path_buf()));
        }
        Ok(())
    }

    fn validate_created(
        &self,
        _parent: &Self,
        _name: &OsStr,
        path: &Path,
    ) -> Result<(), GenerationError> {
        if !windows_directory_dacl_is_restricted(path) {
            return Err(GenerationError::UnsafeFilesystemObject(path.to_path_buf()));
        }
        Ok(())
    }

    fn remove_empty(
        self,
        _parent: &Self,
        _name: &OsStr,
    ) -> Result<(), Box<(Self, GenerationError)>> {
        let Self {
            directory,
            identity,
        } = self;
        match directory.remove_empty() {
            Ok(()) => Ok(()),
            Err(error) => {
                let (directory, source) = error.into_parts();
                Err(Box::new((
                    Self {
                        directory,
                        identity,
                    },
                    GenerationError::Io(source),
                )))
            }
        }
    }
}

#[cfg(windows)]
fn windows_directory_dacl_is_restricted(path: &Path) -> bool {
    use std::os::windows::fs::MetadataExt;
    use vaultspec_windows_authority::{
        ReadOnlyAuthorityDirectory, current_user_sid, private_policy,
    };

    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;
    let Ok(metadata) = std::fs::symlink_metadata(path) else {
        return false;
    };
    if !metadata.is_dir()
        || metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
        || metadata.file_type().is_symlink()
    {
        return false;
    }
    // Fail closed on every step, as the whole predicate does: an undetermined
    // principal is "cannot prove restricted", never "does not match".
    let Ok(user_sid) = current_user_sid() else {
        return false;
    };
    // Observe the directory object's DACL through one read-only snapshot; the
    // observation authority also refuses files and reparse points fail-closed.
    let Ok(observation) = ReadOnlyAuthorityDirectory::open_observation(path) else {
        return false;
    };
    let Ok(snapshot) = observation.dacl_snapshot() else {
        return false;
    };
    private_policy::validate_no_outside_principal(&snapshot, &user_sid).is_ok()
}

/// Why retained generation authority refused an operation.
#[derive(Debug)]
pub enum GenerationError {
    /// The generation identifier violated the product path grammar.
    Path(PathError),
    /// The supplied installation guard is foreign or no longer authoritative.
    LockAuthority(LockAuthorityError),
    /// The fixed receipt journal could not establish bounded settled state.
    ActiveReceiptAuthority(String),
    /// Receipt proof/target normalization is required before mutation.
    ReceiptRecoveryRequired,
    /// The final generation name already exists; it is never reused or merged.
    AlreadyExists(String),
    /// The exact nonactive-generation hard bound was reached.
    AbandonedGenerationLimit { limit: usize },
    /// A settled active receipt named a generation absent from its retained
    /// generation parent.
    ActiveGenerationMissing(String),
    /// A link, reparse point, file, or invalid entry occupied an authority
    /// location.
    UnsafeFilesystemObject(PathBuf),
    /// A retained product parent relationship changed identity.
    ParentIdentityChanged,
    /// The Windows app-home directory retains only move-compatible transition
    /// authority and must recover exclusivity before general product use.
    AppHomeAuthorityTransition,
    /// The generation root released its exclusive lease to the archive
    /// materializer; general product operations resume only after
    /// `end_materialization` restores and revalidates exclusivity.
    RootAuthorityMaterializing,
    /// The generation name no longer resolves to the retained identity.
    IdentityChanged(String),
    /// The settled active receipt selects the requested generation.
    SelectedByActiveReceipt(String),
    /// A Unix operation after successful `mkdirat` failed at a named stage.
    CreationStage {
        /// Bounded creation or cleanup stage.
        stage: &'static str,
        /// Underlying diagnostic without an authority claim.
        error: String,
    },
    /// A post-create invariant failed and exact empty cleanup also failed.
    CreationValidation {
        /// Failed retained-name or permission validation.
        validation: String,
        /// Failed exact cleanup diagnostic.
        cleanup: String,
    },
    /// Exact child authority was never established, so final-name cleanup was
    /// not authorized.
    IndeterminateCreation {
        /// Failure while establishing exact child authority.
        creation: String,
        /// Reason cleanup was not authorized.
        cleanup: String,
    },
    /// Filesystem operation failed.
    Io(std::io::Error),
}

#[path = "generation/materialization.rs"]
mod materialization;

mod errors;

#[cfg(test)]
#[path = "generation/tests.rs"]
mod tests;
