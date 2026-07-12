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
use vaultspec_session::app_home;

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

/// Wait bounded for the seat discovery file to name `pid` with a live health.
pub fn wait_for_seat(pid: u32, budget: Duration) -> bool {
    let begun = Instant::now();
    while begun.elapsed() < budget {
        if let Some((_, info)) = read_seat()
            && info.pid == u64::from(pid)
            && health_ok(info.port)
        {
            return true;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    false
}

/// Pid-signal fallback: the platform kill verb as a bounded, output-capped
/// subprocess (never a raw unbounded shell-out).
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
    let child = cmd
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("kill fallback failed to spawn: {e}"))?;
    // Bounded wait (subprocess law): kill verbs finish instantly; 5 s is slack.
    let begun = Instant::now();
    let mut child = child;
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                return if status.success() {
                    Ok(())
                } else {
                    Err(format!("kill fallback exited {status}"))
                };
            }
            Ok(None) if begun.elapsed() < Duration::from_secs(5) => {
                std::thread::sleep(Duration::from_millis(100));
            }
            Ok(None) => {
                let _ = child.kill();
                return Err("kill fallback timed out".to_string());
            }
            Err(e) => return Err(format!("kill fallback wait failed: {e}")),
        }
    }
}
