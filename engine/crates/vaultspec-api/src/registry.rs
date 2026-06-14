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

    /// The scope tokens of every resident (warm) cell. Used by `/settings` to
    /// enumerate which scopes' scoped keys to surface — a recency-free,
    /// snapshot-only read that touches nothing.
    pub fn scope_tokens(&self) -> Vec<String> {
        self.cells.keys().cloned().collect()
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

    /// Evict every warm cell whose scope token satisfies `predicate` EXCEPT the
    /// pinned active scope, returning the count evicted. Used when forgetting a
    /// registered workspace (dashboard-workspace-registry ADR): its warm scope
    /// cells are dropped so the forgotten project's corpus does not linger warm.
    /// Each evicted cell's watcher tears down on drop. The pinned active scope is
    /// never evicted here (a forget of the active workspace re-points the active
    /// scope first, at the route layer, before this runs).
    pub fn evict_where(&mut self, pinned: &str, predicate: impl Fn(&str) -> bool) -> usize {
        let victims: Vec<String> = self
            .cells
            .keys()
            .filter(|t| t.as_str() != pinned && predicate(t))
            .cloned()
            .collect();
        for victim in &victims {
            self.recency.retain(|t| t != victim);
            self.cells.remove(victim);
        }
        victims.len()
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

    // Fold the slow declared tier in asynchronously (perf ADR D1): the cold
    // `rebuild_and_swap` above committed the STRUCTURAL graph synchronously, so
    // the scope is already servable; this defers the core subprocess off the
    // critical path. A no-op when no tokio runtime is current (unit tests),
    // where `rebuild_and_swap` ingested declared inline instead.
    spawn_declared_fold(&cell);

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
                // dirty batch, not a death. `rebuild_and_swap` commits the
                // structural tier; the declared fold rides a separate task so a
                // new commit re-folds declared at the new HEAD (perf ADR D1).
                let rebuild_cell = cell.clone();
                match tokio::task::spawn_blocking(move || rebuild_cell.rebuild_and_swap()).await {
                    Ok(Ok(_)) => spawn_declared_fold(&cell),
                    Ok(Err(e)) => eprintln!("vaultspec serve: rebuild failed: {e}"),
                    Err(e) => eprintln!("vaultspec serve: rebuild task panicked: {e}"),
                }
            }
        });
    }
}

/// Engine-store artifact kind for the cached raw core graph JSON, keyed by the
/// worktree HEAD sha (perf ADR D1). The declared graph at a commit is immutable,
/// so a rebuild at an unchanged HEAD is a cache hit that skips the ~16s core
/// subprocess entirely. Lives in the re-derivable `.vault/data/engine-data/`
/// zone — fully deletable, rebuildable on the next miss.
const DECLARED_GRAPH_KIND: &str = "declared-graph-v2";

/// Cache key for the declared graph: the worktree HEAD sha qualified by the
/// scope token, so two scopes at the same commit never alias each other's
/// cached JSON (defensive — the JSON is scope-independent, but the qualified
/// key documents the `(scope, HEAD sha)` ADR contract).
fn declared_cache_key(scope_token: &str, head_sha: &str) -> String {
    engine_model::content_hash(format!("{scope_token}:{head_sha}").as_bytes())
}

