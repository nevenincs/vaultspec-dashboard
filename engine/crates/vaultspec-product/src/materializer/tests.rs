use super::*;
use crate::generation::LockedProduct;
use crate::manifest::tests::Fixture;
use crate::transaction::UpdatePlan;
use std::io::Cursor;
use std::io::Write as _;

const CREATED_MS: i64 = 1_721_344_500_000;

/// One authored archive entry for the deterministic fixture builder.
#[derive(Clone)]
pub(crate) struct ZipInput {
    path: String,
    bytes: Vec<u8>,
    mode: u32,
    deflate: bool,
}

fn entry(path: &str, bytes: &[u8], mode: u32) -> ZipInput {
    ZipInput {
        path: path.to_string(),
        bytes: bytes.to_vec(),
        mode,
        deflate: bytes.len() > 32,
    }
}

/// Hand-rolled deterministic ZIP writer in the exact closed profile: flags 0,
/// zero timestamps, no extra fields or comments, Unix made-by with the mode in
/// the external attributes. Malformed variants mutate the finished bytes or
/// the input list.
pub(crate) fn build_zip(entries: &[ZipInput]) -> Vec<u8> {
    let mut out = Vec::new();
    let mut central = Vec::new();
    for input in entries {
        let mut crc = flate2::Crc::new();
        crc.update(&input.bytes);
        let crc = crc.sum();
        let data = if input.deflate {
            let mut encoder =
                flate2::write::DeflateEncoder::new(Vec::new(), flate2::Compression::default());
            encoder.write_all(&input.bytes).unwrap();
            encoder.finish().unwrap()
        } else {
            input.bytes.clone()
        };
        let method: u16 = if input.deflate { 8 } else { 0 };
        let offset = out.len() as u32;
        // Local header.
        out.extend_from_slice(&0x0403_4b50u32.to_le_bytes());
        out.extend_from_slice(&20u16.to_le_bytes());
        out.extend_from_slice(&0u16.to_le_bytes());
        out.extend_from_slice(&method.to_le_bytes());
        out.extend_from_slice(&0u16.to_le_bytes());
        out.extend_from_slice(&0u16.to_le_bytes());
        out.extend_from_slice(&crc.to_le_bytes());
        out.extend_from_slice(&(data.len() as u32).to_le_bytes());
        out.extend_from_slice(&(input.bytes.len() as u32).to_le_bytes());
        out.extend_from_slice(&(input.path.len() as u16).to_le_bytes());
        out.extend_from_slice(&0u16.to_le_bytes());
        out.extend_from_slice(input.path.as_bytes());
        out.extend_from_slice(&data);
        // Central record.
        central.extend_from_slice(&0x0201_4b50u32.to_le_bytes());
        central.extend_from_slice(&((3u16 << 8) | 20).to_le_bytes());
        central.extend_from_slice(&20u16.to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes());
        central.extend_from_slice(&method.to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes());
        central.extend_from_slice(&crc.to_le_bytes());
        central.extend_from_slice(&(data.len() as u32).to_le_bytes());
        central.extend_from_slice(&(input.bytes.len() as u32).to_le_bytes());
        central.extend_from_slice(&(input.path.len() as u16).to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes());
        central.extend_from_slice(&0u16.to_le_bytes());
        central.extend_from_slice(&((0o100_000u32 | input.mode) << 16).to_le_bytes());
        central.extend_from_slice(&offset.to_le_bytes());
        central.extend_from_slice(input.path.as_bytes());
    }
    let central_offset = out.len() as u32;
    let central_size = central.len() as u32;
    out.extend_from_slice(&central);
    out.extend_from_slice(&0x0605_4b50u32.to_le_bytes());
    out.extend_from_slice(&0u16.to_le_bytes());
    out.extend_from_slice(&0u16.to_le_bytes());
    out.extend_from_slice(&(entries.len() as u16).to_le_bytes());
    out.extend_from_slice(&(entries.len() as u16).to_le_bytes());
    out.extend_from_slice(&central_size.to_le_bytes());
    out.extend_from_slice(&central_offset.to_le_bytes());
    out.extend_from_slice(&0u16.to_le_bytes());
    out
}

fn deadline() -> Instant {
    Instant::now() + Duration::from_secs(60)
}

