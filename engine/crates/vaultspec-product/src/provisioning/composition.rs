//! Composition proofs over the integrated install chain.
//!
//! WHAT THIS IS NOT. This is NOT the a2a-orchestration-edge D8 release matrix,
//! and nothing here discharges any line of it. That matrix installs and
//! exercises real product artifacts across all five targets and every
//! applicable channel — clean and offline install, relocation, ACP execution,
//! cold gateway and lazy worker, concurrent ensure, foreign attach, drain,
//! migration, update, rollback, interrupted-update recovery, consistency-group
//! restoration, repair, removal, channel payload parity. It is a different
//! artifact at a different level and it remains OUTSTANDING.
//!
//! What D8 contributes here is its LAST clause, which binds everything below:
//! production code, real files and real processes, no fakes, mocks, stubs,
//! patches, skips, or expected-failures. Every case honours that.
//!
//! WHAT THIS IS. Each layer already proves its own refusals in isolation, and
//! proves them well — the distribution authority owns TUF and cohort refusals
//! against its own entrypoint, the manifest layer owns document-versus-lock
//! comparisons, the receipt layer owns journal mutation, the credential store
//! owns bootstrap phases. What NOTHING proves is the CROSSING: that a refusal
//! at one link leaves the other links' state as it should be. The chain is the
//! only place that proposition exists, so it is the only thing this module
//! asserts.
//!
//! THE HAZARD THIS MODULE MUST AVOID, stated plainly because it is subtle. A
//! chain case that appears to cover a refusal while actually tripping an
//! EARLIER one at a different layer is not merely redundant — it is a FALSE
//! TEST, and worse than absent coverage, because it reads as proof. Re-proving
//! a per-layer refusal through the chain manufactures that hazard once per
//! case. So nothing here re-asserts a refusal its owning layer already owns;
//! each case asserts what the owning layer CANNOT see.
//!
//! THE EVIDENCE STANDARD. Pin the specific typed error rather than "something
//! failed", and establish the negative control — the unmutated case SUCCEEDS —
//! before mutating exactly one thing. Two assertions in this module were WRONG
//! before a real run corrected them; both would have passed as green tests
//! proving the wrong proposition had the failure message not printed the actual
//! error. Keep that habit in anything added here.
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

    /// Assert a DISTRIBUTION-link refusal left no product-side residue at all.
    ///
    /// This is the composition claim for the first link. Credential bootstrap
    /// runs INSIDE `prepare_first_install`, so a chain that never reached the
    /// transaction must have created neither credential AND must have armed no
    /// bootstrap descriptor. The descriptor matters most of the three: it is
    /// durable, it is what a later recovery classifies, and one armed by a
    /// release that was never admitted would make a future bootstrap demand
    /// recovery for an install that never began.
    fn assert_no_product_residue(&self, after: &str) {
        let credentials = self.fixture.paths.credentials_dir();
        for name in ["ownership.cap", "attach.cred", BOOTSTRAP_DESCRIPTOR] {
            assert!(
                !credentials.join(name).exists(),
                "a refusal that never reached the transaction must leave no {name}, but {after} it did"
            );
        }
    }

    /// Whether the durable bootstrap descriptor is currently armed.
    fn descriptor_is_armed(&self) -> bool {
        self.fixture
            .paths
            .credentials_dir()
            .join(BOOTSTRAP_DESCRIPTOR)
            .exists()
    }
}

/// The durable bootstrap descriptor. Its PRESENCE is what arms recovery, and
/// its retirement is the disarm — which runs only after the receipt settles.
const BOOTSTRAP_DESCRIPTOR: &str = "bootstrap-credentials.v1";

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

    // The success side of the ordering contract, and the negative control for
    // `a_manifest_link_refusal_leaves_the_journal_clean_and_the_descriptor_armed`.
    // Retirement is the disarm and it runs only after the receipt settles, so a
    // settled install leaves NO armed descriptor. Read the two together: armed
    // on refusal, retired on success. Neither assertion means anything alone.
    assert!(
        !chain.descriptor_is_armed(),
        "a settled receipt must leave no armed bootstrap descriptor - retirement \
         is the disarm and it ran"
    );
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
    chain.assert_no_product_residue("after refusing expired metadata");
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
    chain.assert_no_product_residue("after refusing a version rollback");
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
    chain.assert_no_product_residue("after refusing a substituted archive");
}

