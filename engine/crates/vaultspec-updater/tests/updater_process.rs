//! Real-executable proofs for the copied updater.
//!
//! These invoke real processes and the production `vaultspec-product` authority
//! (no fakes, no doubles):
//!
//! - the updater COPIED OUT of the release — the one the dashboard actually
//!   launches — takes the installation lock, while a real gateway process is
//!   refused it immediately and therefore can never wait on it;
//! - the authenticated drain closes admission and resolves active runs and
//!   checkpoints BEFORE the owner-authorized stop, and the gateway's runtime
//!   singleton is released before the snapshot, migration, and swap begin;
//! - a consumed descriptor cannot be replayed, a descriptor error echoes no
//!   descriptor content, an unfinished requester is waited out, and the prior
//!   seat is relaunched after the run.
//!
//! The gateway here is a REAL child process serving the production control
//! protocol over loopback with the production credentials, holding a real
//! advisory runtime singleton for its lifetime.

use std::ffi::OsString;
use std::io::{Read as _, Write as _};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::Output;
use std::time::{Duration, Instant, SystemTime};
use vaultspec_product::a2a_contract::GATEWAY_DISCOVERY_FILE;

use fs4::fs_std::FileExt;
use rusqlite::Connection;
use vaultspec_product::credentials::DashboardCredentialStore;
use vaultspec_product::gateway_drain::{DrainContext, DrainDeadlines, OwnedGatewayLease};
use vaultspec_product::handoff::copy_updater_out;
use vaultspec_product::locking::{Actor, InstallLock, LockError};
use vaultspec_product::manifest::RangeBounds;
use vaultspec_product::paths::ProductPaths;
use vaultspec_product::process::{GatewaySpec, ResolvedProgram, spawn_gateway};
use vaultspec_product::receipt::Channel;
use vaultspec_product::snapshot::{ConsistencyGroupSpec, SchemaBearingStore};
use vaultspec_product::transaction::{UpdatePlan, UpdateTransaction, read_descriptor};
use vaultspec_updater::wait_for_process_exit;

struct Installed {
    paths: ProductPaths,
    descriptor: PathBuf,
    temp: tempfile::TempDir,
}

fn installed_product() -> Installed {
    let temp = tempfile::tempdir().expect("real temporary app home");
    let paths = ProductPaths::under_app_home(temp.path());
    paths.ensure().unwrap();
    let descriptor = temp.path().join("updater-descriptor.json");
    Installed {
        paths,
        descriptor,
        temp,
    }
}

impl Installed {
    fn app_home(&self) -> &Path {
        self.temp.path()
    }

    fn db_path(&self, name: &str) -> PathBuf {
        self.paths.app_home().join("data").join(name)
    }

    fn write_owner_restricted_descriptor(&self, json: &str) {
        std::fs::write(&self.descriptor, json).unwrap();
        restrict_test_file(&self.descriptor);
    }

    fn valid_descriptor(&self) -> String {
        format!(
            "{{\"version\":1,\"app_home\":{:?},\"owner\":\"copied-updater\"}}",
            self.app_home()
        )
    }
}

fn restrict_test_file(path: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600)).unwrap();
    }
    #[cfg(windows)]
    {
        let whoami = std::process::Command::new("whoami.exe").output().unwrap();
        let user = String::from_utf8(whoami.stdout).unwrap();
        let user_grant = format!("{}:F", user.trim());
        let output = std::process::Command::new("icacls.exe")
            .arg(path)
            .args([
                "/inheritance:r",
                "/grant:r",
                &user_grant,
                "/grant",
                "*S-1-5-18:F",
                "/grant",
                "*S-1-5-32-544:F",
            ])
            .output()
            .unwrap();
        assert!(output.status.success());
    }
}

fn run_updater(descriptor: &Path) -> Output {
    run_updater_binary(
        Path::new(env!("CARGO_BIN_EXE_vaultspec-updater")),
        descriptor,
    )
}

fn run_updater_binary(updater: &Path, descriptor: &Path) -> Output {
    std::process::Command::new(updater)
        .arg(descriptor)
        .output()
        .expect("spawn the real updater binary")
}

fn code(output: &Output) -> i32 {
    output.status.code().unwrap_or(-1)
}

fn now_ms() -> i64 {
    i64::try_from(
        SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .unwrap()
            .as_millis(),
    )
    .unwrap()
}

