use super::*;
use crate::generation::{DiscardOutcome, LockedProduct};
use crate::hex;
use crate::locking::{Actor, InstallLock, InstallLockGuard};
use crate::paths::ProductPaths;

const LOCK_BYTES: &[u8] = include_bytes!("../../../../../packaging/a2a-component.lock.json");
const TARGET: Target = Target::X86_64PcWindowsMsvc;

pub(crate) struct Fixture {
    pub(crate) paths: ProductPaths,
    pub(crate) guard: InstallLockGuard,
    payloads: Vec<(String, Vec<u8>)>,
    entrypoint_mode: String,
    member: Vec<u8>,
    descriptor: Vec<u8>,
    member_digest: String,
    cohort_digest: String,
    lock_digest: String,
    _temp: tempfile::TempDir,
}

impl Fixture {
    pub(crate) fn new() -> Self {
        Self::with_entrypoint_mode("0755")
    }

    fn with_entrypoint_mode(entrypoint_mode: &str) -> Self {
        let temp = tempfile::tempdir().expect("real temporary product home");
        let paths = ProductPaths::under_app_home(temp.path());
        paths.ensure().unwrap();
        for path in [
            paths.root().to_path_buf(),
            paths.generations_dir(),
            paths.app_home(),
        ] {
            restrict_test_directory(&path);
        }
        let guard = InstallLock::new(paths.install_lock_path())
            .acquire(Actor::Installer, "manifest-verification")
            .unwrap()
            .unwrap();
        let lock = ComponentLock::parse(std::str::from_utf8(LOCK_BYTES).unwrap()).unwrap();
        let dashboard = b"dashboard-binary".to_vec();
        let updater = b"external-updater".to_vec();
        let archive = b"real-capsule-archive".to_vec();
        let license = b"MIT license evidence".to_vec();
        let sbom = b"{\"bomFormat\":\"CycloneDX\"}\n".to_vec();
        let tree_file = b"capsule-runtime-file".to_vec();
        let gateway_file = b"gateway-entrypoint".to_vec();
        let standalone_file = b"standalone-mcp-entrypoint".to_vec();
        let capsule_value = serde_json::json!({
            "contract_version": "2.0",
            "identity": {"name": lock.a2a_source.release_identity.name, "version": lock.a2a_source.release_identity.version},
            "target": TARGET.triple(),
            "compatibility": {
                "api_versions": {"minimum": "v1", "maximum": "v1"},
                "migration_range": {"base": "0001", "head": "0008"}
            },
            "consistency_group": {"stores": [
                {"kind": "primary-database", "derivable": false, "schema_authority": "alembic-migration-range", "schema_version": "0008"},
                {"kind": "checkpoint-database", "derivable": false, "schema_authority": "checkpointer-schema", "schema_version": "1.0.0"}
            ]},
            "entrypoints": {
                "gateway": {"kind": "gateway", "console_script": "vaultspec-a2a", "reference": "vaultspec_a2a.cli:main", "relative_command": ["bin", "vaultspec-a2a"]},
                "standalone_mcp": {"kind": "standalone-mcp", "console_script": "vaultspec-a2a-mcp", "reference": "vaultspec_a2a.mcp:main", "relative_command": ["bin", "vaultspec-a2a-mcp"]}
            },
            "digest_algorithm": "sha256",
            "assets": [
                {"kind": "python-runtime", "version": "3.13", "license": lock.base_closure.python.license, "digest": lock.python_digest(TARGET).unwrap()},
                {"kind": "a2a-distribution", "version": lock.a2a_source.release_identity.version, "license": "MIT", "digest": "1".repeat(64)},
                {"kind": "node-runtime", "version": "22", "license": lock.base_closure.node.license, "digest": lock.node_digest(TARGET).unwrap()},
                {"kind": "acp-adapter", "version": lock.base_closure.acp.version, "license": lock.base_closure.acp.license, "digest": lock.base_closure.acp.sha256}
            ],
            "dependency_lock": {"uv_lock_digest": "2".repeat(64), "package_lock_digest": "3".repeat(64)}
        });
        let capsule = serde_json::to_vec(&capsule_value).unwrap();
        let capsule_digest = hex::sha256(&capsule);
        let mut tree_records = vec![
            ValidatedTreeRecord {
                path: "bin/vaultspec-a2a".to_string(),
                mode: entrypoint_mode.to_string(),
                size: gateway_file.len() as u64,
                size_text: gateway_file.len().to_string(),
                digest: hex::sha256(&gateway_file),
            },
            ValidatedTreeRecord {
                path: "bin/vaultspec-a2a-mcp".to_string(),
                mode: entrypoint_mode.to_string(),
                size: standalone_file.len() as u64,
                size_text: standalone_file.len().to_string(),
                digest: hex::sha256(&standalone_file),
            },
            ValidatedTreeRecord {
                path: "runtime/tool".to_string(),
                mode: "0644".to_string(),
                size: tree_file.len() as u64,
                size_text: tree_file.len().to_string(),
                digest: hex::sha256(&tree_file),
            },
        ];
        tree_records.sort_by(|left, right| left.path.cmp(&right.path));
        let tree_digest_value = tree_digest(&tree_records).unwrap();
        let tree_value = serde_json::json!({
            "inventory_version": "vaultspec-installed-tree-v1",
            "metadata": {
                "timestamp": "2026-07-19T00:00:00Z",
                "component": {
                    "type": "application",
                    "name": "vaultspec-a2a",
                    "version": "0.1.0",
                    "properties": [
                        {"name": "vaultspec:target", "value": TARGET.triple()},
                        {"name": "vaultspec:component-manifest-sha256", "value": capsule_digest}
                    ]
                }
            },
            "components": [
                {
                    "type": "file",
                    "name": "bin/vaultspec-a2a",
                    "hashes": [{"alg": "SHA-256", "content": hex::sha256(&gateway_file)}],
                    "properties": [
                        {"name": "vaultspec:file-mode", "value": entrypoint_mode},
                        {"name": "vaultspec:file-size", "value": gateway_file.len().to_string()}
                    ]
                },
                {
                    "type": "file",
                    "name": "bin/vaultspec-a2a-mcp",
                    "hashes": [{"alg": "SHA-256", "content": hex::sha256(&standalone_file)}],
                    "properties": [
                        {"name": "vaultspec:file-mode", "value": entrypoint_mode},
                        {"name": "vaultspec:file-size", "value": standalone_file.len().to_string()}
                    ]
                },
                {
                    "type": "file",
                    "name": "runtime/tool",
                    "hashes": [{"alg": "SHA-256", "content": hex::sha256(&tree_file)}],
                    "properties": [
                        {"name": "vaultspec:file-mode", "value": "0644"},
                        {"name": "vaultspec:file-size", "value": tree_file.len().to_string()}
                    ]
                }
            ]
        });
        let mut tree = serde_json::to_vec(&tree_value).unwrap();
        tree.push(b'\n');
        let payloads: Vec<(String, Vec<u8>)> = vec![
            (COMPONENT_LOCK_PATH.to_string(), LOCK_BYTES.to_vec()),
            ("bin/dashboard.exe".to_string(), dashboard),
            ("bin/updater.exe".to_string(), updater),
            ("a2a/component-manifest.json".to_string(), capsule),
            ("a2a/capsule.zip".to_string(), archive),
            ("a2a/capsule/bin/vaultspec-a2a".to_string(), gateway_file),
            (
                "a2a/capsule/bin/vaultspec-a2a-mcp".to_string(),
                standalone_file,
            ),
            ("a2a/capsule/runtime/tool".to_string(), tree_file),
            ("a2a/tree.json".to_string(), tree),
            ("licenses/a2a.txt".to_string(), license),
            ("sbom.cdx.json".to_string(), sbom),
        ];
        let mut digests = serde_json::Map::new();
        let mut sizes = BTreeMap::new();
        for (path, bytes) in &payloads {
            digests.insert(path.clone(), serde_json::Value::String(hex::sha256(bytes)));
            sizes.insert(path.clone(), bytes.len() as u64);
        }
        let lock_digest = hex::sha256(LOCK_BYTES);
        let release = serde_json::json!({
            "schema_version": "2.0",
            "target": TARGET.triple(),
            "digest_algorithm": "sha256",
            "cohort": {"id": "release-2026.07.19", "targets": TARGETS.map(Target::triple)},
            "release_manifest": {"path": "release.json", "binding_mode": "external-cohort-and-receipt"},
            "dashboard": {"version": "0.1.4", "commit": "a".repeat(40), "path": "bin/dashboard.exe", "size": sizes["bin/dashboard.exe"], "digest": digests["bin/dashboard.exe"]},
            "updater": {"version": "0.1.4", "path": "bin/updater.exe", "size": sizes["bin/updater.exe"], "digest": digests["bin/updater.exe"]},
            "a2a_component": {
                "commit": lock.a2a_source.commit,
                "release_identity": lock.a2a_source.release_identity,
                "component_lock": {"path": COMPONENT_LOCK_PATH, "digest": lock_digest},
                "capsule_manifest": {"path": "a2a/component-manifest.json", "digest": digests["a2a/component-manifest.json"]},
                "capsule_archive": {"path": "a2a/capsule.zip", "size": sizes["a2a/capsule.zip"], "digest": digests["a2a/capsule.zip"]},
                "tree_evidence": {"path": "a2a/tree.json", "size": sizes["a2a/tree.json"], "digest": digests["a2a/tree.json"], "tree_digest": tree_digest_value, "file_count": 3}
            },
            "runtimes": {
                "cpython": {"version": lock.base_closure.python.version, "license": lock.base_closure.python.license, "digest": lock.python_digest(TARGET).unwrap()},
                "node": {"version": lock.base_closure.node.version, "license": lock.base_closure.node.license, "digest": lock.node_digest(TARGET).unwrap()},
                "acp": {"version": lock.base_closure.acp.version, "license": lock.base_closure.acp.license, "digest": lock.base_closure.acp.sha256}
            },
            "protocol": {"gateway_api_version_range": {"minimum": "v1", "maximum": "v1"}},
            "state_schema": {"migration_range": {"minimum": "0001", "maximum": "0008"}},
            "licenses": [{"component": "vaultspec-a2a", "spdx": "MIT", "path": "licenses/a2a.txt", "digest": digests["licenses/a2a.txt"]}],
            "sbom": {"format": "cyclonedx", "path": "sbom.cdx.json", "size": sizes["sbom.cdx.json"], "digest": digests["sbom.cdx.json"]},
            "file_digests": serde_json::Value::Object(digests)
        });
        let member = serde_json::to_vec(&release).unwrap();
        let member_digest = hex::sha256(&member);
        let descriptor = cohort_bytes(&member_digest);
        let cohort_digest = cohort_descriptor_digest(&descriptor).unwrap();
        Self {
            paths,
            guard,
            payloads,
            entrypoint_mode: entrypoint_mode.to_string(),
            member,
            descriptor,
            member_digest,
            cohort_digest,
            lock_digest,
            _temp: temp,
        }
    }

