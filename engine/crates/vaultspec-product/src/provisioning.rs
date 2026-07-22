//! Adapter-gated release preparation and bounded active-release observation (S176).
//!
//! A settled fixed receipt is useful only as non-authorizing active-release
//! observation and as a future update baseline. It is not install provenance.
//! Existing-update and first-install preparation therefore remain typed-unavailable
//! until a product-owned adapter can supply opaque provenance authority.

use std::convert::Infallible;

use crate::channels::InstallProvenanceAuthority;
use crate::locking::InstallLockGuard;
use crate::manifest::Target;
use crate::paths::ProductPaths;
use crate::receipt::{
    ActiveReceipt, ActiveReceiptJournalError, ActiveReceiptRead, ActiveReceiptReadState,
    ActiveReceiptRecoveryKind, read_active_receipt_journal,
};
use vaultspec_distribution_authority::MaterializationSource;

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

/// One sealed first-install transaction bound to an exact product root, the
/// installation guard that authorized it, and opaque channel provenance.
///
/// The value is non-`Clone` and non-serializable, and it derives every path it
/// touches from [`ProductPaths`] - there is deliberately NO path operand, so a
/// caller cannot aim the transaction at a tree the guard does not cover. The
/// guard is verified against the product scope at [`begin`](Self::begin), before
/// any authority is created.
pub struct ProvisioningTransaction<'guard> {
    paths: ProductPaths,
    guard: &'guard InstallLockGuard,
    provenance: InstallProvenanceAuthority,
}

impl std::fmt::Debug for ProvisioningTransaction<'_> {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("ProvisioningTransaction")
            .finish_non_exhaustive()
    }
}

impl<'guard> ProvisioningTransaction<'guard> {
    /// Bind a first-install transaction for the self-install channel.
    ///
    /// The public door. Provenance is MINTED here from the product-owned channel
    /// adapter rather than accepted as a parameter, because
    /// `InstallProvenanceAuthority` is crate-sealed - only a channel adapter may
    /// mint it, and letting it cross the crate boundary as an argument would
    /// hand callers the very authority that seal exists to withhold.
    pub fn begin_self_install(
        paths: &ProductPaths,
        guard: &'guard InstallLockGuard,
        channel: &crate::channels::self_install::SelfInstallAuthority,
    ) -> Result<Self, ProvisioningError> {
        Self::begin(paths, guard, channel.provenance())
    }

    /// Bind a first-install transaction to this product root and guard.
    pub(crate) fn begin(
        paths: &ProductPaths,
        guard: &'guard InstallLockGuard,
        provenance: InstallProvenanceAuthority,
    ) -> Result<Self, ProvisioningError> {
        verify_guard(paths, guard)?;
        Ok(Self {
            paths: paths.clone(),
            guard,
            provenance,
        })
    }

