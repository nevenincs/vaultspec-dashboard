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