    pub(crate) fn populate(&self, root: &Path) {
        for (path, bytes) in &self.payloads {
            write_file(root, path, bytes);
        }
        write_file(root, "release.json", &self.member);
        set_mode(
            &root.join("a2a/capsule/bin/vaultspec-a2a"),
            &self.entrypoint_mode,
        );
        set_mode(
            &root.join("a2a/capsule/bin/vaultspec-a2a-mcp"),
            &self.entrypoint_mode,
        );
    }

    /// Crate-visible fixture facts for the materializer tests, which build a
    /// real archive of this same release tree.
    pub(crate) fn payload_files(&self) -> &[(String, Vec<u8>)] {
        &self.payloads
    }

    pub(crate) fn member_bytes(&self) -> &[u8] {
        &self.member
    }

    pub(crate) fn member_digest_hex(&self) -> &str {
        &self.member_digest
    }

    pub(crate) fn descriptor_bytes(&self) -> &[u8] {
        &self.descriptor
    }

    pub(crate) fn entrypoint_mode_text(&self) -> &str {
        &self.entrypoint_mode
    }

    pub(crate) fn lock_bytes(&self) -> &'static [u8] {
        LOCK_BYTES
    }

    pub(crate) fn target_triple(&self) -> &'static str {
        TARGET.triple()
    }

    fn with_generation<R>(
        &self,
        action: impl FnOnce(&mut UnpublishedGeneration<'_, '_>) -> R,
    ) -> R {
        let mut product = LockedProduct::bind(self.paths.clone(), &self.guard).unwrap();
        let mut generation = product.create_unpublished("generation-1").unwrap();
        self.populate(generation.path());
        action(&mut generation)
    }

    fn with_owned_generation<R>(
        &self,
        action: impl FnOnce(UnpublishedGeneration<'_, '_>) -> R,
    ) -> R {
        let mut product = LockedProduct::bind(self.paths.clone(), &self.guard).unwrap();
        let generation = product.create_unpublished("generation-1").unwrap();
        self.populate(generation.path());
        action(generation)
    }

    pub(crate) fn verify<'generation, 'product, 'lock>(
        &self,
        generation: &'generation mut UnpublishedGeneration<'product, 'lock>,
    ) -> Result<VerifiedReleaseSet<'generation, 'product, 'lock>> {
        self.verify_with(
            generation,
            self.member_digest.clone(),
            valid_receipt_context(),
        )
    }

    fn verify_with<'generation, 'product, 'lock>(
        &self,
        generation: &'generation mut UnpublishedGeneration<'product, 'lock>,
        expected_member_manifest_digest: String,
        receipt_context: ReceiptActivationContext,
    ) -> Result<VerifiedReleaseSet<'generation, 'product, 'lock>> {
        let authority = TrustedReleaseAuthority {
            expected_target: TARGET,
            expected_member_manifest_digest,
            expected_cohort_digest: self.cohort_digest.clone(),
            receipt_external_cohort_digest: self.cohort_digest.clone(),
            trusted_component_lock_bytes: LOCK_BYTES.to_vec(),
            trusted_component_lock_path: COMPONENT_LOCK_PATH.to_string(),
            expected_component_lock_digest: self.lock_digest.clone(),
            trusted_capsule_root: "a2a/capsule".to_string(),
            _adapter: crate::channels::self_install::SelfInstallAuthority::new().provenance(),
        };
        VerifiedReleaseSet::verify(
            generation,
            ReleaseVerificationInput {
                authority: &authority,
                cohort_descriptor_bytes: &self.descriptor,
            },
            receipt_context,
        )
    }

    fn verify_result(&self) -> Result<()> {
        self.with_generation(|generation| self.verify(generation).map(|_| ()))
    }

    fn payload(&self, path: &str) -> &[u8] {
        self.payloads
            .iter()
            .find_map(|(candidate, bytes)| (candidate == path).then_some(bytes.as_slice()))
            .unwrap()
    }

    fn mutate_member(&mut self, mutate: impl FnOnce(&mut serde_json::Value)) {
        let mut value: serde_json::Value = serde_json::from_slice(&self.member).unwrap();
        mutate(&mut value);
        self.member = serde_json::to_vec(&value).unwrap();
        self.member_digest = hex::sha256(&self.member);
        self.descriptor = cohort_bytes(&self.member_digest);
        self.cohort_digest = cohort_descriptor_digest(&self.descriptor).unwrap();
    }
}

