//! Machine-lifecycle verbs (single-app-runtime D5): `stop`, `restart`, and
//! the seat block `status` renders.
//!
//! These are MACHINE verbs, not workspace verbs: they read the seat's
//! discovery file under the app home (`~/.vaultspec/`), never a workspace
//! scope, and are handled before scope resolution in `main`. Every network
//! touch is the bounded, timed loopback transport (rag-client's, reused);
//! every subprocess fallback carries the standard output cap + wall-clock
//! timeout posture.

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use rag_client::client::{LoopbackTransport, RagTransport};
use serde_json::{Value, json};
use vaultspec_product::handoff::{
    RelaunchSpec, UpdaterDescriptor, copy_updater_out, write_handoff_descriptor,
};
use vaultspec_product::paths::ProductPaths;
use vaultspec_session::app_home;

/// The product-owned external updater's file name beside the dashboard binary
/// in an installed release.
const UPDATER_NAME: &str = if cfg!(windows) {
    "vaultspec-updater.exe"
} else {
    "vaultspec-updater"
};
/// The fixed name of the one-time handoff descriptor in the transaction
/// directory. Fixed, so a second concurrent handoff is refused by the
/// create-new write rather than racing under a generated name.
const HANDOFF_DESCRIPTOR: &str = "updater-handoff.json";
/// The handoff descriptor grammar version this dashboard writes.
const HANDOFF_VERSION: u8 = 1;

/// How long `stop` waits for the seat to drain and retract discovery.
const STOP_WAIT: Duration = Duration::from_secs(10);
/// How long `restart` waits for the relaunched seat to publish discovery.
const START_WAIT: Duration = Duration::from_secs(30);
/// Loopback request budget for the shutdown/health calls.
const HTTP_TIMEOUT: Duration = Duration::from_secs(5);
/// A heartbeat older than this is stale (3 missed 15 s beats + slack).
const STALE_HEARTBEAT_MS: i64 = 50_000;

/// The parsed seat discovery file.
#[derive(Debug, Clone)]
pub struct SeatInfo {
    pub port: u16,
    pub token: String,
    pub pid: u64,
    pub last_heartbeat: i64,
    pub started_ms: Option<i64>,
    /// Lifecycle phase from discovery (single-app-runtime S23): `starting`
    /// from bind until the initial index completes, `ready` once serving.
    /// Absent on records written by older binaries.
    pub state: Option<String>,
}

