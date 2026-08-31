//! Product-tree builder acceptance.
//!
//! The builder GENERATES release-set member manifests; the production
//! manifest verifier VALIDATES them. These prove the two agree: an emit derived from
//! the real committed component lock verifies under that same lock, and a pin that
//! disagrees with the lock — or a floating selector — fails the emit's own
//! self-verification rather than shipping. Fixtures are derived from the committed
//! lock with the production parser, never copied from a run's output, so a drift
//! between these facts and the real pins fails the build.

use std::collections::BTreeMap;

use vaultspec_product::manifest::{ComponentLock, Target};
use vaultspec_product::product_build::{
    A2aComponentEvidence, BundledRuntimeEvidence, ComposedArtifact, ComposedMember,
    DashboardArtifact, EvidenceArtifact, LicenseArtifact, ProductBuildError, RuntimeSource,
    SbomArtifact, emit_member_manifest, file_digests_from_scan, scan_composed_tree,
    verify_member_covers_tree,
};

const LOCK_JSON: &str = include_str!("../../../../packaging/a2a-component.lock.json");
const TARGET: Target = Target::X86_64PcWindowsMsvc;
const TRIPLE: &str = "x86_64-pc-windows-msvc";

fn lock() -> ComponentLock {
    ComponentLock::parse(LOCK_JSON).unwrap()
}

