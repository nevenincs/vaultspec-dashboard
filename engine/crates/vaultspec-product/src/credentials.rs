//! Retained dashboard credential authority (W01.P01.S175).
//!
//! Rust owns only the dashboard-created ownership and attach-control roles. The
//! packaged Python gateway owns worker-IPC creation. Dashboard minting paths are
//! derived from [`ProductPaths`]; an arbitrary path is accepted only by the
//! creation-free [`ForeignHandoffReader`].

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::{
    locking::{InstallLockGuard, PendingCredentialsClaim},
    paths::ProductPaths,
};

#[cfg(unix)]
#[path = "credentials/unix.rs"]
pub(crate) mod platform;
#[cfg(windows)]
#[path = "credentials/windows.rs"]
pub(crate) mod platform;

pub(crate) use platform::{FileIdentity, RetainedCredentialDirectory, RetainedCredentialFile};

/// Exact token length: 256 random bits encoded as lowercase hexadecimal.
pub const TOKEN_BYTES: usize = 64;

/// Dashboard-owned credential roles. Worker IPC is deliberately absent: the
/// Python gateway creates and rotates it within the gateway-worker boundary.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CredentialRole {
    /// Receipt-bound lifecycle mutation authority.
    Ownership,
    /// Dashboard control and settlement-callback authentication.
    AttachControl,
}

impl CredentialRole {
    pub(crate) const fn file_name(self) -> &'static str {
        match self {
            Self::Ownership => "ownership.cap",
            Self::AttachControl => "attach.cred",
        }
    }
}

/// A validated credential. Debug output always redacts the secret.
#[derive(Clone, PartialEq, Eq)]
pub struct Credential {
    role: CredentialRole,
    secret: String,
}

impl Credential {
    pub(crate) fn from_validated(role: CredentialRole, secret: String) -> Self {
        Self { role, secret }
    }

    /// The credential role bound to the validated file name.
    #[must_use]
    pub const fn role(&self) -> CredentialRole {
        self.role
    }

    /// The secret. Callers must keep it off logs, discovery, and receipts.
    #[must_use]
    pub fn secret(&self) -> &str {
        &self.secret
    }

    /// Compare every stored byte without an early length or prefix return.
    #[must_use]
    pub fn verify(&self, presented: &str) -> bool {
        let expected = self.secret.as_bytes();
        let presented = presented.as_bytes();
        let mut difference = expected.len() ^ presented.len();
        for (index, byte) in expected.iter().copied().enumerate() {
            difference |= usize::from(byte ^ presented.get(index).copied().unwrap_or(0));
        }
        difference == 0
    }
}

impl std::fmt::Debug for Credential {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("Credential")
            .field("role", &self.role)
            .field("secret", &"<redacted>")
            .finish()
    }
}

/// Credential authority failure.
#[derive(Debug)]
pub enum CredentialError {
    /// An operating-system operation failed.
    Io(std::io::Error),
    /// A required role is absent.
    Missing(CredentialRole),
    /// Bootstrap refuses to replace an existing role.
    AlreadyExists(CredentialRole),
    /// A file or token does not satisfy the closed authority contract.
    Invalid {
        role: CredentialRole,
        reason: &'static str,
    },
    /// The safe platform APIs cannot establish the required authority.
    PlatformAuthorityUnavailable(&'static str),
    /// Durable bootstrap residue requires explicit receipt-aware recovery.
    RecoveryRequired(crate::bootstrap::BootstrapRecoveryState),
    /// This held installation guard already owns a live pending bootstrap.
    BootstrapAuthorityInUse,
}

impl std::fmt::Display for CredentialError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "credential I/O error: {error}"),
            Self::Missing(role) => write!(formatter, "credential {role:?} is absent"),
            Self::AlreadyExists(role) => write!(
                formatter,
                "credential {role:?} already exists; bootstrap never overwrites"
            ),
            Self::Invalid { role, reason } => {
                write!(formatter, "credential {role:?} is invalid: {reason}")
            }
            Self::PlatformAuthorityUnavailable(reason) => {
                write!(
                    formatter,
                    "safe credential authority is unavailable: {reason}"
                )
            }
            Self::RecoveryRequired(state) => {
                write!(
                    formatter,
                    "credential bootstrap recovery is required: {state:?}"
                )
            }
            Self::BootstrapAuthorityInUse => write!(
                formatter,
                "this installation guard already owns a pending credential bootstrap"
            ),
        }
    }
}