/// Read the seat discovery file under the machine app home, tolerantly.
pub fn read_seat() -> Option<(PathBuf, SeatInfo)> {
    let home = app_home::app_home_dir()?;
    let raw = std::fs::read_to_string(app_home::seat_discovery_path(&home)).ok()?;
    let v: Value = serde_json::from_str(&raw).ok()?;
    Some((
        home,
        SeatInfo {
            port: u16::try_from(v.get("port")?.as_u64()?).ok()?,
            token: v.get("service_token")?.as_str()?.to_string(),
            pid: v.get("pid")?.as_u64()?,
            last_heartbeat: v.get("last_heartbeat")?.as_i64()?,
            started_ms: v.get("started_ms").and_then(Value::as_i64),
            state: v.get("state").and_then(Value::as_str).map(str::to_string),
        },
    ))
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// The machine running-predicate (rag's, applied to ourselves): discovery
/// present + fresh heartbeat + a live ungated `/health`.
pub fn seat_running(info: &SeatInfo) -> bool {
    if now_ms().saturating_sub(info.last_heartbeat) > STALE_HEARTBEAT_MS {
        return false;
    }
    health_ok(info.port)
}

fn health_ok(port: u16) -> bool {
    let transport = LoopbackTransport {
        port,
        bearer: None,
        timeout: HTTP_TIMEOUT,
    };
    transport.get("/health").is_ok()
}

/// The seat block `vaultspec status` renders: running state, identity, and
/// the machine-known workspaces (launcher state).
pub fn seat_block() -> Value {
    let Some(home) = app_home::app_home_dir() else {
        return json!({"running": false, "reason": "no home directory resolvable"});
    };
    let launcher = app_home::LauncherState::load(&home);
    let workspaces: Vec<Value> = launcher
        .workspaces
        .iter()
        .map(|w| json!({"id": w.id, "label": w.label, "path": w.path}))
        .collect();
    match read_seat() {
        Some((_, info)) if seat_running(&info) => json!({
            "running": true,
            "pid": info.pid,
            "port": info.port,
            "uptime_ms": info.started_ms.map(|s| now_ms().saturating_sub(s)),
            "workspaces": workspaces,
            "last_active": launcher.last_active,
        }),
        Some((_, info)) if info.state.as_deref() == Some("starting") && pid_alive(info.pid) => {
            json!({
                "running": false,
                "state": "starting",
                "pid": info.pid,
                "port": info.port,
                "workspaces": workspaces,
                "last_active": launcher.last_active,
            })
        }
        Some(_) => json!({
            "running": false,
            "reason": "stale discovery (seat died without cleanup)",
            "workspaces": workspaces,
            "last_active": launcher.last_active,
        }),
        None => json!({
            "running": false,
            "workspaces": workspaces,
            "last_active": launcher.last_active,
        }),
    }
}

/// `vaultspec stop` — gracefully stop the seat. Idempotent: nothing running
/// is a success, not an error.
pub fn stop() -> Result<Value, String> {
    let Some((home, info)) = read_seat() else {
        return Ok(json!({"stopped": false, "reason": "not running"}));
    };
    if !seat_running(&info) {
        // A STARTING seat (indexing; wire not yet up) is still stoppable —
        // the graceful door does not exist yet, so the pid fallback is the
        // honest path (single-app-runtime S23).
        if info.state.as_deref() == Some("starting") && pid_alive(info.pid) {
            kill_pid(info.pid)?;
            return Ok(json!({
                "stopped": true,
                "pid": info.pid,
                "graceful": false,
                "note": "stopped while starting (before the wire was up)",
            }));
        }
        return Ok(json!({
            "stopped": false,
            "reason": "not running (stale discovery left behind)",
        }));
    }
    let transport = LoopbackTransport {
        port: info.port,
        bearer: Some(info.token.clone()),
        timeout: HTTP_TIMEOUT,
    };
    let acknowledged = transport.post_json("/shutdown", "{}").is_ok();
    if !acknowledged {
        // The graceful door failed while the process looks alive: pid-signal
        // fallback through the platform kill verb, bounded + output-capped
        // (resource-bounds subprocess law).
        kill_pid(info.pid)?;
    }
    // Wait for the drain: the seat retracts its discovery file on clean exit.
    let discovery = app_home::seat_discovery_path(&home);
    let begun = Instant::now();
    while begun.elapsed() < STOP_WAIT {
        if !discovery.exists() || !health_ok(info.port) {
            return Ok(json!({
                "stopped": true,
                "pid": info.pid,
                "graceful": acknowledged,
            }));
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    Err(format!(
        "seat (pid {}) did not stop within {}s",
        info.pid,
        STOP_WAIT.as_secs()
    ))
}

/// `vaultspec restart` — stop the seat if running, then relaunch it detached
/// in the last-active workspace (or the current one when inside a workspace).
pub fn restart() -> Result<Value, String> {
    let stopped = stop()?;
    let cwd = resolve_relaunch_root()
        .ok_or("no workspace to relaunch in: open one first with `vaultspec` from a project")?;
    let pid = spawn_detached_serve(&cwd).map_err(|e| format!("relaunch failed: {e}"))?;
    let seated = wait_for_seat(pid, START_WAIT);
    Ok(json!({
        "stopped": stopped,
        "relaunched": {"pid": pid, "workspace": cwd.to_string_lossy(), "seated": seated},
    }))
}

/// `vaultspec update` — hand the release transaction to the product-owned
/// copied external updater.
///
/// The order is the transaction contract: copy the target-specific updater OUT
/// of the active release (so it can replace that release, including the
/// installed updater), write the ONE-TIME owner-restricted handoff descriptor
/// outside the release set, exit the seat, and launch the copy detached. The
/// copy — never this process — acquires the installation lock, waits this
/// requesting process out, resolves any interrupted transaction, and relaunches
/// the prior seat from the descriptor's relaunch instruction.
///
/// This flow carries NO sealing precondition: the supported channel is the
/// unsigned one, so nothing here is gated on a signed release root. Only the
/// candidate EXECUTE path inside the updater authenticates a candidate, and it
/// is reached from an execute-intent handoff, not from this recovery-and-
/// relaunch one.
///
/// A copy that carries no updater beside it is not a complete product
/// installation and is refused with its channel's own remediation.
pub fn update() -> Result<Value, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let release_updater = exe.with_file_name(UPDATER_NAME);
    if !release_updater.is_file() {
        return Ok(json!({
            "handed_off": false,
            "reason": "this copy ships no product updater beside it, so it \
                       carries no update transaction authority; update it \
                       through the channel that installed it — `scoop update \
                       vaultspec`, `winget upgrade vaultspec`, the product \
                       installer, or Windows Installer for an MSI copy",
        }));
    }

    let home = app_home::app_home_dir().ok_or("no home directory resolvable")?;
    if !home.is_absolute() {
        return Err("the machine app home did not resolve to an absolute path".to_string());
    }
    let paths = ProductPaths::under_app_home(&home);
    paths
        .ensure()
        .map_err(|e| format!("product directories unavailable: {e}"))?;
    let descriptor_path = paths.transaction_dir().join(HANDOFF_DESCRIPTOR);
    if descriptor_path.exists() {
        return Err(
            "an update handoff is already pending; let the running updater finish".to_string(),
        );
    }

    // Copy OUT first: the copy is what replaces the release, so it must not be
    // the release's own file.
    let copied = copy_updater_out(&release_updater, &paths.updater_dir())
        .map_err(|e| format!("copying the updater out failed: {e}"))?;

    // A seat that is up now is the seat the updater relaunches afterwards.
    let was_running = read_seat().map(|(_, i)| seat_running(&i)).unwrap_or(false);
    let relaunch = was_running
        .then(resolve_relaunch_root)
        .flatten()
        .map(|workspace| RelaunchSpec {
            // The STABLE front door: this same installed path, whose bytes the
            // swap may replace.
            launcher: exe.clone(),
            workspace,
        });

    let descriptor = UpdaterDescriptor {
        version: HANDOFF_VERSION,
        app_home: home,
        owner: paths.root().to_string_lossy().to_string(),
        requester_pid: Some(std::process::id()),
        relaunch: relaunch.clone(),
        // A recovery-and-relaunch handoff: staging a candidate is the release
        // channel's own step, and a handoff never invents one.
        execute: None,
    };
    write_handoff_descriptor(&descriptor_path, &descriptor)
        .map_err(|e| format!("writing the update handoff failed: {e}"))?;

    // The seat exits BEFORE the copy runs: the swap replaces the installed
    // executables, and a running image cannot be replaced on Windows.
    let stopped = match stop() {
        Ok(stopped) => stopped,
        Err(error) => {
            let _ = std::fs::remove_file(&descriptor_path);
            return Err(error);
        }
    };

    match spawn_detached_updater(&copied, &descriptor_path) {
        Ok(pid) => Ok(json!({
            "handed_off": true,
            "stopped": stopped,
            "updater": {"pid": pid, "path": copied.to_string_lossy()},
            "relaunch": relaunch.map(|r| json!({"workspace": r.workspace.to_string_lossy()})),
        })),
        Err(error) => {
            // Nothing ran: retire the one-time descriptor and put the seat back.
            let _ = std::fs::remove_file(&descriptor_path);
            let relaunched = was_running
                .then(resolve_relaunch_root)
                .flatten()
                .and_then(|cwd| spawn_detached_serve(&cwd).ok())
                .map(|pid| wait_for_seat(pid, START_WAIT));
            Err(format!(
                "launching the copied updater failed: {error}{}",
                match relaunched {
                    Some(true) => " (the seat was restarted)",
                    Some(false) => " (the seat was restarted but did not come up)",
                    None => "",
                }
            ))
        }
    }
}

/// Spawn the copied updater fully detached with its one operand: the path to the
/// one-time descriptor. It outlives this process by design — it waits for this
/// process to exit before it mutates anything.
fn spawn_detached_updater(updater: &Path, descriptor: &Path) -> std::io::Result<u32> {
    let mut cmd = std::process::Command::new(updater);
    cmd.arg(descriptor)
        .current_dir(
            updater
                .parent()
                .unwrap_or_else(|| Path::new(std::path::Component::CurDir.as_os_str())),
        )
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // DETACHED_PROCESS (0x8) + CREATE_NO_WINDOW (0x0800_0000): the copy owns
        // no console and outlives this process.
        cmd.creation_flags(0x0800_0008);
    }
    Ok(cmd.spawn()?.id())
}

/// Prefer the cwd's workspace when it is vaultspec-managed; else the
/// launcher-state last-active root.
fn resolve_relaunch_root() -> Option<PathBuf> {
    if let Ok(cwd) = std::env::current_dir()
        && cwd.join(".vault").is_dir()
    {
        return Some(cwd);
    }
    let home = app_home::app_home_dir()?;
    let launcher = app_home::LauncherState::load(&home);
    launcher
        .last_active_entry()
        .map(|w| PathBuf::from(&w.path))
        .filter(|p| p.is_dir())
}

/// Spawn `vaultspec serve` fully detached (single-app-runtime D2 posture):
/// no console window on Windows, no inherited stdio, survives the launching
/// terminal. Returns the child pid without waiting.
pub fn spawn_detached_serve(cwd: &Path) -> std::io::Result<u32> {
    let exe = std::env::current_exe()?;
    let mut cmd = std::process::Command::new(exe);
    cmd.arg("serve")
        .current_dir(cwd)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // DETACHED_PROCESS (0x8) + CREATE_NO_WINDOW (0x0800_0000): no console
        // is created or attached; the child outlives the launcher.
        cmd.creation_flags(0x0800_0008);
    }
    let child = cmd.spawn()?;
    Ok(child.id())
}

