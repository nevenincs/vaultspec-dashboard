//! A2A runtime-identity acceptance for the SEATED reconcile
//! (a2a-product-provisioning W02.P04.S34).
//!
//! These proofs drive the production seated-boot reconcile
//! (`LifecyclePlane::reconcile_seated_boot`) and the owned-tree termination
//! contract against real artifacts. They prove that retired JSON receipts cannot
//! authorize live, foreign, or stale discovery handling; that Windows credential
//! bootstrap remains behind its typed authority gate; and, where a built capsule
//! is available, that the capsule's own bundled interpreter launches a real owned
//! process. No fakes, mocks, or stubs are used.
//!
//! The capsule-dependent proofs (a real owned process, the real entrypoint
//! resolution) gate on `VAULTSPEC_PRODUCT_CAPSULE` (or the conventional
//! `dist/capsules/<target>.zip`) and print a clear reason and return when no
//! capsule is present — they never silently pass on faked data. The socket / file
//! / pid proofs need no capsule and run everywhere.

use std::io::Read as _;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

#[cfg(windows)]
use vaultspec_product::credentials::DashboardCredentialStore;
#[cfg(windows)]
use vaultspec_product::locking::{Actor, InstallLock};
use vaultspec_product::manifest::{CapsuleManifest, ComponentLock, Target};
use vaultspec_product::paths::ProductPaths;
use vaultspec_product::process::{GatewaySpec, ResolvedProgram, spawn_gateway};
use vaultspec_product::receipt::{Channel, Receipt};

use crate::routes::a2a_lifecycle::LifecyclePlane;

const LOCK_JSON: &str = include_str!("../../../../../packaging/a2a-component.lock.json");

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// The Rust target triple this test binary was built for, and its manifest
/// `Target`. Only the current platform's capsule can be exercised here.
fn current_target() -> (&'static str, Target) {
    #[cfg(all(target_arch = "x86_64", target_os = "windows"))]
    {
        ("x86_64-pc-windows-msvc", Target::X86_64PcWindowsMsvc)
    }
    #[cfg(all(target_arch = "x86_64", target_os = "linux"))]
    {
        ("x86_64-unknown-linux-gnu", Target::X86_64UnknownLinuxGnu)
    }
    #[cfg(all(target_arch = "aarch64", target_os = "linux"))]
    {
        ("aarch64-unknown-linux-gnu", Target::Aarch64UnknownLinuxGnu)
    }
    #[cfg(all(target_arch = "aarch64", target_os = "macos"))]
    {
        ("aarch64-apple-darwin", Target::Aarch64AppleDarwin)
    }
    #[cfg(all(target_arch = "x86_64", target_os = "macos"))]
    {
        ("x86_64-apple-darwin", Target::X86_64AppleDarwin)
    }
}

/// Locate a real capsule ZIP: the `VAULTSPEC_PRODUCT_CAPSULE` override, else the
/// conventional `dist/capsules/<target>.zip` relative to the workspace.
fn locate_capsule() -> Option<PathBuf> {
    if let Some(p) = std::env::var_os("VAULTSPEC_PRODUCT_CAPSULE") {
        let pb = PathBuf::from(p);
        if pb.is_file() {
            return Some(pb);
        }
    }
    let (triple, _) = current_target();
    let conventional = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../../dist/capsules")
        .join(format!("{triple}.zip"));
    conventional.is_file().then_some(conventional)
}

fn skip_reason(what: &str) {
    let (triple, _) = current_target();
    eprintln!(
        "S34 {what}: no capsule available (set VAULTSPEC_PRODUCT_CAPSULE or place \
         dist/capsules/{triple}.zip); skipping the real-capsule proof."
    );
}

fn read_zip_entry(zip_path: &Path, name: &str) -> Vec<u8> {
    let file = std::fs::File::open(zip_path).expect("open capsule zip");
    let mut archive = zip::ZipArchive::new(file).expect("read capsule zip");
    let mut entry = archive
        .by_name(name)
        .unwrap_or_else(|_| panic!("capsule entry {name}"));
    let mut buf = Vec::new();
    entry.read_to_end(&mut buf).expect("read capsule entry");
    buf
}

/// The capsule-relative path segments of the bundled interpreter, per platform.
fn python_segments() -> &'static [&'static str] {
    if cfg!(windows) {
        &["python", "python.exe"]
    } else {
        &["python", "bin", "python3"]
    }
}

/// Extract the capsule's bundled CPython runtime into `dest`, returning the path
/// to its real interpreter.
fn extract_bundled_python(zip_path: &Path, dest: &Path) -> PathBuf {
    let gz_bytes = read_zip_entry(zip_path, "assets/python-runtime");
    let decoder = flate2::read::GzDecoder::new(&gz_bytes[..]);
    let mut archive = tar::Archive::new(decoder);
    archive.unpack(dest).expect("unpack bundled python runtime");
    let mut p = dest.to_path_buf();
    for seg in python_segments() {
        p.push(seg);
    }
    p
}