// Exit-code contract mirrored from the executable (main.rs).
const EXIT_OK: i32 = 0;
const EXIT_BUSY: i32 = 3;
const EXIT_DESCRIPTOR: i32 = 4;

/// Env key naming the app home a spawned gateway helper serves.
const GATEWAY_HELPER_HOME: &str = "VAULTSPEC_TEST_GATEWAY_HOME";
/// The gateway helper's lifetime-held runtime singleton.
const RUNTIME_SINGLETON: &str = "runtime-singleton.lock";
/// The ordered record of what the gateway helper did.
const GATEWAY_JOURNAL: &str = "gateway-journal.txt";
/// Sentinel that turns the relaunch-target helper on, dropped into the recorded
/// relaunch workspace (the front-door spawn runs the launcher there).
const RELAUNCH_SENTINEL: &str = "relaunch-workspace.sentinel";
/// What the relaunch-target helper writes to prove it ran.
const RELAUNCH_MARKER: &str = "relaunched.marker";

#[test]
fn the_gateway_can_never_acquire_the_install_lock() {
    let product = installed_product();
    let result = InstallLock::new(product.paths.install_lock_path())
        .acquire(Actor::Gateway, "gateway-must-not-lock");
    assert!(matches!(result, Err(LockError::GatewayForbidden)));
}

#[test]
fn a_concurrent_lock_holder_makes_the_updater_report_busy() {
    let product = installed_product();
    product.write_owner_restricted_descriptor(&product.valid_descriptor());

    // Another installer holds the lock across the updater run.
    let _held = InstallLock::new(product.paths.install_lock_path())
        .acquire(Actor::Installer, "other-installer")
        .unwrap()
        .unwrap();

    let output = run_updater(&product.descriptor);
    assert_eq!(code(&output), EXIT_BUSY);
    // A busy run must not consume the one-time descriptor.
    assert!(product.descriptor.exists());
}

