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
/// How long a cold launch waits for the spawned seat's `starting` discovery
/// record to appear. Discovery now publishes BEFORE the initial index
/// (single-app-runtime S23), so this is short: no record in 30 s means the
/// process never got going.
const PUBLISH_WAIT: Duration = Duration::from_secs(30);
/// How long a cold launch tolerates an honestly-`starting` (indexing) seat
/// before giving up the wait and telling the user it is still working. A
/// large project's first index legitimately takes minutes.
const INDEX_WAIT: Duration = Duration::from_secs(15 * 60);
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
    let info = match lifecycle::wait_for_seat_ready(pid, PUBLISH_WAIT, INDEX_WAIT) {
        lifecycle::SeatWait::Ready(info) => info,
        // Honestly still indexing (review HIGH): the seat is ALIVE and its
        // discovery says `starting` — never send the user to the crash log.
        lifecycle::SeatWait::StillStarting { pid } => {
            return Err(format!(
                "the vaultspec app is up (pid {pid}) but still reading your \
                 project after {} minutes - leave it working and run \
                 `vaultspec` again shortly, or watch it live with \
                 `vaultspec serve` next time.",
                INDEX_WAIT.as_secs() / 60
            ));
        }
        lifecycle::SeatWait::Vanished => {
            // A concurrent launch may have WON the seat while our spawn lost
            // it (review M1): the app IS running, just not under our pid —
            // attach instead of reporting a misleading failure.
            if let Some((_, info)) = lifecycle::read_seat()
                && lifecycle::seat_running(&info)
            {
                touch_launcher_state(&home, Some(&cwd));
                let url = format!("http://127.0.0.1:{}/", info.port);
                let browser = open_browser(&url);
                return Ok(json!({
                    "attached": true,
                    "raced_concurrent_launch": true,
                    "url": url,
                    "workspace": workspace,
                    "browser_opened": browser.is_ok(),
                }));
            }
            return Err(format!(
                "the vaultspec app started (pid {pid}) but did not come up; \
                 check the crash log{}",
                crash_log_hint(workspace.as_deref())
            ));
        }
    };
    touch_launcher_state(&home, Some(&cwd));
    let url = format!("http://127.0.0.1:{}/", info.port);
    let browser = open_browser(&url);
    Ok(json!({
        "attached": false,
        "spawned_pid": pid,
        "url": url,
        "workspace": workspace,
        "browser_opened": browser.is_ok(),
        // A cold seat launch reconciles ONLY the receipt-owned A2A gateway before
        // the dashboard opens (a2a-product-provisioning W02.P04.S48): the seat we
        // just spawned starts or authenticates its own receipt-owned gateway in
        // its boot path (S27) and leaves every compatible foreign resident
        // immutable (ADR D4) — the launcher never owns a gateway process itself.
        // We surface the reconciled product readiness read-only here.
        "a2a": reconciled_a2a_facts(),
    }))
}

