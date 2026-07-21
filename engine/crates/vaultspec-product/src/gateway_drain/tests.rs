use super::*;
use crate::credentials::CredentialRole;
use crate::discovery::ReleaseSetRef;
use crate::locking::{Actor, InstallLock};
use crate::manifest::Target;
use crate::paths::ProductPaths;
use crate::process::{GatewaySpec, spawn_gateway};
use std::ffi::OsString;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::mpsc;
use std::time::Duration;

struct Fixture {
    _dir: tempfile::TempDir,
    paths: ProductPaths,
    guard: crate::locking::InstallLockGuard,
}

impl Fixture {
    fn new() -> Self {
        let dir = tempfile::tempdir().expect("temp product root");
        let paths = ProductPaths::under_app_home(dir.path());
        paths.ensure().expect("product layout");
        let guard = InstallLock::new(paths.install_lock_path())
            .acquire(Actor::CopiedUpdater, "gateway-drain-test")
            .expect("lock io")
            .expect("lock free");
        Self {
            _dir: dir,
            paths,
            guard,
        }
    }

    fn our_owner(&self) -> String {
        self.paths.root().to_string_lossy().to_string()
    }

    fn write_discovery(&self, raw: &str) {
        std::fs::write(self.paths.app_home().join(DISCOVERY_FILE), raw)
            .expect("write discovery record");
    }
}

fn range(min: &str, max: &str) -> RangeBounds {
    RangeBounds {
        minimum: min.to_string(),
        maximum: max.to_string(),
    }
}

fn context() -> DrainContext {
    DrainContext {
        now_ms: 1_000_000,
        freshness_ms: 60_000,
        supported_protocol: range("v1", "v1"),
        supported_state_schema: range("0001", "9999"),
    }
}

fn discovery_record(owner: &str, endpoint: &str, pid: u32, heartbeat_ms: i64) -> String {
    serde_json::to_string(&GatewayDiscovery {
        endpoint: endpoint.to_string(),
        pid,
        owner: owner.to_string(),
        install_identity: "install-1".to_string(),
        generation: "gen-1".to_string(),
        release_set: ReleaseSetRef {
            name: "vaultspec".to_string(),
            version: "0.1.4".to_string(),
            target: Target::X86_64UnknownLinuxGnu,
        },
        protocol: range("v1", "v1"),
        state_schema: range("0001", "9999"),
        handoff_reference: "/nonexistent/attach.cred".to_string(),
        heartbeat_ms,
    })
    .expect("serialize discovery")
}

fn deadlines() -> DrainDeadlines {
    DrainDeadlines::new(
        Duration::from_secs(5),
        Duration::from_secs(5),
        Duration::from_millis(25),
    )
    .expect("valid deadlines")
}

#[test]
fn deadlines_refuse_zero_oversized_and_inconsistent_values() {
    assert!(matches!(
        DrainDeadlines::new(
            Duration::ZERO,
            Duration::from_secs(1),
            Duration::from_millis(10)
        ),
        Err(GatewayDrainError::InvalidDeadlines(_))
    ));
    assert!(matches!(
        DrainDeadlines::new(
            Duration::from_secs(1),
            Duration::from_secs(11 * 60),
            Duration::from_millis(10)
        ),
        Err(GatewayDrainError::InvalidDeadlines(_))
    ));
    assert!(matches!(
        DrainDeadlines::new(
            Duration::from_secs(1),
            Duration::from_secs(1),
            Duration::from_secs(2)
        ),
        Err(GatewayDrainError::InvalidDeadlines(_))
    ));
}

#[test]
fn absent_discovery_is_a_typed_refusal_never_assumed_quiescence() {
    let fixture = Fixture::new();
    let error = OwnedGatewayLease::acquire(&fixture.paths, &fixture.guard, &context()).unwrap_err();
    assert!(matches!(error, GatewayDrainError::DiscoveryAbsent));
}

#[test]
fn secret_bearing_discovery_is_refused_before_anything_else() {
    let fixture = Fixture::new();
    fixture.write_discovery(&format!(
        "{{\"token\":\"deadbeef\",{}",
        &discovery_record(&fixture.our_owner(), "127.0.0.1:1", 1, 1_000_000)[1..]
    ));
    let error = OwnedGatewayLease::acquire(&fixture.paths, &fixture.guard, &context()).unwrap_err();
    assert!(matches!(
        error,
        GatewayDrainError::Discovery(DiscoveryError::SecretBearing { .. })
    ));
}

#[test]
fn a_foreign_gateway_is_never_drainable() {
    let fixture = Fixture::new();
    // A live, fresh foreign record: our own pid is certainly alive.
    fixture.write_discovery(&discovery_record(
        "someone-else",
        "127.0.0.1:1",
        std::process::id(),
        1_000_000,
    ));
    let error = OwnedGatewayLease::acquire(&fixture.paths, &fixture.guard, &context()).unwrap_err();
    assert!(matches!(error, GatewayDrainError::ForeignGateway));
}