/// The fixture's release tree as archive inputs: every payload plus the
/// member manifest, with the fixture's entrypoint modes.
pub(crate) fn release_entries(fixture: &Fixture) -> Vec<ZipInput> {
    let executable_mode = u32::from_str_radix(fixture.entrypoint_mode_text(), 8).unwrap_or(0o755);
    let mut entries: Vec<ZipInput> = fixture
        .payload_files()
        .iter()
        .map(|(path, bytes)| {
            let mode = if path == "a2a/capsule/bin/vaultspec-a2a"
                || path == "a2a/capsule/bin/vaultspec-a2a-mcp"
            {
                executable_mode
            } else {
                0o644
            };
            entry(path, bytes, mode)
        })
        .collect();
    entries.push(entry("release.json", fixture.member_bytes(), 0o644));
    entries
}

fn preflight_bytes(
    zip: &[u8],
    member_digest: &str,
) -> Result<archive::ArchivePlan, MaterializeError> {
    let mut reader = Cursor::new(zip.to_vec());
    archive::preflight(&mut reader, zip.len() as u64, member_digest, deadline())
}

/// `(id, members)` extracted from the fixture's canonical five-member
/// descriptor.
fn descriptor_members(fixture: &Fixture) -> (String, Vec<(String, String)>) {
    let value: serde_json::Value = serde_json::from_slice(fixture.descriptor_bytes()).unwrap();
    let id = value["id"].as_str().unwrap().to_string();
    let members = value["members"]
        .as_array()
        .unwrap()
        .iter()
        .map(|member| {
            (
                member["target"].as_str().unwrap().to_string(),
                member["member_manifest_digest"]
                    .as_str()
                    .unwrap()
                    .to_string(),
            )
        })
        .collect();
    (id, members)
}

fn publish_prior(fixture: &Fixture, product: &mut LockedProduct<'_>) {
    let mut prior = product.create_unpublished("generation-0001").unwrap();
    fixture.populate(prior.path());
    let verified = fixture.verify(&mut prior).expect("prior verification");
    drop(crate::receipt::publish_active_receipt(verified).expect("prior receipt"));
}

fn update_plan(channel: Channel) -> UpdatePlan {
    UpdatePlan::new(
        7,
        "generation-0002",
        Some("generation-0001".to_string()),
        channel,
        "head-1",
    )
    .unwrap()
}

fn feed_for(fixture: &Fixture, zip: Vec<u8>) -> UpdateFeed<Cursor<Vec<u8>>> {
    let (release_identity, members) = descriptor_members(fixture);
    UpdateFeed {
        archive_length: zip.len() as u64,
        archive_sha256_hex: crate::hex::sha256(&zip),
        release_identity,
        target_triple: fixture.target_triple().to_string(),
        member_manifest_sha256: fixture.member_digest_hex().to_string(),
        members,
        component_lock: fixture.lock_bytes().to_vec(),
        capsule_root: "a2a/capsule".to_string(),
        reader: Cursor::new(zip),
    }
}

#[test]
fn preflight_accepts_the_release_archive_and_matches_the_trusted_inventory() {
    let fixture = Fixture::new();
    let zip = build_zip(&release_entries(&fixture));
    let plan = preflight_bytes(&zip, fixture.member_digest_hex()).expect("closed-profile plan");
    assert_eq!(plan.entries.len(), fixture.payload_files().len() + 1);
    assert_eq!(plan.entries[plan.manifest_index].path, "release.json");
    assert!(!plan.derived_directories.is_empty());
    // The synthesized descriptor byte-equals the fixture's canonical form.
    let (id, members) = descriptor_members(&fixture);
    let synthesized = synthesize_cohort_descriptor(&id, &members).expect("canonical descriptor");
    assert_eq!(synthesized, fixture.descriptor_bytes());
}

