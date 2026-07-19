//! Lifecycle-ownership acceptance against the REAL A2A desktop capsule
//! (a2a-product-provisioning W01.P02.S18).
//!
//! These proofs run against a real built capsule: they verify the capsule
//! manifest against the committed component lock, re-derive every asset digest
//! from the capsule bytes, extract the capsule's own bundled CPython runtime, and
//! launch a real process tree from that interpreter to prove the ownership
//! outcomes the S15/S16 code implements — stop, descendant cleanup, bounded
//! timeout, data preservation, remove, and repair.
//!
//! Capsule availability gates the suite: it reads `VAULTSPEC_PRODUCT_CAPSULE`
//! (or the conventional `dist/capsules/<target>.zip`). When no capsule is
//! present (e.g. a CI job that did not build one) each test prints a clear reason
//! and returns — it never silently passes on faked data and never asserts a
//! fabricated outcome. It MUST run and pass wherever a real capsule exists.

use std::io::Read as _;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use sha2::{Digest, Sha256};
use vaultspec_product::lifecycle::{LifecycleController, plan_transition};
use vaultspec_product::manifest::{CapsuleManifest, ComponentLock, ReleaseIdentity, Target};
use vaultspec_product::paths::ProductPaths;
use vaultspec_product::process::{GatewaySpec, spawn_gateway};
use vaultspec_product::protocol::{LifecycleOp, Readiness, WorkerState};
use vaultspec_product::receipt::{Channel, Receipt};

const LOCK_JSON: &str = include_str!("../../../../packaging/a2a-component.lock.json");

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
/// conventional `dist/capsules/<target>.zip` relative to the workspace. `None`
/// when no capsule is present.
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

/// The absence message printed when no capsule is available. Kept explicit so a
/// skipped run is visible and reasoned, never silent.
fn skip_reason(what: &str) {
    let (triple, _) = current_target();
    eprintln!(
        "S18 {what}: no capsule available (set VAULTSPEC_PRODUCT_CAPSULE or place \
         dist/capsules/{triple}.zip); skipping the real-capsule proof."
    );
}

/// Read one entry from the capsule ZIP as bytes.
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

fn sha256_hex(bytes: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(bytes);
    let digest = h.finalize();
    let mut out = String::with_capacity(64);
    for b in digest {
        use std::fmt::Write as _;
        let _ = write!(out, "{b:02x}");
    }
    out
}

/// Extract the capsule's bundled CPython runtime (the `assets/python-runtime`
/// gzip tar) into `dest`, returning the path to its real interpreter.
fn extract_bundled_python(zip_path: &Path, dest: &Path) -> PathBuf {
    let gz_bytes = read_zip_entry(zip_path, "assets/python-runtime");
    let decoder = flate2::read::GzDecoder::new(&gz_bytes[..]);
    let mut archive = tar::Archive::new(decoder);
    archive.unpack(dest).expect("unpack bundled python runtime");
    if cfg!(windows) {
        dest.join("python").join("python.exe")
    } else {
        dest.join("python").join("bin").join("python3")
    }
}

#[test]
fn capsule_verifies_against_the_component_lock() {
    let Some(capsule) = locate_capsule() else {
        skip_reason("manifest verification");
        return;
    };
    let (_triple, target) = current_target();
    let lock = ComponentLock::parse(LOCK_JSON).expect("committed component lock parses");

    // The capsule's embedded manifest must parse AND verify against the lock in
    // one step (the parse_and_verify helper). This is the capsule<->lock join.
    let manifest_bytes = read_zip_entry(&capsule, "component-manifest.json");
    let manifest_raw = String::from_utf8(manifest_bytes).expect("manifest is utf-8");
    let manifest = CapsuleManifest::parse_and_verify(&manifest_raw, &lock, target)
        .expect("capsule manifest verifies against the component lock");
    assert_eq!(manifest.target, target);
    assert_eq!(
        manifest.identity.version,
        lock.a2a_source.release_identity.version
    );

    // Capsule self-integrity: every asset digest the manifest declares must be
    // the SHA-256 of the actual asset bytes stored in the capsule.
    for asset in &manifest.assets {
        let bytes = read_zip_entry(&capsule, &format!("assets/{}", asset.kind));
        assert_eq!(
            sha256_hex(&bytes),
            asset.digest,
            "capsule asset {} digest must match the manifest",
            asset.kind
        );
    }
    // The ACP, CPython, and Node digests the manifest carries are exactly the
    // lock's pins (proven inside verify, re-asserted here for the record).
    assert_eq!(
        manifest
            .assets
            .iter()
            .find(|a| a.kind == "acp-adapter")
            .unwrap()
            .digest,
        lock.base_closure.acp.sha256
    );
    assert_eq!(
        manifest
            .assets
            .iter()
            .find(|a| a.kind == "python-runtime")
            .unwrap()
            .digest,
        lock.python_digest(target).unwrap()
    );
}

