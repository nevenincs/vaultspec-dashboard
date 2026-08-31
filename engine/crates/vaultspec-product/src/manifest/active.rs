//! Receipt-bound verification of an INSTALLED, receipt-selected generation.
//!
//! A child module of `manifest`, so it reuses the one scanning, location, and
//! inventory authority rather than growing a second verifier beside it.
//!
//! This is the START-time counterpart to the install-time double scan. The
//! difference that matters is where the expectations come from: at install they
//! ride the verified distribution capability, and here they ride the SETTLED
//! RECEIPT. Nothing the installed tree declares about itself is trusted before
//! it has been joined to a receipt-bound digest - in particular the component
//! lock, which a candidate tree would otherwise be free to supply and satisfy on
//! its own terms.

use super::*;
use crate::hex;

/// The receipt-bound expectations one installed generation must satisfy.
pub(crate) struct ActiveReleaseExpectation<'receipt> {
    /// The receipt's member-manifest digest. The manifest is LOCATED by this
    /// digest, never by a path the tree declares.
    pub(crate) member_manifest_digest: &'receipt str,
    /// The receipt's component-lock digest.
    pub(crate) component_lock_digest: &'receipt str,
    /// The receipt's release-set identity.
    pub(crate) release_set_identity: &'receipt str,
    /// The receipt's target.
    pub(crate) target: Target,
}

/// One installed generation proven complete against its receipt.
///
/// Non-`Clone` and non-serializable: it is the evidence that a scan happened
/// here and now, so a copy of it would be a claim about a tree nobody looked at.
pub(crate) struct VerifiedActiveGeneration {
    release_set_identity: String,
    target: Target,
    a2a_identity: ReleaseIdentity,
    runtime_entrypoint: String,
    file_count: usize,
}

impl VerifiedActiveGeneration {
    pub(crate) fn release_set_identity(&self) -> &str {
        &self.release_set_identity
    }

    pub(crate) const fn target(&self) -> Target {
        self.target
    }

    pub(crate) fn a2a_identity(&self) -> &ReleaseIdentity {
        &self.a2a_identity
    }

    /// The generation-relative path of the frozen runtime's launchable
    /// entrypoint, proven installed, executable, and inside the declared root.
    pub(crate) fn runtime_entrypoint(&self) -> &str {
        &self.runtime_entrypoint
    }

    /// How many installed files the complete inventory covered.
    pub(crate) const fn file_count(&self) -> usize {
        self.file_count
    }
}

/// Verify an installed generation root against one settled receipt's facts.
///
/// The order is the point. The member manifest is FOUND by the receipt's digest
/// in a complete scan, so a substituted or extra manifest cannot present itself;
/// the component lock is read from its fixed path and its bytes must digest to
/// the RECEIPT's value before it is parsed, so a lock the candidate tree
/// supplied on its own is refused rather than believed; and only then does the
/// manifest's own inventory decide the rest of the tree, every installed file
/// digested and matched with no missing and no extra member.
pub(crate) fn verify_active_generation(
    root: &Path,
    expected: &ActiveReleaseExpectation<'_>,
) -> Result<VerifiedActiveGeneration> {
    require_digest(
        "receipt.release_set_member_digest",
        expected.member_manifest_digest,
    )?;
    require_digest(
        "receipt.component_lock_digest",
        expected.component_lock_digest,
    )?;
    require_identity(
        "receipt.release_set_identity",
        expected.release_set_identity,
    )?;

    let (snapshot, member_manifest_path) =
        scan_generation_locating_member(root, expected.member_manifest_digest)?;
    let observed = &snapshot.files;
    let located_member_bytes = read_installed_bounded(
        root,
        &member_manifest_path,
        MAX_MEMBER_MANIFEST_BYTES as u64,
        observed_file(observed, &member_manifest_path)?,
    )?;
    let manifest = parse_release(&located_member_bytes)?;
    expect_literal(
        "release_manifest.path",
        &member_manifest_path,
        &manifest.release_manifest.path,
    )?;
    if manifest.target != expected.target {
        return Err(ManifestError::TargetMismatch {
            expected: expected.target,
            found: manifest.target,
        });
    }
    expect_literal(
        "release cohort id",
        expected.release_set_identity,
        &manifest.cohort.id,
    )?;

    // This verifier exists to hand a caller a launchable runtime. A generation
    // whose member manifest declares no bundled runtime has none to hand over,
    // and the honest answer is a refusal naming that: every field below —
    // the component-lock join, the runtime subtree, the entrypoint — describes
    // something the tree does not carry, and fabricating any of them would put
    // a path nobody can execute in front of a start.
    let a2a = manifest
        .a2a_component
        .clone()
        .ok_or_else(|| ManifestError::InvalidField {
            field: "a2a_component".to_string(),
            detail: "this generation carries no bundled a2a runtime, so no runtime can be started from it".to_string(),
        })?;

    // The lock is joined to the RECEIPT before it is parsed or believed.
    let lock_bytes = read_installed_bounded(
        root,
        COMPONENT_LOCK_PATH,
        MAX_COMPONENT_LOCK_BYTES as u64,
        observed_file(observed, COMPONENT_LOCK_PATH)?,
    )?;
    let observed_lock_digest = hex::sha256(&lock_bytes);
    expect_digest(
        "installed component lock",
        expected.component_lock_digest,
        &observed_lock_digest,
    )?;
    let lock = parse_component_lock(&lock_bytes)?;
    expect_literal(
        "a2a_component.component_lock.path",
        COMPONENT_LOCK_PATH,
        &a2a.component_lock.path,
    )?;
    expect_digest(
        "a2a_component.component_lock.digest",
        &observed_lock_digest,
        &a2a.component_lock.digest,
    )?;
    verify_release_lock_joins(&manifest, &lock)?;

    verify_release_manifest_bytes(
        root,
        &manifest.release_manifest.path,
        &located_member_bytes,
        observed,
    )?;
    verify_complete_inventory(&manifest, observed)?;
    // What the inventory alone cannot say: WHICH subtree is the runtime and
    // which file in it is launchable. A start resolves its program from this,
    // so an absent, truncated, or non-executable onedir must fail here rather
    // than at spawn.
    verify_bundled_runtime(&a2a.runtime, &manifest.file_digests, observed)?;

    Ok(VerifiedActiveGeneration {
        release_set_identity: manifest.cohort.id,
        target: manifest.target,
        a2a_identity: a2a.release_identity,
        runtime_entrypoint: a2a.runtime.entrypoint,
        file_count: observed.len(),
    })
}