#[test]
fn the_closed_grammar_refuses_malformed_archives() {
    let fixture = Fixture::new();
    let digest = fixture.member_digest_hex().to_string();
    let base = release_entries(&fixture);

    // Trailing junk: the end record no longer sits exactly at the tail.
    let mut trailing = build_zip(&base);
    trailing.push(0);
    assert!(matches!(
        preflight_bytes(&trailing, &digest),
        Err(MaterializeError::ArchiveGrammar(_))
    ));

    // Duplicate entry path.
    let mut duplicated = base.clone();
    duplicated.push(entry("release.json", b"other", 0o644));
    assert!(matches!(
        preflight_bytes(&build_zip(&duplicated), &digest),
        Err(MaterializeError::ArchiveGrammar(_))
    ));

    // ASCII-casefold duplicate.
    let mut folded = base.clone();
    folded.push(entry("RELEASE.JSON", b"other", 0o644));
    assert!(matches!(
        preflight_bytes(&build_zip(&folded), &digest),
        Err(MaterializeError::ArchiveGrammar(_))
    ));

    // File/directory prefix collision.
    let mut prefixed = base.clone();
    prefixed.push(entry("a2a", b"file where a directory lives", 0o644));
    assert!(matches!(
        preflight_bytes(&build_zip(&prefixed), &digest),
        Err(MaterializeError::ArchiveGrammar(_))
    ));

    // Non-admitted mode.
    let mut moded = base.clone();
    moded.push(entry("extra/tool", b"x", 0o600));
    assert!(matches!(
        preflight_bytes(&build_zip(&moded), &digest),
        Err(MaterializeError::ArchiveGrammar(_))
    ));

    // Traversal and the transaction-reserved suffix.
    for bad in ["../escape", "dir/.entry.vsmz-tmp"] {
        let mut named = base.clone();
        named.push(entry(bad, b"x", 0o644));
        assert!(matches!(
            preflight_bytes(&build_zip(&named), &digest),
            Err(MaterializeError::ArchiveGrammar(_))
        ));
    }

    // Central/local disagreement: flip the local version-needed field of the
    // first entry.
    let mut drifted = build_zip(&base);
    drifted[4] = 99;
    assert!(matches!(
        preflight_bytes(&drifted, &digest),
        Err(MaterializeError::ArchiveGrammar(_))
    ));

    // Nonzero general-purpose flags in the first local header.
    let mut flagged = build_zip(&base);
    flagged[6] |= 0x08;
    assert!(matches!(
        preflight_bytes(&flagged, &digest),
        Err(MaterializeError::ArchiveGrammar(_))
    ));

    // An entry the trusted manifest does not declare.
    let mut extra = base.clone();
    extra.push(entry("unmanifested/file", b"sneaky", 0o644));
    assert!(matches!(
        preflight_bytes(&build_zip(&extra), &digest),
        Err(MaterializeError::ManifestInventory(_))
    ));

    // No entry matches the trusted member digest.
    assert!(matches!(
        preflight_bytes(&build_zip(&base), &"0".repeat(64)),
        Err(MaterializeError::ManifestInventory(_))
    ));
}

#[test]
fn activation_materializes_verifies_and_commits_through_the_fixed_receipt() {
    let fixture = Fixture::new();
    let mut product = LockedProduct::bind(fixture.paths.clone(), &fixture.guard).unwrap();
    publish_prior(&fixture, &mut product);

    let mut transaction = UpdateTransaction::begin(
        fixture.paths.clone(),
        &fixture.guard,
        update_plan(Channel::SelfInstall),
    )
    .unwrap();
    transaction
        .force_phase_for_test(InterruptionMarker::Migrating)
        .unwrap();
    let ready = transaction.ready_to_activate();

    let zip = build_zip(&release_entries(&fixture));
    let feed = feed_for(&fixture, zip);
    let limits = ActivationLimits::new(Duration::from_secs(120)).unwrap();
    let activated = match activate_update_feed(ready, &mut product, feed, limits, CREATED_MS) {
        Ok(activated) => activated,
        Err(failure) => panic!("activation failed: {}", failure.error()),
    };
    assert_eq!(activated.generation(), "generation-0002");
    assert_eq!(
        activated.into_transaction().phase(),
        InterruptionMarker::Activated
    );

    // The fixed receipt now selects the materialized candidate.
    let read = read_active_receipt_journal(&fixture.paths, &fixture.guard).unwrap();
    match read.state().unwrap() {
        ActiveReceiptReadState::Settled(receipt) => {
            assert_eq!(receipt.active_generation(), "generation-0002");
            assert_eq!(receipt.channel(), Channel::SelfInstall);
        }
        other => panic!("receipt not settled: {other:?}"),
    }
    drop(read);

    // The materialize descriptor retired with the settled receipt.
    assert!(
        descriptor::read_materialize_descriptor(&fixture.paths, &fixture.guard)
            .unwrap()
            .is_none()
    );

    // The installed bytes are the fixture's exact tree, and no
    // transaction-reserved temporary residue remains.
    let root = fixture.paths.generation_dir("generation-0002").unwrap();
    for (path, bytes) in fixture.payload_files() {
        assert_eq!(&std::fs::read(root.join(path)).unwrap(), bytes, "{path}");
    }
    assert_eq!(
        std::fs::read(root.join("release.json")).unwrap(),
        fixture.member_bytes()
    );
    let mut pending = vec![root.clone()];
    while let Some(directory) = pending.pop() {
        for child in std::fs::read_dir(&directory).unwrap() {
            let child = child.unwrap();
            let name = child.file_name().to_string_lossy().into_owned();
            assert!(
                !name.ends_with(archive::RESERVED_TEMP_SUFFIX),
                "temporary residue at {name}"
            );
            if child.file_type().unwrap().is_dir() {
                pending.push(child.path());
            }
        }
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt as _;
        let mode = std::fs::metadata(root.join("a2a/capsule/bin/vaultspec-a2a"))
            .unwrap()
            .permissions()
            .mode();
        assert_eq!(mode & 0o777, 0o755, "entrypoint keeps the admitted mode");
    }
}