#[test]
fn a_stale_owned_gateway_is_the_quarantine_flow_not_a_drain() {
    let fixture = Fixture::new();
    // Ours, live pid, but the heartbeat is far outside the freshness window.
    fixture.write_discovery(&discovery_record(
        &fixture.our_owner(),
        "127.0.0.1:1",
        std::process::id(),
        1,
    ));
    let error = OwnedGatewayLease::acquire(&fixture.paths, &fixture.guard, &context()).unwrap_err();
    assert!(matches!(error, GatewayDrainError::NotLive));
}

#[test]
fn an_incompatible_owned_gateway_is_refused_typed() {
    let fixture = Fixture::new();
    fixture.write_discovery(&discovery_record(
        &fixture.our_owner(),
        "127.0.0.1:1",
        std::process::id(),
        1_000_000,
    ));
    let mut ctx = context();
    ctx.supported_protocol = range("v2", "v2");
    let error = OwnedGatewayLease::acquire(&fixture.paths, &fixture.guard, &ctx).unwrap_err();
    assert!(matches!(error, GatewayDrainError::Incompatible));
}

#[test]
fn a_foreign_guard_is_refused_before_discovery_is_read() {
    let fixture = Fixture::new();
    let other = Fixture::new();
    let error = OwnedGatewayLease::acquire(&fixture.paths, &other.guard, &context()).unwrap_err();
    assert!(matches!(error, GatewayDrainError::LockAuthority(_)));
}

#[cfg(windows)]
#[test]
fn windows_credential_gate_fails_closed_after_owned_live_classification() {
    // Classification passes (ours, live, fresh, compatible), then the product
    // credential authority refuses typed — the windows-private-file-authority
    // gate holds until real NTFS acceptance evidence retires it.
    let fixture = Fixture::new();
    fixture.write_discovery(&discovery_record(
        &fixture.our_owner(),
        "127.0.0.1:1",
        std::process::id(),
        1_000_000,
    ));
    let error = OwnedGatewayLease::acquire(&fixture.paths, &fixture.guard, &context()).unwrap_err();
    assert!(matches!(error, GatewayDrainError::Credential(_)));
}

/// A real loopback control server for a fixed number of sequential
/// connections. The handler sees each raw request and returns the raw
/// response; this is a REAL socket server, never a mock of the wire.
fn serve_connections(
    count: usize,
    handler: impl Fn(usize, &[u8]) -> Vec<u8> + Send + 'static,
) -> (String, std::thread::JoinHandle<Vec<String>>) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("loopback listener");
    let addr = listener.local_addr().expect("bound address");
    let handle = std::thread::spawn(move || {
        let mut seen = Vec::new();
        for index in 0..count {
            let Ok((mut sock, _)) = listener.accept() else {
                break;
            };
            let _ = sock.set_read_timeout(Some(Duration::from_secs(10)));
            let mut buf = [0u8; 4096];
            let n = sock.read(&mut buf).unwrap_or(0);
            seen.push(String::from_utf8_lossy(&buf[..n]).into_owned());
            let _ = sock.write_all(&handler(index, &buf[..n]));
        }
        seen
    });
    (format!("127.0.0.1:{}", addr.port()), handle)
}

fn sleeper_child() -> crate::process::GatewayProcess {
    let exe = std::env::current_exe().expect("test executable");
    let spec = GatewaySpec::from_program_unchecked(
        exe,
        vec![
            OsString::from("gateway_drain_sleeper_process"),
            OsString::from("--nocapture"),
            OsString::from("--test-threads=1"),
        ],
    )
    .with_env("GATEWAY_DRAIN_SLEEPER", "1");
    spawn_gateway(&spec).expect("spawn sleeper child")
}

/// Self-exec sleeper: under a normal `cargo test` run (no env) it is a no-op;
/// as the spawned child it sleeps well past every deadline in this module so
/// only an explicit termination ends it.
#[test]
fn gateway_drain_sleeper_process() {
    if std::env::var("GATEWAY_DRAIN_SLEEPER").is_err() {
        return;
    }
    std::thread::sleep(Duration::from_secs(120));
}

