//! Cohort descriptor + digest acceptance.
//!
//! The emitter aggregates exactly one VERIFIED member per target, enforces the
//! common cohort identity, and emits the RFC 8785 JCS preimage + SHA-256 digest.
//! Members are built by the real product-build emitter from the committed lock, so
//! a drift between these facts and the real pins fails the build.

use std::collections::BTreeMap;
use vaultspec_product::cohort::{CohortError, emit_cohort_descriptor};
use vaultspec_product::manifest::{ComponentLock, Target};
use vaultspec_product::product_build::{
    A2aComponentEvidence, BundledRuntimeEvidence, ComposedArtifact, ComposedMember,
    DashboardArtifact, EvidenceArtifact, LicenseArtifact, SbomArtifact, emit_member_manifest,
};

const LOCK_JSON: &str = include_str!("../../../../packaging/a2a-component.lock.json");
const COHORT_ID: &str = "release-2026.07.21";

fn lock() -> ComponentLock {
    ComponentLock::parse(LOCK_JSON).unwrap()
}

const ROSTER: [Target; 4] = [
    Target::Aarch64AppleDarwin,
    Target::Aarch64UnknownLinuxGnu,
    Target::X86_64UnknownLinuxGnu,
    Target::X86_64PcWindowsMsvc,
];

/// A verified member manifest for `target`, sharing the cohort identity.
fn member(lock: &ComponentLock, target: Target) -> String {
    emit_member_manifest(&composed(target, true), Some(lock)).unwrap()
}

/// The same member with no bundled a2a runtime: no placed evidence, and so no
/// source pin, which is why it needs no lock to emit.
fn member_without_a2a(target: Target) -> String {
    emit_member_manifest(&composed(target, false), None).unwrap()
}

fn composed(target: Target, with_a2a: bool) -> ComposedMember {
    ComposedMember {
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
        a2a_component: with_a2a.then(|| A2aComponentEvidence {
            component_lock: EvidenceArtifact {
                path: "packaging/a2a-component.lock.json".to_string(),
                digest: "d".repeat(64),
            },
            runtime: BundledRuntimeEvidence {
                root: "a2a".to_string(),
                entrypoint: "a2a/vaultspec-a2a".to_string(),
                file_count: 3,
            },
        }),
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
    }
}

fn all_members(lock: &ComponentLock) -> Vec<(Target, String)> {
    ROSTER.iter().map(|&t| (t, member(lock, t))).collect()
}

fn all_members_without_a2a() -> Vec<(Target, String)> {
    ROSTER.iter().map(|&t| (t, member_without_a2a(t))).collect()
}

#[test]
fn four_matching_members_emit_a_deterministic_cohort_digest() {
    let lock = lock();
    let members = all_members(&lock);
    let a = emit_cohort_descriptor(&members, &lock).expect("four matching members emit a cohort");
    // The digest is deterministic — a re-emit of the same inputs is identical.
    let b = emit_cohort_descriptor(&members, &lock).unwrap();
    assert_eq!(a, b);
    assert_eq!(a.cohort_digest.len(), 64);
    // The JCS preimage carries the four targets in canonical order + the digest.
    let text = String::from_utf8(a.descriptor_jcs.clone()).unwrap();
    assert!(text.contains("\"schema_version\":\"1.0\""));
    assert!(text.contains("aarch64-apple-darwin"));
    assert!(text.contains("x86_64-pc-windows-msvc"));
}

#[test]
fn fewer_than_four_members_is_rejected() {
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
    // Rewrite the last member's cohort id so the four no longer share identity.
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
    // Two entries both claim the Windows member (the roster is not the four
    // unique targets), which the emitter must reject.
    members[0].1 = member(&lock, Target::X86_64PcWindowsMsvc);
    members[0].0 = Target::Aarch64AppleDarwin; // slot says darwin, manifest says windows
    assert!(matches!(
        emit_cohort_descriptor(&members, &lock),
        Err(CohortError::Roster { .. })
    ));
}

#[test]
fn four_a2a_less_members_emit_a_deterministic_cohort_digest() {
    // A release built without the bundled runtime still aggregates: absence is a
    // shared identity like any other, so four members that all lack it agree.
    let lock = lock();
    let members = all_members_without_a2a();
    let emitted = emit_cohort_descriptor(&members, &lock)
        .expect("four members that all carry no bundled runtime emit a cohort");
    assert_eq!(emitted, emit_cohort_descriptor(&members, &lock).unwrap());
    assert_eq!(emitted.cohort_digest.len(), 64);
    // The digest is over DIFFERENT member documents, so it must differ from the
    // with-a2a cohort's; identical digests would mean the member shape did not
    // reach the preimage at all.
    assert_ne!(
        emitted.cohort_digest,
        emit_cohort_descriptor(&all_members(&lock), &lock)
            .unwrap()
            .cohort_digest
    );
}

#[test]
fn a_mixed_cohort_is_rejected() {
    // The property that must survive making a2a optional: whether the release
    // bundles the runtime is part of the identity all four members share. Three
    // targets shipping a runtime and one shipping none is a release the members
    // disagree about, and is refused on the same footing as an A2A commit skew.
    let lock = lock();
    let mut members = all_members(&lock);
    let last = members.len() - 1;
    members[last].1 = member_without_a2a(members[last].0);
    assert!(
        matches!(
            emit_cohort_descriptor(&members, &lock),
            Err(CohortError::Identity { .. })
        ),
        "a cohort where only some members bundle the runtime must be rejected"
    );

    // And the mirror: one member bundling a runtime the other three do not.
    let mut members = all_members_without_a2a();
    members[0].1 = member(&lock, members[0].0);
    assert!(matches!(
        emit_cohort_descriptor(&members, &lock),
        Err(CohortError::Identity { .. })
    ));
}