fn valid_receipt_context() -> ReceiptActivationContext {
    ReceiptActivationContext {
        channel: Channel::SelfInstall,
        bootstrap_created_ownership: true,
        prior_seat: Some(PriorSeatIdentity {
            generation: "generation-prior".to_string(),
            dashboard_version: "0.1.3".to_string(),
            pid: Some(42),
        }),
        consistency_generation: 7,
        created_ms: 1_721_344_500_000,
    }
}

fn restrict_test_directory(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700)).unwrap();
    }
    #[cfg(windows)]
    {
        let whoami = std::process::Command::new("whoami.exe").output().unwrap();
        assert!(whoami.status.success());
        let user = String::from_utf8(whoami.stdout).unwrap();
        let user_grant = format!("{}:(OI)(CI)F", user.trim());
        let output = std::process::Command::new("icacls.exe")
            .arg(path)
            .args(["/remove:g", "*S-1-5-32-545"])
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "icacls peer removal failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        let output = std::process::Command::new("icacls.exe")
            .arg(path)
            .args([
                "/inheritance:r",
                "/grant:r",
                &user_grant,
                "/grant",
                "*S-1-5-18:(OI)(CI)F",
                "/grant",
                "*S-1-5-32-544:(OI)(CI)F",
            ])
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "icacls restriction failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
}

