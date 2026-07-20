//! Adapter-gated release preparation and bounded active-release observation (S176).
//!
//! A settled fixed receipt is useful only as non-authorizing active-release
//! observation and as a future update baseline. It is not install provenance.
//! Existing-update and first-install preparation therefore remain typed-unavailable
//! until a product-owned adapter can supply opaque provenance authority.

use std::convert::Infallible;

use crate::locking::InstallLockGuard;
use crate::manifest::Target;
use crate::paths::ProductPaths;
use crate::receipt::{
    ActiveReceipt, ActiveReceiptJournalError, ActiveReceiptRead, ActiveReceiptReadState,
    ActiveReceiptRecoveryKind, read_active_receipt_journal,
};

/// Non-authorizing facts derived from one settled fixed receipt.
#[derive(Clone, PartialEq, Eq)]
pub struct ProvisionedRelease {
    release_set_identity: String,
    target: Target,
    a2a_identity: crate::manifest::ReleaseIdentity,
    active_generation: String,
    bootstrap_created_ownership: bool,
}

impl ProvisionedRelease {
    fn from_receipt(receipt: &ActiveReceipt) -> Self {
        Self {
            release_set_identity: receipt.release_set_identity().to_owned(),
            target: receipt.target(),
            a2a_identity: receipt.a2a_identity().clone(),
            active_generation: receipt.active_generation().to_owned(),
            bootstrap_created_ownership: receipt.bootstrap_created_ownership(),
        }
    }

    #[must_use]
    pub fn release_set_id(&self) -> &str {
        &self.release_set_identity
    }

    #[must_use]
    pub const fn target(&self) -> Target {
        self.target
    }

    #[must_use]
    pub fn a2a_identity(&self) -> &crate::manifest::ReleaseIdentity {
        &self.a2a_identity
    }

    #[must_use]
    pub fn active_generation(&self) -> &str {
        &self.active_generation
    }

    #[must_use]
    pub const fn bootstrap_created_ownership(&self) -> bool {
        self.bootstrap_created_ownership
    }
}

impl std::fmt::Debug for ProvisionedRelease {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("ProvisionedRelease")
            .field("release_set_id", &self.release_set_identity)
            .field("target", &self.target)
            .finish_non_exhaustive()
    }
}

/// Public state of one retained, guard-bound fixed-receipt observation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ActiveReleaseState {
    Absent,
    Settled(ProvisionedRelease),
    RecoveryRequired(ActiveReleaseRecovery),
}

/// Bounded non-authorizing recovery observation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActiveReleaseRecovery {
    kind: ActiveReleaseRecoveryKind,
    prior: Option<ProvisionedRelease>,
}

/// Public closed recovery classification; it carries no writable authority.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActiveReleaseRecoveryKind {
    ProofCreation,
    ActiveProof,
    ProofRetirement,
}

impl ActiveReleaseRecovery {
    #[must_use]
    pub const fn kind(&self) -> ActiveReleaseRecoveryKind {
        self.kind
    }

    #[must_use]
    pub fn prior(&self) -> Option<&ProvisionedRelease> {
        self.prior.as_ref()
    }
}

/// Retained fixed-journal observation tied to the exact installation guard.
pub struct ActiveReleaseObservation<'guard> {
    read: ActiveReceiptRead<'guard>,
}

impl std::fmt::Debug for ActiveReleaseObservation<'_> {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("ActiveReleaseObservation")
            .finish_non_exhaustive()
    }
}

impl ActiveReleaseObservation<'_> {
    /// Project the retained journal into bounded, non-authorizing state.
    pub fn state(&self) -> Result<ActiveReleaseState, ProvisioningError> {
        let state = self.read.state().map_err(map_journal_read_error)?;
        Ok(match state {
            ActiveReceiptReadState::Absent => ActiveReleaseState::Absent,
            ActiveReceiptReadState::Settled(receipt) => {
                ActiveReleaseState::Settled(ProvisionedRelease::from_receipt(receipt))
            }
            ActiveReceiptReadState::RecoveryRequired(recovery) => {
                let kind = match recovery.kind() {
                    ActiveReceiptRecoveryKind::ProofCreation => {
                        ActiveReleaseRecoveryKind::ProofCreation
                    }
                    ActiveReceiptRecoveryKind::ActiveProof => {
                        ActiveReleaseRecoveryKind::ActiveProof
                    }
                    ActiveReceiptRecoveryKind::ProofRetirement => {
                        ActiveReleaseRecoveryKind::ProofRetirement
                    }
                };
                ActiveReleaseState::RecoveryRequired(ActiveReleaseRecovery {
                    kind,
                    prior: recovery.prior().map(ProvisionedRelease::from_receipt),
                })
            }
        })
    }
}

/// Read fixed active-release state without exposing receipt or journal authority.
pub fn observe_active_release<'guard>(
    paths: &ProductPaths,
    guard: &'guard InstallLockGuard,
) -> Result<ActiveReleaseObservation<'guard>, ProvisioningError> {
    let read = read_active_receipt_journal(paths, guard).map_err(map_journal_read_error)?;
    Ok(ActiveReleaseObservation { read })
}

/// Refuse existing-update preparation until an opaque update-adapter authority exists.
///
/// `Infallible` makes the absence of a successful preparation value part of the
/// public type. In particular, a settled receipt cannot manufacture adapter
/// provenance or choose an install channel.
pub fn prepare_existing_update(
    paths: &ProductPaths,
    guard: &InstallLockGuard,
) -> Result<Infallible, ProvisioningError> {
    verify_guard(paths, guard)?;
    Err(ProvisioningError::new(
        ProvisioningErrorKind::AdapterUnavailable,
        "existing update requires sealed adapter provenance and descriptor validation",
    ))
}