/// Asking for a target the bundle does not carry is refused by the DISTRIBUTION
/// layer, before the install boundary ever sees a target.
///
/// The crossing claim is the point: a refusal at the FIRST link must leave zero
/// product-side residue, because the chain never reached the transaction. No
/// credential, no armed descriptor, no journal slot. The distribution authority
/// owns the refusal itself and proves it at its own entrypoint; what it cannot
/// see, and therefore cannot assert, is that the product stayed pristine.
///
/// It also records WHY the manifest layer's own `manifest_rejects_target_mismatch`
/// is not reachable from here. That is expected rather than suspicious — a
/// refusal belongs to the layer that owns it — but it is worth stating so the
/// next reader does not go looking for a chain expression of it.
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
    chain.assert_no_product_residue("after refusing an uncarried target");
}

/// A bundle published FOR another target, carrying that target's archive, is
/// still refused — and the refusal is a release-identity/digest refusal at the
/// install boundary, never `ManifestError::TargetMismatch`.
///
/// The complement to the case above, and the more interesting crossing. Here
/// the bundle genuinely carries the requested target, so verification SUCCEEDS
/// and the chain reaches the install boundary with a coherent Apple-Silicon
/// release. The refusal therefore belongs to the PRODUCT, and it is the
/// member-manifest reason, because the fixture's installed tree is a Windows
/// tree — the manifest-layer target comparison is never consulted.
///
/// Two links admitting a release that the third refuses is exactly the shape
/// only the chain can exhibit: neither layer alone can tell you that a release
/// good enough to verify is still not good enough to install.
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

// ---------------------------------------------------------------------------
// Cross-process install-lock contention, against a REAL second OS process
// ---------------------------------------------------------------------------

/// A hidden helper this module re-invokes as a real child process.
///
/// It holds the install lock at `D8_LOCK_PATH` for real, announces itself by
/// writing its pid to `D8_LOCK_READY`, and waits for `D8_LOCK_RELEASE` to appear
/// before dropping the guard. Under a normal `cargo test` run no environment is
/// set and it is a no-op, so it costs nothing.
///
/// Re-invoking the test binary is what makes the contention proof REAL. The
/// in-process case is already covered elsewhere, and it cannot distinguish a
/// lock that excludes another OS process from one that merely excludes another
/// handle in the same process — which is the only distinction that matters for
/// a lock whose entire job is to serialize separate installer invocations.
#[test]
fn d8_lock_holder_process() {
    let Ok(lock_path) = std::env::var("D8_LOCK_PATH") else {
        return;
    };
    let lock = crate::locking::InstallLock::new(&lock_path);
    let guard = lock
        .acquire(crate::locking::Actor::Installer, "d8-foreign-holder")
        .expect("the child acquires the install lock")
        .expect("the lock is free when the child starts");

    let ready = std::env::var("D8_LOCK_READY").expect("the child announces readiness");
    std::fs::write(&ready, std::process::id().to_string()).expect("announce the holding pid");

    let release = std::env::var("D8_LOCK_RELEASE").expect("the child is told when to release");
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(30);
    while std::time::Instant::now() < deadline {
        if std::path::Path::new(&release).exists() {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(25));
    }
    drop(guard);
}