#[cfg(windows)]
fn permit_test_peer(path: &Path) {
    let output = std::process::Command::new("icacls.exe")
        .arg(path)
        .args(["/grant", "*S-1-5-32-545:RX"])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "icacls peer grant failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

#[cfg(windows)]
fn remove_test_peer(path: &Path) {
    let output = std::process::Command::new("icacls.exe")
        .arg(path)
        .args(["/remove:g", "*S-1-5-32-545"])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "icacls peer removal failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

fn write_file(root: &Path, relative: &str, bytes: &[u8]) {
    let path = root.join(relative.replace('/', std::path::MAIN_SEPARATOR_STR));
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, bytes).unwrap();
}

fn clear_generation_contents(root: &Path) {
    for entry in std::fs::read_dir(root).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            clear_generation_contents(&path);
            std::fs::remove_dir(path).unwrap();
        } else {
            std::fs::remove_file(path).unwrap();
        }
    }
}

#[cfg(unix)]
fn set_mode(path: &Path, mode: &str) {
    use std::os::unix::fs::PermissionsExt;
    let bits = if mode == "0755" { 0o755 } else { 0o644 };
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(bits)).unwrap();
}

#[cfg(not(unix))]
fn set_mode(_path: &Path, _mode: &str) {}

fn cohort_bytes(member_digest: &str) -> Vec<u8> {
    let digests = ["4", "5", "6", "7"];
    let mut members = Vec::new();
    for (index, target) in TARGETS.into_iter().enumerate() {
        let digest = if target == TARGET {
            member_digest.to_string()
        } else {
            digests[index].repeat(64)
        };
        members.push(serde_json::json!({
            "target": target.triple(),
            "member_manifest_digest": digest
        }));
    }
    serde_json::to_vec(&serde_json::json!({
        "schema_version": "1.0",
        "id": "release-2026.07.19",
        "digest_algorithm": "sha256",
        "members": members
    }))
    .unwrap()
}

#[test]
fn complete_real_generation_constructs_verified_authority() {
    let fixture = Fixture::new();
    fixture.with_generation(|generation| {
        let verified = fixture
            .verify(generation)
            .expect("complete generation verifies");
        assert_eq!(verified.target(), TARGET);
        assert_eq!(verified.release_set_id(), "release-2026.07.19");
        assert_eq!(verified.generation_id(), "generation-1");
        assert_eq!(verified.member_manifest_digest(), fixture.member_digest);
        assert_eq!(verified.component_lock_digest(), fixture.lock_digest);
        assert_eq!(verified.cohort_digest(), fixture.cohort_digest);
        assert_eq!(verified.dashboard_version(), "0.1.4");
        assert_eq!(verified.dashboard_commit(), "a".repeat(40));
        assert_eq!(
            verified.dashboard_digest(),
            hex::sha256(fixture.payload("bin/dashboard.exe"))
        );
        assert_eq!(verified.capsule_manifest().contract_version, "2.0");
        let facts = verified.receipt_facts();
        assert_eq!(facts.dashboard_version(), "0.1.4");
        assert_eq!(facts.dashboard_commit(), "a".repeat(40));
        assert_eq!(facts.dashboard_digest(), verified.dashboard_digest());
        assert_eq!(facts.release_set_identity(), "release-2026.07.19");
        assert_eq!(facts.release_set_member_digest(), fixture.member_digest);
        assert_eq!(facts.component_lock_digest(), fixture.lock_digest);
        assert_eq!(
            facts.external_five_member_cohort_digest(),
            fixture.cohort_digest
        );
        assert_eq!(facts.target(), TARGET);
        assert_eq!(facts.a2a_identity(), verified.a2a_identity());
        assert_eq!(facts.active_generation(), "generation-1");
        assert_eq!(facts.channel(), Channel::SelfInstall);
        assert!(facts.bootstrap_created_ownership());
        assert_eq!(facts.prior_seat().unwrap().generation, "generation-prior");
        assert_eq!(facts.consistency_generation(), 7);
        assert_eq!(facts.created_ms(), 1_721_344_500_000);
    });
}

#[test]
fn verified_release_publishes_first_and_steady_receipts() {
    let fixture = Fixture::new();
    let mut product = LockedProduct::bind(fixture.paths.clone(), &fixture.guard).unwrap();

    let mut first = product.create_unpublished("generation-1").unwrap();
    fixture.populate(first.path());
    let verified = fixture.verify(&mut first).unwrap();
    crate::receipt::publish_active_receipt(verified).unwrap();
    let first_read =
        crate::receipt::read_active_receipt_journal(&fixture.paths, &fixture.guard).unwrap();
    let crate::receipt::ActiveReceiptReadState::Settled(first_receipt) =
        first_read.state().unwrap()
    else {
        panic!("first publication did not settle");
    };
    assert_eq!(first_receipt.sequence(), 1);
    assert_eq!(first_receipt.active_generation(), "generation-1");
    drop(first_read);
    drop(first);

    let mut second = product.create_unpublished("generation-2").unwrap();
    fixture.populate(second.path());
    let verified = fixture.verify(&mut second).unwrap();
    crate::receipt::publish_active_receipt(verified).unwrap();
    let second_read =
        crate::receipt::read_active_receipt_journal(&fixture.paths, &fixture.guard).unwrap();
    let crate::receipt::ActiveReceiptReadState::Settled(second_receipt) =
        second_read.state().unwrap()
    else {
        panic!("steady publication did not settle");
    };
    assert_eq!(second_receipt.sequence(), 2);
    assert_eq!(second_receipt.active_generation(), "generation-2");
    drop(second_read);
    drop(second);

    let mut third = product.create_unpublished("generation-3").unwrap();
    fixture.populate(third.path());
    let verified = fixture.verify(&mut third).unwrap();
    crate::receipt::publish_active_receipt(verified).unwrap();
    let third_read =
        crate::receipt::read_active_receipt_journal(&fixture.paths, &fixture.guard).unwrap();
    let crate::receipt::ActiveReceiptReadState::Settled(third_receipt) =
        third_read.state().unwrap()
    else {
        panic!("complete-preimage publication did not settle");
    };
    assert_eq!(third_receipt.sequence(), 3);
    assert_eq!(third_receipt.active_generation(), "generation-3");
}

