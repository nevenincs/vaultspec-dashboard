//! Product-tree builder acceptance (a2a-product-provisioning W04.P08.S64/S65).
//!
//! The builder GENERATES release-set member manifests; the production verifier
//! (W01.P01.S06) VALIDATES them. These prove the two agree: an emit derived from
//! the real committed component lock verifies under that same lock, and a pin that
//! disagrees with the lock — or a floating selector — fails the emit's own
//! self-verification rather than shipping. Fixtures are derived from the committed
//! lock with the production parser, never copied from a run's output, so a drift
//! between these facts and the real pins fails the build.

use std::collections::BTreeMap;

use vaultspec_product::manifest::{CapsuleManifest, ComponentLock, Target};
use vaultspec_product::product_build::{
    A2aComponentEvidence, ComposedArtifact, ComposedMember, DashboardArtifact, EvidenceArtifact,
    LicenseArtifact, ProductBuildError, SbomArtifact, TreeEvidenceArtifact, emit_member_manifest,
    file_digests_from_scan, scan_composed_tree, verify_member_covers_tree,
};

const LOCK_JSON: &str = include_str!("../../../../packaging/a2a-component.lock.json");
const TARGET: Target = Target::X86_64PcWindowsMsvc;
const TRIPLE: &str = "x86_64-pc-windows-msvc";

fn lock() -> ComponentLock {
    ComponentLock::parse(LOCK_JSON).unwrap()
}

/// A capsule manifest whose pins agree with the committed lock for the Windows
/// target — the source of the protocol and state-schema ranges the emitter binds.
fn capsule(lock: &ComponentLock) -> CapsuleManifest {
    let python = lock.python_digest(TARGET).unwrap();
    let node = lock.node_digest(TARGET).unwrap();
    let acp = &lock.base_closure.acp.sha256;
    let a2a_version = &lock.a2a_source.release_identity.version;
    let raw = serde_json::json!({
        "contract_version": "2.0",
        "identity": { "name": lock.a2a_source.release_identity.name, "version": a2a_version },
        "target": TRIPLE,
        "compatibility": {
            "api_versions": { "minimum": "v1", "maximum": "v1" },
            "migration_range": { "base": "0001", "head": "0008" }
        },
        "consistency_group": {
            "stores": [
                { "kind": "primary-database", "derivable": false, "schema_authority": "alembic-migration-range", "schema_version": "0008" },
                { "kind": "checkpoint-database", "derivable": false, "schema_authority": "checkpointer-schema", "schema_version": "1.0.0" }
            ]
        },
        "entrypoints": {
            "gateway": { "kind": "gateway", "console_script": "vaultspec-a2a", "reference": "vaultspec_a2a.cli:main", "relative_command": ["bin", "vaultspec-a2a"] },
            "standalone_mcp": { "kind": "standalone-mcp", "console_script": "vaultspec-a2a-mcp", "reference": "vaultspec_a2a.mcp:main", "relative_command": ["bin", "vaultspec-a2a-mcp"] }
        },
        "digest_algorithm": "sha256",
        "assets": [
            { "kind": "python-runtime", "version": "3.13", "license": lock.base_closure.python.license, "digest": python },
            { "kind": "a2a-distribution", "version": a2a_version, "license": "MIT", "digest": "c".repeat(64) },
            { "kind": "node-runtime", "version": "22", "license": lock.base_closure.node.license, "digest": node },
            { "kind": "acp-adapter", "version": lock.base_closure.acp.version, "license": lock.base_closure.acp.license, "digest": acp }
        ],
        "dependency_lock": { "uv_lock_digest": "d".repeat(64), "package_lock_digest": "e".repeat(64) }
    });
    CapsuleManifest::parse_and_verify(&serde_json::to_string(&raw).unwrap(), lock, TARGET).unwrap()
}

