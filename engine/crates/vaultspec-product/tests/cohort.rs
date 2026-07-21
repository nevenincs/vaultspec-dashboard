//! Cohort descriptor + digest acceptance (a2a-product-provisioning W04.P08.S166).
//!
//! The emitter aggregates exactly one VERIFIED member per target, enforces the
//! common cohort identity, and emits the RFC 8785 JCS preimage + SHA-256 digest.
//! Members are built by the real product-build emitter from the committed lock, so
//! a drift between these facts and the real pins fails the build.

use std::collections::BTreeMap;
use vaultspec_product::cohort::{CohortError, emit_cohort_descriptor};
use vaultspec_product::manifest::{CapsuleManifest, ComponentLock, Target};
use vaultspec_product::product_build::{
    A2aComponentEvidence, ComposedArtifact, ComposedMember, DashboardArtifact, EvidenceArtifact,
    LicenseArtifact, SbomArtifact, TreeEvidenceArtifact, emit_member_manifest,
};

const LOCK_JSON: &str = include_str!("../../../../packaging/a2a-component.lock.json");
const COHORT_ID: &str = "release-2026.07.21";

fn lock() -> ComponentLock {
    ComponentLock::parse(LOCK_JSON).unwrap()
}

const ROSTER: [Target; 5] = [
    Target::Aarch64AppleDarwin,
    Target::X86_64AppleDarwin,
    Target::Aarch64UnknownLinuxGnu,
    Target::X86_64UnknownLinuxGnu,
    Target::X86_64PcWindowsMsvc,
];

/// A lock-consistent capsule manifest for `target`.
fn capsule(lock: &ComponentLock, target: Target) -> CapsuleManifest {
    let triple = target.triple();
    let python = lock.python_digest(target).unwrap();
    let node = lock.node_digest(target).unwrap();
    let acp = &lock.base_closure.acp.sha256;
    let a2a_version = &lock.a2a_source.release_identity.version;
    let raw = serde_json::json!({
        "contract_version": "2.0",
        "identity": { "name": lock.a2a_source.release_identity.name, "version": a2a_version },
        "target": triple,
        "compatibility": { "api_versions": { "minimum": "v1", "maximum": "v1" }, "migration_range": { "base": "0001", "head": "0008" } },
        "consistency_group": { "stores": [
            { "kind": "primary-database", "derivable": false, "schema_authority": "alembic-migration-range", "schema_version": "0008" },
            { "kind": "checkpoint-database", "derivable": false, "schema_authority": "checkpointer-schema", "schema_version": "1.0.0" }] },
        "entrypoints": {
            "gateway": { "kind": "gateway", "console_script": "vaultspec-a2a", "reference": "vaultspec_a2a.cli:main", "relative_command": ["bin", "vaultspec-a2a"] },
            "standalone_mcp": { "kind": "standalone-mcp", "console_script": "vaultspec-a2a-mcp", "reference": "vaultspec_a2a.mcp:main", "relative_command": ["bin", "vaultspec-a2a-mcp"] } },
        "digest_algorithm": "sha256",
        "assets": [
            { "kind": "python-runtime", "version": "3.13", "license": lock.base_closure.python.license, "digest": python },
            { "kind": "a2a-distribution", "version": a2a_version, "license": "MIT", "digest": "c".repeat(64) },
            { "kind": "node-runtime", "version": "22", "license": lock.base_closure.node.license, "digest": node },
            { "kind": "acp-adapter", "version": lock.base_closure.acp.version, "license": lock.base_closure.acp.license, "digest": acp }],
        "dependency_lock": { "uv_lock_digest": "d".repeat(64), "package_lock_digest": "e".repeat(64) }
    });
    CapsuleManifest::parse_and_verify(&serde_json::to_string(&raw).unwrap(), lock, target).unwrap()
}

/// A verified member manifest for `target`, sharing the cohort identity.
fn member(lock: &ComponentLock, target: Target) -> String {
    let composed = ComposedMember {
        target,
        cohort_id: COHORT_ID.to_string(),
        cohort_targets: ROSTER.to_vec(),
        release_manifest_path: "release.json".to_string(),
        dashboard: DashboardArtifact {
            version: "0.1.4".to_string(),
            commit: "a".repeat(40),
            artifact: ComposedArtifact {
                path: "bin/dashboard".to_string(),
                size: 16,
                digest: "b".repeat(64),
            },
        },
        updater_version: "0.1.4".to_string(),
        updater: ComposedArtifact {
            path: "bin/updater".to_string(),
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
        file_digests: BTreeMap::from([("bin/dashboard".to_string(), "b".repeat(64))]),
    };
    emit_member_manifest(&composed, lock, &capsule(lock, target)).unwrap()
}

fn all_members(lock: &ComponentLock) -> Vec<(Target, String)> {
    ROSTER.iter().map(|&t| (t, member(lock, t))).collect()
}

#[test]
fn five_matching_members_emit_a_deterministic_cohort_digest() {
    let lock = lock();
    let members = all_members(&lock);
    let a = emit_cohort_descriptor(&members, &lock).expect("five matching members emit a cohort");
    // The digest is deterministic — a re-emit of the same inputs is identical.
    let b = emit_cohort_descriptor(&members, &lock).unwrap();
    assert_eq!(a, b);
    assert_eq!(a.cohort_digest.len(), 64);
    // The JCS preimage carries the five targets in canonical order + the digest.
    let text = String::from_utf8(a.descriptor_jcs.clone()).unwrap();
    assert!(text.contains("\"schema_version\":\"1.0\""));
    assert!(text.contains("aarch64-apple-darwin"));
    assert!(text.contains("x86_64-pc-windows-msvc"));
}

#[test]
fn fewer_than_five_members_is_rejected() {
    let lock = lock();
    let mut members = all_members(&lock);
    members.pop();
    assert!(matches!(
        emit_cohort_descriptor(&members, &lock),
        Err(CohortError::Roster { .. })
    ));
}

#[test]
fn a_member_disagreeing_on_the_cohort_id_is_rejected() {
    let lock = lock();
    let mut members = all_members(&lock);
    // Rewrite the last member's cohort id so the five no longer share identity.
    let (target, raw) = members.last().unwrap();
    let divergent = raw.replace(COHORT_ID, "release-9999.99.99");
    let last = members.len() - 1;
    members[last] = (*target, divergent);
    assert!(matches!(
        emit_cohort_descriptor(&members, &lock),
        Err(CohortError::Identity { .. }) | Err(CohortError::Member { .. })
    ));
}

#[test]
fn a_member_supplied_for_the_wrong_target_slot_is_rejected() {
    let lock = lock();
    let mut members = all_members(&lock);
    // Two entries both claim the Windows member (the roster is not the five
    // unique targets), which the emitter must reject.
    members[0].1 = member(&lock, Target::X86_64PcWindowsMsvc);
    members[0].0 = Target::Aarch64AppleDarwin; // slot says darwin, manifest says windows
    assert!(matches!(
        emit_cohort_descriptor(&members, &lock),
        Err(CohortError::Roster { .. })
    ));
}