#[test]
fn missing_extra_and_same_size_wrong_bytes_are_rejected() {
    let fixture = Fixture::new();
    fixture.with_generation(|generation| {
        std::fs::remove_file(generation.path().join("bin/dashboard.exe")).unwrap();
        assert!(matches!(
            fixture.verify(generation),
            Err(ManifestError::MissingFile(_)) | Err(ManifestError::Io { .. })
        ));
    });

    let fixture = Fixture::new();
    fixture.with_generation(|generation| {
        write_file(generation.path(), "undeclared.bin", b"extra");
        assert!(matches!(
            fixture.verify(generation),
            Err(ManifestError::ExtraFile(_))
        ));
    });

    let mut fixture = Fixture::new();
    let unrecorded_tree_file = b"declared release file but absent A2A tree evidence";
    fixture.mutate_member(|member| {
        member["file_digests"]["a2a/capsule/unrecorded"] =
            serde_json::json!(hex::sha256(unrecorded_tree_file));
    });
    fixture.with_generation(|generation| {
        write_file(
            generation.path(),
            "a2a/capsule/unrecorded",
            unrecorded_tree_file,
        );
        assert!(matches!(
            fixture.verify(generation),
            Err(ManifestError::ExtraFile(_))
        ));
    });

    let fixture = Fixture::new();
    fixture.with_generation(|generation| {
        write_file(generation.path(), "bin/dashboard.exe", b"xxxxxxxxxxxxxxxx");
        assert!(matches!(
            fixture.verify(generation),
            Err(ManifestError::DigestDrift { .. })
        ));
    });
}

#[test]
fn symlink_payload_is_rejected_before_hashing() {
    let fixture = Fixture::new();
    fixture.with_generation(|generation| {
        let link = generation.path().join("bin/dashboard.exe");
        std::fs::remove_file(&link).unwrap();
        let target = generation.path().join("bin/updater.exe");
        #[cfg(unix)]
        std::os::unix::fs::symlink(&target, &link).unwrap();
        #[cfg(windows)]
        std::os::windows::fs::symlink_file(&target, &link).unwrap();
        assert!(matches!(
            fixture.verify(generation),
            Err(ManifestError::UnsafeFileType { .. })
        ));
    });
}

#[test]
fn both_entrypoints_require_real_tree_evidence_and_executable_mode() {
    let fixture = Fixture::new();
    fixture.with_generation(|generation| {
        std::fs::remove_file(generation.path().join("a2a/capsule/bin/vaultspec-a2a")).unwrap();
        assert!(fixture.verify(generation).is_err());
    });

    let fixture = Fixture::new();
    fixture.with_generation(|generation| {
        std::fs::remove_file(generation.path().join("a2a/capsule/bin/vaultspec-a2a-mcp")).unwrap();
        assert!(fixture.verify(generation).is_err());
    });

    let fixture = Fixture::with_entrypoint_mode("0644");
    assert!(matches!(
        fixture.verify_result(),
        Err(ManifestError::IdentityMismatch { .. })
    ));
}

#[test]
fn bounded_reread_and_final_snapshot_detect_real_file_drift() {
    let fixture = Fixture::new();
    fixture.with_generation(|generation| {
        let initial = scan_generation(generation.path(), Some("release.json")).unwrap();
        let relative = "a2a/component-manifest.json";
        let path = generation.path().join(relative);
        let original = std::fs::read(&path).unwrap();
        let replacement = vec![b'x'; original.len()];
        std::fs::write(&path, replacement).unwrap();
        assert!(matches!(
            read_installed_bounded(
                generation.path(),
                relative,
                MAX_CAPSULE_MANIFEST_BYTES,
                observed_file(&initial.files, relative).unwrap(),
            ),
            Err(ManifestError::GenerationChanged { .. })
        ));
        let final_snapshot = scan_generation(generation.path(), Some("release.json")).unwrap();
        assert!(matches!(
            require_unchanged_snapshot(&initial, &final_snapshot),
            Err(ManifestError::GenerationChanged { .. })
        ));
    });

    let fixture = Fixture::new();
    fixture.with_generation(|generation| {
        let initial = scan_generation(generation.path(), Some("release.json")).unwrap();
        let relative = "a2a/component-manifest.json";
        let initial_file = observed_file(&initial.files, relative).unwrap();
        let path = generation.path().join(relative);
        let mut append = std::fs::OpenOptions::new().append(true).open(path).unwrap();
        use std::io::Write;
        append.write_all(b"growth").unwrap();
        assert!(matches!(
            read_installed_bounded(generation.path(), relative, initial_file.size, initial_file,),
            Err(ManifestError::InputTooLarge { .. })
        ));
    });

    let fixture = Fixture::new();
    fixture.with_generation(|generation| {
        let initial = scan_generation(generation.path(), Some("release.json")).unwrap();
        let relative = "a2a/component-manifest.json";
        let initial_file = observed_file(&initial.files, relative).unwrap();
        let path = generation.path().join(relative);
        let old = generation.path().join("a2a/component-manifest.old");
        let bytes = std::fs::read(&path).unwrap();
        std::fs::rename(&path, &old).unwrap();
        std::fs::write(&path, &bytes).unwrap();
        set_mode(&path, "0644");
        std::fs::remove_file(old).unwrap();
        assert_eq!(
            read_installed_bounded(
                generation.path(),
                relative,
                MAX_CAPSULE_MANIFEST_BYTES,
                initial_file,
            )
            .unwrap(),
            bytes
        );
    });
}

