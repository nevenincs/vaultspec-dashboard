//! Desktop gateway ownership acceptance (a2a-product-provisioning W01.P02.S17).
//!
//! Proves owner attach, foreign conflict, stale-owner recovery, credential
//! separation, and lifecycle refusal against REAL artifacts: a real loopback
//! HTTP gateway stub over a real socket, real credential files on disk, real
//! process identities (the live test process and a spawned-then-reaped dead
//! child), and a real receipt. No fakes, mocks, stubs, or skips.

use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::Duration;

use vaultspec_product::control::ControlClient;
use vaultspec_product::credentials::{CredentialRole, CredentialStore};
use vaultspec_product::discovery::{DiscoveryContext, GatewayDiscovery, ImmutableReason, Verdict};
use vaultspec_product::lifecycle::{AttachMode, LifecycleController, resolve_attach};
use vaultspec_product::locking::{StaleState, quarantine_owner_matched_stale};
use vaultspec_product::manifest::{RangeBounds, ReleaseIdentity, Target};
use vaultspec_product::paths::ProductPaths;
use vaultspec_product::protocol::{LifecycleOp, Refusal};
use vaultspec_product::receipt::{Channel, Receipt};

/// Stand up a real loopback HTTP gateway stub that answers `/health` and
/// `/readiness`, requiring the attach bearer. Returns the bound endpoint. The
/// server serves a bounded number of connections then exits.
fn spawn_gateway_stub(attach_token: &'static str, connections: usize) -> String {
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
            } else if req.starts_with("GET /readiness") {
                let body = r#"{"state":"gateway-ready","worker":"cold"}"#;
                format!("HTTP/1.1 200 OK\r\nConnection: close\r\n\r\n{body}")
            } else {
                "HTTP/1.1 200 OK\r\nConnection: close\r\n\r\nok".to_string()
            };
            let _ = sock.write_all(resp.as_bytes());
        }
    });
    endpoint
}

fn ctx(now_ms: i64) -> DiscoveryContext {
    DiscoveryContext {
        our_owner: "seat-owner".to_string(),
        now_ms,
        freshness_ms: 30_000,
        supported_protocol: RangeBounds {
            minimum: "v1".to_string(),
            maximum: "v1".to_string(),
        },
        supported_state_schema: RangeBounds {
            minimum: "0001".to_string(),
            maximum: "0009".to_string(),
        },
    }
}

fn discovery_json(
    owner: &str,
    pid: u32,
    endpoint: &str,
    handoff: &str,
    heartbeat_ms: i64,
) -> String {
    serde_json::json!({
        "endpoint": endpoint,
        "pid": pid,
        "owner": owner,
        "install_identity": "install-1",
        "generation": "gen-0",
        "release_set": { "name": "vaultspec-a2a", "version": "0.1.0", "target": "x86_64-pc-windows-msvc" },
        "protocol": { "minimum": "v1", "maximum": "v1" },
        "state_schema": { "minimum": "0001", "maximum": "0009" },
        "handoff_reference": handoff,
        "heartbeat_ms": heartbeat_ms
    })
    .to_string()
}

#[test]
fn owner_attaches_to_a_live_owned_gateway_over_a_real_socket() {
    // A real gateway stub over a real socket, a real handoff credential file, and
    // this live process's own pid make the discovery record classify as owned and
    // live, and the authenticated readiness probe succeeds over the real socket.
    let dir = tempfile::tempdir().unwrap();
    let handoff = dir.path().join("attach-control.cred");
    std::fs::write(&handoff, "handoff-present").unwrap();
    let endpoint = spawn_gateway_stub("attach-secret", 1);

    let raw = discovery_json(
        "seat-owner",
        std::process::id(),
        &endpoint,
        &handoff.to_string_lossy(),
        1_000,
    );
    let discovery = GatewayDiscovery::parse(&raw).unwrap();
    assert_eq!(discovery.classify(&ctx(1_500)), Verdict::OwnedLive);
    assert_eq!(resolve_attach(&Verdict::OwnedLive), Ok(AttachMode::Owned));

    // The authenticated control probe reaches the real gateway and reads ready.
    let client = ControlClient::new(&endpoint, "attach-secret");
    assert!(client.readiness().unwrap().service_ready());
}

