//! Durable dashboard credential bootstrap transaction (W01.P01.S175).
//!
//! The descriptor is published before either secret file and contains only
//! token digests. A settled active receipt remains the later authorization
//! commit point; descriptor or credential residue alone is inert.

#![allow(
    clippy::result_large_err,
    reason = "failure must preserve the complete non-cloneable descriptor authority for retry"
)]

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::credentials::read_role_in;
use crate::credentials::{
    CredentialError, CredentialRole, DashboardCredentialStore, FileIdentity,
    PendingDashboardCredentials, RetainedCredentialDirectory, RetainedCredentialFile, create_role,
    platform,
};
use crate::locking::InstallLockGuard;
use crate::locking::PendingCredentialsClaim;

const DESCRIPTOR_NAME: &str = "bootstrap-credentials.v1";
const DESCRIPTOR_VERSION: u8 = 1;
const MAX_DESCRIPTOR_BYTES: usize = 4096;

/// Bounded, non-authorizing recovery classification for an interrupted
/// bootstrap. Cleanup remains an explicit later transaction action.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BootstrapRecoveryState {
    /// A retained descriptor already exists; use the full recovery entrypoint.
    ExistingDescriptor,
    /// Descriptor is durable and neither credential was published.
    PreparedEmpty,
    /// Only ownership matches its descriptor digest.
    PreparedOwnershipOnly,
    /// Only attach-control matches its descriptor digest.
    PreparedAttachOnly,
    /// Both credentials match but the durable phase is still prepared.
    PreparedBoth,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum Phase {
    Prepared,
    CredentialsCreated,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Descriptor {
    version: u8,
    phase: Phase,
    ownership_sha256: String,
    attach_control_sha256: String,
    ownership_identity: Option<FileIdentity>,
    attach_control_identity: Option<FileIdentity>,
}

/// Durable pre-credential bootstrap state. Debug output omits the two secrets.
pub struct PreparedDashboardBootstrap<'guard> {
    descriptor: Descriptor,
    descriptor_authority: BootstrapDescriptorAuthority,
    directory: RetainedCredentialDirectory,
    ownership_secret: String,
    attach_secret: String,
    guard: &'guard InstallLockGuard,
    claim: PendingCredentialsClaim<'guard>,
}

impl std::fmt::Debug for PreparedDashboardBootstrap<'_> {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("PreparedDashboardBootstrap")
            .field("descriptor", &"<retained>")
            .field("secrets", &"<redacted>")
            .finish()
    }
}

impl<'guard> PreparedDashboardBootstrap<'guard> {
    /// Create and retain both final credential files, then durably advance the
    /// descriptor to its exact credential identities.
    pub fn create(mut self) -> Result<PendingDashboardCredentials<'guard>, CredentialError> {
        let (ownership_file, ownership) = create_role(
            &self.directory,
            CredentialRole::Ownership,
            &self.ownership_secret,
        )?;
        let (attach_file, attach_control) = create_role(
            &self.directory,
            CredentialRole::AttachControl,
            &self.attach_secret,
        )?;
        self.descriptor.phase = Phase::CredentialsCreated;
        self.descriptor.ownership_identity = Some(*ownership_file.identity());
        self.descriptor.attach_control_identity = Some(*attach_file.identity());
        let descriptor_file = self
            .descriptor_authority
            .retirement
            .named_file_mut()
            .ok_or_else(|| std::io::Error::other("bootstrap descriptor is already unlinked"))?;
        rewrite_descriptor(descriptor_file, &self.descriptor)?;
        Ok(PendingDashboardCredentials::new(
            self.guard,
            self.directory,
            ownership_file,
            attach_file,
            ownership,
            attach_control,
            self.descriptor_authority,
            self.claim,
        ))
    }
}

/// Retained descriptor authority carried with pending credentials. It is not
/// cloneable and exposes no descriptor pathname or writable handle.
#[derive(Debug)]
pub struct BootstrapDescriptorAuthority {
    retirement: platform::RetainedRetirementAuthority,
}

impl BootstrapDescriptorAuthority {
    pub(crate) fn retire(self) -> Result<(), BootstrapDescriptorRetirementError> {
        self.retirement
            .retry()
            .map_err(|failure| BootstrapDescriptorRetirementError {
                authority: Self {
                    retirement: failure.authority,
                },
                phase: failure.phase,
                source: failure.source,
            })
    }
}

#[derive(Debug)]
pub(crate) struct BootstrapDescriptorRetirementError {
    pub(crate) authority: BootstrapDescriptorAuthority,
    pub(crate) phase: platform::RetirementPhase,
    pub(crate) source: std::io::Error,
}