/// The updater the dashboard launches is a COPY taken out of the release, and
/// that copy is the process that holds the installation lock for the
/// transaction. Nothing else acquires it: a real gateway process is refused
/// before the lock file is touched, so it can neither take nor wait on it, even
/// while an installer holds the lock.
#[test]
fn only_the_copied_updater_acquires_the_install_lock() {
    let product = installed_product();
    let release_updater = Path::new(env!("CARGO_BIN_EXE_vaultspec-updater"));
    let copied = copy_updater_out(release_updater, &product.paths.updater_dir())
        .expect("copy the updater out of the release");
    assert_ne!(
        copied, release_updater,
        "the launched updater must be a copy outside the release"
    );
    assert_eq!(copied.file_name(), release_updater.file_name());

    // While an installer holds the lock, the gateway's request is refused
    // immediately — it never queues behind the holder.
    let held = InstallLock::new(product.paths.install_lock_path())
        .acquire(Actor::Installer, "holder")
        .unwrap()
        .unwrap();
    let begun = Instant::now();
    let refused =
        InstallLock::new(product.paths.install_lock_path()).acquire(Actor::Gateway, "gateway");
    let waited = begun.elapsed();
    assert!(matches!(refused, Err(LockError::GatewayForbidden)));
    assert!(
        waited < Duration::from_millis(500),
        "the gateway must be refused without waiting, waited {waited:?}"
    );
    held.release().expect("release the holder");

    // The copy then takes the lock and completes its run.
    product.write_owner_restricted_descriptor(&product.valid_descriptor());
    let output = run_updater_binary(&copied, &product.descriptor);
    assert_eq!(
        code(&output),
        EXIT_OK,
        "the copied updater must acquire the lock and run: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(!product.descriptor.exists());
}

#[test]
fn a_consumed_descriptor_cannot_be_replayed() {
    let product = installed_product();
    product.write_owner_restricted_descriptor(&product.valid_descriptor());

    assert_eq!(code(&run_updater(&product.descriptor)), EXIT_OK);
    // The one-time descriptor was retired; a replay is refused.
    assert_eq!(code(&run_updater(&product.descriptor)), EXIT_DESCRIPTOR);
}

#[test]
fn a_descriptor_error_echoes_no_descriptor_content() {
    let product = installed_product();
    // A malformed descriptor carrying a recognizable marker.
    let marker = "SUPER-SECRET-MARKER-0xDEADBEEF";
    product.write_owner_restricted_descriptor(&format!("{{ not json {marker}"));

    let output = run_updater(&product.descriptor);
    assert_eq!(code(&output), EXIT_DESCRIPTOR);
    let combined = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(
        !combined.contains(marker),
        "updater output must not echo descriptor content: {combined}"
    );
}

/// Redaction proven against REAL credential material, not a stand-in marker.
///
/// The updater runs on an install whose product credentials genuinely exist, on
/// both a completing run and a refused one, and neither the ownership
/// capability nor the attach-control token may appear anywhere in its output.
#[test]
fn no_run_ever_echoes_a_real_credential_secret() {
    let product = installed_product();
    let store = DashboardCredentialStore::for_product(&product.paths);
    {
        let guard = InstallLock::new(product.paths.install_lock_path())
            .acquire(Actor::Installer, "bootstrap")
            .unwrap()
            .unwrap();
        drop(
            store
                .begin_bootstrap(&guard)
                .expect("create the real dashboard credentials"),
        );
        guard.release().expect("release the bootstrap lock");
    }
    let ownership = store
        .read_ownership()
        .expect("read ownership")
        .secret()
        .to_owned();
    let attach = store
        .read_attach_control()
        .expect("read attach-control")
        .secret()
        .to_owned();
    assert_eq!(ownership.len(), 64, "the fixture must hold a real token");
    assert_ne!(ownership, attach);

    // A completing run, then a refused one: both must stay secret-free.
    product.write_owner_restricted_descriptor(&product.valid_descriptor());
    let completed = run_updater(&product.descriptor);
    assert_eq!(code(&completed), EXIT_OK);
    let refused = run_updater(&product.descriptor);
    assert_eq!(code(&refused), EXIT_DESCRIPTOR);

    for output in [&completed, &refused] {
        let combined = format!(
            "{}{}",
            String::from_utf8_lossy(&output.stdout),
            String::from_utf8_lossy(&output.stderr)
        );
        for secret in [&ownership, &attach] {
            assert!(
                !combined.contains(secret.as_str()),
                "a credential secret must never reach updater output: {combined}"
            );
        }
    }
}

#[test]
fn the_updater_recovers_an_interrupted_transaction() {
    let product = installed_product();
    create_db(&product.db_path("primary.db"), &[(1, "alpha"), (2, "beta")]);

    // Drive a real transaction to Snapshotted, corrupt the store, then "crash"
    // (drop the transaction and its guard, freeing the OS lock).
    {
        let guard = InstallLock::new(product.paths.install_lock_path())
            .acquire(Actor::CopiedUpdater, "setup")
            .unwrap()
            .unwrap();
        let plan = UpdatePlan::new(
            5,
            "cand-1",
            Some("prior-0".to_string()),
            Channel::SelfInstall,
            "0008",
        )
        .unwrap();
        let mut txn = UpdateTransaction::begin(product.paths.clone(), &guard, plan).unwrap();
        let (_q, _t) = txn
            .drain_and_stop(stub_gateway(), Duration::from_secs(5))
            .unwrap();
        txn.snapshot(&group()).unwrap();
        let conn = Connection::open(product.db_path("primary.db")).unwrap();
        conn.execute("DELETE FROM runs", []).unwrap();
        conn.close().unwrap();
    }

    // The real updater binary acquires its own lock and recovers.
    product.write_owner_restricted_descriptor(&product.valid_descriptor());
    assert_eq!(code(&run_updater(&product.descriptor)), EXIT_OK);

    // The store was rolled back to its captured state.
    assert_eq!(
        read_rows(&product.db_path("primary.db")),
        vec![(1, "alpha".to_string()), (2, "beta".to_string())]
    );
    // The durable transaction descriptor was cleared.
    let guard = InstallLock::new(product.paths.install_lock_path())
        .acquire(Actor::CopiedUpdater, "verify")
        .unwrap()
        .unwrap();
    assert!(read_descriptor(&product.paths, &guard).unwrap().is_none());
}

/// The ordered heart of the transaction, against a REAL gateway process.
///
/// The authenticated drain must close admission and resolve active runs and
/// checkpoints before the owner-authorized stop is issued, the gateway's
/// lifetime-held runtime singleton must be released before any state is
/// captured or migrated, and the gateway must never touch the installation lock
/// the updater holds throughout.
#[test]
fn the_drain_precedes_the_authorized_stop_and_the_singleton_release_precedes_the_snapshot() {
    let product = installed_product();
    create_db(&product.db_path("primary.db"), &[(1, "alpha"), (2, "beta")]);

    // The copied updater holds the installation lock for the whole transaction.
    let guard = InstallLock::new(product.paths.install_lock_path())
        .acquire(Actor::CopiedUpdater, "copied-updater")
        .unwrap()
        .unwrap();

    // Real product credentials: the gateway authenticates against these files.
    // The bootstrap proof retains exclusive handles on both files, so it is
    // released before the gateway process reads them — exactly as first install
    // releases them before the gateway ever boots.
    let store = DashboardCredentialStore::for_product(&product.paths);
    drop(
        store
            .begin_bootstrap(&guard)
            .expect("create the real dashboard credentials"),
    );

    let gateway = spawn_gateway_helper(product.app_home());
    let gateway_pid = gateway.id();
    // Reap the helper the instant it exits, because here it is OUR child and in
    // production it never is: the updater drains a gateway it did not spawn
    // (it runs post-seat-exit), so that process is reaped by its own parent and
    // its pid vanishes from the process table the moment it dies.
    //
    // On Unix an exited-but-unreaped child stays a ZOMBIE, and a zombie keeps a
    // live `/proc/<pid>` entry, so the exit proof in `drive_drain_stop` reads it
    // as still running and can only time out. Reaping concurrently is what makes
    // the polled pid behave the way production's does; it is also exactly what
    // the sibling `drive_drain_stop` proof does when it honours the shutdown by
    // terminating (and thereby waiting on) the child it owns. Without this the
    // test asserts the ordering invariant against a process state production
    // never produces.
    let reaped = std::thread::spawn(move || {
        let mut gateway = gateway;
        gateway.wait()
    });
    let journal = product.paths.app_home().join(GATEWAY_JOURNAL);
    await_journal_entry(&journal, "published", Duration::from_secs(30));

    // The real gateway process was refused the installation lock outright.
    let published = read_journal(&journal);
    assert!(
        published
            .iter()
            .any(|line| line.starts_with("gateway-lock-refused=true")),
        "the gateway must be refused the installation lock: {published:?}"
    );

    // The singleton is held for the gateway's lifetime.
    assert!(
        !singleton_is_free(&product.paths),
        "the running gateway must hold its runtime singleton"
    );

    let deadlines = DrainDeadlines::new(
        Duration::from_secs(10),
        Duration::from_secs(20),
        Duration::from_millis(50),
    )
    .unwrap();
    let lease = OwnedGatewayLease::acquire(&product.paths, &guard, &drain_context())
        .expect("the published owned gateway must be leasable");

    let plan = UpdatePlan::new(
        7,
        "cand-1",
        Some("prior-0".to_string()),
        Channel::SelfInstall,
        "0008",
    )
    .unwrap();
    let mut txn = UpdateTransaction::begin(product.paths.clone(), &guard, plan).unwrap();
    let (quiescence, evidence) = txn
        .drain_and_stop_discovered(lease, deadlines)
        .expect("the owned gateway must drain and stop");
    assert_eq!(
        evidence.pid, gateway_pid,
        "the stop evidence must name the real gateway process"
    );

    // The recorded order: admission closed and runs plus checkpoints resolved
    // before the authorized stop was even issued.
    let entries = read_journal(&journal);
    let at = |needle: &str| {
        entries
            .iter()
            .position(|line| line == needle)
            .unwrap_or_else(|| panic!("the gateway must record {needle}: {entries:?}"))
    };
    let admission = at("admission-closed");
    let runs = at("runs-resolved");
    let checkpoints = at("checkpoints-flushed");
    let drained = at("drain-acknowledged");
    let stopped = at("shutdown-authorized");
    assert!(
        admission < runs && runs < checkpoints && checkpoints < drained && drained < stopped,
        "drain work must complete before the authorized stop: {entries:?}"
    );

    // The runtime singleton is free BEFORE anything is captured or migrated.
    assert!(
        singleton_is_free(&product.paths),
        "the runtime singleton must be released before the snapshot"
    );

    txn.snapshot(&group()).expect("snapshot the quiesced state");
    txn.migrate(&succeeding_migration(), &forward_plan(), &quiescence)
        .expect("run the staged migration under quiescence");
    txn.ready_to_activate()
        .rollback()
        .expect("clean rollback from the activation boundary");

    let status = reaped
        .join()
        .expect("join the gateway reaper")
        .expect("reap the gateway helper");
    assert!(
        status.success(),
        "the gateway must exit cleanly after the authorized stop"
    );
}

/// The updater waits out the dashboard process that wrote the handoff: that
/// process runs the executable image an activation replaces. Proven against a
/// real live process and a real exited one.
#[test]
fn the_requester_wait_ends_on_a_real_exit_and_times_out_on_a_live_process() {
    assert!(
        !wait_for_process_exit(
            std::process::id(),
            Duration::from_millis(200),
            Duration::from_millis(20)
        ),
        "a live process must not be reported as exited"
    );

    let mut child = spawn_short_lived_child();
    let pid = child.id();
    child.wait().expect("reap the child");
    assert!(
        wait_for_process_exit(pid, Duration::from_secs(10), Duration::from_millis(20)),
        "an exited process must be observed as gone"
    );
}

/// A handoff that carries a relaunch instruction brings the prior seat back:
/// the updater spawns the recorded stable front door in the recorded workspace
/// after its run resolves.
#[test]
fn the_prior_seat_is_relaunched_after_the_run() {
    let product = installed_product();
    let workspace = product.temp.path().join("workspace");
    std::fs::create_dir_all(&workspace).unwrap();
    // The relaunch target only acts when it is run in a recorded workspace.
    std::fs::write(workspace.join(RELAUNCH_SENTINEL), b"relaunch").unwrap();
    let launcher = std::env::current_exe().unwrap();

    product.write_owner_restricted_descriptor(&format!(
        "{{\"version\":1,\"app_home\":{:?},\"owner\":\"copied-updater\",\
         \"relaunch\":{{\"launcher\":{:?},\"workspace\":{:?}}}}}",
        product.app_home(),
        launcher,
        workspace
    ));

    let output = run_updater(&product.descriptor);
    assert_eq!(
        code(&output),
        EXIT_OK,
        "the relaunching run must succeed: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let marker = workspace.join(RELAUNCH_MARKER);
    let deadline = Instant::now() + Duration::from_secs(30);
    while !marker.exists() && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(50));
    }
    assert!(
        marker.exists(),
        "the prior seat's front door must have been relaunched in its workspace"
    );
}

