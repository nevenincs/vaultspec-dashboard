//! The single-app-runtime boot matrix (plan W02.P04.S15), driven over the
//! REAL binary (`CARGO_BIN_EXE_vaultspec`) because the seat is an OS-level
//! per-process lock: in-process tests share one pid and cannot exercise
//! conflict or takeover. Every test isolates its own machine app home via
//! `VAULTSPEC_APP_HOME`, so concurrent test runs and the developer's real
//! `~/.vaultspec` never interact.

use std::io::Read as _;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

use rag_client::client::{LoopbackTransport, RagTransport};
use serde_json::Value;

const BIN: &str = env!("CARGO_BIN_EXE_vaultspec");
const BOOT_WAIT: Duration = Duration::from_secs(30);

struct HomeGuard {
    dir: tempfile::TempDir,
}

impl HomeGuard {
    fn new() -> Self {
        Self {
            dir: tempfile::tempdir().expect("temp app home"),
        }
    }
    fn path(&self) -> &Path {
        self.dir.path()
    }
    fn discovery(&self) -> PathBuf {
        self.dir.path().join("service.json")
    }
    fn read_discovery(&self) -> Option<Value> {
        let raw = std::fs::read_to_string(self.discovery()).ok()?;
        serde_json::from_str(&raw).ok()
    }
}

/// A child serve that is ALWAYS killed on drop so a failing assertion never
/// leaks a resident process into the test host.
struct ServeChild(Child);

