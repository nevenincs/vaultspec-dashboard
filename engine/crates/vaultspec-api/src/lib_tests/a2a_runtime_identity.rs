//! A2A runtime-identity acceptance for the SEATED reconcile
//! (a2a-product-provisioning W02.P04.S34).
//!
//! These proofs drive the production seated-boot reconcile
//! (`LifecyclePlane::reconcile_seated_boot`) and the owned-tree termination
//! contract against REAL artifacts — real loopback control sockets, real
//! credential files, real process identities (this test process's own live pid,
//! and a spawned-then-reaped dead child), a real discovery record, and — where a
//! built capsule is available — the capsule's OWN bundled interpreter launching a
//! real owned process. No fakes, mocks, stubs, or skips of a real outcome.
//!
//! The capsule-dependent proofs (a real owned process, the real entrypoint
//! resolution) gate on `VAULTSPEC_PRODUCT_CAPSULE` (or the conventional
//! `dist/capsules/<target>.zip`) and print a clear reason and return when no
//! capsule is present — they never silently pass on faked data. The socket / file
//! / pid proofs need no capsule and run everywhere.

use std::io::Read as _;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use vaultspec_product::credentials::CredentialStore;
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

/// Stand up a real loopback gateway readiness/health server that requires the
/// attach bearer and answers the one readiness model. Serves a bounded number of
/// connections then exits.
fn spawn_readiness_server(attach_token: String, connections: usize) -> String {
    use std::io::{Read, Write};
    use std::net::TcpListener;
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let endpoint = format!("127.0.0.1:{}", listener.local_addr().unwrap().port());
    std::thread::spawn(move || {
        for _ in 0..connections {
            let Ok((mut sock, _)) = listener.accept() else {
                break;
            };
            let _ = sock.set_read_timeout(Some(Duration::from_secs(5)));
            let mut buf = [0u8; 2048];
            let n = sock.read(&mut buf).unwrap_or(0);
            let req = String::from_utf8_lossy(&buf[..n]);
            let authed = req.contains(&format!("Authorization: Bearer {attach_token}"));
            let resp = if !authed {
                "HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n".to_string()
            } else {
                let body = r#"{"state":"gateway-ready","worker":"cold"}"#;
                format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                )
            };
            let _ = sock.write_all(resp.as_bytes());
        }
    });
    endpoint
}

// --- socket / file / pid proofs (no capsule needed) ---------------------------

#[test]
fn seated_boot_on_a_not_installed_product_is_a_noop() {
    let (_home, plane, _paths) = install_home();
    // No receipt written: nothing is installed, so the reconcile owns nothing.
    let outcome = plane.reconcile_seated_boot();
    assert_eq!(outcome["action"], "none");
    // Nothing was started, so there is no owned process to terminate.
    assert!(
        plane
            .terminate_owned_gateway(Duration::from_millis(200))
            .is_none()
    );
}

#[test]
fn seated_boot_authenticates_a_live_owned_gateway() {
    let (_home, plane, paths) = install_home();
    let (_triple, target) = current_target();
    write_receipt(&paths, target);
    let creds = CredentialStore::new(paths.credentials_dir())
        .bootstrap()
        .unwrap();

    // A real readiness server the authenticated attach probes. Our OWN live pid +
    // a fresh heartbeat + our owner id makes the record classify OwnedLive.
    let endpoint = spawn_readiness_server(creds.attach_control.secret().to_string(), 2);
    let handoff = paths.credentials_dir().join("attach-control.cred");
    write_discovery(
        &paths,
        plane.testonly_owner_id(),
        std::process::id(),
        &endpoint,
        &handoff.to_string_lossy(),
        now_ms(),
    );

    let outcome = plane.reconcile_seated_boot();
    assert_eq!(
        outcome["action"], "authenticate",
        "a live owned gateway is authenticated, never re-spawned: {outcome}"
    );
    assert_eq!(
        outcome["ready"], true,
        "the authenticated readiness probe read the gateway ready: {outcome}"
    );
    assert_eq!(outcome["owned"], true);
    // Authentication spawns nothing — the owned-process slot stays empty.
    assert!(
        plane
            .terminate_owned_gateway(Duration::from_millis(200))
            .is_none()
    );
}

