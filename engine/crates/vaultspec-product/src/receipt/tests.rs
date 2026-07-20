use super::publish::{ACTIVE_RECEIPT_INIT_NAME, active_wire_from_facts, prepare_initial_journal};
use super::*;
use crate::generation::LockedProduct;
use crate::locking::{Actor, InstallLock};

struct JournalFixture {
    guard: InstallLockGuard,
    paths: ProductPaths,
    _root: tempfile::TempDir,
}

impl JournalFixture {
    fn new() -> Self {
        let root = tempfile::tempdir().unwrap();
        let paths = ProductPaths::under_app_home(root.path());
        paths.ensure().unwrap();
        let guard = InstallLock::new(paths.install_lock_path())
            .acquire(Actor::Installer, "receipt-s167-test")
            .unwrap()
            .unwrap();
        Self {
            guard,
            paths,
            _root: root,
        }
    }

    fn read(&self) -> Result<ActiveReceiptRead<'_>, ActiveReceiptJournalError> {
        read_active_receipt_journal(&self.paths, &self.guard)
    }
}

fn restrict_test_journal(path: &Path) {
    crate::credentials::restrict_to_owner(path).unwrap();
    #[cfg(windows)]
    {
        let whoami = std::process::Command::new("whoami.exe").output().unwrap();
        assert!(whoami.status.success());
        let user = String::from_utf8(whoami.stdout).unwrap();
        let grant = format!("{}:F", user.trim());
        let output = std::process::Command::new("icacls.exe")
            .arg(path)
            .args([
                "/inheritance:r",
                "/grant:r",
                &grant,
                "*S-1-5-18:F",
                "*S-1-5-32-544:F",
            ])
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "icacls failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
}

fn active_wire(generation: &str) -> ActiveReceiptWire {
    ActiveReceiptWire {
        schema_version: ACTIVE_RECEIPT_SCHEMA_VERSION.to_string(),
        dashboard_version: "0.1.4".to_string(),
        dashboard_commit: "a".repeat(40),
        dashboard_digest: "b".repeat(64),
        release_set_identity: "release-2026.07.19".to_string(),
        release_set_member_digest: "c".repeat(64),
        component_lock_digest: "d".repeat(64),
        external_five_member_cohort_digest: "e".repeat(64),
        target: Target::X86_64PcWindowsMsvc,
        a2a_identity: ActiveReleaseIdentityWire {
            name: "vaultspec-a2a".to_string(),
            version: "0.1.0".to_string(),
        },
        active_generation: generation.to_string(),
        channel: Channel::SelfInstall,
        bootstrap_created_ownership: true,
        prior_seat: Some(ActivePriorSeatWire {
            generation: "generation-prior".to_string(),
            dashboard_version: "0.1.3".to_string(),
            pid: Some(42),
        }),
        consistency_generation: 7,
        created_ms: 1_721_344_500_000,
    }
}

fn initial_binding(slot: usize, raw: &[u8; RECEIPT_SLOT_BYTES]) -> ProofBinding {
    ProofBinding::InitialReceipt {
        slot,
        sequence: read_u64(raw, 16),
        envelope_digest: sha256(raw),
    }
}

fn transaction_binding(
    prior_slot: usize,
    prior: &[u8; RECEIPT_SLOT_BYTES],
    target_slot: usize,
    preimage: TargetPreimage,
    intended: &[u8; RECEIPT_SLOT_BYTES],
) -> ProofBinding {
    let prior_sequence = read_u64(prior, 16);
    ProofBinding::Transaction(TransactionBinding {
        prior_slot,
        target_slot,
        prior_sequence,
        next_sequence: prior_sequence.checked_add(1).unwrap(),
        prior_envelope_digest: sha256(prior),
        target_preimage: preimage,
        intended_envelope_digest: sha256(intended),
    })
}

fn replicated(
    proof: [u8; PROOF_SUBRECORD_BYTES],
) -> [[Option<[u8; PROOF_SUBRECORD_BYTES]>; PROOF_SUBRECORDS]; PROOF_LOGICAL_REPLICAS] {
    std::array::from_fn(|_| [Some(proof), None])
}

fn write_journal<F>(
    fixture: &JournalFixture,
    slots: [Option<[u8; RECEIPT_SLOT_BYTES]>; RECEIPT_SLOT_COUNT],
    proofs: F,
) where
    F: FnOnce(
        JournalIdentity,
    )
        -> [[Option<[u8; PROOF_SUBRECORD_BYTES]>; PROOF_SUBRECORDS]; PROOF_LOGICAL_REPLICAS],
{
    write_journal_at(&fixture.paths, slots, proofs);
}

fn write_journal_at<F>(
    paths: &ProductPaths,
    slots: [Option<[u8; RECEIPT_SLOT_BYTES]>; RECEIPT_SLOT_COUNT],
    proofs: F,
) where
    F: FnOnce(
        JournalIdentity,
    )
        -> [[Option<[u8; PROOF_SUBRECORD_BYTES]>; PROOF_SUBRECORDS]; PROOF_LOGICAL_REPLICAS],
{
    let empty_proofs = std::array::from_fn(|_| std::array::from_fn(|_| None));
    let bytes = encode_journal_image(&slots, &empty_proofs);
    let path = paths.active_receipts_journal_path();
    std::fs::write(&path, &bytes).unwrap();
    restrict_test_journal(&path);
    let identity = open_journal(&path, false).unwrap().identity;
    let proofs = proofs(identity);
    let bytes = encode_journal_image(&slots, &proofs);
    std::fs::write(&path, bytes).unwrap();
    restrict_test_journal(&path);
}

fn assert_recovery_kind(fixture: &JournalFixture, expected: ActiveReceiptRecoveryKind) {
    let read = fixture.read().unwrap();
    let state = read.state().unwrap();
    let ActiveReceiptReadState::RecoveryRequired(recovery) = state else {
        panic!("expected RecoveryRequired, found {state:?}");
    };
    assert_eq!(recovery.kind(), expected);
    assert_eq!(recovery.prior().map(ActiveReceipt::sequence), Some(1));
    assert_eq!(
        recovery.prior().map(ActiveReceipt::active_generation),
        Some("generation-one")
    );
}

fn identity() -> ReleaseIdentity {
    ReleaseIdentity {
        name: "vaultspec-a2a".to_string(),
        version: "0.1.0".to_string(),
    }
}

#[derive(Clone, Copy)]
enum PublicationCutpoint {
    CreationOneActive,
    CreationTwoActive,
    ActivePartial,
    ActiveIntended,
    RetirementOneRetired,
    RetirementTwoRetired,
}

fn assert_publication_recovers_cutpoint(cutpoint: PublicationCutpoint) {
    use crate::manifest::tests::Fixture as ManifestFixture;

    let fixture = ManifestFixture::new();
    let mut product = LockedProduct::bind(fixture.paths.clone(), &fixture.guard).unwrap();
    let mut generation = product.create_unpublished("generation-2").unwrap();
    fixture.populate(generation.path());
    let verified = fixture.verify(&mut generation).unwrap();
    let intended_wire = active_wire_from_facts(verified.receipt_facts());
    let mut prior_wire = intended_wire.clone();
    prior_wire.active_generation = "generation-1".to_string();
    let prior = encode_receipt_slot(&prior_wire, 1).unwrap();
    let intended = encode_receipt_slot(&intended_wire, 2).unwrap();
    let initial = initial_binding(0, &prior);
    let transaction = transaction_binding(0, &prior, 1, TargetPreimage::Empty, &intended);
    let mut partial = [0_u8; RECEIPT_SLOT_BYTES];
    partial[0] = 0xff;
    let target = match cutpoint {
        PublicationCutpoint::CreationOneActive | PublicationCutpoint::CreationTwoActive => None,
        PublicationCutpoint::ActivePartial => Some(partial),
        PublicationCutpoint::ActiveIntended
        | PublicationCutpoint::RetirementOneRetired
        | PublicationCutpoint::RetirementTwoRetired => Some(intended),
    };
    write_journal_at(&fixture.paths, [Some(prior), target], |identity| {
        let old = encode_proof_record(identity, ProofState::Retired, 0, &initial);
        let active = encode_proof_record(identity, ProofState::Active, 1, &transaction);
        let retired = encode_proof_record(identity, ProofState::Retired, 2, &transaction);
        match cutpoint {
            PublicationCutpoint::CreationOneActive => {
                [[Some(active), None], [Some(old), None], [Some(old), None]]
            }
            PublicationCutpoint::CreationTwoActive => [
                [Some(active), None],
                [Some(active), None],
                [Some(old), None],
            ],
            PublicationCutpoint::ActivePartial | PublicationCutpoint::ActiveIntended => {
                replicated(active)
            }
            PublicationCutpoint::RetirementOneRetired => [
                [Some(retired), None],
                [Some(active), None],
                [Some(active), None],
            ],
            PublicationCutpoint::RetirementTwoRetired => [
                [Some(retired), None],
                [Some(retired), None],
                [Some(active), None],
            ],
        }
    });
    let path = fixture.paths.active_receipts_journal_path();
    let before = std::fs::read(&path).unwrap();

    publish_active_receipt(verified).unwrap();

    let after = std::fs::read(&path).unwrap();
    assert_eq!(
        &before[receipt_slot_range(0)],
        &after[receipt_slot_range(0)],
        "the already-active prior slot must remain byte-for-byte untouched"
    );
    let read = read_active_receipt_journal(&fixture.paths, &fixture.guard).unwrap();
    let ActiveReceiptReadState::Settled(receipt) = read.state().unwrap() else {
        panic!("recovered publication did not settle");
    };
    assert_eq!(receipt.sequence(), 2);
    assert_eq!(receipt.active_generation(), "generation-2");
}

#[test]
fn publisher_recovers_every_adjacent_writer_cutpoint() {
    for cutpoint in [
        PublicationCutpoint::CreationOneActive,
        PublicationCutpoint::CreationTwoActive,
        PublicationCutpoint::ActivePartial,
        PublicationCutpoint::ActiveIntended,
        PublicationCutpoint::RetirementOneRetired,
        PublicationCutpoint::RetirementTwoRetired,
    ] {
        assert_publication_recovers_cutpoint(cutpoint);
    }
}

#[derive(Clone, Copy)]
enum PublicationRefusal {
    ExistingEmpty,
    MismatchedVerifiedRelease,
    ThirdCompleteTarget,
    EqualDuplicateProofs,
}

fn assert_publication_refuses_without_mutation(case: PublicationRefusal) {
    use crate::manifest::tests::Fixture as ManifestFixture;

    let fixture = ManifestFixture::new();
    let mut product = LockedProduct::bind(fixture.paths.clone(), &fixture.guard).unwrap();
    let mut generation = product.create_unpublished("generation-3").unwrap();
    fixture.populate(generation.path());
    let verified = fixture.verify(&mut generation).unwrap();
    let verified_wire = active_wire_from_facts(verified.receipt_facts());
    let mut prior_wire = verified_wire.clone();
    prior_wire.active_generation = "generation-1".to_string();
    let mut other_wire = verified_wire.clone();
    other_wire.active_generation = "generation-2".to_string();
    let mut wrong_wire = verified_wire.clone();
    wrong_wire.active_generation = "generation-9".to_string();
    let prior = encode_receipt_slot(&prior_wire, 1).unwrap();
    let verified_intended = encode_receipt_slot(&verified_wire, 2).unwrap();
    let other_intended = encode_receipt_slot(&other_wire, 2).unwrap();
    let wrong_complete = encode_receipt_slot(&wrong_wire, 9).unwrap();
    match case {
        PublicationRefusal::ExistingEmpty => {
            write_journal_at(&fixture.paths, [None, None], |_| {
                std::array::from_fn(|_| std::array::from_fn(|_| None))
            });
        }
        PublicationRefusal::MismatchedVerifiedRelease => {
            let binding = transaction_binding(0, &prior, 1, TargetPreimage::Empty, &other_intended);
            write_journal_at(&fixture.paths, [Some(prior), None], |identity| {
                replicated(encode_proof_record(
                    identity,
                    ProofState::Active,
                    1,
                    &binding,
                ))
            });
        }
        PublicationRefusal::ThirdCompleteTarget => {
            let binding =
                transaction_binding(0, &prior, 1, TargetPreimage::Empty, &verified_intended);
            write_journal_at(
                &fixture.paths,
                [Some(prior), Some(wrong_complete)],
                |identity| {
                    replicated(encode_proof_record(
                        identity,
                        ProofState::Active,
                        1,
                        &binding,
                    ))
                },
            );
        }
        PublicationRefusal::EqualDuplicateProofs => {
            let binding =
                transaction_binding(0, &prior, 1, TargetPreimage::Empty, &verified_intended);
            write_journal_at(&fixture.paths, [Some(prior), None], |identity| {
                let active = encode_proof_record(identity, ProofState::Active, 1, &binding);
                std::array::from_fn(|_| [Some(active), Some(active)])
            });
        }
    }
    let path = fixture.paths.active_receipts_journal_path();
    let before = std::fs::read(&path).unwrap();
    let error = publish_active_receipt(verified).unwrap_err();
    assert_ne!(error.kind(), ActiveReceiptPublishFailureKind::Refused);
    drop(error);
    assert_eq!(std::fs::read(path).unwrap(), before);
}

#[test]
fn publisher_refuses_ambiguous_or_mismatched_images_without_mutation() {
    for case in [
        PublicationRefusal::ExistingEmpty,
        PublicationRefusal::MismatchedVerifiedRelease,
        PublicationRefusal::ThirdCompleteTarget,
        PublicationRefusal::EqualDuplicateProofs,
    ] {
        assert_publication_refuses_without_mutation(case);
    }
}

#[test]
fn first_install_reuses_the_exact_synchronized_init_residue() {
    use crate::manifest::tests::Fixture as ManifestFixture;

    let fixture = ManifestFixture::new();
    let mut product = LockedProduct::bind(fixture.paths.clone(), &fixture.guard).unwrap();
    let mut generation = product.create_unpublished("generation-1").unwrap();
    fixture.populate(generation.path());
    let verified = fixture.verify(&mut generation).unwrap();
    let wire = active_wire_from_facts(verified.receipt_facts());
    let (_, expected) = prepare_initial_journal(&verified, &fixture.paths, &wire)
        .unwrap_or_else(|error| panic!("init residue preparation failed: {}", error.message));
    assert_eq!(
        std::fs::read(fixture.paths.app_home().join(ACTIVE_RECEIPT_INIT_NAME)).unwrap(),
        expected
    );

    publish_active_receipt(verified).unwrap();

    assert_eq!(
        std::fs::read(fixture.paths.active_receipts_journal_path()).unwrap(),
        expected
    );
}

#[test]
fn first_install_refuses_a_different_exact_init_residue_without_mutation() {
    use crate::manifest::tests::Fixture as ManifestFixture;

    let fixture = ManifestFixture::new();
    let mut product = LockedProduct::bind(fixture.paths.clone(), &fixture.guard).unwrap();
    let mut first = product.create_unpublished("generation-1").unwrap();
    fixture.populate(first.path());
    let verified = fixture.verify(&mut first).unwrap();
    let wire = active_wire_from_facts(verified.receipt_facts());
    prepare_initial_journal(&verified, &fixture.paths, &wire)
        .unwrap_or_else(|error| panic!("init residue preparation failed: {}", error.message));
    drop(verified);
    drop(first);

    let init_path = fixture.paths.app_home().join(ACTIVE_RECEIPT_INIT_NAME);
    let before = std::fs::read(&init_path).unwrap();
    let mut second = product.create_unpublished("generation-2").unwrap();
    fixture.populate(second.path());
    let verified = fixture.verify(&mut second).unwrap();
    let error = publish_active_receipt(verified).unwrap_err();
    assert_eq!(
        error.kind(),
        ActiveReceiptPublishFailureKind::RecoveryRequired
    );
    drop(error);
    assert_eq!(std::fs::read(init_path).unwrap(), before);
    assert!(!fixture.paths.active_receipts_journal_path().exists());
}

#[cfg(windows)]
#[test]
fn real_s171_failures_preserve_both_attempts_and_retry_to_success() {
    use crate::manifest::tests::Fixture as ManifestFixture;
    use std::os::windows::fs::OpenOptionsExt;

    const FILE_SHARE_READ: u32 = 0x0000_0001;
    const FILE_SHARE_WRITE: u32 = 0x0000_0002;

    let fixture = ManifestFixture::new();
    let mut product = LockedProduct::bind(fixture.paths.clone(), &fixture.guard).unwrap();
    let mut generation = product.create_unpublished("generation-1").unwrap();
    fixture.populate(generation.path());
    let verified = fixture.verify(&mut generation).unwrap();
    let wire = active_wire_from_facts(verified.receipt_facts());
    prepare_initial_journal(&verified, &fixture.paths, &wire)
        .unwrap_or_else(|error| panic!("init residue preparation failed: {}", error.message));
    let init_path = fixture.paths.app_home().join(ACTIVE_RECEIPT_INIT_NAME);
    let blocker = OpenOptions::new()
        .read(true)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
        .open(&init_path)
        .unwrap();

    let first = publish_active_receipt(verified).unwrap_err();
    assert!(first.retains_install_authority());
    let second = first.retry().unwrap_err();
    assert!(second.retains_install_authority());
    assert_eq!(second.install_diagnostics().len(), 1);

    drop(blocker);
    second.retry().unwrap();
    let read = read_active_receipt_journal(&fixture.paths, &fixture.guard).unwrap();
    let ActiveReceiptReadState::Settled(receipt) = read.state().unwrap() else {
        panic!("S171 retry did not settle");
    };
    assert_eq!(receipt.active_generation(), "generation-1");
    assert_eq!(receipt.sequence(), 1);
}

#[test]
fn mutation_error_retains_the_exact_journal_handle() {
    let fixture = JournalFixture::new();
    let prior = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
    let intended = encode_receipt_slot(&active_wire("generation-two"), 2).unwrap();
    let initial = initial_binding(0, &prior);
    let transaction = transaction_binding(0, &prior, 1, TargetPreimage::Empty, &intended);
    write_journal(&fixture, [Some(prior), None], |identity| {
        let old = encode_proof_record(identity, ProofState::Retired, 0, &initial);
        let active = encode_proof_record(identity, ProofState::Active, 1, &transaction);
        [
            [Some(active), None],
            [Some(active), None],
            [Some(old), None],
        ]
    });
    let path = fixture.paths.active_receipts_journal_path();
    let handle = open_journal(&path, true).unwrap();
    let replacement = encode_proof_record(handle.identity, ProofState::Retired, 2, &transaction);
    let bytes = std::fs::read(&path).unwrap();
    let error = write_journal_range_and_reopen(
        &path,
        handle,
        bytes,
        proof_subrecord_range(0, 0),
        &replacement,
    )
    .unwrap_err();
    assert!(matches!(error, ActiveReceiptJournalError::Mutation { .. }));
    #[cfg(windows)]
    {
        assert!(OpenOptions::new().write(true).open(&path).is_err());
        assert!(std::fs::remove_file(&path).is_err());
    }
    drop(error);
    #[cfg(windows)]
    {
        drop(OpenOptions::new().write(true).open(&path).unwrap());
        std::fs::remove_file(path).unwrap();
    }
}

#[test]
fn fixed_reader_is_absent_and_never_accepts_legacy_receipt_json() {
    let fixture = JournalFixture::new();
    Receipt::bootstrap(
        Channel::SelfInstall,
        Target::X86_64PcWindowsMsvc,
        identity(),
        "legacy-generation",
        1,
    )
    .persist(&fixture.paths.receipt_path())
    .unwrap();

    let read = fixture.read().unwrap();
    assert!(matches!(
        read.state().unwrap(),
        ActiveReceiptReadState::Absent
    ));
}

#[test]
fn empty_journal_never_selects_and_one_initial_slot_is_exactly_bound() {
    let fixture = JournalFixture::new();
    write_journal(&fixture, [None, None], |journal_identity| {
        replicated(encode_proof_record(
            journal_identity,
            ProofState::Retired,
            0,
            &ProofBinding::EmptyJournal,
        ))
    });
    let empty = fixture.read().unwrap();
    assert!(matches!(
        empty.state().unwrap(),
        ActiveReceiptReadState::Absent
    ));
    drop(empty);

    let slot = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
    let binding = initial_binding(0, &slot);
    write_journal(&fixture, [Some(slot), None], |journal_identity| {
        replicated(encode_proof_record(
            journal_identity,
            ProofState::Retired,
            0,
            &binding,
        ))
    });
    let settled = fixture.read().unwrap();
    let ActiveReceiptReadState::Settled(receipt) = settled.state().unwrap() else {
        panic!("expected settled receipt");
    };
    assert_eq!(receipt.sequence(), 1);
    assert_eq!(receipt.schema_version(), ACTIVE_RECEIPT_SCHEMA_VERSION);
    assert_eq!(receipt.dashboard_version(), "0.1.4");
    assert_eq!(receipt.dashboard_commit(), "a".repeat(40));
    assert_eq!(receipt.dashboard_digest(), "b".repeat(64));
    assert_eq!(receipt.release_set_identity(), "release-2026.07.19");
    assert_eq!(receipt.release_set_member_digest(), "c".repeat(64));
    assert_eq!(receipt.component_lock_digest(), "d".repeat(64));
    assert_eq!(receipt.external_five_member_cohort_digest(), "e".repeat(64));
    assert_eq!(receipt.target(), Target::X86_64PcWindowsMsvc);
    assert_eq!(receipt.a2a_identity().name, "vaultspec-a2a");
    assert_eq!(receipt.active_generation(), "generation-one");
    assert_eq!(receipt.channel(), Channel::SelfInstall);
    assert!(receipt.bootstrap_created_ownership());
    assert_eq!(receipt.prior_seat().unwrap().pid, Some(42));
    assert_eq!(receipt.consistency_generation(), 7);
    assert_eq!(receipt.created_ms(), 1_721_344_500_000);
}

#[test]
fn two_retired_genesis_replicas_require_recovery_without_prior_authority() {
    let fixture = JournalFixture::new();
    write_journal(&fixture, [None, None], |identity| {
        let retired = encode_proof_record(
            identity,
            ProofState::Retired,
            0,
            &ProofBinding::EmptyJournal,
        );
        [[Some(retired), None], [Some(retired), None], [None, None]]
    });
    let empty = fixture.read().unwrap();
    let ActiveReceiptReadState::RecoveryRequired(recovery) = empty.state().unwrap() else {
        panic!("two retired empty-journal proofs must require recovery");
    };
    assert_eq!(recovery.kind(), ActiveReceiptRecoveryKind::ProofRetirement);
    assert!(recovery.prior().is_none());
    drop(empty);

    let slot = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
    let initial = initial_binding(0, &slot);
    write_journal(&fixture, [Some(slot), None], |identity| {
        let retired = encode_proof_record(identity, ProofState::Retired, 0, &initial);
        [[Some(retired), None], [Some(retired), None], [None, None]]
    });
    let initial_read = fixture.read().unwrap();
    let ActiveReceiptReadState::RecoveryRequired(recovery) = initial_read.state().unwrap() else {
        panic!("two retired initial-receipt proofs must require recovery");
    };
    assert_eq!(recovery.kind(), ActiveReceiptRecoveryKind::ProofRetirement);
    assert!(recovery.prior().is_none());
    drop(initial_read);

    let observation = crate::provisioning::observe_active_release(&fixture.paths, &fixture.guard)
        .expect("bounded provisioning observation");
    let crate::provisioning::ActiveReleaseState::RecoveryRequired(recovery) =
        observation.state().expect("bounded recovery state")
    else {
        panic!("provisioning observation must preserve recovery classification");
    };
    assert_eq!(
        recovery.kind(),
        crate::provisioning::ActiveReleaseRecoveryKind::ProofRetirement
    );
    assert!(recovery.prior().is_none());
}

#[test]
fn unanimous_retired_transaction_selects_exact_next_slot() {
    let fixture = JournalFixture::new();
    let prior = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
    let intended = encode_receipt_slot(&active_wire("generation-two"), 2).unwrap();
    let binding = transaction_binding(0, &prior, 1, TargetPreimage::Empty, &intended);
    write_journal(&fixture, [Some(prior), Some(intended)], |identity| {
        replicated(encode_proof_record(
            identity,
            ProofState::Retired,
            2,
            &binding,
        ))
    });

    let read = fixture.read().unwrap();
    let ActiveReceiptReadState::Settled(receipt) = read.state().unwrap() else {
        panic!("expected settled receipt");
    };
    assert_eq!(receipt.sequence(), 2);
    assert_eq!(receipt.active_generation(), "generation-two");
}

#[test]
fn initial_proof_cannot_authorize_an_unbound_second_slot() {
    let fixture = JournalFixture::new();
    let bound = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
    let attacker = encode_receipt_slot(&active_wire("generation-nine"), 9).unwrap();
    let binding = initial_binding(0, &bound);
    write_journal(&fixture, [Some(bound), Some(attacker)], |identity| {
        replicated(encode_proof_record(
            identity,
            ProofState::Retired,
            0,
            &binding,
        ))
    });

    assert!(matches!(
        fixture.read(),
        Err(ActiveReceiptJournalError::Ambiguous(_))
    ));
}

#[test]
fn exact_size_and_no_follow_alias_are_fail_closed() {
    let fixture = JournalFixture::new();
    let path = fixture.paths.active_receipts_journal_path();
    for size in [
        ACTIVE_RECEIPT_JOURNAL_BYTES - 1,
        ACTIVE_RECEIPT_JOURNAL_BYTES + 1,
    ] {
        std::fs::write(&path, vec![0_u8; size]).unwrap();
        restrict_test_journal(&path);
        assert!(matches!(
            fixture.read(),
            Err(ActiveReceiptJournalError::Io { .. })
        ));
    }
    std::fs::remove_file(&path).unwrap();
    let target = fixture.paths.app_home().join("alias-target");
    std::fs::write(&target, vec![0_u8; ACTIVE_RECEIPT_JOURNAL_BYTES]).unwrap();
    restrict_test_journal(&target);
    #[cfg(unix)]
    std::os::unix::fs::symlink(&target, &path).unwrap();
    #[cfg(windows)]
    std::os::windows::fs::symlink_file(&target, &path).unwrap();
    assert!(matches!(
        fixture.read(),
        Err(ActiveReceiptJournalError::Io { .. })
    ));
}

#[test]
fn unknown_fields_semantic_digest_and_padding_damage_are_rejected() {
    let fixture = JournalFixture::new();
    let mut value = serde_json::to_value(active_wire("generation-one")).unwrap();
    value["unknown_authority"] = serde_json::json!(true);
    let unknown = encode_receipt_payload(&serde_json::to_vec(&value).unwrap(), 1).unwrap();

    let mut bad_semantic_wire = active_wire("../escape");
    bad_semantic_wire.dashboard_digest = "NOT-A-DIGEST".to_string();
    let semantic = encode_receipt_slot(&bad_semantic_wire, 1).unwrap();

    let mut digest = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
    digest[RECEIPT_ENVELOPE_HEADER_BYTES] ^= 0x01;
    let mut padding = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
    padding[RECEIPT_SLOT_BYTES - 1] = 1;

    for damaged in [unknown, semantic, digest, padding] {
        let binding = initial_binding(0, &damaged);
        write_journal(&fixture, [Some(damaged), None], |identity| {
            replicated(encode_proof_record(
                identity,
                ProofState::Retired,
                0,
                &binding,
            ))
        });
        assert!(fixture.read().is_err());
    }
}

#[test]
fn equal_sequence_receipts_and_missing_proof_quorum_are_rejected() {
    let fixture = JournalFixture::new();
    let left = encode_receipt_slot(&active_wire("generation-left"), 2).unwrap();
    let right = encode_receipt_slot(&active_wire("generation-right"), 2).unwrap();
    let binding = ProofBinding::Transaction(TransactionBinding {
        prior_slot: 0,
        target_slot: 1,
        prior_sequence: 2,
        next_sequence: 3,
        prior_envelope_digest: sha256(&left),
        target_preimage: TargetPreimage::Empty,
        intended_envelope_digest: sha256(&right),
    });
    write_journal(&fixture, [Some(left), Some(right)], |identity| {
        let first = encode_proof_record(identity, ProofState::Active, 1, &binding);
        let second = encode_proof_record(
            identity,
            ProofState::Retired,
            0,
            &ProofBinding::InitialReceipt {
                slot: 0,
                sequence: 2,
                envelope_digest: sha256(&left),
            },
        );
        let third = encode_proof_record(
            identity,
            ProofState::Retired,
            0,
            &ProofBinding::InitialReceipt {
                slot: 1,
                sequence: 2,
                envelope_digest: sha256(&right),
            },
        );
        [
            [Some(first), None],
            [Some(second), None],
            [Some(third), None],
        ]
    });
    assert!(matches!(
        fixture.read(),
        Err(ActiveReceiptJournalError::Ambiguous(_))
    ));
}

#[test]
fn dual_subrecord_torn_write_is_ignored_and_equal_sequence_divergence_invalidates_logical() {
    let fixture = JournalFixture::new();
    let prior = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
    let intended = encode_receipt_slot(&active_wire("generation-two"), 2).unwrap();
    let binding = transaction_binding(0, &prior, 1, TargetPreimage::Empty, &intended);
    write_journal(&fixture, [Some(prior), Some(intended)], |identity| {
        let valid = encode_proof_record(identity, ProofState::Retired, 2, &binding);
        let mut torn = valid;
        torn[16..24].copy_from_slice(&4_u64.to_le_bytes());
        torn[24] ^= 1;
        std::array::from_fn(|_| [Some(torn), Some(valid)])
    });
    let read = fixture.read().unwrap();
    assert!(matches!(
        read.state().unwrap(),
        ActiveReceiptReadState::Settled(_)
    ));
    drop(read);

    let divergent_binding = ProofBinding::Transaction(TransactionBinding {
        intended_envelope_digest: [9; 32],
        ..match binding.clone() {
            ProofBinding::Transaction(binding) => binding,
            _ => unreachable!(),
        }
    });
    write_journal(&fixture, [Some(prior), Some(intended)], |identity| {
        let valid = encode_proof_record(identity, ProofState::Retired, 2, &binding);
        let divergent = encode_proof_record(identity, ProofState::Retired, 2, &divergent_binding);
        [
            [Some(valid), Some(divergent)],
            [Some(valid), None],
            [Some(valid), None],
        ]
    });
    assert_recovery_kind(&fixture, ActiveReceiptRecoveryKind::ProofRetirement);
}

#[test]
fn unanimous_active_proof_is_recovery_for_preimage_partial_and_intended_target() {
    let fixture = JournalFixture::new();
    let prior = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
    let intended = encode_receipt_slot(&active_wire("generation-two"), 2).unwrap();
    let binding = transaction_binding(0, &prior, 1, TargetPreimage::Empty, &intended);
    let mut partial = [0_u8; RECEIPT_SLOT_BYTES];
    partial[0] = 0xff;

    for target in [None, Some(partial), Some(intended)] {
        write_journal(&fixture, [Some(prior), target], |identity| {
            replicated(encode_proof_record(
                identity,
                ProofState::Active,
                1,
                &binding,
            ))
        });
        assert_recovery_kind(&fixture, ActiveReceiptRecoveryKind::ActiveProof);
    }
}

#[test]
fn proof_creation_split_is_recovery_in_both_replica_directions() {
    let fixture = JournalFixture::new();
    let prior = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
    let intended = encode_receipt_slot(&active_wire("generation-two"), 2).unwrap();
    let initial = initial_binding(0, &prior);
    let transaction = transaction_binding(0, &prior, 1, TargetPreimage::Empty, &intended);

    for active_majority in [true, false] {
        write_journal(&fixture, [Some(prior), None], |identity| {
            let old = encode_proof_record(identity, ProofState::Retired, 0, &initial);
            let active = encode_proof_record(identity, ProofState::Active, 1, &transaction);
            if active_majority {
                [
                    [Some(active), None],
                    [Some(active), None],
                    [Some(old), None],
                ]
            } else {
                [[Some(old), None], [Some(old), None], [Some(active), None]]
            }
        });
        assert_recovery_kind(&fixture, ActiveReceiptRecoveryKind::ProofCreation);
    }
}

#[test]
fn proof_retirement_split_is_recovery_in_both_replica_directions() {
    let fixture = JournalFixture::new();
    let prior = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
    let intended = encode_receipt_slot(&active_wire("generation-two"), 2).unwrap();
    let transaction = transaction_binding(0, &prior, 1, TargetPreimage::Empty, &intended);

    for active_majority in [true, false] {
        write_journal(&fixture, [Some(prior), Some(intended)], |identity| {
            let active = encode_proof_record(identity, ProofState::Active, 1, &transaction);
            let retired = encode_proof_record(identity, ProofState::Retired, 2, &transaction);
            if active_majority {
                [
                    [Some(active), None],
                    [Some(active), None],
                    [Some(retired), None],
                ]
            } else {
                [
                    [Some(retired), None],
                    [Some(retired), None],
                    [Some(active), None],
                ]
            }
        });
        assert_recovery_kind(&fixture, ActiveReceiptRecoveryKind::ProofRetirement);
    }
}

#[test]
fn valid_nonadjacent_third_proof_and_transition_overflow_are_ambiguous() {
    let fixture = JournalFixture::new();
    let prior = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
    let intended = encode_receipt_slot(&active_wire("generation-two"), 2).unwrap();
    let transaction = transaction_binding(0, &prior, 1, TargetPreimage::Empty, &intended);
    write_journal(&fixture, [Some(prior), Some(intended)], |identity| {
        let active = encode_proof_record(identity, ProofState::Active, 1, &transaction);
        let nonadjacent = encode_proof_record(identity, ProofState::Retired, 4, &transaction);
        [
            [Some(active), None],
            [Some(active), None],
            [Some(nonadjacent), None],
        ]
    });
    assert!(matches!(
        fixture.read(),
        Err(ActiveReceiptJournalError::Ambiguous(_))
    ));

    write_journal(&fixture, [Some(prior), Some(intended)], |identity| {
        replicated(encode_proof_record(
            identity,
            ProofState::Active,
            u64::MAX,
            &transaction,
        ))
    });
    assert!(matches!(
        fixture.read(),
        Err(ActiveReceiptJournalError::Ambiguous(_))
    ));
}

#[test]
fn proof_identity_parity_and_authenticated_header_corruption_are_rejected() {
    let fixture = JournalFixture::new();
    let prior = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
    let intended = encode_receipt_slot(&active_wire("generation-two"), 2).unwrap();
    let transaction = transaction_binding(0, &prior, 1, TargetPreimage::Empty, &intended);

    write_journal(&fixture, [Some(prior), None], |mut identity| {
        identity.second ^= 1;
        replicated(encode_proof_record(
            identity,
            ProofState::Active,
            1,
            &transaction,
        ))
    });
    assert!(matches!(
        fixture.read(),
        Err(ActiveReceiptJournalError::Ambiguous(_))
    ));

    for (state, sequence) in [(ProofState::Active, 2), (ProofState::Retired, 1)] {
        write_journal(&fixture, [Some(prior), None], |identity| {
            replicated(encode_proof_record(identity, state, sequence, &transaction))
        });
        assert!(matches!(
            fixture.read(),
            Err(ActiveReceiptJournalError::Ambiguous(_))
        ));
    }

    for corrupt_offset in [10_usize, 12, 16] {
        write_journal(&fixture, [Some(prior), None], |identity| {
            let mut proof = encode_proof_record(identity, ProofState::Active, 1, &transaction);
            proof[corrupt_offset] ^= if corrupt_offset == 10 { 3 } else { 2 };
            replicated(proof)
        });
        assert!(matches!(
            fixture.read(),
            Err(ActiveReceiptJournalError::Ambiguous(_))
        ));
    }
}

#[cfg(windows)]
#[test]
fn permissive_windows_journal_acl_is_rejected() {
    let fixture = JournalFixture::new();
    let slot = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
    let initial = initial_binding(0, &slot);
    write_journal(&fixture, [Some(slot), None], |identity| {
        replicated(encode_proof_record(
            identity,
            ProofState::Retired,
            0,
            &initial,
        ))
    });
    let output = std::process::Command::new("icacls.exe")
        .arg(fixture.paths.active_receipts_journal_path())
        .args(["/grant", "*S-1-1-0:R"])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "icacls failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(matches!(
        fixture.read(),
        Err(ActiveReceiptJournalError::Io { .. })
    ));
}