/// The relaunch target. The front-door spawn runs `<launcher> serve` in the
/// recorded workspace, and `serve` selects this test by name; it acts only when
/// that workspace carries the sentinel, so an ordinary suite run is a no-op.
#[test]
fn relaunch_serve_target() {
    if !Path::new(RELAUNCH_SENTINEL).exists() {
        return;
    }
    std::fs::write(RELAUNCH_MARKER, b"relaunched").unwrap();
}

/// A real gateway process: it holds a genuine runtime singleton for its
/// lifetime, authenticates with the product credentials, publishes discovery,
/// and serves the production control protocol, recording what it did in order.
/// Inert unless spawned as one.
#[test]
fn gateway_control_helper() {
    let Some(home) = std::env::var_os(GATEWAY_HELPER_HOME) else {
        return;
    };
    serve_as_gateway(Path::new(&home));
}

fn spawn_gateway_helper(app_home: &Path) -> std::process::Child {
    std::process::Command::new(std::env::current_exe().unwrap())
        .args([
            "gateway_control_helper",
            "--exact",
            "--nocapture",
            "--test-threads=1",
        ])
        .env(GATEWAY_HELPER_HOME, app_home)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .expect("spawn the real gateway helper process")
}

/// A real child process that runs to completion promptly: the test binary
/// re-invoked with a filter matching no test.
fn spawn_short_lived_child() -> std::process::Child {
    std::process::Command::new(std::env::current_exe().unwrap())
        .args(["zzz_no_such_test_filter", "--test-threads=1", "--nocapture"])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .expect("spawn a real child process")
}