/// A composed member whose facts agree with the committed lock for Windows — the
/// same pin set the S06 verifier accepts.
fn composed_member() -> ComposedMember {
    ComposedMember {
        target: TARGET,
        cohort_id: "release-2026.07.19".to_string(),
        cohort_targets: vec![
            Target::Aarch64AppleDarwin,
            Target::X86_64AppleDarwin,
            Target::Aarch64UnknownLinuxGnu,
            Target::X86_64UnknownLinuxGnu,
            Target::X86_64PcWindowsMsvc,
        ],
        release_manifest_path: "release.json".to_string(),
        dashboard: DashboardArtifact {
            version: "0.1.4".to_string(),
            commit: "a".repeat(40),
            artifact: ComposedArtifact {
                path: "bin/dashboard.exe".to_string(),
                size: 16,
                digest: "b".repeat(64),
            },
        },
        updater_version: "0.1.4".to_string(),
        updater: ComposedArtifact {
            path: "bin/updater.exe".to_string(),
            size: 16,
            digest: "c".repeat(64),
        },
        a2a_component: A2aComponentEvidence {
            component_lock: EvidenceArtifact {
                path: "packaging/a2a-component.lock.json".to_string(),
                digest: "d".repeat(64),
            },
            capsule_manifest: EvidenceArtifact {
                path: "a2a/component-manifest.json".to_string(),
                digest: "e".repeat(64),
            },
            capsule_archive: ComposedArtifact {
                path: "a2a/capsule.zip".to_string(),
                size: 20,
                digest: "f".repeat(64),
            },
            tree_evidence: TreeEvidenceArtifact {
                artifact: ComposedArtifact {
                    path: "a2a/tree.json".to_string(),
                    size: 24,
                    digest: "1".repeat(64),
                },
                tree_digest: "2".repeat(64),
                file_count: 3,
            },
        },
        licenses: vec![LicenseArtifact {
            component: "vaultspec-a2a".to_string(),
            spdx: "MIT".to_string(),
            path: "licenses/a2a.txt".to_string(),
            digest: "8".repeat(64),
        }],
        sbom: SbomArtifact {
            format: "cyclonedx".to_string(),
            artifact: ComposedArtifact {
                path: "sbom.cdx.json".to_string(),
                size: 32,
                digest: "9".repeat(64),
            },
        },
        file_digests: BTreeMap::from([("bin/dashboard.exe".to_string(), "b".repeat(64))]),
    }
}

#[test]
fn a_lock_consistent_member_emits_and_self_verifies() {
    let lock = lock();
    let capsule = capsule(&lock);
    let raw = emit_member_manifest(&composed_member(), &lock, &capsule)
        .expect("a lock-consistent member must emit and self-verify");
    // The emitted bytes are the schema-2.0 member manifest, already proven through
    // the production verifier inside emit; confirm it is the intended shape.
    let value: serde_json::Value = serde_json::from_str(&raw).unwrap();
    assert_eq!(value["schema_version"], "2.0");
    assert_eq!(value["target"], TRIPLE);
    assert_eq!(
        value["runtimes"]["cpython"]["digest"],
        lock.python_digest(TARGET).unwrap()
    );
    assert_eq!(
        value["protocol"]["gateway_api_version_range"]["maximum"],
        "v1"
    );
    assert_eq!(value["state_schema"]["migration_range"]["maximum"], "0008");
}

#[test]
fn the_emitter_derives_runtime_pins_from_the_lock_not_the_caller() {
    // The ComposedMember carries no runtime digests; the emitter binds them from
    // the trusted lock. A member cannot smuggle a divergent runtime pin.
    let lock = lock();
    let capsule = capsule(&lock);
    let raw = emit_member_manifest(&composed_member(), &lock, &capsule).unwrap();
    let value: serde_json::Value = serde_json::from_str(&raw).unwrap();
    assert_eq!(
        value["runtimes"]["node"]["digest"],
        lock.node_digest(TARGET).unwrap()
    );
    assert_eq!(
        value["runtimes"]["acp"]["digest"],
        lock.base_closure.acp.sha256
    );
    assert_eq!(value["a2a_component"]["commit"], lock.a2a_source.commit);
}

