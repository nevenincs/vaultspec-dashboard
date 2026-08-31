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
    with_a2a: bool,
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
        Self::build(entrypoint_mode, true)
    }

    /// The same release tree built WITHOUT the bundled a2a runtime: no onedir,
    /// no component lock in the tree, and a member manifest that omits
    /// `a2a_component` outright.
    ///
    /// A separate constructor rather than a mutation of [`Self::new`], so every
    /// proof that runs against a tree that DOES bundle the runtime keeps running
    /// against one.
    pub(crate) fn without_a2a() -> Self {
        Self::build("0755", false)
    }

    fn build(entrypoint_mode: &str, with_a2a: bool) -> Self {
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
        let license = b"MIT license evidence".to_vec();
        let sbom = b"{\"bomFormat\":\"CycloneDX\"}\n".to_vec();
        let tree_file = b"bundled-runtime-file".to_vec();
        let gateway_file = b"gateway-entrypoint".to_vec();
        let standalone_file = b"standalone-mcp-entrypoint".to_vec();
        let mut payloads: Vec<(String, Vec<u8>)> = vec![
            ("bin/dashboard.exe".to_string(), dashboard),
            ("bin/updater.exe".to_string(), updater),
            ("licenses/a2a.txt".to_string(), license),
            ("sbom.cdx.json".to_string(), sbom),
        ];
        // The lock is placed with the runtime it pins, never on its own: a tree
        // that bundles no runtime carries no source for the lock to pin.
        if with_a2a {
            payloads.extend([
                (COMPONENT_LOCK_PATH.to_string(), LOCK_BYTES.to_vec()),
                (RUNTIME_ENTRYPOINT_PATH.to_string(), gateway_file),
                (
                    "a2a/capsule/bin/vaultspec-a2a-mcp".to_string(),
                    standalone_file,
                ),
                ("a2a/capsule/runtime/tool".to_string(), tree_file),
            ]);
        }
        payloads.sort_by(|left, right| left.0.cmp(&right.0));
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
            "licenses": [{"component": "vaultspec-a2a", "spdx": "MIT", "path": "licenses/a2a.txt", "digest": digests["licenses/a2a.txt"]}],
            "sbom": {"format": "cyclonedx", "path": "sbom.cdx.json", "size": sizes["sbom.cdx.json"], "digest": digests["sbom.cdx.json"]},
            "file_digests": serde_json::Value::Object(digests)
        });
        let mut release = release;
        // Present or omitted; never emptied. A member that bundles no runtime
        // states nothing about one.
        if with_a2a {
            release["a2a_component"] = serde_json::json!({
                "commit": lock.a2a_source.commit,
                "release_identity": lock.a2a_source.release_identity,
                "component_lock": {"path": COMPONENT_LOCK_PATH, "digest": lock_digest},
                "runtime": {"root": RUNTIME_ROOT, "entrypoint": RUNTIME_ENTRYPOINT_PATH, "file_count": 3}
            });
        }
        let member = serde_json::to_vec(&release).unwrap();
        let member_digest = hex::sha256(&member);
        let descriptor = cohort_bytes(&member_digest);
        let cohort_digest = cohort_descriptor_digest(&descriptor).unwrap();
        Self {
            paths,
            guard,
            payloads,
            entrypoint_mode: entrypoint_mode.to_string(),
            with_a2a,
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
        if self.with_a2a {
            set_mode(
                &root.join("a2a/capsule/bin/vaultspec-a2a"),
                &self.entrypoint_mode,
            );
            set_mode(
                &root.join("a2a/capsule/bin/vaultspec-a2a-mcp"),
                &self.entrypoint_mode,
            );
        }
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

    /// Verified-release facts shaped for the sealed first-install drive.
    ///
    /// Real fixture values, not a stand-in: the same member digest, component
    /// lock, and capsule root this fixture verifies against. Only the transport
    /// differs - the public path copies these out of the opaque distribution
    /// capability, which crate tests cannot construct.
    pub(crate) fn first_install_feed(&self) -> crate::provisioning::FirstInstallFeed {
        // Derived from this fixture's OWN cohort descriptor, so the feed cannot
        // drift from what the fixture actually verifies against.
        let descriptor: serde_json::Value =
            serde_json::from_slice(&self.descriptor).expect("fixture cohort descriptor");
        let members = descriptor["members"]
            .as_array()
            .expect("cohort members")
            .iter()
            .map(|member| {
                (
                    member["target"]
                        .as_str()
                        .expect("member target")
                        .to_string(),
                    member["member_manifest_digest"]
                        .as_str()
                        .expect("member digest")
                        .to_string(),
                )
            })
            .collect();
        crate::provisioning::FirstInstallFeed {
            release_identity: descriptor["id"].as_str().expect("cohort id").to_string(),
            target_triple: TARGET.triple().to_string(),
            member_manifest_sha256: self.member_digest.clone(),
            members,
            component_lock: LOCK_BYTES.to_vec(),
            capsule_root: "a2a/capsule".to_string(),
        }
    }

    /// The ownership fact, derived the way the real paths derive it.
    ///
    /// A settled receipt means this is an UPDATE, so the fact is CARRIED out of
    /// that receipt. With no receipt it is a FIRST INSTALL, so the fact is
    /// PROVEN from a real credential proof. Neither branch can state the fact
    /// directly - that is the constraint under test, not a detail of the
    /// fixture. The pending authority is dropped once proven: the fact is `Copy`
    /// and detaches, and releasing the claim keeps the fixture reusable.
    fn bootstrap_fact(&self) -> BootstrapOwnership {
        if let Ok(read) = crate::receipt::read_active_receipt_journal(&self.paths, &self.guard)
            && let Ok(crate::receipt::ActiveReceiptReadState::Settled(receipt)) = read.state()
        {
            return BootstrapOwnership::carried_from_prior(receipt);
        }
        let store = crate::credentials::DashboardCredentialStore::for_product(&self.paths);
        let pending = store
            .begin_bootstrap(&self.guard)
            .expect("fixture first-install credential proof");
        let fact = BootstrapOwnership::proven(&pending).expect("a live proof revalidates");
        drop(pending);
        fact
    }

    pub(crate) fn verify<'generation, 'product, 'lock>(
        &self,
        generation: &'generation mut UnpublishedGeneration<'product, 'lock>,
    ) -> Result<VerifiedReleaseSet<'generation, 'product, 'lock>> {
        self.verify_with(
            generation,
            self.member_digest.clone(),
            valid_receipt_context(self),
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

    pub(crate) fn mutate_member(&mut self, mutate: impl FnOnce(&mut serde_json::Value)) {
        let mut value: serde_json::Value = serde_json::from_slice(&self.member).unwrap();
        mutate(&mut value);
        self.member = serde_json::to_vec(&value).unwrap();
        self.member_digest = hex::sha256(&self.member);
        self.descriptor = cohort_bytes(&self.member_digest);
        self.cohort_digest = cohort_descriptor_digest(&self.descriptor).unwrap();
    }
}