impl Drop for ServeChild {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn free_port() -> u16 {
    // Bind-then-drop: a tiny race window, tolerated in tests (the port was
    // free milliseconds ago and each test uses its own).
    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("probe port");
    listener.local_addr().expect("addr").port()
}

fn spawn_seated(home: &Path, cwd: &Path, port: u16) -> ServeChild {
    let child = Command::new(BIN)
        .args(["serve", "--port", &port.to_string()])
        .env("VAULTSPEC_APP_HOME", home)
        .current_dir(cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn serve");
    ServeChild(child)
}

fn wait_for_discovery(home: &HomeGuard, pid: u32) -> Value {
    let begun = Instant::now();
    while begun.elapsed() < BOOT_WAIT {
        if let Some(v) = home.read_discovery()
            && v.get("pid").and_then(Value::as_u64) == Some(u64::from(pid))
        {
            return v;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    panic!("seat (pid {pid}) did not publish discovery within {BOOT_WAIT:?}");
}

fn transport(v: &Value, with_token: bool) -> LoopbackTransport {
    LoopbackTransport {
        port: u16::try_from(v["port"].as_u64().expect("port")).expect("port range"),
        bearer: with_token.then(|| v["service_token"].as_str().expect("token").to_string()),
        timeout: Duration::from_secs(5),
    }
}

/// Workspace-less SEATED boot (D4): boots the onboarding surface (bootstrap
/// root), publishes machine discovery, serves an EMPTY workspace registry as
/// the first-run signal, and never registers the bootstrap as a workspace.
/// Then the bearer-gated `/shutdown` drains gracefully and RETRACTS the
/// discovery file (D5).
#[test]
fn workspace_less_boot_serves_onboarding_then_shuts_down_clean() {
    let home = HomeGuard::new();
    let nowhere = tempfile::tempdir().expect("non-workspace dir");
    let port = free_port();
    let child = spawn_seated(home.path(), nowhere.path(), port);
    let disc = wait_for_discovery(&home, child.0.id());

    // Discovery reaches the READY lifecycle state once the wire serves
    // (single-app-runtime S23; the transient `starting` record precedes it).
    let begun = Instant::now();
    loop {
        if home.read_discovery().and_then(|v| v.get("state").cloned())
            == Some(Value::String("ready".into()))
        {
            break;
        }
        assert!(
            begun.elapsed() < BOOT_WAIT,
            "discovery never reached the ready state"
        );
        std::thread::sleep(Duration::from_millis(100));
    }

    // Bootstrap root exists, engine-owned, under the app home.
    assert!(
        home.path().join("bootstrap/.vault").is_dir(),
        "bootstrap scratch corpus exists"
    );
    // Empty registry = the SPA's first-run signal; the bootstrap is NOT a row.
    let body = transport(&disc, true)
        .get("/workspaces")
        .expect("workspaces");
    let v: Value = serde_json::from_str(&body).expect("json");
    assert_eq!(
        v["data"]["workspaces"].as_array().map(Vec::len),
        Some(0),
        "first-run registry is empty: {v}"
    );
    // An unauthenticated shutdown is refused (bearer-gated).
    assert!(
        transport(&disc, false)
            .post_json("/shutdown", "{}")
            .is_err(),
        "tokenless shutdown must be refused"
    );
    // The bearer-gated shutdown acknowledges, the process exits, and the
    // discovery file is retracted.
    transport(&disc, true)
        .post_json("/shutdown", "{}")
        .expect("graceful shutdown acknowledged");
    let mut child = child;
    let begun = Instant::now();
    loop {
        if let Ok(Some(status)) = child.0.try_wait() {
            assert!(status.success(), "graceful exit is success: {status}");
            break;
        }
        assert!(
            begun.elapsed() < BOOT_WAIT,
            "serve did not exit after /shutdown"
        );
        std::thread::sleep(Duration::from_millis(200));
    }
    assert!(
        !home.discovery().exists(),
        "discovery retracted on clean exit"
    );
}

/// Seat conflict (D1): a second SEATED serve against the same app home fails
/// loud, names the running seat, and exits non-zero without disturbing the
/// first seat's discovery.
#[test]
fn second_seated_serve_fails_loud_and_takeover_follows_death() {
    let home = HomeGuard::new();
    let nowhere = tempfile::tempdir().expect("non-workspace dir");
    let port_a = free_port();
    let a = spawn_seated(home.path(), nowhere.path(), port_a);
    let disc_a = wait_for_discovery(&home, a.0.id());

    // Conflict: same home, different port — refused with the seat named.
    let port_b = free_port();
    let mut b = spawn_seated(home.path(), nowhere.path(), port_b);
    let status_b = b.0.wait().expect("b exits");
    let mut stderr_b = String::new();
    let _ =
        b.0.stderr
            .take()
            .map(|mut s| s.read_to_string(&mut stderr_b));
    assert!(
        !status_b.success(),
        "second seated serve must exit non-zero"
    );
    assert!(
        stderr_b.contains("already running"),
        "conflict names the running seat: {stderr_b}"
    );
    // The first seat's discovery is untouched by the refused boot.
    assert_eq!(
        home.read_discovery().and_then(|v| v.get("pid").cloned()),
        disc_a.get("pid").cloned(),
        "conflict must not disturb the live seat's discovery"
    );

    // Dead-pid takeover: kill A hard (no cleanup), then a new seat acquires
    // the freed OS lock and REPLACES the stale discovery.
    let mut a = a;
    a.0.kill().expect("hard kill");
    let _ = a.0.wait();
    let port_c = free_port();
    let c = spawn_seated(home.path(), nowhere.path(), port_c);
    let disc_c = wait_for_discovery(&home, c.0.id());
    assert_ne!(
        disc_a["pid"], disc_c["pid"],
        "takeover republishes discovery under the new seat"
    );
}

/// A seat held in the `starting` state (indexing; wire not yet up) is
/// DISTINGUISHABLE and STOPPABLE (single-app-runtime S23 + review M2):
/// discovery says `starting` with a live pid, and `vaultspec stop`
/// terminates it via the pid fallback instead of claiming "not running".
#[test]
fn a_starting_seat_is_distinguishable_and_stoppable() {
    let home = HomeGuard::new();
    let nowhere = tempfile::tempdir().expect("non-workspace dir");
    let port = free_port();
    let child = Command::new(BIN)
        .args(["serve", "--port", &port.to_string()])
        .env("VAULTSPEC_APP_HOME", home.path())
        // Hold the boot in `starting` long enough to observe + stop it.
        .env("VAULTSPEC_TEST_BOOT_DELAY_MS", "20000")
        .current_dir(nowhere.path())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn serve");
    let child = ServeChild(child);
    let disc = wait_for_discovery(&home, child.0.id());
    assert_eq!(
        disc.get("state").and_then(Value::as_str),
        Some("starting"),
        "the pre-index record says starting: {disc}"
    );
    // stop() must terminate the starting seat via the pid fallback (the
    // graceful wire door does not exist yet) and say so honestly.
    let out = Command::new(BIN)
        .args(["stop", "--json"])
        .env("VAULTSPEC_APP_HOME", home.path())
        .output()
        .expect("run stop");
    assert!(out.status.success(), "stop exits 0");
    let v: Value = serde_json::from_slice(&out.stdout).expect("stop emits a JSON envelope");
    assert_eq!(v["data"]["stopped"], true, "stopped: {v}");
    assert_eq!(
        v["data"]["graceful"], false,
        "a starting seat is stopped via the pid fallback: {v}"
    );
    // The process is genuinely gone.
    let mut child = child;
    let begun = Instant::now();
    loop {
        if let Ok(Some(_)) = child.0.try_wait() {
            break;
        }
        assert!(begun.elapsed() < BOOT_WAIT, "starting seat did not die");
        std::thread::sleep(Duration::from_millis(200));
    }
}

/// The exemptions stay airtight (D1): an exempt serve in a NON-workspace dir
/// keeps the historical fail-loud contract (no bootstrap boot), and an
/// exempt serve never writes machine discovery.
#[test]
fn exempt_serves_keep_the_historical_contract_and_write_no_machine_discovery() {
    let home = HomeGuard::new();
    let nowhere = tempfile::tempdir().expect("non-workspace dir");
    // --port 0 (the sanctioned test port) outside a workspace: fail-loud,
    // exactly the pre-seat behavior the harness asserts.
    let out = Command::new(BIN)
        .args(["serve", "--port", "0"])
        .env("VAULTSPEC_APP_HOME", home.path())
        .current_dir(nowhere.path())
        .output()
        .expect("run serve --port 0");
    assert!(
        !out.status.success(),
        "exempt serve outside a workspace fails"
    );
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(
        stderr.contains("not inside a git workspace"),
        "historical error preserved: {stderr}"
    );
    assert!(
        !home.discovery().exists(),
        "exempt serve wrote no machine discovery"
    );
    assert!(
        !home.path().join("bootstrap").exists(),
        "exempt serve never bootstraps"
    );
}
