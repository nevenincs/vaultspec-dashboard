//! Receipt-activation facts for the sealed release verification.
//!
//! Split from `manifest` so the module stays inside the 1500-line ceiling. These
//! three types are one concern: the transaction-supplied facts that survive
//! verification and land in the S172 receipt, plus the D6 bootstrap-ownership
//! fact they carry. Fields are `pub(super)` so the sibling `authority` module can
//! assemble and destructure them WITHIN the manifest boundary; nothing here
//! gains a crate-visible raw construction path.

use super::{ManifestError, Result};
use crate::manifest::{ReleaseIdentity, Target};
use crate::receipt::{Channel, PriorSeatIdentity};

/// Internally supplied transaction facts retained for receipt publication.
///
/// These facts are not derived from candidate bytes. Their closed grammar is
/// validated while the exact unpublished generation and installation guard are
/// borrowed, then S172 must consume the retained values rather than rebuilding
/// them at the publication boundary.
#[doc(hidden)]
#[allow(
    dead_code,
    reason = "compile-time sealed substrate awaits a production adapter authority"
)]
pub(crate) struct ReceiptActivationContext {
    pub(super) channel: Channel,
    pub(super) bootstrap_created_ownership: BootstrapOwnership,
    pub(super) prior_seat: Option<PriorSeatIdentity>,
    pub(super) consistency_generation: u64,
    pub(super) created_ms: i64,
}

/// Whether THIS activation created the dashboard ownership credential (D6).
///
/// The fact is deliberately not a `bool` on the way in. A caller that could pass
/// `true` could assert a first install that never happened, and the receipt this
/// value lands in is what a later run reads to decide whether ownership was
/// established here. So there is no boolean constructor and no public raw
/// construction path: the value exists only as
///
///   * [`BootstrapOwnership::proven`] — FIRST INSTALL. True only because a live
///     [`PendingDashboardCredentials`] proof was supplied AND its retained files
///     revalidated at this moment. The proof cannot be forged, cloned, or
///     serialized, so possessing one IS the evidence.
///   * [`BootstrapOwnership::carried_from_prior`] — UPDATE. Repeats what the
///     prior settled receipt already recorded. It transports a fact; it can
///     never mint one, so an update can never claim bootstrap creation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct BootstrapOwnership(bool);

impl BootstrapOwnership {
    /// Derive the fact from a retained first-install credential proof.
    ///
    /// Revalidating here rather than trusting the value's existence is the point
    /// of D5: the proof was created earlier in the transaction, and this is the
    /// activation boundary, so the files are re-proven at the moment the fact is
    /// asserted rather than at the moment it was created.
    #[allow(
        dead_code,
        reason = "sealed first-install substrate; Stage 3 wires it to the provisioning transaction"
    )]
    pub(crate) fn proven(
        pending: &crate::credentials::PendingDashboardCredentials<'_>,
    ) -> Result<Self> {
        pending
            .revalidate_retained()
            .map_err(|error| ManifestError::InvalidField {
                field: "receipt.bootstrap_created_ownership".to_string(),
                detail: format!(
                    "retained first-install credential proof failed revalidation: {error}"
                ),
            })?;
        Ok(Self(true))
    }

    /// Carry the prior settled receipt's fact through an update.
    pub(crate) const fn carried_from_prior(prior: bool) -> Self {
        Self(prior)
    }

    pub(crate) const fn get(self) -> bool {
        self.0
    }
}

/// Complete immutable and transaction-supplied facts for the S172 receipt.
///
/// The active generation text is copied only from the exact retained token
/// during verification; it is never accepted as a caller field.
#[allow(
    dead_code,
    reason = "compile-time sealed substrate awaits a production adapter authority"
)]
pub(crate) struct VerifiedReceiptFacts {
    pub(super) dashboard_version: String,
    pub(super) dashboard_commit: String,
    pub(super) dashboard_digest: String,
    pub(super) release_set_identity: String,
    pub(super) release_set_member_digest: String,
    pub(super) component_lock_digest: String,
    pub(super) external_five_member_cohort_digest: String,
    pub(super) target: Target,
    pub(super) a2a_identity: ReleaseIdentity,
    pub(super) active_generation: String,
    pub(super) channel: Channel,
    pub(super) bootstrap_created_ownership: bool,
    pub(super) prior_seat: Option<PriorSeatIdentity>,
    pub(super) consistency_generation: u64,
    pub(super) created_ms: i64,
}