#[test]
fn an_incomplete_cohort_roster_fails_self_verification() {
    // Release-set skew (an S65 rejection): a member that does not carry the exact
    // five-target cohort roster must fail closed at the emitter's self-verify,
    // never ship. The roster is a caller-supplied fact, so the verifier is the
    // authority that catches a skewed one.
    let lock = lock();
    let capsule = capsule(&lock);
    let mut member = composed_member();
    member.cohort_targets.pop(); // four targets, not five
    let refused = emit_member_manifest(&member, &lock, &capsule);
    assert!(
        matches!(refused, Err(ProductBuildError::SelfVerify(_))),
        "an incomplete cohort roster must fail the emitter's self-verification, got {refused:?}"
    );
}

#[test]
fn scan_composed_tree_digests_every_regular_file_sorted() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    std::fs::create_dir_all(root.join("bin")).unwrap();
    std::fs::create_dir_all(root.join("a2a")).unwrap();
    std::fs::write(root.join("bin/dashboard.exe"), b"dashboard").unwrap();
    std::fs::write(root.join("empty.txt"), b"").unwrap();
    std::fs::write(root.join("a2a/capsule.zip"), b"zip-bytes").unwrap();

    let scanned = scan_composed_tree(root).unwrap();
    let paths: Vec<&str> = scanned
        .iter()
        .map(|artifact| artifact.path.as_str())
        .collect();
    // Sorted, forward-slashed, app-tree-relative — the same key space the verifier
    // applies to installed objects.
    assert_eq!(
        paths,
        vec!["a2a/capsule.zip", "bin/dashboard.exe", "empty.txt"]
    );

    let empty = scanned
        .iter()
        .find(|artifact| artifact.path == "empty.txt")
        .unwrap();
    assert_eq!(empty.size, 0);
    // The well-known SHA-256 of the empty byte string proves the canonical hash.
    assert_eq!(
        empty.digest,
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );

    let dashboard = scanned
        .iter()
        .find(|artifact| artifact.path == "bin/dashboard.exe")
        .unwrap();
    assert_eq!(dashboard.size, 9);
    assert_eq!(dashboard.digest.len(), 64);
    assert!(
        dashboard
            .digest
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()),
        "digests are lowercase hex"
    );
}

fn artifact(path: &str, digest: &str) -> ComposedArtifact {
    ComposedArtifact {
        path: path.to_string(),
        size: 3,
        digest: digest.to_string(),
    }
}

#[test]
fn a_member_covering_exactly_the_tree_passes() {
    let scanned = vec![
        artifact("bin/dashboard.exe", &"a".repeat(64)),
        artifact("bin/updater.exe", &"b".repeat(64)),
        artifact("release.json", &"c".repeat(64)),
    ];
    let mut member = composed_member();
    member.file_digests = file_digests_from_scan(&scanned, &member.release_manifest_path);
    // The manifest's own path is excluded from file_digests.
    assert!(!member.file_digests.contains_key("release.json"));
    verify_member_covers_tree(&member, &scanned).expect("an exact cover must pass");
}

#[test]
fn a_missing_file_digest_is_rejected() {
    let scanned = vec![
        artifact("bin/dashboard.exe", &"a".repeat(64)),
        artifact("bin/updater.exe", &"b".repeat(64)),
    ];
    let mut member = composed_member();
    // Only the dashboard is declared; the updater on disk is uncovered.
    member.file_digests = BTreeMap::from([("bin/dashboard.exe".to_string(), "a".repeat(64))]);
    let refused = verify_member_covers_tree(&member, &scanned);
    assert!(matches!(
        refused,
        Err(ProductBuildError::FileDigestsMismatch { .. })
    ));
}