#[test]
fn trusted_digest_uniquely_locates_member_and_rejects_declared_path_mismatch() {
    let fixture = Fixture::new();
    fixture.with_generation(|generation| {
        assert!(matches!(
            fixture.verify_with(generation, "f".repeat(64), valid_receipt_context()),
            Err(ManifestError::MissingFile(_))
        ));
    });

    let fixture = Fixture::new();
    fixture.with_generation(|generation| {
        write_file(generation.path(), "release-copy.json", &fixture.member);
        assert!(matches!(
            fixture.verify(generation),
            Err(ManifestError::InvalidField { field, .. })
                if field == "release member manifest"
        ));
    });

    let mut fixture = Fixture::new();
    fixture.mutate_member(|member| {
        member["release_manifest"]["path"] = serde_json::json!("different.json");
    });
    assert!(matches!(
        fixture.verify_result(),
        Err(ManifestError::IdentityMismatch { .. })
    ));
}

#[test]
fn invalid_receipt_context_is_rejected_before_release_authority() {
    let fixture = Fixture::new();
    fixture.with_generation(|generation| {
        let mut nonpositive_time = valid_receipt_context();
        nonpositive_time.created_ms = 0;
        assert!(matches!(
            fixture.verify_with(
                generation,
                fixture.member_digest.clone(),
                nonpositive_time
            ),
            Err(ManifestError::InvalidField { field, .. }) if field == "receipt.created_ms"
        ));

        let mut zero_pid = valid_receipt_context();
        zero_pid.prior_seat.as_mut().unwrap().pid = Some(0);
        assert!(matches!(
            fixture.verify_with(generation, fixture.member_digest.clone(), zero_pid),
            Err(ManifestError::InvalidField { field, .. }) if field == "receipt.prior_seat.pid"
        ));

        let mut bad_generation = valid_receipt_context();
        bad_generation.prior_seat.as_mut().unwrap().generation = "not valid".to_string();
        assert!(matches!(
            fixture.verify_with(
                generation,
                fixture.member_digest.clone(),
                bad_generation
            ),
            Err(ManifestError::InvalidField { field, .. })
                if field == "receipt.prior_seat.generation"
        ));

        let mut bad_version = valid_receipt_context();
        bad_version.prior_seat.as_mut().unwrap().dashboard_version = "latest".to_string();
        assert!(matches!(
            fixture.verify_with(generation, fixture.member_digest.clone(), bad_version),
            Err(ManifestError::FloatingSelector { field, .. })
                if field == "receipt.prior_seat.dashboard_version"
        ));
    });
}

#[test]
fn hard_link_aliases_are_rejected_from_same_handle_observations() {
    let fixture = Fixture::new();
    fixture.with_generation(|generation| {
        let dashboard = generation.path().join("bin/dashboard.exe");
        let external_alias = fixture.paths.root().join("external-dashboard-alias");
        match std::fs::hard_link(&dashboard, &external_alias) {
            Ok(()) => assert!(matches!(
                fixture.verify(generation),
                Err(ManifestError::UnsafeFileType { .. })
            )),
            #[cfg(windows)]
            Err(error) => assert!(matches!(error.raw_os_error(), Some(5 | 32))),
            #[cfg(unix)]
            Err(error) => panic!("real external hard link failed: {error}"),
        }
    });

    let fixture = Fixture::new();
    fixture.with_generation(|generation| {
        let dashboard = generation.path().join("bin/dashboard.exe");
        let in_tree_alias = generation.path().join("bin/dashboard-alias.exe");
        match std::fs::hard_link(dashboard, in_tree_alias) {
            Ok(()) => assert!(matches!(
                fixture.verify(generation),
                Err(ManifestError::UnsafeFileType { .. })
            )),
            #[cfg(windows)]
            Err(error) => assert!(matches!(error.raw_os_error(), Some(5 | 32))),
            #[cfg(unix)]
            Err(error) => panic!("real in-tree hard link failed: {error}"),
        }
    });
}

#[test]
fn activation_revalidation_rejects_semantic_drift_and_accepts_same_content_replacement() {
    let fixture = Fixture::new();
    fixture.with_generation(|generation| {
        let generation_path = generation.path().to_path_buf();
        let verified = fixture.verify(generation).unwrap();
        write_file(&generation_path, "bin/dashboard.exe", b"xxxxxxxxxxxxxxxx");
        assert!(matches!(
            verified.revalidate_for_activation(),
            Err(ManifestError::GenerationChanged { .. })
        ));
    });

    let fixture = Fixture::new();
    fixture.with_generation(|generation| {
        let release = generation.path().join("release.json");
        let verified = fixture.verify(generation).unwrap();
        let mut bytes = std::fs::read(&release).unwrap();
        bytes.push(b'\n');
        std::fs::write(release, bytes).unwrap();
        assert!(matches!(
            verified.revalidate_for_activation(),
            Err(ManifestError::GenerationChanged { .. })
        ));
    });

    let fixture = Fixture::new();
    fixture.with_generation(|generation| {
        let path = generation.path().join("bin/dashboard.exe");
        let old = generation.path().join("bin/dashboard.old");
        let verified = fixture.verify(generation).unwrap();
        let bytes = std::fs::read(&path).unwrap();
        std::fs::rename(&path, &old).unwrap();
        std::fs::write(&path, &bytes).unwrap();
        set_mode(&path, "0644");
        std::fs::remove_file(old).unwrap();
        verified.revalidate_for_activation().unwrap();
    });
}