impl std::error::Error for CredentialError {}

impl From<std::io::Error> for CredentialError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

/// Product-derived dashboard credential store. It exposes no arbitrary-path
/// constructor and no worker-IPC creator.
#[derive(Debug, Clone)]
pub struct DashboardCredentialStore {
    pub(crate) paths: ProductPaths,
}

impl DashboardCredentialStore {
    /// Bind dashboard credential authority to product-derived paths.
    #[must_use]
    pub fn for_product(paths: &ProductPaths) -> Self {
        Self {
            paths: paths.clone(),
        }
    }

    pub(crate) fn directory(&self) -> PathBuf {
        self.paths.credentials_dir()
    }

    pub(crate) fn path(&self, role: CredentialRole) -> PathBuf {
        self.directory().join(role.file_name())
    }

    pub(crate) fn open_directory_for_guard(
        &self,
        guard: &InstallLockGuard,
    ) -> Result<RetainedCredentialDirectory, CredentialError> {
        directory_for_product(&self.paths, Some(guard), false)
    }

    pub(crate) fn prepare_directory_for_guard(
        &self,
        guard: &InstallLockGuard,
    ) -> Result<RetainedCredentialDirectory, CredentialError> {
        directory_for_product(&self.paths, Some(guard), true)
    }

    /// Begin first-install credential creation under the retained installation
    /// guard and durable bootstrap descriptor.
    pub fn begin_bootstrap<'guard>(
        &self,
        guard: &'guard InstallLockGuard,
    ) -> Result<PendingDashboardCredentials<'guard>, CredentialError> {
        guard.verify_for_product(&self.paths).map_err(|_| {
            CredentialError::PlatformAuthorityUnavailable(
                "installation guard does not bind these product paths",
            )
        })?;
        let claim = guard
            .claim_pending_credentials()
            .map_err(|_| CredentialError::BootstrapAuthorityInUse)?;
        crate::bootstrap::begin(self, guard, claim)
    }

    /// Durably prepare bootstrap without creating either credential. Dropping
    /// the returned value preserves inert descriptor state for recovery.
    pub fn prepare_bootstrap<'guard>(
        &self,
        guard: &'guard InstallLockGuard,
    ) -> Result<crate::bootstrap::PreparedDashboardBootstrap<'guard>, CredentialError> {
        guard.verify_for_product(&self.paths).map_err(|_| {
            CredentialError::PlatformAuthorityUnavailable(
                "installation guard does not bind these product paths",
            )
        })?;
        let claim = guard
            .claim_pending_credentials()
            .map_err(|_| CredentialError::BootstrapAuthorityInUse)?;
        crate::bootstrap::prepare(self, guard, claim)
    }

    /// Read the product-owned attach-control credential through retained,
    /// bounded platform validation.
    pub fn read_attach_control(&self) -> Result<Credential, CredentialError> {
        let directory = directory_for_product(&self.paths, None, false)?;
        read_role_in(&directory, CredentialRole::AttachControl).map(|(_, credential)| credential)
    }

    /// Read ownership for non-mutating diagnostics. Mutations use
    /// [`Self::verify_ownership`] so authority remains bound to the install lock.
    pub fn read_ownership(&self) -> Result<Credential, CredentialError> {
        let directory = directory_for_product(&self.paths, None, false)?;
        read_role_in(&directory, CredentialRole::Ownership).map(|(_, credential)| credential)
    }

    /// Retain and validate ownership under the exact installation guard.
    pub fn verify_ownership<'guard>(
        &self,
        guard: &'guard InstallLockGuard,
    ) -> Result<VerifiedOwnershipCredential<'guard>, CredentialError> {
        guard.verify_for_product(&self.paths).map_err(|_| {
            CredentialError::PlatformAuthorityUnavailable(
                "installation guard does not bind these product paths",
            )
        })?;
        let directory = directory_for_product(&self.paths, Some(guard), false)?;
        let (file, credential) = read_role_in(&directory, CredentialRole::Ownership)?;
        Ok(VerifiedOwnershipCredential {
            credential,
            file,
            path: self.path(CredentialRole::Ownership),
            directory,
            _guard: guard,
        })
    }

    /// Non-secret discovery reference to the attach-control file.
    #[must_use]
    pub fn attach_control_reference(&self) -> PathBuf {
        self.path(CredentialRole::AttachControl)
    }
}