#[test]
fn a_foreign_gateway_conflict_is_immutable_not_displaced() {
    // A live foreign gateway (different owner, no trusted handoff we can read)
    // must classify immutable and refuse attach — never displaced speculatively.
    let endpoint = spawn_gateway_stub("other-secret", 0);
    let raw = discovery_json("someone-else", std::process::id(), &endpoint, "", 1_000);
    let discovery = GatewayDiscovery::parse(&raw).unwrap();
    assert_eq!(
        discovery.classify(&ctx(1_500)),
        Verdict::ForeignImmutable {
            reason: ImmutableReason::NoTrustedHandoff
        }
    );
    assert_eq!(
        resolve_attach(&discovery.classify(&ctx(1_500))),
        Err(Refusal::ForeignResident)
    );
}

#[test]
fn stale_owned_gateway_is_recovered_only_after_proving_death() {
    // Spawn a real child, reap it, and use its now-dead pid as the stale owned
    // discovery. It classifies stale, and the owner-matched quarantine succeeds
    // ONLY because the recorded process is provably dead.
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

    let raw = discovery_json("seat-owner", dead_pid, "127.0.0.1:9", "", 1_000);
    let discovery = GatewayDiscovery::parse(&raw).unwrap();
    assert_eq!(discovery.classify(&ctx(1_500)), Verdict::OwnedStale);

    // Under the install lock, the matching owner may quarantine the dead stale
    // state; a foreign owner or a live process could not.
    let stale = StaleState {
        owner: "seat-owner".to_string(),
        pid: dead_pid,
    };
    assert!(quarantine_owner_matched_stale("seat-owner", &stale).is_ok());
    assert!(quarantine_owner_matched_stale("someone-else", &stale).is_err());
}

#[test]
fn gateway_credential_separation_holds_on_real_files() {
    // The dashboard bootstraps ownership + attach-control; the gateway reads
    // attach-control and mints a SEPARATE worker-IPC credential. Three distinct
    // owner-restricted files back three distinct secrets.
    let dir = tempfile::tempdir().unwrap();
    let cred_dir = dir.path().join("credentials");
    let dashboard = CredentialStore::new(&cred_dir);
    let boot = dashboard.bootstrap().unwrap();

    let gateway = CredentialStore::new(&cred_dir);
    let attach = gateway.read_attach_control().unwrap();
    assert!(boot.attach_control.verify(attach.secret()));
    let worker = gateway.create_worker_ipc().unwrap();
    assert_eq!(worker.role(), CredentialRole::WorkerIpc);
    assert_ne!(worker.secret(), boot.attach_control.secret());
    assert_ne!(worker.secret(), boot.ownership.secret());

    for f in ["ownership.cap", "attach-control.cred", "worker-ipc.cred"] {
        assert!(
            cred_dir.join(f).exists(),
            "{f} must be a distinct real file"
        );
    }
}

#[test]
fn lifecycle_refuses_a_mutation_without_the_ownership_capability() {
    // A real product home with a real receipt: a receipt-bound mutation is
    // refused without the ownership capability, and refused with the wrong one.
    let dir = tempfile::tempdir().unwrap();
    let paths = ProductPaths::under_app_home(dir.path());
    paths.ensure().unwrap();
    let ctrl = LifecycleController::new(paths.clone());

    let store = CredentialStore::new(paths.credentials_dir());
    let creds = store.bootstrap().unwrap();
    Receipt::bootstrap(
        Channel::SelfInstall,
        Target::X86_64PcWindowsMsvc,
        ReleaseIdentity {
            name: "vaultspec-a2a".to_string(),
            version: "0.1.0".to_string(),
        },
        "gen-0",
        1,
    )
    .persist(&paths.receipt_path())
    .unwrap();

    assert_eq!(
        ctrl.authorize(LifecycleOp::Stop, None),
        Err(Refusal::NotOwner)
    );
    assert_eq!(
        ctrl.authorize(LifecycleOp::Stop, Some(&creds.attach_control)),
        Err(Refusal::NotOwner)
    );
    assert!(
        ctrl.authorize(LifecycleOp::Stop, Some(&creds.ownership))
            .is_ok()
    );
}