#[cfg(windows)]
#[test]
fn preexisting_windows_hard_link_alias_is_rejected() {
    let fixture = JournalFixture::new();
    let slot = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
    let initial = initial_binding(0, &slot);
    write_journal(&fixture, [Some(slot), None], |identity| {
        replicated(encode_proof_record(
            identity,
            ProofState::Retired,
            0,
            &initial,
        ))
    });
    let path = fixture.paths.active_receipts_journal_path();
    let alias = fixture.paths.app_home().join("journal-preexisting-alias");
    std::fs::hard_link(&path, &alias).unwrap();

    assert!(matches!(
        fixture.read(),
        Err(ActiveReceiptJournalError::Io { .. })
    ));
    std::fs::remove_file(alias).unwrap();
}

#[cfg(windows)]
#[test]
fn successful_read_retains_windows_write_delete_lease_until_drop() {
    let fixture = JournalFixture::new();
    let slot = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
    let initial = initial_binding(0, &slot);
    write_journal(&fixture, [Some(slot), None], |identity| {
        replicated(encode_proof_record(
            identity,
            ProofState::Retired,
            0,
            &initial,
        ))
    });
    let path = fixture.paths.active_receipts_journal_path();
    let alias = fixture.paths.app_home().join("journal-live-alias");
    let read = fixture.read().unwrap();
    assert!(matches!(
        read.state().unwrap(),
        ActiveReceiptReadState::Settled(_)
    ));
    assert!(OpenOptions::new().write(true).open(&path).is_err());
    assert!(std::fs::remove_file(&path).is_err());
    std::fs::hard_link(&path, &alias).unwrap();
    assert!(OpenOptions::new().write(true).open(&alias).is_err());
    assert!(read.state().is_err());

    drop(read);
    drop(OpenOptions::new().write(true).open(&path).unwrap());
    std::fs::remove_file(&alias).unwrap();
}

