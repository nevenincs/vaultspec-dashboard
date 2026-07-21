//! Dev-only scaffolding for building a REAL signed TUF release repository.
//!
//! This crate exists purely so more than one lane can build the same fixtures.
//! It composes ALREADY-PUBLIC `vaultspec-distribution-authority` API — the
//! publication entrypoint, its request/cohort types, and the closed target enum
//! — plus ordinary `aws-lc-rs` key generation. It reaches no private state, and
//! nothing here needed exposing; what was missing was a shared home, not access.
//!
//! It is consumed ONLY as a dev-dependency. No production target depends on it,
//! so it cannot leak into a shipped binary by construction rather than by
//! after-the-fact proof — which is why this is a crate and not a cargo feature.
//!
//! The keys are EPHEMERAL, generated per call. No production key material exists
//! here, and none may ever be added.

use std::collections::HashMap;
use std::num::NonZeroU64;
use std::path::{Path, PathBuf};

use aws_lc_rs::rand::SystemRandom;
use aws_lc_rs::signature::Ed25519KeyPair;
use base64::Engine as _;
use sha2::{Digest as _, Sha256};
use tough::schema::{Role as _, RoleKeys, RoleType, Root, Signature, Signed};
use tough::sign::Sign as _;
use vaultspec_distribution_authority::{
    COHORT_TARGET_NAME, CapsuleMetadata, CompatibilityRange, ComponentLock, DistributionTarget,
    FileReference, PublicationRequest, ReleaseCohort, ReleaseMember, ReleaseMetadata,
    RoleSigningKeys, write_release_repository,
};

pub struct SigningMaterial {
    pub root_path: PathBuf,
    pub root_bytes: Vec<u8>,
    pub targets_key: PathBuf,
    pub snapshot_key: PathBuf,
    pub timestamp_key: PathBuf,
    pub root_one: Ed25519KeyPair,
    pub root_two: Ed25519KeyPair,
    pub targets: Ed25519KeyPair,
    pub snapshot: Ed25519KeyPair,
    pub timestamp: Ed25519KeyPair,
}

pub async fn signing_material(root: &Path) -> SigningMaterial {
    let keys_dir = root.join("keys");
    std::fs::create_dir(&keys_dir).expect("keys directory");
    let (root_one, root_one_der) = keypair();
    let (root_two, _) = keypair();
    let (targets, targets_der) = keypair();
    let (snapshot, snapshot_der) = keypair();
    let (timestamp, timestamp_der) = keypair();

    let targets_path = keys_dir.join("targets.pk8");
    let snapshot_path = keys_dir.join("snapshot.pk8");
    let timestamp_path = keys_dir.join("timestamp.pk8");
    std::fs::write(&targets_path, targets_der).expect("targets key");
    std::fs::write(&snapshot_path, snapshot_der).expect("snapshot key");
    std::fs::write(&timestamp_path, timestamp_der).expect("timestamp key");

    let material = SigningMaterial {
        root_path: PathBuf::new(),
        root_bytes: Vec::new(),
        targets_key: targets_path,
        snapshot_key: snapshot_path,
        timestamp_key: timestamp_path,
        root_one,
        root_two,
        targets,
        snapshot,
        timestamp,
    };
    let root_bytes = signed_root(
        1,
        &[&material.root_one, &material.root_two],
        &[&material.root_one, &material.root_two],
        &material,
    );
    let root_path = root.join("1.root.json");
    std::fs::write(&root_path, &root_bytes).expect("signed root file");
    let _ = root_one_der;
    SigningMaterial {
        root_path,
        root_bytes,
        ..material
    }
}

