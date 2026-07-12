//! The application front door (single-app-runtime D2): bare `vaultspec` and
//! the explicit `open` verb.
//!
//! Resolve the target workspace (cwd inside a workspace wins, else the
//! launcher-state last-active root, else none), ensure the seat (attach to a
//! live one via the machine discovery + health predicate, else spawn
//! `vaultspec serve` detached and wait bounded for it to publish), select the
//! workspace on the seat through the `/session` write seam, then open the
//! browser and exit. The double-clicked console window lives for well under
//! the spawn-wait budget on the attach path and exactly the seat-publication
//! wait on the cold path.

use std::path::PathBuf;
use std::time::Duration;

use rag_client::client::{LoopbackTransport, RagTransport};
use serde_json::{Value, json};
use vaultspec_session::app_home;

use super::lifecycle;

/// Loopback request budget for the attach-path session calls.
const HTTP_TIMEOUT: Duration = Duration::from_secs(5);
/// How long a cold launch waits for the spawned seat to publish discovery.
/// Discovery publishes AFTER the initial index, and a large repository's cold
/// index legitimately takes minutes — the wait must outlast it (review
/// finding: 30 s produced a false "did not come up" on big corpora).
const SPAWN_WAIT: Duration = Duration::from_secs(180);
/// Crash-loop guard window (single-app-runtime D7): a seat that died within
/// this window of its launch is NOT auto-relaunched; the user is pointed at
/// the crash log instead.
const CRASH_LOOP_WINDOW_MS: i64 = 60_000;

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// `vaultspec` / `vaultspec open` — the app front door.
pub fn open_app() -> Result<Value, String> {
    let workspace = resolve_workspace();

    // Attach path: a live seat exists — select the workspace on it and open.
    if let Some((home, info)) = lifecycle::read_seat()
        && lifecycle::seat_running(&info)
    {
        let selected = workspace
            .as_ref()
            .map(|ws| select_workspace_on_seat(&info, ws))
            .transpose()?;
        touch_launcher_state(&home, workspace.as_deref().map(PathBuf::from).as_deref());
        let url = format!("http://127.0.0.1:{}/", info.port);
        let browser = open_browser(&url);
        return Ok(json!({
            "attached": true,
            "url": url,
            "workspace": workspace,
            "workspace_selected": selected,
            "browser_opened": browser.is_ok(),
        }));
    }

    // Cold path: spawn the seat detached. Crash-loop guard first (D7): if the
    // LAST launch died within its window, refuse and point at the crash log
    // rather than thrash.
    let home = app_home::app_home_dir()
        .ok_or("no home directory resolvable; cannot locate the vaultspec app home")?;
    crash_loop_guard(&home, workspace.as_deref())?;

    let cwd = workspace
        .as_deref()
        .map(PathBuf::from)
        .or_else(|| {
            let launcher = app_home::LauncherState::load(&home);
            launcher
                .last_active_entry()
                .map(|w| PathBuf::from(&w.path))
                .filter(|p| p.is_dir())
        })
        // No workspace anywhere: spawn from the app home and let serve boot
        // workspace-less into the onboarding empty state (D4).
        .unwrap_or_else(|| home.clone());

    let pid = lifecycle::spawn_detached_serve(&cwd)
        .map_err(|e| format!("could not start the vaultspec app: {e}"))?;
    record_launch(&home, pid);
    if !lifecycle::wait_for_seat(pid, SPAWN_WAIT) {
        return Err(format!(
            "the vaultspec app started (pid {pid}) but did not come up within \
             {}s; check the crash log{}",
            SPAWN_WAIT.as_secs(),
            crash_log_hint(workspace.as_deref())
        ));
    }
    let (_, info) = lifecycle::read_seat().ok_or("seat discovery vanished after startup")?;
    touch_launcher_state(&home, Some(&cwd));
    let url = format!("http://127.0.0.1:{}/", info.port);
    let browser = open_browser(&url);
    Ok(json!({
        "attached": false,
        "spawned_pid": pid,
        "url": url,
        "workspace": workspace,
        "browser_opened": browser.is_ok(),
    }))
}

/// Open the user's default browser, detached. On failure the caller still
/// reports the URL so the launch is never dead-ended (typed fallback).
fn open_browser(url: &str) -> Result<(), String> {
    match open::that_detached(url) {
        Ok(()) => Ok(()),
        Err(e) => {
            eprintln!("could not open a browser ({e}); open this yourself: {url}");
            Err(e.to_string())
        }
    }
}

/// Resolve the launch workspace: the cwd's containing vault-bearing worktree
/// (the same discovery serve boots with), else None — the caller falls back
/// to the launcher state.
fn resolve_workspace() -> Option<String> {
    let root = resolve_containing_root(&std::env::current_dir().ok()?)?;
    root.join(".vault")
        .is_dir()
        .then(|| root.to_string_lossy().to_string())
}

