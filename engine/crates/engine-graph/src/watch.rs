//! Debounced filesystem watcher (engine-spec §2.4, D2.4): watches each
//! worktree's `.vault/` and `.git` for changes and drives partial
//! re-ingestion of only the dirtied paths. Serve-mode machinery; the
//! one-shot CLI never needs it.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, mpsc};
use std::time::Duration;

use notify::{RecursiveMode, Watcher};

#[derive(Debug, thiserror::Error)]
pub enum WatchError {
    #[error("watch: {0}")]
    Notify(#[from] notify::Error),
}

/// Maximum consecutive respawns of a panicked debounce worker before the
/// supervisor gives up and the watcher reports itself dead for good. A
/// healthy worker that runs without panicking resets the budget.
const MAX_RESPAWNS: u32 = 5;
/// Base backoff between respawns; doubles each consecutive failure.
const RESPAWN_BACKOFF_BASE: Duration = Duration::from_millis(200);

/// A running watcher; dropping it stops watching.
pub struct WatchHandle {
    // Held for lifetime; the OS-level watch stops when dropped.
    _watcher: notify::RecommendedWatcher,
    // The supervisor thread; it spawns, joins, and respawns the debounce
    // worker on a panicked death (bounded retries + backoff).
    _supervisor: std::thread::JoinHandle<()>,
    // Truthful liveness for `/status`: true while a worker is actively
    // running, false during a respawn gap and permanently once the
    // supervisor has exhausted its retry budget (DF-4: a dead watcher is
    // stated, never papered over).
    alive: Arc<AtomicBool>,
}

impl WatchHandle {
    /// Is the watcher actively driving rebuilds? Auto-respawn (bounded
    /// retries with backoff) repairs a panicked debounce thread, so a
    /// transient panic no longer permanently zombifies the watcher. This
    /// stays truthful: it reads `false` during a respawn gap and `false`
    /// for good once the supervisor exhausts its retry budget — `/status`
    /// must say so rather than claim a resident watcher (DF-4 residual).
    pub fn is_alive(&self) -> bool {
        self.alive.load(Ordering::SeqCst)
    }
}

/// Watch `roots` recursively, debounce events by `debounce`, and invoke
/// `on_dirty` with the deduplicated set of dirtied paths per window.
///
/// The debounce worker is supervised: if it panics (e.g. a panic inside
/// `on_dirty`), a supervisor respawns it with bounded retries and
/// exponential backoff so rebuilds resume automatically instead of stopping
/// until a human restarts the service. `on_dirty` is therefore `Clone`, so
/// the supervisor can hand each respawned worker a fresh copy.
pub fn watch(
    roots: &[PathBuf],
    debounce: Duration,
    on_dirty: impl Fn(Vec<PathBuf>) + Clone + Send + 'static,
) -> Result<WatchHandle, WatchError> {
    let (tx, rx) = mpsc::channel::<notify::Result<notify::Event>>();
    let mut watcher = notify::recommended_watcher(tx)?;
    for root in roots {
        watcher.watch(root, RecursiveMode::Recursive)?;
    }

    // The OS-level watch (above) feeds one stable channel. The debounce
    // worker owns the receiver; on a panicked death the supervisor reclaims
    // it (shared behind a Mutex) and hands it to a fresh worker, so a single
    // panic never severs the FS→rebuild path permanently.
    let rx = Arc::new(Mutex::new(rx));
    let alive = Arc::new(AtomicBool::new(true));

    let supervisor = {
        let rx = rx.clone();
        let alive = alive.clone();
        std::thread::spawn(move || {
            supervise(rx, debounce, on_dirty, alive);
        })
    };

    Ok(WatchHandle {
        _watcher: watcher,
        _supervisor: supervisor,
        alive,
    })
}

/// Supervise the debounce worker: spawn it, join it, and respawn on a
/// panicked exit (bounded retries with exponential backoff). A clean exit
/// (the channel disconnected because the watcher was dropped) ends
/// supervision.
fn supervise(
    rx: Arc<Mutex<mpsc::Receiver<notify::Result<notify::Event>>>>,
    debounce: Duration,
    on_dirty: impl Fn(Vec<PathBuf>) + Clone + Send + 'static,
    alive: Arc<AtomicBool>,
) {
    let mut consecutive_failures: u32 = 0;
    loop {
        alive.store(true, Ordering::SeqCst);
        let worker = {
            let rx = rx.clone();
            let on_dirty = on_dirty.clone();
            std::thread::spawn(move || debounce_loop(&rx, debounce, on_dirty))
        };
        match worker.join() {
            // Clean exit: the worker returned because the channel
            // disconnected (watcher dropped). Supervision is done.
            Ok(WorkerExit::Disconnected) => {
                alive.store(false, Ordering::SeqCst);
                return;
            }
            // A panic propagated out of the worker (e.g. from `on_dirty`).
            // Respawn with backoff until the retry budget is exhausted.
            Err(_) => {
                consecutive_failures += 1;
                if consecutive_failures > MAX_RESPAWNS {
                    // Give up: a dead watcher is stated truthfully so the
                    // operator restarts the service (DF-4).
                    alive.store(false, Ordering::SeqCst);
                    return;
                }
                alive.store(false, Ordering::SeqCst);
                let backoff = RESPAWN_BACKOFF_BASE * 2u32.saturating_pow(consecutive_failures - 1);
                std::thread::sleep(backoff);
                // Loop: respawn a fresh worker (resets `alive` to true).
            }
        }
    }
}

/// Why the debounce worker returned. A panic is NOT one of these — it
/// unwinds past the return type and is caught by the supervisor's `join`.
enum WorkerExit {
    /// The notify channel disconnected: the watcher was dropped.
    Disconnected,
}

/// The debounce loop: first event opens a window; everything arriving
/// within it coalesces into one `on_dirty` callback.
fn debounce_loop(
    rx: &Mutex<mpsc::Receiver<notify::Result<notify::Event>>>,
    debounce: Duration,
    on_dirty: impl Fn(Vec<PathBuf>),
) -> WorkerExit {
    // A respawned worker reclaims the receiver from the poisoned lock; the
    // receiver itself is unaffected by a previous worker's panic.
    let rx = rx.lock().unwrap_or_else(|e| e.into_inner());
    while let Ok(first) = rx.recv() {
        let mut dirty: Vec<PathBuf> = Vec::new();
        collect(first, &mut dirty);
        let deadline = std::time::Instant::now() + debounce;
        while let Some(remaining) = deadline.checked_duration_since(std::time::Instant::now()) {
            match rx.recv_timeout(remaining) {
                Ok(event) => collect(event, &mut dirty),
                Err(mpsc::RecvTimeoutError::Timeout) => break,
                Err(mpsc::RecvTimeoutError::Disconnected) => return WorkerExit::Disconnected,
            }
            if remaining.is_zero() {
                break;
            }
        }
        if !dirty.is_empty() {
            on_dirty(dirty);
        }
    }
    WorkerExit::Disconnected
}

fn collect(event: notify::Result<notify::Event>, dirty: &mut Vec<PathBuf>) {
    if let Ok(event) = event {
        for path in event.paths {
            // Engine-owned cache/log zones under `.vault/` are SKIPPED: the
            // engine's own `put_artifact` writes (the SQLite cache + its
            // WAL/SHM siblings, the extraction cache, and the HEAD-keyed
            // declared-graph cache) all land under `.vault/data/engine-data/`,
            // and serve logs under `.vault/logs/`. Watching them makes the
            // watcher self-trigger on every cache write — an endless
            // rebuild→write→rebuild churn (perf ADR follow-up). Mirrors the
            // `vault_documents` walk skip of `data`/`logs`.
            if is_engine_owned_path(&path) {
                continue;
            }
            if !dirty.contains(&path) {
                dirty.push(path);
            }
        }
    }
}

/// True when `path` lives in an engine-owned, gitignored zone under `.vault/`
/// (`.vault/data/…` or `.vault/logs/…`) — the cache and log directories the
/// engine writes to itself. Detected by the adjacent `.vault` → (`data`|`logs`)
/// segment PAIR (not a bare `data`/`logs` anywhere), so a user document like
/// `.vault/plan/data-model-plan.md` is never mistaken for a cache write.
fn is_engine_owned_path(path: &Path) -> bool {
    let comps: Vec<&std::ffi::OsStr> = path.components().map(|c| c.as_os_str()).collect();
    comps.windows(2).any(|w| {
        w[0] == std::ffi::OsStr::new(".vault")
            && (w[1] == std::ffi::OsStr::new("data") || w[1] == std::ffi::OsStr::new("logs"))
    })
}

/// The watch roots for one worktree: its vault corpus and its git dir
/// (HEAD moves, new refs, new worktrees).
pub fn watch_roots(worktree_root: &Path) -> Vec<PathBuf> {
    vec![worktree_root.join(".vault"), worktree_root.join(".git")]
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[test]
    fn debounced_watcher_coalesces_changes_into_one_callback() {
        let dir = tempfile::tempdir().unwrap();
        let vault = dir.path().join(".vault");
        std::fs::create_dir_all(&vault).unwrap();

        let seen: Arc<Mutex<Vec<Vec<PathBuf>>>> = Arc::new(Mutex::new(Vec::new()));
        let sink = seen.clone();
        let _handle = watch(
            std::slice::from_ref(&vault),
            Duration::from_millis(300),
            move |paths| sink.lock().unwrap().push(paths),
        )
        .unwrap();

        // Two writes inside one debounce window.
        std::thread::sleep(Duration::from_millis(100));
        std::fs::write(vault.join("a.md"), "one\n").unwrap();
        std::fs::write(vault.join("b.md"), "two\n").unwrap();

        // Wait out the window generously (fs watchers are not instant).
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        loop {
            if !seen.lock().unwrap().is_empty() {
                break;
            }
            assert!(std::time::Instant::now() < deadline, "watcher never fired");
            std::thread::sleep(Duration::from_millis(50));
        }
        let batches = seen.lock().unwrap();
        let first = &batches[0];
        assert!(
            first.iter().any(|p| p.ends_with("a.md")) && first.iter().any(|p| p.ends_with("b.md")),
            "both writes coalesced into the first debounce window: {first:?}"
        );
    }

    /// Build a synthetic notify event naming one path, so a debounce window
    /// collects a non-empty dirty set and fires `on_dirty`.
    fn event_for(path: &Path) -> notify::Result<notify::Event> {
        Ok(notify::Event {
            kind: notify::EventKind::Modify(notify::event::ModifyKind::Any),
            paths: vec![path.to_path_buf()],
            attrs: Default::default(),
        })
    }

    #[test]
    fn supervisor_respawns_a_panicked_worker_and_rebuilds_resume() {
        use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

        // Drive the supervisor directly over a controlled channel: bypass the
        // FS watcher so the respawn behavior is deterministic, not subject to
        // OS watcher timing. `on_dirty` panics on its FIRST invocation, then
        // succeeds — proving rebuilds resume after a worker death.
        let (tx, rx) = mpsc::channel::<notify::Result<notify::Event>>();
        let rx = Arc::new(Mutex::new(rx));
        let alive = Arc::new(AtomicBool::new(true));

        let calls = Arc::new(AtomicUsize::new(0));
        let succeeded = Arc::new(AtomicBool::new(false));
        let on_dirty = {
            let calls = calls.clone();
            let succeeded = succeeded.clone();
            move |_paths: Vec<PathBuf>| {
                let n = calls.fetch_add(1, Ordering::SeqCst);
                if n == 0 {
                    panic!("simulated worker panic on first dirty batch");
                }
                succeeded.store(true, Ordering::SeqCst);
            }
        };

        let sup = {
            let rx = rx.clone();
            let alive = alive.clone();
            std::thread::spawn(move || {
                supervise(rx, Duration::from_millis(50), on_dirty, alive);
            })
        };

        // First batch: triggers the panic. The supervisor respawns.
        tx.send(event_for(Path::new("a.md"))).unwrap();
        // Give the first worker time to fire, panic, and the supervisor to
        // respawn past its backoff.
        std::thread::sleep(Duration::from_millis(400));
        // Second batch: handled by the respawned worker, succeeds.
        tx.send(event_for(Path::new("b.md"))).unwrap();

        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        while !succeeded.load(Ordering::SeqCst) {
            assert!(
                std::time::Instant::now() < deadline,
                "rebuilds never resumed after the worker panic (calls={})",
                calls.load(Ordering::SeqCst)
            );
            std::thread::sleep(Duration::from_millis(25));
        }
        assert!(
            alive.load(Ordering::SeqCst),
            "a respawned-and-healthy watcher reports alive again"
        );

        // Dropping the sender disconnects the channel: the worker exits
        // cleanly and the supervisor ends supervision, reporting not-alive.
        drop(tx);
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        while alive.load(Ordering::SeqCst) {
            assert!(
                std::time::Instant::now() < deadline,
                "supervisor did not wind down after disconnect"
            );
            std::thread::sleep(Duration::from_millis(25));
        }
        sup.join().unwrap();
    }

    #[test]
    fn collect_skips_engine_owned_cache_and_log_writes_but_keeps_documents() {
        // Perf ADR follow-up: the engine's own cache writes under
        // `.vault/data/engine-data/` (the SQLite db + its WAL/SHM siblings and
        // the declared-graph cache) and serve logs under `.vault/logs/` must NOT
        // dirty the watcher, or every `put_artifact` retriggers a rebuild
        // (rebuild→write→rebuild churn). Real vault documents under other
        // `.vault/` subdirectories still dirty.
        let cache = Path::new("/ws/main/.vault/data/engine-data/engine.sqlite3");
        let wal = Path::new("/ws/main/.vault/data/engine-data/engine.sqlite3-wal");
        let declared_cache = Path::new("/ws/main/.vault/data/engine-data/engine.sqlite3-shm");
        let log = Path::new("/ws/main/.vault/logs/serve.log");
        let doc = Path::new("/ws/main/.vault/plan/2026-06-14-x-plan.md");
        // A user doc whose name merely CONTAINS `data` is not the cache zone.
        let data_named_doc = Path::new("/ws/main/.vault/plan/data-model-plan.md");

        assert!(
            is_engine_owned_path(cache),
            "the sqlite cache is engine-owned"
        );
        assert!(is_engine_owned_path(wal), "the WAL sibling is engine-owned");
        assert!(
            is_engine_owned_path(declared_cache),
            "the SHM sibling is engine-owned"
        );
        assert!(is_engine_owned_path(log), "serve logs are engine-owned");
        assert!(!is_engine_owned_path(doc), "a vault document is watched");
        assert!(
            !is_engine_owned_path(data_named_doc),
            "a `.vault/plan/data-*.md` doc is NOT the engine-owned cache zone"
        );

        // The full collect path drops the engine-owned writes from a batch.
        let mut dirty = Vec::new();
        for p in [cache, wal, log, doc, data_named_doc] {
            collect(event_for(p), &mut dirty);
        }
        assert!(
            dirty.iter().any(|p| p == doc) && dirty.iter().any(|p| p == data_named_doc),
            "documents survive the filter: {dirty:?}"
        );
        assert!(
            !dirty.iter().any(|p| p == cache || p == wal || p == log),
            "no engine-owned cache/log write reaches the dirty set: {dirty:?}"
        );
    }
}
