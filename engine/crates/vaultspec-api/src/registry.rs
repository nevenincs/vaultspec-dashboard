//! The warm multi-scope registry (user-state-persistence W02.P03.S10).
//!
//! Holds N per-scope [`ScopeCell`]s concurrently, keyed by scope token, so a
//! user can browse across the workspace's vault-bearing worktrees and switch
//! instantly against an already-warm scope. A cold scope builds on first
//! access (~2.1s at 4000 docs per the scale-hardening cycle). The working set
//! is bounded by [`WORKING_SET_CAP`]: when a build would exceed it the
//! least-recently-used cell is evicted (its watcher handle dropped, tearing
//! the OS watch down). The ACTIVE scope is pinned and never evicted, so
//! `/status` and the error-path tiers fallback always resolve.
//!
//! The inference crates stay UNTOUCHED: the registry just holds N
//! `LinkageGraph`s, and `engine-query`/`engine-graph` read fns are already
//! pure over one graph. The registry adds NO sibling semantics — it is pure
//! scope multiplexing over the existing read-and-infer serve path.

use std::collections::HashMap;
use std::sync::Arc;

use engine_model::ScopeRef;

use crate::app::{AppState, ScopeCell};

/// Warm-scope working-set ceiling: how many per-scope cells the registry keeps
/// resident at once. Each cell holds a full `LinkageGraph` plus a watcher, so
/// the cap bounds a many-worktree workspace's memory footprint; beyond it the
/// least-recently-used cell is evicted. Small by design — a user browses a
/// handful of worktrees at a time, and a cold re-build on return is ~seconds.
pub const WORKING_SET_CAP: usize = 6;

/// The warm per-scope cell map plus LRU recency tracking. `cells` holds the
/// warm cells by scope token; `recency` is most-recently-used-LAST, so the
/// front is the eviction candidate.
pub struct ScopeRegistry {
    cells: HashMap<String, Arc<ScopeCell>>,
    /// Scope tokens ordered by use, least-recent first. Touched on every
    /// resolve so eviction drops the genuinely-coldest scope.
    recency: Vec<String>,
}

impl Default for ScopeRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl ScopeRegistry {
    pub fn new() -> Self {
        ScopeRegistry {
            cells: HashMap::new(),
            recency: Vec::new(),
        }
    }

    /// Number of warm cells currently resident.
    pub fn len(&self) -> usize {
        self.cells.len()
    }

    pub fn is_empty(&self) -> bool {
        self.cells.is_empty()
    }

    /// The warm cell for a token, if resident. Does NOT mark MRU — callers that
    /// want recency tracking use [`ScopeRegistry::touch`].
    fn peek(&self, token: &str) -> Option<Arc<ScopeCell>> {
        self.cells.get(token).cloned()
    }

    /// Public, recency-free peek for the always-warm active scope (used by
    /// `AppState::active_cell` on the `/status` and tiers-fallback paths).
    pub fn peek_arc(&self, token: &str) -> Option<Arc<ScopeCell>> {
        self.cells.get(token).cloned()
    }

    /// Mark a token most-recently-used.
    fn touch(&mut self, token: &str) {
        self.recency.retain(|t| t != token);
        self.recency.push(token.to_string());
    }

    /// Insert a freshly-built cell, marking it MRU.
    fn insert(&mut self, token: String, cell: Arc<ScopeCell>) {
        self.cells.insert(token.clone(), cell);
        self.touch(&token);
    }

    /// Evict the least-recently-used cell that is NOT the pinned active scope,
    /// returning the evicted cell (whose watcher tears down on drop). Returns
    /// `None` when nothing is evictable (only the pinned scope remains).
    fn evict_lru(&mut self, pinned: &str) -> Option<Arc<ScopeCell>> {
        let victim = self
            .recency
            .iter()
            .find(|t| t.as_str() != pinned)
            .cloned()?;
        self.recency.retain(|t| t != &victim);
        self.cells.remove(&victim)
    }
}