/// The bundled runtime's root inside the release tree.
pub(crate) const RUNTIME_ROOT: &str = "a2a/capsule";

/// The bundled runtime's launchable entrypoint inside the release tree.
pub(crate) const RUNTIME_ENTRYPOINT_PATH: &str = "a2a/capsule/bin/vaultspec-a2a";

/// A valid activation context for field-validation fixtures.
///
/// The ownership fact is derived from a REAL first-install credential proof
/// rather than a literal - the constructors take a proof or a settled receipt,
/// by design, so a test cannot mint the fact and then claim to be exercising the
/// constraint. The pending authority is dropped immediately: the fact is `Copy`
/// and detaches, and releasing the claim keeps the fixture reusable.
fn valid_receipt_context(fixture: &Fixture) -> ReceiptActivationContext {
    let bootstrap_created_ownership = fixture.bootstrap_fact();
    ReceiptActivationContext {
        channel: Channel::SelfInstall,
        bootstrap_created_ownership,
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
        assert_eq!(verified.capsule_root(), RUNTIME_ROOT);
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

    // A file smuggled INTO the bundled-runtime root is refused even when it is
    // declared coherently: the runtime's declared file count no longer matches
    // what is installed under its root.
    let mut fixture = Fixture::new();
    let unrecorded_tree_file = b"a file smuggled into the bundled runtime";
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
            Err(ManifestError::InvalidField { .. })
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
fn the_declared_runtime_entrypoint_must_be_installed_and_executable() {
    // An entrypoint the manifest declares but the tree does not carry is refused:
    // a runtime that cannot launch must not verify as installable.
    let fixture = Fixture::new();
    fixture.with_generation(|generation| {
        std::fs::remove_file(generation.path().join(RUNTIME_ENTRYPOINT_PATH)).unwrap();
        assert!(fixture.verify(generation).is_err());
    });

    // Present but not executable is equally unusable, and equally refused. The
    // mode is now read from the INSTALLED file rather than from a declared
    // inventory document, so this half of the contract is only expressible where
    // the platform records a POSIX mode.
    #[cfg(unix)]
    {
        let fixture = Fixture::with_entrypoint_mode("0644");
        assert!(matches!(
            fixture.verify_result(),
            Err(ManifestError::IdentityMismatch { .. })
        ));
    }
}

#[test]
fn bounded_reread_and_final_snapshot_detect_real_file_drift() {
    let fixture = Fixture::new();
    fixture.with_generation(|generation| {
        let initial = scan_generation(generation.path(), Some("release.json")).unwrap();
        let relative = "bin/updater.exe";
        let path = generation.path().join(relative);
        let original = std::fs::read(&path).unwrap();
        let replacement = vec![b'x'; original.len()];
        std::fs::write(&path, replacement).unwrap();
        assert!(matches!(
            read_installed_bounded(
                generation.path(),
                relative,
                MAX_COMPONENT_LOCK_BYTES as u64,
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
        let relative = "bin/updater.exe";
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
        let relative = "bin/updater.exe";
        let initial_file = observed_file(&initial.files, relative).unwrap();
        let path = generation.path().join(relative);
        let old = generation.path().join("bin/updater.exe.old");
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
            fixture.verify_with(generation, "f".repeat(64), valid_receipt_context(&fixture)),
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
        let mut nonpositive_time = valid_receipt_context(&fixture);
        nonpositive_time.created_ms = 0;
        assert!(matches!(
            fixture.verify_with(
                generation,
                fixture.member_digest.clone(),
                nonpositive_time
            ),
            Err(ManifestError::InvalidField { field, .. }) if field == "receipt.created_ms"
        ));

        let mut zero_pid = valid_receipt_context(&fixture);
        zero_pid.prior_seat.as_mut().unwrap().pid = Some(0);
        assert!(matches!(
            fixture.verify_with(generation, fixture.member_digest.clone(), zero_pid),
            Err(ManifestError::InvalidField { field, .. }) if field == "receipt.prior_seat.pid"
        ));

        let mut bad_generation = valid_receipt_context(&fixture);
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

        let mut bad_version = valid_receipt_context(&fixture);
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
            let payload_directory = generation_path.join("bin");
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
            let directory = generation.path().join("bin");
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
fn an_independent_known_vector_pins_the_jcs_cohort_preimage() {
    const COHORT_VECTOR: &str = r#"{
            "members":[
                {"target":"aarch64-apple-darwin","member_manifest_digest":"0000000000000000000000000000000000000000000000000000000000000000"},
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
        "729a3486c5497ae66e55ec11d2a262bf84e84bf125b554592f83640924c3f6b1"
    );
}

#[test]
fn the_cohort_preimage_binds_member_bytes_so_dropping_a2a_changes_the_digest() {
    // The vector above is a HAND-WRITTEN descriptor: it carries member digests,
    // never member documents, so nothing inside a member moves it. What a member
    // does move is the digest it hashes to — dropping `a2a_component` changes the
    // member bytes, so the descriptor built over them is a different document
    // with a different digest. Pinning that difference is what proves the member
    // shape reaches the cohort preimage at all.
    let with_a2a = Fixture::new();
    let without_a2a = Fixture::without_a2a();
    assert_ne!(with_a2a.member_digest, without_a2a.member_digest);
    assert_ne!(with_a2a.cohort_digest, without_a2a.cohort_digest);
    // Each shape is deterministic under the same canonicalization.
    assert_eq!(
        cohort_descriptor_digest(&without_a2a.descriptor).unwrap(),
        without_a2a.cohort_digest
    );
}

#[test]
fn an_a2a_less_member_states_nothing_about_a_runtime_it_does_not_carry() {
    let fixture = Fixture::without_a2a();
    let text = std::str::from_utf8(&fixture.member).unwrap();
    let value: serde_json::Value = serde_json::from_slice(&fixture.member).unwrap();

    // Omitted, not emptied: no block, no zeroed count, no stub path.
    assert!(value.get("a2a_component").is_none());
    assert!(!text.contains("a2a_component"));
    // And no pin smuggled in under another name: the committed lock's own
    // identity appears nowhere in a member that bundles no source.
    let lock = ComponentLock::parse(std::str::from_utf8(LOCK_BYTES).unwrap()).unwrap();
    assert!(!text.contains(COMPONENT_LOCK_PATH));
    assert!(!text.contains(&lock.a2a_source.commit));
    assert!(!text.contains(RUNTIME_ROOT));

    // The document is still a valid member manifest under the same parser.
    parse_release(&fixture.member).expect("an a2a-less member parses");

    // The tree matches what the member says: no lock file, no runtime subtree.
    fixture.with_generation(|generation| {
        assert!(!generation.path().join(COMPONENT_LOCK_PATH).exists());
        assert!(!generation.path().join(RUNTIME_ROOT).exists());
    });
}

#[test]
fn a_generation_with_no_bundled_runtime_cannot_be_verified_as_a_startable_release() {
    // The release authority hands a caller a runtime to start. A generation
    // carrying none has nothing to hand over, and says so explicitly rather than
    // verifying and then producing a fabricated entrypoint.
    let fixture = Fixture::without_a2a();
    assert!(
        matches!(
            fixture.verify_result(),
            Err(ManifestError::InvalidField { ref field, ref detail })
                if field == "a2a_component" && detail.contains("no bundled a2a runtime")
        ),
        "an a2a-less generation must be refused by name, got {:?}",
        fixture.verify_result()
    );
}

#[test]
fn an_a2a_less_member_that_adds_a_component_block_does_not_self_authorize_a_runtime() {
    // The member re-digests itself and its own cohort descriptor after the
    // edit, so the block is as internally coherent as a document can make
    // itself, and every value in it is copied from the REAL committed lock. It
    // still authorizes nothing: the lock bytes are supplied independently and
    // must be present in the tree at the path the block names, and this tree
    // carries neither them nor the runtime subtree the block declares.
    let lock = ComponentLock::parse(std::str::from_utf8(LOCK_BYTES).unwrap()).unwrap();
    let lock_digest = hex::sha256(LOCK_BYTES);
    let mut fixture = Fixture::without_a2a();
    fixture.mutate_member(|member| {
        member["a2a_component"] = serde_json::json!({
            "commit": lock.a2a_source.commit,
            "release_identity": lock.a2a_source.release_identity,
            "component_lock": {"path": COMPONENT_LOCK_PATH, "digest": lock_digest},
            "runtime": {"root": RUNTIME_ROOT, "entrypoint": RUNTIME_ENTRYPOINT_PATH, "file_count": 3}
        });
    });
    assert!(
        matches!(
            fixture.verify_result(),
            Err(ManifestError::MissingFile(ref path)) if path == COMPONENT_LOCK_PATH
        ),
        "a fabricated a2a_component must fail against the tree, got {:?}",
        fixture.verify_result()
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
    descriptor["members"][3]["member_manifest_digest"] = serde_json::json!("9".repeat(64));
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
fn updater_sbom_license_and_component_joins_are_not_advisory() {
    for pointer in [
        "/updater/digest",
        "/sbom/digest",
        "/licenses/0/digest",
        "/a2a_component/component_lock/digest",
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

    // The runtime declaration is held to the same standard: an entrypoint that
    // names a file no longer in the tree is a refusal, not an advisory note.
    let mut fixture = Fixture::new();
    fixture.mutate_member(|member| {
        member["a2a_component"]["runtime"]["entrypoint"] =
            serde_json::json!("a2a/capsule/bin/absent");
    });
    assert!(fixture.verify_result().is_err());
}

#[test]
fn closed_versions_assets_and_positive_artifact_sizes_fail_closed() {
    let mut fixture = Fixture::new();
    fixture.mutate_member(|member| member["schema_version"] = serde_json::json!("1.0"));
    assert!(fixture.verify_result().is_err());

    let mut fixture = Fixture::new();
    fixture.mutate_member(|member| member["dashboard"]["size"] = serde_json::json!(0));
    assert!(fixture.verify_result().is_err());

    // The capsule document is no longer a release-tree payload, but the parser
    // still serves the lifecycle plane, so its closed structure stays proven.
    assert!(CapsuleManifest::parse(&capsule_json(|_| {})).is_ok());

    let raw = capsule_json(|capsule| {
        let duplicate = capsule["assets"][0].clone();
        capsule["assets"].as_array_mut().unwrap().push(duplicate);
    });
    assert!(CapsuleManifest::parse(&raw).is_err());

    let raw = capsule_json(|capsule| {
        capsule["compatibility"]["migration_range"]["head"] = serde_json::json!("0009");
        capsule["consistency_group"]["stores"][0]["schema_version"] = serde_json::json!("0009");
    });
    assert!(CapsuleManifest::parse(&raw).is_err());
}

/// A structurally valid capsule document, with a hook for a single defect.
///
/// The bundled runtime carries no such document; this exists only because the
/// lifecycle plane still resolves its gateway entrypoint through this parser, and
/// a parser with no test is a parser with no contract.
fn capsule_json(mutate: impl FnOnce(&mut serde_json::Value)) -> String {
    let mut capsule = serde_json::json!({
        "contract_version": "2.0",
        "identity": {"name": "vaultspec-a2a", "version": "0.1.0"},
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
            {"kind": "python-runtime", "version": "3.13", "license": "PSF-2.0", "digest": "a".repeat(64)},
            {"kind": "a2a-distribution", "version": "0.1.0", "license": "MIT", "digest": "1".repeat(64)},
            {"kind": "node-runtime", "version": "22", "license": "MIT", "digest": "b".repeat(64)},
            {"kind": "acp-adapter", "version": "0.59.0", "license": "Apache-2.0", "digest": "d".repeat(64)}
        ],
        "dependency_lock": {"uv_lock_digest": "2".repeat(64), "package_lock_digest": "3".repeat(64)}
    });
    mutate(&mut capsule);
    serde_json::to_string(&capsule).unwrap()
}