/// How a state-aware wait for a spawned seat ended (single-app-runtime S23,
/// review HIGH: the launcher must distinguish an INDEXING seat from a dead
/// one, exactly like `status` and `stop` do).
#[derive(Debug)]
pub enum SeatWait {
    /// Discovery names the pid and `/health` answers: the app is up.
    Ready(SeatInfo),
    /// The seat is alive and honestly `starting` (indexing), but did not
    /// reach ready within the index budget. NOT a failure — the caller
    /// reports "still indexing", never "check the crash log".
    StillStarting { pid: u64 },
    /// No discovery for this pid within the publish budget, or the recorded
    /// process died: genuinely not coming up.
    Vanished,
}

/// Wait for a spawned seat, state-aware. Discovery publishes a `starting`
/// record within moments of spawn (BEFORE the initial index), so the publish
/// budget is short; once a `starting` record names a LIVE pid the wait
/// extends to the index budget, because a large project's first index
/// legitimately takes minutes.
pub fn wait_for_seat_ready(pid: u32, publish_budget: Duration, index_budget: Duration) -> SeatWait {
    let begun = Instant::now();
    let mut seen_ours = false;
    loop {
        match read_seat() {
            Some((_, info)) if info.pid == u64::from(pid) => {
                seen_ours = true;
                if health_ok(info.port) {
                    return SeatWait::Ready(info);
                }
                if begun.elapsed() >= index_budget {
                    return SeatWait::StillStarting { pid: info.pid };
                }
                if info.state.as_deref() == Some("starting") && !pid_alive(info.pid) {
                    return SeatWait::Vanished;
                }
            }
            _ => {
                let budget = if seen_ours {
                    index_budget
                } else {
                    publish_budget
                };
                if begun.elapsed() >= budget {
                    return SeatWait::Vanished;
                }
            }
        }
        std::thread::sleep(Duration::from_millis(250));
    }
}