#[test]
fn an_extra_file_digest_is_rejected() {
    let scanned = vec![artifact("bin/dashboard.exe", &"a".repeat(64))];
    let mut member = composed_member();
    member.file_digests = BTreeMap::from([
        ("bin/dashboard.exe".to_string(), "a".repeat(64)),
        ("bin/ghost.exe".to_string(), "b".repeat(64)),
    ]);
    let refused = verify_member_covers_tree(&member, &scanned);
    assert!(matches!(
        refused,
        Err(ProductBuildError::FileDigestsMismatch { .. })
    ));
}

#[test]
fn a_drifted_file_digest_is_rejected() {
    let scanned = vec![artifact("bin/dashboard.exe", &"a".repeat(64))];
    let mut member = composed_member();
    member.file_digests = BTreeMap::from([("bin/dashboard.exe".to_string(), "z".repeat(64))]);
    let refused = verify_member_covers_tree(&member, &scanned);
    assert!(matches!(
        refused,
        Err(ProductBuildError::FileDigestsMismatch { .. })
    ));
}

#[test]
fn a_self_listed_manifest_path_is_rejected() {
    let scanned = vec![
        artifact("bin/dashboard.exe", &"a".repeat(64)),
        artifact("release.json", &"c".repeat(64)),
    ];
    let mut member = composed_member();
    member.file_digests = BTreeMap::from([
        ("bin/dashboard.exe".to_string(), "a".repeat(64)),
        ("release.json".to_string(), "c".repeat(64)),
    ]);
    let refused = verify_member_covers_tree(&member, &scanned);
    assert!(matches!(
        refused,
        Err(ProductBuildError::FileDigestsMismatch { .. })
    ));
}

fn write_source(dir: &std::path::Path, name: &str, bytes: &[u8]) -> std::path::PathBuf {
    let path = dir.join(name);
    std::fs::write(&path, bytes).unwrap();
    path
}

fn source(
    path: std::path::PathBuf,
    dest: &str,
) -> vaultspec_product::product_build::SourceArtifact {
    vaultspec_product::product_build::SourceArtifact {
        source: path,
        dest_relative: dest.to_string(),
    }
}

#[test]
fn compose_product_tree_places_scans_emits_and_covers() {
    use vaultspec_product::product_build::{BuildSources, LicenseSource, compose_product_tree};

    let lock = lock();
    let capsule = capsule(&lock);
    let src = tempfile::tempdir().unwrap();
    let out = tempfile::tempdir().unwrap();
    let generation_root = out.path().join("generations").join("0001");

    let sources = BuildSources {
        target: TARGET,
        cohort_id: "release-2026.07.19".to_string(),
        cohort_targets: vec![
            Target::Aarch64AppleDarwin,
            Target::X86_64AppleDarwin,
            Target::Aarch64UnknownLinuxGnu,
            Target::X86_64UnknownLinuxGnu,
            Target::X86_64PcWindowsMsvc,
        ],
        release_manifest_path: "release.json".to_string(),
        dashboard_version: "0.1.4".to_string(),
        dashboard_commit: "a".repeat(40),
        dashboard: source(
            write_source(src.path(), "dashboard.exe", b"dashboard-bytes"),
            "bin/dashboard.exe",
        ),
        updater_version: "0.1.4".to_string(),
        updater: source(
            write_source(src.path(), "updater.exe", b"updater-bytes"),
            "bin/updater.exe",
        ),
        capsule_archive: source(
            write_source(src.path(), "capsule.zip", b"PK-zip-bytes"),
            "a2a/capsule.zip",
        ),
        capsule_manifest: source(
            write_source(src.path(), "cm.json", b"{capsule-manifest}"),
            "a2a/component-manifest.json",
        ),
        tree_evidence_doc: source(
            write_source(src.path(), "tree.json", b"{tree-evidence}"),
            "a2a/tree.json",
        ),
        tree_digest: "2".repeat(64),
        tree_file_count: 3,
        component_lock: source(
            write_source(src.path(), "lock.json", LOCK_JSON.as_bytes()),
            "packaging/a2a-component.lock.json",
        ),
        licenses: vec![LicenseSource {
            source: write_source(src.path(), "a2a.txt", b"MIT license text"),
            dest_relative: "licenses/a2a.txt".to_string(),
            component: "vaultspec-a2a".to_string(),
            spdx: "MIT".to_string(),
        }],
        sbom: source(
            write_source(src.path(), "sbom.json", b"{sbom}"),
            "sbom.cdx.json",
        ),
        sbom_format: "cyclonedx".to_string(),
    };

    let raw = compose_product_tree(&generation_root, &sources, &lock, &capsule)
        .expect("a complete source set must compose, emit, self-verify, and cover the tree");

    // The manifest was written into the tree and describes the real placed files.
    let written = std::fs::read_to_string(generation_root.join("release.json")).unwrap();
    assert_eq!(written, raw);
    let value: serde_json::Value = serde_json::from_str(&raw).unwrap();
    // file_digests carries the real placed-file digests (not caller assertions) and
    // excludes the manifest's own path.
    assert!(value["file_digests"]["bin/dashboard.exe"].is_string());
    assert!(value["file_digests"].get("release.json").is_none());
    // Every placed regular file except release.json is covered.
    for placed in [
        "bin/dashboard.exe",
        "bin/updater.exe",
        "a2a/capsule.zip",
        "licenses/a2a.txt",
        "sbom.cdx.json",
    ] {
        assert!(
            value["file_digests"][placed].is_string(),
            "{placed} covered"
        );
    }
}

