//! Debounced filesystem watcher (engine-spec §2.4, D2.4): watches each
//! worktree's `.vault/` and `.git` for changes and drives partial
//! re-ingestion of only the dirtied paths. Serve-mode machinery; the
//! one-shot CLI never needs it.

use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;

use notify::{RecursiveMode, Watcher};

#[derive(Debug, thiserror::Error)]
pub enum WatchError {
    #[error("watch: {0}")]
    Notify(#[from] notify::Error),
}

/// A running watcher; dropping it stops watching.
pub struct WatchHandle {
    // Held for lifetime; the watcher stops when dropped.
    _watcher: notify::RecommendedWatcher,
    thread: std::thread::JoinHandle<()>,
}

impl WatchHandle {
    /// Is the debounce thread still running? A panicked or exited thread
    /// means a ZOMBIE watcher — `/status` must say so rather than claim a
    /// resident watcher (audit P12 residual on DF-4).
    pub fn is_alive(&self) -> bool {
        !self.thread.is_finished()
    }
}

/// Watch `roots` recursively, debounce events by `debounce`, and invoke
/// `on_dirty` with the deduplicated set of dirtied paths per window.
pub fn watch(
    roots: &[PathBuf],
    debounce: Duration,
    on_dirty: impl Fn(Vec<PathBuf>) + Send + 'static,
) -> Result<WatchHandle, WatchError> {
    let (tx, rx) = mpsc::channel::<notify::Result<notify::Event>>();
    let mut watcher = notify::recommended_watcher(tx)?;
    for root in roots {
        watcher.watch(root, RecursiveMode::Recursive)?;
    }
    let thread = std::thread::spawn(move || {
        // Debounce loop: first event opens a window; everything arriving
        // within it coalesces into one callback.
        while let Ok(first) = rx.recv() {
            let mut dirty: Vec<PathBuf> = Vec::new();
            collect(first, &mut dirty);
            let deadline = std::time::Instant::now() + debounce;
            while let Some(remaining) = deadline.checked_duration_since(std::time::Instant::now()) {
                match rx.recv_timeout(remaining) {
                    Ok(event) => collect(event, &mut dirty),
                    Err(mpsc::RecvTimeoutError::Timeout) => break,
                    Err(mpsc::RecvTimeoutError::Disconnected) => return,
                }
                if remaining.is_zero() {
                    break;
                }
            }
            if !dirty.is_empty() {
                on_dirty(dirty);
            }
        }
    });
    Ok(WatchHandle {
        _watcher: watcher,
        thread,
    })
}

fn collect(event: notify::Result<notify::Event>, dirty: &mut Vec<PathBuf>) {
    if let Ok(event) = event {
        for path in event.paths {
            if !dirty.contains(&path) {
                dirty.push(path);
            }
        }
    }
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
}