/// Resolve a scope token to its warm cell, building it on first access.
///
/// If the cell is already resident it is marked most-recently-used and the
/// `Arc` clone is returned. Otherwise the token is validated as a selectable
/// vault-bearing worktree in this workspace, the cell is built (store opened,
/// graph indexed, watcher spawned), inserted, and — if the working set is now
/// over [`WORKING_SET_CAP`] — the least-recently-used non-active cell is
/// evicted (dropping its watcher).
///
/// This is a free function rather than a method so it can take `&AppState`
/// (which itself owns the registry behind an `RwLock`) without a nested borrow.
pub fn get_or_build(state: &AppState, token: &str) -> Result<Arc<ScopeCell>, String> {
    // Fast path: already warm. Touch MRU and return.
    {
        let mut reg = state.registry.write().unwrap_or_else(|e| e.into_inner());
        if let Some(cell) = reg.peek(token) {
            reg.touch(token);
            return Ok(cell);
        }
    }

    // Cold path: validate the scope is a selectable vault-bearing worktree in
    // this workspace, then build + insert.
    let root = validate_scope_token(state, token)?;
    build_and_insert(state, token, root)
}

/// Warm the launch scope's cell DIRECTLY from a known-good root, bypassing the
/// worktree-membership check that `get_or_build` runs on client-supplied
/// scopes. The launch root is trusted by construction (the boot path already
/// resolved it to a vault-bearing worktree, and the unit-test fixtures are
/// non-git temp corpora that are not enumerable worktrees), so `build_state`
/// seeds the active cell through this path rather than `get_or_build`.
pub fn build_active(state: &AppState, root: std::path::PathBuf) -> Result<Arc<ScopeCell>, String> {
    let token = crate::routes::scope_token(&root);
    build_and_insert(state, &token, root)
}

/// Open the store, build + index the cell, spawn its watcher, and insert it
/// under the registry lock (evicting the LRU non-active cell if over cap).
/// Shared by `get_or_build` (client scopes, post-validation) and `build_active`
/// (the launch scope).
fn build_and_insert(
    state: &AppState,
    token: &str,
    root: std::path::PathBuf,
) -> Result<Arc<ScopeCell>, String> {
    // Build (index + watcher spawn) OUTSIDE the registry lock so a slow cold
    // build never blocks other scopes' fast-path resolves.
    let scope = ScopeRef::Worktree {
        path: token.to_string(),
    };
    let store = engine_store::Store::open_or_heal(&root.join(".vault"))
        .map_err(|e| format!("opening store for scope `{token}`: {e}"))?;
    let cell = Arc::new(ScopeCell::new(root.clone(), scope, store));

    // Cold initial index (the same pipeline the one-shot CLI runs, D2.4).
    cell.rebuild_and_swap()
        .map_err(|e| format!("indexing scope `{token}`: {e}"))?;

    // Spawn this cell's watcher → rebuild-at-scope-granularity → swap + diff
    // broadcast on the cell's OWN clock (W02.P04.S13). Held in the cell so
    // `/status` reports a dead watcher truthfully and eviction tears it down.
    spawn_watcher(&cell);

    // Insert under the lock. A concurrent builder may have won the race for the
    // same token while we built outside the lock — if so, prefer the resident
    // cell and drop ours (its watcher tears down on drop), so the registry
    // holds exactly one cell per scope.
    let active = state
        .active_scope
        .read()
        .map(|s| s.clone())
        .unwrap_or_else(|e| e.into_inner().clone());
    let mut reg = state.registry.write().unwrap_or_else(|e| e.into_inner());
    if let Some(existing) = reg.peek(token) {
        reg.touch(token);
        return Ok(existing);
    }
    reg.insert(token.to_string(), cell.clone());
    // Evict down to the cap, never the pinned active scope. The evicted cell's
    // watcher handle drops here, tearing its OS watch down.
    while reg.len() > WORKING_SET_CAP {
        if reg.evict_lru(&active).is_none() {
            break;
        }
    }
    Ok(cell)
}