#[test]
fn the_drive_drains_stops_and_proves_exit_through_the_real_control_plane() {
    let (killed_tx, killed_rx) = mpsc::channel::<crate::process::GatewayProcess>();
    let (endpoint, handle) = serve_connections(2, move |index, request| {
        let request = String::from_utf8_lossy(request).into_owned();
        match index {
            0 => {
                assert!(request.starts_with("POST /drain "), "first call drains");
                b"HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: 0\r\n\r\n".to_vec()
            }
            _ => {
                assert!(request.starts_with("POST /shutdown "), "second call stops");
                // Honor the authorized shutdown: terminate the real child the
                // way a cooperating gateway would exit.
                let mut child = killed_rx.recv().expect("child handle");
                child
                    .terminate_tree(Duration::from_millis(200))
                    .expect("terminate child");
                b"HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n".to_vec()
            }
        }
    });
    let child = sleeper_child();
    let pid = child.pid();
    assert!(process_is_alive(pid));
    killed_tx.send(child).expect("hand child to the server");

    let ownership = Credential::from_validated(CredentialRole::Ownership, "a".repeat(64));
    let client = ControlClient::new(endpoint, "attach-token");
    let evidence = drive_drain_stop(&client, &ownership, pid, deadlines()).expect("proven stop");
    assert_eq!(evidence.pid, pid);
    assert!(!process_is_alive(pid));

    let seen = handle.join().expect("server thread");
    assert_eq!(seen.len(), 2);
    assert!(
        seen[1].contains(&format!("X-Ownership-Capability: {}", "a".repeat(64))),
        "the stop must carry the ownership capability"
    );
}

#[test]
fn a_gateway_that_outlives_the_deadline_is_a_typed_stop_timeout_never_a_kill() {
    let (endpoint, handle) = serve_connections(2, |_, _| {
        b"HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: 0\r\n\r\n".to_vec()
    });
    let mut child = sleeper_child();
    let pid = child.pid();
    assert!(process_is_alive(pid));

    let ownership = Credential::from_validated(CredentialRole::Ownership, "b".repeat(64));
    let client = ControlClient::new(endpoint, "attach-token");
    let tight = DrainDeadlines::new(
        Duration::from_secs(5),
        Duration::from_millis(150),
        Duration::from_millis(25),
    )
    .expect("valid deadlines");
    let error = drive_drain_stop(&client, &ownership, pid, tight).unwrap_err();
    assert!(matches!(error, GatewayDrainError::StopTimeout { pid: p } if p == pid));
    // No force-kill happened: the child is still alive until WE terminate it.
    assert!(process_is_alive(pid));
    child
        .terminate_tree(Duration::from_millis(200))
        .expect("cleanup child");
    handle.join().expect("server thread");
}

#[cfg(unix)]
#[test]
fn the_transaction_mints_quiescence_only_after_a_proven_discovered_stop() {
    use crate::receipt::{Channel, InterruptionMarker};
    use crate::transaction::{UpdatePlan, UpdateTransaction};

    let fixture = Fixture::new();
    // Real product credentials so the lease can assemble authority.
    let pending = DashboardCredentialStore::for_product(&fixture.paths)
        .begin_bootstrap(&fixture.guard)
        .expect("bootstrap credentials");
    let attach_secret = pending.attach_control().secret().to_owned();
    let ownership_secret = pending.ownership().secret().to_owned();

    let (killed_tx, killed_rx) = mpsc::channel::<crate::process::GatewayProcess>();
    let expected_ownership = ownership_secret.clone();
    let expected_attach = attach_secret.clone();
    let (endpoint, handle) = serve_connections(2, move |index, request| {
        let request = String::from_utf8_lossy(request).into_owned();
        assert!(
            request.contains(&format!("Authorization: Bearer {expected_attach}")),
            "every control call authenticates with the attach token"
        );
        match index {
            0 => b"HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: 0\r\n\r\n".to_vec(),
            _ => {
                assert!(
                    request.contains(&format!("X-Ownership-Capability: {expected_ownership}")),
                    "the stop carries the receipt-bound ownership capability"
                );
                let mut child = killed_rx.recv().expect("child handle");
                child
                    .terminate_tree(Duration::from_millis(200))
                    .expect("terminate child");
                b"HTTP/1.1 204 No Content\r\nConnection: close\r\n\r\n".to_vec()
            }
        }
    });
    let child = sleeper_child();
    let pid = child.pid();
    killed_tx.send(child).expect("hand child to the server");
    fixture.write_discovery(&discovery_record(
        &fixture.our_owner(),
        &endpoint,
        pid,
        1_000_000,
    ));

    let lease = OwnedGatewayLease::acquire(&fixture.paths, &fixture.guard, &context())
        .expect("owned-live lease");
    let plan = UpdatePlan::new(7, "cand-1", None, Channel::SelfInstall, "head-1")
        .expect("valid update plan");
    let mut txn =
        UpdateTransaction::begin(fixture.paths.clone(), &fixture.guard, plan).expect("begin");
    let (quiescence, evidence) = txn
        .drain_and_stop_discovered(lease, deadlines())
        .expect("proven discovered stop");
    assert_eq!(txn.phase(), InterruptionMarker::Draining);
    assert_eq!(evidence.pid, pid);
    assert!(!process_is_alive(pid));
    // The witness is real: the staged migration path accepts it (type-level).
    let _: &crate::migration::Quiescence = &quiescence;

    // Re-acquiring after the stop refuses: the gateway is provably gone, so
    // there is nothing left to drain.
    let error = OwnedGatewayLease::acquire(&fixture.paths, &fixture.guard, &context()).unwrap_err();
    assert!(matches!(error, GatewayDrainError::NotLive));
    drop(txn);
    handle.join().expect("server thread");
}