/// A real product install home for a plane, with the base directories created.
fn install_home() -> (tempfile::TempDir, LifecyclePlane, ProductPaths) {
    let home = tempfile::tempdir().unwrap();
    let plane = LifecyclePlane::testonly_new(home.path());
    let paths = plane.testonly_paths().clone();
    paths.ensure().unwrap();
    (home, plane, paths)
}

/// Write an active bootstrap receipt for generation `g0` with a retained
/// ownership capability.
fn write_receipt(paths: &ProductPaths, target: Target) {
    Receipt::bootstrap(
        Channel::SelfInstall,
        target,
        vaultspec_product::manifest::ReleaseIdentity {
            name: "vaultspec-a2a".to_string(),
            version: "0.1.0".to_string(),
        },
        "g0",
        1,
    )
    .persist(&paths.receipt_path())
    .unwrap();
}

/// Write a discovery record the seated plane will read and classify.
fn write_discovery(
    paths: &ProductPaths,
    owner: &str,
    pid: u32,
    endpoint: &str,
    handoff: &str,
    heartbeat_ms: i64,
) {
    let raw = serde_json::json!({
        "endpoint": endpoint,
        "pid": pid,
        "owner": owner,
        "install_identity": "install-1",
        "generation": "g0",
        "release_set": { "name": "vaultspec-a2a", "version": "0.1.0", "target": "x86_64-pc-windows-msvc" },
        "protocol": { "minimum": "v1", "maximum": "v1" },
        "state_schema": { "minimum": "0001", "maximum": "0007" },
        "handoff_reference": handoff,
        "heartbeat_ms": heartbeat_ms
    })
    .to_string();
    std::fs::write(paths.app_home().join("gateway-discovery.json"), raw).unwrap();
}

// --- socket / file / pid proofs (no capsule needed) ---------------------------

#[test]
fn seated_boot_on_a_not_installed_product_is_a_noop() {
    let (_home, plane, _paths) = install_home();
    // No receipt written: nothing is installed, so the reconcile owns nothing.
    let outcome = plane.reconcile_seated_boot(None);
    assert_eq!(outcome["action"], "none");
    // Nothing was started, so there is no owned process to terminate.
    assert!(
        plane
            .terminate_owned_gateway(Duration::from_millis(200))
            .is_none()
    );
}

#[test]
fn retired_receipt_cannot_make_a_live_owned_gateway_authoritative() {
    let (_home, plane, paths) = install_home();
    let (_triple, target) = current_target();
    write_receipt(&paths, target);
    write_discovery(
        &paths,
        plane.testonly_owner_id(),
        std::process::id(),
        "127.0.0.1:1",
        "",
        now_ms(),
    );

    let outcome = plane.reconcile_seated_boot(None);
    assert_eq!(outcome["action"], "none", "{outcome}");
    assert_eq!(outcome["reason"], "a2a is not installed", "{outcome}");
    assert!(
        plane
            .terminate_owned_gateway(Duration::from_millis(200))
            .is_none()
    );
}

#[test]
fn retired_receipt_cannot_make_foreign_discovery_an_installed_resident() {
    let (_home, plane, paths) = install_home();
    let (_triple, target) = current_target();
    write_receipt(&paths, target);
    write_discovery(
        &paths,
        "someone-else",
        std::process::id(),
        "127.0.0.1:1",
        "",
        now_ms(),
    );
    let outcome = plane.reconcile_seated_boot(None);
    assert_eq!(outcome["action"], "none", "{outcome}");
    assert_eq!(outcome["reason"], "a2a is not installed", "{outcome}");
    assert!(
        plane
            .terminate_owned_gateway(Duration::from_millis(200))
            .is_none(),
        "a foreign resident is never spawned/owned"
    );
}

#[test]
fn retired_receipt_cannot_authorize_stale_discovery_quarantine_or_start() {
    let (_home, plane, paths) = install_home();
    let (_triple, target) = current_target();
    write_receipt(&paths, target);

    // A real child, reaped, gives a provably-dead pid for a stale OWNED record.
    let mut child = if cfg!(windows) {
        std::process::Command::new("cmd")
            .args(["/C", "exit"])
            .spawn()
            .unwrap()
    } else {
        std::process::Command::new("true").spawn().unwrap()
    };
    let dead_pid = child.id();
    child.wait().unwrap();

    write_discovery(
        &paths,
        plane.testonly_owner_id(),
        dead_pid,
        "127.0.0.1:1",
        "",
        now_ms(),
    );
    let discovery_path = paths.app_home().join("gateway-discovery.json");
    assert!(discovery_path.exists());

    let outcome = plane.reconcile_seated_boot(None);
    assert!(
        discovery_path.exists(),
        "an inert legacy receipt cannot authorize stale-record mutation: {outcome}"
    );
    assert_eq!(outcome["action"], "none", "{outcome}");
    assert_eq!(outcome["reason"], "a2a is not installed", "{outcome}");
}