/// Spawn the per-scope watcher, wiring its dirty batches to a rebuild-and-swap
/// on THIS cell's clock. Mirrors the single-scope watcher loop that used to
/// live in `serve`, now per warm scope.
fn spawn_watcher(cell: &Arc<ScopeCell>) {
    let (dirty_tx, mut dirty_rx) = tokio::sync::mpsc::unbounded_channel::<usize>();
    let watch_handle = match engine_graph::watch::watch(
        &engine_graph::watch::watch_roots(&cell.root),
        std::time::Duration::from_millis(2000),
        move |paths| {
            let _ = dirty_tx.send(paths.len());
        },
    ) {
        Ok(handle) => handle,
        Err(e) => {
            // A watcher that fails to start is logged, never fatal: the scope
            // still serves a static graph and `/status` reports the watcher as
            // not running (DF-4). Cold re-builds are lost until restart.
            eprintln!(
                "vaultspec serve: watcher for scope `{}` failed to start: {e}",
                cell.root.display()
            );
            return;
        }
    };
    // Held in the cell so /status can report a dead watcher truthfully and
    // eviction tears it down. Poison recovery (robustness H2).
    *cell.watcher.lock().unwrap_or_else(|e| e.into_inner()) = Some(watch_handle);

    // Drive rebuilds on a spawned task only if a tokio runtime is present.
    // The unit-test `build_state` path runs OUTSIDE a runtime (no reactor), so
    // guard the spawn — the watcher still installs, it just has no rebuild task
    // there (tests rebuild explicitly). Under `serve` the runtime is always up.
    //
    // The task holds a `Weak<ScopeCell>`, NEVER a strong `Arc` (HIGH-1 fix). A
    // strong clone would form a reference cycle: task → Arc<ScopeCell> →
    // `cell.watcher` (the WatchHandle owning `dirty_tx`) → keeps `dirty_rx`
    // open → `recv().await` never returns None → the task loops forever holding
    // the cell. Eviction would then drop only the registry's ref, leaking the
    // cell, its WatchHandle, the OS watch, the supervisor thread, AND the
    // rebuild task — defeating WORKING_SET_CAP and rebuilding an evicted scope
    // on every FS change. With a `Weak`, the moment the registry (and any
    // caller) drops its strong ref the cell's strong count reaches 0; the
    // WatchHandle drops, tearing the OS watch down and closing `dirty_tx`, so
    // the next `recv().await` returns None and the task exits promptly. This
    // holds for BOTH the LRU-eviction path and the concurrent-cold-build-race
    // loser (whose cell Arc is dropped when `build_and_insert` returns the
    // resident cell). `upgrade()` per iteration is the belt-and-braces guard:
    // if a dirty batch races the final drop, the rebuild is skipped and the
    // loop ends.
    if let Ok(handle) = tokio::runtime::Handle::try_current() {
        let weak = Arc::downgrade(cell);
        handle.spawn(async move {
            while dirty_rx.recv().await.is_some() {
                // Upgrade per batch: a `None` means the cell was evicted
                // (strong count hit 0) between this dirty event and now — stop
                // rebuilding a dead scope and let the task exit.
                let Some(cell) = weak.upgrade() else {
                    break;
                };
                // Rebuild failures are LOGGED, never silently swallowed
                // (DF-4): a contended store is a wait-and-retry on the next
                // dirty batch, not a death.
                match tokio::task::spawn_blocking(move || cell.rebuild_and_swap()).await {
                    Ok(Ok(_)) => {}
                    Ok(Err(e)) => eprintln!("vaultspec serve: rebuild failed: {e}"),
                    Err(e) => eprintln!("vaultspec serve: rebuild task panicked: {e}"),
                }
            }
        });
    }
}