#[test]
fn seated_boot_leaves_a_foreign_resident_immutable() {
    let (_home, plane, paths) = install_home();
    let (_triple, target) = current_target();
    write_receipt(&paths, target);
    CredentialStore::new(paths.credentials_dir())
        .bootstrap()
        .unwrap();

    // A live FOREIGN gateway (different owner) is LEFT IMMUTABLE — never spawned,
    // never mutated (ADR D4). Whether it is additionally attachable read-only
    // (`attach-foreign`) or fully immutable (`leave-foreign`) turns on whether the
    // handoff credential is owner-ACL-restricted — a product-crate contract
    // (`discovery::handoff_is_owner_restricted`) that is environment-dependent on
    // Windows. The property S34 proves is immutability, so accept either foreign
    // verdict and assert NOTHING was spawned.
    let handoff = paths.credentials_dir().join("attach-control.cred");
    write_discovery(
        &paths,
        "someone-else",
        std::process::id(),
        "127.0.0.1:1",
        &handoff.to_string_lossy(),
        now_ms(),
    );
    let outcome = plane.reconcile_seated_boot();
    assert!(
        matches!(
            outcome["action"].as_str(),
            Some("attach-foreign") | Some("leave-foreign")
        ),
        "a live foreign gateway is left immutable (attach-read-only or immutable), \
         never mutated: {outcome}"
    );
    assert!(
        plane
            .terminate_owned_gateway(Duration::from_millis(200))
            .is_none(),
        "a foreign resident is never spawned/owned"
    );

    // A live foreign gateway WITHOUT any readable handoff is unambiguously fully
    // immutable (ForeignImmutable::NoTrustedHandoff).
    write_discovery(
        &paths,
        "someone-else",
        std::process::id(),
        "127.0.0.1:1",
        "/no/such/handoff",
        now_ms(),
    );
    let outcome = plane.reconcile_seated_boot();
    assert_eq!(
        outcome["action"], "leave-foreign",
        "an untrusted foreign gateway is left immutable: {outcome}"
    );
}

#[test]
fn seated_boot_quarantines_a_stale_owned_record_before_starting() {
    let (_home, plane, paths) = install_home();
    let (_triple, target) = current_target();
    write_receipt(&paths, target);
    CredentialStore::new(paths.credentials_dir())
        .bootstrap()
        .unwrap();

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

    let outcome = plane.reconcile_seated_boot();
    // The owner-matched dead record is quarantined (retracted), then a fresh
    // start is attempted. Without the not-yet-built install layout the start
    // honestly reports the missing capsule rather than a fabricated success.
    assert!(
        !discovery_path.exists(),
        "the stale owner-matched record was quarantined (retracted): {outcome}"
    );
    assert_eq!(outcome["action"], "start");
    assert_eq!(
        outcome["started"], false,
        "no install layout yet, so the start honestly fails rather than faking: {outcome}"
    );
    assert!(
        outcome["reason"]
            .as_str()
            .unwrap_or_default()
            .contains("capsule manifest"),
        "the honest reason names the missing install layout: {outcome}"
    );
}

#[cfg(windows)]
#[test]
fn seated_boot_does_not_start_when_stale_discovery_cannot_be_removed() {
    use std::os::windows::fs::OpenOptionsExt as _;

    let (home, plane, paths) = install_home();
    let (_triple, target) = current_target();
    write_receipt(&paths, target);
    CredentialStore::new(paths.credentials_dir())
        .bootstrap()
        .unwrap();

    let mut child = std::process::Command::new("cmd")
        .args(["/C", "exit"])
        .spawn()
        .unwrap();
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
    const FILE_SHARE_READ: u32 = 0x0000_0001;
    let retained_reader = std::fs::OpenOptions::new()
        .read(true)
        .share_mode(FILE_SHARE_READ)
        .open(&discovery_path)
        .unwrap();

    let outcome = plane.reconcile_seated_boot();
    assert_eq!(outcome["action"], "recover-stale", "{outcome}");
    assert_eq!(outcome["started"], false, "{outcome}");
    let reason = outcome["reason"].as_str().unwrap_or_default();
    assert!(
        reason.contains("stale discovery quarantine failed"),
        "{outcome}"
    );
    assert!(
        !reason.contains(&home.path().to_string_lossy().to_string()),
        "the failure must not disclose the product path: {outcome}"
    );
    assert!(discovery_path.is_file());
    assert!(
        plane
            .terminate_owned_gateway(Duration::from_millis(200))
            .is_none(),
        "a failed quarantine must not retain a started gateway: {outcome}"
    );

    drop(retained_reader);
    std::fs::remove_file(discovery_path).unwrap();
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