/// First-install proof retaining both exact credential files and the guard that
/// authorized their creation. It is intentionally non-cloneable.
#[derive(Debug)]
pub struct PendingDashboardCredentials<'guard> {
    #[allow(
        dead_code,
        reason = "retaining the coherent credentials directory is itself the authority invariant"
    )]
    pub(crate) directory: RetainedCredentialDirectory,
    pub(crate) ownership_file: RetainedCredentialFile,
    pub(crate) attach_file: RetainedCredentialFile,
    ownership: Credential,
    attach_control: Credential,
    #[allow(
        dead_code,
        reason = "retained until sealed first-install commit can retire the descriptor"
    )]
    pub(crate) descriptor: Option<crate::bootstrap::BootstrapDescriptorAuthority>,
    pub(crate) _claim: PendingCredentialsClaim<'guard>,
    pub(crate) _guard: &'guard InstallLockGuard,
}

impl<'guard> PendingDashboardCredentials<'guard> {
    #[allow(
        clippy::too_many_arguments,
        reason = "the private constructor must receive every distinct retained authority explicitly"
    )]
    pub(crate) fn new(
        guard: &'guard InstallLockGuard,
        directory: RetainedCredentialDirectory,
        ownership_file: RetainedCredentialFile,
        attach_file: RetainedCredentialFile,
        ownership: Credential,
        attach_control: Credential,
        descriptor: crate::bootstrap::BootstrapDescriptorAuthority,
        claim: PendingCredentialsClaim<'guard>,
    ) -> Self {
        Self {
            directory,
            ownership_file,
            attach_file,
            ownership,
            attach_control,
            descriptor: Some(descriptor),
            _claim: claim,
            _guard: guard,
        }
    }

    /// Re-prove both retained credential files at the moment a fact is derived
    /// from this proof's existence (D5 point-in-time).
    ///
    /// Holding the value says the files were private when it was created; this
    /// says they still are, and still have the exact identities recorded then.
    /// The activation boundary calls it before asserting that this install
    /// created ownership, so the claim rests on a re-observed fact rather than
    /// on the age of the value.
    #[allow(
        dead_code,
        reason = "sealed first-install substrate; Stage 3 wires it to the provisioning transaction"
    )]
    pub(crate) fn revalidate_retained(&self) -> Result<(), CredentialError> {
        for file in [&self.ownership_file, &self.attach_file] {
            platform::revalidate_retained_file(file).map_err(CredentialError::Io)?;
        }
        Ok(())
    }

    /// The credentials directory this proof retains, for scope assertions.
    pub(crate) fn credentials_directory(&self) -> &Path {
        self.directory.path()
    }

    /// Retained ownership credential.
    #[must_use]
    pub fn ownership(&self) -> &Credential {
        &self.ownership
    }

    /// Retained attach-control credential.
    #[must_use]
    pub fn attach_control(&self) -> &Credential {
        &self.attach_control
    }

    /// Exact observed identities persisted by the bootstrap descriptor.
    #[must_use]
    pub fn identities(&self) -> (&FileIdentity, &FileIdentity) {
        (self.ownership_file.identity(), self.attach_file.identity())
    }

    #[allow(
        dead_code,
        reason = "sealed first-install publication remains typed unavailable"
    )]
    #[allow(
        clippy::result_large_err,
        reason = "failure returns every exact non-cloneable authority needed for retry"
    )]
    pub(crate) fn retire_descriptor(
        mut self,
    ) -> Result<(), PendingDescriptorRetirementError<'guard>> {
        let Some(descriptor) = self.descriptor.take() else {
            return Err(PendingDescriptorRetirementError {
                pending: self,
                phase: platform::RetirementPhase::ParentSyncPending,
                source: std::io::Error::other("pending credentials lost descriptor authority"),
            });
        };
        match descriptor.retire() {
            Ok(()) => Ok(()),
            Err(failure) => {
                self.descriptor = Some(failure.authority);
                Err(PendingDescriptorRetirementError {
                    pending: self,
                    phase: failure.phase,
                    source: failure.source,
                })
            }
        }
    }
}