/// Validate that a scope token names a selectable vault-bearing worktree in
/// this workspace, returning its canonical root path. An unknown or non-vault
/// scope is rejected (the caller maps the `Err` to an honest 400). This is the
/// registry-side membership check; the route-side `validate_scope` wraps it in
/// the API error envelope (W02.P04.S15).
pub fn validate_scope_token(state: &AppState, token: &str) -> Result<std::path::PathBuf, String> {
    let normalize = |s: &str| {
        let s = s.replace('\\', "/");
        let s = s.strip_prefix("//?/").unwrap_or(&s).to_string();
        s.trim_end_matches('/').to_string()
    };
    let wanted = normalize(token);
    let workspace = ingest_git::workspace::Workspace::discover(&state.workspace_root)
        .map_err(|e| format!("workspace discovery failed: {e}"))?;
    let worktrees = ingest_git::worktrees::enumerate(&workspace)
        .map_err(|e| format!("worktree enumeration failed: {e}"))?;
    for wt in worktrees {
        if normalize(&crate::routes::scope_token(&wt.path)) == wanted {
            if !wt.path.join(".vault").is_dir() {
                return Err(format!(
                    "scope `{token}` is a worktree of this workspace but carries no \
                     .vault corpus; it is not a selectable scope"
                ));
            }
            return Ok(wt.path);
        }
    }
    Err(format!(
        "scope `{token}` is not a selectable worktree in this workspace"
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vault_root(dir: &std::path::Path) {
        std::fs::create_dir_all(dir.join(".vault/plan")).unwrap();
        std::fs::write(
            dir.join(".vault/plan/2026-06-14-reg-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#reg'\n---\n\nMentions `src/a.rs`.\n",
        )
        .unwrap();
    }

    fn git(dir: &std::path::Path, args: &[&str]) {
        let out = std::process::Command::new("git")
            .current_dir(dir)
            .args(args)
            .env("GIT_AUTHOR_NAME", "f")
            .env("GIT_AUTHOR_EMAIL", "f@t")
            .env("GIT_COMMITTER_NAME", "f")
            .env("GIT_COMMITTER_EMAIL", "f@t")
            .output()
            .expect("git runs");
        assert!(out.status.success(), "git {args:?}");
    }

    #[test]
    fn resolving_an_unknown_scope_is_rejected() {
        // A scope that is not a worktree of this workspace must be rejected —
        // the registry never builds a cell for an arbitrary path.
        let dir = tempfile::tempdir().unwrap();
        git(dir.path(), &["init", "-b", "main", "."]);
        vault_root(dir.path());
        git(dir.path(), &["add", "."]);
        git(dir.path(), &["commit", "-m", "fixture"]);
        let state = crate::app::build_state(dir.path().to_path_buf());

        let err = match get_or_build(&state, "/no/such/worktree") {
            Ok(_) => panic!("an unknown scope must not build a cell"),
            Err(e) => e,
        };
        assert!(
            err.contains("not a selectable worktree"),
            "unknown scope is rejected honestly: {err}"
        );
    }

    #[test]
    fn the_launch_scope_is_warm_after_boot_and_marks_mru() {
        // build_state eagerly warms the launch scope; resolving it again is a
        // fast-path hit that returns the SAME cell (Arc-identity).
        let dir = tempfile::tempdir().unwrap();
        git(dir.path(), &["init", "-b", "main", "."]);
        vault_root(dir.path());
        git(dir.path(), &["add", "."]);
        git(dir.path(), &["commit", "-m", "fixture"]);
        let state = crate::app::build_state(dir.path().to_path_buf());
        let token = crate::routes::scope_token(&state.workspace_root);

        let a = get_or_build(&state, &token).unwrap();
        let b = get_or_build(&state, &token).unwrap();
        assert!(
            Arc::ptr_eq(&a, &b),
            "the warm launch scope resolves to one shared cell"
        );
        assert_eq!(
            state.registry.read().unwrap().len(),
            1,
            "only the launch scope is warm"
        );
    }

    #[tokio::test]
    async fn eviction_drops_the_evicted_cell_and_its_watcher_with_no_leaked_rebuild_task() {
        // HIGH-1 regression: the per-scope rebuild task must NOT keep the
        // evicted cell alive. WITHOUT the `Weak` fix the task holds a strong
        // `Arc<ScopeCell>` → `cell.watcher` (owning `dirty_tx`) → `dirty_rx`
        // stays open → `recv().await` never returns None → the task loops
        // forever → the evicted cell, its WatchHandle, the OS watch, the
        // supervisor thread, and the task all leak, defeating WORKING_SET_CAP.
        //
        // The cycle only exists when (a) a tokio runtime is current so the
        // rebuild task spawns and (b) the watcher actually STARTED so it owns a
        // live `dirty_tx`. So this is a `#[tokio::test]` over REAL git worktrees
        // (the watcher watches `.git`; a non-git root makes `watch()` fail to
        // start, skipping the task and hiding the bug). It forces exactly one
        // eviction and asserts the evicted cell's strong count reaches 0 (a held
        // `Weak` no longer upgrades).
        //
        // Fails before the fix (the task's strong Arc keeps `upgrade()` Some);
        // passes after (only a `Weak` remains, so the cell drops on eviction).
        use std::sync::Weak;

        let workspace = tempfile::tempdir().unwrap();
        let main = workspace.path().join("main");
        std::fs::create_dir_all(&main).unwrap();
        git(&main, &["init", "-b", "main", "."]);
        vault_root(&main);
        git(&main, &["add", "."]);
        git(&main, &["commit", "-m", "fixture"]);

        // The main checkout is the pinned active scope (warmed by build_state),
        // never evicted. Add WORKING_SET_CAP linked worktrees, each
        // vault-bearing, so the registry holds active + CAP non-active cells
        // (CAP + 1 total) once all are warm — and inserting the last one evicts
        // the LRU non-active cell (the first sibling warmed).
        let state = crate::app::build_state(main.clone());

        let ws = ingest_git::workspace::Workspace::discover(&main).unwrap();
        let mut victim: Option<Weak<ScopeCell>> = None;
        for i in 0..WORKING_SET_CAP {
            let wt = workspace.path().join(format!("wt-{i}"));
            git(
                &main,
                &[
                    "worktree",
                    "add",
                    "-b",
                    &format!("feat-{i}"),
                    wt.to_str().unwrap(),
                ],
            );
            vault_root(&wt);
            // Resolve this worktree's canonical scope token exactly as a client
            // would, then warm it through the real validated `get_or_build`
            // path (build + spawn_watcher + insert + evict).
            let token = {
                let wts = ingest_git::worktrees::enumerate(&ws).unwrap();
                let canon = std::fs::canonicalize(&wt).unwrap();
                wts.into_iter()
                    .map(|w| crate::routes::scope_token(&w.path))
                    .find(|t| {
                        crate::routes::scope_token(&canon).trim_end_matches('/')
                            == t.trim_end_matches('/')
                    })
                    .expect("the new worktree is enumerable")
            };
            let cell = get_or_build(&state, &token).expect("sibling worktree warms");
            // The watcher MUST have started for this test to exercise the cycle;
            // a non-started watcher would hide the leak.
            assert!(
                cell.watcher
                    .lock()
                    .unwrap()
                    .as_ref()
                    .is_some_and(|h| h.is_alive()),
                "the sibling worktree's watcher must be live to exercise the cycle"
            );
            if i == 0 {
                // Hold ONLY a Weak to the LRU victim; never retain its Arc, or
                // the test itself would be the strong ref under examination.
                victim = Some(Arc::downgrade(&cell));
            }
            // `cell` (the strong Arc) drops at the end of each iteration; the
            // registry holds the canonical strong ref until eviction.
        }

        let victim = victim.expect("captured the LRU victim");

        // The registry is bounded at the cap (active + CAP-1 survivors after
        // one eviction). The pinned active scope is never the victim.
        assert_eq!(
            state.registry.read().unwrap().len(),
            WORKING_SET_CAP,
            "registry held to the working-set cap after eviction"
        );

        // Give the evicted cell's WatchHandle drop + task teardown a moment to
        // settle (the rebuild task wakes when its `dirty_tx` closes; the OS-watch
        // supervisor joins out of band on drop).
        for _ in 0..100 {
            if victim.upgrade().is_none() {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }

        // The leak assertion: the evicted cell's strong count is 0. Before the
        // fix the rebuild task's strong Arc keeps this `Some`, so this fails.
        assert!(
            victim.upgrade().is_none(),
            "the evicted cell leaked: its strong count never reached 0 — the \
             rebuild task is still holding it (HIGH-1 cycle), so WORKING_SET_CAP \
             is defeated and the evicted scope keeps rebuilding"
        );
    }
}