    /// Establish first-install credentials and commit the verified release.
    ///
    /// Ordering is the contract, not an implementation detail. Credential
    /// bootstrap runs FIRST - descriptor before secrets, which `begin_bootstrap`
    /// sequences internally - so an interruption anywhere after this point
    /// leaves durable descriptor state that recovery can classify. Verification
    /// then derives the bootstrap-ownership fact from that live proof rather
    /// than from a flag (D6). Only once `publish_active_receipt` returns -
    /// having synchronized, closed, reopened, and re-read the journal to confirm
    /// the exact intended receipt settled - is the descriptor retired, which is
    /// what disarms recovery. Retiring it earlier would disarm recovery for a
    /// receipt that had not settled.
    ///
    /// On failure the returned value RETAINS the pending credential authority so
    /// a bounded retry or an authorized cleanup can still reach it; dropping it
    /// on the floor is what would strand durable bootstrap residue.
    pub fn prepare_first_install(
        self,
        generation: &mut crate::generation::UnpublishedGeneration<'_, '_>,
        source: &mut MaterializationSource<'_>,
        created_ms: i64,
    ) -> Result<ProvisionedRelease, Box<FirstInstallFailure<'guard>>> {
        // Copy the verified facts out of the opaque capability, exactly as the
        // materializer does, then run the same sealed drive.
        let feed = FirstInstallFeed {
            release_identity: source.release_identity().to_string(),
            target_triple: source.target().as_str().to_string(),
            member_manifest_sha256: source.member_manifest_sha256().to_string(),
            members: source
                .members()
                .iter()
                .map(|member| {
                    (
                        member.target.as_str().to_string(),
                        member.member_manifest_sha256.clone(),
                    )
                })
                .collect(),
            component_lock: source.component_lock().to_vec(),
            capsule_root: source.capsule_root().to_string(),
        };
        self.prepare_first_install_feed(generation, feed, created_ms)
    }

    /// The sealed first-install drive over verified facts.
    ///
    /// The public path derives this only from the opaque distribution
    /// capability; crate tests construct it from real fixture values without
    /// weakening that seal - the same arrangement `activate_update_feed` uses.
    pub(crate) fn prepare_first_install_feed(
        self,
        generation: &mut crate::generation::UnpublishedGeneration<'_, '_>,
        feed: FirstInstallFeed,
        created_ms: i64,
    ) -> Result<ProvisionedRelease, Box<FirstInstallFailure<'guard>>> {
        let FirstInstallFeed {
            release_identity,
            target_triple,
            member_manifest_sha256,
            members,
            component_lock,
            capsule_root,
        } = feed;

        let store = crate::credentials::DashboardCredentialStore::for_product(&self.paths);
        let pending = match store.begin_bootstrap(self.guard) {
            Ok(pending) => pending,
            Err(error) => {
                return Err(Box::new(FirstInstallFailure::without_credentials(
                    ProvisioningErrorKind::FirstInstallAdapterUnavailable,
                    "first-install credential bootstrap failed",
                    error.to_string(),
                )));
            }
        };

        // Tie the proof to THIS transaction's scope before deriving any fact from
        // it. Borrowing (rather than consuming) the proof leaves it usable for
        // more than one receipt, so nothing in the seam's signature guarantees
        // the credentials belong to the product this receipt describes. Assert
        // it: a proof from another scope must never be able to assert
        // first-install ownership into this one.
        if pending.credentials_directory() != self.paths.credentials_dir() {
            return Err(Box::new(FirstInstallFailure::retaining(
                pending,
                ProvisioningErrorKind::Indeterminate,
                "the first-install proof belongs to a different product scope",
                String::new(),
            )));
        }

        let target = match crate::materializer::triple_to_target(&target_triple) {
            Ok(target) => target,
            Err(detail) => {
                let detail = detail.to_string();
                return Err(Box::new(FirstInstallFailure::retaining(
                    pending,
                    ProvisioningErrorKind::FirstInstallAdapterUnavailable,
                    "the verified release names an unsupported target",
                    detail,
                )));
            }
        };
        let cohort_descriptor_bytes =
            match crate::materializer::synthesize_cohort_descriptor(&release_identity, &members) {
                Ok(bytes) => bytes,
                Err(detail) => {
                    let detail = detail.to_string();
                    return Err(Box::new(FirstInstallFailure::retaining(
                        pending,
                        ProvisioningErrorKind::FirstInstallAdapterUnavailable,
                        "the verified cohort could not be synthesized",
                        detail,
                    )));
                }
            };

        let verified = match crate::manifest::update_seam::verify_install_release(
            generation,
            crate::manifest::update_seam::InstallReleaseFacts {
                target,
                member_manifest_sha256,
                cohort_descriptor_bytes,
                component_lock_bytes: &component_lock,
                capsule_root,
                provenance: self.provenance,
                channel: crate::receipt::Channel::SelfInstall,
                pending: &pending,
                prior_seat: None,
                consistency_generation: 0,
                created_ms,
            },
        ) {
            Ok(verified) => verified,
            Err(error) => {
                return Err(Box::new(FirstInstallFailure::retaining(
                    pending,
                    ProvisioningErrorKind::FirstInstallAdapterUnavailable,
                    "first-install release verification failed",
                    error.to_string(),
                )));
            }
        };

        // THE commit. Its Ok is the settled proof: the publisher has already
        // synchronized, closed, reopened, and re-read the journal.
        let settled = match crate::receipt::publish_active_receipt(verified) {
            Ok(settled) => settled,
            Err(error) => {
                return Err(Box::new(FirstInstallFailure::retaining(
                    pending,
                    ProvisioningErrorKind::Indeterminate,
                    "the fixed receipt did not settle",
                    error.to_string(),
                )));
            }
        };
        drop(settled);

        // Only now: the receipt has settled, so retiring the descriptor cannot
        // disarm recovery for a claim the journal does not back.
        if let Err(failure) = pending.retire_descriptor() {
            return Err(Box::new(FirstInstallFailure::retaining(
                failure.pending,
                ProvisioningErrorKind::RecoveryRequired,
                "the receipt settled but bootstrap descriptor retirement did not",
                failure.source.to_string(),
            )));
        }

        // The summary is read back from the settled journal, never assembled
        // from the values this transaction happened to hold.
        let observation = match observe_active_release(&self.paths, self.guard) {
            Ok(observation) => observation,
            Err(error) => {
                return Err(Box::new(FirstInstallFailure::without_credentials(
                    ProvisioningErrorKind::Indeterminate,
                    "the receipt settled but could not be observed",
                    error.to_string(),
                )));
            }
        };
        match observation.state() {
            Ok(ActiveReleaseState::Settled(release)) => Ok(release),
            Ok(_) | Err(_) => Err(Box::new(FirstInstallFailure::without_credentials(
                ProvisioningErrorKind::Indeterminate,
                "the settled receipt did not read back as an active release",
                String::new(),
            ))),
        }
    }
}

