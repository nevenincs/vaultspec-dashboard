//! The D8 refusal matrix.
//!
//! Every case here runs the SAME chain the S11 proof runs — a real signed TUF
//! repository, a real capsule archive, a real product root, a real generation on
//! disk — mutates exactly ONE thing, and asserts the specific typed refusal that
//! results. Nothing is stubbed, mocked, skipped, or marked `#[ignore]`.
//!
//! WHAT THIS LAYER ADDS, and why it is not a second copy of an existing suite.
//! The distribution authority already proves its own refusals against its own
//! entrypoint: expired metadata, missing roles, mixed versions, non-canonical
//! cohorts, unexpected target names, cohort/archive digest mismatch, tampered
//! archive bytes, metadata rollback. Repeating those assertions here would buy
//! nothing. What is NOT proven there — because that crate cannot see a product —
//! is the consequence: that a refused release leaves the PRODUCT untouched. So
//! every case below asserts the refusal AND the absence of durable effect. That
//! second half is the reason these tests exist.
//!
//! THE EVIDENCE STANDARD. A refusal test is worth its runtime only if the
//! refusal happens for the reason under test, so each case pins the specific
//! typed error rather than "something failed", and each family establishes its
//! negative control — the unmutated case SUCCEEDS — before mutating one thing.
//! Without the control, a fixture that broke for an unrelated reason would still
//! print green.
//!
//! WHY IN-CRATE. The same reason the S11 chain is: `publish_active_receipt` is
//! `pub(crate)` and the fixture rests on `pub(super)` canonicalization. No
//! visibility is widened to host these.

use std::path::{Path, PathBuf};

use vaultspec_distribution_authority::{
    DistributionTarget, VerificationError, VerificationRequest, VerifiedDistributionRelease,
    verify_distribution_with_unsealed_root,
};
use vaultspec_release_fixtures::{RealRelease, SigningMaterial};

use crate::channels::self_install::SelfInstallAuthority;
use crate::generation::LockedProduct;
use crate::manifest::tests::Fixture;
use crate::materializer::tests::{build_zip, release_entries};
use crate::provisioning::{
    ActiveReleaseState, FirstInstallFailure, ProvisionedRelease, ProvisioningTransaction,
    observe_active_release,
};

/// The target this fixture's release tree is built for.
const TARGET: DistributionTarget = DistributionTarget::X86_64PcWindowsMsvc;

/// The capsule root the fixture's release tree actually uses.
const CAPSULE_ROOT: &str = "a2a/capsule";

/// A fixed wall-clock stamp; no case here depends on real time passing.
const CREATED_MS: i64 = 1_700_000_000_000;

/// One product, one signing identity, and the published repositories built
/// against it.
///
/// The repositories live in a temporary root SEPARATE from the product root, so
/// tampering with published bytes cannot accidentally disturb product state and
/// make an assertion about "no durable effect" pass for the wrong reason.
struct Chain {
    fixture: Fixture,
    material: SigningMaterial,
    repository: tempfile::TempDir,
}

impl Chain {
    async fn new() -> Self {
        let repository = tempfile::tempdir().expect("temporary release repository");
        let material = vaultspec_release_fixtures::signing_material(repository.path()).await;
        Self {
            fixture: Fixture::new(),
            material,
            repository,
        }
    }

    /// The release identity this fixture's own tree declares.
    ///
    /// Read off the fixture rather than invented, because the installed member
    /// manifest names the cohort it belongs to: a cohort published under any
    /// other identity describes a different release.
    fn identity(&self) -> String {
        self.fixture.first_install_feed().release_identity
    }

    /// Publish a repository that both CARRIES and DESCRIBES this fixture's real
    /// release. This is the honest publication every mutation starts from.
    async fn publish(&self, version: u64, identity: &str) -> PathBuf {
        self.publish_for(version, identity, TARGET).await
    }

    /// [`Self::publish`] with an explicit selected target, for the target-
    /// substitution cases.
    async fn publish_for(
        &self,
        version: u64,
        identity: &str,
        selected: DistributionTarget,
    ) -> PathBuf {
        let real = RealRelease {
            target: selected,
            archive: build_zip(&release_entries(&self.fixture)),
            member_manifest_sha256: self.fixture.member_digest_hex().to_owned(),
            component_lock: self.fixture.lock_bytes().to_vec(),
            capsule_root: CAPSULE_ROOT.to_owned(),
        };
        vaultspec_release_fixtures::publish_bundle_with_release(
            self.repository.path(),
            &self.material,
            version,
            identity,
            &real,
        )
        .await
    }