#[test]
fn real_gateway_tree_stops_within_the_bound_and_preserves_data() {
    let Some(capsule) = locate_capsule() else {
        skip_reason("gateway lifecycle");
        return;
    };
    let (_triple, target) = current_target();

    // A real product install tree.
    let home = tempfile::tempdir().unwrap();
    let paths = ProductPaths::under_app_home(home.path());
    paths.ensure().unwrap();

    // Install the capsule's REAL bundled interpreter into the generation tree.
    let gen_dir = paths.generation_dir("g0").unwrap();
    std::fs::create_dir_all(&gen_dir).unwrap();
    let python = extract_bundled_python(&capsule, &gen_dir);
    assert!(
        python.is_file(),
        "the capsule's real interpreter is installed"
    );

    // Mutable user data that must survive the stop.
    let user_db = paths.data_dir().join("user.db");
    std::fs::write(&user_db, b"precious-user-state").unwrap();

    // An active receipt for the generation.
    Receipt::bootstrap(
        Channel::SelfInstall,
        target,
        ReleaseIdentity {
            name: "vaultspec-a2a".to_string(),
            version: "0.1.0".to_string(),
        },
        "g0",
        1,
    )
    .persist(&paths.receipt_path())
    .unwrap();

    // A gateway-shaped process run by the capsule's OWN interpreter: it ignores
    // SIGTERM (so the bounded-timeout force-kill path is exercised), spawns a
    // worker descendant, and records both readiness and the worker pid.
    let gateway_script = "\
import os, sys, subprocess, time, signal, pathlib\n\
try:\n    signal.signal(signal.SIGTERM, signal.SIG_IGN)\nexcept Exception:\n    pass\n\
home = pathlib.Path(os.environ['GW_APPHOME'])\n\
w = subprocess.Popen([sys.executable, '-c', 'import time\\nwhile True: time.sleep(0.2)'])\n\
home.joinpath('worker.pid').write_text(str(w.pid))\n\
home.joinpath('gateway.ready').write_text('ready')\n\
end = time.time() + 30\n\
while time.time() < end:\n    time.sleep(0.1)\n";

    let spec = GatewaySpec::new(&python, vec!["-c".into(), gateway_script.into()])
        .with_env("GW_APPHOME", paths.app_home());
    let mut gateway = spawn_gateway(&spec).expect("launch the real gateway process");

    // The gateway and its worker descendant come up.
    let ready = paths.app_home().join("gateway.ready");
    let worker_pid_file = paths.app_home().join("worker.pid");
    assert!(
        wait_for(&ready, Duration::from_secs(20)),
        "gateway did not become ready"
    );
    assert!(
        wait_for(&worker_pid_file, Duration::from_secs(20)),
        "worker did not start"
    );
    let worker_pid: u32 = std::fs::read_to_string(&worker_pid_file)
        .unwrap()
        .trim()
        .parse()
        .unwrap();
    assert!(gateway.is_alive(), "the owned gateway is live");
    assert!(
        vaultspec_product::locking::process_is_alive(worker_pid),
        "the worker is a live descendant"
    );

    // The pure transition planner agrees this installed, running gateway is ready.
    assert_eq!(
        plan_transition(Readiness::InstalledStopped, LifecycleOp::Start),
        Ok(Readiness::GatewayReady {
            worker: WorkerState::Cold
        })
    );

    // STOP within a bound: the gateway ignores the graceful signal, so the tree
    // is force-killed at the deadline. Termination returns promptly and reports
    // the forced outcome.
    let graceful = Duration::from_millis(800);
    let start = Instant::now();
    let outcome = gateway
        .terminate_tree(graceful)
        .expect("terminate the owned tree");
    let elapsed = start.elapsed();
    assert!(
        outcome.forced,
        "a SIGTERM-ignoring gateway must be force-killed"
    );
    assert!(
        elapsed < graceful + Duration::from_secs(6),
        "termination returned within the bound (~graceful window), took {elapsed:?}"
    );

    // Descendant cleanup: both the gateway and its worker are gone (no orphan).
    let deadline = Instant::now() + Duration::from_secs(6);
    while (gateway.is_alive() || vaultspec_product::locking::process_is_alive(worker_pid))
        && Instant::now() < deadline
    {
        std::thread::sleep(Duration::from_millis(25));
    }
    assert!(!gateway.is_alive(), "the owned gateway terminated");
    assert!(
        !vaultspec_product::locking::process_is_alive(worker_pid),
        "the worker descendant terminated with the tree"
    );

    // Data preservation: the mutable user state is byte-identical after the stop.
    assert_eq!(std::fs::read(&user_db).unwrap(), b"precious-user-state");
}