#[derive(Debug)]
#[allow(
    dead_code,
    reason = "sealed first-install publication remains typed unavailable"
)]
pub(crate) struct PendingDescriptorRetirementError<'guard> {
    pub(crate) pending: PendingDashboardCredentials<'guard>,
    pub(crate) phase: platform::RetirementPhase,
    pub(crate) source: std::io::Error,
}

/// Existing receipt-bound ownership retained under the installation guard.
#[derive(Debug)]
pub struct VerifiedOwnershipCredential<'guard> {
    credential: Credential,
    #[allow(dead_code)]
    file: RetainedCredentialFile,
    path: PathBuf,
    directory: RetainedCredentialDirectory,
    _guard: &'guard InstallLockGuard,
}

impl VerifiedOwnershipCredential<'_> {
    /// The validated ownership credential used by the control protocol.
    #[must_use]
    pub fn credential(&self) -> &Credential {
        &self.credential
    }

    pub(crate) const fn guard(&self) -> &InstallLockGuard {
        self._guard
    }

    pub(crate) fn verifies_for_product(&self, paths: &ProductPaths) -> bool {
        if self._guard.verify_for_product(paths).is_err()
            || self.path
                != paths
                    .credentials_dir()
                    .join(CredentialRole::Ownership.file_name())
        {
            return false;
        }
        platform::revalidate_named(
            &self.directory,
            std::ffi::OsStr::new(CredentialRole::Ownership.file_name()),
            &self.file,
            self.credential.secret().as_bytes(),
        )
        .is_ok()
    }
}

/// Creation-free reader for a compatible foreign gateway's handoff reference.
#[derive(Debug, Default, Clone, Copy)]
pub struct ForeignHandoffReader;

impl ForeignHandoffReader {
    /// Retain, validate, and bounded-read one foreign attach-control file. This
    /// operation cannot create, replace, repair, or remove the referenced path.
    pub fn read(path: &Path) -> Result<Credential, CredentialError> {
        read_role(path, CredentialRole::AttachControl).map(|(_, credential)| credential)
    }
}

pub(crate) fn create_role(
    directory: &RetainedCredentialDirectory,
    role: CredentialRole,
    secret: &str,
) -> Result<(RetainedCredentialFile, Credential), CredentialError> {
    validate_token(secret).map_err(|reason| CredentialError::Invalid { role, reason })?;
    let file = platform::create_in(directory, role.file_name(), secret.as_bytes())?;
    Ok((
        file,
        Credential {
            role,
            secret: secret.to_owned(),
        },
    ))
}