#[test]
fn activation_refuses_the_wrong_phase_and_rolls_back_typed() {
    let fixture = Fixture::new();
    let mut product = LockedProduct::bind(fixture.paths.clone(), &fixture.guard).unwrap();
    publish_prior(&fixture, &mut product);

    let transaction = UpdateTransaction::begin(
        fixture.paths.clone(),
        &fixture.guard,
        update_plan(Channel::SelfInstall),
    )
    .unwrap();
    // Still `Staged`: the activation boundary was never reached.
    let ready = transaction.ready_to_activate();
    let zip = build_zip(&release_entries(&fixture));
    let feed = feed_for(&fixture, zip);
    let limits = ActivationLimits::new(Duration::from_secs(60)).unwrap();
    let failure = activate_update_feed(ready, &mut product, feed, limits, CREATED_MS)
        .expect_err("wrong phase must refuse");
    assert!(matches!(failure.error(), MaterializeError::Phase(_)));
    assert!(!failure.is_committed());
    failure.rollback().expect("pre-commit rollback");
    // The prior receipt still selects the prior generation.
    let read = read_active_receipt_journal(&fixture.paths, &fixture.guard).unwrap();
    match read.state().unwrap() {
        ActiveReceiptReadState::Settled(receipt) => {
            assert_eq!(receipt.active_generation(), "generation-0001");
        }
        other => panic!("receipt not settled: {other:?}"),
    }
}

#[test]
fn activation_refuses_a_manager_owned_channel_before_any_write() {
    let fixture = Fixture::new();
    let mut product = LockedProduct::bind(fixture.paths.clone(), &fixture.guard).unwrap();
    publish_prior(&fixture, &mut product);

    let mut transaction = UpdateTransaction::begin(
        fixture.paths.clone(),
        &fixture.guard,
        update_plan(Channel::Msi),
    )
    .unwrap();
    transaction
        .force_phase_for_test(InterruptionMarker::Migrating)
        .unwrap();
    let ready = transaction.ready_to_activate();
    let zip = build_zip(&release_entries(&fixture));
    let feed = feed_for(&fixture, zip);
    let limits = ActivationLimits::new(Duration::from_secs(60)).unwrap();
    let failure = activate_update_feed(ready, &mut product, feed, limits, CREATED_MS)
        .expect_err("manager channel must refuse");
    assert!(matches!(
        failure.error(),
        MaterializeError::ChannelNotSelfInstall
    ));
    assert!(
        descriptor::read_materialize_descriptor(&fixture.paths, &fixture.guard)
            .unwrap()
            .is_none(),
        "a refusal before preflight leaves no materialize descriptor"
    );
    failure.rollback().expect("pre-commit rollback");
}

#[test]
fn activation_limits_are_validated() {
    assert!(ActivationLimits::new(Duration::ZERO).is_err());
    assert!(ActivationLimits::new(Duration::from_secs(2 * 60 * 60)).is_err());
    assert!(ActivationLimits::new(Duration::from_secs(60)).is_ok());
}