#[test]
fn a_record_free_product_mints_cold_quiescence_inside_the_transaction() {
    use crate::receipt::{Channel, InterruptionMarker};
    use crate::transaction::{UpdatePlan, UpdateTransaction};

    let fixture = Fixture::new();
    let plan = UpdatePlan::new(3, "cand-cold", None, Channel::SelfInstall, "head-cold")
        .expect("valid update plan");
    let mut txn =
        UpdateTransaction::begin(fixture.paths.clone(), &fixture.guard, plan).expect("begin");
    let quiescence = txn.assert_cold_stopped().expect("provably cold product");
    assert_eq!(txn.phase(), InterruptionMarker::Draining);
    // The witness is the same type the migration path requires.
    let _: crate::migration::Quiescence = quiescence;
}

#[test]
fn a_discoverable_gateway_refuses_the_cold_path_typed() {
    use crate::receipt::Channel;
    use crate::transaction::{TransactionError, UpdatePlan, UpdateTransaction};

    let fixture = Fixture::new();
    // ANY present record refuses — even a stale foreign one: a discoverable
    // gateway is drained or quarantined, never assumed stopped.
    fixture.write_discovery(&discovery_record("someone-else", "127.0.0.1:1", 1, 1));
    let plan = UpdatePlan::new(3, "cand-cold", None, Channel::SelfInstall, "head-cold")
        .expect("valid update plan");
    let mut txn =
        UpdateTransaction::begin(fixture.paths.clone(), &fixture.guard, plan).expect("begin");
    let error = txn
        .assert_cold_stopped()
        .expect_err("present record refuses");
    assert!(matches!(
        error,
        TransactionError::Gateway(GatewayDrainError::GatewayDiscoverable)
    ));
}

/// Create a file symlink on either platform, the repo's reparse-point test
/// idiom (real reparse point, no mock).
#[cfg(unix)]
fn plant_file_symlink(target: &Path, link: &Path) {
    std::os::unix::fs::symlink(target, link).unwrap();
}

#[cfg(windows)]
fn plant_file_symlink(target: &Path, link: &Path) {
    std::os::windows::fs::symlink_file(target, link).unwrap();
}

#[test]
fn bounded_discovery_read_accepts_a_regular_record_and_reports_absence() {
    let fixture = Fixture::new();
    let path = fixture.paths.app_home().join(DISCOVERY_FILE);
    assert!(matches!(
        read_bounded_discovery(&path),
        Err(GatewayDrainError::DiscoveryAbsent)
    ));
    fixture.write_discovery("{\"a\":1}");
    assert_eq!(read_bounded_discovery(&path).unwrap(), "{\"a\":1}");
}

#[test]
fn bounded_discovery_read_refuses_a_planted_reparse_point() {
    let fixture = Fixture::new();
    // A real record the traversal would have reached had the read followed.
    let target = fixture.paths.app_home().join("planted-discovery.json");
    std::fs::write(&target, "{\"planted\":true}").unwrap();
    let path = fixture.paths.app_home().join(DISCOVERY_FILE);
    plant_file_symlink(&target, &path);
    // The planted link IS traversable: a following read reaches the attacker's
    // record. That is exactly what the no-follow read must refuse to do.
    assert_eq!(
        std::fs::read_to_string(&path).unwrap(),
        "{\"planted\":true}"
    );
    // Unreadable, never traversed, and never the absent verdict — the cold-path
    // predicate must not read a planted link as "no gateway".
    assert!(matches!(
        read_bounded_discovery(&path),
        Err(GatewayDrainError::DiscoveryUnreadable(_))
    ));
    assert!(matches!(
        require_discovery_absent(&fixture.paths),
        Err(GatewayDrainError::DiscoveryUnreadable(_))
    ));
}

#[test]
fn bounded_discovery_read_refuses_one_byte_over_the_cap() {
    let fixture = Fixture::new();
    let path = fixture.paths.app_home().join(DISCOVERY_FILE);
    std::fs::write(
        &path,
        vec![b'x'; usize::try_from(MAX_DISCOVERY_BYTES).unwrap() + 1],
    )
    .unwrap();
    assert!(matches!(
        read_bounded_discovery(&path),
        Err(GatewayDrainError::DiscoveryUnreadable(_))
    ));
}