/// Asynchronously fold the declared tier into a cell's live graph (perf ADR
/// D1 — the dominant win: the slow `vaultspec-core vault graph` subprocess off
/// the servable-parse critical path).
///
/// The structural graph is already committed and servable; this task resolves
/// the worktree HEAD sha, gets the declared graph JSON (cache hit → no
/// subprocess; miss → run the subprocess and cache the JSON by HEAD sha),
/// clones the cell's CURRENT graph, ingests the declared edges into the clone,
/// and `commit_graph`s the folded graph — emitting declared deltas on the
/// cell's per-scope monotonic clock. `declared_status` flips to `None`
/// (declared AVAILABLE) on success, or `Some(reason)` if core was unreachable
/// (truthful degrade).
///
/// LEAK-SAFE (HIGH-1 discipline, like `spawn_watcher`): the task holds a
/// `Weak<ScopeCell>`, upgrading per use and exiting if the cell was evicted —
/// it never keeps a dead scope alive.
///
/// COALESCED with a closed trailing edge (perf ADR D1, review HIGH): a per-cell
/// `declared_fold_active` flag means at most one fold runs per cell at a time.
/// If one is already in flight, this sets the `declared_fold_pending`
/// trailing-edge flag instead of dropping the request — the in-flight fold's
/// completion guard sees the flag and re-spawns a fold at the CURRENT HEAD. So
/// even when a rebuild that races a fold is the LAST change (no further rebuild
/// to piggy-back on), the latest structural commit STILL gets a declared fold;
/// the tier never serves a superseded commit's edges indefinitely.
pub fn spawn_declared_fold(cell: &Arc<ScopeCell>) {
    use std::sync::atomic::Ordering;

    // Only runs under a tokio runtime; the non-runtime (unit-test) path folds
    // declared inline in `rebuild_and_swap`, so there is nothing to defer here.
    if tokio::runtime::Handle::try_current().is_err() {
        return;
    }

    // Coalesce: claim the fold slot. If another fold is in flight, record the
    // trailing edge (a fold is owed at the current HEAD) and return; the running
    // fold re-spawns on completion. Re-check after setting `pending` to close the
    // lost-wakeup window: if the in-flight fold cleared `active` between our
    // failed claim and our `pending` set, it may have already observed `pending`
    // as false and finished — so we re-attempt the claim ourselves rather than
    // leave an owed fold stranded.
    if cell
        .declared_fold_active
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        cell.declared_fold_pending.store(true, Ordering::Release);
        if cell
            .declared_fold_active
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            // Still in flight: the running fold owns the trailing edge now.
            return;
        }
        // We won the slot after all; consume the flag WE just set (we are about
        // to fold at the current HEAD, satisfying it) and fall through to spawn.
        cell.declared_fold_pending.store(false, Ordering::Release);
    }

    spawn_claimed_fold(cell);
}

/// Spawn the fold task for a cell that has ALREADY claimed the
/// `declared_fold_active` slot. Leak-safe: the task holds a `Weak<ScopeCell>`
/// and upgrades inside, so an eviction between spawn and run cleanly aborts.
fn spawn_claimed_fold(cell: &Arc<ScopeCell>) {
    let Ok(handle) = tokio::runtime::Handle::try_current() else {
        // Claimed but no runtime to run on: release the slot so a later
        // (runtime-backed) spawn can claim it. Defensive — callers only reach
        // here under a runtime.
        cell.declared_fold_active
            .store(false, std::sync::atomic::Ordering::Release);
        return;
    };
    let weak = Arc::downgrade(cell);
    handle.spawn(async move {
        // The subprocess + CPU ingest is blocking; run it OFF the async reactor.
        let result = tokio::task::spawn_blocking(move || declared_fold_blocking(&weak)).await;
        if let Err(e) = result {
            eprintln!("vaultspec serve: declared fold task panicked: {e}");
        }
    });
}