    /// Verify a published bundle against THIS product root, exactly as
    /// production does.
    async fn verify(
        &self,
        bundle: &Path,
        target: DistributionTarget,
    ) -> Result<VerifiedDistributionRelease, VerificationError> {
        let request =
            VerificationRequest::for_product_root(bundle, self.fixture.paths.root(), target)?;
        verify_distribution_with_unsealed_root(&self.material.root_bytes, request).await
    }

    /// The product-side tail of the chain: bind, populate a real generation,
    /// begin the sealed transaction, and drive the first install.
    ///
    /// Split out so a refusal case can reach the INSTALL boundary with a release
    /// that verified cleanly — which is the only way to prove a refusal belongs
    /// to the install boundary rather than to the distribution layer.
    async fn install(
        &self,
        verified: &mut VerifiedDistributionRelease,
        generation_name: &str,
    ) -> Result<ProvisionedRelease, Box<FirstInstallFailure<'_>>> {
        let mut product = LockedProduct::bind(self.fixture.paths.clone(), &self.fixture.guard)
            .expect("locked product");
        let mut generation = product
            .create_unpublished(generation_name)
            .expect("real unpublished generation");
        self.fixture.populate(generation.path());

        let transaction = ProvisioningTransaction::begin_self_install(
            &self.fixture.paths,
            &self.fixture.guard,
            &SelfInstallAuthority::new(),
        )
        .expect("the guard binds this product root");

        let mut source = verified
            .materialization_source()
            .await
            .expect("sealed materialization source");
        transaction.prepare_first_install(&mut generation, &mut source, CREATED_MS)
    }

    /// Assert the fixed journal records NOTHING.
    ///
    /// This is the second half of every refusal case. A refusal that still moved
    /// the receipt would be far worse than no refusal at all: the product would
    /// then be selecting a release the authority rejected.
    fn assert_no_receipt(&self, after: &str) {
        let observation = observe_active_release(&self.fixture.paths, &self.fixture.guard)
            .expect("the journal is observable after a refusal");
        let state = observation.state().expect("journal state is classifiable");
        assert_eq!(
            state,
            ActiveReleaseState::Absent,
            "a refused release must leave the fixed journal untouched, but {after} it did not"
        );
    }

    /// Assert the refusal left no credential residue either.
    ///
    /// Bootstrap runs INSIDE `prepare_first_install`, so a refusal that never
    /// reached the transaction must not have created credentials, and one that
    /// did reach it must not have left a settled pair behind.
    fn assert_no_credentials(&self, after: &str) {
        let credentials = self.fixture.paths.credentials_dir();
        for name in ["ownership.cap", "attach.cred"] {
            assert!(
                !credentials.join(name).exists(),
                "a refusal before the credential bootstrap must leave no {name}, but {after} it did"
            );
        }
    }
}

/// Assert a verification refused for a specific reason, printing the actual
/// error when it did not.
///
/// A bare `matches!` assertion prints only the pattern that failed, which costs
/// a full re-run to learn what actually happened.
#[track_caller]
fn assert_verification_refused(
    outcome: Result<VerifiedDistributionRelease, VerificationError>,
    expected: &str,
    predicate: impl FnOnce(&VerificationError) -> bool,
) {
    match outcome {
        Ok(release) => panic!("expected {expected}, but the release verified: {release:?}"),
        Err(error) => assert!(
            predicate(&error),
            "expected {expected}, got a different refusal: {error:?}"
        ),
    }
}

// ---------------------------------------------------------------------------
// The negative control
// ---------------------------------------------------------------------------