#[test]
fn compose_fails_on_a_missing_source_payload() {
    use vaultspec_product::product_build::{BuildSources, compose_product_tree};

    let lock = lock();
    let capsule = capsule(&lock);
    let src = tempfile::tempdir().unwrap();
    let out = tempfile::tempdir().unwrap();
    let generation_root = out.path().join("generations").join("0001");

    // Every source exists EXCEPT the updater binary — a missing payload must fail
    // the compose with a bounded I/O error, never emit a partial tree.
    let sources = BuildSources {
        target: TARGET,
        cohort_id: "release-2026.07.19".to_string(),
        cohort_targets: vec![
            Target::Aarch64AppleDarwin,
            Target::X86_64AppleDarwin,
            Target::Aarch64UnknownLinuxGnu,
            Target::X86_64UnknownLinuxGnu,
            Target::X86_64PcWindowsMsvc,
        ],
        release_manifest_path: "release.json".to_string(),
        dashboard_version: "0.1.4".to_string(),
        dashboard_commit: "a".repeat(40),
        dashboard: source(
            write_source(src.path(), "dashboard.exe", b"dashboard"),
            "bin/dashboard.exe",
        ),
        updater_version: "0.1.4".to_string(),
        updater: source(src.path().join("does-not-exist.exe"), "bin/updater.exe"),
        capsule_archive: source(
            write_source(src.path(), "capsule.zip", b"zip"),
            "a2a/capsule.zip",
        ),
        capsule_manifest: source(
            write_source(src.path(), "cm.json", b"{}"),
            "a2a/component-manifest.json",
        ),
        tree_evidence_doc: source(
            write_source(src.path(), "tree.json", b"{}"),
            "a2a/tree.json",
        ),
        tree_digest: "2".repeat(64),
        tree_file_count: 3,
        component_lock: source(
            write_source(src.path(), "lock.json", LOCK_JSON.as_bytes()),
            "packaging/a2a-component.lock.json",
        ),
        licenses: Vec::new(),
        sbom: source(
            write_source(src.path(), "sbom.json", b"{}"),
            "sbom.cdx.json",
        ),
        sbom_format: "cyclonedx".to_string(),
    };

    let refused = compose_product_tree(&generation_root, &sources, &lock, &capsule);
    assert!(
        matches!(refused, Err(ProductBuildError::Io(_))),
        "a missing source payload must fail the compose with a bounded I/O error, got {refused:?}"
    );
}