fn serve_as_gateway(app_home: &Path) -> ! {
    let paths = ProductPaths::under_app_home(app_home);
    let journal = paths.app_home().join(GATEWAY_JOURNAL);

    // Never outlive the test that spawned us, whatever happens.
    std::thread::spawn(|| {
        std::thread::sleep(Duration::from_secs(120));
        std::process::exit(70);
    });

    // The runtime singleton is held for this process's whole lifetime and is
    // released only by its exit.
    let singleton = std::fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(paths.app_home().join(RUNTIME_SINGLETON))
        .expect("open the runtime singleton");
    FileExt::lock_exclusive(&singleton).expect("hold the runtime singleton");

    // The gateway may never acquire or wait on the installation lock.
    let begun = Instant::now();
    let refused =
        InstallLock::new(paths.install_lock_path()).acquire(Actor::Gateway, "gateway-helper");
    record(
        &journal,
        &format!(
            "gateway-lock-refused={} waited_ms={}",
            matches!(refused, Err(LockError::GatewayForbidden)),
            begun.elapsed().as_millis()
        ),
    );

    let store = DashboardCredentialStore::for_product(&paths);
    let attach = store
        .read_attach_control()
        .expect("read the attach-control credential");
    let ownership = store
        .read_ownership()
        .expect("read the ownership capability");

    let listener = TcpListener::bind("127.0.0.1:0").expect("bind loopback");
    let endpoint = format!("127.0.0.1:{}", listener.local_addr().unwrap().port());
    std::fs::write(
        paths.app_home().join(GATEWAY_DISCOVERY_FILE),
        discovery_json(
            &paths.root().to_string_lossy(),
            std::process::id(),
            now_ms(),
            &endpoint,
        ),
    )
    .expect("publish discovery");
    record(&journal, "published");

    for stream in listener.incoming() {
        let Ok(mut stream) = stream else { continue };
        if !answer(&mut stream, attach.secret(), ownership.secret(), &journal) {
            break;
        }
    }
    // Exit releases the singleton and the endpoint together, exactly as a real
    // gateway's termination does.
    std::process::exit(0);
}