#[test]
fn active_proof_rejects_prior_preimage_intention_and_third_complete_mismatches() {
    let fixture = JournalFixture::new();
    let prior = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
    let intended = encode_receipt_slot(&active_wire("generation-two"), 2).unwrap();
    let wrong_complete = encode_receipt_slot(&active_wire("generation-nine"), 9).unwrap();

    let base = match transaction_binding(0, &prior, 1, TargetPreimage::Empty, &intended) {
        ProofBinding::Transaction(binding) => binding,
        _ => unreachable!(),
    };
    let attacks = [
        (
            [Some(prior), None],
            TransactionBinding {
                prior_envelope_digest: [8; 32],
                ..base.clone()
            },
        ),
        (
            [Some(prior), Some(intended)],
            TransactionBinding {
                intended_envelope_digest: [9; 32],
                ..base.clone()
            },
        ),
        ([Some(prior), Some(wrong_complete)], base.clone()),
    ];
    for (slots, binding) in attacks {
        write_journal(&fixture, slots, |identity| {
            replicated(encode_proof_record(
                identity,
                ProofState::Active,
                1,
                &ProofBinding::Transaction(binding),
            ))
        });
        assert!(fixture.read().is_err());
    }

    let current = encode_receipt_slot(&active_wire("generation-two"), 2).unwrap();
    let old_target = encode_receipt_slot(&active_wire("generation-one"), 1).unwrap();
    let next = encode_receipt_slot(&active_wire("generation-three"), 3).unwrap();
    let bad_preimage = ProofBinding::Transaction(TransactionBinding {
        prior_slot: 1,
        target_slot: 0,
        prior_sequence: 2,
        next_sequence: 3,
        prior_envelope_digest: sha256(&current),
        target_preimage: TargetPreimage::Complete([7; 32]),
        intended_envelope_digest: sha256(&next),
    });
    write_journal(&fixture, [Some(old_target), Some(current)], |identity| {
        replicated(encode_proof_record(
            identity,
            ProofState::Active,
            3,
            &bad_preimage,
        ))
    });
    assert!(fixture.read().is_err());
}