pub fn signed_root(
    version: u64,
    root_role_pairs: &[&Ed25519KeyPair],
    signers: &[&Ed25519KeyPair],
    material: &SigningMaterial,
) -> Vec<u8> {
    let mut keys = HashMap::new();
    let mut root_keyids = Vec::with_capacity(root_role_pairs.len());
    for pair in root_role_pairs {
        let key = pair.tuf_key();
        let keyid = key.key_id().expect("root key id");
        keys.insert(keyid.clone(), key);
        root_keyids.push(keyid);
    }
    let mut roles = HashMap::new();
    roles.insert(
        RoleType::Root,
        RoleKeys {
            keyids: root_keyids,
            threshold: NonZeroU64::new(2).expect("two-key root threshold"),
            _extra: HashMap::new(),
        },
    );
    for (role, pair) in [
        (RoleType::Targets, &material.targets),
        (RoleType::Snapshot, &material.snapshot),
        (RoleType::Timestamp, &material.timestamp),
    ] {
        let key = pair.tuf_key();
        let keyid = key.key_id().expect("online role key id");
        keys.insert(keyid.clone(), key);
        roles.insert(
            role,
            RoleKeys {
                keyids: vec![keyid],
                threshold: NonZeroU64::new(1).expect("online role threshold"),
                _extra: HashMap::new(),
            },
        );
    }
    let root_role = Root {
        spec_version: "1.0.0".to_owned(),
        consistent_snapshot: true,
        version: NonZeroU64::new(version).expect("root version"),
        expires: "2035-01-01T00:00:00Z".parse().expect("future timestamp"),
        keys,
        roles,
        _extra: HashMap::new(),
    };
    let canonical = root_role.canonical_form().expect("canonical root");
    let signatures = signers
        .iter()
        .map(|pair| Signature {
            keyid: pair.tuf_key().key_id().expect("signer key id"),
            sig: Ed25519KeyPair::sign(pair, &canonical)
                .as_ref()
                .to_vec()
                .into(),
        })
        .collect();
    serde_json::to_vec_pretty(&Signed {
        signed: root_role,
        signatures,
    })
    .expect("signed root JSON")
}

pub fn keypair() -> (Ed25519KeyPair, Vec<u8>) {
    let document = Ed25519KeyPair::generate_pkcs8(&SystemRandom::new()).expect("generate key");
    let bytes = document.as_ref().to_vec();
    let pair = Ed25519KeyPair::from_pkcs8(&bytes).expect("parse generated key");
    (pair, bytes)
}

pub fn publication_request(
    output: PathBuf,
    material: &SigningMaterial,
    source: PathBuf,
    cohort: ReleaseCohort,
    version: u64,
) -> PublicationRequest {
    let version = NonZeroU64::new(version).expect("positive version");
    let expires = "2030-01-01T00:00:00Z".parse().expect("future expiry");
    PublicationRequest {
        root_history: vec![material.root_path.clone()],
        source_targets: source,
        output_metadata: output.join("metadata"),
        output_targets: output.join("targets"),
        signing_keys: RoleSigningKeys {
            targets: material.targets_key.clone(),
            snapshot: material.snapshot_key.clone(),
            timestamp: material.timestamp_key.clone(),
        },
        targets_version: version,
        snapshot_version: version,
        timestamp_version: version,
        targets_expires: expires,
        snapshot_expires: expires,
        timestamp_expires: expires,
        cohort,
    }
}

/// The closed five-target set, in canonical order. Built from the public enum
/// and its public `archive_name`, not from any private table.
const TARGETS: [DistributionTarget; 5] = [
    DistributionTarget::Aarch64AppleDarwin,
    DistributionTarget::X86_64AppleDarwin,
    DistributionTarget::Aarch64UnknownLinuxGnu,
    DistributionTarget::X86_64UnknownLinuxGnu,
    DistributionTarget::X86_64PcWindowsMsvc,
];