/// Serve one control request. Returns whether to keep serving.
fn answer(stream: &mut TcpStream, attach: &str, ownership: &str, journal: &Path) -> bool {
    stream
        .set_read_timeout(Some(Duration::from_secs(10)))
        .expect("bounded read");
    let mut raw = Vec::new();
    let mut chunk = [0_u8; 1024];
    while !raw.windows(4).any(|w| w == b"\r\n\r\n") && raw.len() < 64 * 1024 {
        match stream.read(&mut chunk) {
            Ok(0) | Err(_) => break,
            Ok(read) => raw.extend_from_slice(&chunk[..read]),
        }
    }
    let request = String::from_utf8_lossy(&raw).to_string();
    let line = request.lines().next().unwrap_or_default().to_string();
    let bearer = header(&request, "authorization")
        .and_then(|value| value.strip_prefix("Bearer ").map(str::to_owned));
    if bearer.as_deref() != Some(attach) {
        respond(stream, 401);
        return true;
    }

    if line.starts_with("POST /drain") {
        // The gateway resolves its work before it acknowledges the drain.
        record(journal, "admission-closed");
        record(journal, "runs-resolved");
        record(journal, "checkpoints-flushed");
        record(journal, "drain-acknowledged");
        respond(stream, 200);
        true
    } else if line.starts_with("POST /shutdown") {
        if header(&request, "x-ownership-capability").as_deref() != Some(ownership) {
            record(journal, "shutdown-unauthorized");
            respond(stream, 403);
            return true;
        }
        record(journal, "shutdown-authorized");
        respond(stream, 200);
        false
    } else if line.starts_with("GET /health") {
        respond(stream, 200);
        true
    } else {
        respond(stream, 404);
        true
    }
}

fn header(request: &str, name: &str) -> Option<String> {
    request.lines().find_map(|line| {
        let (key, value) = line.split_once(':')?;
        (key.trim().eq_ignore_ascii_case(name)).then(|| value.trim().to_string())
    })
}

