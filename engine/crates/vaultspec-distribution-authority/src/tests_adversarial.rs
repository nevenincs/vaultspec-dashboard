//! Adversarial fail-closed proofs over REAL re-signed repositories.
//!
//! Every fixture starts from a genuinely published repository and then re-signs
//! tampered role metadata with the held non-production test keys, so each
//! refusal below is reached only after real TUF signature validation — no
//! stubbed transport, no mocked verifier.  Together with the parent module this
//! closes the distribution-trust D2/D4 refusal matrix: expired metadata,
//! missing roles, mixed versions, unexpected target names, cohort/archive
//! digest mismatch, non-canonical cohort bytes, and tampered target bytes.

use super::*;
use aws_lc_rs::signature::Ed25519KeyPair;
use sha2::{Digest as _, Sha256};
use tempfile::TempDir;
use tough::TargetName;
use tough::schema::{Hashes, Role, Signature, Signed, Snapshot, Targets, Timestamp};

/// Re-sign one role document with a single held key, exactly as release
/// engineering would: canonical form, Ed25519 signature, declared key id.
fn resign<R: Role>(signed: R, pair: &Ed25519KeyPair) -> Vec<u8> {
    let canonical = signed.canonical_form().expect("canonical role form");
    let signatures = vec![Signature {
        keyid: pair.tuf_key().key_id().expect("signer key id"),
        sig: Ed25519KeyPair::sign(pair, &canonical)
            .as_ref()
            .to_vec()
            .into(),
    }];
    serde_json::to_vec_pretty(&Signed { signed, signatures }).expect("signed role JSON")
}

fn read_signed<R: serde::de::DeserializeOwned>(path: &Path) -> Signed<R> {
    let bytes = std::fs::read(path).expect("read role metadata");
    serde_json::from_slice(&bytes).expect("parse role metadata")
}

/// Apply one targets-metadata edit, then re-sign the complete dependent chain
/// (targets, snapshot, timestamp) so every digest and length in the snapshot
/// and timestamp meta agrees with the tampered bytes.  The result is a
/// repository that is fully signature-valid under the test root; only the
/// product-level refusal under test remains.
fn resign_targets_chain(
    metadata: &Path,
    material: &SigningMaterial,
    version: u64,
    edit: impl FnOnce(&mut Targets),
) {
    let targets_name = format!("{version}.targets.json");
    let mut targets: Signed<Targets> = read_signed(&metadata.join(&targets_name));
    edit(&mut targets.signed);
    let targets_bytes = resign(targets.signed, &material.targets);
    std::fs::write(metadata.join(&targets_name), &targets_bytes).expect("write targets");

    let snapshot_name = format!("{version}.snapshot.json");
    let mut snapshot: Signed<Snapshot> = read_signed(&metadata.join(&snapshot_name));
    let meta = snapshot
        .signed
        .meta
        .get_mut("targets.json")
        .expect("snapshot lists targets role");
    if meta.hashes.is_some() {
        meta.hashes = Some(Hashes {
            sha256: Sha256::digest(&targets_bytes).to_vec().into(),
            _extra: HashMap::new(),
        });
    }
    if meta.length.is_some() {
        meta.length = Some(targets_bytes.len() as u64);
    }
    let snapshot_bytes = resign(snapshot.signed, &material.snapshot);
    std::fs::write(metadata.join(&snapshot_name), &snapshot_bytes).expect("write snapshot");

    let mut timestamp: Signed<Timestamp> = read_signed(&metadata.join("timestamp.json"));
    let meta = timestamp
        .signed
        .meta
        .get_mut("snapshot.json")
        .expect("timestamp lists snapshot role");
    if meta.hashes.is_some() {
        meta.hashes = Some(Hashes {
            sha256: Sha256::digest(&snapshot_bytes).to_vec().into(),
            _extra: HashMap::new(),
        });
    }
    if meta.length.is_some() {
        meta.length = Some(snapshot_bytes.len() as u64);
    }
    let timestamp_bytes = resign(timestamp.signed, &material.timestamp);
    std::fs::write(metadata.join("timestamp.json"), &timestamp_bytes).expect("write timestamp");
}

/// Locate the single digest-prefixed target file with the given suffix.
fn digest_named_target(targets: &Path, suffix: &str) -> PathBuf {
    let mut found = None;
    for entry in std::fs::read_dir(targets).expect("targets listing") {
        let entry = entry.expect("targets entry");
        let name = entry.file_name();
        let name = name.to_str().expect("UTF-8 target name");
        if name.ends_with(suffix) {
            assert!(found.is_none(), "one digest-named file per target");
            found = Some(entry.path());
        }
    }
    found.expect("digest-named target present")
}