#[test]
fn retained_generation_substitution_is_detected_or_denied_by_platform_authority() {
    let fixture = Fixture::new();
    fixture.with_generation(|generation| {
        let path = generation.path().to_path_buf();
        let verified = fixture.verify(generation).unwrap();
        assert_eq!(verified.generation_id(), "generation-1");
        let moved = fixture.paths.generations_dir().join("generation-1-moved");
        #[cfg(unix)]
        {
            std::fs::rename(&path, &moved).unwrap();
            std::fs::create_dir(&path).unwrap();
            restrict_test_directory(&path);
            assert!(matches!(
                verified.revalidate_for_activation(),
                Err(ManifestError::GenerationAuthority(_))
            ));
        }
        #[cfg(windows)]
        {
            assert!(std::fs::rename(&path, &moved).is_err());
            clear_generation_contents(&path);
            assert!(std::fs::remove_dir(&path).is_err());
        }
    });
}

#[test]
fn permission_and_child_acl_drift_fail_closed() {
    let fixture = Fixture::new();
    fixture.with_generation(|generation| {
        let generation_path = generation.path().to_path_buf();
        let verified = fixture.verify(generation).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&generation_path, std::fs::Permissions::from_mode(0o770))
                .unwrap();
            assert!(matches!(
                verified.revalidate_for_activation(),
                Err(ManifestError::GenerationAuthority(_))
            ));
            restrict_test_directory(&generation_path);
        }
        #[cfg(windows)]
        {
            let payload_directory = generation_path.join("a2a");
            permit_test_peer(&payload_directory);
            assert!(matches!(
                verified.revalidate_for_activation(),
                Err(ManifestError::UnsafeFileType { .. })
            ));
            remove_test_peer(&payload_directory);
        }
    });

    #[cfg(windows)]
    {
        let fixture = Fixture::new();
        fixture.with_generation(|generation| {
            let payload = generation.path().join("bin/dashboard.exe");
            let verified = fixture.verify(generation).unwrap();
            permit_test_peer(&payload);
            assert!(matches!(
                verified.revalidate_for_activation(),
                Err(ManifestError::UnsafeFileType { .. })
            ));
            remove_test_peer(&payload);
        });
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        let fixture = Fixture::new();
        fixture.with_generation(|generation| {
            let directory = generation.path().join("a2a");
            let original = std::fs::metadata(&directory).unwrap().permissions().mode() & 0o777;
            let changed = if original == 0o700 { 0o750 } else { 0o700 };
            let verified = fixture.verify(generation).unwrap();
            std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(changed)).unwrap();
            assert!(matches!(
                verified.revalidate_for_activation(),
                Err(ManifestError::GenerationChanged { .. })
            ));
            std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(original))
                .unwrap();
        });

        let fixture = Fixture::new();
        fixture.with_generation(|generation| {
            let file = generation.path().join("bin/dashboard.exe");
            let verified = fixture.verify(generation).unwrap();
            set_mode(&file, "0755");
            assert!(matches!(
                verified.revalidate_for_activation(),
                Err(ManifestError::GenerationChanged { .. })
            ));
            set_mode(&file, "0644");
        });
    }
}

#[test]
fn empty_directory_subtrees_are_refused_as_namespace_only_state() {
    let fixture = Fixture::new();
    fixture.with_generation(|generation| {
        let empty = generation.path().join("empty-state");
        std::fs::create_dir(&empty).unwrap();
        assert!(matches!(
            fixture.verify(generation),
            Err(ManifestError::InvalidField { field, detail })
                if field == "generation tree"
                    && detail.contains("has no regular-file descendant")
        ));
    });

    let fixture = Fixture::new();
    fixture.with_generation(|generation| {
        let parent = generation.path().join("nested-state");
        let empty_leaf = parent.join("empty-leaf");
        std::fs::create_dir(&parent).unwrap();
        std::fs::create_dir(&empty_leaf).unwrap();
        write_file(generation.path(), "nested-state/content.bin", b"content");
        assert!(matches!(
            fixture.verify(generation),
            Err(ManifestError::InvalidField { field, detail })
                if field == "generation tree"
                    && detail.contains("empty-leaf")
        ));
    });

    let fixture = Fixture::new();
    fixture.with_generation(|generation| {
        std::fs::create_dir(generation.path().join("unsafe name")).unwrap();
        assert!(matches!(
            fixture.verify(generation),
            Err(ManifestError::InvalidField { .. })
        ));
    });

    #[cfg(unix)]
    {
        let fixture = Fixture::new();
        fixture.with_generation(|generation| {
            std::fs::create_dir(generation.path().join("CaseEmpty")).unwrap();
            std::fs::create_dir(generation.path().join("caseempty")).unwrap();
            assert!(matches!(
                fixture.verify(generation),
                Err(ManifestError::InvalidField { .. })
            ));
        });
    }

    #[cfg(windows)]
    {
        let fixture = Fixture::new();
        fixture.with_generation(|generation| {
            let empty = generation.path().join("empty-peer-state");
            std::fs::create_dir(&empty).unwrap();
            permit_test_peer(&empty);
            assert!(matches!(
                fixture.verify(generation),
                Err(ManifestError::UnsafeFileType { .. })
            ));
            remove_test_peer(&empty);
        });
    }
}

#[test]
fn verified_borrow_release_allows_real_exact_empty_discard() {
    let fixture = Fixture::new();
    fixture.with_owned_generation(|mut generation| {
        let verified = fixture.verify(&mut generation).unwrap();
        assert_eq!(verified.generation_id(), "generation-1");
        drop(verified);
        clear_generation_contents(generation.path());
        assert!(matches!(
            generation.discard(),
            DiscardOutcome::Removed { generation } if generation == "generation-1"
        ));
    });
}