/// The unmutated chain SUCCEEDS, on the same harness every refusal case uses.
///
/// This is not a duplicate of the S11 proof. S11 proves the chain over its own
/// hand-built fixture; this proves THIS harness — the one every case below
/// mutates — reaches a settled receipt when nothing is tampered with. Without
/// it, a harness that had quietly broken would make every refusal below pass
/// vacuously, which is the exact failure mode a refusal matrix is prone to.
#[tokio::test(flavor = "current_thread")]
async fn the_unmutated_harness_installs_and_settles() {
    let chain = Chain::new().await;
    let identity = chain.identity();
    let bundle = chain.publish(1, &identity).await;

    chain.assert_no_receipt("before installing");
    let mut verified = chain
        .verify(&bundle, TARGET)
        .await
        .expect("the honest repository verifies");
    assert_eq!(verified.release_identity(), identity);

    let release = chain
        .install(&mut verified, "generation-control")
        .await
        .unwrap_or_else(|failure| {
            panic!(
                "the control install must commit: {:?} - {} - {}",
                failure.kind, failure.message, failure.detail
            )
        });
    assert_eq!(release.active_generation(), "generation-control");
    assert!(release.bootstrap_created_ownership());

    // And the journal now says so. This is what makes `assert_no_receipt`
    // discriminating rather than decorative: the SAME observation that reads
    // `Absent` before the install reads `Settled` after it, so a refusal case
    // asserting `Absent` is asserting something the harness can actually
    // violate.
    let observation = observe_active_release(&chain.fixture.paths, &chain.fixture.guard)
        .expect("journal observation");
    assert!(
        matches!(
            observation.state().expect("settled state"),
            ActiveReleaseState::Settled(_)
        ),
        "the control install must leave the journal settled"
    );
    let credentials = chain.fixture.paths.credentials_dir();
    for name in ["ownership.cap", "attach.cred"] {
        assert!(
            credentials.join(name).exists(),
            "the control install must leave the credential it created: {name}"
        );
    }
}

// ---------------------------------------------------------------------------
// TUF refusals
// ---------------------------------------------------------------------------

/// Expired role metadata is refused, and the product is untouched.
#[tokio::test(flavor = "current_thread")]
async fn expired_metadata_refuses_and_writes_no_receipt() {
    let chain = Chain::new().await;
    let identity = chain.identity();
    let bundle = chain.publish(1, &identity).await;

    // Freeze the timestamp role in the past and re-sign it, so the document is
    // signature-valid and ONLY its expiry is wrong.
    vaultspec_release_fixtures::expire_timestamp_metadata(&bundle, &chain.material);

    assert_verification_refused(
        chain.verify(&bundle, TARGET).await,
        "expired timestamp metadata to be refused as a TUF failure",
        |error| matches!(error, VerificationError::Tuf(_)),
    );
    chain.assert_no_receipt("after refusing expired metadata");
    chain.assert_no_credentials("after refusing expired metadata");
}

/// A version rollback is refused BY THE PRODUCT ROOT's own persisted datastore.
///
/// The control is inside the test and is load-bearing: the newer release must
/// verify FIRST, because that success is what persists the version the older
/// release then fails to beat. Without it this would assert only that some
/// repository failed.
#[tokio::test(flavor = "current_thread")]
async fn version_rollback_against_the_persisted_datastore_refuses_and_writes_no_receipt() {
    let chain = Chain::new().await;
    let identity = chain.identity();
    let newer = chain.publish(2, &format!("{identity}-newer")).await;
    let older = chain.publish(1, &format!("{identity}-older")).await;

    // CONTROL: the newer release verifies against a fresh product root, which is
    // what writes version 2 into the persisted datastore.
    let verified = chain
        .verify(&newer, TARGET)
        .await
        .expect("the newer release verifies against a fresh product root");
    // The retained release holds the product's verification lock for its whole
    // lifetime, so the rollback attempt must come after it is released — a
    // `VerificationInProgress` refusal would prove nothing about rollback.
    drop(verified);

    assert_verification_refused(
        chain.verify(&older, TARGET).await,
        "a metadata rollback to be refused against the persisted datastore",
        |error| matches!(error, VerificationError::Tuf(_)),
    );
    chain.assert_no_receipt("after refusing a version rollback");
    chain.assert_no_credentials("after refusing a version rollback");
}

/// Substituted archive bytes are refused, and the product is untouched.
#[tokio::test(flavor = "current_thread")]
async fn target_substitution_refuses_and_writes_no_receipt() {
    let chain = Chain::new().await;
    let identity = chain.identity();
    let bundle = chain.publish(1, &identity).await;

    // Replace the selected member's archive with different bytes. TUF binds
    // length and digest, so the substitution is caught even though the file is
    // in the right place under the right name.
    vaultspec_release_fixtures::substitute_published_archive(
        &bundle,
        TARGET,
        b"substituted archive bytes",
    );

    assert_verification_refused(
        chain.verify(&bundle, TARGET).await,
        "a substituted selected archive to be refused",
        |error| matches!(error, VerificationError::Tuf(_)),
    );
    chain.assert_no_receipt("after refusing a substituted archive");
    chain.assert_no_credentials("after refusing a substituted archive");
}