/// The receipt-owned A2A product readiness the cold seat reconciled during its
/// boot (S27/S48), read-only. The launcher never starts or owns the gateway
/// itself (ADR D4); it only reflects what the seat reconciled. Compacted to the
/// installed + readiness facts the front door needs.
fn reconciled_a2a_facts() -> Value {
    let facts = super::a2a_lifecycle::facts();
    json!({
        "installed": facts.get("installed").cloned().unwrap_or(json!(false)),
        "readiness": facts.get("readiness").cloned().unwrap_or(Value::Null),
    })
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
    let wanted = normalize_path_key(path);
    let id = v["data"]["workspaces"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|w| w["path"].as_str().map(normalize_path_key) == Some(wanted.clone()))
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

/// What a cold launch should do given the previous launch record (review M2:
/// the decision is pure and unit-tested; pid liveness is an INPUT, so a slow
/// first index is distinguished from a crash).
#[derive(Debug, PartialEq, Eq)]
pub(crate) enum ColdLaunchDecision {
    /// No recent launch (or the record is stale): spawn normally.
    Proceed,
    /// The recorded launch is recent and its process is STILL ALIVE — it is
    /// starting (a first index can take minutes); do not double-spawn.
    StillStarting { pid: u64 },
    /// The recorded launch is recent and its process is DEAD without a live
    /// seat — a crash loop; refuse to thrash.
    RefuseCrashLoop,
}

pub(crate) fn resolve_cold_launch(
    last: Option<(u64, i64)>,
    now_ms: i64,
    last_pid_alive: bool,
) -> ColdLaunchDecision {
    let Some((pid, at_ms)) = last else {
        return ColdLaunchDecision::Proceed;
    };
    if now_ms.saturating_sub(at_ms) >= CRASH_LOOP_WINDOW_MS {
        return ColdLaunchDecision::Proceed;
    }
    if last_pid_alive {
        ColdLaunchDecision::StillStarting { pid }
    } else {
        ColdLaunchDecision::RefuseCrashLoop
    }
}

/// The crash-loop guard (D7): when the previous launch is recent, check its
/// pid before deciding — alive means "still starting" (honest message, no
/// double-spawn), dead means a crash loop (refuse to thrash).
fn crash_loop_guard(home: &std::path::Path, workspace: Option<&str>) -> Result<(), String> {
    let last = std::fs::read_to_string(last_launch_path(home))
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .and_then(|v| {
            Some((
                v.get("pid")?.as_u64()?,
                v.get("at_ms").and_then(Value::as_i64)?,
            ))
        });
    let alive = last.is_some_and(|(pid, _)| lifecycle::pid_alive(pid));
    match resolve_cold_launch(last, now_ms(), alive) {
        ColdLaunchDecision::Proceed => Ok(()),
        ColdLaunchDecision::StillStarting { pid } => Err(format!(
            "the vaultspec app is still starting (pid {pid}) - a first index \
             of a large project takes a while. Try again shortly, or run \
             `vaultspec serve` in a terminal to watch it live."
        )),
        ColdLaunchDecision::RefuseCrashLoop => Err(format!(
            "the vaultspec app was launched under a minute ago and its \
             process is gone - it may be crashing on startup; not \
             relaunching automatically. Check the crash log{} or run \
             `vaultspec serve` in a terminal to see the error.",
            crash_log_hint(workspace)
        )),
    }
}

fn crash_log_hint(workspace: Option<&str>) -> String {
    match workspace {
        Some(ws) => format!(" at `{ws}/.vault/data/engine-data/crash.log`"),
        None => String::new(),
    }
}

/// One path-comparison key for matching a local root against a served
/// registry row: forward slashes, no trailing separator, case-folded
/// (Windows paths compare case-insensitively).
pub(crate) fn normalize_path_key(s: &str) -> String {
    s.replace('\\', "/").trim_end_matches('/').to_lowercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cold_launch_decision_covers_the_matrix() {
        // No record: proceed.
        assert_eq!(
            resolve_cold_launch(None, 1_000_000, false),
            ColdLaunchDecision::Proceed
        );
        // Stale record (outside the window): proceed regardless of liveness.
        assert_eq!(
            resolve_cold_launch(Some((42, 0)), CRASH_LOOP_WINDOW_MS + 1, false),
            ColdLaunchDecision::Proceed
        );
        // Recent + alive: still starting (a slow first index is NOT a crash —
        // review M2, the exact false positive the old time-only check had).
        assert_eq!(
            resolve_cold_launch(Some((42, 1_000)), 2_000, true),
            ColdLaunchDecision::StillStarting { pid: 42 }
        );
        // Recent + dead: crash loop, refuse.
        assert_eq!(
            resolve_cold_launch(Some((42, 1_000)), 2_000, false),
            ColdLaunchDecision::RefuseCrashLoop
        );
        // Boundary: exactly at the window edge counts as stale.
        assert_eq!(
            resolve_cold_launch(Some((42, 0)), CRASH_LOOP_WINDOW_MS, false),
            ColdLaunchDecision::Proceed
        );
    }

    #[test]
    fn path_keys_normalize_separators_case_and_trailing_slash() {
        assert_eq!(
            normalize_path_key("Y:\\Code\\Project\\"),
            normalize_path_key("y:/code/project")
        );
        assert_ne!(
            normalize_path_key("y:/code/project-a"),
            normalize_path_key("y:/code/project-b")
        );
    }

    #[test]
    fn pid_liveness_sees_ourselves_alive_and_a_bogus_pid_dead() {
        assert!(super::super::lifecycle::pid_alive(u64::from(
            std::process::id()
        )));
        // Pid 4_000_000_000 is far outside any real pid space on Windows and
        // Linux alike.
        assert!(!super::super::lifecycle::pid_alive(4_000_000_000));
    }
}