/// The blocking body of the declared fold (perf ADR D1): HEAD-sha resolve →
/// cache-or-subprocess JSON → clone-and-fold → commit. Runs on a blocking
/// thread; the completion guard releases the coalescing slot and re-spawns a
/// fold if a rebuild raced this one (the trailing-edge close, review HIGH).
fn declared_fold_blocking(weak: &std::sync::Weak<ScopeCell>) {
    use std::sync::atomic::Ordering;

    // Upgrade once at the top; if the cell was evicted, there is nothing to fold
    // and the flag died with the cell — exit.
    let Some(cell) = weak.upgrade() else {
        return;
    };
    // On EVERY exit path (including a panic): release the coalescing slot, then
    // — if a rebuild raced this fold (`declared_fold_pending` set) — re-spawn a
    // fold at the CURRENT HEAD so the latest structural commit is never left
    // unfolded. The guard holds a `Weak` for the re-spawn so it can never keep
    // an evicted cell alive (HIGH-1 discipline). Termination: a re-spawn only
    // happens when `pending` was actually set by a concurrent rebuild, and the
    // re-spawned fold clears it; on a STABLE HEAD no rebuild fires, so `pending`
    // stays false and the chain ends.
    struct FoldGuard {
        cell: std::sync::Weak<ScopeCell>,
    }
    impl Drop for FoldGuard {
        fn drop(&mut self) {
            let Some(cell) = self.cell.upgrade() else {
                return;
            };
            cell.declared_fold_active.store(false, Ordering::Release);
            // Trailing edge: a rebuild landed mid-fold and could not claim the
            // slot. Re-spawn now that the slot is free, folding at the current
            // HEAD. `swap` consumes the flag so a single race triggers exactly
            // one re-spawn.
            if cell.declared_fold_pending.swap(false, Ordering::AcqRel) {
                spawn_declared_fold(&cell);
            }
        }
    }
    let _guard = FoldGuard { cell: weak.clone() };

    // Resolve the worktree HEAD sha (read-and-infer: object-DB read, no
    // checkout). A failure here (detached/empty repo, gix error) means we
    // cannot key the cache — fall through to an uncached subprocess read so the
    // declared tier still lands; only the cache speed-up is lost.
    let head_sha = engine_graph::asof::resolve_ref(&cell.root, "HEAD").ok();

    // Get the declared graph JSON: cache hit (no subprocess) or miss
    // (subprocess, then cache the JSON by HEAD sha).
    let json: Result<String, String> = match &head_sha {
        Some(sha) => {
            let key = declared_cache_key(&crate::routes::scope_token(&cell.root), sha);
            let cached = {
                let store = cell.store.lock().unwrap_or_else(|e| e.into_inner());
                store.get_artifact(DECLARED_GRAPH_KIND, &key).ok().flatten()
            };
            match cached {
                Some(json) => Ok(json),
                None => {
                    // Cache miss: run the subprocess (read-and-infer `--ref
                    // HEAD`), then persist the JSON by HEAD sha for instant
                    // repeat-switch / restart at this commit.
                    let fetched =
                        engine_graph::index::fetch_core_graph_json(&cell.root, Some("HEAD"));
                    if let Ok(json) = &fetched {
                        let store = cell.store.lock().unwrap_or_else(|e| e.into_inner());
                        if let Err(e) = store.put_artifact(
                            DECLARED_GRAPH_KIND,
                            &key,
                            json,
                            crate::app::now_ms(),
                        ) {
                            eprintln!("vaultspec serve: caching declared graph failed: {e}");
                        }
                    }
                    fetched
                }
            }
        }
        // No HEAD sha: uncached subprocess read (declared tier still lands).
        None => engine_graph::index::fetch_core_graph_json(&cell.root, Some("HEAD")),
    };

    // Clone the cell's CURRENT structural graph and fold the declared edges into
    // the clone, then commit. Cloning (not re-parsing) is why `LinkageGraph` is
    // `Clone` (perf ADR D1): clone(structural)+declared is byte-identical to a
    // synchronous structural+declared build (D8.2 convergence), since declared
    // ingest is replace-by-id idempotent over the structural graph.
    let declared_status = match json {
        Ok(json) => {
            let mut folded = (*cell.graph_arc()).clone();
            let (_, unavailable) = engine_graph::index::ingest_declared_from_json(
                &mut folded,
                &json,
                &cell.scope,
                crate::app::now_ms(),
            );
            // Commit the folded graph: emits declared deltas on the cell's
            // per-scope clock + ring (no separate clock), and bumps generation.
            cell.commit_graph(folded);
            unavailable
        }
        // Core unreachable: leave the structural graph served, report the
        // declared tier unavailable TRUTHFULLY (replaces the building sentinel).
        Err(reason) => Some(reason),
    };
    if let Ok(mut status) = cell.declared_status.write() {
        *status = declared_status;
    }
}