/// Verified release facts driving one sealed first install.
///
/// Every field is copied from an already-verified distribution capability; no
/// caller-chosen digest participates, and the cohort descriptor is synthesized
/// from the verified members rather than accepted.
pub(crate) struct FirstInstallFeed {
    pub(crate) release_identity: String,
    pub(crate) target_triple: String,
    pub(crate) member_manifest_sha256: String,
    /// `(triple, member_manifest_sha256)` in canonical five-target order.
    pub(crate) members: Vec<(String, String)>,
    pub(crate) component_lock: Vec<u8>,
    pub(crate) capsule_root: String,
}

/// A failed first install that still holds every authority needed to retry or to
/// clean up under authorization.
pub struct FirstInstallFailure<'guard> {
    kind: ProvisioningErrorKind,
    message: &'static str,
    detail: String,
    retained: Option<crate::credentials::PendingDashboardCredentials<'guard>>,
}

impl std::fmt::Debug for FirstInstallFailure<'_> {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("FirstInstallFailure")
            .field("kind", &self.kind)
            .field("message", &self.message)
            .field("retains_credential_authority", &self.retained.is_some())
            .finish_non_exhaustive()
    }
}

impl<'guard> FirstInstallFailure<'guard> {
    fn retaining(
        pending: crate::credentials::PendingDashboardCredentials<'guard>,
        kind: ProvisioningErrorKind,
        message: &'static str,
        detail: String,
    ) -> Self {
        Self {
            kind,
            message,
            detail,
            retained: Some(pending),
        }
    }

    const fn without_credentials(
        kind: ProvisioningErrorKind,
        message: &'static str,
        detail: String,
    ) -> Self {
        Self {
            kind,
            message,
            detail,
            retained: None,
        }
    }

    #[must_use]
    pub const fn kind(&self) -> ProvisioningErrorKind {
        self.kind
    }

    /// Whether the pending credential authority survived the failure.
    #[must_use]
    pub const fn retains_credential_authority(&self) -> bool {
        self.retained.is_some()
    }

    /// Take back the retained pending authority for a bounded retry.
    #[must_use]
    pub fn into_retained(self) -> Option<crate::credentials::PendingDashboardCredentials<'guard>> {
        self.retained
    }
}

impl std::fmt::Display for FirstInstallFailure<'_> {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "sealed first install {:?}: {} ({})",
            self.kind, self.message, self.detail
        )
    }
}