fn composed_member() -> ComposedMember {
    ComposedMember {
        target: TARGET,
        cohort_id: "release-2026.07.19".to_string(),
        cohort_targets: vec![
            Target::Aarch64AppleDarwin,
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
            runtime: BundledRuntimeEvidence {
                root: "a2a".to_string(),
                entrypoint: "a2a/vaultspec-a2a.exe".to_string(),
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
    let raw = emit_member_manifest(&composed_member(), &lock)
        .expect("a lock-consistent member must emit and self-verify");
    // The emitted bytes are the schema-2.0 member manifest, already proven through
    // the production verifier inside emit; confirm it is the intended shape.
    let value: serde_json::Value = serde_json::from_str(&raw).unwrap();
    assert_eq!(value["schema_version"], "2.0");
    assert_eq!(value["target"], TRIPLE);
    assert_eq!(value["a2a_component"]["runtime"]["root"], "a2a");
    assert_eq!(
        value["a2a_component"]["runtime"]["entrypoint"],
        "a2a/vaultspec-a2a.exe"
    );
    assert_eq!(value["a2a_component"]["runtime"]["file_count"], 3);
}

#[test]
fn the_emitter_derives_the_source_pin_from_the_lock_not_the_caller() {
    // The ComposedMember carries no a2a commit or release identity; the emitter
    // binds them from the trusted lock, so a member cannot smuggle a divergent
    // source pin past a consumer that trusts the same lock.
    let lock = lock();
    let raw = emit_member_manifest(&composed_member(), &lock).unwrap();
    let value: serde_json::Value = serde_json::from_str(&raw).unwrap();
    assert_eq!(value["a2a_component"]["commit"], lock.a2a_source.commit);
    assert_eq!(
        value["a2a_component"]["release_identity"]["version"],
        lock.a2a_source.release_identity.version
    );
}

#[test]
fn an_incomplete_cohort_roster_fails_self_verification() {
    // Release-set skew: a member that does not carry the exact
    // four-target cohort roster must fail closed at the emitter's self-verify,
    // never ship. The roster is a caller-supplied fact, so the verifier is the
    // authority that catches a skewed one.
    let lock = lock();
    let mut member = composed_member();
    member.cohort_targets.pop(); // three targets, not four
    let refused = emit_member_manifest(&member, &lock);
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

/// Write a onedir shaped like a real PyInstaller freeze: the launchable binary at
/// its root plus a nested `_internal` tree, so placement is exercised against a
/// nested directory rather than one flat folder.
fn write_onedir(dir: &std::path::Path) -> RuntimeSource {
    let root = dir.join("onedir");
    std::fs::create_dir_all(root.join("_internal")).unwrap();
    std::fs::write(root.join("vaultspec-a2a.exe"), b"frozen-a2a-binary").unwrap();
    std::fs::write(root.join("_internal/base_library.zip"), b"stdlib-bytes").unwrap();
    std::fs::write(root.join("_internal/python313.dll"), b"interpreter").unwrap();
    RuntimeSource {
        source_dir: root,
        dest_relative: "a2a".to_string(),
        entrypoint_relative: "vaultspec-a2a.exe".to_string(),
    }
}

/// The smallest complete source set: real dashboard, updater, lock, and SBOM
/// payloads around the supplied bundled runtime.
fn minimal_sources(
    src: &std::path::Path,
    a2a_runtime: RuntimeSource,
) -> vaultspec_product::product_build::BuildSources {
    vaultspec_product::product_build::BuildSources {
        target: TARGET,
        cohort_id: "release-2026.07.19".to_string(),
        cohort_targets: vec![
            Target::Aarch64AppleDarwin,
            Target::Aarch64UnknownLinuxGnu,
            Target::X86_64UnknownLinuxGnu,
            Target::X86_64PcWindowsMsvc,
        ],
        release_manifest_path: "release.json".to_string(),
        dashboard_version: "0.1.4".to_string(),
        dashboard_commit: "a".repeat(40),
        dashboard: source(
            write_source(src, "dashboard.exe", b"dashboard-bytes"),
            "bin/dashboard.exe",
        ),
        updater_version: "0.1.4".to_string(),
        updater: source(
            write_source(src, "updater.exe", b"updater-bytes"),
            "bin/updater.exe",
        ),
        a2a_runtime,
        component_lock: source(
            write_source(src, "lock.json", LOCK_JSON.as_bytes()),
            "packaging/a2a-component.lock.json",
        ),
        licenses: vec![vaultspec_product::product_build::LicenseSource {
            source: write_source(src, "a2a.txt", b"MIT license text"),
            dest_relative: "licenses/a2a.txt".to_string(),
            component: "vaultspec-a2a".to_string(),
            spdx: "MIT".to_string(),
        }],
        sbom: source(write_source(src, "sbom.json", b"{sbom}"), "sbom.cdx.json"),
        sbom_format: "cyclonedx".to_string(),
    }
}

#[test]
fn compose_product_tree_places_scans_emits_and_covers() {
    use vaultspec_product::product_build::{BuildSources, LicenseSource, compose_product_tree};

    let lock = lock();
    let src = tempfile::tempdir().unwrap();
    let out = tempfile::tempdir().unwrap();
    let generation_root = out.path().join("generations").join("0001");

    let sources = BuildSources {
        target: TARGET,
        cohort_id: "release-2026.07.19".to_string(),
        cohort_targets: vec![
            Target::Aarch64AppleDarwin,
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
        a2a_runtime: write_onedir(src.path()),
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

    let raw = compose_product_tree(&generation_root, &sources, &lock)
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
        "a2a/vaultspec-a2a.exe",
        "a2a/_internal/base_library.zip",
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
    use vaultspec_product::product_build::compose_product_tree;

    let lock = lock();
    let src = tempfile::tempdir().unwrap();
    let out = tempfile::tempdir().unwrap();
    let generation_root = out.path().join("generations").join("0001");

    // Every source exists EXCEPT the updater binary — a missing payload must fail
    // the compose with a bounded I/O error, never emit a partial tree.
    let mut sources = minimal_sources(src.path(), write_onedir(src.path()));
    sources.updater = source(src.path().join("does-not-exist.exe"), "bin/updater.exe");

    let refused = compose_product_tree(&generation_root, &sources, &lock);
    assert!(
        matches!(refused, Err(ProductBuildError::Io(_))),
        "a missing source payload must fail the compose with a bounded I/O error, got {refused:?}"
    );
}

#[test]
fn the_bundled_runtime_is_placed_as_a_nested_tree_of_regular_files() {
    use vaultspec_product::product_build::compose_product_tree;

    let lock = lock();
    let src = tempfile::tempdir().unwrap();
    let out = tempfile::tempdir().unwrap();
    let generation_root = out.path().join("generations").join("0001");
    let sources = minimal_sources(src.path(), write_onedir(src.path()));

    let raw = compose_product_tree(&generation_root, &sources, &lock)
        .expect("a built onedir must place as ordinary regular files");
    let value: serde_json::Value = serde_json::from_str(&raw).unwrap();

    // The onedir is placed as a DIRECTORY, not an archive: its nested file is on
    // disk at its own path and digest-covered like every other installed file.
    let nested = generation_root.join("a2a/_internal/base_library.zip");
    assert!(nested.is_file(), "the nested onedir file is placed on disk");
    assert!(value["file_digests"]["a2a/_internal/base_library.zip"].is_string());
    assert!(value["file_digests"]["a2a/vaultspec-a2a.exe"].is_string());
    // The declared count is the real placed count, computed by the composer.
    assert_eq!(value["a2a_component"]["runtime"]["file_count"], 3);
    assert_eq!(
        value["a2a_component"]["runtime"]["entrypoint"],
        "a2a/vaultspec-a2a.exe"
    );
}

#[test]
fn an_entrypoint_the_freeze_recipe_did_not_emit_is_refused() {
    use vaultspec_product::product_build::compose_product_tree;

    let lock = lock();
    let src = tempfile::tempdir().unwrap();
    let out = tempfile::tempdir().unwrap();
    let generation_root = out.path().join("generations").join("0001");
    let mut runtime = write_onedir(src.path());
    // The recipe emitted a onedir, but not under the entrypoint name the build
    // spec claims — a launch that would only fail at first run must fail here.
    runtime.entrypoint_relative = "vaultspec-a2a-renamed.exe".to_string();
    let sources = minimal_sources(src.path(), runtime);

    let refused = compose_product_tree(&generation_root, &sources, &lock);
    assert!(
        matches!(refused, Err(ProductBuildError::FileDigestsMismatch { .. })),
        "an absent entrypoint must fail the compose, got {refused:?}"
    );
}

#[test]
fn an_empty_directory_in_the_built_onedir_is_refused() {
    use vaultspec_product::product_build::compose_product_tree;

    let lock = lock();
    let src = tempfile::tempdir().unwrap();
    let out = tempfile::tempdir().unwrap();
    let generation_root = out.path().join("generations").join("0001");
    let runtime = write_onedir(src.path());
    // The generation tree admits no directory that is not an ancestor of a
    // regular file. Placing the onedir must refuse one rather than silently drop
    // it, so the constraint is reported against the freeze recipe that emitted it.
    std::fs::create_dir_all(runtime.source_dir.join("_internal/empty")).unwrap();
    let sources = minimal_sources(src.path(), runtime);

    let refused = compose_product_tree(&generation_root, &sources, &lock);
    assert!(
        matches!(refused, Err(ProductBuildError::EmptyDirectory { .. })),
        "an empty directory in the built onedir must be refused, got {refused:?}"
    );
}

#[test]
fn scan_rejects_a_non_portable_file_name() {
    let temp = tempfile::tempdir().unwrap();
    // A space is outside the portable ASCII release-path grammar, yet the OS
    // accepts the name — exactly the drift the build must catch, not install.
    std::fs::write(temp.path().join("my file.txt"), b"x").unwrap();
    let refused = scan_composed_tree(temp.path());
    assert!(
        matches!(refused, Err(ProductBuildError::NonPortablePath { .. })),
        "a non-portable file name must fail the build scan, got {refused:?}"
    );
}

#[test]
fn a_non_portable_rejection_names_the_whole_path() {
    let temp = tempfile::tempdir().unwrap();
    // The offending SEGMENT alone does not say where the file came from, and a
    // composed tree carries the frozen runtime's entire dependency closure. A
    // rejection naming only the segment leaves the reader searching two
    // repositories for a file that is in neither, so the message must carry
    // the path that reaches the emitter.
    let nested = temp.path().join("_internal/vendor/data");
    std::fs::create_dir_all(&nested).unwrap();
    std::fs::write(nested.join("my file.txt"), b"x").unwrap();

    let Err(ProductBuildError::NonPortablePath { detail }) = scan_composed_tree(temp.path()) else {
        panic!("a non-portable file name must fail the build scan");
    };
    assert!(
        detail.contains("_internal/vendor/data/my file.txt"),
        "the rejection must name the whole path, got {detail:?}"
    );
}

#[test]
fn scan_rejects_a_tree_deeper_than_the_segment_ceiling() {
    let temp = tempfile::tempdir().unwrap();
    let mut deep = temp.path().to_path_buf();
    for _ in 0..33 {
        deep.push("d");
    }
    std::fs::create_dir_all(&deep).unwrap();
    let refused = scan_composed_tree(temp.path());
    assert!(
        matches!(refused, Err(ProductBuildError::TreeTooDeep)),
        "a tree deeper than the 32-segment ceiling must fail the build scan, got {refused:?}"
    );
}

/// Compose a real product tree (writes release.json + the placed files) and
/// return the temp dirs + the generation root, for the install-verify proofs.
fn composed_tree() -> (tempfile::TempDir, tempfile::TempDir, std::path::PathBuf) {
    use vaultspec_product::product_build::{BuildSources, LicenseSource, compose_product_tree};
    let lock = lock();
    let src = tempfile::tempdir().unwrap();
    let out = tempfile::tempdir().unwrap();
    let generation_root = out.path().join("generations").join("0001");
    let sources = BuildSources {
        target: TARGET,
        cohort_id: "release-2026.07.19".to_string(),
        cohort_targets: vec![
            Target::Aarch64AppleDarwin,
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
        a2a_runtime: write_onedir(src.path()),
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
    compose_product_tree(&generation_root, &sources, &lock).unwrap();
    (src, out, generation_root)
}

#[test]
fn verify_installed_tree_accepts_a_faithfully_composed_tree() {
    use vaultspec_product::product_build::verify_installed_tree;
    let (_src, _out, root) = composed_tree();
    verify_installed_tree(&root, "release.json", &lock())
        .expect("a tree that matches its own release.json must verify");
}

#[test]
fn verify_installed_tree_rejects_a_corrupted_file() {
    use vaultspec_product::product_build::{ProductBuildError, verify_installed_tree};
    let (_src, _out, root) = composed_tree();
    // A corrupted placed file no longer matches its manifest digest.
    std::fs::write(root.join("bin/dashboard.exe"), b"tampered").unwrap();
    let refused = verify_installed_tree(&root, "release.json", &lock());
    assert!(matches!(
        refused,
        Err(ProductBuildError::FileDigestsMismatch { .. })
    ));
}

#[test]
fn verify_installed_tree_rejects_an_extra_file() {
    use vaultspec_product::product_build::{ProductBuildError, verify_installed_tree};
    let (_src, _out, root) = composed_tree();
    // An unexpected file the manifest does not declare.
    std::fs::write(root.join("bin/ghost.exe"), b"unexpected").unwrap();
    let refused = verify_installed_tree(&root, "release.json", &lock());
    assert!(matches!(
        refused,
        Err(ProductBuildError::FileDigestsMismatch { .. })
    ));
}

#[test]
fn verify_installed_tree_rejects_a_missing_file() {
    use vaultspec_product::product_build::{ProductBuildError, verify_installed_tree};
    let (_src, _out, root) = composed_tree();
    // A declared file that is absent from the installed tree.
    std::fs::remove_file(root.join("bin/updater.exe")).unwrap();
    let refused = verify_installed_tree(&root, "release.json", &lock());
    assert!(matches!(
        refused,
        Err(ProductBuildError::FileDigestsMismatch { .. })
    ));
}