#[test]
fn independent_known_vectors_pin_jcs_and_a2a_tree_preimages() {
    const COHORT_VECTOR: &str = r#"{
            "members":[
                {"target":"aarch64-apple-darwin","member_manifest_digest":"0000000000000000000000000000000000000000000000000000000000000000"},
                {"target":"x86_64-apple-darwin","member_manifest_digest":"1111111111111111111111111111111111111111111111111111111111111111"},
                {"target":"aarch64-unknown-linux-gnu","member_manifest_digest":"2222222222222222222222222222222222222222222222222222222222222222"},
                {"target":"x86_64-unknown-linux-gnu","member_manifest_digest":"3333333333333333333333333333333333333333333333333333333333333333"},
                {"target":"x86_64-pc-windows-msvc","member_manifest_digest":"4444444444444444444444444444444444444444444444444444444444444444"}
            ],
            "id":"release-vector",
            "schema_version":"1.0",
            "digest_algorithm":"sha256"
        }"#;
    assert_eq!(
        cohort_descriptor_digest(COHORT_VECTOR.as_bytes()).unwrap(),
        "7ee09a8a08f555f52d50ad0cf711794fc8b7e780c422a89d9ab918831a0de358"
    );
    let records = vec![
        ValidatedTreeRecord {
            path: "bin/a".to_string(),
            mode: "0755".to_string(),
            size: 1,
            size_text: "1".to_string(),
            digest: "a".repeat(64),
        },
        ValidatedTreeRecord {
            path: "lib/b".to_string(),
            mode: "0644".to_string(),
            size: 2,
            size_text: "2".to_string(),
            digest: "b".repeat(64),
        },
    ];
    assert_eq!(
        tree_digest(&records).unwrap(),
        "aad0f7ef91424f0e2b4d40e4ecf96253cbda7b1679da3c7978d92cfc44a47b70"
    );
}

#[test]
fn cohort_order_duplicate_and_member_mismatch_are_rejected() {
    let mut fixture = Fixture::new();
    let mut descriptor: serde_json::Value = serde_json::from_slice(&fixture.descriptor).unwrap();
    descriptor["members"].as_array_mut().unwrap().swap(0, 1);
    fixture.descriptor = serde_json::to_vec(&descriptor).unwrap();
    assert!(fixture.verify_result().is_err());

    let mut fixture = Fixture::new();
    let mut descriptor: serde_json::Value = serde_json::from_slice(&fixture.descriptor).unwrap();
    descriptor["members"][1]["target"] = descriptor["members"][0]["target"].clone();
    fixture.descriptor = serde_json::to_vec(&descriptor).unwrap();
    assert!(fixture.verify_result().is_err());

    let mut fixture = Fixture::new();
    let mut descriptor: serde_json::Value = serde_json::from_slice(&fixture.descriptor).unwrap();
    descriptor["members"][4]["member_manifest_digest"] = serde_json::json!("9".repeat(64));
    fixture.descriptor = serde_json::to_vec(&descriptor).unwrap();
    fixture.cohort_digest = cohort_descriptor_digest(&fixture.descriptor).unwrap();
    assert!(matches!(
        fixture.verify_result(),
        Err(ManifestError::DigestDrift { .. })
    ));
}

#[test]
fn candidate_cannot_self_authorize_component_lock_or_alias_paths() {
    let mut fixture = Fixture::new();
    fixture.mutate_member(|member| {
        member["a2a_component"]["component_lock"]["digest"] = serde_json::json!("0".repeat(64));
    });
    assert!(matches!(
        fixture.verify_result(),
        Err(ManifestError::DigestDrift { .. })
    ));

    let mut fixture = Fixture::new();
    fixture.mutate_member(|member| {
        member["dashboard"]["path"] = serde_json::json!("bin/../dashboard.exe");
    });
    assert!(matches!(
        fixture.verify_result(),
        Err(ManifestError::InvalidField { .. })
    ));
}

#[test]
fn updater_sbom_license_archive_and_tree_joins_are_not_advisory() {
    for pointer in [
        "/updater/digest",
        "/sbom/digest",
        "/licenses/0/digest",
        "/a2a_component/capsule_archive/digest",
        "/a2a_component/tree_evidence/tree_digest",
    ] {
        let mut fixture = Fixture::new();
        fixture.mutate_member(|member| {
            *member.pointer_mut(pointer).unwrap() = serde_json::json!("0".repeat(64));
        });
        assert!(
            fixture.verify_result().is_err(),
            "{pointer} drift must reject"
        );
    }
}

#[test]
fn closed_versions_assets_and_positive_artifact_sizes_fail_closed() {
    let mut fixture = Fixture::new();
    fixture.mutate_member(|member| member["schema_version"] = serde_json::json!("1.0"));
    assert!(fixture.verify_result().is_err());

    let mut fixture = Fixture::new();
    fixture.mutate_member(|member| member["dashboard"]["size"] = serde_json::json!(0));
    assert!(fixture.verify_result().is_err());

    let fixture = Fixture::new();
    let mut capsule: serde_json::Value =
        serde_json::from_slice(fixture.payload("a2a/component-manifest.json")).unwrap();
    let duplicate = capsule["assets"][0].clone();
    capsule["assets"].as_array_mut().unwrap().push(duplicate);
    assert!(CapsuleManifest::parse(&serde_json::to_string(&capsule).unwrap()).is_err());

    let fixture = Fixture::new();
    let mut capsule: serde_json::Value =
        serde_json::from_slice(fixture.payload("a2a/component-manifest.json")).unwrap();
    capsule["compatibility"]["migration_range"]["head"] = serde_json::json!("0009");
    capsule["consistency_group"]["stores"][0]["schema_version"] = serde_json::json!("0009");
    assert!(CapsuleManifest::parse(&serde_json::to_string(&capsule).unwrap()).is_err());
}