impl std::error::Error for FirstInstallFailure<'_> {}

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
#[path = "provisioning/s11_chain.rs"]
mod s11_chain;

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

        // First install is no longer a typed gate: it is a sealed transaction,
        // and binding one to a guard that DOES cover this product succeeds.
        ProvisioningTransaction::begin(
            &fixture.paths,
            &fixture.guard,
            crate::channels::self_install::SelfInstallAuthority::new().provenance(),
        )
        .expect("a guard bound to this product root may begin a first install");
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

        // The transaction verifies the guard against the product scope BEFORE
        // creating any authority, so a foreign guard never reaches bootstrap.
        let first = ProvisioningTransaction::begin(
            &fixture.paths,
            &other.guard,
            crate::channels::self_install::SelfInstallAuthority::new().provenance(),
        )
        .expect_err("a guard from another product root must be refused");
        assert_eq!(first.kind(), ProvisioningErrorKind::Indeterminate);
    }

    /// The transaction is sealed: it cannot be duplicated or serialized, so a
    /// caller cannot retain a second handle to an in-flight first install or
    /// persist one across a boundary that would outlive its guard.
    #[test]
    fn provisioning_transaction_is_non_cloneable_and_non_serializable() {
        static_assertions::assert_not_impl_any!(
            ProvisioningTransaction<'static>: Clone, serde::Serialize
        );
        static_assertions::assert_not_impl_any!(
            FirstInstallFailure<'static>: Clone, serde::Serialize
        );
    }

    /// The keystone: a sealed first install COMPLETES.
    ///
    /// Asserts the whole ordering contract by its observable effects rather than
    /// by inspecting steps - the receipt settles and reads back as the active
    /// release, the bootstrap-ownership fact is TRUE and was derived from the
    /// live credential proof rather than passed in, the credentials the install
    /// created are present, and the bootstrap descriptor is GONE because
    /// retirement (the disarm) ran only after the receipt settled.
    #[test]
    fn a_sealed_first_install_settles_and_disarms_the_bootstrap_descriptor() {
        let fixture = Fixture::new();
        let mut product = LockedProduct::bind(fixture.paths.clone(), &fixture.guard).unwrap();
        let mut generation = product.create_unpublished("generation-1").unwrap();
        fixture.populate(generation.path());

        let transaction = ProvisioningTransaction::begin(
            &fixture.paths,
            &fixture.guard,
            crate::channels::self_install::SelfInstallAuthority::new().provenance(),
        )
        .expect("bound transaction");

        let release = transaction
            .prepare_first_install_feed(&mut generation, fixture.first_install_feed(), 1_000_000)
            .expect("a populated generation completes the sealed first install");

        assert!(
            release.bootstrap_created_ownership(),
            "a first install must record that IT created ownership"
        );
        assert_eq!(release.active_generation(), "generation-1");

        let credentials = fixture.paths.credentials_dir();
        for name in ["ownership.cap", "attach.cred"] {
            assert!(
                credentials.join(name).exists(),
                "the install must leave the credential it created: {name}"
            );
        }
        assert!(
            !credentials.join("bootstrap-credentials.v1").exists(),
            "the descriptor must be retired once the receipt settled - that retirement IS the disarm"
        );

        // The settled receipt is independently observable, not just returned.
        let observation = observe_active_release(&fixture.paths, &fixture.guard).unwrap();
        assert!(matches!(
            observation.state().unwrap(),
            ActiveReleaseState::Settled(_)
        ));
    }

    /// A failed first install RETAINS the pending credential authority.
    ///
    /// This is the property that keeps a bootstrap recoverable: if the failure
    /// dropped the pending value, the durable descriptor would be stranded with
    /// nothing holding the authority to retire it. Verification is made to fail
    /// by handing the transaction an EMPTY generation, which cannot satisfy the
    /// release manifest.
    #[test]
    fn a_failed_first_install_retains_the_pending_credential_authority() {
        let fixture = Fixture::new();
        let mut product = LockedProduct::bind(fixture.paths.clone(), &fixture.guard).unwrap();
        let mut generation = product.create_unpublished("generation-1").unwrap();

        let transaction = ProvisioningTransaction::begin(
            &fixture.paths,
            &fixture.guard,
            crate::channels::self_install::SelfInstallAuthority::new().provenance(),
        )
        .expect("bound transaction");

        let failure = transaction
            .prepare_first_install_feed(&mut generation, fixture.first_install_feed(), 1_000_000)
            .expect_err("an empty generation cannot verify");

        assert!(
            failure.retains_credential_authority(),
            "a failed first install must not strand the bootstrap descriptor"
        );
        // The retained authority is reachable, which is what makes a bounded
        // retry or an authorized cleanup possible rather than theoretical.
        assert!(failure.into_retained().is_some());
    }
}