#[test]
fn guard_from_another_product_is_rejected_before_absence() {
    let first = JournalFixture::new();
    let second = JournalFixture::new();
    assert!(matches!(
        read_active_receipt_journal(&second.paths, &first.guard),
        Err(ActiveReceiptJournalError::LockAuthority(_))
    ));
}

#[cfg(unix)]
#[test]
fn hard_link_alias_is_rejected() {
    let fixture = JournalFixture::new();
    let path = fixture.paths.active_receipts_journal_path();
    std::fs::write(&path, vec![0_u8; ACTIVE_RECEIPT_JOURNAL_BYTES]).unwrap();
    restrict_test_journal(&path);
    std::fs::hard_link(&path, fixture.paths.app_home().join("journal-alias")).unwrap();
    assert!(matches!(
        fixture.read(),
        Err(ActiveReceiptJournalError::Io { .. })
    ));
}

#[test]
fn bootstrap_receipt_roundtrips_and_retains_ownership() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("receipt.json");
    let r = Receipt::bootstrap(
        Channel::SelfInstall,
        Target::X86_64PcWindowsMsvc,
        identity(),
        "2026-07-19-a1b2",
        1_700_000_000_000,
    );
    r.persist(&path).unwrap();
    let loaded = Receipt::load(&path).unwrap();
    assert_eq!(loaded, r);
    assert!(loaded.bootstrap_created_ownership);
    assert_eq!(loaded.state, ReceiptState::Active);
    assert!(loaded.interruption.is_none());
}