/// Validate that a scope token names a selectable vault-bearing worktree in the
/// ACTIVE WORKSPACE, returning its canonical root path. An unknown or non-vault
/// scope is rejected (the caller maps the `Err` to an honest 400). This is the
/// registry-side membership check; the route-side `validate_scope` wraps it in
/// the API error envelope (W02.P04.S15).
///
/// Multi-workspace generalization (dashboard-workspace-registry ADR, P03.S11):
/// the worktree set a scope is resolved against is the *active workspace's*
/// enumerable worktrees, not one frozen launch value — so switching the active
/// workspace re-points which worktrees are selectable. The active workspace
/// defaults to the launch workspace when no registry selection exists yet, so
/// the single-workspace behaviour is unchanged. READ-ONLY: discovery and
/// enumeration never mutate anything.
pub fn validate_scope_token(state: &AppState, token: &str) -> Result<std::path::PathBuf, String> {
    let normalize = |s: &str| {
        let s = s.replace('\\', "/");
        let s = s.strip_prefix("//?/").unwrap_or(&s).to_string();
        s.trim_end_matches('/').to_string()
    };
    let wanted = normalize(token);
    let active_root = state.active_workspace_root();
    let workspace = ingest_git::workspace::Workspace::discover(&active_root)
        .map_err(|e| format!("workspace discovery failed: {e}"))?;
    let worktrees = ingest_git::worktrees::enumerate(&workspace)
        .map_err(|e| format!("worktree enumeration failed: {e}"))?;
    for wt in worktrees {
        if normalize(&crate::routes::scope_token(&wt.path)) == wanted {
            if !wt.path.join(".vault").is_dir() {
                return Err(format!(
                    "scope `{token}` is a worktree of the active workspace but carries \
                     no .vault corpus; it is not a selectable scope"
                ));
            }
            return Ok(wt.path);
        }
    }
    Err(format!(
        "scope `{token}` is not a selectable worktree in the active workspace"
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

    #[test]
    fn scope_validation_follows_the_active_workspace_and_warm_cells_span_workspaces() {
        // P03.S11/S12: validate_scope resolves a worktree against the ACTIVE
        // WORKSPACE's enumerable worktrees, and warm cells may belong to any
        // registered workspace, each keeping its OWN delta clock.
        //
        // Two SEPARATE git workspaces (A = launch, B = a registered sibling).
        // A worktree of B is NOT a worktree of A, so it is only selectable once
        // B is the active workspace — proving scope routing follows the active
        // workspace, not one frozen launch value.
        let parent = tempfile::tempdir().unwrap();
        let a = parent.path().join("project-a");
        let b = parent.path().join("project-b");
        std::fs::create_dir_all(&a).unwrap();
        std::fs::create_dir_all(&b).unwrap();
        for dir in [&a, &b] {
            git(dir, &["init", "-b", "main", "."]);
            vault_root(dir);
            git(dir, &["add", "."]);
            git(dir, &["commit", "-m", "fixture"]);
        }
        let a_id = crate::routes::scope_token(
            &ingest_git::workspace::Workspace::discover(&a)
                .unwrap()
                .common_dir,
        );
        let b_id = crate::routes::scope_token(
            &ingest_git::workspace::Workspace::discover(&b)
                .unwrap()
                .common_dir,
        );
        let b_scope = crate::routes::scope_token(&std::fs::canonicalize(&b).unwrap());

        // Launch in A; register both A and B in the registry.
        let state = crate::app::build_state(a.clone());
        {
            let us = state.user_state.lock().unwrap();
            us.auto_register_launch(&a_id, "a", &crate::routes::scope_token(&a), 1)
                .unwrap();
            us.add_root(
                &vaultspec_session::WorkspaceRoot {
                    id: b_id.clone(),
                    label: "b".into(),
                    path: crate::routes::scope_token(&std::fs::canonicalize(&b).unwrap()),
                    is_launch: false,
                    reachable: true,
                    unreachable_reason: None,
                },
                2,
            )
            .unwrap();
            us.set_active_workspace(&a_id, 3).unwrap();
        }

        // While A is active, B's worktree is NOT a selectable scope.
        assert!(
            validate_scope_token(&state, &b_scope).is_err(),
            "B's worktree is not selectable while A is the active workspace"
        );

        // Switch the active workspace to B; now B's worktree validates.
        {
            let us = state.user_state.lock().unwrap();
            us.set_active_workspace(&b_id, 4).unwrap();
        }
        let resolved = validate_scope_token(&state, &b_scope)
            .expect("B's worktree is selectable once B is the active workspace");
        assert_eq!(
            crate::routes::scope_token(&resolved).trim_end_matches('/'),
            b_scope.trim_end_matches('/'),
            "validation resolves the B worktree against B's enumerable worktrees"
        );

        // Warm B's cell: the launch (A) cell and B's cell coexist, each with its
        // OWN independent delta clock (per-scope clock preserved across
        // workspaces). A rebuild on B advances only B's clock.
        let b_cell = get_or_build(&state, &b_scope).expect("B's scope warms");
        let a_token = crate::routes::scope_token(&state.workspace_root);
        let a_cell = state
            .registry
            .read()
            .unwrap()
            .peek_arc(&a_token)
            .expect("A's launch cell is still warm");
        assert!(
            !Arc::ptr_eq(&a_cell, &b_cell),
            "A and B are distinct warm cells from distinct workspaces"
        );
        use std::sync::atomic::Ordering;
        let a_before = a_cell.seq.load(Ordering::SeqCst);
        b_cell.rebuild_and_swap().unwrap();
        assert_eq!(
            a_cell.seq.load(Ordering::SeqCst),
            a_before,
            "rebuilding B's cell does not touch A's per-scope clock"
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

    /// A real worktree cell holding a STRUCTURAL graph, for the declared-fold
    /// cache tests. Builds a one-commit git repo with one vault doc, opens a
    /// real store, and commits the structural-only graph (no declared tier yet).
    fn structural_cell(dir: &std::path::Path) -> (std::path::PathBuf, Arc<ScopeCell>) {
        git(dir, &["init", "-b", "main", "."]);
        vault_root(dir);
        git(dir, &["add", "."]);
        git(dir, &["commit", "-m", "fixture"]);
        let root = std::fs::canonicalize(dir).unwrap();
        let token = crate::routes::scope_token(&root);
        let store = engine_store::Store::open_or_heal(&root.join(".vault")).unwrap();
        let cell = Arc::new(ScopeCell::new(
            root.clone(),
            ScopeRef::Worktree {
                path: token.clone(),
            },
            store,
        ));
        // Commit STRUCTURAL only (no runtime here, but build it through the same
        // path index_worktree_structural produces, then commit directly so we do
        // NOT trip the sync-fallback declared ingest in rebuild_and_swap).
        let (structural, _) = {
            let store = cell.store.lock().unwrap();
            engine_graph::index::index_worktree_structural(
                &cell.root,
                &cell.scope,
                &store,
                crate::app::now_ms(),
            )
            .unwrap()
        };
        cell.commit_graph(structural);
        (root, cell)
    }

    /// A minimal valid `vaultspec.vault.graph.v2` `data` payload declaring ONE
    /// edge between two documents — the cacheable JSON the fold ingests.
    fn declared_graph_json() -> String {
        serde_json::json!({
            "nodes": [
                {"id": "2026-06-14-reg-plan", "doc_type": "plan"},
                {"id": "2026-06-14-reg-adr", "doc_type": "adr"}
            ],
            "edges": [
                {"source": "2026-06-14-reg-plan", "target": "2026-06-14-reg-adr", "kind": "related"}
            ]
        })
        .to_string()
    }

    #[tokio::test]
    async fn declared_fold_ingests_from_the_head_sha_cache_without_a_subprocess() {
        // Perf ADR D1: the declared graph at a commit is immutable, so the fold
        // caches the raw core JSON by HEAD sha and a build at the same HEAD is a
        // cache HIT that skips the ~16s subprocess. We prove the hit by
        // PRE-SEEDING the cache with valid graph-v2 JSON: core is unavailable in
        // the test env (the temp dir is not a vaultspec workspace), so the
        // declared tier can ONLY become available via the cache. If the fold ran
        // the subprocess instead, it would fail and declared_status would carry a
        // failure reason — never None.
        let dir = tempfile::tempdir().unwrap();
        let (root, cell) = structural_cell(dir.path());

        // The structural commit carries no declared edges yet.
        let structural_edges = cell.graph_arc().edge_count();

        // Seed the cache under the EXACT key the fold computes: HEAD sha,
        // scope-qualified.
        let head_sha = engine_graph::asof::resolve_ref(&root, "HEAD").unwrap();
        let key = declared_cache_key(&crate::routes::scope_token(&root), &head_sha);
        {
            let store = cell.store.lock().unwrap();
            store
                .put_artifact(
                    DECLARED_GRAPH_KIND,
                    &key,
                    &declared_graph_json(),
                    crate::app::now_ms(),
                )
                .unwrap();
        }

        // Run the fold's blocking body directly (no subprocess will run — the
        // cache hits). A Weak mirrors the real spawn path's leak-safety.
        let weak = Arc::downgrade(&cell);
        tokio::task::spawn_blocking(move || super::declared_fold_blocking(&weak))
            .await
            .unwrap();

        // The cached declared edge folded in: edge count grew, declared tier is
        // now AVAILABLE (status None) — only reachable via the cache here.
        assert!(
            cell.graph_arc().edge_count() > structural_edges,
            "the cached declared edge folded into the live graph"
        );
        assert_eq!(
            *cell.declared_status.read().unwrap(),
            None,
            "declared tier flips to available from the cache (no subprocess ran)"
        );
    }

    /// Seed the declared-graph cache for a given HEAD sha with a JSON payload
    /// declaring one edge from `src` to `dst`, so the fold at that HEAD hits the
    /// cache (no subprocess) and folds that specific edge.
    fn seed_declared_cache(
        cell: &ScopeCell,
        root: &std::path::Path,
        head_sha: &str,
        src: &str,
        dst: &str,
    ) {
        let json = serde_json::json!({
            "nodes": [
                {"id": src, "doc_type": "plan"},
                {"id": dst, "doc_type": "adr"}
            ],
            "edges": [ {"source": src, "target": dst, "kind": "related"} ]
        })
        .to_string();
        let key = declared_cache_key(&crate::routes::scope_token(root), head_sha);
        let store = cell.store.lock().unwrap();
        store
            .put_artifact(DECLARED_GRAPH_KIND, &key, &json, crate::app::now_ms())
            .unwrap();
    }

    #[tokio::test]
    async fn a_rebuild_that_races_an_in_flight_fold_is_not_lost_trailing_edge() {
        // Review HIGH (perf ADR D1 trailing-edge race): F1 claims the fold slot
        // and begins folding at HEAD-A; a rebuild lands structural@HEAD-B and
        // finds the slot busy, so it cannot spawn its own fold. Without the
        // trailing-edge close, F1 finishes, clears the slot, and NO fold ever
        // runs at HEAD-B — the declared tier serves HEAD-A's edges over HEAD-B's
        // structural graph forever (B was the last change). This test forces
        // exactly that interleaving and asserts a fold DOES eventually run at
        // HEAD-B: the cell ends clean (slot free, no pending) with HEAD-B's
        // declared edge folded in.
        use std::sync::atomic::Ordering;

        let dir = tempfile::tempdir().unwrap();
        let (root, cell) = structural_cell(dir.path());
        let structural_edges = cell.graph_arc().edge_count();

        // HEAD-A and its cached declared JSON (edge into `...-a-adr`).
        let head_a = engine_graph::asof::resolve_ref(&root, "HEAD").unwrap();
        seed_declared_cache(
            &cell,
            &root,
            &head_a,
            "2026-06-14-reg-plan",
            "2026-06-14-a-adr",
        );

        // Simulate F1 in flight: claim the slot WITHOUT running the body yet.
        assert!(
            cell.declared_fold_active
                .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
                .is_ok(),
            "the test claims the slot to stand in for an in-flight fold F1"
        );

        // The racing rebuild advances HEAD to B and re-commits structural at B,
        // then tries to spawn a fold — the slot is busy, so it must record the
        // trailing edge (pending) rather than drop the request.
        std::fs::write(
            root.join(".vault/plan/2026-06-14-reg-plan.md"),
            "---\ntags:\n  - '#plan'\n  - '#reg'\n---\n\nMentions `src/b.rs`.\n",
        )
        .unwrap();
        git(&root, &["add", "."]);
        git(&root, &["commit", "-m", "head-b"]);
        let head_b = engine_graph::asof::resolve_ref(&root, "HEAD").unwrap();
        assert_ne!(head_a, head_b, "HEAD actually advanced to B");
        seed_declared_cache(
            &cell,
            &root,
            &head_b,
            "2026-06-14-reg-plan",
            "2026-06-14-b-adr",
        );
        // Re-commit the structural graph at HEAD-B (what the watcher's
        // rebuild_and_swap does), so the cell's CURRENT graph is HEAD-B's.
        {
            let (structural_b, _) = {
                let store = cell.store.lock().unwrap();
                engine_graph::index::index_worktree_structural(
                    &cell.root,
                    &cell.scope,
                    &store,
                    crate::app::now_ms(),
                )
                .unwrap()
            };
            cell.commit_graph(structural_b);
        }

        spawn_declared_fold(&cell);
        assert!(
            cell.declared_fold_pending.load(Ordering::Acquire),
            "a rebuild racing an in-flight fold records the trailing edge"
        );

        // F1 completes: run its blocking body (it owns the slot we claimed). Its
        // guard releases the slot, sees `pending`, and re-spawns a fold — which,
        // running at the CURRENT HEAD-B, hits HEAD-B's cache and folds B's edge.
        let weak = Arc::downgrade(&cell);
        tokio::task::spawn_blocking(move || super::declared_fold_blocking(&weak))
            .await
            .unwrap();

        // Let the re-spawned fold (and any further re-spawn) settle.
        for _ in 0..100 {
            if !cell.declared_fold_active.load(Ordering::Acquire)
                && !cell.declared_fold_pending.load(Ordering::Acquire)
            {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        }

        // The trailing edge is closed: the cell ends clean and the declared tier
        // is AVAILABLE over HEAD-B's structural graph with HEAD-B's declared edge
        // present (the `...-b-adr` phantom node only exists if B's fold ran).
        assert!(
            !cell.declared_fold_active.load(Ordering::Acquire),
            "the fold slot is released after the chain settles"
        );
        assert!(
            !cell.declared_fold_pending.load(Ordering::Acquire),
            "no trailing edge is left owed once the chain settles"
        );
        assert_eq!(
            *cell.declared_status.read().unwrap(),
            None,
            "declared tier is available after the trailing fold"
        );
        assert!(
            cell.graph_arc().edge_count() > structural_edges,
            "a declared edge is folded into the live graph"
        );
        // Declared edges reference document nodes by id but do not mint them, so
        // assert on the EDGE to HEAD-B's target (`doc:2026-06-14-b-adr`), which
        // exists ONLY if a fold ran at HEAD-B (HEAD-A's cache targets `a-adr`).
        let b_dst = engine_model::node_id(&engine_model::CanonicalKey::Document {
            stem: "2026-06-14-b-adr",
        });
        let graph = cell.graph_arc();
        assert!(
            graph.edges().any(|s| s.edge.dst == b_dst),
            "HEAD-B's declared edge folded in — the trailing fold ran at the \
             CURRENT HEAD, not the superseded HEAD-A"
        );
        let a_dst = engine_model::node_id(&engine_model::CanonicalKey::Document {
            stem: "2026-06-14-a-adr",
        });
        assert!(
            !graph.edges().any(|s| s.edge.dst == a_dst),
            "no superseded HEAD-A declared edge survives once the fold runs at \
             HEAD-B (the fold clones the CURRENT structural graph, not A's)"
        );
    }

    #[test]
    fn declared_cache_key_is_deterministic_and_separates_scope_and_sha() {
        // The cache key is a pure function of (scope token, HEAD sha): stable for
        // the same inputs, distinct when either changes — so a rebuild at the
        // same HEAD hits, and two scopes (or two commits) never alias.
        let k = declared_cache_key("/ws/main", "abc123");
        assert_eq!(k, declared_cache_key("/ws/main", "abc123"), "stable");
        assert_ne!(
            k,
            declared_cache_key("/ws/feature", "abc123"),
            "different scope, different key"
        );
        assert_ne!(
            k,
            declared_cache_key("/ws/main", "def456"),
            "different HEAD sha, different key"
        );
    }
}