/// Refuse first-install preparation until an opaque install-adapter authority exists.
///
/// No receipt, actor label, channel enum, or caller-provided path can substitute
/// for that future authority.
pub fn prepare_first_install(
    paths: &ProductPaths,
    guard: &InstallLockGuard,
) -> Result<Infallible, ProvisioningError> {
    verify_guard(paths, guard)?;
    Err(ProvisioningError::new(
        ProvisioningErrorKind::FirstInstallAdapterUnavailable,
        "first install requires sealed adapter provenance and descriptor validation",
    ))
}

fn verify_guard(paths: &ProductPaths, guard: &InstallLockGuard) -> Result<(), ProvisioningError> {
    guard
        .verify_for_product(paths)
        .map_err(|_| ProvisioningError::authority("installation guard rejected product scope"))
}

fn map_journal_read_error(error: ActiveReceiptJournalError) -> ProvisioningError {
    match error {
        ActiveReceiptJournalError::LockAuthority(_) | ActiveReceiptJournalError::Io { .. } => {
            ProvisioningError::authority("fixed receipt authority observation failed")
        }
        error @ ActiveReceiptJournalError::Mutation { .. } => ProvisioningError {
            kind: ProvisioningErrorKind::Indeterminate,
            message: "fixed receipt mutation authority requires explicit recovery",
            retained_journal: Some(Box::new(error)),
        },
        ActiveReceiptJournalError::Invalid(_) | ActiveReceiptJournalError::Ambiguous(_) => {
            ProvisioningError::new(
                ProvisioningErrorKind::RecoveryRequired,
                "fixed receipt state requires recovery",
            )
        }
    }
}

/// Stable diagnostic class for provisioning and observation failures.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProvisioningErrorKind {
    AdapterUnavailable,
    FirstInstallAdapterUnavailable,
    RecoveryRequired,
    Indeterminate,
}

/// Non-authorizing provisioning diagnostic.
pub struct ProvisioningError {
    kind: ProvisioningErrorKind,
    message: &'static str,
    retained_journal: Option<Box<ActiveReceiptJournalError>>,
}

impl std::fmt::Debug for ProvisioningError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("ProvisioningError")
            .field("kind", &self.kind)
            .field("message", &self.message)
            .field(
                "retains_journal_authority",
                &self.retained_journal.is_some(),
            )
            .finish_non_exhaustive()
    }
}

impl ProvisioningError {
    const fn new(kind: ProvisioningErrorKind, message: &'static str) -> Self {
        Self {
            kind,
            message,
            retained_journal: None,
        }
    }

    const fn authority(message: &'static str) -> Self {
        Self::new(ProvisioningErrorKind::Indeterminate, message)
    }

    #[must_use]
    pub const fn kind(&self) -> ProvisioningErrorKind {
        self.kind
    }

    #[must_use]
    pub fn retains_journal_authority(&self) -> bool {
        self.retained_journal.is_some()
    }
}

impl std::fmt::Display for ProvisioningError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "sealed provisioning {:?}: {}",
            self.kind, self.message
        )
    }
}

impl std::error::Error for ProvisioningError {}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generation::LockedProduct;
    use crate::manifest::tests::Fixture;
    use crate::receipt::publish_active_receipt;

    #[test]
    fn absent_product_exposes_observation_but_both_preparation_paths_are_typed_gates() {
        let fixture = Fixture::new();

        let observation = observe_active_release(&fixture.paths, &fixture.guard).unwrap();
        assert_eq!(observation.state().unwrap(), ActiveReleaseState::Absent);

        let existing = prepare_existing_update(&fixture.paths, &fixture.guard).unwrap_err();
        assert_eq!(existing.kind(), ProvisioningErrorKind::AdapterUnavailable);

        let first = prepare_first_install(&fixture.paths, &fixture.guard).unwrap_err();
        assert_eq!(
            first.kind(),
            ProvisioningErrorKind::FirstInstallAdapterUnavailable
        );
    }

    #[test]
    fn settled_fixed_receipt_is_observable_but_cannot_authorize_an_existing_update() {
        let fixture = Fixture::new();
        let mut product = LockedProduct::bind(fixture.paths.clone(), &fixture.guard).unwrap();
        let mut generation = product.create_unpublished("generation-1").unwrap();
        fixture.populate(generation.path());
        let verified = fixture.verify(&mut generation).unwrap();
        drop(publish_active_receipt(verified).unwrap());

        let observation = observe_active_release(&fixture.paths, &fixture.guard).unwrap();
        assert!(matches!(
            observation.state().unwrap(),
            ActiveReleaseState::Settled(_)
        ));

        let error = prepare_existing_update(&fixture.paths, &fixture.guard).unwrap_err();
        assert_eq!(error.kind(), ProvisioningErrorKind::AdapterUnavailable);
    }

    #[test]
    fn observation_and_preparation_refuse_a_guard_from_another_product_root() {
        let fixture = Fixture::new();
        let other = Fixture::new();

        let observation = observe_active_release(&fixture.paths, &other.guard).unwrap_err();
        assert_eq!(observation.kind(), ProvisioningErrorKind::Indeterminate);

        let existing = prepare_existing_update(&fixture.paths, &other.guard).unwrap_err();
        assert_eq!(existing.kind(), ProvisioningErrorKind::Indeterminate);

        let first = prepare_first_install(&fixture.paths, &other.guard).unwrap_err();
        assert_eq!(first.kind(), ProvisioningErrorKind::Indeterminate);
    }
}