pub(crate) fn read_role(
    path: &Path,
    role: CredentialRole,
) -> Result<(RetainedCredentialFile, Credential), CredentialError> {
    let (file, bytes) = match platform::open_and_read(path) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Err(CredentialError::Missing(role));
        }
        Err(error) => return Err(CredentialError::Io(error)),
    };
    let secret = std::str::from_utf8(&bytes)
        .map_err(|_| CredentialError::Invalid {
            role,
            reason: "token is not UTF-8",
        })?
        .to_owned();
    validate_token(&secret).map_err(|reason| CredentialError::Invalid { role, reason })?;
    Ok((file, Credential { role, secret }))
}

fn directory_for_product(
    paths: &ProductPaths,
    guard: Option<&InstallLockGuard>,
    create: bool,
) -> Result<RetainedCredentialDirectory, CredentialError> {
    let root = match guard {
        Some(guard) => guard.retained_product_root(paths).map_err(|_| {
            CredentialError::PlatformAuthorityUnavailable(
                "installation guard cannot retain the exact product root",
            )
        })?,
        None => platform::retain_product_root(paths.root())?,
    };
    let result = if create {
        platform::prepare_directory_authority(root, paths.root())
    } else {
        platform::open_directory_authority(root, paths.root())
    };
    result.map_err(CredentialError::Io)
}

pub(crate) fn read_role_in(
    directory: &RetainedCredentialDirectory,
    role: CredentialRole,
) -> Result<(RetainedCredentialFile, Credential), CredentialError> {
    let (file, bytes) = match platform::open_private_in(
        directory,
        std::ffi::OsStr::new(role.file_name()),
        TOKEN_BYTES,
    ) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Err(CredentialError::Missing(role));
        }
        Err(error) => return Err(CredentialError::Io(error)),
    };
    let secret = std::str::from_utf8(&bytes)
        .map_err(|_| CredentialError::Invalid {
            role,
            reason: "token is not UTF-8",
        })?
        .to_owned();
    validate_token(&secret).map_err(|reason| CredentialError::Invalid { role, reason })?;
    Ok((file, Credential::from_validated(role, secret)))
}

pub(crate) fn validate_token(token: &str) -> Result<(), &'static str> {
    if token.len() != TOKEN_BYTES {
        return Err("token must contain exactly 64 bytes");
    }
    if !token
        .bytes()
        .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err("token must use lowercase hexadecimal only");
    }
    Ok(())
}

pub(crate) fn random_token() -> std::io::Result<String> {
    let mut bytes = [0_u8; 32];
    getrandom::fill(&mut bytes)
        .map_err(|error| std::io::Error::other(format!("OS CSPRNG unavailable: {error}")))?;
    // 32 CSPRNG bytes encode to exactly the TOKEN_BYTES-long lowercase-hex form
    // `validate_token` requires.
    Ok(crate::hex::encode(&bytes))
}

/// Compatibility helper for existing non-credential owner-private files. New
/// credential creation never uses write-then-restrict.
pub(crate) fn restrict_to_owner(path: &Path) -> std::io::Result<()> {
    platform::restrict_existing(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn token_grammar_is_exact() {
        assert!(validate_token(&"a".repeat(TOKEN_BYTES)).is_ok());
        for invalid in [
            "a".repeat(TOKEN_BYTES - 1),
            "a".repeat(TOKEN_BYTES + 1),
            format!("{}A", "a".repeat(TOKEN_BYTES - 1)),
            format!("{}\n", "a".repeat(TOKEN_BYTES - 1)),
        ] {
            assert!(validate_token(&invalid).is_err(), "accepted {invalid:?}");
        }
    }

    #[test]
    fn debug_redacts_secret() {
        let credential = Credential {
            role: CredentialRole::Ownership,
            secret: "super-secret".to_owned(),
        };
        let debug = format!("{credential:?}");
        assert!(!debug.contains("super-secret"));
        assert!(debug.contains("redacted"));
    }
}