pub(crate) fn begin<'guard>(
    store: &DashboardCredentialStore,
    guard: &'guard InstallLockGuard,
    claim: PendingCredentialsClaim<'guard>,
) -> Result<PendingDashboardCredentials<'guard>, CredentialError> {
    let directory_authority = match store.open_directory_for_guard(guard) {
        Ok(directory) => directory,
        Err(CredentialError::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => {
            return prepare(store, guard, claim)?.create();
        }
        Err(error) => return Err(error),
    };
    let descriptor_path = store.directory().join(DESCRIPTOR_NAME);
    require_no_settled_receipt(store, guard)?;

    match open_descriptor(&directory_authority) {
        Ok((file, descriptor)) => {
            return recover(
                guard,
                claim,
                directory_authority,
                &descriptor_path,
                file,
                descriptor,
            );
        }
        Err(CredentialError::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error),
    }
    prepare(store, guard, claim)?.create()
}

pub(crate) fn prepare<'guard>(
    store: &DashboardCredentialStore,
    guard: &'guard InstallLockGuard,
    claim: PendingCredentialsClaim<'guard>,
) -> Result<PreparedDashboardBootstrap<'guard>, CredentialError> {
    let directory_authority = store.prepare_directory_for_guard(guard)?;
    require_no_settled_receipt(store, guard)?;
    match open_descriptor(&directory_authority) {
        Ok(_) => {
            return Err(CredentialError::RecoveryRequired(
                BootstrapRecoveryState::ExistingDescriptor,
            ));
        }
        Err(CredentialError::Io(error)) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error),
    }
    for role in [CredentialRole::Ownership, CredentialRole::AttachControl] {
        if platform::entry_exists(&directory_authority, std::ffi::OsStr::new(role.file_name()))? {
            return Err(CredentialError::AlreadyExists(role));
        }
    }
    let ownership_secret = crate::credentials::random_token()?;
    let attach_secret = crate::credentials::random_token()?;
    let descriptor = Descriptor {
        version: DESCRIPTOR_VERSION,
        phase: Phase::Prepared,
        ownership_sha256: digest(&ownership_secret),
        attach_control_sha256: digest(&attach_secret),
        ownership_identity: None,
        attach_control_identity: None,
    };
    let descriptor_authority = create_descriptor(&directory_authority, &descriptor)?;
    Ok(PreparedDashboardBootstrap {
        descriptor,
        descriptor_authority,
        directory: directory_authority,
        ownership_secret,
        attach_secret,
        guard,
        claim,
    })
}

fn recover<'guard>(
    guard: &'guard InstallLockGuard,
    claim: PendingCredentialsClaim<'guard>,
    directory: RetainedCredentialDirectory,
    descriptor_path: &Path,
    file: RetainedCredentialFile,
    descriptor: Descriptor,
) -> Result<PendingDashboardCredentials<'guard>, CredentialError> {
    if descriptor.version != DESCRIPTOR_VERSION {
        return Err(CredentialError::PlatformAuthorityUnavailable(
            "bootstrap descriptor version is unsupported",
        ));
    }
    if descriptor.phase == Phase::Prepared {
        let ownership = optional_matching_role(
            &directory,
            CredentialRole::Ownership,
            &descriptor.ownership_sha256,
        )?;
        let attach = optional_matching_role(
            &directory,
            CredentialRole::AttachControl,
            &descriptor.attach_control_sha256,
        )?;
        match (ownership, attach) {
            (None, None) => {
                return Err(CredentialError::RecoveryRequired(
                    BootstrapRecoveryState::PreparedEmpty,
                ));
            }
            (Some(_), None) => {
                return Err(CredentialError::RecoveryRequired(
                    BootstrapRecoveryState::PreparedOwnershipOnly,
                ));
            }
            (None, Some(_)) => {
                return Err(CredentialError::RecoveryRequired(
                    BootstrapRecoveryState::PreparedAttachOnly,
                ));
            }
            (Some((_ownership_file, _ownership)), Some((_attach_file, _attach_control))) => {
                return Err(CredentialError::RecoveryRequired(
                    BootstrapRecoveryState::PreparedBoth,
                ));
            }
        }
    }
    let (ownership_file, ownership) = read_role_in(&directory, CredentialRole::Ownership)?;
    let (attach_file, attach_control) = read_role_in(&directory, CredentialRole::AttachControl)?;
    if digest(ownership.secret()) != descriptor.ownership_sha256
        || digest(attach_control.secret()) != descriptor.attach_control_sha256
        || descriptor.ownership_identity.as_ref() != Some(ownership_file.identity())
        || descriptor.attach_control_identity.as_ref() != Some(attach_file.identity())
    {
        return Err(CredentialError::Invalid {
            role: CredentialRole::Ownership,
            reason: "bootstrap descriptor does not bind the retained credential pair",
        });
    }
    Ok(PendingDashboardCredentials::new(
        guard,
        directory,
        ownership_file,
        attach_file,
        ownership,
        attach_control,
        descriptor_authority(file, descriptor_path)?,
        claim,
    ))
}

