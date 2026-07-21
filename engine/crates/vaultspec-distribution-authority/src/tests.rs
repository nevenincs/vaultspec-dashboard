use super::publication::{
    CapsuleMetadata, CompatibilityRange, ComponentLock, FileReference, PublicationRequest,
    UnsealedPublication,
};
use super::*;
use aws_lc_rs::rand::SystemRandom;
use aws_lc_rs::signature::Ed25519KeyPair;
use static_assertions::assert_not_impl_any;
use std::collections::HashMap;
use std::num::NonZeroU64;
use tempfile::TempDir;
use tough::schema::{Role as _, RoleKeys, RoleType, Root, Signature, Signed};
use tough::sign::Sign as _;

assert_not_impl_any!(VerifiedDistributionRelease: Clone, serde::Serialize);
assert_not_impl_any!(MaterializationSource<'static>: Clone, serde::Serialize);

struct SigningMaterial {
    root_path: PathBuf,
    root_bytes: Vec<u8>,
    targets_key: PathBuf,
    snapshot_key: PathBuf,
    timestamp_key: PathBuf,
    root_one: Ed25519KeyPair,
    root_two: Ed25519KeyPair,
    targets: Ed25519KeyPair,
    snapshot: Ed25519KeyPair,
    timestamp: Ed25519KeyPair,
}

// Datastore-traversing behavior: reachable only where the datastore lane is
// provisioned. Windows asserts its real (refusing) behavior separately below.
#[cfg(unix)]
#[tokio::test(flavor = "current_thread")]
async fn real_tuf_repository_yields_possession_bound_selected_archive() {
    let temp = TempDir::new().expect("temporary test root");
    let material = signing_material(temp.path()).await;
    let bundle = publish_bundle(
        temp.path(),
        &material,
        1,
        "release-1",
        DistributionTarget::X86_64PcWindowsMsvc,
    )
    .await;
    let product = temp.path().join("product");
    std::fs::create_dir(&product).expect("product root");

    let request = VerificationRequest::for_product_root(
        &bundle,
        &product,
        DistributionTarget::X86_64PcWindowsMsvc,
    )
    .expect("bounded request");
    let mut verified = verify_with_root(&material.root_bytes, request)
        .await
        .expect("real TUF verification");
    verified
        .verify_for_product_root(&product)
        .expect("authority joins retained product root");
    assert!(matches!(
        verified.verify_for_product_root(temp.path()),
        Err(VerificationError::ProductRootMismatch)
    ));
    assert_eq!(verified.release_identity(), "release-1");
    assert_eq!(
        verified.selected_member().archive,
        "archive.x86_64-pc-windows-msvc"
    );
    let mut selected = Vec::new();
    verified
        .selected_archive()
        .await
        .expect("retained selected archive")
        .read_to_end(&mut selected)
        .expect("read retained archive");
    assert_eq!(
        selected,
        archive_bytes(DistributionTarget::X86_64PcWindowsMsvc)
    );

    let datastore_names = std::fs::read_dir(product.join("distribution-trust"))
        .expect("persistent datastore")
        .map(|entry| entry.expect("datastore entry").file_name())
        .collect::<Vec<_>>();
    assert_eq!(datastore_names.len(), 5);
    assert!(
        datastore_names
            .iter()
            .any(|name| name == "latest_known_time.json")
    );
}

// Datastore-traversing behavior: reachable only where the datastore lane is
// provisioned. Windows asserts its real (refusing) behavior separately below.
#[cfg(unix)]
#[tokio::test(flavor = "current_thread")]
async fn materialization_source_is_sealed_and_fact_consistent() {
    let temp = TempDir::new().expect("temporary test root");
    let material = signing_material(temp.path()).await;
    let bundle = publish_bundle(
        temp.path(),
        &material,
        1,
        "release-1",
        DistributionTarget::Aarch64AppleDarwin,
    )
    .await;
    let product = temp.path().join("product-materialize");
    std::fs::create_dir(&product).expect("product root");

    let request = VerificationRequest::for_product_root(
        &bundle,
        &product,
        DistributionTarget::Aarch64AppleDarwin,
    )
    .expect("bounded request");
    let mut verified = verify_with_root(&material.root_bytes, request)
        .await
        .expect("real TUF verification");

    let expected_archive = archive_bytes(DistributionTarget::Aarch64AppleDarwin);
    let expected_member = digest_hex(
        format!(
            "manifest-{}",
            DistributionTarget::Aarch64AppleDarwin.archive_name()
        )
        .as_bytes(),
    );

    {
        let mut source = verified
            .materialization_source()
            .await
            .expect("sealed materialization source");
        assert_eq!(source.target(), DistributionTarget::Aarch64AppleDarwin);
        assert_eq!(source.release_identity(), "release-1");
        assert_eq!(source.capsule_root(), "capsule");
        assert_eq!(source.archive_length(), expected_archive.len() as u64);
        assert_eq!(source.archive_sha256_hex(), digest_hex(&expected_archive));
        assert_eq!(source.member_manifest_sha256(), expected_member);
        assert_eq!(source.component_lock(), b"dashboard=0.1.4\na2a=0.1.0\n");
        assert!(!source.canonical_cohort().is_empty());
        let debug = format!("{source:?}");
        assert!(debug.contains("release-1") && !debug.contains("dashboard=0.1.4"));

        // Two sequential bounded passes both start rewound and read the exact
        // authenticated bytes.
        for _ in 0..2 {
            let mut bytes = Vec::new();
            source
                .archive()
                .expect("rewound reader")
                .read_to_end(&mut bytes)
                .expect("read retained archive");
            assert_eq!(bytes, expected_archive);
        }
    }

    // The release authority remains usable after the borrow ends.
    let mut again = Vec::new();
    verified
        .selected_archive()
        .await
        .expect("retained selected archive")
        .read_to_end(&mut again)
        .expect("read retained archive again");
    assert_eq!(again, expected_archive);
}

// Datastore-traversing behavior: reachable only where the datastore lane is
// provisioned. Windows asserts its real (refusing) behavior separately below.
#[cfg(unix)]
#[tokio::test(flavor = "current_thread")]
async fn persistent_datastore_rejects_metadata_rollback() {
    let temp = TempDir::new().expect("temporary test root");
    let material = signing_material(temp.path()).await;
    let newer = publish_bundle(
        temp.path(),
        &material,
        2,
        "release-2",
        DistributionTarget::X86_64UnknownLinuxGnu,
    )
    .await;
    let older = publish_bundle(
        temp.path(),
        &material,
        1,
        "release-1",
        DistributionTarget::X86_64UnknownLinuxGnu,
    )
    .await;
    let product = temp.path().join("product-rollback");
    std::fs::create_dir(&product).expect("product root");

    let request = VerificationRequest::for_product_root(
        newer,
        &product,
        DistributionTarget::X86_64UnknownLinuxGnu,
    )
    .expect("new request");
    drop(
        verify_with_root(&material.root_bytes, request)
            .await
            .expect("new release verifies"),
    );
    let request = VerificationRequest::for_product_root(
        older,
        &product,
        DistributionTarget::X86_64UnknownLinuxGnu,
    )
    .expect("old request");
    assert!(matches!(
        verify_with_root(&material.root_bytes, request).await,
        Err(VerificationError::Tuf(_))
    ));
}

#[tokio::test(flavor = "current_thread")]
async fn staged_bundle_refuses_extra_platform_payload() {
    let temp = TempDir::new().expect("temporary test root");
    let material = signing_material(temp.path()).await;
    let bundle = publish_bundle(
        temp.path(),
        &material,
        1,
        "release-extra",
        DistributionTarget::X86_64PcWindowsMsvc,
    )
    .await;
    std::fs::write(bundle.join("targets").join("unexpected.archive"), b"extra")
        .expect("extra target");
    let product = temp.path().join("product-extra");
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
async fn publication_refuses_member_digest_substitution() {
    let temp = TempDir::new().expect("temporary test root");
    let material = signing_material(temp.path()).await;
    let source = temp.path().join("bad-source");
    std::fs::create_dir(&source).expect("source directory");
    let mut cohort = cohort_for(&source, "release-bad");
    cohort.members[0].archive_sha256 = "0".repeat(64);
    let result = publish_repository(publication_request(
        temp.path().join("bad-output"),
        &material,
        source,
        cohort,
        1,
    ))
    .await;
    assert!(matches!(result, Err(PublicationError::InvalidRelease)));
}

#[tokio::test(flavor = "current_thread")]
async fn publication_refuses_archive_substituted_after_cohort_assembly() {
    let temp = TempDir::new().expect("temporary test root");
    let material = signing_material(temp.path()).await;
    let source = temp.path().join("substituted-source");
    std::fs::create_dir(&source).expect("source directory");
    let cohort = cohort_for(&source, "substituted-release");
    std::fs::write(
        source.join(DistributionTarget::Aarch64AppleDarwin.archive_name()),
        b"substituted after cohort assembly",
    )
    .expect("substitute source archive");
    let result = publish_repository(publication_request(
        temp.path().join("substituted-output"),
        &material,
        source.clone(),
        cohort,
        1,
    ))
    .await;
    assert!(matches!(result, Err(PublicationError::InvalidRelease)));
    assert!(!source.join(COHORT_TARGET_NAME).exists());
}

// Datastore-traversing behavior: reachable only where the datastore lane is
// provisioned. Windows asserts its real (refusing) behavior separately below.
#[cfg(unix)]
#[tokio::test(flavor = "current_thread")]
async fn persisted_root_rotates_sequentially_and_revoked_root_keys_are_refused() {
    let temp = TempDir::new().expect("temporary test root");
    let material = signing_material(temp.path()).await;
    let initial = publish_bundle(
        temp.path(),
        &material,
        1,
        "root-one-release",
        DistributionTarget::X86_64UnknownLinuxGnu,
    )
    .await;
    let product = temp.path().join("product-root-rotation");
    std::fs::create_dir(&product).expect("product root");
    let initial_request = VerificationRequest::for_product_root(
        initial,
        &product,
        DistributionTarget::X86_64UnknownLinuxGnu,
    )
    .expect("initial request");
    drop(
        verify_with_root(&material.root_bytes, initial_request)
            .await
            .expect("initial root verifies"),
    );

    let (new_root_one, _) = keypair();
    let (new_root_two, _) = keypair();
    let rotated_root = signed_root(
        2,
        &[&new_root_one, &new_root_two],
        &[
            &material.root_one,
            &material.root_two,
            &new_root_one,
            &new_root_two,
        ],
        &material,
    );
    let rotated_root_path = temp.path().join("2.root.json");
    std::fs::write(&rotated_root_path, rotated_root).expect("rotated root");
    let rotated = publish_bundle_with_root(
        temp.path(),
        &material,
        &[material.root_path.clone(), rotated_root_path.clone()],
        2,
        "root-two-release",
        DistributionTarget::X86_64UnknownLinuxGnu,
    )
    .await;
    let rotated_request = VerificationRequest::for_product_root(
        rotated,
        &product,
        DistributionTarget::X86_64UnknownLinuxGnu,
    )
    .expect("rotation request");
    drop(
        verify_with_root(&material.root_bytes, rotated_request)
            .await
            .expect("sequential root rotation verifies"),
    );
    let persisted_root = std::fs::read(product.join("distribution-trust/root.json"))
        .expect("persisted rotated root");
    let persisted_root: Signed<Root> =
        serde_json::from_slice(&persisted_root).expect("parse persisted rotated root");
    assert_eq!(persisted_root.signed.version.get(), 2);

    let root_three = signed_root(
        3,
        &[&new_root_one, &new_root_two],
        &[&new_root_one, &new_root_two],
        &material,
    );
    let root_three_path = temp.path().join("3.root.json");
    std::fs::write(&root_three_path, root_three).expect("third root");
    let later = publish_bundle_with_root(
        temp.path(),
        &material,
        &[
            material.root_path.clone(),
            rotated_root_path.clone(),
            root_three_path.clone(),
        ],
        3,
        "root-three-release",
        DistributionTarget::X86_64UnknownLinuxGnu,
    )
    .await;
    let lagging_product = temp.path().join("lagging-product-root");
    std::fs::create_dir(&lagging_product).expect("lagging product root");
    let lagging_request = VerificationRequest::for_product_root(
        later,
        &lagging_product,
        DistributionTarget::X86_64UnknownLinuxGnu,
    )
    .expect("lagging v1 request");
    drop(
        verify_with_root(&material.root_bytes, lagging_request)
            .await
            .expect("embedded v1 follows bundled v2 and v3 roots"),
    );
    let lagging_root = std::fs::read(lagging_product.join("distribution-trust/root.json"))
        .expect("lagging client persisted latest root");
    let lagging_root: Signed<Root> =
        serde_json::from_slice(&lagging_root).expect("parse lagging persisted root");
    assert_eq!(lagging_root.signed.version.get(), 3);

    let revoked_root = signed_root(
        4,
        &[&material.root_one, &material.root_two],
        &[&material.root_one, &material.root_two],
        &material,
    );
    let revoked_root_path = temp.path().join("4.root.json");
    std::fs::write(&revoked_root_path, revoked_root).expect("revoked-key root");
    let source = temp.path().join("revoked-root-source");
    std::fs::create_dir(&source).expect("revoked root source");
    let cohort = cohort_for(&source, "revoked-root-release");
    let mut request = publication_request(
        temp.path().join("revoked-root-output"),
        &material,
        source,
        cohort,
        4,
    );
    request.root_history = vec![
        material.root_path.clone(),
        rotated_root_path,
        root_three_path,
        revoked_root_path,
    ];
    assert!(matches!(
        publish_repository(request).await,
        Err(PublicationError::InvalidRelease)
    ));
}

// Datastore-traversing behavior: reachable only where the datastore lane is
// provisioned. Windows asserts its real (refusing) behavior separately below.
#[cfg(unix)]
#[tokio::test(flavor = "current_thread")]
async fn partial_live_datastore_fails_closed_and_partial_next_is_recovered() {
    let temp = TempDir::new().expect("temporary test root");
    let material = signing_material(temp.path()).await;
    let bundle = publish_bundle(
        temp.path(),
        &material,
        1,
        "partial-datastore",
        DistributionTarget::X86_64PcWindowsMsvc,
    )
    .await;

    let partial_product = temp.path().join("partial-product");
    let partial_live = partial_product.join(LIVE_DATASTORE);
    std::fs::create_dir_all(&partial_live).expect("partial live datastore");
    std::fs::write(partial_live.join("root.json"), &material.root_bytes).expect("partial root");
    let partial_request = VerificationRequest::for_product_root(
        &bundle,
        &partial_product,
        DistributionTarget::X86_64PcWindowsMsvc,
    )
    .expect("partial request");
    assert!(matches!(
        verify_with_root(&material.root_bytes, partial_request).await,
        Err(VerificationError::InvalidDatastoreState)
    ));

    let recover_product = temp.path().join("recover-product");
    let partial_next = recover_product.join(NEXT_DATASTORE);
    std::fs::create_dir_all(&partial_next).expect("partial next datastore");
    std::fs::write(partial_next.join("root.json"), &material.root_bytes)
        .expect("partial next root");
    let recover_request = VerificationRequest::for_product_root(
        bundle,
        &recover_product,
        DistributionTarget::X86_64PcWindowsMsvc,
    )
    .expect("recovery request");
    drop(
        verify_with_root(&material.root_bytes, recover_request)
            .await
            .expect("partial next residue is recovered"),
    );
    assert!(!partial_next.exists());
    assert!(recover_product.join(LIVE_DATASTORE).is_dir());
}

#[tokio::test(flavor = "current_thread")]
async fn malformed_complete_datastore_fails_closed() {
    let temp = TempDir::new().expect("temporary test root");
    let material = signing_material(temp.path()).await;
    let bundle = publish_bundle(
        temp.path(),
        &material,
        1,
        "malformed-datastore",
        DistributionTarget::X86_64PcWindowsMsvc,
    )
    .await;
    let product = temp.path().join("malformed-product");
    let live = product.join(LIVE_DATASTORE);
    std::fs::create_dir_all(&live).expect("malformed datastore");
    for (name, _) in DATASTORE_FILES {
        std::fs::write(live.join(name), b"not-json").expect("malformed datastore member");
    }
    let request = VerificationRequest::for_product_root(
        bundle,
        &product,
        DistributionTarget::X86_64PcWindowsMsvc,
    )
    .expect("malformed request");
    assert!(matches!(
        verify_with_root(&material.root_bytes, request).await,
        Err(VerificationError::InvalidDatastoreState)
    ));
}

// Datastore-traversing behavior: reachable only where the datastore lane is
// provisioned. Windows asserts its real (refusing) behavior separately below.
#[cfg(unix)]
#[tokio::test(flavor = "current_thread")]
async fn retained_authority_excludes_a_concurrent_verification() {
    let temp = TempDir::new().expect("temporary test root");
    let material = signing_material(temp.path()).await;
    let bundle = publish_bundle(
        temp.path(),
        &material,
        1,
        "concurrent-exclusion",
        DistributionTarget::X86_64PcWindowsMsvc,
    )
    .await;
    let product = temp.path().join("concurrent-product");
    std::fs::create_dir(&product).expect("product root");
    let first_request = VerificationRequest::for_product_root(
        &bundle,
        &product,
        DistributionTarget::X86_64PcWindowsMsvc,
    )
    .expect("first request");
    let first = verify_with_root(&material.root_bytes, first_request)
        .await
        .expect("first authority");
    let second_request = VerificationRequest::for_product_root(
        bundle,
        &product,
        DistributionTarget::X86_64PcWindowsMsvc,
    )
    .expect("second request");
    assert!(matches!(
        verify_with_root(&material.root_bytes, second_request).await,
        Err(VerificationError::VerificationInProgress)
    ));
    drop(first);
}

#[cfg(unix)]
#[test]
fn operating_system_lock_excludes_a_real_child_process() {
    const CHILD_ROOT: &str = "VAULTSPEC_S174_LOCK_CHILD_ROOT";
    const CHILD_READY: &str = "VAULTSPEC_S174_LOCK_CHILD_READY";
    const CHILD_RELEASE: &str = "VAULTSPEC_S174_LOCK_CHILD_RELEASE";

    if let Some(product) = std::env::var_os(CHILD_ROOT) {
        let ready = PathBuf::from(std::env::var_os(CHILD_READY).expect("child ready path"));
        let release = PathBuf::from(std::env::var_os(CHILD_RELEASE).expect("child release path"));
        let scope = ProductRootScope::retain(Path::new(&product)).expect("child retained root");
        let lock = acquire_cap_verification_lock(&scope).expect("child acquired OS lock");
        std::fs::write(&ready, b"ready").expect("publish child readiness");
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
        while !release.is_file() {
            assert!(
                std::time::Instant::now() < deadline,
                "parent did not release child lock proof"
            );
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        drop(lock);
        return;
    }

    let temp = TempDir::new().expect("temporary lock proof root");
    let product = temp.path().join("product");
    let ready = temp.path().join("child.ready");
    let release = temp.path().join("child.release");
    std::fs::create_dir(&product).expect("product root");
    let executable = std::env::current_exe().expect("current test executable");
    let mut child = std::process::Command::new(executable)
        .arg("--exact")
        .arg("tests::operating_system_lock_excludes_a_real_child_process")
        .arg("--nocapture")
        .env(CHILD_ROOT, &product)
        .env(CHILD_READY, &ready)
        .env(CHILD_RELEASE, &release)
        .stdin(std::process::Stdio::null())
        .spawn()
        .expect("spawn real child lock holder");
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
    while !ready.is_file() {
        assert!(
            std::time::Instant::now() < deadline,
            "child did not acquire lock"
        );
        assert!(
            child.try_wait().expect("poll child").is_none(),
            "child exited early"
        );
        std::thread::sleep(std::time::Duration::from_millis(10));
    }

    let scope = ProductRootScope::retain(&product).expect("parent retained root");
    match acquire_cap_verification_lock(&scope) {
        Err(VerificationError::VerificationInProgress) => {}
        Err(error) => panic!("unexpected lock-contention classification: {error:?}"),
        Ok(lock) => {
            drop(lock);
            panic!("parent acquired the verification lock while the child held it");
        }
    }
    std::fs::write(&release, b"release").expect("release child");
    assert!(child.wait().expect("wait child").success());
    let reacquired = acquire_cap_verification_lock(&scope).expect("reacquire released OS lock");
    drop(reacquired);
}

#[cfg(windows)]
#[test]
fn operating_system_lock_excludes_a_real_child_process() {
    const LOCK_PATH: &str = "VAULTSPEC_S174_LOCK_PATH";
    const CHILD_READY: &str = "VAULTSPEC_S174_LOCK_READY";
    const CHILD_RELEASE: &str = "VAULTSPEC_S174_LOCK_RELEASE";
    const SCRIPT: &str = r#"
$stream = [System.IO.File]::Open(
    $env:VAULTSPEC_S174_LOCK_PATH,
    [System.IO.FileMode]::OpenOrCreate,
    [System.IO.FileAccess]::ReadWrite,
    [System.IO.FileShare]::ReadWrite
)
$stream.Lock(0, [long]::MaxValue)
[System.IO.File]::WriteAllText($env:VAULTSPEC_S174_LOCK_READY, 'ready')
$deadline = [DateTime]::UtcNow.AddSeconds(10)
while (-not [System.IO.File]::Exists($env:VAULTSPEC_S174_LOCK_RELEASE)) {
    if ([DateTime]::UtcNow -ge $deadline) { exit 7 }
    Start-Sleep -Milliseconds 10
}
$stream.Unlock(0, [long]::MaxValue)
$stream.Dispose()
"#;

    let temp = TempDir::new().expect("temporary lock proof root");
    let product = temp.path().join("product");
    let lock_path = product.join(VERIFICATION_LOCK);
    let ready = temp.path().join("child.ready");
    let release = temp.path().join("child.release");
    std::fs::create_dir(&product).expect("product root");
    let mut child = std::process::Command::new("powershell.exe")
        .arg("-NoLogo")
        .arg("-NoProfile")
        .arg("-NonInteractive")
        .arg("-Command")
        .arg(SCRIPT)
        .env(LOCK_PATH, &lock_path)
        .env(CHILD_READY, &ready)
        .env(CHILD_RELEASE, &release)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .expect("spawn real PowerShell lock holder");
    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(10);
    while !ready.is_file() {
        assert!(
            std::time::Instant::now() < deadline,
            "child did not acquire lock"
        );
        assert!(
            child.try_wait().expect("poll child").is_none(),
            "child exited early"
        );
        std::thread::sleep(std::time::Duration::from_millis(10));
    }

    let scope = ProductRootScope::retain(&product).expect("parent retained root");
    match acquire_cap_verification_lock(&scope) {
        Err(VerificationError::VerificationInProgress) => {}
        Err(error) => panic!("unexpected lock-contention classification: {error:?}"),
        Ok(lock) => {
            drop(lock);
            panic!("parent acquired the verification lock while the child held it");
        }
    }
    std::fs::write(&release, b"release").expect("release child");
    assert!(child.wait().expect("wait child").success());
    let reacquired = acquire_cap_verification_lock(&scope).expect("reacquire released OS lock");
    drop(reacquired);
}

// Datastore-traversing behavior: reachable only where the datastore lane is
// provisioned. Windows asserts its real (refusing) behavior separately below.
#[cfg(unix)]
#[tokio::test(flavor = "current_thread")]
async fn latest_known_time_regression_is_refused() {
    let temp = TempDir::new().expect("temporary test root");
    let material = signing_material(temp.path()).await;
    let bundle = publish_bundle(
        temp.path(),
        &material,
        1,
        "time-regression",
        DistributionTarget::X86_64PcWindowsMsvc,
    )
    .await;
    let product = temp.path().join("time-product");
    std::fs::create_dir(&product).expect("product root");
    let first_request = VerificationRequest::for_product_root(
        &bundle,
        &product,
        DistributionTarget::X86_64PcWindowsMsvc,
    )
    .expect("first request");
    drop(
        verify_with_root(&material.root_bytes, first_request)
            .await
            .expect("initial verification"),
    );
    let future: jiff::Timestamp = "2099-01-01T00:00:00Z".parse().expect("future timestamp");
    std::fs::write(
        product.join("distribution-trust/latest_known_time.json"),
        serde_json::to_vec(&future).expect("serialize future timestamp"),
    )
    .expect("persist future latest-known time");
    let second_request = VerificationRequest::for_product_root(
        bundle,
        &product,
        DistributionTarget::X86_64PcWindowsMsvc,
    )
    .expect("second request");
    assert!(matches!(
        verify_with_root(&material.root_bytes, second_request).await,
        Err(VerificationError::Tuf(_))
    ));
}

// Datastore-traversing behavior: reachable only where the datastore lane is
// provisioned. Windows asserts its real (refusing) behavior separately below.
#[cfg(unix)]
#[tokio::test(flavor = "current_thread")]
async fn retained_archive_revalidation_detects_same_handle_mutation() {
    let temp = TempDir::new().expect("temporary test root");
    let material = signing_material(temp.path()).await;
    let bundle = publish_bundle(
        temp.path(),
        &material,
        1,
        "archive-revalidation",
        DistributionTarget::X86_64PcWindowsMsvc,
    )
    .await;
    let product = temp.path().join("archive-product");
    std::fs::create_dir(&product).expect("product root");
    let request = VerificationRequest::for_product_root(
        bundle,
        &product,
        DistributionTarget::X86_64PcWindowsMsvc,
    )
    .expect("request");
    let mut verified = verify_with_root(&material.root_bytes, request)
        .await
        .expect("verified release");
    verified
        .selected_archive
        .file
        .set_len(0)
        .expect("mutate retained archive");
    assert!(matches!(
        verified.selected_archive().await,
        Err(VerificationError::StagingUnavailable)
    ));
}

#[cfg(unix)]
#[tokio::test(flavor = "current_thread")]
async fn product_root_name_substitution_is_refused_before_verification() {
    let temp = TempDir::new().expect("temporary test root");
    let material = signing_material(temp.path()).await;
    let bundle = publish_bundle(
        temp.path(),
        &material,
        1,
        "root-substitution",
        DistributionTarget::X86_64UnknownLinuxGnu,
    )
    .await;
    let product = temp.path().join("product-root");
    let displaced = temp.path().join("displaced-product-root");
    std::fs::create_dir(&product).expect("product root");
    let request = VerificationRequest::for_product_root(
        bundle,
        &product,
        DistributionTarget::X86_64UnknownLinuxGnu,
    )
    .expect("retained product root");
    std::fs::rename(&product, displaced).expect("displace retained product root");
    std::fs::create_dir(&product).expect("substitute product root");
    assert!(matches!(
        verify_with_root(&material.root_bytes, request).await,
        Err(VerificationError::ProductRootMismatch)
    ));
}

#[tokio::test(flavor = "current_thread")]
async fn publication_refuses_nonportable_cohort_paths() {
    let temp = TempDir::new().expect("temporary test root");
    let material = signing_material(temp.path()).await;
    let source = temp.path().join("portable-source");
    std::fs::create_dir(&source).expect("source directory");
    let mut cohort = cohort_for(&source, "nonportable-release");
    cohort.capsule.root = "CON".to_owned();
    let result = publish_repository(publication_request(
        temp.path().join("portable-output"),
        &material,
        source,
        cohort,
        1,
    ))
    .await;
    assert!(matches!(result, Err(PublicationError::InvalidRelease)));
}

/// Real-NTFS acceptance for the retired Windows publication-staging refusal
/// (windows-private-file-authority D6/D7): the PRODUCTION entrypoint now runs on
/// Windows, and both directories it publishes carry the exact protected
/// three-principal DACL — the property `0700` gives the Unix arm.
#[cfg(windows)]
#[tokio::test(flavor = "current_thread")]
async fn windows_publication_publishes_through_protected_owner_private_directories() {
    let temp = TempDir::new().expect("temporary test root");
    let material = signing_material(temp.path()).await;
    let source = temp.path().join("windows-private-source");
    std::fs::create_dir(&source).expect("source directory");
    let cohort = cohort_for(&source, "windows-private-release");
    let output = temp.path().join("windows-private-output");
    let published = super::publication::write_release_repository(publication_request(
        output.clone(),
        &material,
        source,
        cohort,
        1,
    ))
    .await
    .expect("production publication succeeds on Windows");
    assert_eq!(published.root_version.get(), 1);

    assert_protected_owner_private(&output.join("metadata"));
    assert_protected_owner_private(&output.join("targets"));
}

/// Real-NTFS acceptance for the interior staging sites: a child created under a
/// parent carrying an extra INHERITABLE principal really does inherit it, and
/// hardening replaces that inherited list with the exact protected
/// three-principal list (windows-private-file-authority D7).
#[cfg(windows)]
#[test]
fn windows_owner_private_hardening_replaces_inherited_entries() {
    use vaultspec_windows_authority::{HardeningDirectory, ReadOnlyAuthorityDirectory};

    let temp = TempDir::new().expect("temporary hardening root");
    let parent = temp.path().join("parent");
    let child = temp.path().join("parent").join("child");
    std::fs::create_dir(&parent).expect("parent directory");
    grant_inheritable_everyone(&parent);
    std::fs::create_dir(&child).expect("child directory");

    let inherited = ReadOnlyAuthorityDirectory::open_observation(&child)
        .expect("observe child")
        .dacl_snapshot()
        .expect("child DACL snapshot");
    assert!(
        inherited
            .entries()
            .iter()
            .any(|entry| entry.sid() == EVERYONE_SID && entry.inherited()),
        "child did not inherit the extra principal, so the proof would be vacuous"
    );

    super::private_directory::ensure_owner_private_directory(&child)
        .expect("harden the inherited child");
    assert_protected_owner_private(&child);

    // The hardening authority is exactly the retained handle the mutation used;
    // reopening proves the protected state survived close and reopen.
    HardeningDirectory::open_existing(&child)
        .expect("reopen hardened child")
        .revalidate()
        .expect("hardened child identity is unchanged");
}

#[cfg(windows)]
const EVERYONE_SID: &str = "S-1-1-0";

/// Prove one directory carries the exact protected three-principal DACL from one
/// snapshot, through the read-only observation authority.
#[cfg(windows)]
fn assert_protected_owner_private(path: &Path) {
    use vaultspec_windows_authority::{ReadOnlyAuthorityDirectory, private_policy};

    let current = match super::private_directory::current_user_sid() {
        Ok(sid) => sid,
        Err(error) => panic!("current user SID is unavailable: {error:?}"),
    };
    let snapshot = ReadOnlyAuthorityDirectory::open_observation(path)
        .unwrap_or_else(|error| panic!("observe {}: {error}", path.display()))
        .dacl_snapshot()
        .unwrap_or_else(|error| panic!("snapshot {}: {error}", path.display()));
    assert!(snapshot.protected(), "{} is not protected", path.display());
    private_policy::validate_private_directory(&snapshot, &current)
        .unwrap_or_else(|violation| panic!("{}: {violation}", path.display()));
}

/// Grant an extra INHERITABLE principal so a later-created child genuinely
/// inherits an entry the private policy forbids.
#[cfg(windows)]
fn grant_inheritable_everyone(path: &Path) {
    use std::os::windows::io::AsRawHandle as _;

    use vaultspec_windows_authority::HardeningDirectory;
    use windows_acl::acl::{ACL, AceType};

    let hardening = HardeningDirectory::open_existing(path).expect("open parent for hardening");
    let mut acl = ACL::from_file_handle(
        hardening.directory().as_raw_handle() as *mut winapi::ctypes::c_void,
        false,
    )
    .expect("read parent DACL");
    let sid = windows_acl::helper::string_to_sid(EVERYONE_SID).expect("Everyone SID");
    acl.add_entry(
        sid.as_ptr().cast_mut().cast(),
        AceType::AccessAllow,
        vaultspec_windows_authority::private_policy::DIRECTORY_EXPLICIT_FLAGS,
        vaultspec_windows_authority::private_policy::FILE_ALL_ACCESS,
    )
    .expect("grant inheritable entry");
}

async fn signing_material(root: &Path) -> SigningMaterial {
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

fn signed_root(
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

fn keypair() -> (Ed25519KeyPair, Vec<u8>) {
    let document = Ed25519KeyPair::generate_pkcs8(&SystemRandom::new()).expect("generate key");
    let bytes = document.as_ref().to_vec();
    let pair = Ed25519KeyPair::from_pkcs8(&bytes).expect("parse generated key");
    (pair, bytes)
}

async fn publish_repository(
    request: PublicationRequest,
) -> Result<UnsealedPublication, PublicationError> {
    super::publication::write_release_repository(request).await
}

async fn publish_bundle(
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

async fn publish_bundle_with_root(
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
    let publication = publish_repository(request)
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

fn publication_request(
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

fn cohort_for(source: &Path, identity: &str) -> ReleaseCohort {
    let members = TARGETS
        .iter()
        .map(|(name, target)| {
            let bytes = archive_bytes(*target);
            std::fs::write(source.join(name), &bytes).expect("archive source");
            ReleaseMember {
                target: *target,
                archive: (*name).to_owned(),
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

fn archive_bytes(target: DistributionTarget) -> Vec<u8> {
    format!("real archive bytes for {}\n", target.as_str()).into_bytes()
}

fn copy_directory(source: &Path, destination: &Path, include: impl Fn(&str) -> bool) {
    for entry in std::fs::read_dir(source).expect("source listing") {
        let entry = entry.expect("source entry");
        let name = entry.file_name();
        let name = name.to_str().expect("UTF-8 test filename");
        if include(name) {
            std::fs::copy(entry.path(), destination.join(name)).expect("copy repository file");
        }
    }
}

/// The Windows counterpart of the Unix-scoped datastore matrix above.
///
/// Windows directory-metadata durability is not provisioned, so the datastore
/// lane refuses. That refusal is the REAL behavior and is asserted positively
/// here rather than left as absent coverage: the verification reaches the
/// datastore sequence over a genuine TUF repository and fails closed with the
/// exact typed error, mutating no trust state. When the tracked durability
/// follow-on (plan step W01.P01.S177) lands, the Unix-scoped matrix above
/// becomes cross-platform and this test retires with the refusal it pins.
#[cfg(windows)]
#[tokio::test(flavor = "current_thread")]
async fn windows_datastore_lane_refuses_until_durability_is_provisioned() {
    let temp = TempDir::new().expect("temporary test root");
    let material = signing_material(temp.path()).await;
    let bundle = publish_bundle(
        temp.path(),
        &material,
        1,
        "windows-datastore-refusal",
        DistributionTarget::X86_64PcWindowsMsvc,
    )
    .await;
    let product = temp.path().join("product");
    std::fs::create_dir(&product).expect("product root");

    let request = VerificationRequest::for_product_root(
        &bundle,
        &product,
        DistributionTarget::X86_64PcWindowsMsvc,
    )
    .expect("bounded request");
    assert!(
        matches!(
            verify_with_root(&material.root_bytes, request).await,
            Err(VerificationError::WindowsDatastoreAuthorityNotProvisioned)
        ),
        "the Windows datastore lane must fail closed on the durability refusal"
    );

    // The refusal leaves no live trust datastore behind: nothing was committed.
    assert!(
        !product.join(LIVE_DATASTORE).join("root.json").exists(),
        "a refused verification must not leave committed trust state"
    );
}

/// The cap-std bridge proof (windows-private-file-authority, parent-relative
/// addendum): a child opens with `WRITE_DAC` and hardens through a `cap-std`
/// parent handle that carries no such right.
///
/// Non-vacuous by construction. The parent's rights-poverty is ASSERTED first —
/// `ACL::from_file_handle` needs `READ_CONTROL` and fails on the capability
/// handle — so the child's success below cannot be explained by the capability
/// handle having carried the rights all along. This is the fact the whole bridge
/// rests on, proven on real NTFS rather than inferred from cap-std's source.
#[cfg(windows)]
#[test]
fn capability_parent_hardens_a_child_it_could_not_harden_itself() {
    use std::os::windows::io::AsRawHandle as _;

    let temp = TempDir::new().expect("temporary capability root");
    let root_path = temp.path().join("product");
    std::fs::create_dir(&root_path).expect("product root");
    let capability =
        Dir::open_ambient_dir(&root_path, cap_std::ambient_authority()).expect("capability root");

    // Pin the parent's exact rights-poverty. cap-std opens with GENERIC_READ,
    // whose STANDARD_RIGHTS_READ component IS READ_CONTROL, so the handle CAN
    // read its own DACL — but it carries no WRITE_DAC, so it cannot write one.
    // Proven by doing it: the read succeeds, the write is denied.
    let borrowed = capability
        .try_clone()
        .expect("clone capability")
        .into_std_file();
    let mut parent_acl = windows_acl::acl::ACL::from_file_handle(
        borrowed.as_raw_handle() as *mut winapi::ctypes::c_void,
        false,
    )
    .expect("cap-std handle carries READ_CONTROL, so reading its DACL succeeds");
    let system = windows_acl::helper::string_to_sid(
        vaultspec_windows_authority::private_policy::LOCAL_SYSTEM_SID,
    )
    .expect("LocalSystem SID");
    assert!(
        parent_acl
            .add_entry(
                system.as_ptr().cast_mut().cast(),
                windows_acl::acl::AceType::AccessAllow,
                vaultspec_windows_authority::private_policy::DIRECTORY_EXPLICIT_FLAGS,
                vaultspec_windows_authority::private_policy::FILE_ALL_ACCESS,
            )
            .is_err(),
        "the cap-std parent must lack WRITE_DAC, or this proof is vacuous"
    );

    // A pre-existing, unprotected child - the state the credentials lane had to
    // fix at runtime - must be hardened idempotently, not merely adopted.
    capability
        .create_dir(LIVE_DATASTORE)
        .expect("create datastore child");
    assert!(
        super::private_directory::prove_owner_private_child_directory(&capability, LIVE_DATASTORE)
            .is_err(),
        "a freshly created child must not already satisfy the private policy"
    );

    super::private_directory::ensure_owner_private_child_directory(&capability, LIVE_DATASTORE)
        .expect("harden the child through the rights-poor capability parent");
    super::private_directory::prove_owner_private_child_directory(&capability, LIVE_DATASTORE)
        .expect("the hardened child must prove owner-private");

    // Re-establishment is idempotent, and the read-only prove variant still holds.
    super::private_directory::ensure_owner_private_child_directory(&capability, LIVE_DATASTORE)
        .expect("re-hardening an already-protected child must succeed");
    super::private_directory::prove_owner_private_child_directory(&capability, LIVE_DATASTORE)
        .expect("protection survives idempotent re-hardening");

    // The bridge grants no traversal and no parent escape.
    for rejected in ["..", ".", r"nested\child", "absent"] {
        assert!(
            super::private_directory::ensure_owner_private_child_directory(&capability, rejected)
                .is_err(),
            "the relative bridge must refuse {rejected:?}"
        );
    }
}