#[tokio::test(flavor = "current_thread")]
async fn expired_timestamp_metadata_is_refused() {
    let temp = TempDir::new().expect("temporary test root");
    let material = signing_material(temp.path()).await;
    let bundle = publish_bundle(
        temp.path(),
        &material,
        1,
        "expired-freeze",
        DistributionTarget::X86_64PcWindowsMsvc,
    )
    .await;
    let mut timestamp: Signed<Timestamp> = read_signed(&bundle.join("metadata/timestamp.json"));
    timestamp.signed.expires = "2020-01-01T00:00:00Z".parse().expect("past expiry");
    std::fs::write(
        bundle.join("metadata/timestamp.json"),
        resign(timestamp.signed, &material.timestamp),
    )
    .expect("write expired timestamp");
    let product = temp.path().join("product-expired");
    std::fs::create_dir(&product).expect("product root");
    let request = VerificationRequest::for_product_root(
        bundle,
        &product,
        DistributionTarget::X86_64PcWindowsMsvc,
    )
    .expect("request");
    assert!(matches!(
        verify_with_root(&material.root_bytes, request).await,
        Err(VerificationError::Tuf(_))
    ));
}

#[tokio::test(flavor = "current_thread")]
async fn missing_snapshot_role_metadata_is_refused() {
    let temp = TempDir::new().expect("temporary test root");
    let material = signing_material(temp.path()).await;
    let bundle = publish_bundle(
        temp.path(),
        &material,
        1,
        "missing-role",
        DistributionTarget::X86_64PcWindowsMsvc,
    )
    .await;
    std::fs::remove_file(bundle.join("metadata/1.snapshot.json")).expect("remove snapshot role");
    let product = temp.path().join("product-missing-role");
    std::fs::create_dir(&product).expect("product root");
    let request = VerificationRequest::for_product_root(
        bundle,
        &product,
        DistributionTarget::X86_64PcWindowsMsvc,
    )
    .expect("request");
    assert!(matches!(
        verify_with_root(&material.root_bytes, request).await,
        Err(VerificationError::Tuf(_))
    ));
}

#[tokio::test(flavor = "current_thread")]
async fn mixed_version_role_metadata_is_refused() {
    let temp = TempDir::new().expect("temporary test root");
    let material = signing_material(temp.path()).await;
    let older = publish_bundle(
        temp.path(),
        &material,
        1,
        "mix-older",
        DistributionTarget::X86_64PcWindowsMsvc,
    )
    .await;
    let newer = publish_bundle(
        temp.path(),
        &material,
        2,
        "mix-newer",
        DistributionTarget::X86_64PcWindowsMsvc,
    )
    .await;
    // Splice the correctly signed VERSION-ONE targets role into the version-two
    // repository: a classic mix-and-match, valid signatures on every file.
    std::fs::copy(
        older.join("metadata/1.targets.json"),
        newer.join("metadata/2.targets.json"),
    )
    .expect("splice older targets metadata");
    let product = temp.path().join("product-mixed");
    std::fs::create_dir(&product).expect("product root");
    let request = VerificationRequest::for_product_root(
        newer,
        &product,
        DistributionTarget::X86_64PcWindowsMsvc,
    )
    .expect("request");
    assert!(matches!(
        verify_with_root(&material.root_bytes, request).await,
        Err(VerificationError::Tuf(_))
    ));
}

#[tokio::test(flavor = "current_thread")]
async fn non_canonical_cohort_is_refused() {
    let temp = TempDir::new().expect("temporary test root");
    let material = signing_material(temp.path()).await;
    let bundle = publish_bundle(
        temp.path(),
        &material,
        1,
        "non-canonical",
        DistributionTarget::X86_64PcWindowsMsvc,
    )
    .await;
    let cohort_path = digest_named_target(&bundle.join("targets"), COHORT_TARGET_NAME);
    let canonical = std::fs::read(&cohort_path).expect("published canonical cohort");
    let value: serde_json::Value =
        serde_json::from_slice(&canonical).expect("cohort parses as JSON");
    let pretty = serde_json::to_vec_pretty(&value).expect("pretty cohort");
    assert_ne!(pretty, canonical, "pretty form must not be canonical");
    std::fs::remove_file(&cohort_path).expect("remove canonical cohort");
    let pretty_digest = Sha256::digest(&pretty);
    std::fs::write(
        bundle.join("targets").join(format!(
            "{}.{COHORT_TARGET_NAME}",
            hex_lower(&pretty_digest)
        )),
        &pretty,
    )
    .expect("write non-canonical cohort");
    resign_targets_chain(&bundle.join("metadata"), &material, 1, |targets| {
        let name = TargetName::new(COHORT_TARGET_NAME).expect("cohort target name");
        let entry = targets.targets.get_mut(&name).expect("cohort target entry");
        entry.length = pretty.len() as u64;
        entry.hashes.sha256 = pretty_digest.to_vec().into();
    });
    let product = temp.path().join("product-non-canonical");
    std::fs::create_dir(&product).expect("product root");
    let request = VerificationRequest::for_product_root(
        bundle,
        &product,
        DistributionTarget::X86_64PcWindowsMsvc,
    )
    .expect("request");
    assert!(matches!(
        verify_with_root(&material.root_bytes, request).await,
        Err(VerificationError::NonCanonicalCohort)
    ));
}

