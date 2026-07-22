//! The S11 integrated first-install proof.
//!
//! One chain, no diagnostic joins: ephemeral role keys sign a REAL TUF
//! repository whose selected target carries a REAL capsule archive; the
//! distribution authority verifies it and yields an opaque
//! [`VerifiedDistributionRelease`]; the sealed [`ProvisioningTransaction`]
//! consumes that capability, establishes first-install credentials, verifies the
//! release against a retained generation, and commits through the fixed receipt;
//! and the settled journal is then read back to confirm the receipt — and only
//! the receipt — selects the active release.
//!
//! WHY IT LIVES IN-CRATE. It cannot be an out-of-crate integration test, twice
//! over: `publish_active_receipt` is `pub(crate)` so publication is provable only
//! through the transaction, and the release-tree fixture rests on `pub(super)`
//! canonicalization algorithms (`tree_digest`, `cohort_descriptor_digest`) that a
//! second implementation would fork the release format to reproduce. Release
//! CONSTRUCTION is publisher-side by design — a consumer of this crate verifies
//! releases and never builds one — so those staying private is the correct shape,
//! not a gap (a2a-provisioning-authority D1). Widening them to relocate this
//! proof would trade a real seal for a test's address.
//!
//! WHAT THIS DOES NOT CLAIM. The transaction deliberately does not materialize:
//! it consumes an already-populated generation, because the archive materializer
//! owns that path and this must not become a second one. So the generation is
//! populated from the same release tree the verified archive was built from,
//! and what the chain proves is the PROVISIONING transaction, not a re-proof of
//! materialization.

use vaultspec_distribution_authority::{
    DistributionTarget, VerificationRequest, verify_distribution_with_unsealed_root,
};

use crate::channels::self_install::SelfInstallAuthority;
use crate::generation::LockedProduct;
use crate::manifest::tests::Fixture;
use crate::materializer::tests::{build_zip, release_entries};
use crate::provisioning::{ActiveReleaseState, ProvisioningTransaction, observe_active_release};

/// The target this fixture's release tree is built for.
const TARGET: DistributionTarget = DistributionTarget::X86_64PcWindowsMsvc;

/// The capsule root the fixture's release tree actually uses.
const CAPSULE_ROOT: &str = "a2a/capsule";

/// The integrated chain, end to end, with nothing stubbed between the links.
#[tokio::test(flavor = "current_thread")]
async fn sealed_first_install_commits_and_the_receipt_alone_selects_it() {
    let fixture = Fixture::new();
    let repository = tempfile::tempdir().expect("temporary release repository");

    // A REAL capsule archive over the REAL release tree this fixture verifies
    // against — one construction, so the archive cannot drift from the manifest.
    let archive = build_zip(&release_entries(&fixture));

    // Ephemeral role keys sign a real TUF repository carrying that archive.
    // A real retained generation, populated from the same tree the verified
    // archive carries. The transaction verifies it; it never materializes.
    // The release identity is the fixture's OWN, read off the release tree
    // rather than invented here. The installed member manifest names the cohort
    // it belongs to, so a cohort published under any other identity describes a
    // different release and is refused - correctly - at the install boundary.
    let identity = fixture.first_install_feed().release_identity;

    let material = vaultspec_release_fixtures::signing_material(repository.path()).await;
    let bundle = vaultspec_release_fixtures::publish_bundle_with_release(
        repository.path(),
        &material,
        1,
        &identity,
        // The cohort must DESCRIBE this release, not merely carry it: the
        // product verifies the tree it installed against the cohort's own
        // metadata, so real archive bytes under placeholder metadata describe a
        // different release and refuse at the install boundary. Every fact here
        // comes from the same fixture the archive was built from.
        &vaultspec_release_fixtures::RealRelease {
            target: TARGET,
            archive,
            member_manifest_sha256: fixture.member_digest_hex().to_owned(),
            component_lock: fixture.lock_bytes().to_vec(),
            capsule_root: CAPSULE_ROOT.to_owned(),
        },
    )
    .await;

    // The distribution authority verifies it, yielding opaque authority. No
    // caller digest participates and no trust anchor is exposed.
    //
    // ORDER IS LOAD-BEARING, and it is the production order: verify FIRST, then
    // bind. Verification writes its trust datastore into the product root and
    // must durably flush the root to publish those names; cap-std handles carry
    // no append access, so that flush reopens the root with append rights — and
    // the product's root lease denies write sharing, which is exactly the
    // anti-substitution guarantee. So the verification WORK cannot overlap a
    // bound product, and does not need to. What must span the bind is the
    // RETAINED SCOPE inside the opaque release, and it does: the assertion
    // below is taken AFTER binding, on the same live capability.
    let request = VerificationRequest::for_product_root(&bundle, fixture.paths.root(), TARGET)
        .expect("bounded verification request");
    let mut verified = verify_distribution_with_unsealed_root(&material.root_bytes, request)
        .await
        .expect("the real signed repository verifies");
    assert_eq!(verified.release_identity(), identity);

    let mut product =
        LockedProduct::bind(fixture.paths.clone(), &fixture.guard).expect("locked product");
    verified
        .verify_for_product_root(fixture.paths.root())
        .expect("the verified release still joins the root it was verified against");
    let mut generation = product
        .create_unpublished("generation-s11")
        .expect("real unpublished generation");
    fixture.populate(generation.path());

    let transaction = ProvisioningTransaction::begin_self_install(
        &fixture.paths,
        &fixture.guard,
        &SelfInstallAuthority::new(),
    )
    .expect("the guard binds this product root");

    let mut source = verified
        .materialization_source()
        .await
        .expect("sealed materialization source");
    // A bare `expect` here would print only the summary and elide the detail,
    // which is the one field that says WHICH link refused.
    let release = transaction
        .prepare_first_install(&mut generation, &mut source, 1_700_000_000_000)
        .unwrap_or_else(|failure| {
            panic!(
                "the sealed first install must commit: {:?} - {} - {}",
                failure.kind, failure.message, failure.detail
            )
        });

    // The receipt records that THIS install created ownership — derived from the
    // live credential proof, not asserted by the caller.
    assert!(release.bootstrap_created_ownership());
    assert_eq!(release.active_generation(), "generation-s11");

    // Credentials exist; the bootstrap descriptor is gone, because retirement
    // (the disarm) runs only after the receipt settles.
    let credentials = fixture.paths.credentials_dir();
    for name in ["ownership.cap", "attach.cred"] {
        assert!(credentials.join(name).exists(), "missing credential {name}");
    }
    assert!(
        !credentials.join("bootstrap-credentials.v1").exists(),
        "a settled receipt must leave no armed bootstrap descriptor"
    );

    // THE SELECTION CLAIM. Real neighbour generations exist on disk — one
    // unpublished, one a plausible fallback — and neither is chosen. Only the
    // settled receipt decides, which is the whole point of a fixed receipt.
    drop(generation);
    for neighbour in ["generation-unpublished", "generation-fallback"] {
        let other = product
            .create_unpublished(neighbour)
            .expect("real neighbour generation");
        fixture.populate(other.path());
    }

    let observation =
        observe_active_release(&fixture.paths, &fixture.guard).expect("journal observation");
    match observation.state().expect("settled state") {
        ActiveReleaseState::Settled(active) => {
            assert_eq!(
                active.active_generation(),
                "generation-s11",
                "the receipt, not the newest generation on disk, selects the active release"
            );
            assert!(active.bootstrap_created_ownership());
        }
        other => panic!("expected a settled active release, got {other:?}"),
    }
}