/// The cwd's containing worktree root (git discovery + path-prefix match,
/// Windows extended-length prefixes stripped), WITHOUT the `.vault` filter —
/// the provision verbs target not-yet-managed roots too.
pub(crate) fn resolve_containing_root(cwd: &std::path::Path) -> Option<PathBuf> {
    let workspace = ingest_git::workspace::Workspace::discover(cwd).ok()?;
    let roots = ingest_git::worktrees::list_roots(&workspace).ok()?;
    let cwd_clean = cwd.to_string_lossy().replace('\\', "/");
    let cwd_clean = cwd_clean
        .strip_prefix("//?/")
        .unwrap_or(&cwd_clean)
        .to_string();
    let root = roots
        .into_iter()
        .find(|p| {
            let wp = p.to_string_lossy().replace('\\', "/");
            let wp = wp.strip_prefix("//?/").unwrap_or(&wp).to_string();
            cwd_clean == wp || cwd_clean.starts_with(&format!("{wp}/"))
        })
        .unwrap_or_else(|| cwd.to_path_buf());
    let cleaned = root.to_string_lossy().replace('\\', "/");
    Some(PathBuf::from(
        cleaned.strip_prefix("//?/").unwrap_or(&cleaned),
    ))
}

/// Register (idempotent) and select `path` as the active workspace on the
/// live seat through the `/session` write seam. Returns whether a selection
/// was applied; a registration refusal (e.g. already registered) is tolerated
/// and only the selection outcome matters.
fn select_workspace_on_seat(info: &lifecycle::SeatInfo, path: &str) -> Result<bool, String> {
    let transport = LoopbackTransport {
        port: info.port,
        bearer: Some(info.token.clone()),
        timeout: HTTP_TIMEOUT,
    };
    // Best-effort registration: an already-registered path is a tiered 400 we
    // deliberately swallow — the id lookup below is the real gate.
    let _ = transport.put_json("/session", &json!({ "add_workspace": path }).to_string());
    // Find the registered id by path (normalized), then select it.
    let body = transport
        .get("/workspaces")
        .map_err(|e| format!("seat did not answer /workspaces: {e}"))?;
    let v: Value =
        serde_json::from_str(&body).map_err(|e| format!("bad /workspaces payload: {e}"))?;
    let norm = |s: &str| s.replace('\\', "/").trim_end_matches('/').to_lowercase();
    let wanted = norm(path);
    let id = v["data"]["workspaces"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|w| w["path"].as_str().map(norm) == Some(wanted.clone()))
        .and_then(|w| w["id"].as_str().map(str::to_string));
    let Some(id) = id else {
        // Not registered and not registrable (validation refused it): the
        // browser still opens on the seat's current workspace.
        return Ok(false);
    };
    transport
        .put_json("/session", &json!({ "active_workspace": id }).to_string())
        .map_err(|e| format!("workspace selection failed: {e}"))?;
    Ok(true)
}

/// Stamp the machine launcher state after a successful open (D3).
fn touch_launcher_state(home: &std::path::Path, workspace: Option<&std::path::Path>) {
    let Some(root) = workspace else { return };
    let id = ingest_git::workspace::Workspace::discover(root)
        .ok()
        .map(|ws| engine_model::scope_token(&ws.common_dir))
        .unwrap_or_else(|| engine_model::scope_token(root));
    let label = root
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let mut launcher = app_home::LauncherState::load(home);
    launcher.touch(&id, &label, &root.to_string_lossy(), now_ms());
    let _ = launcher.save(home);
}

/// Where the last cold launch was recorded (crash-loop guard bookkeeping).
fn last_launch_path(home: &std::path::Path) -> PathBuf {
    home.join("last-launch.json")
}

fn record_launch(home: &std::path::Path, pid: u32) {
    let _ = std::fs::write(
        last_launch_path(home),
        json!({"pid": pid, "at_ms": now_ms()}).to_string(),
    );
}

/// The crash-loop guard (D7): when the previous launch is recent (inside the
/// window) and its process is gone without a live seat, refuse to thrash and
/// point at the crash log.
fn crash_loop_guard(home: &std::path::Path, workspace: Option<&str>) -> Result<(), String> {
    let Some(last) = std::fs::read_to_string(last_launch_path(home))
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
    else {
        return Ok(());
    };
    let at = last.get("at_ms").and_then(Value::as_i64).unwrap_or(0);
    if now_ms().saturating_sub(at) < CRASH_LOOP_WINDOW_MS {
        return Err(format!(
            "the vaultspec app was launched under a minute ago and has not \
             come up - it may still be starting (a first index of a large \
             project takes a while) or crashing; not relaunching \
             automatically. Try again shortly, check the crash log{}, or run \
             `vaultspec serve` in a terminal to watch it live.",
            crash_log_hint(workspace)
        ));
    }
    Ok(())
}

fn crash_log_hint(workspace: Option<&str>) -> String {
    match workspace {
        Some(ws) => format!(" at `{ws}/.vault/data/engine-data/crash.log`"),
        None => String::new(),
    }
}