#[cfg(windows)]
#[test]
fn windows_seated_control_respects_the_typed_credential_authority_gate() {
    let (_home, plane, paths) = install_home();
    let guard = InstallLock::new(paths.install_lock_path())
        .acquire(Actor::Installer, "runtime-windows-authority-test")
        .unwrap()
        .unwrap();
    match DashboardCredentialStore::for_product(&paths).begin_bootstrap(&guard) {
        Err(vaultspec_product::credentials::CredentialError::PlatformAuthorityUnavailable(_)) => {}
        Err(error) => panic!("unexpected Windows credential refusal: {error}"),
        Ok(_) => panic!("Windows credential bootstrap must remain typed unavailable"),
    }
    drop(guard);
    let outcome = plane.reconcile_seated_boot(None);
    assert_eq!(outcome["action"], "none", "{outcome}");
    assert_eq!(outcome["reason"], "a2a is not installed", "{outcome}");
}

// --- capsule-gated proofs -----------------------------------------------------

#[test]
fn real_capsule_manifest_resolves_the_owned_gateway_entrypoint() {
    let Some(capsule) = locate_capsule() else {
        skip_reason("entrypoint resolution");
        return;
    };
    let (_triple, target) = current_target();
    let lock = ComponentLock::parse(LOCK_JSON).expect("committed component lock parses");
    let manifest_raw =
        String::from_utf8(read_zip_entry(&capsule, "component-manifest.json")).expect("utf-8");
    // The reconcile's start path verifies the REAL capsule manifest against the
    // committed lock before spawning — prove that join here.
    let manifest = CapsuleManifest::parse_and_verify(&manifest_raw, &lock, target)
        .expect("capsule manifest verifies against the component lock");

    // The OWNED gateway entrypoint is the vaultspec-a2a gateway; the standalone
    // MCP is a distinct entrypoint the dashboard lifecycle never launches (S86).
    let gateway = vaultspec_product::lifecycle::owned_gateway_entrypoint(&manifest);
    let mcp = vaultspec_product::lifecycle::standalone_mcp_entrypoint(&manifest);
    assert!(
        vaultspec_product::lifecycle::is_dashboard_owned(gateway),
        "the resolved owned entrypoint is the dashboard-owned gateway"
    );
    assert_ne!(
        gateway.relative_command, mcp.relative_command,
        "the owned gateway and the standalone MCP are distinct entrypoints"
    );
}

#[test]
fn real_capsule_owned_gateway_terminates_cleanly() {
    let Some(capsule) = locate_capsule() else {
        skip_reason("owned-tree termination");
        return;
    };
    let (_home, plane, _paths) = install_home();

    // Launch a real owned process from the capsule's OWN bundled interpreter — a
    // capsule-derived "gateway" that just sleeps — and put it under the plane's
    // owned-process authority.
    let extract = tempfile::tempdir().unwrap();
    let python = extract_bundled_python(&capsule, extract.path());
    assert!(
        python.is_file(),
        "the capsule's real interpreter is present"
    );
    let program = ResolvedProgram::from_capsule_relative(extract.path(), python_segments())
        .expect("capsule-relative interpreter resolves");
    let sleep_script = "import time\nwhile True: time.sleep(0.2)\n";
    let spec = GatewaySpec::from_resolved(program, vec!["-c".into(), sleep_script.into()]);
    let process = spawn_gateway(&spec).expect("launch the real owned gateway process");
    let pid = process.pid();
    assert!(
        vaultspec_product::locking::process_is_alive(pid),
        "the owned gateway process is live"
    );
    plane.testonly_set_owned_gateway(process);

    // Seated shutdown terminates the owned tree within a bound.
    let forced = plane.terminate_owned_gateway(Duration::from_millis(500));
    assert!(forced.is_some(), "the owned gateway was terminated");

    // The real process is gone (no orphan) within a short bound.
    let deadline = Instant::now() + Duration::from_secs(6);
    while vaultspec_product::locking::process_is_alive(pid) && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(25));
    }
    assert!(
        !vaultspec_product::locking::process_is_alive(pid),
        "the owned gateway process terminated with the seated shutdown"
    );
    // A second terminate is an idempotent no-op (the slot is empty).
    assert!(
        plane
            .terminate_owned_gateway(Duration::from_millis(100))
            .is_none()
    );
}