/// Wait bounded for the seat discovery file to name `pid` with a live health.
pub fn wait_for_seat(pid: u32, budget: Duration) -> bool {
    matches!(wait_for_seat_ready(pid, budget, budget), SeatWait::Ready(_))
}

/// Pid-signal fallback: the platform kill verb as a bounded subprocess.
/// Only the exit code is consulted, so stdio is null (review nit: the piped
/// variant was never drained — null is both simpler and cap-free-by-having-
/// no-output).
fn kill_pid(pid: u64) -> Result<(), String> {
    #[cfg(windows)]
    let mut cmd = {
        let mut c = std::process::Command::new("taskkill");
        c.args(["/PID", &pid.to_string(), "/T", "/F"]);
        c
    };
    #[cfg(not(windows))]
    let mut cmd = {
        let mut c = std::process::Command::new("kill");
        c.arg(pid.to_string());
        c
    };
    let status = run_status_bounded(&mut cmd, Duration::from_secs(5))
        .map_err(|e| format!("kill fallback failed: {e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("kill fallback exited {status}"))
    }
}

/// Is `pid` a live process? The platform liveness probe as a bounded, silent
/// subprocess: `tasklist /FI "PID eq N" /NH` on Windows (exit 0 both ways, so
/// match the pid in its capped output), `kill -0` elsewhere.
pub fn pid_alive(pid: u64) -> bool {
    #[cfg(windows)]
    {
        let mut cmd = std::process::Command::new("tasklist");
        cmd.args(["/FI", &format!("PID eq {pid}"), "/NH"])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null());
        let Ok(mut child) = cmd.spawn() else {
            return false;
        };
        let mut out = String::new();
        if let Some(stdout) = child.stdout.take() {
            use std::io::Read as _;
            let _ = stdout.take(64 * 1024).read_to_string(&mut out);
        }
        let begun = Instant::now();
        while begun.elapsed() < Duration::from_secs(5) {
            match child.try_wait() {
                Ok(Some(_)) => return out.contains(&format!(" {pid} ")),
                Ok(None) => std::thread::sleep(Duration::from_millis(50)),
                Err(_) => return false,
            }
        }
        let _ = child.kill();
        false
    }
    #[cfg(not(windows))]
    {
        let mut cmd = std::process::Command::new("kill");
        cmd.args(["-0", &pid.to_string()]);
        run_status_bounded(&mut cmd, Duration::from_secs(5))
            .map(|s| s.success())
            .unwrap_or(false)
    }
}

/// Run a silent subprocess to completion under a wall-clock ceiling, killing
/// on breach (subprocess law: no output is produced, so the cap is moot).
fn run_status_bounded(
    cmd: &mut std::process::Command,
    timeout: Duration,
) -> Result<std::process::ExitStatus, String> {
    let mut child = cmd
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("spawn failed: {e}"))?;
    let begun = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => return Ok(status),
            Ok(None) if begun.elapsed() < timeout => {
                std::thread::sleep(Duration::from_millis(100));
            }
            Ok(None) => {
                let _ = child.kill();
                return Err("timed out and was killed".to_string());
            }
            Err(e) => return Err(format!("wait failed: {e}")),
        }
    }
}