fn optional_matching_role(
    directory: &RetainedCredentialDirectory,
    role: CredentialRole,
    expected_digest: &str,
) -> Result<Option<(RetainedCredentialFile, crate::credentials::Credential)>, CredentialError> {
    match read_role_in(directory, role) {
        Ok((file, credential)) if digest(credential.secret()) == expected_digest => {
            Ok(Some((file, credential)))
        }
        Ok(_) => Err(CredentialError::Invalid {
            role,
            reason: "credential residue does not match the durable descriptor digest",
        }),
        Err(CredentialError::Missing(_)) => Ok(None),
        Err(error) => Err(error),
    }
}

fn require_no_settled_receipt(
    store: &DashboardCredentialStore,
    guard: &InstallLockGuard,
) -> Result<(), CredentialError> {
    use crate::receipt::ActiveReceiptReadState;
    let read = crate::receipt::read_active_receipt_journal(&store.paths, guard).map_err(|_| {
        CredentialError::PlatformAuthorityUnavailable(
            "fixed receipt state cannot be classified for bootstrap recovery",
        )
    })?;
    if matches!(read.state(), Ok(&ActiveReceiptReadState::Absent)) {
        Ok(())
    } else {
        Err(CredentialError::PlatformAuthorityUnavailable(
            "dashboard credential bootstrap requires an absent fixed receipt",
        ))
    }
}

fn create_descriptor(
    directory: &RetainedCredentialDirectory,
    descriptor: &Descriptor,
) -> Result<BootstrapDescriptorAuthority, CredentialError> {
    let bytes = encode_descriptor(descriptor)?;
    let file = platform::create_in(directory, DESCRIPTOR_NAME, &bytes)?;
    descriptor_authority(file, &directory.path().join(DESCRIPTOR_NAME))
}

fn descriptor_authority(
    file: RetainedCredentialFile,
    path: &Path,
) -> Result<BootstrapDescriptorAuthority, CredentialError> {
    let directory = path
        .parent()
        .ok_or_else(|| std::io::Error::other("descriptor path has no parent"))?;
    Ok(BootstrapDescriptorAuthority {
        retirement: platform::RetainedRetirementAuthority::named(file, directory, DESCRIPTOR_NAME)?,
    })
}

fn open_descriptor(
    directory: &RetainedCredentialDirectory,
) -> Result<(RetainedCredentialFile, Descriptor), CredentialError> {
    // Recovery authority: the descriptor is durably rewritten (phase advance)
    // and exact-retired, so it needs a writable, retire-capable handle — not a
    // read-only one (on Windows the two are distinct D9 authorities).
    let (file, bytes) = platform::open_recovery_in(
        directory,
        std::ffi::OsStr::new(DESCRIPTOR_NAME),
        MAX_DESCRIPTOR_BYTES,
    )?;
    let descriptor = serde_json::from_slice(&bytes).map_err(|_| CredentialError::Invalid {
        role: CredentialRole::Ownership,
        reason: "bootstrap descriptor grammar is invalid",
    })?;
    validate_descriptor(&descriptor)?;
    Ok((file, descriptor))
}

fn validate_descriptor(descriptor: &Descriptor) -> Result<(), CredentialError> {
    if descriptor.version != DESCRIPTOR_VERSION
        || crate::credentials::validate_token(&descriptor.ownership_sha256).is_err()
        || crate::credentials::validate_token(&descriptor.attach_control_sha256).is_err()
    {
        return Err(CredentialError::Invalid {
            role: CredentialRole::Ownership,
            reason: "bootstrap descriptor fields are invalid",
        });
    }
    let identities_match_phase = match descriptor.phase {
        Phase::Prepared => {
            descriptor.ownership_identity.is_none() && descriptor.attach_control_identity.is_none()
        }
        Phase::CredentialsCreated => {
            descriptor.ownership_identity.is_some() && descriptor.attach_control_identity.is_some()
        }
    };
    if !identities_match_phase {
        return Err(CredentialError::Invalid {
            role: CredentialRole::Ownership,
            reason: "bootstrap descriptor phase and identities disagree",
        });
    }
    Ok(())
}

fn rewrite_descriptor(
    file: &mut RetainedCredentialFile,
    descriptor: &Descriptor,
) -> std::io::Result<()> {
    let bytes = encode_descriptor(descriptor)?;
    file.rewrite(&bytes, MAX_DESCRIPTOR_BYTES)
}

fn encode_descriptor(descriptor: &Descriptor) -> std::io::Result<Vec<u8>> {
    let bytes = serde_json::to_vec(descriptor)
        .map_err(|error| std::io::Error::other(format!("descriptor encode failed: {error}")))?;
    if bytes.len() > MAX_DESCRIPTOR_BYTES {
        return Err(std::io::Error::other("bootstrap descriptor exceeds bound"));
    }
    Ok(bytes)
}

fn digest(secret: &str) -> String {
    crate::hex::sha256(secret.as_bytes())
}