/// Block until `path` exists, or give up at `budget`.
fn wait_for_file(path: &Path, budget: std::time::Duration) -> bool {
    let deadline = std::time::Instant::now() + budget;
    while std::time::Instant::now() < deadline {
        if path.exists() {
            return true;
        }
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
    false
}

/// The install lock excludes a genuinely separate OS process, and the refusal
/// is BOUNDED — it reports rather than queueing.
///
/// Boundedness is asserted, not assumed. The contract is a non-blocking try, so
/// an installer that finds the lock held must fail loudly instead of waiting
/// behind an update of unknown duration. A lock that queued would still "pass" a
/// test that only checked the eventual outcome, so this times the attempt while
/// the child is definitely still holding.
#[test]
fn the_install_lock_excludes_a_real_second_process_without_queueing() {
    let home = tempfile::tempdir().expect("temporary product home");
    let paths = crate::paths::ProductPaths::under_app_home(home.path());
    paths.ensure().expect("product directories");
    let lock_path = paths.install_lock_path();
    let ready = home.path().join("holder.ready");
    let release = home.path().join("holder.release");

    let mut child = std::process::Command::new(
        std::env::current_exe().expect("the test binary re-invokes itself"),
    )
    .args(["d8_lock_holder_process", "--nocapture", "--test-threads=1"])
    .env("D8_LOCK_PATH", &lock_path)
    .env("D8_LOCK_READY", &ready)
    .env("D8_LOCK_RELEASE", &release)
    .stdout(std::process::Stdio::null())
    .stderr(std::process::Stdio::null())
    .spawn()
    .expect("spawn the real second process");

    assert!(
        wait_for_file(&ready, std::time::Duration::from_secs(30)),
        "the child never announced that it holds the lock"
    );
    let holder_pid: u32 = std::fs::read_to_string(&ready)
        .expect("read the holding pid")
        .trim()
        .parse()
        .expect("the child wrote its pid");
    assert_ne!(
        holder_pid,
        std::process::id(),
        "the lock must be held by a genuinely different process"
    );

    // THE REFUSAL, timed. The child is still alive and still holding.
    let started = std::time::Instant::now();
    let outcome = crate::locking::InstallLock::new(&lock_path)
        .acquire(crate::locking::Actor::Installer, "d8-contender")
        .expect("a contended acquire is a refusal, not an I/O failure");
    let elapsed = started.elapsed();
    match outcome {
        Err(busy) => assert_eq!(
            busy.owner.as_deref(),
            Some("d8-foreign-holder"),
            "the refusal must name the foreign holder"
        ),
        Ok(_) => panic!("a lock held by a live foreign process must not be acquirable"),
    }
    assert!(
        elapsed < std::time::Duration::from_secs(5),
        "a contended acquire must report promptly rather than queue; took {elapsed:?}"
    );

    // Release, reap, and prove the exclusion was the LOCK rather than anything
    // permanent about the path.
    std::fs::write(&release, b"go").expect("tell the child to release");
    let status = child.wait().expect("reap the child");
    assert!(status.success(), "the holder exited badly: {status:?}");
    drop(
        crate::locking::InstallLock::new(&lock_path)
            .acquire(crate::locking::Actor::Installer, "d8-successor")
            .expect("acquire after release")
            .expect("the lock is free once the holder exits"),
    );
}

// ---------------------------------------------------------------------------
// The serialization constraint, made executable
// ---------------------------------------------------------------------------

/// A distribution verification cannot run while a product is BOUND.
///
/// This is the standing design constraint made testable rather than left as
/// prose. Verifying writes a trust datastore into the product root, which is
/// itself a root mutation; the product lease denies write sharing, and that
/// denial is also the anti-substitution guarantee. So the two are mutually
/// exclusive BY DESIGN, and first install and update both satisfy it by
/// verifying before they bind.
///
/// Nothing in production violates it today — traced across the whole engine:
/// the only production caller of the verifier verifies before binding, and
/// there is no release-rollback or repair flow at all (both `repair_immutable`
/// and `remove` are typed refusals, and the only executing "rollback" is
/// transaction abort, which verifies nothing). That makes the constraint
/// currently unenforced by anything except intent, which is exactly the
/// situation a test should fix: the day a rollback re-verifies a prior release
/// while holding a lease, this fails and says why.
///
/// If it ever DOES fail, the answer is a design question about serialization —
/// never a loosened sharing mode. Loosening it would silently falsify every
/// assertion that rests on the anti-substitution guarantee.
///
/// The control is inside the test: the same verification SUCCEEDS on the same
/// root once the product is dropped, so the refusal is attributable to the
/// binding and to nothing else about the fixture.
#[tokio::test(flavor = "current_thread")]
async fn a_verification_cannot_run_while_a_product_is_bound() {
    let chain = Chain::new().await;
    let identity = chain.identity();
    let bundle = chain.publish(1, &identity).await;

    let product = LockedProduct::bind(chain.fixture.paths.clone(), &chain.fixture.guard)
        .expect("locked product");
    let refused = chain.verify(&bundle, TARGET).await;
    assert!(
        matches!(refused, Err(VerificationError::DatastoreUnavailable)),
        "a verification under a bound product must be refused by the lease, got {refused:?}"
    );
    chain.assert_no_receipt("after refusing a verification under a bound product");

    // CONTROL: release the lease and the identical verification succeeds. Without
    // this the refusal above could be any latent defect in the fixture.
    drop(product);
    drop(
        chain
            .verify(&bundle, TARGET)
            .await
            .expect("the same verification succeeds once the product is unbound"),
    );
}

// ---------------------------------------------------------------------------
// Generation substitution and alias
// ---------------------------------------------------------------------------

/// The generation a settled receipt selects can be neither re-created nor
/// reached under an alias.
///
/// Two distinct attacks on the same name. Re-creating it would let a second
/// tree occupy the identity the receipt already points at; reaching it through
/// a traversal alias would let a caller aim the product outside the generations
/// parent while appearing to name a generation. Both are refused, and the
/// receipt still selects the original.
#[tokio::test(flavor = "current_thread")]
async fn the_receipt_selected_generation_resists_substitution_and_alias() {
    let chain = Chain::new().await;
    let identity = chain.identity();
    let bundle = chain.publish(1, &identity).await;
    let mut verified = chain
        .verify(&bundle, TARGET)
        .await
        .expect("the honest repository verifies");
    let release = chain
        .install(&mut verified, "generation-selected")
        .await
        .unwrap_or_else(|failure| {
            panic!("control install: {} - {}", failure.message, failure.detail)
        });
    assert_eq!(release.active_generation(), "generation-selected");

    let mut product = LockedProduct::bind(chain.fixture.paths.clone(), &chain.fixture.guard)
        .expect("locked product");

    // SUBSTITUTION: the selected name is not available for a second tree.
    let refused = product
        .create_unpublished("generation-selected")
        .expect_err("the receipt-selected generation must not be re-creatable");
    // `Refused` rather than any error: it is the variant that carries no
    // residue, so this also asserts the rejected substitution left nothing on
    // disk under the selected name.
    assert!(
        matches!(
            refused,
            crate::generation::CreateUnpublishedError::Refused(
                crate::generation::GenerationError::SelectedByActiveReceipt(_)
                    | crate::generation::GenerationError::AlreadyExists(_)
            )
        ),
        "expected a residue-free substitution refusal naming the selected generation, got {refused}"
    );

    // ALIAS: a name that traverses out of the generations parent is refused by
    // the path grammar, before anything is created.
    for alias in [
        "../generation-selected",
        "generation-selected/../generation-elsewhere",
        ".",
    ] {
        let refused = product
            .create_unpublished(alias)
            .err()
            .unwrap_or_else(|| panic!("the alias {alias:?} must not resolve to a generation"));
        assert!(
            matches!(
                refused,
                crate::generation::CreateUnpublishedError::Refused(
                    crate::generation::GenerationError::Path(_)
                )
            ),
            "expected {alias:?} to be refused by the path grammar with no residue, got {refused}"
        );
    }

    // The receipt still selects what it always selected.
    let observation = observe_active_release(&chain.fixture.paths, &chain.fixture.guard)
        .expect("journal observation");
    match observation.state().expect("settled state") {
        ActiveReleaseState::Settled(active) => {
            assert_eq!(active.active_generation(), "generation-selected");
        }
        other => panic!("expected the original settled release, got {other:?}"),
    }
}

// ---------------------------------------------------------------------------
// Credential refusals
// ---------------------------------------------------------------------------

/// Once a receipt has settled, no further bootstrap can mint ownership.
///
/// This is the collision that matters. Bootstrap is what CREATES the ownership
/// capability, so a second bootstrap against an installed product would mint a
/// second ownership secret for a product that already has an owner. The
/// precondition is checked against the fixed journal, not against the presence
/// of the credential files, so deleting them does not re-open the door.
#[tokio::test(flavor = "current_thread")]
async fn bootstrap_is_refused_once_a_receipt_has_settled() {
    let chain = Chain::new().await;
    let identity = chain.identity();
    let bundle = chain.publish(1, &identity).await;
    let mut verified = chain
        .verify(&bundle, TARGET)
        .await
        .expect("the honest repository verifies");
    drop(
        chain
            .install(&mut verified, "generation-owned")
            .await
            .unwrap_or_else(|failure| {
                panic!("control install: {} - {}", failure.message, failure.detail)
            }),
    );

    let store = crate::credentials::DashboardCredentialStore::for_product(&chain.fixture.paths);
    let refused = store
        .begin_bootstrap(&chain.fixture.guard)
        .expect_err("a settled receipt must refuse a second credential bootstrap");
    assert!(
        matches!(
            refused,
            crate::credentials::CredentialError::PlatformAuthorityUnavailable(_)
        ),
        "expected a settled-receipt refusal, got {refused:?}"
    );

    // And removing the credential FILES does not re-open it: the precondition is
    // the journal, not the residue.
    std::fs::remove_file(chain.fixture.paths.credentials_dir().join("ownership.cap"))
        .expect("remove the ownership credential");
    let refused = store
        .begin_bootstrap(&chain.fixture.guard)
        .expect_err("deleting the credential must not re-open bootstrap");
    assert!(
        matches!(
            refused,
            crate::credentials::CredentialError::PlatformAuthorityUnavailable(_)
        ),
        "expected the journal to still refuse bootstrap, got {refused:?}"
    );
}

/// A malformed credential token is refused as invalid, never read as a secret.
///
/// The negative control is the first half: the credential written by a real
/// install READS BACK cleanly, so the refusal below is attributable to the
/// corruption and not to the reader being broken for every input.
#[tokio::test(flavor = "current_thread")]
async fn a_malformed_credential_token_is_refused_rather_than_read() {
    let chain = Chain::new().await;
    let identity = chain.identity();
    let bundle = chain.publish(1, &identity).await;
    let mut verified = chain
        .verify(&bundle, TARGET)
        .await
        .expect("the honest repository verifies");
    drop(
        chain
            .install(&mut verified, "generation-tokens")
            .await
            .unwrap_or_else(|failure| {
                panic!("control install: {} - {}", failure.message, failure.detail)
            }),
    );

    let store = crate::credentials::DashboardCredentialStore::for_product(&chain.fixture.paths);
    let genuine = store
        .read_ownership()
        .expect("the credential a real install created reads back");
    assert_eq!(genuine.secret().len(), 64, "a token is 64 lowercase hex");

    // Each corruption violates a different clause of the token grammar: too
    // short, correct length but out of alphabet, and empty.
    for (label, corruption) in [
        ("truncated", "abc123"),
        ("non-hexadecimal", &"z".repeat(64)[..]),
        ("empty", ""),
    ] {
        std::fs::write(
            chain.fixture.paths.credentials_dir().join("ownership.cap"),
            corruption,
        )
        .expect("write the corrupted credential");
        let refused = store
            .read_ownership()
            .err()
            .unwrap_or_else(|| panic!("a {label} token must not read as a credential"));
        assert!(
            matches!(refused, crate::credentials::CredentialError::Invalid { .. }),
            "expected a {label} token to be refused as invalid, got {refused:?}"
        );
    }
}

// ---------------------------------------------------------------------------
// Bootstrap interruption recovery
// ---------------------------------------------------------------------------

/// An interrupted bootstrap is classified by PHASE, and resumes only into the
/// exact matching state.
///
/// The descriptor is published before either secret, so every interruption
/// after that point leaves durable state a later attempt must classify rather
/// than blindly overwrite. This walks the real phases on a real filesystem: a
/// descriptor with neither credential, then with exactly one. Each is a
/// distinct typed classification, and neither silently completes.
///
/// The refusal is the CORRECT outcome here, not a limitation: completing an
/// interrupted bootstrap automatically would mint ownership over residue nobody
/// has adjudicated.
#[tokio::test(flavor = "current_thread")]
async fn an_interrupted_bootstrap_is_classified_by_phase_and_never_auto_completes() {
    let chain = Chain::new().await;
    let store = crate::credentials::DashboardCredentialStore::for_product(&chain.fixture.paths);

    // PHASE ONE: descriptor durable, neither credential written. Dropping the
    // prepared value is the interruption — it leaves the descriptor behind by
    // design.
    let prepared = store
        .prepare_bootstrap(&chain.fixture.guard)
        .expect("a fresh product prepares a bootstrap");
    drop(prepared);
    assert!(
        chain
            .fixture
            .paths
            .credentials_dir()
            .join("bootstrap-credentials.v1")
            .exists(),
        "the interruption must leave the durable descriptor that makes recovery possible"
    );

    let refused = store
        .begin_bootstrap(&chain.fixture.guard)
        .expect_err("a descriptor with no credentials must require recovery");
    assert!(
        matches!(
            refused,
            crate::credentials::CredentialError::RecoveryRequired(
                crate::bootstrap::BootstrapRecoveryState::PreparedEmpty
            )
        ),
        "expected PreparedEmpty, got {refused:?}"
    );

    // PHASE TWO: both credentials exist and then ONE is lost. Getting here
    // honestly matters. The obvious arrangement — hand-writing a credential
    // file — does not work and should not: a file this process creates itself
    // does not carry the protected DACL the private-file policy demands, so the
    // reader refuses it as a policy violation long before any phase logic runs,
    // and the test would have been asserting the wrong thing entirely. So the
    // credentials are created by the REAL bootstrap and the interruption is
    // expressed by DELETING one, which needs no privileged creation.
    std::fs::remove_file(
        chain
            .fixture
            .paths
            .credentials_dir()
            .join("bootstrap-credentials.v1"),
    )
    .expect("clear the phase-one descriptor");
    let pending = store
        .begin_bootstrap(&chain.fixture.guard)
        .expect("a cleared product bootstraps for real");
    drop(pending);
    let attach = chain.fixture.paths.credentials_dir().join("attach.cred");
    assert!(
        attach.exists(),
        "the real bootstrap created both credentials"
    );
    std::fs::remove_file(&attach).expect("lose one credential");

    let refused = store
        .begin_bootstrap(&chain.fixture.guard)
        .expect_err("a bootstrap missing one of its described credentials must refuse");
    assert!(
        matches!(
            refused,
            crate::credentials::CredentialError::Missing(
                crate::credentials::CredentialRole::AttachControl
            )
        ),
        "expected the refusal to name the missing role, got {refused:?}"
    );

    // Throughout, nothing has settled. An interrupted bootstrap is inert: it is
    // the RECEIPT that authorizes, and no receipt was ever written.
    chain.assert_no_receipt("after an interrupted bootstrap");
}

// ---------------------------------------------------------------------------
// The manifest-link crossing: the ordering contract's FAILURE side
// ---------------------------------------------------------------------------

/// A refusal AFTER credential bootstrap but BEFORE the receipt settles leaves
/// the journal unmutated AND the bootstrap descriptor STILL ARMED.
///
/// This is the sharpest thing the chain can prove, and until now it was proven
/// on the success side only. The ordering contract is: bootstrap first, so an
/// interruption leaves durable state recovery can classify; then verify; then
/// commit the receipt; and ONLY once the receipt has settled, retire the
/// descriptor — because retiring it is the DISARM, and disarming recovery for a
/// receipt that never settled is precisely the corruption the ordering exists
/// to prevent.
///
/// Every clause of that has a success-side assertion today. None of it had a
/// failure-side one, which is the half that matters: an ordering contract whose
/// failure path is unasserted is a contract enforced by whoever remembers it.
/// If retirement ever migrated ahead of the commit, every existing test would
/// still pass and this one would fail.
///
/// The refusal is induced at the manifest link with a lock-drifted capsule —
/// a real adversarial input that the distribution authority correctly admits,
/// because it has no view of the component lock. Using an empty generation
/// would refuse at the same link but for a reason no attacker could produce.
///
/// The negative control is the whole point of the pairing: the SAME assertions
/// are made on the success path in `the_unmutated_harness_installs_and_settles`,
/// where the descriptor is GONE and the journal is Settled. Armed-versus-retired
/// is only meaningful as a contrast.
#[tokio::test(flavor = "current_thread")]
async fn a_manifest_link_refusal_leaves_the_journal_clean_and_the_descriptor_armed() {
    let mut chain = Chain::new().await;
    chain.fixture.mutate_capsule(|capsule| {
        let acp = capsule["assets"]
            .as_array_mut()
            .expect("capsule assets")
            .iter_mut()
            .find(|asset| asset["kind"] == "acp-adapter")
            .expect("the capsule pins the ACP adapter");
        acp["digest"] = serde_json::json!("0".repeat(64));
    });

    let identity = chain.identity();
    let bundle = chain.publish(1, &identity).await;

    // The chain must get PAST the distribution link for this to test anything.
    assert!(
        !chain.descriptor_is_armed(),
        "no descriptor may be armed before the transaction runs"
    );
    let mut verified = chain
        .verify(&bundle, TARGET)
        .await
        .expect("the distribution authority admits a lock-drifted release");

    let failure = chain
        .install(&mut verified, "generation-crossing")
        .await
        .expect_err("a lock-drifted capsule must not install");

    // The refusal is the MANIFEST link, named precisely — otherwise this could
    // be any later or earlier failure wearing the same outcome.
    assert_eq!(
        failure.kind(),
        crate::provisioning::ProvisioningErrorKind::FirstInstallAdapterUnavailable
    );
    assert!(
        failure
            .detail
            .contains("digest drift in assets[acp-adapter].digest"),
        "expected the manifest-link drift refusal, got: {}",
        failure.detail
    );

    // CROSSING CLAIM ONE: the receipt never moved.
    chain.assert_no_receipt("after a manifest-link refusal");

    // CROSSING CLAIM TWO: bootstrap DID run, so its credentials exist. This is
    // not incidental — it is what proves the chain reached past the bootstrap
    // and therefore that the descriptor question below is live rather than
    // vacuous.
    let credentials = chain.fixture.paths.credentials_dir();
    for name in ["ownership.cap", "attach.cred"] {
        assert!(
            credentials.join(name).exists(),
            "the refusal happened after bootstrap, so {name} must exist"
        );
    }

    // CROSSING CLAIM THREE, the one nobody asserted: the descriptor is STILL
    // ARMED. Retirement runs only after a settled receipt, and no receipt
    // settled, so recovery must remain armed for this interrupted install.
    assert!(
        chain.descriptor_is_armed(),
        "the descriptor must remain ARMED after a pre-commit refusal - retiring \
         it is the disarm, and disarming recovery for a receipt that never \
         settled is the corruption the bootstrap-then-commit-then-retire \
         ordering exists to prevent"
    );

    // CROSSING CLAIM FOUR: the failure still HOLDS the authority needed to
    // retry or clean up. A refusal that armed recovery and then dropped the
    // authority to resolve it would strand the descriptor forever.
    assert!(
        failure.retains_credential_authority(),
        "a pre-commit refusal must retain the authority that can retire what it armed"
    );
    assert!(failure.into_retained().is_some());
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
    chain.assert_no_product_residue("after refusing a mismatched cohort");
}