#[test]
fn activation_clears_the_interruption_marker() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("receipt.json");
    let mut r = Receipt::bootstrap(
        Channel::Scoop,
        Target::X86_64PcWindowsMsvc,
        identity(),
        "gen-a",
        1,
    );
    r.mark(InterruptionMarker::Migrating, &path).unwrap();
    assert_eq!(Receipt::load(&path).unwrap().state, ReceiptState::Staged);
    r.activate(&path).unwrap();
    let live = Receipt::load(&path).unwrap();
    assert_eq!(live.state, ReceiptState::Active);
    assert!(live.interruption.is_none());
}

#[test]
fn sweep_removes_orphan_temps_but_never_the_active_receipt() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("receipt.json");
    Receipt::bootstrap(
        Channel::Msi,
        Target::X86_64PcWindowsMsvc,
        identity(),
        "g",
        1,
    )
    .persist(&path)
    .unwrap();
    // A temp from a provably-DEAD writer (a pid that is never a live process)
    // is reclaimed; a temp from a LIVE writer (this very process) is PRESERVED
    // so an in-flight atomic write is never corrupted out from under it.
    let dead_pid = u32::MAX - 7;
    let live_pid = std::process::id();
    let dead_tmp = dir.path().join(format!("receipt.json.tmp-{dead_pid}"));
    let live_tmp = dir.path().join(format!("receipt.json.tmp-{live_pid}"));
    std::fs::write(&dead_tmp, "x").unwrap();
    std::fs::write(&live_tmp, "x").unwrap();
    // Only the dead-pid temp is swept.
    assert_eq!(sweep_orphan_tmp(&path).unwrap(), 1);
    assert!(!dead_tmp.exists(), "the dead-writer temp is reclaimed");
    assert!(live_tmp.exists(), "the live-writer temp is preserved");
    // The active receipt survives and still loads.
    assert!(path.exists());
    assert!(Receipt::load(&path).is_ok());
    // A second sweep still preserves the live temp (nothing left to reclaim).
    assert_eq!(sweep_orphan_tmp(&path).unwrap(), 0);
    assert!(live_tmp.exists());
}