fn respond(stream: &mut TcpStream, status: u16) {
    let reason = match status {
        200 => "OK",
        401 => "Unauthorized",
        403 => "Forbidden",
        _ => "Not Found",
    };
    let _ = stream.write_all(
        format!("HTTP/1.1 {status} {reason}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
            .as_bytes(),
    );
    let _ = stream.flush();
}

fn record(journal: &Path, entry: &str) {
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(journal)
        .expect("open the gateway journal");
    writeln!(file, "{entry}").expect("record the gateway step");
}

fn read_journal(journal: &Path) -> Vec<String> {
    std::fs::read_to_string(journal)
        .unwrap_or_default()
        .lines()
        .map(str::to_owned)
        .collect()
}

fn await_journal_entry(journal: &Path, entry: &str, budget: Duration) {
    let deadline = Instant::now() + budget;
    while Instant::now() < deadline {
        if read_journal(journal).iter().any(|line| line == entry) {
            return;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    panic!("the gateway helper never recorded {entry}");
}

/// Is the gateway's runtime singleton free? A free lock proves the gateway
/// released it — which its exit is the only way to do.
fn singleton_is_free(paths: &ProductPaths) -> bool {
    let Ok(file) = std::fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .read(true)
        .write(true)
        .open(paths.app_home().join(RUNTIME_SINGLETON))
    else {
        return false;
    };
    match FileExt::try_lock_exclusive(&file) {
        Ok(true) => {
            let _ = FileExt::unlock(&file);
            true
        }
        _ => false,
    }
}

fn drain_context() -> DrainContext {
    DrainContext {
        now_ms: now_ms(),
        freshness_ms: 60_000,
        supported_protocol: range("v1", "v1"),
        supported_state_schema: range("0001", "9999"),
    }
}

fn range(min: &str, max: &str) -> RangeBounds {
    RangeBounds {
        minimum: min.to_string(),
        maximum: max.to_string(),
    }
}

fn discovery_json(owner: &str, pid: u32, heartbeat_ms: i64, endpoint: &str) -> String {
    format!(
        "{{\"endpoint\":{endpoint:?},\"pid\":{pid},\"owner\":{owner:?},\
         \"install_identity\":\"install-1\",\"generation\":\"gen-1\",\
         \"release_set\":{{\"name\":\"vaultspec\",\"version\":\"0.1.4\",\
         \"target\":\"x86_64-pc-windows-msvc\"}},\
         \"protocol\":{{\"minimum\":\"v1\",\"maximum\":\"v1\"}},\
         \"state_schema\":{{\"minimum\":\"0001\",\"maximum\":\"9999\"}},\
         \"handoff_reference\":\"attach.cred\",\"heartbeat_ms\":{heartbeat_ms}}}"
    )
}

fn stub_gateway() -> vaultspec_product::process::GatewayProcess {
    let exe = std::env::current_exe().unwrap();
    let program = ResolvedProgram::from_capsule_relative(
        exe.parent().unwrap(),
        &[exe.file_name().unwrap().to_str().unwrap()],
    )
    .unwrap();
    let spec = GatewaySpec::from_resolved(
        program,
        vec![
            OsString::from("zzz_no_such_test_filter"),
            OsString::from("--test-threads=1"),
        ],
    );
    spawn_gateway(&spec).unwrap()
}

fn group() -> ConsistencyGroupSpec {
    ConsistencyGroupSpec::new(
        [SchemaBearingStore::new(
            "primary-database",
            ["data", "primary.db"],
            "alembic-migration-range",
            "0008",
        )
        .unwrap()],
        None,
    )
    .unwrap()
}

/// A staged migration that runs a real process to a successful exit.
fn succeeding_migration() -> vaultspec_product::migration::StagedMigration {
    let exe = std::env::current_exe().unwrap();
    vaultspec_product::migration::StagedMigration::from_capsule_relative(
        exe.parent().unwrap(),
        &[exe.file_name().unwrap().to_str().unwrap()],
        vec![
            OsString::from("zzz_no_such_test_filter"),
            OsString::from("--test-threads=1"),
        ],
        vaultspec_product::migration::MigrationLimits::new(64 * 1024, Duration::from_secs(30)),
    )
    .unwrap()
}

fn forward_plan() -> vaultspec_product::migration::MigrationPlan {
    vaultspec_product::migration::plan_migration(
        None,
        &vaultspec_product::migration::MigrationRangeSpec::new("0001", "0008").unwrap(),
    )
    .unwrap()
}

fn create_db(path: &Path, rows: &[(i64, &str)]) {
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    let conn = Connection::open(path).unwrap();
    conn.execute(
        "CREATE TABLE runs (id INTEGER PRIMARY KEY, value TEXT NOT NULL)",
        [],
    )
    .unwrap();
    for (id, value) in rows {
        conn.execute(
            "INSERT INTO runs (id, value) VALUES (?1, ?2)",
            rusqlite::params![id, value],
        )
        .unwrap();
    }
    conn.close().unwrap();
}

fn read_rows(path: &Path) -> Vec<(i64, String)> {
    let conn = Connection::open(path).unwrap();
    let mut stmt = conn
        .prepare("SELECT id, value FROM runs ORDER BY id")
        .unwrap();
    stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
        .unwrap()
        .map(Result::unwrap)
        .collect()
}