/// Lowercase hex SHA-256.
#[must_use]
pub fn digest_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub fn cohort_for(source: &Path, identity: &str) -> ReleaseCohort {
    let members = TARGETS
        .iter()
        .map(|target| {
            let name = target.archive_name();
            let bytes = archive_bytes(*target);
            std::fs::write(source.join(name), &bytes).expect("archive source");
            ReleaseMember {
                target: *target,
                archive: name.to_owned(),
                archive_length: bytes.len() as u64,
                archive_sha256: digest_hex(&bytes),
                member_manifest_sha256: digest_hex(format!("manifest-{name}").as_bytes()),
            }
        })
        .collect();
    let component_lock = b"dashboard=0.1.4\na2a=0.1.0\n";
    let digest = digest_hex(b"fixed");
    ReleaseCohort {
        schema_version: "1.0".to_owned(),
        release_identity: identity.to_owned(),
        component_lock: ComponentLock {
            bytes_base64: base64::engine::general_purpose::STANDARD.encode(component_lock),
            sha256: digest_hex(component_lock),
        },
        dashboard: ReleaseMetadata {
            version: "0.1.4".to_owned(),
            commit: "abc123".to_owned(),
            sha256: digest.clone(),
        },
        updater: ReleaseMetadata {
            version: "0.1.4".to_owned(),
            commit: "def456".to_owned(),
            sha256: digest.clone(),
        },
        capsule: CapsuleMetadata {
            root: "capsule".to_owned(),
            manifest_path: "capsule/manifest.json".to_owned(),
            contract_version: "1".to_owned(),
        },
        protocol: CompatibilityRange {
            minimum: 1,
            maximum: 1,
        },
        state: CompatibilityRange {
            minimum: 1,
            maximum: 1,
        },
        licenses: FileReference {
            path: "licenses/index.json".to_owned(),
            sha256: digest.clone(),
        },
        sbom: FileReference {
            path: "sbom/release.cdx.json".to_owned(),
            sha256: digest,
        },
        members,
    }
}

pub fn archive_bytes(target: DistributionTarget) -> Vec<u8> {
    format!("real archive bytes for {}\n", target.as_str()).into_bytes()
}

pub fn copy_directory(source: &Path, destination: &Path, include: impl Fn(&str) -> bool) {
    for entry in std::fs::read_dir(source).expect("source listing") {
        let entry = entry.expect("source entry");
        let name = entry.file_name();
        let name = name.to_str().expect("UTF-8 test filename");
        if include(name) {
            std::fs::copy(entry.path(), destination.join(name)).expect("copy repository file");
        }
    }
}

pub async fn publish_bundle_with_root(
    test_root: &Path,
    material: &SigningMaterial,
    root_history: &[PathBuf],
    version: u64,
    identity: &str,
    selected: DistributionTarget,
) -> PathBuf {
    let latest_root_bytes = std::fs::read(root_history.last().expect("nonempty root history"))
        .expect("read latest supplied root");
    let latest_root: Signed<Root> =
        serde_json::from_slice(&latest_root_bytes).expect("parse latest supplied root");
    let source = test_root.join(format!("source-{identity}"));
    std::fs::create_dir(&source).expect("source targets");
    let cohort = cohort_for(&source, identity);
    let output = test_root.join(format!("repository-{identity}"));
    let mut request = publication_request(output.clone(), material, source, cohort, version);
    request.root_history = root_history.to_vec();
    let publication = write_release_repository(request)
        .await
        .expect("publish real repository");
    assert_eq!(
        publication.root_version, latest_root.signed.version,
        "publication reports the actual latest supplied root document"
    );

    let bundle = test_root.join(format!("bundle-{identity}"));
    let metadata = bundle.join("metadata");
    let targets = bundle.join("targets");
    std::fs::create_dir_all(&metadata).expect("bundle metadata");
    std::fs::create_dir(&targets).expect("bundle targets");
    copy_directory(&output.join("metadata"), &metadata, |_| true);
    copy_directory(&output.join("targets"), &targets, |name| {
        name.ends_with(COHORT_TARGET_NAME) || name.ends_with(selected.archive_name())
    });
    bundle
}

pub async fn publish_bundle(
    test_root: &Path,
    material: &SigningMaterial,
    version: u64,
    identity: &str,
    selected: DistributionTarget,
) -> PathBuf {
    publish_bundle_with_root(
        test_root,
        material,
        std::slice::from_ref(&material.root_path),
        version,
        identity,
        selected,
    )
    .await
}