/// Asking for a target the bundle does not carry is refused by the DISTRIBUTION
/// layer, before the install boundary ever sees a target.
///
/// This is the empirical settlement of an open question about the carried
/// fixture `manifest_rejects_target_mismatch`, which reaches
/// `ManifestError::TargetMismatch` by calling `verify_against_lock` directly at
/// the manifest layer. The suspicion was that a wrong-target request cannot
/// reach that comparison through the real chain. It cannot, and this pins WHY.
///
/// The mechanism is worth stating exactly, because the plausible guess is wrong.
/// It is NOT the bounded layout inspection: a published bundle carries the
/// cohort plus the selected member's archive, which is exactly the two entries
/// that inspection admits, so the layout is VALID. The refusal comes one step
/// later, when the verifier tries to fetch the requested target and finds no
/// such file — a TUF transport failure. Either way the product is never
/// consulted, but only one of those two accounts is true.
#[tokio::test(flavor = "current_thread")]
async fn a_target_the_bundle_does_not_carry_is_refused_by_the_distribution_layer() {
    let chain = Chain::new().await;
    let identity = chain.identity();
    let bundle = chain.publish(1, &identity).await;

    assert_verification_refused(
        chain
            .verify(&bundle, DistributionTarget::Aarch64AppleDarwin)
            .await,
        "a request for a target the bundle does not carry to be refused at the distribution layer",
        |error| matches!(error, VerificationError::Tuf(_)),
    );
    chain.assert_no_receipt("after refusing an uncarried target");
    chain.assert_no_credentials("after refusing an uncarried target");
}

/// A bundle published FOR another target, carrying that target's archive, is
/// still refused — and the refusal is a release-identity/digest refusal at the
/// install boundary, never `ManifestError::TargetMismatch`.
///
/// This is the harder half of the same question. Here the bundle genuinely
/// carries the requested target, so the layout check passes and verification
/// SUCCEEDS; the chain reaches the install boundary with a coherent Apple-
/// Silicon release. The product then refuses it — but for the member-manifest
/// reason, because the fixture's installed tree is a Windows tree. The
/// manifest-layer target comparison is never consulted.
///
/// The consequence is recorded rather than papered over: the carried fixture
/// covers a comparison this chain structurally cannot reach, so no case here
/// discharges it.
#[tokio::test(flavor = "current_thread")]
async fn a_foreign_target_cohort_is_refused_at_the_install_boundary_not_as_target_mismatch() {
    let chain = Chain::new().await;
    let identity = chain.identity();
    let foreign = DistributionTarget::Aarch64AppleDarwin;
    let bundle = chain.publish_for(1, &identity, foreign).await;

    // Verification SUCCEEDS: the bundle carries what was asked for, correctly
    // signed. That success is the point — it is what forces the refusal to
    // happen at the install boundary rather than earlier.
    let mut verified = chain
        .verify(&bundle, foreign)
        .await
        .expect("a coherent foreign-target bundle verifies");
    assert_eq!(verified.target(), foreign);

    let failure = chain
        .install(&mut verified, "generation-foreign-target")
        .await
        .expect_err("a foreign-target release must not install into this product");
    assert_eq!(
        failure.kind(),
        crate::provisioning::ProvisioningErrorKind::FirstInstallAdapterUnavailable,
        "expected the install boundary to refuse verification, got {failure:?} - {}",
        failure.detail
    );
    chain.assert_no_receipt("after refusing a foreign-target release");
}

/// A cohort whose members disagree with the published archives is refused as an
/// invalid cohort, before any product state is touched.
#[tokio::test(flavor = "current_thread")]
async fn cohort_member_mismatch_refuses_and_writes_no_receipt() {
    let chain = Chain::new().await;
    let identity = chain.identity();
    let bundle = chain.publish(1, &identity).await;

    // Re-sign the target metadata so a NON-selected member's digest disagrees
    // with the trusted cohort record. The selected archive is untouched, so only
    // the cross-member consistency check can refuse this.
    vaultspec_release_fixtures::corrupt_member_archive_digest(
        &bundle,
        &chain.material,
        1,
        DistributionTarget::Aarch64AppleDarwin,
    );

    assert_verification_refused(
        chain.verify(&bundle, TARGET).await,
        "a cohort whose members disagree with the published archives to be refused",
        |error| matches!(error, VerificationError::InvalidCohort),
    );
    chain.assert_no_receipt("after refusing a mismatched cohort");
    chain.assert_no_credentials("after refusing a mismatched cohort");
}