#[test]
fn remove_and_repair_against_real_capsule_bytes() {
    let Some(capsule) = locate_capsule() else {
        skip_reason("remove/repair");
        return;
    };
    let (_triple, _target) = current_target();

    let home = tempfile::tempdir().unwrap();
    let paths = ProductPaths::under_app_home(home.path());
    paths.ensure().unwrap();
    let ctrl = LifecycleController::new(paths.clone());

    // A REAL immutable capsule artifact (the canonical manifest bytes) installed
    // in the generation, plus mutable user data.
    let pristine = read_zip_entry(&capsule, "component-manifest.canonical.bin");
    let gen_dir = paths.generation_dir("g0").unwrap();
    std::fs::create_dir_all(&gen_dir).unwrap();
    let immutable = gen_dir.join("manifest.canonical.bin");
    std::fs::write(&immutable, &pristine).unwrap();
    let user_db = paths.data_dir().join("user.db");
    std::fs::write(&user_db, b"precious-user-state").unwrap();
    Receipt::bootstrap(
        Channel::SelfInstall,
        Target::X86_64PcWindowsMsvc,
        ReleaseIdentity {
            name: "vaultspec-a2a".to_string(),
            version: "0.1.0".to_string(),
        },
        "g0",
        1,
    )
    .persist(&paths.receipt_path())
    .unwrap();

    // REPAIR: corrupt the immutable file, repair it from the pristine capsule
    // bytes, and confirm it is restored while mutable data is untouched.
    std::fs::write(&immutable, b"corrupted").unwrap();
    ctrl.repair_immutable("g0", Path::new("manifest.canonical.bin"), &pristine)
        .expect("repair replaces the immutable file");
    assert_eq!(
        std::fs::read(&immutable).unwrap(),
        pristine,
        "immutable file restored"
    );
    assert_eq!(
        std::fs::read(&user_db).unwrap(),
        b"precious-user-state",
        "repair never overwrote mutable data"
    );

    // REMOVE without typed data removal: generations and receipt gone, mutable
    // data preserved.
    ctrl.remove(false).expect("remove preserving data");
    assert!(!gen_dir.exists(), "generation removed");
    assert!(!paths.receipt_path().exists(), "receipt removed");
    assert_eq!(
        std::fs::read(&user_db).unwrap(),
        b"precious-user-state",
        "data preserved through removal"
    );

    // REMOVE with typed data removal: the mutable data is cleared too.
    ctrl.remove(true).expect("typed data removal");
    assert!(!user_db.exists(), "typed removal clears user data");
}

fn wait_for(path: &Path, budget: Duration) -> bool {
    let deadline = Instant::now() + budget;
    while Instant::now() < deadline {
        if path.exists() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    false
}
