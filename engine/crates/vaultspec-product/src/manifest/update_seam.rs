//! Sealed materializer seams over the private manifest authority
//! (archive-materialization D2/D3). A child module of `manifest`, so the
//! private trusted-authority and receipt-context values never gain a
//! crate-visible raw construction path.

use super::*;
use crate::hex;

// ---------------------------------------------------------------------------
// Sealed materializer seams (archive-materialization D2/D3)
// ---------------------------------------------------------------------------

/// Preflight view of one candidate member manifest already located by its
/// independently trusted digest: the declared installed-file digest inventory
/// plus the manifest's own declared path. The authoritative complete
/// verification remains [`VerifiedReleaseSet::verify`]; this exists so the
/// archive materializer can refuse to WRITE anything the trusted manifest does
/// not name (archive-materialization D2).
pub(crate) struct PreflightInventory {
    pub(crate) file_digests: BTreeMap<String, String>,
    pub(crate) manifest_path: String,
}

pub(crate) fn preflight_inventory(raw: &[u8]) -> Result<PreflightInventory> {
    let manifest = parse_release(raw)?;
    Ok(PreflightInventory {
        file_digests: manifest.file_digests,
        manifest_path: manifest.release_manifest.path,
    })
}

/// Crate-internal facts the sealed update activation derives from the opaque
/// distribution capability and the prior settled receipt. No caller-supplied
/// digest participates: the materializer synthesizes the canonical five-member
/// cohort descriptor from the verified distribution members, and provenance is
/// minted only by a product-owned channel adapter.
pub(crate) struct UpdateReleaseFacts<'a> {
    pub(crate) target: Target,
    pub(crate) member_manifest_sha256: String,
    pub(crate) cohort_descriptor_bytes: Vec<u8>,
    pub(crate) component_lock_bytes: &'a [u8],
    pub(crate) capsule_root: String,
    pub(crate) provenance: InstallProvenanceAuthority,
    pub(crate) channel: Channel,
    pub(crate) bootstrap_created_ownership: BootstrapOwnership,
    pub(crate) prior_seat: Option<PriorSeatIdentity>,
    pub(crate) consistency_generation: u64,
    pub(crate) created_ms: i64,
}

/// Run the complete double-scan release verification for the sealed update
/// activation. The private trusted-authority and receipt-context values are
/// assembled here, inside the manifest boundary, so they never gain a
/// crate-visible raw construction path.
pub(crate) fn verify_update_release<'generation, 'product, 'lock>(
    generation: &'generation mut UnpublishedGeneration<'product, 'lock>,
    facts: UpdateReleaseFacts<'_>,
) -> Result<VerifiedReleaseSet<'generation, 'product, 'lock>> {
    let cohort_digest = hex::sha256(&facts.cohort_descriptor_bytes);
    let authority = TrustedReleaseAuthority {
        expected_target: facts.target,
        expected_member_manifest_digest: facts.member_manifest_sha256,
        expected_cohort_digest: cohort_digest.clone(),
        receipt_external_cohort_digest: cohort_digest,
        trusted_component_lock_bytes: facts.component_lock_bytes.to_vec(),
        trusted_component_lock_path: COMPONENT_LOCK_PATH.to_string(),
        expected_component_lock_digest: hex::sha256(facts.component_lock_bytes),
        trusted_capsule_root: facts.capsule_root,
        _adapter: facts.provenance,
    };
    VerifiedReleaseSet::verify(
        generation,
        ReleaseVerificationInput {
            authority: &authority,
            cohort_descriptor_bytes: &facts.cohort_descriptor_bytes,
        },
        ReceiptActivationContext {
            channel: facts.channel,
            bootstrap_created_ownership: facts.bootstrap_created_ownership,
            prior_seat: facts.prior_seat,
            consistency_generation: facts.consistency_generation,
            created_ms: facts.created_ms,
        },
    )
}

/// Crate-internal facts the sealed FIRST-INSTALL activation derives.
///
/// Identical to [`UpdateReleaseFacts`] except in how the bootstrap-ownership
/// fact arrives: an update CARRIES the prior receipt's value, while a first
/// install must PROVE it. So this seam takes the live
/// [`PendingDashboardCredentials`] proof rather than a boolean — there is no
/// field a caller could set to assert an ownership creation that did not happen
/// (D6).
#[allow(
    dead_code,
    reason = "sealed first-install substrate; Stage 3 wires it to the provisioning transaction"
)]
pub(crate) struct InstallReleaseFacts<'a, 'guard> {
    pub(crate) target: Target,
    pub(crate) member_manifest_sha256: String,
    pub(crate) cohort_descriptor_bytes: Vec<u8>,
    pub(crate) component_lock_bytes: &'a [u8],
    pub(crate) capsule_root: String,
    pub(crate) provenance: InstallProvenanceAuthority,
    pub(crate) channel: Channel,
    /// The retained first-install proof. Borrowed rather than consumed: the same
    /// value must survive this call to retire the bootstrap descriptor and
    /// disarm pending cleanup after the receipt settles, so consuming it here
    /// would destroy authority the transaction still needs. Borrowing still
    /// makes the fact underivable without a live proof, which is the property
    /// D6 requires.
    pub(crate) pending: &'a crate::credentials::PendingDashboardCredentials<'guard>,
    pub(crate) prior_seat: Option<PriorSeatIdentity>,
    pub(crate) consistency_generation: u64,
    pub(crate) created_ms: i64,
}

/// Run the complete double-scan release verification for the sealed FIRST-INSTALL
/// activation, deriving the bootstrap-ownership fact from the retained proof.
#[allow(
    dead_code,
    reason = "sealed first-install substrate; Stage 3 wires it to the provisioning transaction"
)]
pub(crate) fn verify_install_release<'generation, 'product, 'lock>(
    generation: &'generation mut UnpublishedGeneration<'product, 'lock>,
    facts: InstallReleaseFacts<'_, '_>,
) -> Result<VerifiedReleaseSet<'generation, 'product, 'lock>> {
    let bootstrap_created_ownership = BootstrapOwnership::proven(facts.pending)?;
    verify_update_release(
        generation,
        UpdateReleaseFacts {
            target: facts.target,
            member_manifest_sha256: facts.member_manifest_sha256,
            cohort_descriptor_bytes: facts.cohort_descriptor_bytes,
            component_lock_bytes: facts.component_lock_bytes,
            capsule_root: facts.capsule_root,
            provenance: facts.provenance,
            channel: facts.channel,
            bootstrap_created_ownership,
            prior_seat: facts.prior_seat,
            consistency_generation: facts.consistency_generation,
            created_ms: facts.created_ms,
        },
    )
}