#[tokio::test(flavor = "current_thread")]
async fn metadata_level_unexpected_target_name_is_refused() {
    let temp = TempDir::new().expect("temporary test root");
    let material = signing_material(temp.path()).await;
    let bundle = publish_bundle(
        temp.path(),
        &material,
        1,
        "renamed-target",
        DistributionTarget::X86_64PcWindowsMsvc,
    )
    .await;
    // Keep the target count at exactly six while introducing a name outside the
    // closed contract — validly signed all the way down.
    resign_targets_chain(&bundle.join("metadata"), &material, 1, |targets| {
        let old = TargetName::new(COHORT_TARGET_NAME).expect("cohort target name");
        let entry = targets.targets.remove(&old).expect("cohort target entry");
        let unexpected = TargetName::new("cohort.v2.json").expect("unexpected target name");
        targets.targets.insert(unexpected, entry);
    });
    let product = temp.path().join("product-renamed");
    std::fs::create_dir(&product).expect("product root");
    let request = VerificationRequest::for_product_root(
        bundle,
        &product,
        DistributionTarget::X86_64PcWindowsMsvc,
    )
    .expect("request");
    assert!(matches!(
        verify_with_root(&material.root_bytes, request).await,
        Err(VerificationError::InvalidRepositoryLayout)
    ));
}

#[tokio::test(flavor = "current_thread")]
async fn cohort_archive_digest_mismatch_is_refused() {
    let temp = TempDir::new().expect("temporary test root");
    let material = signing_material(temp.path()).await;
    let bundle = publish_bundle(
        temp.path(),
        &material,
        1,
        "cohort-mismatch",
        DistributionTarget::X86_64PcWindowsMsvc,
    )
    .await;
    // Re-sign target metadata so a NON-selected member's digest disagrees with
    // the trusted cohort record: the cross-member consistency check must refuse
    // even though the selected archive itself is untouched.
    resign_targets_chain(&bundle.join("metadata"), &material, 1, |targets| {
        let name = TargetName::new(DistributionTarget::Aarch64AppleDarwin.archive_name())
            .expect("member target name");
        let entry = targets.targets.get_mut(&name).expect("member target entry");
        entry.hashes.sha256 = Sha256::digest(b"substituted member bytes").to_vec().into();
    });
    let product = temp.path().join("product-cohort-mismatch");
    std::fs::create_dir(&product).expect("product root");
    let request = VerificationRequest::for_product_root(
        bundle,
        &product,
        DistributionTarget::X86_64PcWindowsMsvc,
    )
    .expect("request");
    assert!(matches!(
        verify_with_root(&material.root_bytes, request).await,
        Err(VerificationError::InvalidCohort)
    ));
}

#[tokio::test(flavor = "current_thread")]
async fn tampered_selected_archive_bytes_are_refused() {
    let temp = TempDir::new().expect("temporary test root");
    let material = signing_material(temp.path()).await;
    let bundle = publish_bundle(
        temp.path(),
        &material,
        1,
        "tampered-archive",
        DistributionTarget::X86_64PcWindowsMsvc,
    )
    .await;
    let archive = digest_named_target(
        &bundle.join("targets"),
        DistributionTarget::X86_64PcWindowsMsvc.archive_name(),
    );
    std::fs::write(&archive, b"tampered archive bytes").expect("tamper archive");
    let product = temp.path().join("product-tampered");
    std::fs::create_dir(&product).expect("product root");
    let request = VerificationRequest::for_product_root(
        bundle,
        &product,
        DistributionTarget::X86_64PcWindowsMsvc,
    )
    .expect("request");
    assert!(matches!(
        verify_with_root(&material.root_bytes, request).await,
        Err(VerificationError::Tuf(_))
    ));
}
